/**
 * vrindahampers - My Orders Controller (Phase 5)
 *
 * Real-time order history built on the cheap /userOrders/{uid} index. Every card
 * shows the 11-step dot strip; expanding a card lazily inlines the full tracking
 * timeline plus the local-rider / courier delivery card and subscribes to live
 * RTDB updates for that single order.
 *
 * Customers can raise a cancellation request (stored at /cancellationRequests)
 * which the Super Admin approves or rejects in Phase 6.
 */

(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', () => {
    const UI = window.VrindaCommerceUI;
    const Orders = window.VrindaOrders;

    if (!UI || !Orders) {
      console.error('Orders page: commerce modules failed to load.');
      return;
    }

    const esc = UI.escapeHtml;
    const listHost = document.getElementById('ordersList');
    const expandedIds = new Set();
    const orderCache = {};
    const liveUnsubs = {};
    let pendingCancelOrderId = '';
    let currentProfile = null;
    let stopIndexListener = null;

    window.VrindaAuth.whenReady((user, profile) => {
      if (!user) {
        window.location.href = './login.html?redirect=' + encodeURIComponent('./orders.html');
        return;
      }

      currentProfile = profile || {};
      watchConnection();
      wireCancelDialog();
      wireListActions();

      // Paint instantly from one cheap read, then stay live on the same node.
      Orders.listUserOrderIndex().then(render);
      stopIndexListener = Orders.listenToUserOrders(render);
    });

    /* ------------------------------------------------------------ rendering */

    function render(index) {
      const list = Array.isArray(index) ? index : [];
      UI.hide('ordersLoading');

      if (list.length === 0) {
        UI.show('ordersEmpty', 'block');
        if (listHost) {
          UI.hide(listHost);
          listHost.innerHTML = '';
        }
        expandedIds.clear();
        stopAllLive();
        return;
      }

      UI.hide('ordersEmpty');
      if (!listHost) return;

      UI.show(listHost, 'grid');
      listHost.innerHTML = list.map(orderCardHtml).join('');

      // Re-hydrate any card the customer had open before this update landed.
      expandedIds.forEach((orderId) => {
        const card = cardFor(orderId);
        if (!card) {
          expandedIds.delete(orderId);
          return;
        }
        expandCard(card, orderId);
      });
    }

    function cardFor(orderId) {
      return listHost ? listHost.querySelector('[data-order-id="' + orderId + '"]') : null;
    }

    function orderCardHtml(entry) {
      const orderId = entry.orderId || '';
      const status = entry.status || Orders.STATUS.ORDER_PLACED;
      const cancelState = entry.cancellationStatus || 'none';

      const cancelButton = canRequestCancellation(entry)
        ? `<button type="button" class="btn btn-outline btn-sm js-request-cancel"
                   data-order-id="${esc(orderId)}">Request Cancellation</button>`
        : '';

      return `
        <article class="order-card" data-order-id="${esc(orderId)}">
          <div class="order-card-head">
            <div>
              <div class="order-id">${esc(orderId)}</div>
              <div class="order-date">Placed ${esc(UI.prettyDateTime(entry.createdAt) || 'just now')}</div>
            </div>
            <span class="status-pill ${UI.statusClass(status)}">${esc(status)}</span>
          </div>

          ${UI.timelineStripHtml({ status: status })}

          <div class="order-card-meta" style="margin-top: 1rem;">
            <div><span>Items</span><strong>${esc(entry.itemCount || 0)}</strong></div>
            <div><span>Total</span><strong>${esc(UI.money(entry.total || 0))}</strong></div>
            <div><span>Occasion</span><strong>${esc(entry.occasion || '—')}</strong></div>
            <div><span>Ship to</span><strong>${esc(entry.city || '—')}</strong></div>
          </div>

          <div class="order-card-cancel">${UI.cancellationNoticeHtml({ cancellationStatus: cancelState })}</div>

          <div class="order-card-tabs">
            <button type="button" class="btn btn-primary btn-sm js-toggle-timeline"
                    data-order-id="${esc(orderId)}">Show 11-Step Timeline</button>
            <a href="./order-tracking.html?orderId=${encodeURIComponent(orderId)}"
               class="btn btn-secondary btn-sm">Open Live Tracker</a>
            <a href="${esc(whatsAppFor(entry, 'customer-tracking'))}" target="_blank" rel="noopener noreferrer"
               class="btn btn-whatsapp btn-sm">Ask on WhatsApp</a>
            ${cancelButton}
          </div>

          <div class="order-card-timeline" data-timeline-for="${esc(orderId)}"></div>
        </article>
      `;
    }
    /* -------------------------------------------------------- interactions */

    function wireListActions() {
      if (!listHost) return;

      listHost.addEventListener('click', (event) => {
        const toggle = event.target.closest('.js-toggle-timeline');
        if (toggle) {
          const card = toggle.closest('.order-card');
          const orderId = toggle.getAttribute('data-order-id') || '';
          if (!card || !orderId) return;
          if (card.classList.contains('is-expanded')) collapseCard(card, orderId);
          else expandCard(card, orderId);
          return;
        }

        const cancelBtn = event.target.closest('.js-request-cancel');
        if (cancelBtn) {
          openCancelDialog(cancelBtn.getAttribute('data-order-id') || '');
        }
      });

      // Release the per-order listeners when the tab goes away.
      window.addEventListener('beforeunload', () => {
        stopAllLive();
        if (stopIndexListener) stopIndexListener();
      });
    }

    function watchConnection() {
      const flag = document.getElementById('ordersLiveFlag');
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

    function wireCancelDialog() {
      const dialog = document.getElementById('cancelDialog');
      const form = document.getElementById('cancelForm');
      if (!dialog || !form) return;

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

      form.addEventListener('submit', submitCancellation);
    }

    function openCancelDialog(orderId) {
      const dialog = document.getElementById('cancelDialog');
      if (!dialog || !orderId) return;

      pendingCancelOrderId = orderId;

      const idSlot = document.getElementById('cancelDialogOrderId');
      if (idSlot) idSlot.textContent = orderId;

      UI.notice('cancelDialogNotice', '');

      const submitBtn = document.getElementById('cancelSubmitBtn');
      const cached = orderCache[orderId];

      if (cached && !canRequestCancellation(cached)) {
        if (submitBtn) submitBtn.disabled = true;
        UI.notice('cancelDialogNotice',
          'This order can no longer be cancelled online because it is already cancelled, delivered or pending review. ' +
          'Please message our gifting concierge on WhatsApp for help.', 'warning');
      } else if (submitBtn) {
        submitBtn.disabled = false;
      }

      dialog.classList.add('open');
      dialog.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      if (submitBtn) submitBtn.focus({ preventScroll: true });
    }

    async function submitCancellation(event) {
      event.preventDefault();

      const orderId = pendingCancelOrderId;
      if (!orderId) return;

      const submitBtn = document.getElementById('cancelSubmitBtn');
      const reasonEl = document.querySelector('input[name="cancelReason"]:checked');
      const notesEl = document.getElementById('cancelNotes');

      UI.notice('cancelDialogNotice', '');
      if (submitBtn) UI.setBusy(submitBtn, true, 'Submitting…');

      const result = await Orders.submitCancellationRequest({
        orderId: orderId,
        reason: reasonEl ? reasonEl.value : 'Customer requested cancellation',
        notes: notesEl ? notesEl.value.trim() : '',
        customerName: (currentProfile && currentProfile.name) || '',
        customerPhone: (currentProfile && currentProfile.phone) || ''
      });

      if (submitBtn) UI.setBusy(submitBtn, false, null, 'Submit Request');

      if (!result.success) {
        UI.notice('cancelDialogNotice',
          esc(result.error || 'We could not submit your request. Please try again or message us on WhatsApp.'),
          'error');
        return;
      }

      const followUp = Orders.whatsAppLink({ orderId: orderId }, 'customer-cancellation');

      UI.notice('cancelDialogNotice',
        '<strong>✅ Cancellation request submitted.</strong><br>' +
        'Our Super Admin team will review order ' + esc(orderId) +
        ' and confirm the outcome here and on WhatsApp.<br>' +
        '<a href="' + esc(followUp) + '" target="_blank" rel="noopener noreferrer">Follow up on WhatsApp →</a>',
        'success');

      if (notesEl) notesEl.value = '';
      if (orderCache[orderId]) orderCache[orderId].cancellationStatus = 'requested';

      const card = cardFor(orderId);
      if (card) {
        const cancelHost = card.querySelector('.order-card-cancel');
        if (cancelHost) cancelHost.innerHTML = UI.cancellationNoticeHtml({ cancellationStatus: 'requested' });
        const cancelBtn = card.querySelector('.js-request-cancel');
        if (cancelBtn) cancelBtn.style.display = 'none';
      }
    }

    function closeCancelDialog() {
      const dialog = document.getElementById('cancelDialog');
      if (!dialog) return;

      dialog.classList.remove('open');
      dialog.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      pendingCancelOrderId = '';
    }
    /* --------------------------------------------------- expand / live data */

    function expandCard(card, orderId) {
      if (!card || !orderId) return;
      card.classList.add('is-expanded');
      expandedIds.add(orderId);

      const btn = card.querySelector('.js-toggle-timeline');
      if (btn) btn.textContent = 'Hide Tracking Details';

      refreshCard(card, orderId, true);
      startLive(card, orderId);
    }

    function collapseCard(card, orderId) {
      if (!card || !orderId) return;
      card.classList.remove('is-expanded');
      expandedIds.delete(orderId);
      stopLive(orderId);

      const btn = card.querySelector('.js-toggle-timeline');
      if (btn) btn.textContent = 'Show 11-Step Timeline';
    }

    async function refreshCard(card, orderId, showSpinner) {
      const host = card.querySelector('.order-card-timeline');
      if (!host) return;

      if (showSpinner) {
        host.innerHTML = '<div class="page-loading"><span class="spinner"></span> Loading live tracking…</div>';
      }

      const order = await fetchOrder(orderId);
      if (!order) {
        host.innerHTML = '<p class="secure-note" style="text-align: left;">We could not load live tracking for this order right now. Please refresh, or open the Live Tracker page.</p>';
        return;
      }
      paintTimeline(card, order);
    }

    function paintTimeline(card, order) {
      const host = card.querySelector('.order-card-timeline');
      if (!host) return;

      host.innerHTML =
        UI.timelineHtml(order, { variant: 'full' }) +
        '<div style="margin-top: 1rem;">' + UI.deliveryCardHtml(order) + '</div>';

      const pill = card.querySelector('.status-pill');
      if (pill) {
        pill.className = 'status-pill ' + UI.statusClass(order.status);
        pill.textContent = order.status || '';
      }

      const cancelHost = card.querySelector('.order-card-cancel');
      if (cancelHost) cancelHost.innerHTML = UI.cancellationNoticeHtml(order);

      const cancelBtn = card.querySelector('.js-request-cancel');
      if (cancelBtn) cancelBtn.style.display = canRequestCancellation(order) ? '' : 'none';
    }

    function startLive(card, orderId) {
      stopLive(orderId);
      liveUnsubs[orderId] = Orders.listenToOrder(orderId, (order) => {
        if (!order) return;
        orderCache[orderId] = order;
        paintTimeline(card, order);
      });
    }

    function stopLive(orderId) {
      if (liveUnsubs[orderId]) {
        liveUnsubs[orderId]();
        delete liveUnsubs[orderId];
      }
    }

    function stopAllLive() {
      Object.keys(liveUnsubs).forEach(stopLive);
    }

    async function fetchOrder(orderId) {
      if (!orderId) return null;
      if (orderCache[orderId]) return orderCache[orderId];
      const order = await Orders.getOrder(orderId);
      if (order) orderCache[orderId] = order;
      return order;
    }

    function canRequestCancellation(orderOrEntry) {
      const status = orderOrEntry.status || Orders.STATUS.ORDER_PLACED;
      const cancelState = orderOrEntry.cancellationStatus || 'none';
      return cancelState === 'none' &&
        status !== Orders.STATUS.DELIVERED &&
        status !== Orders.STATUS.CANCELLED;
    }

    function whatsAppFor(entry, context) {
      return Orders.whatsAppLink({
        orderId: entry.orderId,
        status: entry.status,
        items: [],
        pricing: { total: entry.total || 0 },
        customer: {
          name: (currentProfile && currentProfile.name) || '',
          phone: (currentProfile && currentProfile.phone) || ''
        },
        shipping: { city: entry.city || '' },
        gifting: { deliveryDate: '' }
      }, context || 'customer-tracking');
    }




  });
})();
