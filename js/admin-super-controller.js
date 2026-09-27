/**
 * vrindahampers - Super Admin Controller (Phase 6)
 * RBAC auth gating, statistics dashboard, 11-step order management,
 * editable WhatsApp checklist, cancellation approvals/rejections,
 * product catalog CRUD, reviews moderation, coupons, and staff role assignments.
 */

(function () {
  'use strict';

  let allOrders = [];
  let allUsers = [];
  let allReviews = [];
  let allCoupons = [];
  let allCancellations = [];
  let activeChecklistOrderId = null;
  let staffLoadError = null;
  let editingCouponCode = null;
  let allCustomRequests = [];
  let customLoadError = null;
  let allFaqs = [];
  let faqLoadError = null;
  let editingFaqId = null;

  async function initSuperAdmin() {
    if (!window.VrindaAuth) return;

    // RBAC Gate check
    window.VrindaAuth.whenReady((user, profile) => {
      const allowed = window.VrindaAuth.requireAdminRole('superadmin', {
        redirectUrl: window.location.href,
        loginPath: '../pages/login.html',
        homePath: '../index.html'
      });

      if (!allowed) return;

      const appEl = document.getElementById('adminApp');
      if (appEl) appEl.style.display = 'flex';

      const emailEl = document.getElementById('adminUserEmail');
      if (emailEl && user) emailEl.textContent = user.email;

      setupTabs();
      setupListeners();
      setupModals();
    }, 4000);
  }

  /* ------------------------------------------------------------- TAB ROUTING */
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

  /* -------------------------------------------------------- REAL-TIME SUBSCRIBERS */
  function setupListeners() {
    if (!window.VrindaOrders || !window.VrindaAdmin) return;

    // 1. Orders listener
    window.VrindaOrders.listenToAllOrders((orders) => {
      allOrders = orders;
      renderStats();
      renderRecentOrders();
      renderOrdersTable();
    });

    // 2. Cancellation Requests listener
    window.VrindaOrders.listenToCancellationRequests((requests) => {
      allCancellations = requests;
      renderCancellationsTable();
    });

    // 3. Users listener (RBAC table). onError surfaces permission problems
    //    instead of leaving the table on "Loading team members..." forever.
    window.VrindaAdmin.listenToUsers((users) => {
      staffLoadError = null;
      allUsers = users;
      renderStats();
      renderStaffTable();
    }, () => {
      staffLoadError = 'Could not load users. Publish the database rules first:\nfirebase deploy --only database';
      renderStaffTable();
    });

    // 4. Reviews listener
    if (window.VrindaCatalog && window.VrindaCatalog.listenToAllReviews) {
      window.VrindaCatalog.listenToAllReviews((reviews) => {
        allReviews = reviews;
        renderStats();
        renderReviewsTable();
      });
    }

    // 5. Coupons listener
    if (window.VrindaStore && window.VrindaStore.listenToCoupons) {
      window.VrindaStore.listenToCoupons((coupons) => {
        allCoupons = coupons;
        renderCouponsTable();
      });
    }

    // 6. Custom Studio designs
    if (window.VrindaAdmin && window.VrindaAdmin.listenToCustomRequests) {
      window.VrindaAdmin.listenToCustomRequests((requests) => {
        allCustomRequests = requests;
        renderCustomRequestsTable();
      }, () => {
        customLoadError = 'Could not load Custom Studio designs. Publish the database rules first:\nfirebase deploy --only database';
        renderCustomRequestsTable();
      });
    }

    // 7. FAQs (homepage content)
    if (window.VrindaAdmin && window.VrindaAdmin.listenToFaqs) {
      window.VrindaAdmin.listenToFaqs((faqs) => {
        allFaqs = faqs;
        renderFaqsTable();
      }, () => {
        faqLoadError = 'Could not load FAQs. Publish the database rules first:\nfirebase deploy --only database';
        renderFaqsTable();
      });
    }

    // 8. Products initial load
    loadProducts();

    // 9. Settings initial load
    loadSettings();

    // Filters and Search
    const searchInput = document.getElementById('orderSearchInput');
    const statusFilter = document.getElementById('orderStatusFilter');
    const unverifiedToggle = document.getElementById('orderUnverifiedOnly');
    searchInput?.addEventListener('input', () => renderOrdersTable());
    statusFilter?.addEventListener('change', () => renderOrdersTable());
    unverifiedToggle?.addEventListener('change', () => renderOrdersTable());

    document.getElementById('btnRefreshStats')?.addEventListener('click', () => {
      renderStats();
      alert('Stats recalculated!');
    });
  }
  /* ------------------------------------------------------------- STATS RENDERING */
  function renderStats() {
    if (!window.VrindaAdmin) return;
    const stats = window.VrindaAdmin.computeStats(allOrders, allUsers, allReviews);

    const revEl = document.getElementById('statRevenue');
    const totEl = document.getElementById('statTotalOrders');
    const actEl = document.getElementById('statActiveOrders');
    const custEl = document.getElementById('statCustomers');
    const delEl = document.getElementById('statDelivered');

    if (revEl) revEl.textContent = '₹' + stats.totalRevenue.toLocaleString('en-IN');
    if (totEl) totEl.textContent = stats.totalOrders;
    if (actEl) actEl.textContent = stats.activeOrders;
    if (custEl) custEl.textContent = stats.totalCustomers;
    if (delEl) delEl.textContent = `${stats.deliveredOrders} Delivered (${stats.cancelledOrders} Cancelled)`;
  }

  /* ----------------------------------------------------------- RECENT ORDERS */
  function renderRecentOrders() {
    const tbody = document.getElementById('recentOrdersTbody');
    if (!tbody) return;

    const inFlight = allOrders.filter(o => o.status !== 'Delivered' && o.status !== 'Cancelled').slice(0, 5);
    if (!inFlight.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--color-text-muted); padding: 1.5rem;">No active orders requiring immediate preparation.</td></tr>`;
      return;
    }

    tbody.innerHTML = inFlight.map(o => {
      const waLink = window.VrindaOrders.getWhatsAppAdminLink(o, 'admin-contact');
      return `
        <tr>
          <td>
            <strong>${o.orderId}</strong>
            <div style="font-size: 11px; color: var(--color-text-muted);">${formatDate(o.createdAt)}</div>
          </td>
          <td>
            ${recipientName(o)}
            <div style="font-size: 11px; color: var(--color-text-muted);">${recipientPhone(o) || 'No phone'}</div>
          </td>
          <td>
            <span class="badge ${o.delivery?.type === 'local' ? 'badge-accent' : 'badge-subtle'}" style="font-size: 10px;">
              ${o.delivery?.type === 'local' ? '🛵 Local Express' : '📦 Courier'}
            </span>
            <div style="font-size: 11px; color: var(--color-text-muted);">${deliverySlot(o)}</div>
          </td>
          <td><strong>₹${(o.pricing?.total || 0).toLocaleString('en-IN')}</strong></td>
          <td><span class="badge ${getStatusBadgeClass(o.status)}">${o.status}</span></td>
          <td>
            <div class="admin-action-btns">
              <a href="${waLink}" target="_blank" rel="noopener" class="btn btn-xs btn-outline" style="color: #25d366; border-color: #25d366;">
                💬 WhatsApp
              </a>
              <button class="btn btn-xs btn-primary js-open-checklist" data-order-id="${o.orderId}">
                Checklist
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    bindActionButtons(tbody);
  }
  /* ----------------------------------------------------------- FULL ORDERS TABLE */
  function renderOrdersTable() {
    const tbody = document.getElementById('ordersTbody');
    if (!tbody) return;

    const query = (document.getElementById('orderSearchInput')?.value || '').toLowerCase().trim();
    const statusFilter = document.getElementById('orderStatusFilter')?.value || 'ALL';
    const unverifiedOnly = !!document.getElementById('orderUnverifiedOnly')?.checked;

    let filtered = allOrders;

    // Spark-plan workflow: the gateway cannot be verified from a browser, so the
    // admin triages exactly those orders here and confirms each one in FamPay.
    if (unverifiedOnly) {
      filtered = filtered.filter(o => o.payment && o.payment.verified === false);
    }

    if (statusFilter === 'ACTIVE') {
      filtered = filtered.filter(o => o.status !== 'Delivered' && o.status !== 'Cancelled');
    } else if (statusFilter !== 'ALL') {
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

    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--color-text-muted); padding: 2rem;">No orders match the selected filters.</td></tr>`;
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
            <div style="font-size: 11px; margin-top: 2px;">Items: ${(o.items || []).length}</div>
            ${(o.payment && o.payment.verified === false) ? `
              <div style="font-size: 11px; margin-top: 4px;">
                <span class="badge badge-error" title="${escapeText(o.payment.verificationNote || '')}">⚠️ Payment unverified</span>
                ${o.payment.utr ? `<div style="color: var(--color-text-muted);">UTR: ${o.payment.utr}</div>` : ''}
              </div>` : ''}
          </td>
          <td>
            <strong>${recipientName(o)}</strong>
            <div style="font-size: 11px; color: var(--color-text-muted);">${recipientPhone(o) || 'No phone'}</div>
            <div style="font-size: 11px; color: var(--color-text-muted);">${recipientCity(o)} ${recipientPincode(o)}</div>
            <a href="${waLink}" target="_blank" rel="noopener" style="font-size: 11px; color: #25d366; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; margin-top: 2px;">
              <span>💬</span> Chat on WhatsApp
            </a>
          </td>
          <td>
            <span class="badge ${isLocal ? 'badge-accent' : 'badge-subtle'}" style="font-size: 10px;">
              ${isLocal ? '🛵 Local Express' : '📦 Courier Partner'}
            </span>
            <div style="font-size: 11px; color: var(--color-text-muted); margin-top: 2px;">
              Slot: ${deliverySlot(o)}
            </div>
            ${isLocal ? `
              <div style="font-size: 11px; color: var(--color-text-muted);">Rider: ${o.delivery?.riderName || 'Not assigned'}</div>
            ` : `
              <div style="font-size: 11px; color: var(--color-text-muted);">AWB: ${o.delivery?.trackingNumber || 'Not generated'}</div>
            `}
          </td>
          <td>
            <strong>₹${(o.pricing?.total || 0).toLocaleString('en-IN')}</strong>
            <div style="font-size: 10px; color: var(--color-success);">${o.payment?.status || 'PAID'}</div>
          </td>
          <td>
            <span class="badge ${getStatusBadgeClass(o.status)}">${o.status}</span>
            ${o.cancellationStatus === 'requested' ? `
              <span class="badge badge-error" style="display: block; margin-top: 4px; font-size: 10px;">Cancel Requested</span>
            ` : ''}
          </td>
          <td>
            <div class="admin-action-btns">
              <button class="btn btn-xs btn-primary js-open-checklist" data-order-id="${o.orderId}">
                Milestone Checklist
              </button>
              <button class="btn btn-xs btn-outline js-open-assign-delivery" data-order-id="${o.orderId}">
                Assign Delivery
              </button>
              ${(o.payment && o.payment.verified === false) ? `
                <button class="btn btn-xs btn-glass js-verify-payment" data-order-id="${o.orderId}" style="color: var(--color-primary-dark);">
                  ✓ Mark Paid
                </button>` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.js-verify-payment').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const orderId = btn.getAttribute('data-order-id');
        if (!confirm('Mark the payment on order ' + orderId + ' as received?\n\nOnly after confirming it in your FamPay dashboard (UTR / transaction id).')) return;
        const res = await window.VrindaAdmin.markPaymentVerified(orderId, 'Confirmed manually in the admin portal.');
        alert(res.success ? 'Payment marked as verified.' : 'Could not update the order: ' + res.error);
      });
    });

    bindActionButtons(tbody);
  }
  /* ---------------------------------------------------- CANCELLATIONS TABLE */
  function renderCancellationsTable() {
    const tbody = document.getElementById('cancellationsTbody');
    const badge = document.getElementById('cancelBadge');
    if (!tbody) return;

    const pending = allCancellations.filter(c => c.status === 'pending');
    if (badge) {
      if (pending.length > 0) {
        badge.textContent = pending.length;
        badge.style.display = 'inline-block';
      } else {
        badge.style.display = 'none';
      }
    }

    if (!allCancellations.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--color-text-muted); padding: 2rem;">No cancellation requests found.</td></tr>`;
      return;
    }

    tbody.innerHTML = allCancellations.map(c => {
      const isPending = c.status === 'pending';
      return `
        <tr>
          <td><strong>${c.requestId || 'REQ'}</strong></td>
          <td><strong>${c.orderId}</strong></td>
          <td>
            ${c.reason}
            ${c.notes ? `<div style="font-size: 11px; color: var(--color-text-muted);">${c.notes}</div>` : ''}
          </td>
          <td style="font-size: 11px;">${formatDate(c.createdAt)}</td>
          <td>
            <span class="badge ${c.status === 'approved' ? 'badge-primary' : c.status === 'rejected' ? 'badge-error' : 'badge-accent'}">
              ${(c.status || 'pending').toUpperCase()}
            </span>
          </td>
          <td>
            ${isPending ? `
              <div class="admin-action-btns">
                <button class="btn btn-xs btn-primary js-approve-cancel" data-req-id="${c.requestId}" data-order-id="${c.orderId}">
                  Approve (Cancel Order)
                </button>
                <button class="btn btn-xs btn-glass js-reject-cancel" data-req-id="${c.requestId}" data-order-id="${c.orderId}">
                  Reject
                </button>
              </div>
            ` : `
              <span style="font-size: 11px; color: var(--color-text-muted);">${c.adminNotes || 'Resolved'}</span>
            `}
          </td>
        </tr>
      `;
    }).join('');

    // Bind approve / reject actions
    tbody.querySelectorAll('.js-approve-cancel').forEach(btn => {
      btn.addEventListener('click', async () => {
        const reqId = btn.getAttribute('data-req-id');
        const orderId = btn.getAttribute('data-order-id');
        const notes = prompt('Enter notes for cancellation approval (e.g., Refund processed via FamGateway):', 'Cancellation approved by Super Admin');
        if (notes === null) return;

        btn.disabled = true;
        btn.textContent = 'Approving...';
        // approveCancellationRequest(requestId, adminNotes) -> cancels the linked order.
        const res = await window.VrindaOrders.approveCancellationRequest(reqId, notes);
        if (res.success) {
          alert(`Order ${orderId} has been successfully cancelled.`);
        } else {
          alert('Approval error: ' + res.error);
          btn.disabled = false;
          btn.textContent = 'Approve (Cancel Order)';
        }
      });
    });

    tbody.querySelectorAll('.js-reject-cancel').forEach(btn => {
      btn.addEventListener('click', async () => {
        const reqId = btn.getAttribute('data-req-id');
        const orderId = btn.getAttribute('data-order-id');
        const notes = prompt('Reason for rejecting cancellation (e.g. Order already custom packed):', 'Item already personalized and in transit');
        if (notes === null) return;

        btn.disabled = true;
        btn.textContent = 'Rejecting...';
        // rejectCancellationRequest(requestId, adminNotes) -> keeps the order active.
        const res = await window.VrindaOrders.rejectCancellationRequest(reqId, notes);
        if (res.success) {
          alert(`Cancellation request rejected. Order remains active.`);
        } else {
          alert('Rejection error: ' + res.error);
          btn.disabled = false;
          btn.textContent = 'Reject';
        }
      });
    });
  }
  /* ---------------------------------------------------- PRODUCTS CATALOG */
  async function loadProducts() {
    const tbody = document.getElementById('productsTbody');
    if (!tbody || !window.VrindaCatalog) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2rem;">Catalog service unavailable.</td></tr>`;
      return;
    }

    try {
      const products = await window.VrindaCatalog.getAllProducts();
      if (!products.length) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2rem;">No products in the Firebase catalog yet. Click “➕ Add New Product” to create one.</td></tr>`;
        return;
      }
      renderProductRows(products, tbody);
    } catch (err) {
      console.error('Catalog load failed:', err);
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2rem;">Could not load catalog: ${err.message}</td></tr>`;
    }
  }

  function renderProductRows(products, tbody) {
    tbody.innerHTML = products.map(p => `
      <tr>
        <td>
          <div style="display: flex; align-items: center; gap: 10px;">
            <img src="${p.image}" alt="${p.name}" style="width: 36px; height: 36px; border-radius: var(--radius-sm); object-fit: cover;">
            <div>
              <strong>${p.name}</strong>
              <div style="font-size: 11px; color: var(--color-text-muted);">${p.id}${p.active === false ? ' · hidden from storefront' : ''}${p.stock ? ' · stock ' + p.stock : ''}</div>
            </div>
          </div>
        </td>
        <td><span class="badge badge-subtle">${p.category}</span></td>
        <td><strong>₹${(p.price || 0).toLocaleString('en-IN')}</strong>${(p.originalPrice > p.price) ? `<div style="font-size: 11px; color: var(--color-text-muted); text-decoration: line-through;">₹${p.originalPrice.toLocaleString('en-IN')}</div>` : ''}</td>
        <td>${(p.customizable || p.isPersonalized) ? '✅ Yes' : '—'}</td>
        <td>${(p.bestseller || p.isBestSeller) ? '⭐ Yes' : '—'}</td>
        <td>
          <div class="admin-action-btns">
            <button class="btn btn-xs btn-outline js-edit-product" data-product='${JSON.stringify(p).replace(/'/g, "&apos;")}'>
              Edit
            </button>
            <button class="btn btn-xs btn-glass js-delete-product" data-product-id="${p.id}" style="color: var(--color-error);">
              Delete
            </button>
          </div>
        </td>
      </tr>
    `).join('');

    // Bind Edit Product
    tbody.querySelectorAll('.js-edit-product').forEach(btn => {
      btn.addEventListener('click', () => {
        const prod = JSON.parse(btn.getAttribute('data-product'));
        openProductModal(prod);
      });
    });

    // Bind Delete Product
    tbody.querySelectorAll('.js-delete-product').forEach(btn => {
      btn.addEventListener('click', async () => {
        const pid = btn.getAttribute('data-product-id');
        if (!confirm(`Are you sure you want to delete product ${pid}?`)) return;
        const res = await window.VrindaCatalog.deleteProduct(pid);
        if (res.success) {
          alert('Product deleted successfully');
          loadProducts();
        } else {
          alert('Delete error: ' + res.error);
        }
      });
    });
  }

  /* ---------------------------------------------------- REVIEWS TABLE */
  function renderReviewsTable() {
    const tbody = document.getElementById('reviewsTbody');
    if (!tbody) return;

    if (!allReviews.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2rem;">No customer reviews yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = allReviews.map(r => `
      <tr>
        <td><strong>${r.productId}</strong></td>
        <td>${r.userName || 'Verified Buyer'}</td>
        <td><span style="color: #f59e0b; font-weight: 700;">★ ${r.rating || 5}</span></td>
        <td style="max-width: 300px;">${r.comment || '—'}</td>
        <td style="font-size: 11px;">${formatDate(r.createdAt)}</td>
        <td>
          <button class="btn btn-xs btn-glass js-delete-review" data-product-id="${r.productId}" data-review-id="${r.id}" style="color: var(--color-error);">
            Delete
          </button>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('.js-delete-review').forEach(btn => {
      btn.addEventListener('click', async () => {
        const pid = btn.getAttribute('data-product-id');
        const rid = btn.getAttribute('data-review-id');
        if (!confirm('Remove this customer review?')) return;
        await window.VrindaCatalog.deleteReview(pid, rid);
      });
    });
  }

  /* ------------------------------------------------------------- FAQ TABLE */
  function renderFaqsTable() {
    const tbody = document.getElementById('faqTbody');
    if (!tbody) return;

    if (faqLoadError) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 2rem; color: var(--color-error); white-space: pre-line;">${faqLoadError}</td></tr>`;
      return;
    }

    if (!allFaqs.length) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 2rem;">
        No FAQs in Firebase yet. Press “⬇ Import current answers” to bring the existing questions across, then edit them here.
      </td></tr>`;
      return;
    }

    tbody.innerHTML = allFaqs.map((f) => `
      <tr>
        <td>${Number(f.order) || 0}</td>
        <td><strong>${escapeText(f.q)}</strong></td>
        <td style="max-width: 480px; font-size: 12px;">${escapeText(f.a) || '<em style="color: var(--color-text-muted);">No answer yet</em>'}</td>
        <td>${f.active === false ? '<span class="badge badge-subtle">Hidden</span>' : '<span class="badge badge-success">Live</span>'}</td>
        <td>
          <div class="admin-action-btns">
            <button class="btn btn-xs btn-outline js-edit-faq" data-id="${f.id}">Edit</button>
            <button class="btn btn-xs btn-glass js-delete-faq" data-id="${f.id}" style="color: var(--color-error);">Delete</button>
          </div>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('.js-edit-faq').forEach((btn) => {
      btn.addEventListener('click', () => {
        const faq = allFaqs.find((f) => f.id === btn.getAttribute('data-id'));
        if (faq) openFaqModal(faq);
      });
    });

    tbody.querySelectorAll('.js-delete-faq').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const faq = allFaqs.find((f) => f.id === id);
        if (!confirm('Delete this FAQ?\n\n"' + ((faq && faq.q) || '') + '"')) return;
        const res = await window.VrindaAdmin.deleteFaq(id);
        if (!res.success) alert('Delete failed: ' + res.error);
      });
    });
  }

  function escapeText(value) {
    return String(value == null ? '' : value).replace(/[&<>"]/g, (ch) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]
    ));
  }

  function openFaqModal(faq) {
    const modal = document.getElementById('modalFaqForm');
    const title = document.getElementById('faqFormTitle');
    editingFaqId = faq ? faq.id : null;

    if (faq) {
      if (title) title.textContent = 'Edit FAQ';
      document.getElementById('faqFormQ').value = faq.q || '';
      document.getElementById('faqFormA').value = faq.a || '';
      document.getElementById('faqFormOrder').value = faq.order || 0;
      document.getElementById('faqFormActive').checked = faq.active !== false;
    } else {
      if (title) title.textContent = 'Add FAQ';
      document.getElementById('faqFormQ').value = '';
      document.getElementById('faqFormA').value = '';
      document.getElementById('faqFormOrder').value = allFaqs.length + 1;
      document.getElementById('faqFormActive').checked = true;
    }

    if (modal) modal.style.display = 'flex';
  }

  /* ------------------------------------------------ CUSTOM STUDIO REQUESTS */
  const CUSTOM_STATUSES = ['pending-review', 'quote-sent', 'approved', 'crafting', 'delivered', 'declined'];

  function renderCustomRequestsTable() {
    const tbody = document.getElementById('customTbody');
    if (!tbody) return;

    const pending = allCustomRequests.filter((r) => r.status === 'pending-review').length;
    const badge = document.getElementById('customBadge');
    if (badge) {
      badge.style.display = pending ? 'inline-flex' : 'none';
      badge.textContent = String(pending);
    }

    if (customLoadError) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 2rem; color: var(--color-error); white-space: pre-line;">${customLoadError}</td></tr>`;
      return;
    }

    if (!allCustomRequests.length) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 2rem;">No Custom Studio designs submitted yet.</td></tr>`;
      return;
    }

    const nameOf = (uid) => {
      const user = allUsers.find((u) => u.uid === uid);
      return user ? (user.name || user.email || uid) : uid;
    };

    tbody.innerHTML = allCustomRequests.map((r) => {
      const addons = Array.isArray(r.addons) && r.addons.length ? r.addons.join(', ') : 'None';
      const design = `${r.baseLabel || '—'}<div style="font-size: 11px; color: var(--color-text-muted);">${r.palette || ''}${r.note ? ' · “' + r.note + '”' : ''}${addons !== 'None' ? ' · + ' + addons : ''}</div>`;
      return `
        <tr>
          <td style="font-size: 11px;">${formatDate(r.createdAt)}</td>
          <td><strong>${nameOf(r.uid)}</strong><div style="font-size: 11px; color: var(--color-text-muted);">${r.uid}</div></td>
          <td><span class="badge badge-accent">${(r.typeLabel || r.type || '').toUpperCase()}</span></td>
          <td><strong>${r.giftName || '—'}</strong></td>
          <td>${r.occasion || '—'}<div style="font-size: 11px; color: var(--color-text-muted);">${r.recipient || '—'}</div></td>
          <td style="max-width: 320px;">${design}</td>
          <td><strong>₹${Number(r.quotedTotal || r.estimatedTotal || 0).toLocaleString('en-IN')}</strong></td>
          <td>
            <select class="form-select js-custom-status" data-uid="${r.uid}" data-id="${r.id}" style="max-width: 160px; padding: 0.3rem 0.5rem; font-size: 12px;">
              ${CUSTOM_STATUSES.map((s) => `<option value="${s}" ${(r.status || 'pending-review') === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </td>
          <td>
            <div class="admin-action-btns">
              <button class="btn btn-xs btn-outline js-custom-quote" data-uid="${r.uid}" data-id="${r.id}">Quote</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.js-custom-status').forEach((sel) => {
      sel.addEventListener('change', async () => {
        const uid = sel.getAttribute('data-uid');
        const id = sel.getAttribute('data-id');
        const status = sel.value;
        if (status === 'declined' && !confirm('Mark this design as declined?')) {
          renderCustomRequestsTable();
          return;
        }
        const res = await window.VrindaAdmin.updateCustomRequestStatus({ uid: uid, id: id, status: status });
        if (res.success) {
          alert('Design marked as ' + status + '.');
        } else {
          alert('Could not update the design: ' + res.error);
          renderCustomRequestsTable();
        }
      });
    });

    tbody.querySelectorAll('.js-custom-quote').forEach((btn) => {
      btn.addEventListener('click', () => {
        const uid = btn.getAttribute('data-uid');
        const id = btn.getAttribute('data-id');
        const request = allCustomRequests.find((r) => r.uid === uid && r.id === id);
        if (!request) return;
        const quote = prompt('Confirmed quote to send on WhatsApp (₹):', String(request.quotedTotal || request.estimatedTotal || ''));
        if (quote === null) return;
        const note = prompt('Note for the customer / team (optional):', request.adminNote || '');
        if (note === null) return;
        window.VrindaAdmin.updateCustomRequestStatus({
          uid: uid,
          id: id,
          quote: quote,
          note: note,
          status: 'quote-sent'
        }).then((res) => {
          if (res.success) alert('Quote saved and marked as quote-sent.');
          else alert('Could not save the quote: ' + res.error);
        });
      });
    });
  }

  /* ---------------------------------------------------- COUPONS TABLE */
  function renderCouponsTable() {
    const tbody = document.getElementById('couponsTbody');
    if (!tbody) return;

    if (!allCoupons.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2rem;">No coupons configured.</td></tr>`;
      return;
    }

    tbody.innerHTML = allCoupons.map(c => `
      <tr>
        <td><strong>${c.code}</strong></td>
        <td><span class="badge badge-accent">${(c.type || '').toUpperCase()}</span></td>
        <td>${c.type === 'percent' ? `${c.value}% OFF${c.maxDiscount ? ` (max ₹${c.maxDiscount})` : ''}` : c.type === 'flat' ? `₹${c.value} OFF` : 'Free Delivery'}</td>
        <td>${c.minOrder ? `₹${c.minOrder}` : 'No Min'}</td>
        <td>${c.description || '—'}</td>
        <td>
          <div class="admin-action-btns">
            <button class="btn btn-xs btn-outline js-edit-coupon" data-code="${c.code}">
              Edit
            </button>
            <button class="btn btn-xs btn-glass js-delete-coupon" data-code="${c.code}" style="color: var(--color-error);">
              Delete
            </button>
          </div>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('.js-edit-coupon').forEach(btn => {
      btn.addEventListener('click', () => {
        const code = btn.getAttribute('data-code');
        const coupon = allCoupons.find(x => x.code === code);
        if (coupon) openCouponModal(coupon);
      });
    });

    tbody.querySelectorAll('.js-delete-coupon').forEach(btn => {
      btn.addEventListener('click', async () => {
        const code = btn.getAttribute('data-code');
        if (!confirm(`Delete coupon code ${code}?`)) return;
        const res = await window.VrindaStore.deleteCoupon(code);
        if (!res.success) alert('Delete failed: ' + res.error);
      });
    });
  }
  /* ---------------------------------------------------- STAFF & ROLES TABLE */
  function renderStaffTable() {
    const tbody = document.getElementById('staffTbody');
    if (!tbody) return;

    if (staffLoadError) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 2rem; color: var(--color-error); white-space: pre-line;">${staffLoadError}</td></tr>`;
      return;
    }

    if (!allUsers.length) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 2rem;">No registered users in database.</td></tr>`;
      return;
    }

    tbody.innerHTML = allUsers.map(u => {
      const role = u.role || 'customer';
      return `
        <tr>
          <td>
            <strong>${u.name || 'Anonymous User'}</strong>
            <div style="font-size: 11px; color: var(--color-text-muted);">${u.uid}</div>
          </td>
          <td>${u.email || 'No email registered'}</td>
          <td>
            <span class="badge ${role === 'superadmin' ? 'badge-accent' : role === 'staff' ? 'badge-new' : role === 'delivery' ? 'badge-primary' : 'badge-subtle'}">
              ${role.toUpperCase()}
            </span>
          </td>
          <td>
            <select class="form-select js-role-select" data-uid="${u.uid}" style="max-width: 180px; padding: 0.35rem 0.6rem; font-size: 12px;">
              <option value="customer" ${role === 'customer' ? 'selected' : ''}>Customer</option>
              <option value="staff" ${role === 'staff' ? 'selected' : ''}>Staff Admin</option>
              <option value="delivery" ${role === 'delivery' ? 'selected' : ''}>Delivery Manager</option>
              <option value="superadmin" ${role === 'superadmin' ? 'selected' : ''}>Super Admin</option>
            </select>
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.js-role-select').forEach(sel => {
      sel.addEventListener('change', async () => {
        const uid = sel.getAttribute('data-uid');
        const newRole = sel.value;
        const confirmMsg = `Are you sure you want to change user's role to ${newRole.toUpperCase()}?`;
        if (!confirm(confirmMsg)) {
          renderStaffTable();
          return;
        }

        const res = await window.VrindaAdmin.updateUserRole(uid, newRole);
        if (res.success) {
          alert('User role updated successfully');
        } else {
          alert('Role update failed: ' + res.error);
        }
      });
    });
  }

  /* ------------------------------------------------- STORE SETTINGS & SEO */
  function loadSettings() {
    if (!window.VrindaAdmin) return;
    window.VrindaAdmin.listenToSettings((settings) => {
      if (settings.whatsapp) document.getElementById('settingWhatsapp').value = settings.whatsapp;
      if (settings.email) document.getElementById('settingEmail').value = settings.email;
      if (settings.freeShippingThreshold) document.getElementById('settingFreeShipping').value = settings.freeShippingThreshold;
      if (settings.shippingFee) document.getElementById('settingShippingFee').value = settings.shippingFee;
    });

    window.VrindaAdmin.listenToSeo((seo) => {
      if (seo.title) document.getElementById('settingSeoTitle').value = seo.title;
      if (seo.description) document.getElementById('settingSeoDesc').value = seo.description;
    });

    // The announcement bar is part of the same settings record, so it loads here.
    window.VrindaAdmin.listenToSettings((settings) => {
      const a = settings.announcement || {};
      const textEl = document.getElementById('settingAnnouncementText');
      const labelEl = document.getElementById('settingAnnouncementLabel');
      const linkEl = document.getElementById('settingAnnouncementLink');
      const onEl = document.getElementById('settingAnnouncementEnabled');
      if (textEl) textEl.value = a.text || '';
      if (labelEl) labelEl.value = a.linkLabel || '';
      if (linkEl) linkEl.value = a.link || '';
      if (onEl) onEl.checked = a.enabled !== false;
    });

    document.getElementById('btnSaveStoreSettings')?.addEventListener('click', async () => {
      const thresholdRaw = document.getElementById('settingFreeShipping').value.trim();
      const feeRaw = document.getElementById('settingShippingFee').value.trim();

      const settingsPayload = {
        whatsapp: document.getElementById('settingWhatsapp').value.trim(),
        email: document.getElementById('settingEmail').value.trim(),
        freeShippingThreshold: thresholdRaw === '' ? 1499 : Number(thresholdRaw),
        shippingFee: feeRaw === '' ? 99 : Number(feeRaw),
        announcement: {
          enabled: document.getElementById('settingAnnouncementEnabled')?.checked !== false,
          text: (document.getElementById('settingAnnouncementText')?.value || '').trim(),
          linkLabel: (document.getElementById('settingAnnouncementLabel')?.value || '').trim(),
          link: (document.getElementById('settingAnnouncementLink')?.value || '').trim()
        }
      };

      if (Number.isNaN(settingsPayload.freeShippingThreshold) || Number.isNaN(settingsPayload.shippingFee)) {
        alert('Free delivery threshold and shipping fee must be numbers.');
        return;
      }

      const seoPayload = {
        title: document.getElementById('settingSeoTitle').value.trim(),
        description: document.getElementById('settingSeoDesc').value.trim()
      };

      const settingsRes = await window.VrindaAdmin.saveSettings(settingsPayload);
      const seoRes = await window.VrindaAdmin.saveSeo(seoPayload);

      if (!settingsRes.success || !seoRes.success) {
        const err = (settingsRes.error || seoRes.error || 'Unknown error');
        alert('Save failed: ' + err +
          (String(err).includes('Permission') ? '\n\nPublish the database rules first:\nfirebase deploy --only database' : ''));
        return;
      }
      alert('Store settings and SEO saved to Firebase — the storefront picks them up live.');
    });
  }
  /* ---------------------------------------------------- MODALS & ACTIONS */
  function setupModals() {
    // Populate direct status override dropdown
    const statusSelect = document.getElementById('modalDirectStatusSelect');
    if (statusSelect && window.VrindaOrders) {
      const steps = window.VrindaOrders.TIMELINE_STEPS;
      statusSelect.innerHTML = steps.map(s => `<option value="${s.label}">${s.label}</option>`).join('');
    }

    // Direct status update button
    document.getElementById('btnApplyDirectStatus')?.addEventListener('click', async () => {
      if (!activeChecklistOrderId) return;
      const newStatus = document.getElementById('modalDirectStatusSelect').value;
      const notes = prompt('Enter a note for this status change:', `Super Admin set to ${newStatus}`);
      if (notes === null) return;

      const res = await window.VrindaOrders.updateOrderStatus(activeChecklistOrderId, newStatus, notes);
      if (res.success) {
        alert(`Order status updated to ${newStatus}`);
        openChecklistModal(activeChecklistOrderId);
      } else {
        alert('Status update error: ' + res.error);
      }
    });

    // Delivery Assignment type toggle (Local vs Courier)
    const delTypeSelect = document.getElementById('assignDeliveryType');
    delTypeSelect?.addEventListener('change', () => {
      const isLocal = delTypeSelect.value === 'local';
      document.getElementById('assignLocalFields').style.display = isLocal ? 'grid' : 'none';
      document.getElementById('assignCourierFields').style.display = isLocal ? 'none' : 'flex';
    });

    // Save Delivery Assignment
    document.getElementById('btnSaveDeliveryAssignment')?.addEventListener('click', async () => {
      const orderId = document.getElementById('assignOrderId').value;
      const type = document.getElementById('assignDeliveryType').value;

      let payload = { type: type };
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
        alert(`Delivery details assigned and order status advanced to Assigned To Delivery.`);
        document.getElementById('modalAssignDelivery').style.display = 'none';
      } else {
        alert('Assignment failed: ' + res.error);
      }
    });

    // Add New Product modal trigger
    document.getElementById('btnOpenNewProductModal')?.addEventListener('click', () => {
      openProductModal(null);
    });

    // One-shot import of the bundled sample catalog into Firebase /products +
    // /categories. Never overwrites existing rows (pass force only if asked).
    document.getElementById('btnImportSampleCatalog')?.addEventListener('click', async () => {
      if (!confirm('Import the bundled sample catalog into Firebase?\n\nThis only fills EMPTY /products and /categories nodes — products you already manage in the admin portal are left untouched.')) return;

      const btn = document.getElementById('btnImportSampleCatalog');
      if (btn) btn.disabled = true;
      const res = await window.VrindaCatalog.importSampleCatalog();
      if (btn) btn.disabled = false;

      if (!res.success) {
        alert('Import failed: ' + res.error +
          (String(res.error).includes('Permission') ? '\n\nPublish the database rules first:\nfirebase deploy --only database' : ''));
        return;
      }
      const { categories, products } = res.imported;
      alert(categories || products
        ? `Imported ${products} product(s) and ${categories} categor(y/ies) into Firebase.\n\nThe storefront now reads them from Firebase — edits made here are what customers see.`
        : 'Firebase already has a catalog — nothing was imported. Manage your products in this table.');
      loadProducts();
    });

    // Save Product
    document.getElementById('btnSaveProduct')?.addEventListener('click', async () => {
      const id = document.getElementById('prodFormId').value;
      const customizable = document.getElementById('prodFormCustomizable').checked;
      const bestseller = document.getElementById('prodFormBestseller').checked;
      const trending = document.getElementById('prodFormTrending')?.checked || false;
      const isNew = document.getElementById('prodFormNew')?.checked || false;

      const productPayload = {
        name: document.getElementById('prodFormName').value.trim(),
        category: document.getElementById('prodFormCategory').value,
        price: Number(document.getElementById('prodFormPrice').value) || 0,
        image: document.getElementById('prodFormImage').value.trim() || '../assets/images/placeholder.jpg',
        description: document.getElementById('prodFormDesc').value.trim(),
        customizable: customizable,
        bestseller: bestseller,
        // The storefront (homepage grids, category sorts, cart tags) reads the
        // is* names, the admin table reads the short ones — keep both in sync.
        isPersonalized: customizable,
        isBestSeller: bestseller,
        isTrending: trending,
        isNew: isNew
      };

      // The fields the storefront actually reads but the form used to drop,
      // which left admin-created products with no MRP, label, badge or URL.
      const mrp = Number(document.getElementById('prodFormMrp')?.value) || 0;
      productPayload.originalPrice = mrp > 0 ? mrp : productPayload.price;
      const categoryName = document.getElementById('prodFormCategoryName')?.value.trim();
      if (categoryName) productPayload.categoryName = categoryName;
      const badge = document.getElementById('prodFormBadge')?.value.trim();
      if (badge) productPayload.badge = badge;
      const slug = document.getElementById('prodFormSlug')?.value.trim()
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      if (slug) productPayload.slug = slug;
      const stock = Number(document.getElementById('prodFormStock')?.value);
      if (!Number.isNaN(stock) && stock > 0) productPayload.stock = stock;
      const activeEl = document.getElementById('prodFormActive');
      productPayload.active = activeEl ? activeEl.checked : true;

      if (!productPayload.name) {
        alert('Please enter a product name.');
        return;
      }
      if (id) productPayload.id = id;

      const res = await window.VrindaCatalog.saveProduct(productPayload);
      if (res.success) {
        alert('Product saved successfully!');
        document.getElementById('modalProductForm').style.display = 'none';
        loadProducts();
      } else {
        alert('Save error: ' + res.error +
          (String(res.error).includes('Permission') ? '\n\nPublish the database rules first:\nfirebase deploy --only database' : ''));
      }
    });

    // FAQ: create / edit / import
    document.getElementById('btnOpenNewFaqModal')?.addEventListener('click', () => {
      openFaqModal(null);
    });

    document.getElementById('btnSaveFaq')?.addEventListener('click', async () => {
      const payload = {
        id: editingFaqId,
        q: document.getElementById('faqFormQ').value.trim(),
        a: document.getElementById('faqFormA').value.trim(),
        order: Number(document.getElementById('faqFormOrder').value) || 0,
        active: document.getElementById('faqFormActive').checked
      };

      if (!payload.q) {
        alert('Please enter the question.');
        return;
      }

      const res = await window.VrindaAdmin.saveFaq(payload);
      if (!res.success) {
        alert('Could not save the FAQ: ' + res.error);
        return;
      }
      document.getElementById('modalFaqForm').style.display = 'none';
      editingFaqId = null;
      alert('FAQ saved — it is live on the homepage now.');
    });

    document.getElementById('btnImportFaqs')?.addEventListener('click', async () => {
      if (!confirm('Import the current bundled answers into Firebase?\n\nOnly runs when /faqs is empty — anything you have already edited is never overwritten.')) return;
      const res = await window.VrindaAdmin.importSampleFaqs();
      if (!res.success) {
        alert('Import failed: ' + res.error);
        return;
      }
      alert(res.skipped
        ? 'You already have FAQs in Firebase — nothing was imported.'
        : 'Imported ' + res.imported + ' FAQ(s). Edit them below.');
    });

    // Custom Studio refresh button (the table is live; this re-reads on demand)
    document.getElementById('btnRefreshCustom')?.addEventListener('click', () => {
      customLoadError = null;
      renderCustomRequestsTable();
    });

    // Add Coupon modal trigger (reset to create mode)
    document.getElementById('btnOpenNewCouponModal')?.addEventListener('click', () => {
      openCouponModal(null);
    });

    // Save Coupon (create or update an existing one)
    document.getElementById('btnSaveCoupon')?.addEventListener('click', async () => {
      const originalCode = editingCouponCode;
      const existing = originalCode
        ? (allCoupons.find(c => c.code === originalCode) || {})
        : {};

      const couponPayload = Object.assign({}, existing, {
        code: document.getElementById('couponFormCode').value.trim().toUpperCase(),
        type: document.getElementById('couponFormType').value,
        value: Number(document.getElementById('couponFormValue').value) || 0,
        minOrder: Number(document.getElementById('couponFormMin').value) || 0,
        description: document.getElementById('couponFormDesc').value.trim()
      });

      const maxEl = document.getElementById('couponFormMax');
      if (maxEl) {
        const maxVal = Number(maxEl.value) || 0;
        if (maxVal > 0) couponPayload.maxDiscount = maxVal;
        else delete couponPayload.maxDiscount;
      }

      if (!couponPayload.code) {
        alert('Please specify a coupon code.');
        return;
      }

      const res = await window.VrindaStore.saveCoupon(couponPayload);
      if (!res.success) {
        alert('Coupon error: ' + res.error);
        return;
      }

      // Code renamed during an edit -> remove the old key so no duplicate lingers.
      if (originalCode && originalCode !== couponPayload.code) {
        const delRes = await window.VrindaStore.deleteCoupon(originalCode);
        if (!delRes.success) {
          alert('Coupon saved as ' + couponPayload.code + ', but the old code ' + originalCode + ' could not be removed: ' + delRes.error);
        }
      }

      alert(originalCode ? 'Coupon updated successfully!' : 'Coupon created successfully!');
      document.getElementById('modalCouponForm').style.display = 'none';
      editingCouponCode = null;
    });
  }

  function bindActionButtons(container) {
    container.querySelectorAll('.js-open-checklist').forEach(btn => {
      btn.addEventListener('click', () => {
        openChecklistModal(btn.getAttribute('data-order-id'));
      });
    });

    container.querySelectorAll('.js-open-assign-delivery').forEach(btn => {
      btn.addEventListener('click', () => {
        openAssignDeliveryModal(btn.getAttribute('data-order-id'));
      });
    });
  }
  /* --------------------------------------------- CHECKLIST MODAL LOGIC */
  function openChecklistModal(orderId) {
    activeChecklistOrderId = orderId;
    const order = allOrders.find(o => o.orderId === orderId);
    if (!order) return;

    const modal = document.getElementById('modalOrderChecklist');
    document.getElementById('checklistModalTitle').textContent = `Milestone Checklist — #${order.orderId}`;

    const infoEl = document.getElementById('checklistModalCustomerInfo');
    infoEl.innerHTML = `
      <div style="display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
        <div><strong>Customer:</strong> ${recipientName(order)} (${recipientPhone(order) || 'No phone'})</div>
        <div><strong>Status:</strong> <span class="badge ${getStatusBadgeClass(order.status)}">${order.status}</span></div>
      </div>
      <div style="margin-top: 4px; font-size: 12px; color: var(--color-text-muted);">
        <strong>Items:</strong> ${(order.items || []).map(i => `${itemQty(i)}x ${itemName(i)}`).join(', ')}
      </div>
    `;

    const checklistContainer = document.getElementById('checklistItemsList');
    const steps = window.VrindaAdmin.CHECKLIST_STEPS;
    const currentChecklist = order.checklist || {};

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

    // Bind checklist toggles
    checklistContainer.querySelectorAll('input[type="checkbox"]').forEach(chk => {
      chk.addEventListener('change', async () => {
        const stepKey = chk.getAttribute('data-step-key');
        const isDone = chk.checked;
        const res = await window.VrindaAdmin.toggleChecklistStep(orderId, stepKey, isDone);
        if (res.success) {
          const updatedOrder = allOrders.find(o => o.orderId === orderId);
          if (updatedOrder) {
            updatedOrder.checklist = res.checklist;
          }
          openChecklistModal(orderId);
        } else {
          alert('Checklist error: ' + res.error);
          chk.checked = !isDone;
        }
      });
    });

    document.getElementById('modalDirectStatusSelect').value = order.status;
    modal.style.display = 'flex';
  }

  function openAssignDeliveryModal(orderId) {
    const order = allOrders.find(o => o.orderId === orderId);
    if (!order) return;

    document.getElementById('assignOrderId').value = orderId;
    const isLocal = order.delivery?.type === 'local';
    document.getElementById('assignDeliveryType').value = isLocal ? 'local' : 'courier';
    document.getElementById('assignLocalFields').style.display = isLocal ? 'grid' : 'none';
    document.getElementById('assignCourierFields').style.display = isLocal ? 'none' : 'flex';

    if (order.delivery) {
      document.getElementById('assignRiderName').value = order.delivery.riderName || '';
      document.getElementById('assignRiderPhone').value = order.delivery.riderPhone || '';
      document.getElementById('assignRiderEta').value = order.delivery.eta || '';
      document.getElementById('assignCourierName').value = order.delivery.courierName || '';
      document.getElementById('assignAwbNumber').value = order.delivery.trackingNumber || '';
      document.getElementById('assignTrackingUrl').value = order.delivery.trackingUrl || '';
    }

    document.getElementById('modalAssignDelivery').style.display = 'flex';
  }
  /**
   * Open the shared coupon modal in create mode (coupon = null) or edit mode
   * (an existing coupon object). Editing pre-fills every field and remembers
   * the original code so a rename can clean up the old RTDB key.
   */
  function openCouponModal(coupon) {
    const modal = document.getElementById('modalCouponForm');
    const title = document.getElementById('couponFormTitle');
    const typeEl = document.getElementById('couponFormType');
    if (typeEl) typeEl.value = (coupon && coupon.type) || 'percent';

    if (coupon) {
      editingCouponCode = coupon.code;
      if (title) title.textContent = `Edit Coupon — ${coupon.code}`;
      document.getElementById('couponFormCode').value = coupon.code || '';
      document.getElementById('couponFormValue').value = coupon.value != null ? coupon.value : '';
      document.getElementById('couponFormMin').value = coupon.minOrder || '';
      document.getElementById('couponFormDesc').value = coupon.description || '';
      const maxEl = document.getElementById('couponFormMax');
      if (maxEl) maxEl.value = coupon.maxDiscount || '';
    } else {
      editingCouponCode = null;
      if (title) title.textContent = 'Create Discount Coupon';
      document.getElementById('couponFormCode').value = '';
      document.getElementById('couponFormValue').value = '';
      document.getElementById('couponFormMin').value = '';
      document.getElementById('couponFormDesc').value = '';
      const maxEl = document.getElementById('couponFormMax');
      if (maxEl) maxEl.value = '';
    }

    if (modal) modal.style.display = 'flex';
  }

  function openProductModal(prod) {
    const modal = document.getElementById('modalProductForm');
    const title = document.getElementById('modalProductTitle');

    if (prod) {
      title.textContent = `Edit Product — ${prod.name}`;
      document.getElementById('prodFormId').value = prod.id;
      document.getElementById('prodFormName').value = prod.name;
      document.getElementById('prodFormCategory').value = prod.category;
      document.getElementById('prodFormPrice').value = prod.price;
      document.getElementById('prodFormImage').value = prod.image || '';
      document.getElementById('prodFormDesc').value = prod.description || '';
      document.getElementById('prodFormCustomizable').checked = !!(prod.customizable || prod.isPersonalized);
      document.getElementById('prodFormBestseller').checked = !!(prod.bestseller || prod.isBestSeller);
      const mrpEl = document.getElementById('prodFormMrp');
      if (mrpEl) mrpEl.value = prod.originalPrice && prod.originalPrice !== prod.price ? prod.originalPrice : '';
      const catNameEl = document.getElementById('prodFormCategoryName');
      if (catNameEl) catNameEl.value = prod.categoryName || '';
      const badgeEl = document.getElementById('prodFormBadge');
      if (badgeEl) badgeEl.value = prod.badge || '';
      const slugEl = document.getElementById('prodFormSlug');
      if (slugEl) slugEl.value = prod.slug || '';
      const stockEl = document.getElementById('prodFormStock');
      if (stockEl) stockEl.value = prod.stock || '';
      const activeEl = document.getElementById('prodFormActive');
      if (activeEl) activeEl.checked = prod.active !== false;
      const trendingEl = document.getElementById('prodFormTrending');
      if (trendingEl) trendingEl.checked = !!prod.isTrending;
      const newEl = document.getElementById('prodFormNew');
      if (newEl) newEl.checked = !!prod.isNew;
    } else {
      title.textContent = 'Add New Product';
      document.getElementById('prodFormId').value = '';
      document.getElementById('prodFormName').value = '';
      document.getElementById('prodFormCategory').value = 'hampers';
      document.getElementById('prodFormPrice').value = '';
      document.getElementById('prodFormImage').value = '';
      document.getElementById('prodFormDesc').value = '';
      document.getElementById('prodFormCustomizable').checked = false;
      document.getElementById('prodFormBestseller').checked = false;
      ['prodFormMrp', 'prodFormCategoryName', 'prodFormBadge', 'prodFormSlug', 'prodFormStock'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
      const newActive = document.getElementById('prodFormActive');
      if (newActive) newActive.checked = true;
      const trendingEl = document.getElementById('prodFormTrending');
      if (trendingEl) trendingEl.checked = false;
      const newEl = document.getElementById('prodFormNew');
      if (newEl) newEl.checked = false;
    }

    modal.style.display = 'flex';
  }

  /* ------------------------------------------------- ORDER SHAPE UTILITIES */
  /**
   * The canonical order record (see VrindaOrders.buildOrder) exposes
   * customer / shipping / gifting sub-objects. `shippingAddress` was used by an
   * early draft of the admin tables, so every helper below keeps it as a fallback
   * to stay resilient against legacy rows already sitting in the database.
   */
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
    return (order.gifting && order.gifting.deliverySlot) || legacy.deliverySlot || 'Standard Delivery';
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

  document.addEventListener('DOMContentLoaded', initSuperAdmin);
})();
