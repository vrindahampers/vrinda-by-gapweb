/**
 * vrindahampers - Checkout Controller (Phase 4)
 * Collects the delivery + gifting details, validates them, snapshots a recoverable
 * checkout draft, then opens a FamGateway payment session and hands the customer
 * over to the hosted UPI checkout.
 *
 * Flow: Checkout -> FamGateway -> payment-return.html -> Order created -> Admin alerted
 */

(function () {
  'use strict';

  const DRAFT_PREFIX = 'DRAFT';

  document.addEventListener('DOMContentLoaded', () => {
    const UI = window.VrindaCommerceUI;
    const Store = window.VrindaStore;
    const Orders = window.VrindaOrders;
    const Gateway = window.VrindaFamGateway;

    if (!UI || !Store || !Orders || !Gateway) {
      console.error('Checkout page: commerce modules failed to load.');
      return;
    }

    const form = document.getElementById('checkoutForm');
    let shippingMode = 'standard';
    let currentUser = null;
    let draftId = DRAFT_PREFIX + '-' + Date.now().toString(36).toUpperCase();
    let renderedCartSignature = null;
    let cartLoadInFlight = false;
    let draftRestored = false;

    window.VrindaAuth.whenReady(async (user) => {
      currentUser = user;
      if (!user) {
        window.location.href = './login.html?redirect=' + encodeURIComponent('./checkout.html');
        return;
      }

      populateSelects();
      populateDates();
      renderGatewayMode();
      wireGiftMessageCounter();

      // /cart/{uid} is read asynchronously, so wait for the first snapshot before
      // deciding the cart is empty — otherwise a full cart looked empty here and the
      // whole form (Pay button included) stayed hidden.
      await Store.whenCartReady(4000);
      await loadCart();

      const gate = window.VrindaAuth.canPerformGatedAction('checkout');
      if (!gate.allowed) {
        UI.notice('checkoutNotice',
          '<strong>' + UI.escapeHtml(gate.message) + '</strong><br>' +
          'Verify your email from <a href="./profile.html">your profile page</a>, then reload this page to pay.',
          'warning');
        const payBtn = document.getElementById('payNowBtn');
        if (payBtn) {
          payBtn.disabled = true;
          payBtn.textContent = 'Email verification required';
        }
      }
    });

    // The cart can fill up after this page opened (add to cart in another tab, a
    // guest stash flushed on login, or a quantity change). Re-render whenever the
    // item set actually changes, so an "empty" checkout recovers by itself.
    Store.onCartChange(() => {
      if (!currentUser) return;
      const signature = cartSignature();
      if (signature === renderedCartSignature || cartLoadInFlight) return;
      loadCart();
    });

    function cartSignature() {
      return Store.getCartItems()
        .map((item) => (item.productId || item.id) + 'x' + (parseInt(item.qty, 10) || 1))
        .sort()
        .join('|');
    }

    /* ------------------------------------------------------------ selections */

    function populateSelects() {
      const occasionSelect = document.getElementById('ckOccasion');
      const occasions = (window.VRINDA_DATA && window.VRINDA_DATA.occasions) || [];
      if (occasionSelect) {
        occasionSelect.innerHTML = '<option value="">Select an occasion</option>' +
          occasions.map((o) => `<option value="${UI.escapeHtml(o.name)}">${UI.escapeHtml(o.name)}</option>`).join('') +
          '<option value="Just Because">Just Because</option>' +
          '<option value="Corporate Gifting">Corporate Gifting</option>';
      }

      const slotSelect = document.getElementById('ckDeliverySlot');
      const slots = (window.VRINDA_DATA && window.VRINDA_DATA.deliverySlots) || [];
      if (slotSelect) {
        slotSelect.innerHTML = slots
          .map((s) => `<option value="${UI.escapeHtml(s.label)}">${UI.escapeHtml(s.label)}</option>`)
          .join('');
      }
    }

    function populateDates() {
      const dateInput = document.getElementById('ckDeliveryDate');
      const hint = document.getElementById('ckDeliveryHint');
      if (!dateInput) return;

      const min = UI.todayIso();
      const max = UI.addDaysIso(45);
      dateInput.min = min;
      dateInput.max = max;
      dateInput.value = min;

      if (hint) {
        hint.textContent = 'Earliest today · bookings open up to 45 days ahead.';
      }
    }

    /**
     * Simulation must never run on a public site. Locally it is a useful rehearsal
     * tool, but a live site without a merchant key would happily "verify" a payment
     * that never happened and create a real, marked-paid order — i.e. free orders.
     * So outside localhost we simply refuse to take an order and say why.
     */
    function isLocalHost() {
      const host = window.location.hostname;
      return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]' ||
        host.endsWith('.localhost');
    }

    function renderGatewayMode() {
      const banner = document.getElementById('gatewayModeBanner');
      const note = document.getElementById('payNowNote');
      if (!banner) return;

      if (Gateway.isSimulationMode()) {
        banner.style.display = 'block';

        if (isLocalHost()) {
          banner.className = 'mode-banner simulation';
          banner.innerHTML =
            '<strong>🧪 Payment simulation mode (local only)</strong>' +
            '<span>This is your machine, so the checkout rehearses the full flow without moving money. ' +
            'For real payments here, run this once in the browser console and reload:</span>' +
            '<ul>' + Gateway.missingConfig().map((m) => '<li>' + UI.escapeHtml(m) + '</li>').join('') + '</ul>';
          if (note) note.textContent = 'Local simulation: no real money moves and no FamGateway page opens.';
        } else {
          banner.className = 'mode-banner simulation';
          banner.innerHTML =
            '<strong>⚠️ Checkout is temporarily unavailable</strong>' +
            '<span>We are finishing our payment setup and cannot take orders just yet. ' +
            'Please message us on WhatsApp and we will take your order personally.</span>';
          if (note) note.textContent = 'Payments are being configured — please contact us on WhatsApp.';

          const payBtn = document.getElementById('payNowBtn');
          if (payBtn) {
            payBtn.disabled = true;
            payBtn.textContent = 'Checkout unavailable';
          }
        }
      } else {
        banner.style.display = 'block';
        banner.className = 'mode-banner live';
        banner.innerHTML = '<strong>🔒 FamGateway UPI checkout is live.</strong>' +
          '<span>You will be redirected to the secure FamGateway page to pay by UPI.</span>';
      }
    }

    function wireGiftMessageCounter() {
      const field = document.getElementById('ckGiftMessage');
      const counter = document.getElementById('ckGiftMessageCount');
      if (!field || !counter) return;

      const cfg = (window.VRINDA_DATA && window.VRINDA_DATA.commerceConfig) || {};
      const max = cfg.maxGiftMessageLength || 500;
      field.maxLength = max;
      counter.textContent = '0';

      field.addEventListener('input', () => { counter.textContent = String(field.value.length); });
    }

    /* ---------------------------------------------------------- cart loading */

    async function loadCart() {
      if (cartLoadInFlight) return;
      cartLoadInFlight = true;
      try {
        await renderCheckout();
      } finally {
        cartLoadInFlight = false;
      }
    }

    async function renderCheckout() {
      UI.hide('checkoutLoading');

      if (Store.getCartCount() === 0) {
        renderedCartSignature = '';
        UI.hide(form);
        UI.show('checkoutEmpty', 'block');
        return;
      }

      const priceChanges = await Store.revalidateCartPrices();
      if (priceChanges.length > 0) {
        UI.notice('checkoutNotice',
          'Some prices changed since you added these gifts: ' +
          priceChanges.map((c) => UI.escapeHtml(c.name) + ' (' + UI.money(c.from) + ' → ' + UI.money(c.to) + ')').join(', ') +
          '. Your cart has been updated to the current price.',
          'warning');
      }

      prefillFromProfile();
      await refreshTotals();
      renderedCartSignature = cartSignature();
      UI.hide('checkoutEmpty');
      UI.show(form, 'grid');

      // ?resume=1 (or a pending draft) restores the form the customer already filled
      const params = new URLSearchParams(window.location.search);
      if (!draftRestored && params.get('resume') === '1') {
        draftRestored = true;
        await restoreDraft();
      }
    }

    function prefillFromProfile() {
      const profile = window.VrindaAuth.currentProfile || {};
      const user = window.VrindaAuth.currentUser || {};
      const address = (profile.addresses && profile.addresses.default) || {};

      setValue('ckName', profile.name || user.displayName || '');
      setValue('ckPhone', profile.phone || '');
      setValue('ckEmail', user.email || '');
      setValue('ckAddress1', address.line1 || '');
      setValue('ckCity', address.city || '');
      setValue('ckState', address.state || '');
      setValue('ckPincode', address.pincode || '');
    }

    function setValue(id, value) {
      const el = document.getElementById(id);
      if (el && !el.value) el.value = value;
    }

    async function refreshTotals() {
      const totals = await Store.getTotals({ shippingMode: shippingMode });

      const itemsHost = document.getElementById('checkoutItems');
      if (itemsHost) {
        itemsHost.innerHTML = totals.items.map((item) => UI.cartLineHtml(item, { readonly: true })).join('');
      }

      UI.renderSummary('checkoutSummaryRows', totals);
      const amountEl = document.getElementById('payNowAmount');
      if (amountEl) amountEl.textContent = UI.money(totals.total);

      return totals;
    }

    document.getElementById('ckDeliverySpeed')?.addEventListener('change', async (event) => {
      shippingMode = event.target.value === 'express' ? 'express' : 'standard';
      await refreshTotals();
    });

    /* ------------------------------------------------------------- gating */

    async function restoreDraft() {
      const draft = await Orders.loadCheckoutDraft();
      if (!draft) return;

      if (draft.draftId) draftId = draft.draftId;
      const data = draft.checkout || {};
      Object.keys(data).forEach((key) => {
        const el = document.getElementById('ck' + key.charAt(0).toUpperCase() + key.slice(1));
        if (!el) return;
        if (el.type === 'checkbox') {
          el.checked = !!data[key];
        } else if (data[key] !== undefined && data[key] !== null) {
          el.value = data[key];
        }
      });

      if (draft.shippingMode) {
        shippingMode = draft.shippingMode;
        const speedEl = document.getElementById('ckDeliverySpeed');
        if (speedEl) speedEl.value = shippingMode;
      }

      await refreshTotals();
      UI.notice('checkoutNotice',
        'We restored your checkout details, including your delivery date and gift message. ' +
        'Your previous payment was not completed, so nothing was charged again — review and pay when ready.',
        'info');
    }

    /* --------------------------------------------------------- validation */

    function collectCheckout() {
      return {
        userId: currentUser ? currentUser.uid : '',
        name: getValue('ckName'),
        phone: getValue('ckPhone'),
        email: window.VrindaAuth.currentUser ? window.VrindaAuth.currentUser.email : getValue('ckEmail'),
        addressLine1: getValue('ckAddress1'),
        addressLine2: getValue('ckAddress2'),
        landmark: getValue('ckLandmark'),
        city: getValue('ckCity'),
        state: getValue('ckState'),
        pincode: getValue('ckPincode'),
        occasion: getValue('ckOccasion'),
        giftMessage: getValue('ckGiftMessage'),
        deliveryDate: getValue('ckDeliveryDate'),
        deliverySlot: getValue('ckDeliverySlot'),
        deliverySpeed: shippingMode,
        notes: getValue('ckNotes'),
        isSurprise: !!(document.getElementById('ckSurprise') || {}).checked,
        saveAddress: !!(document.getElementById('ckSaveAddress') || {}).checked
      };
    }

    function getValue(id) {
      const el = document.getElementById(id);
      return el ? String(el.value || '').trim() : '';
    }

    function validate(data) {
      const problems = [];

      if (data.name.length < 2) problems.push('Please enter the full name of the person receiving updates.');
      const phoneDigits = data.phone.replace(/\D/g, '');
      if (phoneDigits.length < 10) problems.push('Please enter a valid 10-digit mobile number for WhatsApp coordination.');
      if (data.addressLine1.length < 5) problems.push('Please enter the house / flat / street address.');
      if (!data.city) problems.push('Please enter the city.');
      if (!data.state) problems.push('Please enter the state.');
      if (!/^[1-9][0-9]{5}$/.test(data.pincode)) problems.push('Please enter a valid 6-digit PIN code.');

      return problems;
    }

    /* ------------------------------------------------------ submit + payment */

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const totals = await refreshTotals();
      const payLabel = 'Pay ' + UI.money(totals.total) + ' with FamGateway';
      const payBtn = document.getElementById('payNowBtn');

      if (window.VrindaAuth && !window.VrindaAuth.requireGate('checkout')) return;

      // Belt and braces: a public site with no merchant key must never create an
      // order, even if someone bypasses the disabled button.
      if (Gateway.isSimulationMode() && !isLocalHost()) {
        UI.setBusy(payBtn, false, null, payLabel);
        UI.notice('checkoutNotice',
          '<strong>Checkout is temporarily unavailable.</strong><br>' +
          'We are finishing our payment setup. Please message us on WhatsApp and we will take your order personally.',
          'warning');
        return;
      }

      const checkout = collectCheckout();
      const problems = validate(checkout);
      if (problems.length > 0) {
        UI.notice('checkoutNotice',
          '<strong>Please fix the following before paying:</strong><ul>' +
          problems.map((p) => '<li>' + UI.escapeHtml(p) + '</li>').join('') + '</ul>',
          'error');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      if (!totals.items.length) {
        UI.notice('checkoutNotice', 'Your cart is empty.', 'error');
        return;
      }

      UI.setBusy(payBtn, true, 'Opening FamGateway…');
      UI.notice('checkoutNotice', '');

      // Snapshot the whole intent first, so a refresh, a bank redirect or a failed
      // payment can never lose the customer's delivery and gifting details.
      const draftPayload = {
        draftId: draftId,
        checkout: checkout,
        shippingMode: shippingMode,
        items: totals.items,
        totals: {
          itemCount: totals.itemCount,
          subtotal: totals.subtotal,
          discount: totals.discount,
          couponCode: totals.couponCode,
          shipping: totals.shipping,
          total: totals.total
        },
        createdAt: Date.now()
      };
      Orders.saveCheckoutDraft(draftPayload);

      if (checkout.saveAddress) persistAddress(checkout);

      const session = await Gateway.createPaymentSession({
        amount: totals.total,
        orderDraftId: draftId,
        customer: {
          name: checkout.name,
          email: checkout.email,
          phone: checkout.phone
        }
      });

      if (!session.success) {
        UI.setBusy(payBtn, false, null, payLabel);
        UI.notice('checkoutNotice',
          '<strong>We could not start the payment.</strong><br>' + UI.escapeHtml(session.error || 'Unknown error.') +
          (session.hint ? '<br><small>' + UI.escapeHtml(session.hint) + '</small>' : ''),
          'error');
        return;
      }

      await Gateway.recordSession(session, currentUser.uid, draftId);
      // Keep the session on this device: FamGateway comes back to a bare URL, and
      // without this the return page cannot tell which payment to verify.
      Gateway.stashPendingSession(session, draftId, currentUser.uid);
      // Mirror the gateway order id into the draft (merged, never replacing the
      // checkout details we just snapshotted) so the order can still be built from
      // another tab or device.
      Orders.saveCheckoutDraft(Object.assign({}, draftPayload, { gatewayOrderId: session.orderId }));

      UI.notice('checkoutNotice',
        session.simulated
          ? 'Simulation mode: skipping the FamGateway page and confirming the payment locally…'
          : 'Redirecting you to the secure FamGateway UPI page. Please do not close this tab.',
        'info');

      // Checkout -> FamGateway (or straight to the return handler in simulation mode)
      Gateway.redirectToCheckout(session.checkoutUrl);
    });

    function persistAddress(checkout) {
      if (!window.VrindaAuth || !window.VrindaAuth.currentUser) return;
      window.VrindaAuth.updateUserProfile({
        name: checkout.name,
        phone: checkout.phone,
        'addresses/default': {
          line1: checkout.addressLine1,
          city: checkout.city,
          state: checkout.state,
          pincode: checkout.pincode
        }
      }).catch(() => { /* non-critical: the order itself already stores the address */ });
    }
  });
})();
