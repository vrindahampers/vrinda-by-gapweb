/**
 * vrindahampers - Order Success / Receipt Controller (Phase 4)
 * Renders the confirmed order from /orders/{orderId}: items, money breakdown,
 * delivery + gifting details, payment reference and the WhatsApp hand-off for
 * personalization details.
 */

(function () {
  'use strict';

  const MAX_LOOKUP_ATTEMPTS = 6;

  let stopLiveListener = null;

  document.addEventListener('DOMContentLoaded', () => {
    const UI = window.VrindaCommerceUI;

    if (!UI || !window.VrindaOrders) {
      console.error('Order success page: commerce modules failed to load.');
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const orderId = params.get('orderId') || params.get('id') || '';

    window.VrindaAuth.whenReady(async (user) => {
      if (!user) {
        window.location.href = './login.html?redirect=' + encodeURIComponent(window.location.pathname + window.location.search);
        return;
      }

      watchConnection();

      const order = await lookupOrder(orderId);
      UI.hide('successLoading');

      if (!order) {
        UI.show('successMissing', 'block');
        return;
      }

      render(order);

      // Keep the receipt live: status, delivery details and cancellation state.
      if (stopLiveListener) stopLiveListener();
      stopLiveListener = window.VrindaOrders.listenToOrder(order.orderId, (live) => {
        if (live) render(live);
      });
    });

    /** RTDB writes are near-instant, but a fresh order can briefly lag the redirect. */
    async function lookupOrder(id) {
      if (!id) return null;

      for (let attempt = 0; attempt < MAX_LOOKUP_ATTEMPTS; attempt++) {
        const order = await window.VrindaOrders.getOrder(id);
        if (order) return order;
        await new Promise((resolve) => setTimeout(resolve, 700));
      }
      return null;
    }

    /* -------------------------------------------------------------- render */

    function render(order) {
      document.title = 'Order ' + order.orderId + ' — vrindahampers';
      UI.show('successWrap', 'block');

      setText('successOrderId', order.orderId);
      setText('successStatusBadge', order.status || 'Order Placed');

      const payment = order.payment || {};
      setText('successPaymentBadge', (payment.gateway || 'FamGateway') + ' · ' + (payment.simulated ? 'Simulated' : 'Paid'));

      const statusBadge = document.getElementById('successStatusBadge');
      if (statusBadge) statusBadge.className = 'badge status-pill ' + UI.statusClass(order.status);

      const itemsHost = document.getElementById('successItems');
      if (itemsHost) {
        itemsHost.innerHTML = (order.items || []).map((item) => UI.cartLineHtml(item, { readonly: true })).join('');
      }

      UI.renderSummary('successSummaryRows', totalsFromOrder(order), { showFreeShippingHint: false });
      renderDetail('successDelivery', deliveryRows(order));
      renderDetail('successGifting', giftingRows(order));
      renderDetail('successPaymentDetails', paymentRows(order));

      const whatsAppBtn = document.getElementById('successWhatsAppBtn');
      if (whatsAppBtn) whatsAppBtn.href = window.VrindaOrders.whatsAppLink(order, 'customer-order');

      const askBtn = document.getElementById('successAskBtn');
      if (askBtn) askBtn.href = window.VrindaOrders.whatsAppLink(order, 'customer-tracking');

      const trackBtn = document.getElementById('successTrackBtn');
      if (trackBtn) trackBtn.href = './order-tracking.html?orderId=' + encodeURIComponent(order.orderId);

      renderTracking(order);

      if (payment.simulated) {
        UI.notice('successNotice',
          '<strong>🧪 This order was created in payment simulation mode.</strong><br>' +
          'No real money moved through FamGateway. Add your merchant API key and Cloud Function URLs ' +
          'in <code>js/famgateway.js</code> to switch this flow to live UPI payments.',
          'warning');
      }
    }

    /* -------------------------------------------- live tracking (Phase 5) */

    /** 11-step timeline, step counter, delivery card and cancellation state. */
    function renderTracking(order) {
      const Orders = window.VrindaOrders;
      const progress = Orders.getTimelineProgress(order.status);

      const timelineHost = document.getElementById('successTimeline');
      if (timelineHost) timelineHost.innerHTML = UI.timelineHtml(order, { variant: 'full' });

      setText('successStepCount', progress.isCancelled
        ? 'Tracking stopped'
        : 'Step ' + (progress.currentIndex + 1) + ' of ' + progress.totalSteps);

      const deliveryHost = document.getElementById('successDeliveryTracking');
      if (deliveryHost) deliveryHost.innerHTML = UI.deliveryCardHtml(order);

      const cancelHost = document.getElementById('successCancelState');
      if (cancelHost) cancelHost.innerHTML = UI.cancellationNoticeHtml(order);

      const badge = document.getElementById('successStatusBadge');
      if (badge) {
        badge.className = 'badge badge-primary status-pill ' + UI.statusClass(order.status);
        badge.textContent = order.status || '';
      }

      document.title = 'Order ' + order.orderId + ' · Live Tracking — vrindahampers';
    }

    function watchConnection() {
      const flag = document.getElementById('successLiveFlag');
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

    function deliveryRows(order) {
      const ship = order.shipping || {};
      const gift = order.gifting || {};
      const customer = order.customer || {};

      return [
        ['Recipient', customer.name],
        ['Phone', customer.phone],
        ['Address', [ship.addressLine1, ship.addressLine2, ship.landmark].filter(Boolean).join(', ')],
        ['City / State', [ship.city, ship.state].filter(Boolean).join(', ')],
        ['PIN Code', ship.pincode],
        ['Delivery Date', UI.prettyDate(gift.deliveryDate) || 'As soon as the gift is ready'],
        ['Time Slot', gift.deliverySlot],
        ['Delivery Speed', gift.deliverySpeed || (order.pricing && order.pricing.shippingMode) || 'standard']
      ];
    }

    function giftingRows(order) {
      const gift = order.gifting || {};
      return [
        ['Occasion', gift.occasion],
        ['Gift Message', gift.giftMessage ? '“' + gift.giftMessage + '”' : 'Not added yet'],
        ['Surprise Packaging', gift.isSurprise ? 'Yes — details hidden' : 'No'],
        ['Customization Notes', gift.notes || 'Shared on WhatsApp after payment']
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
        ['Paid On', payment.paymentTime || UI.prettyDateTime(payment.verifiedAt) || '—'],
        ['Amount Charged', UI.money((order.pricing && order.pricing.total) || 0)],
        ['Placed At', UI.prettyDateTime(order.createdAt)]
      ];
    }

    function renderDetail(elementId, rows) {
      const el = document.getElementById(elementId);
      if (!el) return;

      el.innerHTML = rows
        .filter((row) => row[1] !== undefined && row[1] !== null && row[1] !== '')
        .map((row) => `
          <div class="detail-row">
            <span class="detail-label">${UI.escapeHtml(row[0])}</span>
            <span class="detail-value">${UI.escapeHtml(row[1])}</span>
          </div>
        `).join('') || '<p class="summary-tax-note">No details captured.</p>';
    }

    function setText(id, value) {
      const el = document.getElementById(id);
      if (el) el.textContent = value || '';
    }
  });
})();
