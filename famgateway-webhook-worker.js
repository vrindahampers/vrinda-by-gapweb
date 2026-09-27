/**
 * vrindahampers — FamGateway webhook receiver (FREE hosting, no Firebase Blaze)
 * ============================================================================
 * FamGateway POSTs a signed JSON payload the moment a payment succeeds. This
 * worker verifies the HMAC-SHA256 signature (header X-FamGateway-Signature, keyed
 * with your default API key) and records the capture in the Realtime Database:
 *
 *   PATCH https://<project>-default-rtdb.firebaseio.com/paymentSessions/<orderId>.json
 *         { status: "paid", webhookCaptured: true, utr, transactionId, ... }
 *
 * The customer's return page cannot call FamGateway's verify endpoint (no CORS),
 * but it CAN read that node — so it waits for the row and creates the order as
 * VERIFIED automatically. That is the whole trick: the gateway tells US, the
 * browser watches Firebase.
 *
 * SETUP (about 5 minutes, free tier, no credit card)
 *   1. Cloudflare dashboard -> Workers & Pages -> Create Worker
 *      (or: npx wrangler deploy with wrangler.toml pointing at this file)
 *   2. Paste this file into the worker editor and Deploy.
 *   3. Worker -> Settings -> Variables and Secrets -> add BOTH as secrets:
 *        FAMGATEWAY_API_KEY = fam_...          (same key as js/famgateway.js)
 *        RTDB_AUTH_TOKEN    = RTDB database secret
 *                             (Firebase console -> Project settings -> Service
 *                              accounts -> Database secrets -> Show)
 *   4. Copy the worker URL, e.g. https://famgateway-webhook.<you>.workers.dev
 *   5. FamGateway -> Webhook Endpoints -> Add New Webhook Endpoint:
 *        Endpoint Name:  vrindahampers store
 *        Destination URL: your worker URL
 *   6. Make a test payment: the Delivery Logs table shows 2xx and the order is
 *      created as verified with no admin action.
 *
 * SECURITY
 *   - The signature is verified before anything is written, so only FamGateway
 *     (the API key holder) can mark a payment paid.
 *   - The RTDB token is a Worker secret, never in this file and never in the repo.
 *   - Writes patch an EXISTING session key only; an unknown order id is ignored,
 *     so a replayed or forged payload cannot invent orders.
 */

/** The one webhook URL registered in FamGateway. */
const DB_BASE = 'https://vrindahampers-db-default-rtdb.firebaseio.com';

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }
  });
}

/** Hex or base64 signature -> normalised lowercase hex. */
function normaliseSignature(value) {
  const v = String(value || '').trim();
  if (/^[0-9a-f]+$/i.test(v)) return v.toLowerCase();
  try {
    const bytes = atob(v);
    return [...bytes].map((b) => b.charCodeAt(0).toString(16).padStart(2, '0')).join('');
  } catch (e) {
    return v.toLowerCase();
  }
}

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** FamGateway uses a few spellings for the same field; accept them all. */
function pick(payload, names) {
  for (const name of names) {
    if (payload[name] !== undefined && payload[name] !== null && payload[name] !== '') {
      return payload[name];
    }
  }
  return '';
}

