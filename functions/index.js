/**
 * vrindahampers - Cloud Functions (Phase 7)
 * ============================================================================
 * Secure FamGateway proxies. The merchant API key lives ONLY here, as a
 * Secret Manager value — never in js/famgateway.js (see FAMGATEWAY_SETUP.md).
 *
 *   createFamGatewayOrder  POST  — proxy for https://famgateway.in/api/create-order
 *   verifyFamGatewayOrder  GET   — proxy for https://famgateway.in/api/verify-order.php
 *   famgatewayWebhook      POST  — FamGateway instant-capture callback; re-verifies
 *                                  server-side, then marks /paymentSessions/{orderId}
 *
 * Browser contract (must stay in sync with js/famgateway.js):
 *   - Authorization: Bearer <Firebase ID token> required on create + verify.
 *   - Responses are FamGateway's own JSON passed through:
 *       { status: 'success'|'error', message?, data: {...} }.
 * ============================================================================
 */

'use strict';

const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');

admin.initializeApp();

const FAM_API_KEY = defineSecret('FAMGATEWAY_API_KEY');
const FAM_BASE_URL = 'https://famgateway.in';

/* --------------------------------------------------------------- helpers */

/** Manual CORS so browsers may send Authorization; OPTIONS ends the request. */
function handleCors(req, res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return true;
  }
  return false;
}

/** Verifies the Firebase ID token; responds 401 and returns null on failure. */
async function requireAuth(req, res) {
  const header = String(req.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    res.status(401).json({ status: 'error', message: 'Please sign in before starting a payment.' });
    return null;
  }
  try {
    return await admin.auth().verifyIdToken(token);
  } catch (err) {
    logger.warn('Invalid ID token:', err.message);
    res.status(401).json({ status: 'error', message: 'Your session expired. Please sign in again.' });
    return null;
  }
}

/** Non-2xx upstream responses normalised to the shape the client expects. */
function upstreamError(res, label, response, body) {
  const message =
    (body && (body.message || body.error)) ||
    `${label} failed upstream (HTTP ${response ? response.status : 'network error'}).`;
  logger.error(label + ':', message);
  return res.status(response && response.ok ? 200 : 502).json({ status: 'error', message });
}

/* ------------------------------------------------- createFamGatewayOrder */

exports.createFamGatewayOrder = onRequest({ secrets: [FAM_API_KEY], region: 'us-central1' }, async (req, res) => {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', message: 'Method not allowed.' });

  const decoded = await requireAuth(req, res);
  if (!decoded) return;

  const body = req.body || {};
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000) {
    return res.status(400).json({ status: 'error', message: 'Invalid payable amount.' });
  }

  const payload = {
    amount: Math.round(amount * 100) / 100,
    customer_name: String(body.customer_name || ''),
    customer_email: String(body.customer_email || ''),
    customer_phone: String(body.customer_phone || '').replace(/\D/g, '').slice(-10),
    redirect_url: String(body.redirect_url || ''),
    order_draft_id: String(body.order_draft_id || ''),
    api_key: FAM_API_KEY.value()
  };
  if (body.webhook_url) payload.webhook_url = String(body.webhook_url);

  try {
    const response = await fetch(FAM_BASE_URL + '/api/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': FAM_API_KEY.value() },
      body: JSON.stringify(payload)
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || json.status === 'error') return upstreamError(res, 'create-order', response, json);

    logger.info('FamGateway order created for', decoded.uid, json.data && json.data.order_id);
    return res.status(200).json(json);
  } catch (err) {
    logger.error('create-order network failure:', err.message);
    return res.status(502).json({ status: 'error', message: 'Could not reach FamGateway: ' + err.message });
  }
});

/* ------------------------------------------------- verifyFamGatewayOrder */

exports.verifyFamGatewayOrder = onRequest({ secrets: [FAM_API_KEY], region: 'us-central1' }, async (req, res) => {
  if (handleCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ status: 'error', message: 'Method not allowed.' });

  const decoded = await requireAuth(req, res);
  if (!decoded) return;

  const orderId = String(req.query.order_id || '');
  if (!orderId) return res.status(400).json({ status: 'error', message: 'Missing order_id.' });

  try {
    const url = FAM_BASE_URL + '/api/verify-order.php?order_id=' + encodeURIComponent(orderId);
    const response = await fetch(url, { headers: { 'X-Api-Key': FAM_API_KEY.value() } });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || json.status === 'error') return upstreamError(res, 'verify-order', response, json);
    return res.status(200).json(json);
  } catch (err) {
    logger.error('verify-order network failure:', err.message);
    return res.status(502).json({ status: 'error', message: 'Could not reach FamGateway: ' + err.message });
  }
});

/* ------------------------------------------------------ famgatewayWebhook */

/**
 * FamGateway calls this the moment money moves. The payload is NOT trusted:
 * we re-verify the order against FamGateway's own API with the server-side
 * key, and only then mark the mirrored /paymentSessions row as paid.
 * (The customer-facing return page independently verifies too, so this is a
 * belt-and-braces capture — it never creates duplicate orders.)
 */
exports.famgatewayWebhook = onRequest({ secrets: [FAM_API_KEY], region: 'us-central1' }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', message: 'Method not allowed.' });

  const body = req.body || {};
  const orderId = String(body.order_id || body.orderId || body.id || '');
  if (!orderId) return res.status(400).json({ status: 'error', message: 'Missing order_id.' });

  try {
    const verifyUrl = FAM_BASE_URL + '/api/verify-order.php?order_id=' + encodeURIComponent(orderId);
    const response = await fetch(verifyUrl, { headers: { 'X-Api-Key': FAM_API_KEY.value() } });
    const json = await response.json().catch(() => ({}));
    const flat = json.data || json || {};
    const status = String(flat.status || flat.payment_status || '').toLowerCase();

    if (status === 'success') {
      const snapshot = await admin.database().ref('paymentSessions/' + orderId).once('value');
      if (snapshot.exists()) {
        await admin.database().ref('paymentSessions/' + orderId).update({
          status: 'paid',
          webhookCaptured: true,
          transactionId: String(flat.transaction_id || body.transaction_id || ''),
          utr: String(flat.utr || body.utr || ''),
          paidAt: admin.database.ServerValue.TIMESTAMP,
          updatedAt: admin.database.ServerValue.TIMESTAMP
        });
        logger.info('Webhook captured payment for', orderId);
      }
      return res.status(200).json({ status: 'success' });
    }

    logger.warn('Webhook for', orderId, 're-verified as', status || 'unknown', '- left untouched');
    return res.status(200).json({ status: 'ignored', message: 'Payment not verified as success.' });
  } catch (err) {
    logger.error('webhook failure:', err.message);
    // 200 so FamGateway does not hammer retries on a transient local error;
    // verification still happens independently on the return page.
    return res.status(200).json({ status: 'error', message: err.message });
  }
});

