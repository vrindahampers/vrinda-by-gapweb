/**
 * vrindahampers - Delivery Manager Hub Controller (Phase 6)
 *
 * Live dispatch queue for delivery managers: rider / courier assignments,
 * ETA & AWB updates, WhatsApp tracking hand-off, and delivery completion.
 * Reads and writes flow through the Phase 5 order service
 * (listenToAllOrders / assignDelivery / updateDeliveryTracking / updateOrderStatus)
 * so the customer's tracking timeline stays in sync automatically.
 */

(function () {
  'use strict';

  // The hub owns everything from "packed, awaiting dispatch" to "out for delivery".
  const ACTIVE_STATUSES = ['Packed', 'Assigned To Delivery', 'Out For Delivery'];
  // Once an order is already dispatched, details are merged in place (never regressed).
  const DISPATCHED_STATUSES = ['Assigned To Delivery', 'Out For Delivery', 'Delivered'];

  let allOrders = [];
  let activeHubOrderId = null;
  // Live-feed health, so a refused or silent read cannot leave the queue on the
  // "Loading active dispatches..." row for ever.
  let hubFeedSeen = false;
  let hubFeedPending = false;
  let hubLoadError = null;
  let hubWatchdog = null;

  async function initDelivery() {
    if (!window.VrindaAuth) return;

    window.VrindaAuth.whenReady((user) => {
      // Super Admin has universal access; delivery managers own this hub.
      const allowed = window.VrindaAuth.requireAdminRole(['superadmin', 'delivery'], {
        redirectUrl: window.location.href,
        loginPath: '../pages/login.html',
        homePath: '../index.html'
      });

      if (!allowed) return;

      const appEl = document.getElementById('deliveryApp');
      if (appEl) appEl.style.display = 'flex';

      const emailEl = document.getElementById('deliveryUserEmail');
      if (emailEl && user) emailEl.textContent = user.email;

      setupTabs();
      setupListeners();
      setupModal();
    }, 4000);
  }

  function setupTabs() {
    const navItems = document.querySelectorAll('.admin-nav-item');
    const sections = document.querySelectorAll('.admin-tab-section');

    navItems.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        navItems.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        sections.forEach(sec => {
          const isActive = sec.id === `tab-${targetTab}`;
          sec.style.display = isActive ? 'block' : 'none';
          sec.classList.toggle('is-active', isActive);
        });
      });
    });
  }

  function setupListeners() {
    // Naming the missing script beats a queue that shows its "Loading active
    // dispatches..." row for ever.
    if (!window.VrindaOrders) {
      hubLoadError = 'The order service did not load on this page, so the dispatch queue cannot be read. Check that order-service.js is listed before admin-delivery-controller.js.';
      hubFeedPending = false;
      renderActiveDeliveries();
      console.error('Delivery hub: window.VrindaOrders is missing.');
      return;
    }

    // The rejection callback is the point: until the database rules are published
    // the Realtime Database refuses this read, and without it the queue sat on
    // "Loading active dispatches..." with nothing to explain it.
    hubFeedPending = true;
    renderActiveDeliveries();
    attachHubFeed();
    armHubWatchdog();

    document.getElementById('deliverySearchInput')?.addEventListener('input', renderActiveDeliveries);
  }

  /** (Re)subscribe to the dispatch feed; the failure row's Retry calls this again. */
  function attachHubFeed() {
    window.VrindaOrders.listenToAllOrders(handleHubSnapshot, handleHubFailure);
  }

  function handleHubSnapshot(orders) {
    hubFeedSeen = true;
    hubFeedPending = false;
    hubLoadError = null;
    disarmHubWatchdog();
    allOrders = orders;
    renderActiveDeliveries();
    renderCompletedDeliveries();
  }

  function handleHubFailure(err) {
    hubFeedSeen = true;
    hubFeedPending = false;
    hubLoadError = describeFeedFailure(err);
    renderActiveDeliveries();
  }

  function disarmHubWatchdog() {
    if (hubWatchdog) {
      clearTimeout(hubWatchdog);
      hubWatchdog = null;
    }
  }

  /**
   * A blocked realtime connection reports neither a value nor an error, so no
   * callback above can catch it: this is the only guard against a queue that
   * waits for ever.
   */
  function armHubWatchdog() {
    disarmHubWatchdog();
    hubWatchdog = setTimeout(() => {
      if (hubFeedSeen) return;
      hubFeedPending = false;
      hubLoadError = 'No answer from the dispatch feed after 12 seconds, and no refusal either — that usually means the realtime connection is blocked (offline tab, strict network or VPN). Check the browser console, then press Retry.';
      renderActiveDeliveries();
    }, 12000);
  }

  /** Retry from the failure row, so a transient refusal does not need a reload. */
  function retryHubFeed() {
    hubLoadError = null;
    hubFeedSeen = false;
    hubFeedPending = true;
    renderActiveDeliveries();
    attachHubFeed();
    armHubWatchdog();
  }

  /** A database rejection, in words a delivery manager can act on. */
  function describeFeedFailure(err) {
    const raw = [err && err.code, err && err.message].filter(Boolean).join(' ');
    if (/permission_denied/i.test(raw)) {
      return `Could not load dispatches: PERMISSION_DENIED. Publish the database rules (firebase deploy --only database) and make sure this account holds an operations role, then press Retry.`;
    }
    return `Could not load dispatches: ${raw || 'unknown error'}. Press Retry, and check the browser console for the full error.`;
  }

  /** Escaping for text that comes back from the database. */
  function escapeText(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
    ));
  }

  /* --------------------------------------------------- ACTIVE DISPATCH QUEUE */
  function renderActiveDeliveries() {
    const tbody = document.getElementById('activeDeliveriesTbody');
    if (!tbody) return;

    const query = (document.getElementById('deliverySearchInput')?.value || '').toLowerCase().trim();

    let filtered = allOrders.filter(o => ACTIVE_STATUSES.includes(o.status));

    if (query) {
      filtered = filtered.filter(o => {
        const delivery = o.delivery || {};
        const haystack = [
          o.orderId,
          recipientName(o),
          recipientPhone(o),
          recipientCity(o),
          delivery.riderName,
          delivery.riderPhone,
          delivery.courierName,
          delivery.trackingNumber
        ].join(' ').toLowerCase();
        return haystack.includes(query);
      });
    }

    if (hubLoadError) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 2rem;">
            <div style="color: var(--color-text-muted);">${escapeText(hubLoadError)}</div>
            <button class="btn btn-xs btn-primary js-retry-orders" style="margin-top: 0.75rem;">↻ Retry</button>
          </td>
        </tr>`;
      bindRowActions(tbody);
      return;
    }

    // An empty queue, a queue that has not loaded yet and a filter that matches
    // nothing are three different answers, and only one of them is good news.
    if (!allOrders.length && hubFeedPending) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--color-text-muted); padding: 2rem;">Waiting for the dispatch feed…</td></tr>`;
      return;
    }

    if (!allOrders.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--color-text-muted); padding: 2rem;">No dispatches in transit right now. Orders appear here once they are Packed.</td></tr>`;
      return;
    }

    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--color-text-muted); padding: 2rem;">No dispatches in transit right now. Orders appear here once they are Packed.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(o => {
      const delivery = o.delivery || {};
      const isLocal = delivery.type !== 'courier';
      const waLink = window.VrindaOrders.getWhatsAppAdminLink(o, 'admin-delivery-update');
      const partnerBlock = isLocal
        ? `
          <strong>${delivery.riderName || 'Unassigned'}</strong>
          <div style="font-size: 11px; color: var(--color-text-muted);">${delivery.riderPhone || 'No rider phone'}</div>
          <div style="font-size: 11px; color: var(--color-text-muted);">ETA: ${delivery.eta || 'Not set'}</div>
        `
        : `
          <strong>${delivery.courierName || 'Unassigned'}</strong>
          <div style="font-size: 11px; color: var(--color-text-muted);">AWB: ${delivery.trackingNumber || 'Not generated'}</div>
          ${delivery.trackingUrl ? `<a href="${delivery.trackingUrl}" target="_blank" rel="noopener" style="font-size: 11px; word-break: break-all;">Track shipment ↗</a>` : ''}
        `;

      return `
        <tr>
          <td>
            <strong>${o.orderId}</strong>
            <div style="font-size: 11px; color: var(--color-text-muted);">${formatDate(o.createdAt)}</div>
          </td>
          <td>
            <strong>${recipientName(o)}</strong>
            <div style="font-size: 11px; color: var(--color-text-muted);">${recipientPhone(o) || 'No phone'}</div>
            <div style="font-size: 11px; color: var(--color-text-muted);">${recipientCity(o)} ${recipientPincode(o)}</div>
          </td>
          <td style="font-size: 12px;">
            ${deliverySlot(o)}
            <div style="font-size: 11px; color: var(--color-text-muted);">${o.gifting && o.gifting.deliveryDate ? o.gifting.deliveryDate : 'Date not set'}</div>
          </td>
          <td>
            <span class="badge ${isLocal ? 'badge-accent' : 'badge-subtle'}" style="font-size: 10px;">
              ${isLocal ? '🛵 Local Express' : '📦 Courier'}
            </span>
            <div style="margin-top: 4px;">${partnerBlock}</div>
          </td>
          <td>
            <span class="badge ${getStatusBadgeClass(o.status)}">${o.status}</span>
          </td>
          <td>
            <div class="admin-action-btns">
              <button class="btn btn-xs btn-primary js-hub-update" data-order-id="${o.orderId}">
                Update Tracking
              </button>
              ${o.status === 'Out For Delivery' ? `
                <button class="btn btn-xs btn-outline js-hub-deliver" data-order-id="${o.orderId}">
                  ✅ Mark Delivered
                </button>
              ` : ''}
              <a href="${waLink}" target="_blank" rel="noopener" class="btn btn-xs btn-glass" style="color: #25d366;">
                💬 Share
              </a>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    bindRowActions(tbody);
  }

  /* ---------------------------------------------------- COMPLETED ARCHIVE */
  function renderCompletedDeliveries() {
    const tbody = document.getElementById('completedDeliveriesTbody');
    if (!tbody) return;

    const delivered = allOrders.filter(o => o.status === 'Delivered');

    if (!delivered.length) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--color-text-muted); padding: 2rem;">No delivered orders yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = delivered.map(o => {
      const delivery = o.delivery || {};
      const isLocal = delivery.type !== 'courier';
      const partner = isLocal ? (delivery.riderName || 'Local Express') : (delivery.courierName || 'Courier Partner');

      return `
        <tr>
          <td><strong>${o.orderId}</strong></td>
          <td>
            ${recipientName(o)}
            <div style="font-size: 11px; color: var(--color-text-muted);">${recipientCity(o)} ${recipientPincode(o)}</div>
          </td>
          <td>
            <span class="badge ${isLocal ? 'badge-accent' : 'badge-subtle'}" style="font-size: 10px;">
              ${isLocal ? '🛵 Local Express' : '📦 Courier'}
            </span>
            <div style="font-size: 11px; color: var(--color-text-muted); margin-top: 2px;">${partner}</div>
            ${!isLocal && delivery.trackingNumber ? `<div style="font-size: 11px; color: var(--color-text-muted);">AWB: ${delivery.trackingNumber}</div>` : ''}
          </td>
          <td style="font-size: 12px;">${formatDate(deliveredAt(o))}</td>
          <td><span class="badge badge-success">Delivered</span></td>
        </tr>
      `;
    }).join('');
  }

  /* --------------------------------------------------------- ROW ACTIONS */
  function bindRowActions(container) {
    container.querySelectorAll('.js-hub-update').forEach(btn => {
      btn.addEventListener('click', () => openHubModal(btn.getAttribute('data-order-id')));
    });

    container.querySelectorAll('.js-hub-deliver').forEach(btn => {
      btn.addEventListener('click', async () => {
        const orderId = btn.getAttribute('data-order-id');
        if (!confirm(`Confirm that order ${orderId} has been handed over to the recipient?`)) return;

        btn.disabled = true;
        btn.textContent = 'Saving...';

        const res = await window.VrindaOrders.updateOrderStatus(orderId, 'Delivered', 'Delivery Hub: handed over to recipient');
        if (res.success) {
          alert(`Order ${orderId} marked as Delivered.`);
        } else {
          alert('Could not mark delivered: ' + res.error);
          btn.disabled = false;
          btn.textContent = '✅ Mark Delivered';
        }
      });
    });

    // The failure row's Retry re-subscribes the feed instead of forcing a reload.
    container.querySelectorAll('.js-retry-orders').forEach(btn => {
      btn.addEventListener('click', retryHubFeed);
    });
  }

  /* ------------------------------------------------------ TRACKING MODAL */
  function setupModal() {
    document.getElementById('hubDeliveryType')?.addEventListener('change', toggleHubFields);
    document.getElementById('btnSaveHubDelivery')?.addEventListener('click', saveHubTracking);
  }

  function toggleHubFields() {
    const typeSelect = document.getElementById('hubDeliveryType');
    if (!typeSelect) return;
    const isLocal = typeSelect.value === 'local';

    const localFields = document.getElementById('hubLocalFields');
    const courierFields = document.getElementById('hubCourierFields');
    if (localFields) localFields.style.display = isLocal ? 'grid' : 'none';
    if (courierFields) courierFields.style.display = isLocal ? 'none' : 'flex';
  }

  function openHubModal(orderId) {
    const order = allOrders.find(o => o.orderId === orderId);
    if (!order) return;

    activeHubOrderId = orderId;

    const idField = document.getElementById('hubOrderId');
    if (idField) idField.value = orderId;

    const delivery = order.delivery || {};
    const isLocal = delivery.type !== 'courier';
    document.getElementById('hubDeliveryType').value = isLocal ? 'local' : 'courier';

    document.getElementById('hubRiderName').value = delivery.riderName || '';
    document.getElementById('hubRiderPhone').value = delivery.riderPhone || '';
    document.getElementById('hubRiderEta').value = delivery.eta || '';
    document.getElementById('hubCourierName').value = delivery.courierName || '';
    document.getElementById('hubAwbNumber').value = delivery.trackingNumber || '';
    document.getElementById('hubTrackingUrl').value = delivery.trackingUrl || '';

    // Pre-select the next logical milestone so a manager can advance with one click.
    const statusSelect = document.getElementById('hubStatusAdvance');
    if (statusSelect) {
      if (order.status === 'Packed') statusSelect.value = 'Assigned To Delivery';
      else if (order.status === 'Assigned To Delivery') statusSelect.value = 'Out For Delivery';
      else statusSelect.value = 'Delivered';
    }

    toggleHubFields();
    document.getElementById('modalDeliveryTrackingUpdate').style.display = 'flex';
  }

  async function saveHubTracking() {
    const orderId = document.getElementById('hubOrderId')?.value || activeHubOrderId;
    if (!orderId) return;

    const order = allOrders.find(o => o.orderId === orderId) || {};
    const type = document.getElementById('hubDeliveryType').value;
    const advanceTo = document.getElementById('hubStatusAdvance').value;

    const payload = { type: type };
    if (type === 'local') {
      payload.riderName = document.getElementById('hubRiderName').value.trim() || 'Local Express Rider';
      payload.riderPhone = document.getElementById('hubRiderPhone').value.trim() || '';
      payload.eta = document.getElementById('hubRiderEta').value.trim() || 'Today';
    } else {
      payload.courierName = document.getElementById('hubCourierName').value.trim() || 'Courier Partner';
      payload.trackingNumber = document.getElementById('hubAwbNumber').value.trim() || '';
      payload.trackingUrl = document.getElementById('hubTrackingUrl').value.trim() || '';
    }

    const saveBtn = document.getElementById('btnSaveHubDelivery');
    const saveLabel = saveBtn ? saveBtn.textContent : '';
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
    }

    const restoreBtn = () => {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = saveLabel;
      }
    };

    // A Packed order still needs the "Assigned To Delivery" history entry, so it goes through
    // assignDelivery(). Orders already on the road only have their rider/courier data merged,
    // which keeps their live status from ever regressing.
    const alreadyDispatched = DISPATCHED_STATUSES.includes(order.status);
    const detailsRes = alreadyDispatched
      ? await window.VrindaOrders.updateDeliveryTracking(orderId, payload)
      : await window.VrindaOrders.assignDelivery(orderId, payload);

    if (!detailsRes.success) {
      alert('Could not save delivery details: ' + detailsRes.error);
      restoreBtn();
      return;
    }

    // assignDelivery() lands Packed orders on "Assigned To Delivery"; otherwise keep the current status.
    let finalStatus = alreadyDispatched ? order.status : 'Assigned To Delivery';
    let skippedAdvance = false;

    const flow = (window.VrindaOrders && window.VrindaOrders.STATUS_FLOW) || [];
    const fromIdx = flow.indexOf(finalStatus);
    const toIdx = flow.indexOf(advanceTo);

    if (fromIdx !== -1 && toIdx > fromIdx) {
      const statusRes = await window.VrindaOrders.updateOrderStatus(orderId, advanceTo, `Delivery Hub: marked ${advanceTo}`);
      if (!statusRes.success) {
        alert('Delivery details saved, but the status update failed: ' + statusRes.error);
        restoreBtn();
        return;
      }
      finalStatus = advanceTo;
    } else if (toIdx !== -1 && toIdx <= fromIdx) {
      skippedAdvance = true;
    }

    restoreBtn();
    document.getElementById('modalDeliveryTrackingUpdate').style.display = 'none';

    alert(skippedAdvance
      ? `Dispatch details saved. Order ${orderId} stays at ${finalStatus} (already at or past ${advanceTo}).`
      : `Dispatch updated — order ${orderId} is now ${finalStatus}. The customer's tracking timeline has been refreshed.`);
  }

  /* ------------------------------------------------- ORDER SHAPE UTILITIES */
  // Canonical order shape (VrindaOrders.buildOrder) exposes customer / shipping / gifting.
  function recipientName(order) {
    const legacy = order.shippingAddress || {};
    return (order.customer && order.customer.name) || legacy.fullName || legacy.name || 'Customer';
  }

  function recipientPhone(order) {
    const legacy = order.shippingAddress || {};
    return (order.customer && order.customer.phone) || legacy.phone || '';
  }

  function recipientCity(order) {
    const legacy = order.shippingAddress || {};
    return (order.shipping && order.shipping.city) || legacy.city || 'India';
  }

  function recipientPincode(order) {
    const legacy = order.shippingAddress || {};
    return (order.shipping && order.shipping.pincode) || legacy.pincode || '';
  }

  function deliverySlot(order) {
    const legacy = order.shippingAddress || {};
    return (order.gifting && order.gifting.deliverySlot) || legacy.deliverySlot || 'Standard Slot';
  }

  /* ------------------------------------------------------------- UTILITIES */
  // Delivered timestamp = the last 'Delivered' entry in statusHistory, with safe fallbacks.
  function deliveredAt(order) {
    const history = Array.isArray(order.statusHistory) ? order.statusHistory : [];
    const deliveredEntry = history.filter(h => h && h.status === 'Delivered').pop();
    if (deliveredEntry && deliveredEntry.at) return deliveredEntry.at;
    return (order.delivery && order.delivery.updatedAt) || order.updatedAt || order.createdAt;
  }

  function formatDate(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function getStatusBadgeClass(status) {
    if (status === 'Delivered') return 'badge-success';
    if (status === 'Cancelled') return 'badge-error';
    if (['Assigned To Delivery', 'Out For Delivery'].includes(status)) return 'badge-accent';
    return 'badge-new';
  }

  document.addEventListener('DOMContentLoaded', initDelivery);
})();