export default {
  async fetch(request, env) {
    const strict = env.STRICT_SIGNATURE !== 'false' && env.STRICT_SIGNATURE !== false;

    if (request.method === 'GET') {
      // Handy for checking the worker is alive and fully configured.
      return json({
        ok: true,
        service: 'famgateway-webhook',
        configured: !!(env.RTDB_AUTH_TOKEN && env.FAMGATEWAY_API_KEY),
        hasRtdbToken: !!env.RTDB_AUTH_TOKEN,
        hasApiKey: !!env.FAMGATEWAY_API_KEY,
        strictSignature: strict
      });
    }

    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    // ---- 0. fail closed when a secret is missing ---------------------------
    // Never accept a payment notification while we cannot verify it or cannot
    // write the result. 503 makes FamGateway retry once the secret is added.
    const missing = [];
    if (!env.RTDB_AUTH_TOKEN) missing.push('RTDB_AUTH_TOKEN');
    if (!env.FAMGATEWAY_API_KEY) missing.push('FAMGATEWAY_API_KEY');
    if (missing.length) {
      console.error('worker not configured; missing ' + missing.join(', '));
      return json({ error: 'Worker not configured', missing: missing }, 503);
    }

    const raw = await request.text();

    // ---- 1. verify the signature -------------------------------------------
    // FamGateway signs with HMAC-SHA256 keyed by the default API key and sends the
    // result in X-FamGateway-Signature (hex or base64). Set STRICT_SIGNATURE=false
    // only as a temporary diagnostic if your gateway posts without the header.
    const provided = normaliseSignature(request.headers.get('x-famgateway-signature') ||
      request.headers.get('x-signature'));

    if (strict) {
      if (!provided) {
        return json({ error: 'Missing X-FamGateway-Signature header' }, 401);
      }
      const expected = await hmacHex(env.FAMGATEWAY_API_KEY, raw);
      if (provided !== expected) return json({ error: 'Invalid signature' }, 401);
    } else if (!provided) {
      console.warn('webhook received without a signature header (STRICT_SIGNATURE is off)');
    }

    // ---- 2. normalise the payload ------------------------------------------
    let payload = {};
    try { payload = JSON.parse(raw || '{}'); } catch (e) { payload = {}; }
    const data = (payload.data && typeof payload.data === 'object') ? payload.data : payload;

    const orderId = String(pick(data, ['order_id', 'orderId', 'id', 'gateway_order_id']));
    if (!orderId) return json({ error: 'No order id in payload' }, 400);

    // A test ping ("is_test": true) must never mark a real payment paid.
    if (data.is_test === true || data.is_test === 'true' || /^TEST-/i.test(orderId)) {
      return json({ ignored: true, reason: 'Test event', orderId: orderId }, 200);
    }

    const event = String(pick(data, ['event', 'type']) || '');
    const status = String(pick(data, ['status', 'payment_status', 'state']) || '').toLowerCase();
    const paid = ['success', 'paid', 'captured', 'completed'].includes(status) &&
      (event === '' || /success|paid|captured|completed/.test(event.toLowerCase()));

    // ---- 3. only ever patch an EXISTING session ----------------------------
    // Checkout writes the session with status "created" before redirecting.
    // Refusing to invent one means a replayed/forged payload cannot create an order.
    const url = DB_BASE + '/paymentSessions/' + encodeURIComponent(orderId) +
      '.json?auth=' + encodeURIComponent(env.RTDB_AUTH_TOKEN || '');

    const existing = await fetch(url).then((r) => r.json().catch(() => null)).catch(() => null);
    if (!existing || existing.userId === undefined) {
      return json({ ignored: true, reason: 'Unknown session ' + orderId }, 200);
    }

    const patch = {
      status: paid ? 'paid' : (status || 'updated'),
      utr: String(pick(data, ['utr', 'utr_number', 'bank_rrn']) || existing.utr || ''),
      transactionId: String(pick(data, ['transaction_id', 'txn_id', 'fam_pay_txn_id']) || existing.transactionId || ''),
      senderName: String(pick(data, ['sender_name', 'payer_name']) || existing.senderName || ''),
      payableAmount: Number(pick(data, ['payable_amount', 'amount']) || existing.payableAmount || 0),
      webhookCaptured: paid,
      webhookAt: Date.now(),
      updatedAt: Date.now()
    };

    const writeRes = await fetch(url, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch)
    });
    if (!writeRes.ok) return json({ error: 'RTDB write failed', status: writeRes.status }, 502);

    // FamGateway retries non-2xx, so always answer 2xx once we have decided.
    return json({ ok: true, orderId: orderId, paid: paid });
  }
};

