/**
 * vrindahampers - FamGateway Payment Adapter (Phase 4)
 * ============================================================================
 * WHAT IS REAL vs WHAT NEEDS YOUR CREDENTIALS
 * ----------------------------------------------------------------------------
 * REAL / WORKING TODAY (no credentials needed):
 *   - payment session bookkeeping in RTDB (/paymentSessions/{fgOrderId})
 *   - hosted checkout redirect + return handling (?order_id=...&status=...)
 *   - live status polling against GET https://famgateway.in/api/checkout-status.php
 *     (FamGateway documents this endpoint as public-safe: "zero API key leak")
 *   - the full order-creation hand-off to js/order-service.js
 *
 * GOING LIVE (owner's decision — the key stays in this file):
 *   1. Paste your FamGateway merchant API key into
 *      VRINDA_FAMGATEWAY_CONFIG.apiKey below. That single value flips the
 *      adapter out of SIMULATION MODE — nothing else needs deploying.
 *   2. While unconfigured, the adapter mints a local `fg_SIM_*` session and
 *      routes straight to pages/payment-return.html so the whole
 *      Checkout -> Payment -> Order -> Admin notification flow stays testable.
 *
 * OPTIONAL HARDENING: deploy the Cloud Functions in /functions and fill the
 * two proxy URLs — create/verify then run on your server and the key in this
 * file is no longer sent from the browser. Not required; FAMGATEWAY_SETUP.md.
 *
 * HONEST RISK NOTE: everything in this file is readable by anyone who views
 * the page source, so the API key below is public too. That is the accepted
 * trade-off of keeping the key here instead of on a server (FamGateway's docs
 * recommend the server route). Rotate the key in the FamGateway dashboard if
 * you ever stop wanting it public.
 * ============================================================================
 */

