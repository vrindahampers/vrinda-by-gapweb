/**
 * vrindahampers - Staff Operations Controller (Phase 6)
 * RBAC auth gating, order handling, milestone WhatsApp checklists,
 * rider/courier tracking assignments, and reviews moderation.
 */

(function () {
  'use strict';

  let allOrders = [];
  let allCancellations = [];
  let allReviews = [];
  let activeChecklistOrderId = null;
  // Live-feed health: a refused read and a connection that never answers are
  // different failures, and both used to leave the queue on the "Loading active
  // orders..." row that admin/staff.html ships with.
  let staffOrdersFeedSeen = false;
  let staffOrdersFeedPending = false;
  let staffOrdersLoadError = null;
  let staffOrdersWatchdog = null;

  async function initStaff() {
    if (!window.VrindaAuth) return;

    window.VrindaAuth.whenReady((user, profile) => {
      // Allow superadmin or staff
      const allowed = window.VrindaAuth.requireAdminRole(['superadmin', 'staff'], {
        redirectUrl: window.location.href,
        loginPath: '../pages/login.html',
        homePath: '../index.html'
      });

      if (!allowed) return;

      const appEl = document.getElementById('staffApp');
      if (appEl) appEl.style.display = 'flex';

      const emailEl = document.getElementById('staffUserEmail');
      if (emailEl && user) emailEl.textContent = user.email;

      setupTabs();
      setupListeners();
      setupModals();
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
    // orders..." row for ever.
    if (!window.VrindaOrders) {
      staffOrdersLoadError = 'The order service did not load on this page, so the queue cannot be read. Check that order-service.js is listed before admin-staff-controller.js.';
      staffOrdersFeedPending = false;
      renderStaffOrders();
      console.error('Staff portal: window.VrindaOrders is missing.');
      return;
    }

    // 1. Orders. The rejection callback is the point: until the database rules are
    //    published the Realtime Database refuses this read, and without it the
    //    queue sat on "Loading active orders..." with nothing to explain it.
    staffOrdersFeedPending = true;
    renderStaffOrders();
    attachStaffOrdersFeed();
    armStaffOrdersWatchdog();

    // 2. Cancellations
    window.VrindaOrders.listenToCancellationRequests((requests) => {
      allCancellations = requests;
      renderStaffCancellations();
    }, (err) => {
      console.warn('Staff portal: cancellation feed refused:', (err && (err.code || err.message)) || err);
    });

    // 3. Reviews
    if (window.VrindaCatalog && window.VrindaCatalog.listenToAllReviews) {
      window.VrindaCatalog.listenToAllReviews((reviews) => {
        allReviews = reviews;
        renderStaffReviews();
      });
    }

    const searchInput = document.getElementById('staffSearchInput');
    const statusFilter = document.getElementById('staffStatusFilter');
    searchInput?.addEventListener('input', renderStaffOrders);
    statusFilter?.addEventListener('change', renderStaffOrders);
  }

  /** (Re)subscribe to the orders feed; the failure row's Retry calls this again. */
  function attachStaffOrdersFeed() {
    window.VrindaOrders.listenToAllOrders(handleStaffOrdersSnapshot, handleStaffOrdersFailure);
  }

  function handleStaffOrdersSnapshot(orders) {
    staffOrdersFeedSeen = true;
    staffOrdersFeedPending = false;
    staffOrdersLoadError = null;
    disarmStaffOrdersWatchdog();
    allOrders = orders;
    renderStaffOrders();
  }

  function handleStaffOrdersFailure(err) {
    staffOrdersFeedSeen = true;
    staffOrdersFeedPending = false;
    staffOrdersLoadError = describeFeedFailure('orders', err);
    renderStaffOrders();
  }

  function disarmStaffOrdersWatchdog() {
    if (staffOrdersWatchdog) {
      clearTimeout(staffOrdersWatchdog);
      staffOrdersWatchdog = null;
    }
  }

  /**
   * A blocked realtime connection reports neither a value nor an error, so no
   * callback above can catch it: this is the only guard against a queue that
   * waits for ever.
   */
  function armStaffOrdersWatchdog() {
    disarmStaffOrdersWatchdog();
    staffOrdersWatchdog = setTimeout(() => {
      if (staffOrdersFeedSeen) return;
      staffOrdersFeedPending = false;
      staffOrdersLoadError = 'No answer from the orders feed after 12 seconds, and no refusal either — that usually means the realtime connection is blocked (offline tab, strict network or VPN). Check the browser console, then press Retry.';
      renderStaffOrders();
    }, 12000);
  }

  /** Retry from the failure row, so a transient refusal does not need a reload. */
  function retryStaffOrdersFeed() {
    staffOrdersLoadError = null;
    staffOrdersFeedSeen = false;
    staffOrdersFeedPending = true;
    renderStaffOrders();
    attachStaffOrdersFeed();
    armStaffOrdersWatchdog();
  }

  /** A database rejection, in words an operator can act on. */
  function describeFeedFailure(what, err) {
    const raw = [err && err.code, err && err.message].filter(Boolean).join(' ');
    if (/permission_denied/i.test(raw)) {
      return `Could not load ${what}: PERMISSION_DENIED. Publish the database rules (firebase deploy --only database) and make sure this account holds an operations role, then press Retry.`;
    }
    return `Could not load ${what}: ${raw || 'unknown error'}. Press Retry, and check the browser console for the full error.`;
  }

  /** Escaping for text that comes back from the database. */
  function escapeText(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
    ));
  }

  /* ---------------------------------------------------- ORDERS TABLE */
  function renderStaffOrders() {
    const tbody = document.getElementById('staffOrdersTbody');
    if (!tbody) return;

    const query = (document.getElementById('staffSearchInput')?.value || '').toLowerCase().trim();
    const statusFilter = document.getElementById('staffStatusFilter')?.value || 'ALL';

    let filtered = allOrders.filter(o => o.status !== 'Cancelled');
    if (statusFilter !== 'ALL') {
      filtered = filtered.filter(o => o.status === statusFilter);
    }

    if (query) {
      filtered = filtered.filter(o => {
        const id = (o.orderId || '').toLowerCase();
        const name = recipientName(o).toLowerCase();
        const phone = recipientPhone(o).toLowerCase();
        return id.includes(query) || name.includes(query) || phone.includes(query);
      });
    }

    if (staffOrdersLoadError) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; padding: 2rem;">
            <div style="color: var(--color-text-muted);">${escapeText(staffOrdersLoadError)}</div>
            <button class="btn btn-xs btn-primary js-retry-orders" style="margin-top: 0.75rem;">↻ Retry</button>
          </td>
        </tr>`;
      bindActionButtons(tbody);
      return;
    }

    // "No active orders matching criteria." on a queue that never loaded is what
    // sent people looking for a filter bug. Say which of the three it is.
    if (!allOrders.length && staffOrdersFeedPending) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--color-text-muted); padding: 2rem;">Waiting for the orders feed…</td></tr>`;
      return;
    }

    if (!allOrders.length) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--color-text-muted); padding: 2rem;">No orders yet — new orders appear here live as soon as they are placed.</td></tr>`;
      return;
    }

    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--color-text-muted); padding: 2rem;">No active orders matching criteria.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(o => {
      const waLink = window.VrindaOrders.getWhatsAppAdminLink(o, 'admin-contact');
      const isLocal = o.delivery?.type === 'local';
      return `
        <tr>
          <td>
            <strong>${o.orderId}</strong>
            <div style="font-size: 11px; color: var(--color-text-muted);">${formatDate(o.createdAt)}</div>
          </td>
          <td>
            <strong>${recipientName(o)}</strong>
            <div style="font-size: 11px; color: var(--color-text-muted);">${recipientPhone(o) || 'No phone'}</div>
            <div style="font-size: 11px; margin-top: 2px;">Deliver to: ${recipientCity(o)} (${recipientPincode(o)})</div>
          </td>
          <td>
            <span class="badge ${isLocal ? 'badge-accent' : 'badge-subtle'}" style="font-size: 10px;">
              ${isLocal ? '🛵 Local Express' : '📦 Courier Partner'}
            </span>
            <div style="font-size: 11px; color: var(--color-text-muted); margin-top: 2px;">
              Slot: ${deliverySlot(o)}
            </div>
          </td>
          <td>
            <span class="badge ${getStatusBadgeClass(o.status)}">${o.status}</span>
          </td>
          <td>
            <div class="admin-action-btns">
              <a href="${waLink}" target="_blank" rel="noopener" class="btn btn-xs btn-outline" style="color: #25d366; border-color: #25d366;">
                💬 WhatsApp
              </a>
              <button class="btn btn-xs btn-primary js-open-checklist" data-order-id="${o.orderId}">
                Checklist
              </button>
              <button class="btn btn-xs btn-glass js-open-assign-delivery" data-order-id="${o.orderId}">
                Assign Rider
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    bindActionButtons(tbody);
  }
  /* ------------------------------------------------- CANCELLATIONS TABLE */
  /**
   * Staff can only monitor cancellation requests - the approve/reject decision
   * lives with the Super Admin portal (see admin-service.js). Staff still get a
   * WhatsApp deep link so they can acknowledge the customer right away.
   */
  function renderStaffCancellations() {
    const tbody = document.getElementById('staffCancellationsTbody');
    if (!tbody) return;

    if (!allCancellations.length) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--color-text-muted); padding: 2rem;">No pending cancellation requests.</td></tr>`;
      return;
    }

    tbody.innerHTML = allCancellations.map(c => {
      // Prefer the live order record (richer customer data); fall back to the request payload.
      const order = allOrders.find(o => o.orderId === c.orderId) || {
        orderId: c.orderId,
        customer: { name: c.customerName, phone: c.customerPhone }
      };
      const waLink = window.VrindaOrders.getWhatsAppAdminLink(order, 'admin-contact');
      const status = (c.status || 'pending').toLowerCase();
      const badgeClass = status === 'approved' ? 'badge-primary' : (status === 'rejected' ? 'badge-error' : 'badge-accent');

      return `
        <tr>
          <td>
            <strong>${c.requestId || 'REQ'}</strong>
            <div style="font-size: 11px; color: var(--color-text-muted);">${formatDate(c.createdAt)}</div>
          </td>
          <td>
            <strong>${c.orderId || '—'}</strong>
            <div style="font-size: 11px; color: var(--color-text-muted);">₹${(c.orderTotal || 0).toLocaleString('en-IN')}</div>
          </td>
          <td style="max-width: 300px;">
            ${c.reason || 'Customer requested cancellation'}
            ${c.notes ? `<div style="font-size: 11px; color: var(--color-text-muted); margin-top: 2px;">Customer note: ${c.notes}</div>` : ''}
          </td>
          <td>
            <span class="badge ${badgeClass}">${status.toUpperCase()}</span>
            ${c.adminNotes ? `<div style="font-size: 11px; color: var(--color-text-muted); margin-top: 4px;">${c.adminNotes}</div>` : ''}
          </td>
          <td>
            <div class="admin-action-btns">
              <a href="${waLink}" target="_blank" rel="noopener" class="btn btn-xs btn-outline" style="color: #25d366; border-color: #25d366;">
                💬 Customer
              </a>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  /* ------------------------------------------------------ REVIEWS TABLE */
  function renderStaffReviews() {
    const tbody = document.getElementById('staffReviewsTbody');
    if (!tbody) return;

    if (!allReviews.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--color-text-muted); padding: 2rem;">No customer reviews yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = allReviews.map(r => `
      <tr>
        <td>
          <strong>${r.productName || 'Product'}</strong>
          <div style="font-size: 11px; color: var(--color-text-muted);">${r.productId || ''}</div>
        </td>
        <td>${r.userName || 'Verified Buyer'}</td>
        <td><span style="color: #f59e0b; font-weight: 700;">★ ${r.rating || 5}</span></td>
        <td style="max-width: 320px;">${r.comment || '—'}</td>
        <td style="font-size: 11px;">${formatDate(r.createdAt)}</td>
        <td>
          <button class="btn btn-xs btn-glass js-staff-delete-review" data-product-id="${r.productId || ''}" data-review-id="${r.id}" style="color: var(--color-error);">
            Delete
          </button>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('.js-staff-delete-review').forEach(btn => {
      btn.addEventListener('click', async () => {
        const pid = btn.getAttribute('data-product-id');
        const rid = btn.getAttribute('data-review-id');
        if (!confirm('Remove this customer review from the storefront?')) return;

        btn.disabled = true;
        const res = await window.VrindaCatalog.deleteReview(pid, rid);
        if (!res.success) {
          alert('Delete error: ' + res.error);
          btn.disabled = false;
        }
      });
    });
  }

  /* ------------------------------------------------- MODALS & ACTIONS */
  function setupModals() {
    // Populate the direct status override dropdown from the canonical 11-step flow.
    const statusSelect = document.getElementById('modalDirectStatusSelect');
    if (statusSelect && window.VrindaOrders) {
      statusSelect.innerHTML = window.VrindaOrders.TIMELINE_STEPS
        .map(s => `<option value="${s.label}">${s.label}</option>`)
        .join('');
    }

    document.getElementById('btnApplyDirectStatus')?.addEventListener('click', async () => {
      if (!activeChecklistOrderId) return;
      const newStatus = document.getElementById('modalDirectStatusSelect').value;
      const notes = prompt('Enter a note for this status change:', `Staff set status to ${newStatus}`);
      if (notes === null) return;

      const res = await window.VrindaOrders.updateOrderStatus(activeChecklistOrderId, newStatus, notes);
      if (res.success) {
        alert(`Order status updated to ${newStatus}`);
        openChecklistModal(activeChecklistOrderId);
      } else {
        alert('Status update error: ' + res.error);
      }
    });

    // Local rider vs national courier field toggle
    document.getElementById('assignDeliveryType')?.addEventListener('change', toggleAssignDeliveryFields);

    document.getElementById('btnSaveDeliveryAssignment')?.addEventListener('click', saveDeliveryAssignment);
  }

  function toggleAssignDeliveryFields() {
    const typeSelect = document.getElementById('assignDeliveryType');
    if (!typeSelect) return;
    const isLocal = typeSelect.value === 'local';

    const localFields = document.getElementById('assignLocalFields');
    const courierFields = document.getElementById('assignCourierFields');
    if (localFields) localFields.style.display = isLocal ? 'grid' : 'none';
    if (courierFields) courierFields.style.display = isLocal ? 'none' : 'flex';
  }

  async function saveDeliveryAssignment() {
    const orderId = document.getElementById('assignOrderId')?.value;
    if (!orderId) return;

    const type = document.getElementById('assignDeliveryType').value;
    const payload = { type: type };

    if (type === 'local') {
      payload.riderName = document.getElementById('assignRiderName').value.trim() || 'Local Express Rider';
      payload.riderPhone = document.getElementById('assignRiderPhone').value.trim() || '9876543210';
      payload.eta = document.getElementById('assignRiderEta').value.trim() || 'Today, Express';
    } else {
      payload.courierName = document.getElementById('assignCourierName').value.trim() || 'India Post';
      payload.trackingNumber = document.getElementById('assignAwbNumber').value.trim() || 'AWB-PENDING';
      payload.trackingUrl = document.getElementById('assignTrackingUrl').value.trim() || 'https://www.indiapost.gov.in/';
    }

    const res = await window.VrindaOrders.assignDelivery(orderId, payload);
    if (res.success) {
      alert('Delivery partner saved — the order is now Assigned To Delivery and visible in the Delivery Hub.');
      document.getElementById('modalAssignDelivery').style.display = 'none';
    } else {
      alert('Assignment failed: ' + res.error);
    }
  }

  function bindActionButtons(container) {
    container.querySelectorAll('.js-open-checklist').forEach(btn => {
      btn.addEventListener('click', () => openChecklistModal(btn.getAttribute('data-order-id')));
    });

    container.querySelectorAll('.js-open-assign-delivery').forEach(btn => {
      btn.addEventListener('click', () => openAssignDeliveryModal(btn.getAttribute('data-order-id')));
    });

    // The failure row's Retry re-subscribes the feed instead of forcing a reload.
    container.querySelectorAll('.js-retry-orders').forEach(btn => {
      btn.addEventListener('click', retryStaffOrdersFeed);
    });
  }

  /* ------------------------------------------------ CHECKLIST MODAL LOGIC */
  function openChecklistModal(orderId) {
    activeChecklistOrderId = orderId;
    const order = allOrders.find(o => o.orderId === orderId);
    if (!order || !window.VrindaAdmin) return;

    const modal = document.getElementById('modalOrderChecklist');
    const titleEl = document.getElementById('checklistModalTitle');
    if (titleEl) titleEl.textContent = `Order Checklist — #${order.orderId}`;

    const infoEl = document.getElementById('checklistModalCustomerInfo');
    if (infoEl) {
      infoEl.innerHTML = `
        <div style="display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
          <div><strong>Customer:</strong> ${recipientName(order)} (${recipientPhone(order) || 'No phone'})</div>
          <div><strong>Status:</strong> <span class="badge ${getStatusBadgeClass(order.status)}">${order.status}</span></div>
        </div>
        <div style="margin-top: 4px; font-size: 12px; color: var(--color-text-muted);">
          <strong>Deliver to:</strong> ${recipientCity(order)} ${recipientPincode(order)} &nbsp;•&nbsp;
          <strong>Slot:</strong> ${deliverySlot(order)}
        </div>
        <div style="margin-top: 2px; font-size: 12px; color: var(--color-text-muted);">
          <strong>Items:</strong> ${(order.items || []).map(i => `${itemQty(i)}x ${itemName(i)}`).join(', ') || '—'}
        </div>
      `;
    }

    const checklistContainer = document.getElementById('checklistItemsList');
    const steps = window.VrindaAdmin.CHECKLIST_STEPS || [];
    const currentChecklist = order.checklist || {};

    if (checklistContainer) {
      checklistContainer.innerHTML = steps.map(step => {
        const item = currentChecklist[step.key] || {};
        const isDone = !!item.done;
        return `
          <div class="checklist-step-item ${isDone ? 'is-done' : ''}">
            <div class="checklist-step-info">
              <input type="checkbox" id="chk_${step.key}" data-step-key="${step.key}" ${isDone ? 'checked' : ''}>
              <div>
                <div class="checklist-step-label">${step.label}</div>
                <div class="checklist-step-meta">
                  ${isDone ? `Completed at: ${formatDate(item.at)}` : `Advances timeline to: <em>${step.status}</em>`}
                </div>
              </div>
            </div>
          </div>
        `;
      }).join('');

      checklistContainer.querySelectorAll('input[type="checkbox"]').forEach(chk => {
        chk.addEventListener('change', async () => {
          const stepKey = chk.getAttribute('data-step-key');
          const isDone = chk.checked;

          chk.disabled = true;
          const res = await window.VrindaAdmin.toggleChecklistStep(orderId, stepKey, isDone);
          chk.disabled = false;

          if (res.success) {
            const updatedOrder = allOrders.find(o => o.orderId === orderId);
            if (updatedOrder) updatedOrder.checklist = res.checklist;
            openChecklistModal(orderId);
          } else {
            alert('Checklist error: ' + res.error);
            chk.checked = !isDone;
          }
        });
      });
    }

    const statusSelect = document.getElementById('modalDirectStatusSelect');
    if (statusSelect) statusSelect.value = order.status;

    if (modal) modal.style.display = 'flex';
  }

  function openAssignDeliveryModal(orderId) {
    const order = allOrders.find(o => o.orderId === orderId);
    if (!order) return;

    document.getElementById('assignOrderId').value = orderId;

    const delivery = order.delivery || {};
    // Local express is the default shape for new orders; only 'courier' switches the form.
    const isLocal = delivery.type !== 'courier';
    document.getElementById('assignDeliveryType').value = isLocal ? 'local' : 'courier';

    document.getElementById('assignRiderName').value = delivery.riderName || '';
    document.getElementById('assignRiderPhone').value = delivery.riderPhone || '';
    document.getElementById('assignRiderEta').value = delivery.eta || '';
    document.getElementById('assignCourierName').value = delivery.courierName || '';
    document.getElementById('assignAwbNumber').value = delivery.trackingNumber || '';
    document.getElementById('assignTrackingUrl').value = delivery.trackingUrl || '';

    toggleAssignDeliveryFields();
    document.getElementById('modalAssignDelivery').style.display = 'flex';
  }

  /* ------------------------------------------------- ORDER SHAPE UTILITIES */
  // Canonical order shape (VrindaOrders.buildOrder) exposes customer / shipping / gifting.
  // `shippingAddress` is only kept as a fallback for early-draft rows in the database.
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
    return (order.gifting && order.gifting.deliverySlot) || legacy.deliverySlot || 'Standard';
  }

  function itemQty(item) {
    return (item && (item.qty || item.quantity)) || 1;
  }

  function itemName(item) {
    return (item && (item.name || item.title)) || 'Item';
  }

  /* ------------------------------------------------------------- UTILITIES */
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

  document.addEventListener('DOMContentLoaded', initStaff);
})();
