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
  // Live-feed health for the two Realtime Database subscriptions this portal
  // cannot work without. A refused read and a connection that never answers are
  // different failures, and both used to leave the ledger on its "Loading..." row.
  let ordersFeedSeen = false;
  let ordersFeedPending = false;
  let ordersLoadError = null;
  let ordersWatchdog = null;
  // Ledger row selection for the bulk actions (Print slips / Mark Packed). Ids
  // rather than row objects, so a live snapshot re-render cannot lose the ticks.
  let selectedOrderIds = new Set();
  let cancellationsLoadError = null;
  // Newsletter subscribers, fetched when the tab is opened or refreshed.
  let newsletterRows = [];
  let newsletterLoadError = null;
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

        // The newsletter list is fetched the first time the tab is opened, and
        // on Refresh, rather than held on a live subscription. It is a one-shot
        // read of a list that only changes when somebody signs up.
        if (targetTab === 'newsletter') loadNewsletterTable();
      });
    });
  }

  /* -------------------------------------------------------- REAL-TIME SUBSCRIBERS */
  function setupListeners() {
    // A silent return here used to leave every table on its "Loading..." row for
    // ever. Name what is missing instead, in the place the owner is looking.
    if (!window.VrindaOrders || !window.VrindaAdmin) {
      ordersLoadError = 'The order service did not load on this page, so the ledger cannot be read. Check that order-service.js and admin-service.js are both listed before admin-super-controller.js.';
      ordersFeedPending = false;
      renderOrdersTable();
      console.error('Admin portal: window.VrindaOrders / window.VrindaAdmin are missing.');
      return;
    }

    // 1. Orders listener. The rejection callback is the whole point: until the
    //    database rules are published the Realtime Database refuses this read,
    //    and without it the ledger sat on "Loading orders ledger..." for ever.
    ordersFeedPending = true;
    renderOrdersTable();
    attachOrdersFeed();
    armOrdersWatchdog();

    // 2. Cancellation Requests listener
    window.VrindaOrders.listenToCancellationRequests((requests) => {
      cancellationsLoadError = null;
      allCancellations = requests;
      renderCancellationsTable();
    }, (err) => {
      cancellationsLoadError = describeLoadFailure('cancellation requests', err);
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

    // 10. Newsletter: loaded on demand rather than live, because the admin
    // only needs the list when running a campaign, and it can be large.
    const refreshBtn = document.getElementById('btnRefreshNewsletter');
    const exportBtn = document.getElementById('btnExportNewsletter');
    if (refreshBtn) refreshBtn.addEventListener('click', loadNewsletterTable);
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        if (!newsletterRows.length) {
          alert('There are no subscribers to export yet.');
          return;
        }
        window.VrindaAdmin.downloadNewsletterCsv(newsletterRows);
      });
    }

    // Filters and Search. The controls first read back whatever the URL was
    // bookmarked with, so a shared ledger link opens on the same view; every
    // change below then writes the state back with replaceState (never
    // pushState — typing must not fill the back button with keystrokes).
    const searchInput = document.getElementById('orderSearchInput');
    const statusFilter = document.getElementById('orderStatusFilter');
    const unverifiedToggle = document.getElementById('orderUnverifiedOnly');
    restoreOrdersFiltersFromUrl();
    const filtersChanged = () => {
      renderOrdersTable();
      syncOrdersFiltersToUrl();
    };
    // Search is debounced: pasting a phone number must not rebuild the ledger
    // once per character. change (blur / Enter) applies immediately.
    let searchDebounce = null;
    searchInput?.addEventListener('input', () => {
      if (searchDebounce) clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        searchDebounce = null;
        renderOrdersTable();
        syncOrdersFiltersToUrl();
      }, 250);
    });
    searchInput?.addEventListener('change', () => {
      if (searchDebounce) {
        clearTimeout(searchDebounce);
        searchDebounce = null;
      }
      filtersChanged();
    });
    statusFilter?.addEventListener('change', filtersChanged);
    unverifiedToggle?.addEventListener('change', filtersChanged);

    // The badge is the shortcut into the one filter it measures: press it and
    // the ledger shows exactly those payments. The reconcile banner's "Show all"
    // is the way back out of that filter.
    document.getElementById('ordersBadge')?.addEventListener('click', focusUnverifiedPayments);
    document.getElementById('btnClearUnverifiedFilter')?.addEventListener('click', () => {
      if (unverifiedToggle) unverifiedToggle.checked = false;
      filtersChanged();
    });

    // Exports exactly the rows the filters above are showing.
    document.getElementById('btnExportOrders')?.addEventListener('click', downloadOrdersCsv);

    // Date range (today's packing list, the GST month) and the "This month" preset.
    document.getElementById('orderDateFrom')?.addEventListener('change', filtersChanged);
    document.getElementById('orderDateTo')?.addEventListener('change', filtersChanged);
    document.getElementById('btnDateThisMonth')?.addEventListener('click', () => {
      setThisMonthRange();
      syncOrdersFiltersToUrl();
    });
    document.getElementById('btnClearOrderDates')?.addEventListener('click', () => {
      clearDateRange();
      syncOrdersFiltersToUrl();
    });

    // Bulk actions. The select-all box lives in the table head, so it is bound
    // once here; the per-row boxes are (re)bound with every render.
    document.getElementById('ordersSelectAll')?.addEventListener('change', (event) => {
      setAllVisibleSelection(!!(event && event.target && event.target.checked));
    });
    document.getElementById('btnBulkMarkPacked')?.addEventListener('click', bulkMarkPacked);
    document.getElementById('btnBulkVerify')?.addEventListener('click', bulkVerifyPayments);
    document.getElementById('btnBulkPrint')?.addEventListener('click', () => printOrdersFromLedger(selectedInView()));
    document.getElementById('btnBulkClear')?.addEventListener('click', clearSelection);

    // The detail drawer's buttons belong to the page, so they bind once; the
    // rows that open it are (re)bound with every render.
    const closeOrderDetail = () => {
      const modal = document.getElementById('modalOrderDetail');
      if (modal) modal.style.display = 'none';
      detailOrderId = null;
    };
    document.getElementById('btnOrderDetailClose')?.addEventListener('click', closeOrderDetail);
    document.getElementById('btnOrderDetailCloseX')?.addEventListener('click', closeOrderDetail);
    document.getElementById('btnOrderDetailPrint')?.addEventListener('click', () => {
      if (detailOrderId) printOrdersFromLedger([detailOrderId]);
    });

    document.getElementById('btnRefreshStats')?.addEventListener('click', () => {
      renderStats();
      alert('Stats recalculated!');
    });
  }
  /**
   * (Re)subscribe to the orders feed. Split out so the error row's Retry button
   * can call it again without a page reload.
   */
  function attachOrdersFeed() {
    window.VrindaOrders.listenToAllOrders(handleOrdersSnapshot, handleOrdersFailure);
  }

  function handleOrdersSnapshot(orders) {
    ordersFeedSeen = true;
    ordersFeedPending = false;
    ordersLoadError = null;
    disarmOrdersWatchdog();
    allOrders = orders;
    // An order that has left the ledger (deleted, or replaced by a fresh snapshot)
    // must not keep counting towards a bulk action.
    const present = new Set(orders.map((o) => o.orderId));
    selectedOrderIds.forEach((id) => { if (!present.has(id)) selectedOrderIds.delete(id); });
    renderStats();
    renderRecentOrders();
    renderOrdersTable();
  }

  function handleOrdersFailure(err) {
    ordersFeedSeen = true;
    ordersFeedPending = false;
    ordersLoadError = describeLoadFailure('orders', err);
    renderOrdersTable();
    // Nothing is selectable while the feed is refused, so the bulk bar must not
    // sit there offering actions on rows that are no longer on screen.
    syncSelectionUi([]);
  }

  function disarmOrdersWatchdog() {
    if (ordersWatchdog) {
      clearTimeout(ordersWatchdog);
      ordersWatchdog = null;
    }
  }

  /**
   * A blocked realtime connection reports neither a value nor an error, so none
   * of the callbacks above can catch it: this is the only guard against a ledger
   * that waits for ever. Twelve seconds is well past a cold start on a phone.
   */
  function armOrdersWatchdog() {
    disarmOrdersWatchdog();
    ordersWatchdog = setTimeout(() => {
      if (ordersFeedSeen) return;
      ordersFeedPending = false;
      ordersLoadError = 'No answer from the orders feed after 12 seconds, and no refusal either — that usually means the realtime connection is blocked (offline tab, strict network or VPN). Check the browser console for a failed or stalled database request, then press Retry.';
      renderOrdersTable();
    }, 12000);
  }

  /** Retry from the failure row, so a transient refusal does not need a reload. */
  function retryOrdersFeed() {
    ordersLoadError = null;
    ordersFeedSeen = false;
    ordersFeedPending = true;
    renderOrdersTable();
    attachOrdersFeed();
    armOrdersWatchdog();
  }

  /**
   * Turn a database rejection into a sentence an owner can act on. Unpublished
   * rules are the usual cause, and the old ledger hid it completely.
   */
  function describeLoadFailure(what, err) {
    const raw = [err && err.code, err && err.message].filter(Boolean).join(' ');
    if (/permission_denied/i.test(raw)) {
      return `Could not load ${what}: PERMISSION_DENIED. Publish the database rules (firebase deploy --only database) and make sure this account holds an operations role — then press Retry.`;
    }
    return `Could not load ${what}: ${raw || 'unknown error'}. Press Retry, and check the browser console for the full error.`;
  }

  /* ------------------------------------------------------------- STATS RENDERING */
  /** ₹ with the Indian grouping the rest of the admin uses. */
  function fillMoney(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = '₹' + (Number(value) || 0).toLocaleString('en-IN');
  }

  function fillOrders(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    const count = Number(value) || 0;
    el.textContent = count + (count === 1 ? ' order' : ' orders');
  }

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

    // Period performance: the same money, over the windows an owner actually asks
    // about (today's packing list, this week, the GST month).
    fillMoney('statRevenueToday', stats.revenueToday);
    fillMoney('statRevenue7', stats.revenue7);
    fillMoney('statRevenue30', stats.revenue30);
    fillOrders('statOrdersToday', stats.ordersToday);
    fillOrders('statOrders7', stats.orders7);
    fillOrders('statOrders30', stats.orders30);

    // The badge on the Orders tab: payments waiting for a human, which is the one
    // number that should pull somebody into the ledger. It is a button as well as
    // a count — clicking it opens exactly those orders.
    const badge = document.getElementById('ordersBadge');
    if (badge) {
      const pending = Number(stats.unverifiedPayments) || 0;
      badge.style.display = pending ? 'inline-flex' : 'none';
      badge.textContent = String(pending);
      badge.title = pending
        ? pending + ' payment' + (pending === 1 ? '' : 's') + ' still to verify in FamPay — click to open them in the ledger'
        : 'No payments waiting to be verified';
    }

    fillInsights(stats);
  }

  /**
   * The three panels under the KPI row: what is selling, where the orders are
   * sitting, and how much money is still waiting for a human. The bars are plain
   * div widths — the dashboard must render with no charting dependency, and a
   * number beside a bar reads on a phone without hovering anything.
   */
  function fillInsights(stats) {
    const panel = (rows, renderRow) => {
      if (!rows.length) return '<div style="font-size: 12px; color: var(--color-text-muted);">Nothing to show yet.</div>';
      const max = Math.max.apply(null, rows.map((r) => r.measure)) || 1;
      return rows.map(renderRow(max)).join('');
    };
    const bar = (percent, color) => `
      <div style="height: 4px; background: var(--color-border-subtle); border-radius: 2px; margin-top: 3px;">
        <div style="height: 4px; width: ${percent}%; background: ${color}; border-radius: 2px;"></div>
      </div>`;

    const topEl = document.getElementById('topProductsList');
    if (topEl) {
      const rows = (stats.topProducts || []).map((t) => ({
        label: t.name, qty: Number(t.qty) || 0, revenue: Number(t.revenue) || 0, measure: Number(t.qty) || 0
      }));
      topEl.innerHTML = panel(rows, (max) => (r) => `
        <div style="margin-bottom: 6px;">
          <div style="display: flex; justify-content: space-between; gap: 8px; font-size: 12px;">
            <span>${escapeText(r.label)} × ${r.qty}</span>
            <span style="color: var(--color-text-muted);">₹${r.revenue.toLocaleString('en-IN')}</span>
          </div>
          ${bar(Math.round((r.measure / max) * 100), 'var(--color-primary)')}
        </div>`);
    }

    const funnelEl = document.getElementById('statusFunnelList');
    if (funnelEl) {
      const rows = (stats.statusFunnel || []).map((f) => ({ label: f.status, count: Number(f.count) || 0, measure: Number(f.count) || 0 }));
      funnelEl.innerHTML = panel(rows, (max) => (r) => `
        <div style="margin-bottom: 6px;">
          <div style="display: flex; justify-content: space-between; gap: 8px; font-size: 12px;">
            <span>${escapeText(r.label)}</span><strong>${r.count}</strong>
          </div>
          ${bar(Math.round((r.measure / max) * 100), r.label === 'Cancelled' ? 'var(--color-error)' : 'var(--color-primary)')}
        </div>`);
    }

    const payEl = document.getElementById('paymentBreakdownBox');
    if (payEl) {
      const b = stats.paymentBreakdown || { verified: 0, unverified: 0, untracked: 0 };
      payEl.innerHTML = `
        <div style="display: flex; justify-content: space-between; font-size: 13px; padding: 2px 0;"><span>✅ Confirmed</span><strong>${b.verified}</strong></div>
        <div style="display: flex; justify-content: space-between; font-size: 13px; padding: 2px 0;${b.unverified ? ' color: var(--color-error);' : ''}"><span>⚠️ Awaiting confirmation</span><strong>${b.unverified}</strong></div>
        <div style="display: flex; justify-content: space-between; font-size: 13px; padding: 2px 0; color: var(--color-text-muted);"><span>— No payment record</span><strong>${b.untracked}</strong></div>
        ${Number(stats.unverifiedAmount) > 0
          ? '<div style="font-size: 11px; color: var(--color-error); margin-top: 4px;">₹' + Number(stats.unverifiedAmount).toLocaleString('en-IN') + ' still to confirm in FamPay</div>'
          : ''}`;
    }
  }

  /* ----------------------------------------------------------- RECENT ORDERS */
  function renderRecentOrders() {
    const tbody = document.getElementById('recentOrdersTbody');
    if (!tbody) return;

    // An empty in-flight table reads as "all caught up", which is exactly the wrong
    // message when the feed never loaded — say what actually happened instead.
    if (ordersLoadError && !allOrders.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--color-text-muted); padding: 1.5rem;">${escapeText(ordersLoadError)}</td></tr>`;
      return;
    }

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
          <td>
            <strong>₹${(o.pricing?.total || 0).toLocaleString('en-IN')}</strong>
            ${couponDiscountLine(o)}
          </td>
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
  /**
   * The rows the ledger is currently showing. Extracted from renderOrdersTable so
   * the CSV export always matches what is on screen instead of quietly exporting
   * every order ever placed.
   */
  function filterOrders() {
    const query = (document.getElementById('orderSearchInput')?.value || '').toLowerCase().trim();
    const statusFilter = document.getElementById('orderStatusFilter')?.value || 'ALL';
    const unverifiedOnly = !!document.getElementById('orderUnverifiedOnly')?.checked;
    const fromValue = document.getElementById('orderDateFrom')?.value || '';
    const toValue = document.getElementById('orderDateTo')?.value || '';

    let filtered = allOrders;

    // Spark-plan workflow: the gateway cannot be verified from a browser, so the
    // admin triages exactly those orders here and confirms each one in FamPay.
    if (unverifiedOnly) {
      filtered = filtered.filter(o => o.payment && o.payment.verified === false);
    }

    // Date placed, inclusive of both ends: "1 Sep to 30 Sep" includes everything
    // placed on the 30th, which is what those inputs mean to whoever set them.
    if (fromValue || toValue) {
      const fromMs = fromValue ? new Date(fromValue + 'T00:00:00').getTime() : -Infinity;
      const toMs = toValue ? new Date(toValue + 'T23:59:59.999').getTime() : Infinity;
      filtered = filtered.filter((o) => {
        const at = Number(o.createdAt) || Number(o.placedAt) || 0;
        return at >= fromMs && at <= toMs;
      });
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

    return filtered;
  }

  /**
   * Spreadsheet-ready export of the ledger, following the newsletter export's
   * conventions (newsletterToCsv in admin-service.js). Amounts stay plain numbers
   * so Sheets can total a column, and any cell that could contain a comma, quote
   * or newline is quoted. This exists for the monthly GST record, courier handover
   * sheets and FamPay reconciliation — all of which are about the rows in view, not
   * the whole history.
   */
  function ordersToCsv(rows) {
    // One implementation, in admin-service.js, shared with the staff queue: two
    // copies of a GST-relevant export is two chances to disagree.
    return window.VrindaAdmin.ordersToCsv(rows);
  }

  /** Trigger a browser download of the CSV without touching the network. */
  function downloadOrdersCsv() {
    const rows = filterOrders();
    if (!rows.length) {
      alert('There is nothing to export in the current view. Clear the search or filters and try again.');
      return;
    }

    const csv = ordersToCsv(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = ordersCsvFileName();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Revoke on the next tick so Safari has time to start the download.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  /**
   * The export's filename, so a month's file is named after the month rather than
   * after the day it happened to be downloaded:
   * orders-2026-09-01_to_2026-09-30.csv.
   */
  function ordersCsvFileName() {
    const from = document.getElementById('orderDateFrom')?.value || '';
    const to = document.getElementById('orderDateTo')?.value || '';
    return window.VrindaAdmin.ordersCsvFileName(from, to);
  }

  /* ------------------------------------------------------------- DATE RANGE */

  /** yyyy-mm-dd from local parts: toISOString() would shift the day for IST. */
  function toInputDate(date) {
    const pad = (n) => String(n).padStart(2, '0');
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  /** First of this month up to today: the window the GST record is filed from. */
  function setThisMonthRange() {
    const now = new Date();
    const fromEl = document.getElementById('orderDateFrom');
    const toEl = document.getElementById('orderDateTo');
    if (fromEl) fromEl.value = toInputDate(new Date(now.getFullYear(), now.getMonth(), 1));
    if (toEl) toEl.value = toInputDate(now);
    renderOrdersTable();
  }

  function clearDateRange() {
    const fromEl = document.getElementById('orderDateFrom');
    const toEl = document.getElementById('orderDateTo');
    if (fromEl) fromEl.value = '';
    if (toEl) toEl.value = '';
    renderOrdersTable();
  }

  /* ------------------------------------------------------ FILTERS IN THE URL */

  /**
   * Read the ledger filters back out of the URL (?q=…&status=…&unverified=1&
   * from=…&to=…) before the first render, so a bookmarked or messaged view
   * reopens exactly as it was copied. Anything missing keeps its default.
   */
  function restoreOrdersFiltersFromUrl() {
    let params;
    try {
      params = new URLSearchParams(window.location.search || '');
    } catch (err) {
      return;   // no usable search string: the shipped defaults are correct
    }
    const setValue = (id, value) => {
      const el = document.getElementById(id);
      if (el && value) el.value = value;
    };
    setValue('orderSearchInput', params.get('q') || '');
    setValue('orderStatusFilter', params.get('status') || '');
    setValue('orderDateFrom', params.get('from') || '');
    setValue('orderDateTo', params.get('to') || '');
    const unverified = document.getElementById('orderUnverifiedOnly');
    if (unverified) unverified.checked = params.get('unverified') === '1';
  }

  /**
   * Write the current controls back into the URL, defaults omitted so a clean
   * ledger has a clean address. replaceState keeps the back button working as a
   * "leave the portal" button rather than a keystroke log.
   */
  function syncOrdersFiltersToUrl() {
    try {
      const params = new URLSearchParams();
      const value = (id) => (document.getElementById(id)?.value || '').trim();
      if (value('orderSearchInput')) params.set('q', value('orderSearchInput'));
      const status = value('orderStatusFilter');
      if (status && status !== 'ALL') params.set('status', status);
      if (document.getElementById('orderUnverifiedOnly')?.checked) params.set('unverified', '1');
      if (value('orderDateFrom')) params.set('from', value('orderDateFrom'));
      if (value('orderDateTo')) params.set('to', value('orderDateTo'));
      const qs = params.toString();
      const url = window.location.pathname + (qs ? '?' + qs : '') + (window.location.hash || '');
      if (window.history && typeof window.history.replaceState === 'function') {
        window.history.replaceState(null, '', url);
      }
    } catch (err) {
      console.warn('Could not save the ledger filters in the URL:', err);
    }
  }

  /* ------------------------------------------------------- RECONCILIATION */

  /**
   * The Orders badge pressed as a button: jump to the ledger showing exactly the
   * payments it counts. The competing filters are cleared on purpose — a
   * leftover search term hiding one of those rows would make the badge's number
   * a lie. Also switches tabs explicitly rather than trusting the click to
   * bubble.
   */
  function focusUnverifiedPayments() {
    const toggle = document.getElementById('orderUnverifiedOnly');
    if (toggle) toggle.checked = true;
    const search = document.getElementById('orderSearchInput');
    if (search) search.value = '';
    const status = document.getElementById('orderStatusFilter');
    if (status) status.value = 'ALL';
    const fromEl = document.getElementById('orderDateFrom');
    const toEl = document.getElementById('orderDateTo');
    if (fromEl) fromEl.value = '';
    if (toEl) toEl.value = '';

    let ordersTab = null;
    document.querySelectorAll('.admin-nav-item').forEach((btn) => {
      if (btn.getAttribute('data-tab') === 'orders') ordersTab = btn;
    });
    if (ordersTab && typeof ordersTab.click === 'function') ordersTab.click();

    renderOrdersTable();
    syncOrdersFiltersToUrl();
    const ledger = document.getElementById('ordersLedger');
    if (ledger && typeof ledger.scrollIntoView === 'function') {
      ledger.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  /**
   * The banner above the table while the unverified filter is on: how many rows
   * are in view, what to do with each, and the way back out of the filter.
   * Hidden outright when the feed is refused — there is nothing to reconcile
   * against rows the page cannot see.
   */
  function syncReconcileBanner(filtered) {
    const banner = document.getElementById('ordersReconcileBanner');
    if (!banner) return;
    const checked = !!document.getElementById('orderUnverifiedOnly')?.checked;
    const show = checked && !ordersLoadError && !!allOrders.length;
    banner.style.display = show ? 'flex' : 'none';
    const countEl = document.getElementById('ordersReconcileCount');
    if (show && countEl) countEl.textContent = String(filtered.length);
  }

  /* --------------------------------------------------------- ROW SELECTION */

  /**
   * The ticked orders that are still in view. A bulk action must act on what is on
   * screen, not on rows that a filter (or a fresh snapshot) has since hidden.
   */
  function selectedInView() {
    const visible = new Set(filterOrders().map((o) => o.orderId));
    return Array.from(selectedOrderIds).filter((id) => visible.has(id));
  }

  function syncSelectionUi(visibleRows) {
    const ids = (visibleRows || filterOrders()).map((o) => o.orderId);
    const selected = ids.filter((id) => selectedOrderIds.has(id));
    const bar = document.getElementById('ordersBulkBar');
    const countEl = document.getElementById('ordersSelectedCount');
    const selectAll = document.getElementById('ordersSelectAll');

    if (countEl) countEl.textContent = String(selected.length);
    if (bar) bar.style.display = selected.length ? 'flex' : 'none';
    if (selectAll) {
      selectAll.checked = ids.length > 0 && selected.length === ids.length;
      selectAll.indeterminate = selected.length > 0 && selected.length < ids.length;
    }

    // "Confirm payments" only appears when at least one ticked row actually has
    // a payment waiting — a button that would find nothing to do is a button
    // that erodes trust in the other one.
    const verifyBtn = document.getElementById('btnBulkVerify');
    if (verifyBtn) {
      const pendingSelected = selected.some((id) => {
        const order = allOrders.find((o) => o.orderId === id);
        return order && order.payment && order.payment.verified === false;
      });
      verifyBtn.style.display = pendingSelected ? 'inline-flex' : 'none';
    }
  }

  function toggleRowSelection(orderId, isSelected) {
    if (!orderId) return;
    if (isSelected) selectedOrderIds.add(orderId);
    else selectedOrderIds.delete(orderId);
    syncSelectionUi();
  }

  function setAllVisibleSelection(isSelected) {
    filterOrders().forEach((o) => {
      if (isSelected) selectedOrderIds.add(o.orderId);
      else selectedOrderIds.delete(o.orderId);
    });
    renderOrdersTable();   // re-render so the row boxes follow the header box
  }

  function clearSelection() {
    selectedOrderIds = new Set();
    renderOrdersTable();
  }

  /* ------------------------------------------------------------------ PRINT */

  /**
   * One packing slip per order, with the gift note below it when the order carries
   * a message. Prices stay off: this is the slip that goes in the box, not the
   * invoice. Says so plainly if print-service.js did not load, rather than doing
   * nothing at all when somebody presses a button.
   */
  function printOrdersFromLedger(orderIds) {
    const ids = Array.isArray(orderIds) ? orderIds : [orderIds];
    const orders = allOrders.filter((o) => ids.includes(o.orderId));
    if (!orders.length) return;
    if (!window.VrindaPrint || typeof window.VrindaPrint.printOrders !== 'function') {
      alert('The print service did not load on this page. Check that js/print-service.js is listed before the controller script.');
      return;
    }
    window.VrindaPrint.printOrders(orders);
  }

  /* ----------------------------------------------------------- BULK ACTIONS */

  /**
   * Bulk "Mark Packed": one write per order, in sequence, so a partial failure is
   * reported per order instead of leaving whoever is packing to guess which ones
   * went through. Each write goes through the order service, which keeps the
   * timeline and the customer's tracking page in step.
   */
  async function bulkMarkPacked() {
    const ids = selectedInView();
    if (!ids.length) return;
    if (!confirm('Mark ' + ids.length + ' order' + (ids.length === 1 ? '' : 's') + ' as Packed?\n\nEach order keeps its own timeline entry, and the customer\'s tracking page updates.')) return;

    const button = document.getElementById('btnBulkMarkPacked');
    if (button) {
      button.disabled = true;
      button.textContent = 'Marking…';
    }

    const failures = [];
    for (const orderId of ids) {
      try {
        const res = await window.VrindaOrders.updateOrderStatus(orderId, 'Packed', 'Bulk action from the ledger');
        if (!res || !res.success) failures.push(orderId + ': ' + ((res && res.error) || 'unknown error'));
      } catch (err) {
        failures.push(orderId + ': ' + err.message);
      }
    }

    if (button) {
      button.disabled = false;
      button.textContent = '📦 Mark Packed';
    }
    selectedOrderIds = new Set();
    renderOrdersTable();

    if (failures.length) {
      alert('Marked ' + (ids.length - failures.length) + ' of ' + ids.length + ' orders as Packed.\n\nStill to do:\n' + failures.join('\n'));
    } else {
      alert('Marked ' + ids.length + ' order' + (ids.length === 1 ? '' : 's') + ' as Packed.');
    }
  }

  /**
   * Bulk payment confirmation, for the reconciliation pass after a payout
   * delay: every ticked order whose payment is still unverified, confirmed one
   * at a time in sequence so a partial failure is reported per order — the same
   * contract as Mark Packed. Orders already confirmed are skipped even if they
   * are ticked.
   */
  async function bulkVerifyPayments() {
    const ids = selectedInView().filter((id) => {
      const order = allOrders.find((o) => o.orderId === id);
      return order && order.payment && order.payment.verified === false;
    });
    if (!ids.length) {
      alert('None of the selected orders has a payment waiting to be confirmed.');
      return;
    }
    if (!confirm('Confirm ' + ids.length + ' payment' + (ids.length === 1 ? '' : 's') + '?\n\nOnly after checking each one in your FamPay dashboard (UTR / transaction id).')) return;

    const button = document.getElementById('btnBulkVerify');
    if (button) {
      button.disabled = true;
      button.textContent = 'Confirming…';
    }

    const failures = [];
    for (const orderId of ids) {
      try {
        const res = await window.VrindaAdmin.markPaymentVerified(orderId, 'Confirmed from the ledger bulk action.');
        if (!res || !res.success) failures.push(orderId + ': ' + ((res && res.error) || 'unknown error'));
      } catch (err) {
        failures.push(orderId + ': ' + err.message);
      }
    }

    if (button) {
      button.disabled = false;
      button.textContent = '✓ Confirm payments';
    }
    selectedOrderIds = new Set();
    renderOrdersTable();

    if (failures.length) {
      alert('Confirmed ' + (ids.length - failures.length) + ' of ' + ids.length + ' payments.\n\nStill to do:\n' + failures.join('\n'));
    } else {
      alert('Confirmed ' + ids.length + ' payment' + (ids.length === 1 ? '' : 's') + '.');
    }
  }

  /* --------------------------------------------------------- DETAIL DRAWER */

  // The order the drawer is showing; its Print slip button prints this one.
  let detailOrderId = null;

  function openOrderDetails(orderId) {
    const order = allOrders.find((o) => o.orderId === orderId);
    const modal = document.getElementById('modalOrderDetail');
    const body = document.getElementById('orderDetailBody');
    const title = document.getElementById('orderDetailTitle');
    if (!order || !modal || !body) return;

    detailOrderId = orderId;
    if (title) title.textContent = orderId + ' — ' + order.status;

    body.innerHTML = orderDetailMarkup(order);
    modal.style.display = 'flex';
  }

  /**
   * The drawer's contents: items, money, payment proof, gift note and delivery
   * in one panel, so an operator never has to reconcile the checklist against
   * the CSV to answer a customer. Says nothing rather than the wrong thing
   * about fields a given order does not carry.
   */
  function orderDetailMarkup(order) {
    const pricing = order.pricing || {};
    const payment = order.payment || {};
    const gifting = order.gifting || {};
    const shape = window.VrindaAdmin.orderShape;
    const isLocal = (order.delivery || {}).type === 'local';
    const line = (label, value) => `
      <div style="display: flex; justify-content: space-between; gap: 10px; font-size: 13px; padding: 2px 0;">
        <span style="color: var(--color-text-muted);">${label}</span><strong style="text-align: right;">${value}</strong>
      </div>`;

    return `
      <div style="background: var(--color-bg-subtle); border-radius: var(--radius-md); padding: 10px 12px;">
        ${line('Placed', escapeText(formatDate(order.createdAt)))}
        ${line('Status', `<span class="badge ${getStatusBadgeClass(order.status)}">${escapeText(order.status)}</span>`)}
        ${line('Recipient', escapeText(shape.recipientName(order)) + (shape.recipientPhone(order) ? ' · ' + escapeText(shape.recipientPhone(order)) : ''))}
        ${line('Destination', escapeText(shape.recipientCity(order)) + ' ' + escapeText(shape.recipientPincode(order)) + ' · ' + escapeText(shape.deliverySlot(order)))}
      </div>
      <div>
        <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--color-text-muted); margin-bottom: 4px;">Items</div>
        ${(order.items || []).length
          ? (order.items || []).map((item) => `
              <div style="display: flex; justify-content: space-between; font-size: 13px; padding: 2px 0;">
                <span>${escapeText(shape.itemName(item))} × ${shape.itemQty(item)}</span>
              </div>`).join('')
          : '<div style="font-size: 13px; color: var(--color-text-muted);">No line items recorded.</div>'}
      </div>
      <div style="background: var(--color-bg-subtle); border-radius: var(--radius-md); padding: 10px 12px;">
        ${line('Subtotal', '₹' + Number(pricing.subtotal || 0).toLocaleString('en-IN'))}
        ${pricing.discount ? line('Discount' + (pricing.couponCode ? ' (' + escapeText(pricing.couponCode) + ')' : ''), '-₹' + Number(pricing.discount).toLocaleString('en-IN')) : ''}
        ${line('Total', '₹' + Number(pricing.total || 0).toLocaleString('en-IN'))}
        ${line('Payment', escapeText(payment.mode || 'Unknown') + (payment.status ? ' · ' + escapeText(payment.status) : ''))}
        ${payment.utr ? line('UTR', escapeText(payment.utr)) : ''}
        ${payment.verified === false
          ? '<div style="font-size: 12px; color: var(--color-error); margin-top: 4px;">⚠️ Not yet confirmed in FamPay — press ✓ Mark Paid once it matches.</div>'
          : payment.verified === true
            ? '<div style="font-size: 12px; color: var(--color-success); margin-top: 4px;">✅ Payment confirmed</div>'
            : ''}
        ${payment.simulated ? '<div style="font-size: 12px; color: var(--color-text-muted); margin-top: 4px;">🧪 Rehearsal payment — no money was taken.</div>' : ''}
      </div>
      ${gifting.giftMessage || gifting.notes || gifting.isSurprise ? `
        <div style="background: var(--color-bg-subtle); border-radius: var(--radius-md); padding: 10px 12px;">
          ${gifting.isSurprise ? '<div style="font-size: 12px; font-weight: 700; margin-bottom: 4px;">🤫 Surprise order — do not contact the recipient.</div>' : ''}
          ${gifting.giftMessage ? '<div style="font-size: 12px; color: var(--color-text-muted); margin-bottom: 4px;">Gift message</div><div style="font-size: 13px;">' + escapeText(gifting.giftMessage) + '</div>' : ''}
          ${gifting.notes ? '<div style="font-size: 12px; color: var(--color-text-muted); margin-top: 6px;">Packing / delivery notes: ' + escapeText(gifting.notes) + '</div>' : ''}
        </div>` : ''}
      <div style="background: var(--color-bg-subtle); border-radius: var(--radius-md); padding: 10px 12px;">
        ${line('Delivery', isLocal ? '🛵 Local Express' : '📦 Courier Partner')}
        ${isLocal ? line('Rider', escapeText(order.delivery?.riderName || 'Not assigned')) : line('AWB', escapeText(order.delivery?.trackingNumber || 'Not generated'))}
        ${order.delivery?.eta ? line('ETA', escapeText(order.delivery.eta)) : ''}
        ${order.cancellationStatus === 'requested'
          ? '<div style="font-size: 12px; color: var(--color-error); margin-top: 6px;">⚠️ Cancellation requested — review it in the Cancellations tab.</div>'
          : ''}
      </div>`;
  }

  /* ----------------------------------------------------------- FULL ORDERS TABLE */
  function renderOrdersTable() {
    const tbody = document.getElementById('ordersTbody');
    if (!tbody) return;

    const filtered = filterOrders();
    syncReconcileBanner(filtered);

    if (ordersLoadError) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 2rem;">
            <div style="color: var(--color-text-muted);">${escapeText(ordersLoadError)}</div>
            <button class="btn btn-xs btn-primary js-retry-orders" style="margin-top: 0.75rem;">↻ Retry</button>
          </td>
        </tr>`;
      bindActionButtons(tbody);
      return;
    }

    // A feed that has not answered yet, a feed with no orders, and a filter that
    // matches nothing are three different situations. The old code answered all of
    // them with "No orders match the selected filters.", which is what sent an
    // owner hunting for a filter bug that did not exist.
    if (!allOrders.length && ordersFeedPending) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--color-text-muted); padding: 2rem;">Waiting for the orders feed…</td></tr>`;
      return;
    }

    if (!allOrders.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--color-text-muted); padding: 2rem;">No orders yet — every new order appears here live, with its 11-step timeline.</td></tr>`;
      return;
    }

    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--color-text-muted); padding: 2rem;">No orders match the selected filters.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(o => {
      const waLink = window.VrindaOrders.getWhatsAppAdminLink(o, 'admin-contact');
      const isLocal = o.delivery?.type === 'local';
      const isSelected = selectedOrderIds.has(o.orderId);
      return `
        <tr data-order-id="${escAttr(o.orderId)}" style="cursor: pointer;" title="Click for the full order details">
          <td>
            <input type="checkbox" class="js-row-select" data-order-id="${escAttr(o.orderId)}" ${isSelected ? 'checked' : ''}
                   title="Select ${escAttr(o.orderId)} for a bulk action" style="accent-color: var(--color-primary);">
          </td>
          <td>
            <strong>${o.orderId}</strong>
            <div style="font-size: 11px; color: var(--color-text-muted);">${formatDate(o.createdAt)}</div>
            <div style="font-size: 11px; margin-top: 2px;">Items: ${(o.items || []).length}</div>
            ${(o.payment && o.payment.verified === false) ? `
              <div style="font-size: 11px; margin-top: 4px;">
                <span class="badge badge-error" title="${escapeText(o.payment.verificationNote || '')}">⚠️ Payment unverified</span>
                ${o.payment.utr ? `<div style="color: var(--color-text-muted);">UTR: ${o.payment.utr}</div>` : ''}
              </div>` : ''}
            ${(o.payment && o.payment.simulated) ? `
              <div style="font-size: 11px; margin-top: 4px;">
                <span class="badge badge-subtle" title="Created in local payment simulation — no money was taken. Safe to delete.">🧪 Rehearsal</span>
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
            ${couponDiscountLine(o)}
            <div style="font-size: 10px; color: var(--color-success);">${escapeText(o.payment?.status || 'PAID')}</div>
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
              ${canDeleteOrders() ? `
                <button class="btn btn-xs btn-outline js-delete-order" data-order-id="${o.orderId}" data-user-id="${escAttr(o.userId || '')}"
                        style="color: var(--color-error); border-color: var(--color-error);">
                  🗑 Delete
                </button>` : ''}
              <button class="btn btn-xs btn-glass js-print-order" data-order-id="${o.orderId}"
                      title="Packing slip, with the gift note printed below it when the order carries one">
                🖨 Print
              </button>
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

    // A row opens the detail drawer. A click that landed on a control inside it
    // (link, button, tick box) belongs to that control instead.
    tbody.querySelectorAll('tr').forEach((row) => {
      if (!row.getAttribute('data-order-id')) return;
      row.addEventListener('click', (event) => {
        const target = event && event.target;
        if (target && typeof target.closest === 'function' && target.closest('a, button, input, select, label')) return;
        openOrderDetails(row.getAttribute('data-order-id'));
      });
    });

    syncSelectionUi(filtered);
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

    if (cancellationsLoadError) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--color-text-muted); padding: 2rem;">${escapeText(cancellationsLoadError)}</td></tr>`;
      return;
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
  // Exposed so the Bulk Product Maker panel can refresh this table after an
  // import, without either file reaching into the other's internals.
  window.loadProducts = loadProducts;

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
    return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
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
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 2rem;">No coupons configured. Use ➕ Create Coupon to publish one — the cart only offers codes that exist in Firebase.</td></tr>`;
      return;
    }

    tbody.innerHTML = allCoupons.map(c => `
      <tr>
        <td><strong>${escapeText(c.code)}</strong></td>
        <td><span class="badge badge-accent">${escapeText((c.type || '').toUpperCase())}</span></td>
        <td>${c.type === 'percent' ? `${escapeText(c.value)}% OFF${c.maxDiscount ? ` (max ₹${escapeText(c.maxDiscount)})` : ''}` : c.type === 'flat' ? `₹${escapeText(c.value)} OFF` : 'Free Delivery'}</td>
        <td>${c.minOrder ? `₹${escapeText(c.minOrder)}` : 'No Min'}</td>
        <td>${c.active === false ? '<span class="badge badge-subtle">Disabled</span>' : '<span class="badge badge-success">Active</span>'}</td>
        <td>${escapeText(c.description) || '—'}${c.firstOrderOnly ? ' <span class="badge badge-accent" style="font-size: 10px;">First order only</span>' : ''}</td>
        <td>
          <div class="admin-action-btns">
            <button class="btn btn-xs btn-outline js-edit-coupon" data-code="${escapeText(c.code)}">
              Edit
            </button>
            <button class="btn btn-xs btn-glass js-delete-coupon" data-code="${escapeText(c.code)}" style="color: var(--color-error);">
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
      const badgeClass = role === 'owner' ? 'badge-error'
        : role === 'manager' ? 'badge-warning'
        : role === 'superadmin' ? 'badge-accent'
        : role === 'staff' ? 'badge-new'
        : role === 'delivery' ? 'badge-primary' : 'badge-subtle';
      // Guarded: a page can be loaded before auth.js finishes initialising, and
      // this table must still render rather than throw on a missing label map.
      const labels = (window.VrindaAuth && window.VrindaAuth.ROLE_LABELS) || {};
      const roleLabel = labels[role] || role.toUpperCase();
      return `
        <tr>
          <td>
            <strong>${u.name || 'Anonymous User'}</strong>
            <div style="font-size: 11px; color: var(--color-text-muted);">${u.uid}</div>
          </td>
          <td>${u.email || 'No email registered'}</td>
          <td>
            <span class="badge ${badgeClass}">${roleLabel}</span>
          </td>
          <td>
            <select class="form-select js-role-select" data-uid="${u.uid}" style="max-width: 200px; padding: 0.35rem 0.6rem; font-size: 12px;">
              <option value="customer" ${role === 'customer' ? 'selected' : ''}>Customer</option>
              <option value="staff" ${role === 'staff' ? 'selected' : ''}>Staff Admin</option>
              <option value="delivery" ${role === 'delivery' ? 'selected' : ''}>Delivery Manager</option>
              <option value="superadmin" ${role === 'superadmin' ? 'selected' : ''}>Super Admin</option>
              <option value="manager" ${role === 'manager' ? 'selected' : ''}>Super Admin+ (Manager)</option>
              <option value="owner" ${role === 'owner' ? 'selected' : ''}>Super Admin++ (Owner)</option>
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

  /* ------------------------------------------------------- NEWSLETTER SUBSCRIBERS */

  /**
   * Load the subscriber list and render it. Kept separate from the other
   * listeners because it is a one-shot read: the list only changes when
   * somebody signs up, and it can be large enough that a live subscription
   * would be wasteful.
   */
  async function loadNewsletterTable() {
    const tbody = document.getElementById('newsletterTbody');
    if (!tbody) return;

    if (!newsletterRows.length && !newsletterLoadError) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem;">Loading subscribers...</td></tr>';
    }

    const res = await window.VrindaAdmin.listNewsletter();
    if (!res.success) {
      newsletterLoadError = res.error;
      // A PERMISSION_DENIED here almost always means the rules were not
      // re-published, so say so rather than showing an empty table.
      tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--color-error);">' +
        'Could not load subscribers. Publish the database rules first:<br>firebase deploy --only database' +
        '<br><small style="color: var(--color-text-muted);">' + escapeText(res.error || '') + '</small></td></tr>';
      return;
    }

    newsletterLoadError = null;
    newsletterRows = res.rows;
    renderNewsletterTable();
  }

  function renderNewsletterTable() {
    const tbody = document.getElementById('newsletterTbody');
    if (!tbody) return;

    const setCount = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    };
    const active = newsletterRows.filter((r) => r.status !== 'unsubscribed');
    setCount('newsletterSubscribedCount', active.length);
    setCount('newsletterUnsubscribedCount', newsletterRows.length - active.length);
    setCount('newsletterSignedInCount', active.filter((r) => r.userId).length);

    const badge = document.getElementById('newsletterBadge');
    if (badge) {
      badge.textContent = active.length;
      badge.style.display = active.length ? '' : 'none';
    }

    if (!newsletterRows.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--color-text-muted);">' +
        'No subscribers yet. Sign-ups from the homepage appear here.</td></tr>';
      return;
    }

    const fmtDate = (ms) => {
      if (!ms) return '—';
      const d = new Date(Number(ms));
      return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    tbody.innerHTML = newsletterRows.map((r) => {
      const isUnsub = r.status === 'unsubscribed';
      return '<tr' + (isUnsub ? ' style="opacity: 0.55;"' : '') + '>' +
        '<td><strong>' + escapeText(r.email) + '</strong></td>' +
        '<td>' + escapeText(r.userName || '—') + '</td>' +
        '<td>' + fmtDate(r.createdAt) + '</td>' +
        '<td>' + (r.userId ? '<span title="' + escapeText(r.userId) + '">Linked account</span>' : 'Guest') + '</td>' +
        '<td>' + escapeText(r.source || 'homepage') + '</td>' +
        '<td><span class="badge ' + (isUnsub ? 'badge-subtle' : 'badge-new') + '">' +
          (isUnsub ? 'Unsubscribed' : 'Subscribed') + '</span></td>' +
        '</tr>';
    }).join('');
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

    // The "Import sample catalog" button was removed from admin/index.html when
    // the bundled catalog went away, so its click handler is gone as well: it was
    // unreachable dead code that would still have written the bundled categories
    // into /categories if anything ever wired it back up.

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

      const activeFlag = document.getElementById('couponFormActive');
      const couponPayload = Object.assign({}, existing, {
        code: document.getElementById('couponFormCode').value.trim().toUpperCase(),
        type: document.getElementById('couponFormType').value,
        value: Number(document.getElementById('couponFormValue').value) || 0,
        minOrder: Number(document.getElementById('couponFormMin').value) || 0,
        description: document.getElementById('couponFormDesc').value.trim(),
        // Always written, never left to the database default, because "the field is
        // missing" and "the field is true" must never be able to disagree:
        // store-service.js rejects on `active === false` and cart-controller.js
        // drops those rows from the offer chips.
        active: activeFlag ? activeFlag.checked : true
      });

      const maxEl = document.getElementById('couponFormMax');
      if (maxEl) {
        const maxVal = Number(maxEl.value) || 0;
        if (maxVal > 0) couponPayload.maxDiscount = maxVal;
        else delete couponPayload.maxDiscount;
      }

      // Optional flag: stored only when ticked, mirroring the maxDiscount pattern
      // above, so a normal coupon row stays as small as it was before.
      const firstOrderEl = document.getElementById('couponFormFirstOrder');
      if (firstOrderEl && firstOrderEl.checked) couponPayload.firstOrderOnly = true;
      else delete couponPayload.firstOrderOnly;

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

      const createdMessage = originalCode ? 'Coupon updated successfully!' : 'Coupon created successfully!';
      alert(couponPayload.active === false
        ? createdMessage + '\n\nNote: this code is switched off, so shoppers cannot apply it yet.'
        : createdMessage);
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

    container.querySelectorAll('.js-delete-order').forEach(btn => {
      btn.addEventListener('click', () => {
        confirmDeleteOrder(btn.getAttribute('data-order-id'), btn.getAttribute('data-user-id'));
      });
    });

    // Row ticks feed the bulk bar. The rows are rebuilt on every snapshot, so the
    // boxes are bound with each render rather than once.
    container.querySelectorAll('.js-row-select').forEach(box => {
      box.addEventListener('change', () => toggleRowSelection(box.getAttribute('data-order-id'), box.checked));
    });

    container.querySelectorAll('.js-print-order').forEach(btn => {
      btn.addEventListener('click', () => printOrdersFromLedger(btn.getAttribute('data-order-id')));
    });

    // The failure row's Retry re-subscribes the feed, so a refusal that was only
    // temporary (a token that attached late, a connection that dropped) does not
    // cost the admin a full page reload.
    container.querySelectorAll('.js-retry-orders').forEach(btn => {
      btn.addEventListener('click', retryOrdersFeed);
    });
  }

  /**
   * Deleting an order is irreversible: the order row, its tracking timeline and
   * the customer's index entry all disappear, and the customer loses the ability
   * to see or track it. The database rules reserve this for Super Admin+ and
   * Super Admin++ (see orders/$orderId/.write in database.rules.json), so the
   * button only appears for those roles and the write is refused for anyone else
   * even if the markup were tampered with.
   */
  function canDeleteOrders() {
    const auth = window.VrindaAuth;
    return !!(auth && auth.atLeast && auth.atLeast('manager'));
  }

  /** Escaping for a value interpolated into an HTML attribute. */
  function escAttr(value) {
    // escapeText, not escText: the typo here threw a ReferenceError inside the row
    // template, which aborted the whole innerHTML assignment and left the ledger
    // on "Loading orders ledger..." for any owner or manager (the only roles that
    // render the delete button this is used by).
    return escapeText(value).replace(/`/g, '&#96;');
  }

  function confirmDeleteOrder(orderId, userId) {
    if (!orderId) return;

    const order = allOrders.find(o => o.orderId === orderId);
    const who = order ? (order.customer?.name || order.customer?.phone || 'this customer') : 'this customer';

    // Two deliberate steps: a warning, then the order id typed out. An order
    // carrying a real payment must never go on a single mis-click.
    if (!confirm(
      'Delete order ' + orderId + '?\n\n' +
      'Customer: ' + who + '\n' +
      'This removes the order, its tracking timeline and the customer\'s order list.\n' +
      'It CANNOT be undone.'
    )) return;

    const typed = prompt('To confirm, type the order number exactly: ' + orderId);
    if (typed === null) return;
    if (typed.trim() !== orderId) {
      alert('That did not match the order number. Nothing was deleted.');
      return;
    }

    window.VrindaAdmin.deleteOrder(orderId, userId).then((res) => {
      if (res.success) {
        alert('Order ' + orderId + ' has been deleted.');
        // Drop it locally too so the table updates without waiting for the
        // live listener to round-trip.
        allOrders = allOrders.filter(o => o.orderId !== orderId);
        renderOrdersTable();
        renderStats();
      } else {
        alert('Could not delete the order: ' + res.error);
      }
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
      // A row written before the toggle existed has no `active` field at all, and
      // the storefront treats that as live — so only an explicit false untick it.
      const activeEl = document.getElementById('couponFormActive');
      if (activeEl) activeEl.checked = coupon.active !== false;
      const firstOrderEl = document.getElementById('couponFormFirstOrder');
      if (firstOrderEl) firstOrderEl.checked = coupon.firstOrderOnly === true;
    } else {
      editingCouponCode = null;
      if (title) title.textContent = 'Create Discount Coupon';
      document.getElementById('couponFormCode').value = '';
      document.getElementById('couponFormValue').value = '';
      document.getElementById('couponFormMin').value = '';
      document.getElementById('couponFormDesc').value = '';
      const maxEl = document.getElementById('couponFormMax');
      if (maxEl) maxEl.value = '';
      const activeEl = document.getElementById('couponFormActive');
      if (activeEl) activeEl.checked = true;
      const firstOrderEl = document.getElementById('couponFormFirstOrder');
      if (firstOrderEl) firstOrderEl.checked = false;
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
  /**
   * The coupon line for an order row.
   *
   * order.pricing.couponCode / discount have been written at checkout all along,
   * but the admin tables only showed the total, so a discounted order looked like
   * any other and nobody could tell a code had been used. Renders nothing when no
   * coupon was applied.
   */
  function couponDiscountLine(order) {
    const pricing = (order && order.pricing) || {};
    const discount = Number(pricing.discount) || 0;
    const code = String(pricing.couponCode || '').trim();
    if (!code || discount <= 0) return '';
    return '<div style="font-size: 11px; color: var(--color-success);">Coupon ' +
      escapeText(code) + ' −₹' + discount.toLocaleString('en-IN') + '</div>';
  }

  // Order-shape fallbacks now live in one place (admin-service orderShape), so
  // the ledger, the staff queue and the CSV export cannot spell a customer's
  // name differently.
  function recipientName(order) {
    return window.VrindaAdmin.orderShape.recipientName(order);
  }

  function recipientPhone(order) {
    return window.VrindaAdmin.orderShape.recipientPhone(order);
  }

  function recipientCity(order) {
    return window.VrindaAdmin.orderShape.recipientCity(order);
  }

  function recipientPincode(order) {
    return window.VrindaAdmin.orderShape.recipientPincode(order);
  }

  function deliverySlot(order) {
    return window.VrindaAdmin.orderShape.deliverySlot(order);
  }

  function itemQty(item) {
    return window.VrindaAdmin.orderShape.itemQty(item);
  }

  function itemName(item) {
    return window.VrindaAdmin.orderShape.itemName(item);
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