(function () {
  'use strict';

  /**
   * TODO(you): fill these in with your real FamGateway + Firebase values.
   * Any value left as a placeholder keeps the adapter in simulation mode.
   */
  window.VRINDA_FAMGATEWAY_CONFIG = {
    mode: 'live',                                // 'test' | 'live' (label stored on the order)

    /* --- FamGateway public endpoints (already correct, no change needed) --- */
    baseUrl: 'https://famgateway.in',
    createOrderPath: '/api/create-order',
    statusPath: '/api/checkout-status.php',
    verifyPath: '/api/verify-order.php',
    checkoutPath: '/pay.php',
    qrImagePath: '/api/qr-image.php',
    receiptPath: '/transaction-details.php',

    /* --- FamGateway merchant API key — kept in THIS file on purpose (your
       call): paste it here and payments go live with nothing else to deploy.
       It is visible in page source; see the risk note in the header. --- */
    apiKey: 'fam_ea93a78892a4fe519445d40a71d24f80e1f792cb',
    merchantUpiId: 'ishikavh@fam',                           // your FamPay UPI id, e.g. yourname@fam
    merchantName: 'vrindahampers',

    /* --- OPTIONAL Cloud Function proxies (/functions) — REQUIRED for payment
       VERIFICATION. FamGateway's verify-order.php sends no CORS headers, so a
       browser can create a payment but never confirm one (measured: preflight 401,
       no access-control-allow-origin). Deploy them with:

         firebase functions:secrets:set FAMGATEWAY_API_KEY=fam_ea93a78892a4fe519445d40a71d24f80e1f792cb
         firebase deploy --only database,functions

       then fill the two URLs below (deterministic for this project):

         https://us-central1-vrindahampers-db.cloudfunctions.net/createFamGatewayOrder
         https://us-central1-vrindahampers-db.cloudfunctions.net/verifyFamGatewayOrder
         https://us-central1-vrindahampers-db.cloudfunctions.net/famgatewayWebhook  (optional)

       > **⚠️ Cloud Functions require the Blaze plan.** On the free (Spark) plan,
       > `firebase deploy --only functions` fails with "Your project must be on the
       > Blaze (pay-as-you-go) plan" — the secret manager, Cloud Functions, Cloud
       > Build and Artifact Registry APIs all require it. The **database rules
       > deploy fine on Spark** (`firebase deploy --only database`).
       >
       > Options:
       >   1. Upgrade to Blaze (needs a billing card; a small store stays well
       >      inside the free tier) and run the two commands above — the only way to
       >      get automatic verification.
       >   2. Ask FamGateway to send CORS headers on /api/verify-order.php and
       >      /api/checkout-status.php (they already do on /api/create-order), and
       >      the browser can verify directly with no function at all.
       >   3. Stay on Spark and reconcile manually: real payments still work, each
       >      order is created with payment.verified:false plus a red "⚠️ Payment
       >      unverified" badge and its UTR, and "✓ Mark Paid" records the match
       >      against your FamPay dashboard. One click per order, nothing lost.
       >
       Until then, captured payments are still booked - flagged "Payment
       unverified" in the admin portal for manual confirmation from FamPay. --- */
    proxyCreateOrderUrl: '',
    proxyVerifyOrderUrl: '',
    webhookUrl: '',

    /* --- Timing / behaviour --- */
    pollIntervalMs: 4000,
    sessionWindowMs: 5 * 60 * 1000,              // FamGateway dynamic QR sessions expire in 5 minutes
    returnPagePath: 'pages/payment-return.html'
  };

  const cfg = window.VRINDA_FAMGATEWAY_CONFIG;

  // Captured while this very script is executing: ".../js/famgateway.js" tells us
  // the site root no matter which page loaded us (checkout lives in /pages/, the
  // custom studio in /custom/, the homepage at the root).
  const SCRIPT_URL = (typeof document !== 'undefined' && document.currentScript && document.currentScript.src) || '';

  function isPlaceholder(value) {
    if (!value) return true;
    return /YOUR_|xxxx|<region>|<project>|TODO/i.test(String(value));
  }

  const Gateway = {
    config: cfg
  };

  /* --------------------------------------------------------- config state */

  /** True when both Cloud Function proxy URLs are filled (preferred route). */
  Gateway.usesProxy = function () {
    return !isPlaceholder(cfg.proxyCreateOrderUrl) && !isPlaceholder(cfg.proxyVerifyOrderUrl);
  };

  /** True when the merchant key sits in this file (direct browser mode). */
  Gateway.hasApiKey = function () {
    return !isPlaceholder(cfg.apiKey);
  };

  /** Live as soon as EITHER the proxy URLs OR the key in this file exist. */
  Gateway.isConfigured = function () {
    return this.usesProxy() || this.hasApiKey();
  };

  Gateway.isSimulationMode = function () {
    return !this.isConfigured();
  };

  /** Used by the checkout page to render the honest "what's live" banner. */
  Gateway.describeConfig = function () {
    return {
      simulationMode: this.isSimulationMode(),
      proxyCreateOrder: !isPlaceholder(cfg.proxyCreateOrderUrl),
      proxyVerifyOrder: !isPlaceholder(cfg.proxyVerifyOrderUrl),
      webhook: !isPlaceholder(cfg.webhookUrl),
      apiKeyPresent: !isPlaceholder(cfg.apiKey),
      merchantUpiIdPresent: !isPlaceholder(cfg.merchantUpiId),
      directModeEnabled: !this.usesProxy() && this.hasApiKey()
    };
  };

  Gateway.missingConfig = function () {
    const missing = [];
    if (this.isSimulationMode()) {
      missing.push('apiKey — paste your FamGateway merchant key into VRINDA_FAMGATEWAY_CONFIG.apiKey in js/famgateway.js');
    } else if (isPlaceholder(cfg.webhookUrl)) {
      missing.push('webhookUrl — optional: deploy /functions for instant capture (status polling works without it)');
    }
    return missing;
  };

  /* -------------------------------------------------------------- helpers */

  Gateway.formatAmount = function (amount) {
    return (Math.round((Number(amount) + Number.EPSILON) * 100) / 100).toFixed(2);
  };

  Gateway.checkoutUrl = function (famgatewayOrderId) {
    return cfg.baseUrl + cfg.checkoutPath + '?order_id=' + encodeURIComponent(famgatewayOrderId);
  };

  Gateway.qrImageUrl = function (famgatewayOrderId) {
    return cfg.baseUrl + cfg.qrImagePath + '?order_id=' + encodeURIComponent(famgatewayOrderId);
  };

  Gateway.receiptUrl = function (famgatewayOrderId) {
    return cfg.baseUrl + cfg.receiptPath + '?id=' + encodeURIComponent(famgatewayOrderId);
  };

  /**
   * The SITE ROOT with a trailing slash — NOT the current page's directory.
   * cfg.returnPagePath ("pages/payment-return.html") is root-relative and the
   * checkout page itself lives in /pages/, so using the page directory produced
   * https://host/pages/pages/payment-return.html and every paid customer landed
   * on "Cannot GET /pages/pages/payment-return.html".
   */
  Gateway.appBaseUrl = function () {
    if (Gateway._rootBase) return Gateway._rootBase;

    // Preferred: derive the root from this script's own URL.
    const fromScript = SCRIPT_URL.replace(/\/js\/famgateway\.js(?:[?#].*)?$/, '/');
    if (fromScript !== SCRIPT_URL && /^https?:/i.test(fromScript)) {
      Gateway._rootBase = fromScript;
      return fromScript;
    }

    // Fallback (bundled/inlined build): walk up out of known section folders.
    const path = window.location.pathname || '/';
    const dir = path.substring(0, path.lastIndexOf('/') + 1) || '/';
    const match = dir.match(/^((?:\/[^/]+)*)\/(?:pages|product|category|custom|admin)\/$/);
    Gateway._rootBase = window.location.origin + (match ? match[1] + '/' : dir);
    return Gateway._rootBase;
  };

  Gateway.redirectUrl = function (extraParams) {
    const base = this.appBaseUrl() + cfg.returnPagePath;
    if (!extraParams) return base;
    const query = Object.keys(extraParams)
      .filter((k) => extraParams[k])
      .map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(extraParams[k]))
      .join('&');
    return query ? base + '?' + query : base;
  };

  Gateway.idToken = async function () {
    const user = window.VrindaAuth && window.VrindaAuth.currentUser;
    if (!user) return '';
    try { return await user.getIdToken(); } catch (e) { return ''; }
  };

  /* ------------------------------------------- STEP 1: create payment session */

  /**
   * Creates a FamGateway order (dynamic UPI session) for the given amount.
   * @param {object} args {amount, orderDraftId, customer:{name,email,phone}}
   * @returns {Promise<object>} normalised session: {success, simulated, orderId, checkoutUrl, ...}
   */
  Gateway.createPaymentSession = async function (args) {
    const amount = Number(args.amount) || 0;
    if (amount <= 0) return { success: false, error: 'Invalid payable amount.' };

    const customer = args.customer || {};
    const payload = {
      amount: Number(this.formatAmount(amount)),
      customer_name: customer.name || '',
      customer_email: customer.email || '',
      customer_phone: String(customer.phone || '').replace(/\D/g, '').slice(-10),
      redirect_url: this.redirectUrl({ draft_id: args.orderDraftId || '' }),
      order_draft_id: args.orderDraftId || ''
    };
    if (!isPlaceholder(cfg.webhookUrl)) payload.webhook_url = cfg.webhookUrl;

    if (this.usesProxy()) {
      return this._createViaProxy(payload);
    }
    if (this.hasApiKey()) {
      return this._createDirect(payload);
    }
    return this._createSimulated(amount);
  };

  /**
   * PROXY PATH (optional) — calls your Cloud Function, which holds the key and
   * talks to https://famgateway.in/api/create-order on your behalf. Active as
   * soon as proxyCreateOrderUrl + proxyVerifyOrderUrl are both filled in
   * VRINDA_FAMGATEWAY_CONFIG (see FAMGATEWAY_SETUP.md).
   */
  Gateway._createViaProxy = async function (payload) {
    try {
      const token = await this.idToken();
      const response = await fetch(cfg.proxyCreateOrderUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: 'Bearer ' + token } : {})
        },
        body: JSON.stringify(payload)
      });

      const json = await response.json().catch(() => ({}));
      if (!response.ok || json.status === 'error') {
        return { success: false, error: json.message || ('FamGateway order creation failed (HTTP ' + response.status + ').') };
      }
      return this._normaliseCreateResponse(json, false);
    } catch (err) {
      return {
        success: false,
        error: 'Could not reach the FamGateway payment service. ' + err.message,
        hint: 'Check VRINDA_FAMGATEWAY_CONFIG.proxyCreateOrderUrl and the Cloud Function logs.'
      };
    }
  };

  /**
   * DIRECT MODE (your chosen setup) — browser call to POST /api/create-order
   * with the key from VRINDA_FAMGATEWAY_CONFIG.apiKey. Used whenever the proxy
   * URLs are blank. Anyone reading page source can see the key.
   */
  Gateway._createDirect = async function (payload) {
    try {
      const response = await fetch(cfg.baseUrl + cfg.createOrderPath, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': cfg.apiKey
        },
        body: JSON.stringify(Object.assign({}, payload, { api_key: cfg.apiKey }))
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json.status === 'error') {
        return { success: false, error: json.message || 'FamGateway rejected the order request.' };
      }
      return this._normaliseCreateResponse(json, false);
    } catch (err) {
      return { success: false, error: 'FamGateway request failed: ' + err.message };
    }
  };

  /** SIMULATION — full UI flow rehearsal without any credentials. */
  Gateway._createSimulated = async function (amount) {
    const orderId = 'fg_SIM_' + Date.now().toString(36).toUpperCase() +
      Math.floor(Math.random() * 900 + 100);
    const returnUrl = this.redirectUrl() +
      '?simulated=1&order_id=' + encodeURIComponent(orderId) +
      '&status=success&amount=' + encodeURIComponent(this.formatAmount(amount));

    return {
      success: true,
      simulated: true,
      orderId: orderId,
      checkoutUrl: returnUrl,
      qrUrl: '',
      upiIntent: '',
      upiId: '',
      amount: Number(this.formatAmount(amount)),
      payableAmount: Number(this.formatAmount(amount)),
      expiresAt: Date.now() + cfg.sessionWindowMs,
      message: 'Simulation mode: no real FamGateway credentials configured, so payment is auto-verified.'
    };
  };

  /** FamGateway returns {status:'success', data:{...}} — this flattens it. */
  Gateway._normaliseCreateResponse = function (json, simulated) {
    const d = json.data || json;
    const orderId = d.order_id || d.orderId || '';
    if (!orderId) {
      return { success: false, error: 'FamGateway did not return an order id.' };
    }
    return {
      success: true,
      simulated: !!simulated,
      orderId: orderId,
      checkoutUrl: d.checkout_url || this.checkoutUrl(orderId),
      qrUrl: d.qr_url || this.qrImageUrl(orderId),
      upiIntent: d.upi_intent || '',
      upiId: d.upi_id || cfg.merchantUpiId || '',
      amount: Number(d.amount || 0),
      payableAmount: Number(d.payable_amount || d.amount || 0),
      expiresAt: d.expires_at_ist || '',
      createdAt: d.created_at_ist || '',
      message: 'Payment session created.'
    };
  };

  /** STEP 2: hand the customer over to FamGateway's hosted checkout page. */
  Gateway.redirectToCheckout = function (checkoutUrl) {
    if (!checkoutUrl) return { success: false, error: 'No FamGateway checkout URL was returned.' };
    window.location.assign(checkoutUrl);
    return { success: true };
  };

  /* ------------------------------------------------- STEP 3: live status poll */

  /**
   * Polls the documented public-safe status endpoint. No API key required, which
   * is exactly why FamGateway exposes it to browsers. Returns a handle with stop().
   */
  Gateway.pollStatus = function (famgatewayOrderId, onUpdate, options) {
    const opts = options || {};
    const interval = opts.intervalMs || cfg.pollIntervalMs;
    const deadline = Date.now() + (opts.windowMs || cfg.sessionWindowMs);
    let timer = null;
    let stopped = false;

    const handle = {
      stop: function () {
        stopped = true;
        if (timer) clearTimeout(timer);
      }
    };

    if (!famgatewayOrderId || famgatewayOrderId.indexOf('fg_SIM_') === 0) {
      // Simulation sessions never exist upstream; report success once and stop.
      setTimeout(() => onUpdate({ status: 'success', simulated: true, pending: false }), 600);
      return handle;
    }

    async function tick() {
      if (stopped) return;
      if (Date.now() > deadline) {
        onUpdate({ status: 'expired', pending: false, message: 'The 5-minute FamGateway session window elapsed.' });
        return;
      }

      try {
        const url = cfg.baseUrl + cfg.statusPath + '?order_id=' + encodeURIComponent(famgatewayOrderId) + '&_=' + Date.now();
        const response = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
        const json = await response.json().catch(() => ({}));
        const flat = json.data || json;
        const status = String(flat.status || flat.payment_status || 'pending').toLowerCase();

        onUpdate({
          status: status,
          pending: !(status === 'success' || status === 'failed' || status === 'expired'),
          raw: flat
        });

        if (status === 'success' || status === 'failed') return;
      } catch (err) {
        onUpdate({ status: 'pending', pending: true, error: err.message });
      }

      if (!stopped) timer = setTimeout(tick, interval);
    }

    timer = setTimeout(tick, opts.initialDelayMs || 1500);
    return handle;
  };

  /* --------------------------------------- STEP 4: authoritative verification */

  /**
   * Authoritative verification (FamGateway: GET /api/verify-order.php returns
   * the customer UTR and is the source of truth). Uses the Cloud Function
   * proxy when configured, otherwise calls FamGateway directly with the key
   * from this file. fg_SIM_* ids short-circuit without any network call.
   */
  Gateway.verifyOrder = async function (famgatewayOrderId) {
    const orderId = famgatewayOrderId;

    if (!orderId) {
      return { success: false, verified: false, status: 'missing', error: 'No FamGateway order id supplied.' };
    }

    if (String(orderId).indexOf('fg_SIM_') === 0 || this.isSimulationMode()) {
      return {
        success: true,
        verified: true,
        simulated: true,
        mode: 'simulation',
        status: 'success',
        orderId: orderId,
        transactionId: 'SIMTXN' + Date.now().toString().slice(-8),
        utr: 'SIMUTR' + Date.now().toString().slice(-8),
        senderName: 'Simulated Payer',
        payableAmount: null,
        paymentTime: new Date().toLocaleString('en-IN'),
        verifiedAt: Date.now(),
        note: 'SIMULATION MODE — no FamGateway credentials configured, so no live verification was performed.'
      };
    }

    try {
      let json;
      if (this.usesProxy()) {
        const token = await this.idToken();
        const response = await fetch(cfg.proxyVerifyOrderUrl + '?order_id=' + encodeURIComponent(orderId), {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            ...(token ? { Authorization: 'Bearer ' + token } : {})
          }
        });
        json = await response.json().catch(() => ({}));
        if (!response.ok) {
          return { success: false, verified: false, status: 'error', error: json.message || ('Verification failed (HTTP ' + response.status + ').') };
        }
      } else {
        // DIRECT MODE — key from this file (your chosen setup).
        const response = await fetch(cfg.baseUrl + cfg.verifyPath + '?order_id=' + encodeURIComponent(orderId), {
          method: 'GET',
          headers: { Accept: 'application/json', 'X-Api-Key': cfg.apiKey }
        });
        json = await response.json().catch(() => ({}));
      }

      const flat = json.data || json;
      const status = String(flat.status || flat.payment_status || 'pending').toLowerCase();

      return {
        success: true,
        verified: status === 'success',
        simulated: false,
        mode: cfg.mode,
        status: status,
        orderId: flat.order_id || orderId,
        transactionId: flat.transaction_id || '',
        utr: flat.utr || '',
        senderName: flat.sender_name || '',
        payableAmount: flat.payable_amount ? Number(flat.payable_amount) : (flat.amount ? Number(flat.amount) : null),
        paymentTime: flat.payment_time || '',
        verifiedAt: Date.now()
      };
    } catch (err) {
      // unreachable: true is the important part. A blocked/failed request means
      // "we could not ask", NOT "the customer did not pay". FamGateway's
      // verify-order.php sends no CORS headers, so this is the NORMAL outcome in
      // direct mode and must never be treated as a failed payment.
      return { success: false, verified: false, unreachable: true, status: 'network_error', error: err.message || 'Could not reach FamGateway from the browser.' };
    }
  };

  /**
   * One single read of the public checkout-status endpoint (no API key). It is the
   * only gateway endpoint that can confirm a capture without the Cloud Function
   * proxy — but FamGateway does not send CORS headers for it either, so callers
   * must treat a failure as "unknown", never as "not paid".
   * @returns {Promise<{status: string, utr?: string, transaction_id?: string, sender_name?: string}|null>}
   */
  Gateway.pollStatusOnce = async function (famgatewayOrderId) {
    if (!famgatewayOrderId) return null;
    try {
      const url = (cfg.statusPath.indexOf('http') === 0 ? cfg.statusPath : cfg.baseUrl + cfg.statusPath) +
        '?order_id=' + encodeURIComponent(famgatewayOrderId);
      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) return null;
      const json = await response.json().catch(() => null);
      if (!json) return null;
      return json.data || json;
    } catch (err) {
      // CORS/network: we simply cannot know from the browser.
      return null;
    }
  };

  /* --------------------------------------------- STEP 5: read the return URL */

  /**
   * Parses whatever FamGateway appended (or that simulation mode added) on the
   * way back from checkout. Only /api/verify-order.php is authoritative, so the
   * query string here is treated purely as a hint.
   */
  /**
   * Where the in-flight payment session is stashed on the customer's own device.
   * FamGateway's hosted pay.php redirects back to the bare redirect_url we gave it
   * (no order_id in the query), so without this the return page had no reference,
   * bailed out, and a captured payment never became an order.
   */
  const PENDING_KEY = 'vrinda:pending-payment';

  Gateway.stashPendingSession = function (session, draftId, userId) {
    if (!session || !session.orderId) return false;
    try {
      localStorage.setItem(PENDING_KEY, JSON.stringify({
        orderId: session.orderId,
        draftId: draftId || '',
        userId: userId || '',
        amount: session.amount || 0,
        payableAmount: session.payableAmount || session.amount || 0,
        createdAt: Date.now()
      }));
      return true;
    } catch (err) {
      console.warn('Pending payment stash skipped:', err.message);
      return false;
    }
  };

  Gateway.clearPendingSession = function (orderId) {
    try {
      const raw = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null');
      if (!raw || !orderId || raw.orderId === orderId) localStorage.removeItem(PENDING_KEY);
    } catch (err) { /* ignore */ }
  };

  /**
   * Resolves which FamGateway order this return belongs to, most trustworthy
   * source first:
   *   1. the return link itself
   *   2. the session stashed on this device moments before the redirect
   * Returns {orderId, source} or null. Sessions older than 45 minutes are ignored
   * so a stale tab can never be mistaken for the current payment.
   */
  Gateway.resolveReturnOrder = function (returned) {
    const fromLink = returned && returned.famgatewayOrderId;
    if (fromLink) return { orderId: fromLink, source: 'return-link' };

    let stashed = null;
    try { stashed = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null'); } catch (err) { stashed = null; }
    if (!stashed || !stashed.orderId) return null;

    const age = Date.now() - (stashed.createdAt || 0);
    if (age > 45 * 60 * 1000) return null;

    return { orderId: stashed.orderId, source: 'device-session', amount: stashed.amount };
  };

  Gateway.handleReturn = function (search) {
    const params = new URLSearchParams(search || window.location.search);
    const status = String(params.get('status') || params.get('payment_status') || '').toLowerCase();

    return {
      // FamGateway's hosted page may echo the order back under different names.
      famgatewayOrderId: params.get('order_id') || params.get('fg_order_id') || params.get('order') || params.get('id') || '',
      draftId: params.get('draft_id') || params.get('order_draft_id') || '',
      status: status || 'unknown',
      amount: Number(params.get('amount') || 0),
      utr: params.get('utr') || '',
      transactionId: params.get('transaction_id') || params.get('txn_id') || '',
      simulated: params.get('simulated') === '1' || String(params.get('order_id') || '').indexOf('fg_SIM_') === 0,
      signature: params.get('signature') || params.get('fg_signature') || '',
      raw: Object.fromEntries(params.entries())
    };
  };

  /* ------------------------------------- optional RTDB session bookkeeping */

  /**
   * Mirrors the session into /paymentSessions/{fgOrderId} so a browser refresh on
   * the return page cannot create duplicate orders (idempotency guard).
   * Rules: a customer may create their own session row only.
   */
  Gateway.recordSession = async function (session, userId, draftId) {
    if (typeof firebase === 'undefined' || !firebase.database || !session || !session.orderId) return null;
    try {
      await firebase.database().ref('paymentSessions/' + session.orderId).set({
        famgatewayOrderId: session.orderId,
        userId: userId || '',
        draftId: draftId || '',
        amount: session.amount,
        payableAmount: session.payableAmount,
        simulated: !!session.simulated,
        status: 'created',
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
      });
      return true;
    } catch (err) {
      console.warn('Payment session record skipped:', err.message);
      return false;
    }
  };

  window.VrindaFamGateway = Gateway;
})();
