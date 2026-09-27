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
 * NEEDS YOUR REAL CREDENTIALS / ENDPOINTS (see TODOs in VRINDA_FAMGATEWAY_CONFIG):
 *   1. FamGateway merchant API key (fg_live_...) — secret, server-side only.
 *   2. Deployed Cloud Function URLs from /functions (create-order + verify-order proxies).
 *   3. Public webhook URL for instant payment capture.
 * Until 1-3 are filled in, the adapter runs in SIMULATION MODE: it mints a
 * local `fg_SIM_*` session and routes straight to pages/payment-return.html so the
 * whole Checkout -> Payment -> Order -> Admin notification flow stays testable.
 *
 * SECURITY NOTE (do not skip): FamGateway's own docs state "Never expose your
 * secret API key in client-side JavaScript." POST /api/create-order and
 * GET /api/verify-order.php therefore MUST be called from the Cloud Function
 * proxy, never from a static GitHub Pages bundle. The optional direct-call path
 * below is disabled by default and exists only for a throwaway local sandbox.
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

    /* --- FamGateway merchant API key: NOT kept in client code anymore. ---
       Set it as a Cloud Function secret instead:
       firebase functions:secrets:set FAMGATEWAY_API_KEY   (see FAMGATEWAY_SETUP.md) */
    apiKey: '',                                   // intentionally empty — server-side secret only
    merchantUpiId: 'ishikavh@fam',                           // your FamPay UPI id, e.g. yourname@fam
    merchantName: 'vrindahampers',

    /* --- TODO: deployed Cloud Function proxy URLs (see /functions/index.js) --- */
    proxyCreateOrderUrl: '',                     // TODO: https://<region>-<project>.cloudfunctions.net/famgatewayCreateOrder
    proxyVerifyOrderUrl: '',                     // TODO: https://<region>-<project>.cloudfunctions.net/famgatewayVerifyOrder
    webhookUrl: '',                              // TODO: https://<region>-<project>.cloudfunctions.net/famgatewayWebhook

    /* --- Local sandbox escape hatch (never enable on the live site) --- */
    allowInsecureDirectMode: false,              // TODO: keep false in production

    /* --- Timing / behaviour --- */
    pollIntervalMs: 4000,
    sessionWindowMs: 5 * 60 * 1000,              // FamGateway dynamic QR sessions expire in 5 minutes
    returnPagePath: 'pages/payment-return.html'
  };

  const cfg = window.VRINDA_FAMGATEWAY_CONFIG;

  function isPlaceholder(value) {
    if (!value) return true;
    return /YOUR_|xxxx|<region>|<project>|TODO/i.test(String(value));
  }

  const Gateway = {
    config: cfg
  };

  /* --------------------------------------------------------- config state */

  Gateway.isConfigured = function () {
    return !isPlaceholder(cfg.proxyCreateOrderUrl) && !isPlaceholder(cfg.proxyVerifyOrderUrl);
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
      directModeEnabled: !!cfg.allowInsecureDirectMode
    };
  };

  Gateway.missingConfig = function () {
    const state = this.describeConfig();
    const missing = [];
    if (!state.proxyCreateOrder) missing.push('proxyCreateOrderUrl (Cloud Function createFamGatewayOrder in /functions)');
    if (!state.proxyVerifyOrder) missing.push('proxyVerifyOrderUrl (Cloud Function verifyFamGatewayOrder in /functions)');
    if (!state.webhook) missing.push('webhookUrl (FamGateway -> famgatewayWebhook, for instant capture)');
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

  Gateway.appBaseUrl = function () {
    const path = window.location.pathname;
    const dir = path.substring(0, path.lastIndexOf('/') + 1);
    return window.location.origin + dir;
  };

  Gateway.redirectUrl = function () {
    return this.appBaseUrl() + cfg.returnPagePath;
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
      redirect_url: this.redirectUrl(),
      order_draft_id: args.orderDraftId || ''
    };
    if (!isPlaceholder(cfg.webhookUrl)) payload.webhook_url = cfg.webhookUrl;

    if (this.isConfigured()) {
      return this._createViaProxy(payload);
    }
    if (cfg.allowInsecureDirectMode && !isPlaceholder(cfg.apiKey)) {
      console.warn('FamGateway: INSECURE direct mode is enabled. Never ship this to production.');
      return this._createDirect(payload);
    }
    return this._createSimulated(amount);
  };

  /**
   * PRODUCTION PATH — calls your Cloud Function, which holds the secret API key
   * and talks to https://famgateway.in/api/create-order on your behalf.
   * TODO: deploy /functions (see FAMGATEWAY_SETUP.md) and paste its URL into
   *       VRINDA_FAMGATEWAY_CONFIG.proxyCreateOrderUrl.
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
   * LOCAL SANDBOX ONLY — direct browser call to POST /api/create-order.
   * This leaks your merchant API key to anyone using devtools. TODO: remove.
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
   * Server-to-server verification (FamGateway: GET /api/verify-order.php returns
   * the customer UTR and is the authoritative source of truth).
   * TODO: this needs the merchant API key, so it must run in the Cloud Function
   *       proxy — never in the browser. Simulation mode short-circuits it.
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

    if (!this.isConfigured() && !(cfg.allowInsecureDirectMode && !isPlaceholder(cfg.apiKey))) {
      return {
        success: false,
        verified: false,
        status: 'unconfigured',
        error: 'FamGateway verification is not configured yet.',
        missing: this.missingConfig()
      };
    }

    try {
      let json;
      if (this.isConfigured()) {
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
        // SANDBOX ONLY: leaks the API key. TODO: remove before going live.
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
      return { success: false, verified: false, status: 'network_error', error: err.message };
    }
  };

  /* --------------------------------------------- STEP 5: read the return URL */

  /**
   * Parses whatever FamGateway appended (or that simulation mode added) on the
   * way back from checkout. Only /api/verify-order.php is authoritative, so the
   * query string here is treated purely as a hint.
   */
  Gateway.handleReturn = function (search) {
    const params = new URLSearchParams(search || window.location.search);
    const status = String(params.get('status') || params.get('payment_status') || '').toLowerCase();

    return {
      famgatewayOrderId: params.get('order_id') || params.get('fg_order_id') || '',
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
