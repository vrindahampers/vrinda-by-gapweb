/**
 * vrindahampers - Live Order Tracking Controller (Phase 5)
 *
 * Customer-facing tracker for pages/order-tracking.html. Resolves an order from
 * ?orderId=, renders the shared 11-step visual timeline plus the local rider /
 * courier delivery card, and stays subscribed to /orders/{orderId} so status and
 * delivery changes appear without a refresh.
 *
 * Customers can also raise a cancellation request which the Super Admin reviews.
 */

(function () {
  'use strict';

  const MAX_LOOKUP_ATTEMPTS = 5;
  const LOOKUP_DELAY_MS = 800;

  document.addEventListener('DOMContentLoaded', () => {
    const UI = window.VrindaCommerceUI;
    const Orders = window.VrindaOrders;

    if (!UI || !Orders) {
      console.error('Order tracking page: commerce modules failed to load.');
      return;
    }

    const esc = UI.escapeHtml;
    const params = new URLSearchParams(window.location.search);
    const initialOrderId = normalizeOrderId(params.get('orderId') || params.get('id') || '');

    let currentOrder = null;
    let currentProfile = null;
    let stopLiveListener = null;

    const form = document.getElementById('trackingForm');
    const input = document.getElementById('trackingOrderId');

    if (input && initialOrderId) input.value = initialOrderId;

    if (form) {
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const id = normalizeOrderId(input ? input.value : '');
        if (!id) {
          UI.notice('trackingNotice', 'Please enter the order ID printed in your confirmation message.', 'warning');
          return;
        }
        window.location.href = './order-tracking.html?orderId=' + encodeURIComponent(id);
      });
    }

    UI.show('trackingEmpty', 'block');

    window.VrindaAuth.whenReady((user, profile) => {
      if (!user) {
        window.location.href = './login.html?redirect=' +
          encodeURIComponent(window.location.pathname + window.location.search);
        return;
      }

      currentProfile = profile || {};
      watchConnection();
      wireCancelDialog();

      window.addEventListener('beforeunload', () => {
        if (stopLiveListener) stopLiveListener();
      });

      if (initialOrderId) loadOrder(initialOrderId);
    });

    /* ------------------------------------------------------------ loading */

    async function loadOrder(orderId) {
      UI.hide('trackingEmpty');
      UI.hide('trackingMissing');
      UI.show('trackingLoading', 'flex');

      const order = await lookupOrder(orderId);
      UI.hide('trackingLoading');

      if (!order) {
        UI.show('trackingMissing', 'block');
        UI.hide('trackingResult');
        return;
      }

      currentOrder = order;
      render(order);

      if (stopLiveListener) stopLiveListener();
      stopLiveListener = Orders.listenToOrder(orderId, (live) => {
        if (!live) return;
        currentOrder = live;
        render(live);
      });
    }

    /** A freshly placed order can briefly lag the redirect / manual entry. */
    async function lookupOrder(orderId) {
      for (let attempt = 0; attempt < MAX_LOOKUP_ATTEMPTS; attempt++) {
        const order = await Orders.getOrder(orderId);
        if (order) return order;
        await new Promise((resolve) => setTimeout(resolve, LOOKUP_DELAY_MS));
      }
      return null;
    }

    function normalizeOrderId(value) {
      return String(value || '').trim().toUpperCase();
    }

    /* ------------------------------------------------------------- render */

    function render(order) {
      UI.hide('trackingEmpty');
      UI.hide('trackingMissing');
      UI.show('trackingResult', 'grid');

      const progress = Orders.getTimelineProgress(order.status);

      setText('trackingOrderIdLabel', order.orderId || '—');
      setText('trackingStatusValue', progress.currentStatus);
      setText('trackingPlacedAt', UI.prettyDateTime(order.createdAt) || '—');
      setText('trackingDeliveryDate', UI.prettyDate(order.gifting && order.gifting.deliveryDate) || 'As scheduled');
      setText('trackingTotal', UI.money((order.pricing && order.pricing.total) || 0));
      setText('trackingSummaryLine', summaryLine(order, progress));
      setText('trackingStepCount', progress.isCancelled
        ? 'Tracking stopped'
        : 'Step ' + (progress.currentIndex + 1) + ' of ' + progress.totalSteps);

      renderInto('trackingTimeline', UI.timelineHtml(order, { variant: 'full' }));
      renderInto('trackingDelivery', UI.deliveryCardHtml(order));
      renderInto('trackingGiftDetails', detailRows(giftRows(order)));
      renderInto('trackingPaymentDetails', detailRows(paymentRows(order)));
      renderInto('trackingCancelState', UI.cancellationNoticeHtml(order));

      const itemsHost = document.getElementById('trackingItems');
      if (itemsHost) {
        itemsHost.innerHTML = (order.items || []).map((item) => UI.cartLineHtml(item, { readonly: true })).join('');
      }
      UI.renderSummary('trackingSummaryRows', totalsFromOrder(order), { showFreeShippingHint: false });

      const askBtn = document.getElementById('trackingWhatsAppBtn');
      if (askBtn) askBtn.href = Orders.whatsAppLink(order, 'customer-tracking');

      const detailsBtn = document.getElementById('trackingDetailsBtn');
      if (detailsBtn) detailsBtn.href = Orders.whatsAppLink(order, 'customer-order');

      syncCancelButton(order);
      document.title = 'Order ' + (order.orderId || '') + ' · Live Tracking — vrindahampers';
    }

    function summaryLine(order, progress) {
      const city = (order.shipping && order.shipping.city) || 'your recipient';
      if (progress.isCancelled) return 'This order was cancelled. Any prepaid amount is refunded to the original payment method.';
      if (progress.isComplete) return 'Delivered to ' + city + ' — thank you for celebrating with vrindahampers!';
      const delivery = order.delivery || {};
      const mode = delivery.type === 'local'
        ? 'a local express rider'
        : 'courier partner ' + (delivery.courierName || 'India Post / BlueDart');
      return 'Heading to ' + city + ' via ' + mode + '. We update this page automatically.';
    }

    /* ------------------------------------------------------ detail helpers */

    function detailRows(rows) {
      const html = rows
        .filter((row) => row[1] !== undefined && row[1] !== null && row[1] !== '')
        .map((row) => `
          <div class="detail-row">
            <span class="detail-label">${esc(row[0])}</span>
            <span class="detail-value">${esc(row[1])}</span>
          </div>
        `).join('');

      return html || '<p class="summary-tax-note">No details captured yet.</p>';
    }

    function giftRows(order) {
      const gift = order.gifting || {};
      const ship = order.shipping || {};
      const delivery = order.delivery || {};

      return [
        ['Occasion', gift.occasion],
        ['Gift Message', gift.giftMessage ? '“' + gift.giftMessage + '”' : 'Shared on WhatsApp'],
        ['Surprise Packaging', gift.isSurprise ? 'Yes — details hidden' : 'No'],
        ['Delivery Speed', delivery.shippingMode === 'express' ? 'Express' : 'Standard'],
        ['Time Slot', gift.deliverySlot],
        ['Recipient City', ship.city],
        ['PIN Code', ship.pincode]
      ];
    }

    function paymentRows(order) {
      const payment = order.payment || {};
      return [
        ['Gateway', payment.gateway || 'FamGateway'],
        ['Mode', payment.simulated ? 'Simulation (no live credentials)' : (payment.mode || 'live')],
        ['FamGateway Order', payment.famgatewayOrderId || '—'],
        ['UPI Reference (UTR)', payment.utr || '—'],
        ['Transaction ID', payment.transactionId || '—'],
        ['Amount Paid', UI.money((order.pricing && order.pricing.total) || 0)]
      ];
    }

    function totalsFromOrder(order) {
      const pricing = order.pricing || {};
      const subtotal = Number(pricing.subtotal) || 0;
      const mrpTotal = Number(pricing.mrpTotal) || subtotal;

      return {
        itemCount: pricing.itemCount || (order.items || []).length,
        subtotal: subtotal,
        mrpTotal: mrpTotal,
        catalogSavings: Math.max(0, mrpTotal - subtotal),
        discount: Number(pricing.discount) || 0,
        couponCode: pricing.couponCode || '',
        shipping: Number(pricing.shipping) || 0,
        shippingMode: pricing.shippingMode || 'standard',
        total: Number(pricing.total) || 0,
        currency: pricing.currency || 'INR',
        amountToFreeShipping: 0,
        qualifiesFreeShipping: (Number(pricing.shipping) || 0) === 0
      };
    }

    function renderInto(id, html) {
      const el = document.getElementById(id);
      if (el) el.innerHTML = html || '';
    }

    function setText(id, value) {
      const el = document.getElementById(id);
      if (el) el.textContent = value === undefined || value === null ? '' : value;
    }

    function watchConnection() {
      const flag = document.getElementById('trackingLiveFlag');
      if (!flag) return;

      if (typeof firebase === 'undefined' || !firebase.database) {
        flag.classList.add('is-offline');
        flag.textContent = 'Live updates unavailable offline';
        return;
      }

      firebase.database().ref('.info/connected').on('value', (snap) => {
        const online = snap.val() === true;
        flag.classList.toggle('is-offline', !online);
        flag.textContent = online ? 'Live status updates on' : 'Reconnecting to live updates…';
      });
    }

    /* -------------------------------------------------- cancellation request */

    function syncCancelButton(order) {
      const btn = document.getElementById('trackingCancelBtn');
      if (!btn) return;

      const status = order.status || Orders.STATUS.ORDER_PLACED;
      const cancelState = order.cancellationStatus || 'none';
      const allowed = cancelState === 'none' &&
        status !== Orders.STATUS.DELIVERED &&
        status !== Orders.STATUS.CANCELLED;

      btn.disabled = !allowed;
      btn.style.display = allowed ? '' : 'none';
    }

    function wireCancelDialog() {
      const dialog = document.getElementById('cancelDialog');
      const cancelForm = document.getElementById('cancelForm');
      if (!dialog || !cancelForm) return;

      const openBtn = document.getElementById('trackingCancelBtn');
      if (openBtn) {
        openBtn.addEventListener('click', () => {
          if (currentOrder) openCancelDialog(currentOrder);
        });
      }

      const close = document.getElementById('cancelDialogClose');
      const dismiss = document.getElementById('cancelDialogDismiss');
      if (close) close.addEventListener('click', closeCancelDialog);
      if (dismiss) dismiss.addEventListener('click', closeCancelDialog);

      dialog.addEventListener('click', (event) => {
        if (event.target === dialog) closeCancelDialog();
      });

      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && dialog.classList.contains('open')) closeCancelDialog();
      });

      cancelForm.addEventListener('submit', submitCancellation);
    }

    function openCancelDialog(order) {
      const dialog = document.getElementById('cancelDialog');
      if (!dialog || !order) return;

      const idSlot = document.getElementById('cancelDialogOrderId');
      if (idSlot) idSlot.textContent = order.orderId || '—';

      UI.notice('cancelDialogNotice', '');

      const submitBtn = document.getElementById('cancelSubmitBtn');
      if (submitBtn) submitBtn.disabled = false;

      dialog.classList.add('open');
      dialog.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      if (submitBtn) submitBtn.focus({ preventScroll: true });
    }

    function closeCancelDialog() {
      const dialog = document.getElementById('cancelDialog');
      if (!dialog) return;

      dialog.classList.remove('open');
      dialog.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }

    async function submitCancellation(event) {
      event.preventDefault();

      if (!currentOrder) return;

      const orderId = currentOrder.orderId;
      const submitBtn = document.getElementById('cancelSubmitBtn');
      const reasonEl = document.querySelector('input[name="cancelReason"]:checked');
      const notesEl = document.getElementById('cancelNotes');

      UI.notice('cancelDialogNotice', '');
      if (submitBtn) UI.setBusy(submitBtn, true, 'Submitting…');

      const result = await Orders.submitCancellationRequest({
        orderId: orderId,
        reason: reasonEl ? reasonEl.value : 'Customer requested cancellation',
        notes: notesEl ? notesEl.value.trim() : '',
        customerName: (currentOrder.customer && currentOrder.customer.name) || (currentProfile && currentProfile.name) || '',
        customerPhone: (currentOrder.customer && currentOrder.customer.phone) || (currentProfile && currentProfile.phone) || ''
      });

      if (submitBtn) UI.setBusy(submitBtn, false, null, 'Submit Request');

      if (!result.success) {
        UI.notice('cancelDialogNotice',
          esc(result.error || 'We could not submit your request. Please try again or message us on WhatsApp.'),
          'error');
        return;
      }

      currentOrder.cancellationStatus = 'requested';
      syncCancelButton(currentOrder);
      renderInto('trackingCancelState', UI.cancellationNoticeHtml(currentOrder));

      const followUp = Orders.whatsAppLink(currentOrder, 'customer-cancellation');
      UI.notice('cancelDialogNotice',
        '<strong>✅ Cancellation request submitted.</strong><br>' +
        'Our Super Admin team will review order ' + esc(orderId) +
        ' and confirm the outcome here and on WhatsApp.<br>' +
        '<a href="' + esc(followUp) + '" target="_blank" rel="noopener noreferrer">Follow up on WhatsApp →</a>',
        'success');

      if (notesEl) notesEl.value = '';
    }
  });
})();
