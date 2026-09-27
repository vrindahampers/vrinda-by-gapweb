/**
 * vrindahampers - Payment Return Controller (Phase 4)
 *
 * Runs on pages/payment-return.html after the customer comes back from the
 * FamGateway hosted checkout. This is the pivot where money becomes an order:
 *
 *   1. read the return parameters (treated as a hint only)
 *   2. idempotency check  -> /paymentSessions/{fgOrderId} (refresh-safe)
 *   3. authoritative verify -> FamGateway /api/verify-order.php (via Cloud Function)
 *   4. poll the public status endpoint while a UPI transfer settles
 *   5. create the order -> /orders, /userOrders, /adminNotifications, cart cleared
 *   6. redirect to pages/order-success.html
 */

(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', () => {
    const UI = window.VrindaCommerceUI;
    const Store = window.VrindaStore;
    const Orders = window.VrindaOrders;
    const Gateway = window.VrindaFamGateway;

    if (!UI || !Orders || !Gateway) {
      console.error('Payment return page: commerce modules failed to load.');
      return;
    }

    const returned = Gateway.handleReturn();
    let pollHandle = null;

    window.VrindaAuth.whenReady(async (user) => {
      if (!user) {
        // Preserve the full return URL so the verification can resume after login.
        window.location.href = './login.html?redirect=' + encodeURIComponent(window.location.pathname + window.location.search);
        return;
      }
      await run();
    });

    window.addEventListener('beforeunload', () => {
      if (pollHandle) pollHandle.stop();
    });

    /* ------------------------------------------------------------------ flow */

    /**
     * Recovers the FamGateway order id from our own checkout draft, which is
     * saved before the redirect and mirrored to /checkoutDrafts/{uid}. This is
     * the only recovery route that survives a cleared browser, a different
     * device, or a payment app bouncing the customer through another browser.
     * A draft is only trusted when it is the one named in the return link, or
     * when it is fresh enough to belong to the payment being returned from.
     */
    async function recoverFromCheckoutDraft() {
      if (!Orders || typeof Orders.loadCheckoutDraft !== 'function') return null;

      let draft = null;
      try { draft = await Orders.loadCheckoutDraft(); } catch (err) { draft = null; }
      if (!draft || !draft.gatewayOrderId) return null;

      if (returned.draftId && draft.draftId && draft.draftId !== returned.draftId) {
        // A different draft: only trust it if it is genuinely recent.
        const stamp = draft.savedAt || draft.createdAt || 0;
        if (Date.now() - stamp > 90 * 60 * 1000) return null;
      }

      return { orderId: draft.gatewayOrderId, source: 'checkout-draft' };
    }

    async function run() {
      UI.markSteps('returnSteps', 'session', 'done');

      // FamGateway's hosted page sends the customer back to a bare redirect_url,
      // so the order reference usually has to come from this device. Never leave a
      // captured payment unclaimed.
      let resolved = Gateway.resolveReturnOrder
        ? Gateway.resolveReturnOrder(returned)
        : (returned.famgatewayOrderId ? { orderId: returned.famgatewayOrderId, source: 'return-link' } : null);

      // Last resort: our own checkout draft carries the gateway order id, and it is
      // mirrored to /checkoutDrafts/{uid}. That recovers the payment even when the
      // link has no order_id AND the browser stash is gone (storage cleared, a
      // different device, or a redirect through another app).
      if (!resolved || !resolved.orderId) {
        resolved = await recoverFromCheckoutDraft();
      }

      if (!resolved || !resolved.orderId) {
        fail('No FamGateway order reference was found in the return link.',
          'If money left your account, share the UPI reference with us on WhatsApp and we will reconcile it manually.');
        return;
      }

      if (resolved.orderId !== returned.famgatewayOrderId) {
        returned.famgatewayOrderId = resolved.orderId;
        UI.notice('returnNotice',
          '<strong>We recovered your payment session' +
          (resolved.source === 'checkout-draft' ? ' from your saved checkout' : ' from this device') + '.</strong> ' +
          'Verifying it with FamGateway now…',
          'info');
      }

      showDebug();

      // 2. Idempotency: a refresh (or a double webhook) must never duplicate an order.
      const existing = await Orders.findSession(returned.famgatewayOrderId);
      if (existing && existing.orderId) {
        UI.markSteps('returnSteps', 'order', 'done');
        succeed(existing.orderId);
        return;
      }

      // 3. Authoritative verification.
      UI.markSteps('returnSteps', 'verify');
      UI.setStep('verify', 'active');
      const verification = await Gateway.verifyOrder(returned.famgatewayOrderId);

      // "We could not REACH the gateway" is not "the payment failed". FamGateway's
      // verify-order.php answers 401 to a browser preflight and sends no CORS
      // headers at all, so in direct mode a captured payment could never be
      // confirmed - and the customer lost both the order AND the reference. Keep
      // every reference we have and book the order for manual reconciliation.
      if (!verification.success && verification.unreachable) {
        await createOrderUnverified(verification);
        return;
      }

      if (!verification.success) {
        fail(
          verification.error || 'We could not verify this payment with FamGateway.',
          'Nothing has been charged twice — retry the checkout to start a fresh payment session.'
        );
        return;
      }

      if (!verification.verified) {
        await waitForSettlement();
        return;
      }

      await createOrder(verification);
    }

    /**
     * The gateway is unreachable from the browser, so we cannot confirm the capture
     * here. Try the public status endpoint once (it works whenever CORS allows it),
     * and either way create the order with every reference attached, flagged for
     * manual verification. Losing the order is far worse than an unverified one.
     */
    async function createOrderUnverified(verification) {
      UI.setStep('verify', 'active');

      const publicStatus = await Gateway.pollStatusOnce(returned.famgatewayOrderId);
      if (publicStatus && publicStatus.status === 'success') {
        await createOrder({
          success: true,
          verified: true,
          orderId: returned.famgatewayOrderId,
          utr: publicStatus.utr || '',
          transactionId: publicStatus.transaction_id || '',
          senderName: publicStatus.sender_name || '',
          payableAmount: returned.amount || 0,
          verificationNote: 'Confirmed via the public checkout-status endpoint.'
        });
        return;
      }

      const note = 'The browser could not reach FamGateway to verify this payment (' +
        (verification.error || 'network/CORS blocked') +
        '). The order was created so nothing is lost — please confirm against your FamPay dashboard.';

      await createOrder({
        success: true,
        verified: false,
        orderId: returned.famgatewayOrderId,
        utr: verification.utr || returned.utr || '',
        transactionId: verification.transactionId || returned.transactionId || '',
        payableAmount: returned.amount || 0,
        verificationNote: note
      }, note);
    }

    /* ---------------------------------------------- async settlement polling */

    async function waitForSettlement() {
      UI.setStep('verify', 'active');
      UI.notice('returnNotice',
        '<strong>Waiting for your UPI transfer to settle.</strong><br>' +
        'FamGateway confirms peer-to-peer UPI payments within a few seconds. Keep this tab open — ' +
        'we will create your order automatically the moment the bank reference arrives.',
        'info');

      let attempts = 0;

      pollHandle = Gateway.pollStatus(returned.famgatewayOrderId, async (update) => {
        attempts += 1;

        if (update.status === 'success') {
          UI.setStep('verify', 'done');
          const verification = await Gateway.verifyOrder(returned.famgatewayOrderId);

          if (verification.success === false) {
            // The public status endpoint already confirmed the capture, so never
            // strand a paid customer just because verify-order.php was unreachable.
            verification.verified = true;
            verification.verificationNote =
              'Confirmed via the public checkout-status endpoint; server-side verify-order.php was unavailable: ' +
              (verification.error || 'unknown error');
          }

          await createOrder(verification);
          return;
        }

        if (update.status === 'failed' || update.status === 'expired') {
          fail('This FamGateway session ended without a captured payment.',
            'Please start the payment again — no order was created.');
          return;
        }

        UI.notice('returnNotice',
          '⏳ Still waiting for the bank confirmation… (attempt ' + attempts + ')',
          'info');
      }, { initialDelayMs: 3000 });
    }

    /* ------------------------------------------------------- order creation */

    async function resolveTotals(draft) {
      const snapshot = Object.assign({
        items: [],
        itemCount: 0,
        subtotal: 0,
        mrpTotal: 0,
        catalogSavings: 0,
        discount: 0,
        shipping: 0,
        total: 0,
        currency: 'INR',
        shippingMode: 'standard'
      }, (draft && draft.totals) || {});

      snapshot.items = (draft && draft.items) || [];

      if (!Store || snapshot.items.length === 0) return snapshot;

      // Prefer live cart numbers, but only when they still match what was charged.
      const live = await Store.getTotals({
        shippingMode: (draft && draft.shippingMode) || 'standard',
        couponCode: (draft.totals && draft.totals.couponCode) || null
      });

      if (live.itemCount > 0 && Math.abs(live.total - snapshot.total) < 1) return live;
      return snapshot;
    }

    async function createOrder(verification, customerNote) {
      UI.setStep('verify', 'done');
      UI.markSteps('returnSteps', 'order');
      const unverified = verification.verified === false;
      UI.notice('returnNotice', unverified
        ? '<strong>Payment reference received.</strong> We are confirming it with our payment provider and saving your order now…'
        : '<strong>Payment confirmed.</strong> Creating your order now…', 'success');

      const draft = await Orders.loadCheckoutDraft();

      if (!draft) {
        // Money may have been captured with no local draft (different device or
        // cleared storage). Never lose the payment: flag it for manual review.
        await flagForManualReview(verification);
        fail(
          'Your payment was received, but we could not find the checkout details on this device.',
          'Our team has been alerted with your payment reference and will contact you to complete the order. ' +
          'You can also message us on WhatsApp to speed things up.'
        );
        return;
      }

      const totals = await resolveTotals(draft);

      const result = await Orders.createOrder({
        checkout: draft.checkout || {},
        totals: totals,
        payment: verification
      });

      if (!result.success) {
        fail(result.error || 'We could not save your order.',
          'Your payment reference is saved — please contact us on WhatsApp so we can complete this order manually.');
        return;
      }

      UI.markSteps('returnSteps', 'order', 'done');

      if (unverified) {
        // Tell the truth: the order exists, the confirmation is pending.
        const icon = document.getElementById('returnIcon');
        if (icon) {
          icon.className = 'return-icon success';
          icon.textContent = '⏳';
        }
        setHeading('Order saved — payment confirmation pending',
          'Our team is confirming your payment with the gateway.');
        UI.notice('returnNotice',
          '<strong>Your order ' + UI.escapeHtml(result.orderId) + ' is saved.</strong><br>' +
          UI.escapeHtml(customerNote || 'We are confirming your payment with the provider.') +
          '<br><br>You will get a confirmation on WhatsApp shortly — nothing further is needed from you.',
          'info');
        const actions = document.getElementById('returnActions');
        if (actions) actions.style.display = 'flex';
        return;
      }

      succeed(result.orderId);
    }

    async function flagForManualReview(verification) {
      if (typeof firebase === 'undefined' || !firebase.database) return;
      const user = window.VrindaAuth.currentUser;
      try {
        await firebase.database().ref('adminNotifications').push({
          type: 'payment-needs-manual-review',
          userId: user ? user.uid : '',
          customerName: user ? (user.displayName || user.email) : 'Unknown customer',
          famgatewayOrderId: verification.orderId || returned.famgatewayOrderId,
          utr: verification.utr || '',
          transactionId: verification.transactionId || '',
          payableAmount: verification.payableAmount || returned.amount || null,
          reason: 'Payment verified but the checkout draft was not found on the customer device.',
          read: false,
          createdAt: firebase.database.ServerValue.TIMESTAMP
        });
      } catch (err) {
        console.warn('Manual review notification failed:', err.message);
      }
    }

    /* ------------------------------------------------------------- endings */

    function succeed(orderId) {
      if (Gateway.clearPendingSession) Gateway.clearPendingSession(returned.famgatewayOrderId);
      const icon = document.getElementById('returnIcon');
      if (icon) {
        icon.className = 'return-icon success';
        icon.textContent = '✅';
      }
      setHeading('Order confirmed!', 'Taking you to your order summary…');
      UI.notice('returnNotice', '<strong>Payment captured and order ' + UI.escapeHtml(orderId) +
        ' created.</strong> Redirecting…', 'success');

      const actions = document.getElementById('returnActions');
      if (actions) actions.style.display = 'flex';

      setTimeout(() => {
        window.location.replace('./order-success.html?orderId=' + encodeURIComponent(orderId));
      }, 1400);
    }

    function fail(message, hint) {
      const icon = document.getElementById('returnIcon');
      if (icon) {
        icon.className = 'return-icon failed';
        icon.textContent = '⚠️';
      }
      setHeading('Payment not completed', 'You can safely retry — nothing was charged twice.');

      UI.notice('returnNotice',
        '<strong>' + UI.escapeHtml(message) + '</strong>' +
        (hint ? '<br>' + UI.escapeHtml(hint) : '') +
        '<br><br><a class="btn btn-primary btn-sm" href="./checkout.html?resume=1">Retry Payment</a> ' +
        '<a class="btn btn-secondary btn-sm" href="./cart.html">Back to Cart</a>',
        'error');

      const actions = document.getElementById('returnActions');
      if (actions) actions.style.display = 'flex';
    }

    function setHeading(title, subtitle) {
      const titleEl = document.getElementById('returnTitle');
      const subEl = document.getElementById('returnSubtitle');
      if (titleEl) titleEl.textContent = title;
      if (subEl) subEl.textContent = subtitle;
    }

    function showDebug() {
      const panel = document.getElementById('returnDebug');
      const body = document.getElementById('returnDebugBody');
      if (!panel || !body) return;
      panel.style.display = 'block';
      body.textContent = JSON.stringify({
        returnParameters: returned.raw,
        simulationMode: Gateway.isSimulationMode(),
        configurationGaps: Gateway.missingConfig()
      }, null, 2);
    }
  });
})();
