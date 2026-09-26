/**
 * vrindahampers - Commerce UI Helpers (Phase 4 + Phase 5)
 * Shared rendering primitives for the cart, wishlist, checkout, payment, order
 * and order-tracking pages so money formatting, notices, summary rows, the
 * 11-step tracking timeline and the rider/courier delivery card stay identical
 * everywhere. Presentation only — no data access lives here.
 */

(function () {
  'use strict';

  const UI = {};

  const STATUS_CLASS_MAP = {
    'Order Placed': 'status-placed',
    'Payment Confirmed': 'status-confirmed',
    'Awaiting Customization': 'status-customizing',
    'Customer Contacted': 'status-contacted',
    'Photos Received': 'status-photos',
    'Customization Confirmed': 'status-confirmed',
    'Design Confirmed': 'status-confirmed',
    'Production Started': 'status-production',
    'In Production': 'status-production',
    'Packed': 'status-packed',
    'Quality Check': 'status-packed',
    'Ready to Ship': 'status-ready',
    'Assigned To Delivery': 'status-assigned',
    'Out For Delivery': 'status-delivering',
    'Out for Delivery': 'status-delivering',
    'Delivered': 'status-delivered',
    'Cancelled': 'status-cancelled'
  };

  UI.money = function (value) {
    const cfg = (window.VRINDA_DATA && window.VRINDA_DATA.commerceConfig) || {};
    const symbol = cfg.currencySymbol || '₹';
    const amount = Number(value) || 0;
    return symbol + amount.toLocaleString('en-IN', {
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2
    });
  };

  UI.escapeHtml = function (value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  UI.plain = function (value) {
    return String(value === undefined || value === null ? '' : value).replace(/\s+/g, ' ').trim();
  };

  /** Standard notice bar used at the top of commerce pages. */
  UI.notice = function (element, message, type) {
    const el = typeof element === 'string' ? document.getElementById(element) : element;
    if (!el) return;

    if (!message) {
      el.style.display = 'none';
      el.textContent = '';
      return;
    }

    const palette = {
      error: ['var(--color-error-bg)', 'var(--color-error)'],
      success: ['var(--color-success-bg)', 'var(--color-success)'],
      warning: ['var(--color-warning-bg)', 'var(--color-warning)'],
      info: ['var(--color-info-bg)', 'var(--color-info)']
    }[type || 'info'] || ['var(--color-info-bg)', 'var(--color-info)'];

    el.style.display = 'block';
    el.style.background = palette[0];
    el.style.color = palette[1];
    el.style.border = '1px solid ' + palette[1];
    el.innerHTML = message;
  };

  UI.hide = function (id) {
    const el = typeof id === 'string' ? document.getElementById(id) : id;
    if (el) el.style.display = 'none';
  };

  UI.show = function (id, display) {
    const el = typeof id === 'string' ? document.getElementById(id) : id;
    if (el) el.style.display = display || 'block';
  };

  UI.setBusy = function (button, busy, busyLabel, idleLabel) {
    if (!button) return;
    if (busy) {
      button.dataset.idleLabel = button.innerHTML;
      button.disabled = true;
      button.innerHTML = '<span class="spinner spinner-inline"></span> ' + (busyLabel || 'Please wait…');
    } else {
      button.disabled = false;
      button.innerHTML = idleLabel || button.dataset.idleLabel || button.innerHTML;
    }
  };

  UI.statusClass = function (status) {
    return STATUS_CLASS_MAP[status] || 'status-placed';
  };

  /* ------------------------------------------------------------- line items */

  /** One cart line (used by cart.html and the checkout/payment summaries). */
  UI.cartLineHtml = function (item, options) {
    const opts = options || {};
    const price = Number(item.price) || 0;
    const mrp = Number(item.originalPrice) || 0;
    const lineTotal = price * (parseInt(item.qty, 10) || 1);
    const productUrl = '../product/?id=' + encodeURIComponent(item.productId) + '&slug=' + encodeURIComponent(item.slug || item.productId);

    return `
      <div class="cart-item" data-line-id="${UI.escapeHtml(item.productId)}">
        <a class="cart-item-media" href="${productUrl}">
          <img src="${UI.escapeHtml(item.image)}" alt="${UI.escapeHtml(item.name)}" loading="lazy">
        </a>
        <div class="cart-item-body">
          <div class="cart-item-cat">${UI.escapeHtml(item.categoryName || 'Bespoke Gift')}</div>
          <a class="cart-item-title" href="${productUrl}">${UI.escapeHtml(item.name)}</a>
          <div class="cart-item-price">
            <strong>${UI.money(price)}</strong>
            ${mrp > price ? `<span class="cart-item-mrp">${UI.money(mrp)}</span>` : ''}
          </div>
          ${item.isPersonalized ? '<span class="cart-item-tag">Personalization included on WhatsApp</span>' : ''}
        </div>
        <div class="cart-item-controls">
          ${opts.readonly ? `<div class="cart-item-qty-static">Qty ${UI.escapeHtml(item.qty)}</div>` : `
            <div class="qty-stepper" aria-label="Quantity">
              <button type="button" class="qty-btn js-qty-down" data-product-id="${UI.escapeHtml(item.productId)}" aria-label="Decrease quantity">−</button>
              <input type="text" class="qty-input js-qty-input" data-product-id="${UI.escapeHtml(item.productId)}" value="${UI.escapeHtml(item.qty)}" inputmode="numeric" aria-label="Quantity for ${UI.escapeHtml(item.name)}">
              <button type="button" class="qty-btn js-qty-up" data-product-id="${UI.escapeHtml(item.productId)}" aria-label="Increase quantity">+</button>
            </div>
            <div class="cart-item-linetotal">${UI.money(lineTotal)}</div>
            <button type="button" class="link-btn danger js-remove-item" data-product-id="${UI.escapeHtml(item.productId)}">Remove</button>
          `}
        </div>
      </div>
    `;
  };

  /* ------------------------------------------------------------ summary rows */

  UI.summaryRowsHtml = function (totals, options) {
    const opts = options || {};
    const rows = [];

    rows.push(`
      <div class="summary-row">
        <span>Subtotal (${totals.itemCount} item${totals.itemCount === 1 ? '' : 's'})</span>
        <span>${UI.money(totals.subtotal)}</span>
      </div>
    `);

    if (totals.catalogSavings > 0) {
      rows.push(`
        <div class="summary-row summary-row-savings">
          <span>Catalog savings</span>
          <span>− ${UI.money(totals.catalogSavings)}</span>
        </div>
      `);
    }

    if (totals.discount > 0) {
      rows.push(`
        <div class="summary-row summary-row-discount">
          <span>Coupon${totals.couponCode ? ' · ' + UI.escapeHtml(totals.couponCode) : ''}</span>
          <span>− ${UI.money(totals.discount)}</span>
        </div>
      `);
    }

    rows.push(`
      <div class="summary-row">
        <span>Delivery ${totals.shippingMode === 'express' ? '(Express)' : '(Standard)'}</span>
        <span>${totals.shipping === 0 ? '<em class="free-ship">FREE</em>' : UI.money(totals.shipping)}</span>
      </div>
    `);

    rows.push(`
      <div class="summary-row summary-total">
        <span>Total Payable</span>
        <span>${UI.money(totals.total)}</span>
      </div>
    `);

    rows.push('<p class="summary-tax-note">Prices inclusive of all taxes. No hidden charges.</p>');

    if (opts.showFreeShippingHint !== false) {
      if (totals.amountToFreeShipping > 0 && totals.shippingMode !== 'express') {
        rows.push('<p class="freight-hint">Add <strong>' + UI.money(totals.amountToFreeShipping) +
          '</strong> more for free standard delivery.</p>');
      } else if (totals.qualifiesFreeShipping && totals.shippingMode !== 'express') {
        rows.push('<p class="freight-hint positive">🎉 Free standard delivery unlocked!</p>');
      }
    }

    return rows.join('');
  };

  UI.renderSummary = function (elementId, totals, options) {
    const el = typeof elementId === 'string' ? document.getElementById(elementId) : elementId;
    if (el) el.innerHTML = UI.summaryRowsHtml(totals, options);
  };

  /* --------------------------------------------------------------- steps UI */

  /** Marks every step up to (and including) activeKey with the given state class. */
  UI.markSteps = function (containerId, activeKey, stateClass) {
    const container = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
    if (!container) return;
    const cls = stateClass || 'active';
    const steps = Array.from(container.querySelectorAll('.step-item'));
    let reached = false;

    steps.forEach((step) => {
      step.classList.remove('active', 'done', 'failed');
      if (reached) return;
      step.classList.add(cls);
      if (step.getAttribute('data-step') === activeKey) reached = true;
    });
  };

  /** Sets the state of a single step (states: active | done | failed | ''). */
  UI.setStep = function (stepKey, state) {
    const step = document.querySelector('.step-item[data-step="' + stepKey + '"]');
    if (!step) return;
    step.classList.remove('active', 'done', 'failed');
    if (state) step.classList.add(state);
  };

  /* ------------------------------------------------- Phase 5 order tracking */

  /**
   * Turns `/orders/{id}/statusHistory` into a { normalisedStatus: timestamp } map
   * so every completed timeline step can show when it happened.
   */
  function historyLookup(order) {
    const map = {};
    const history = (order && order.statusHistory) || [];
    history.forEach((entry) => {
      if (!entry || !entry.status) return;
      const key = window.VrindaOrders
        ? window.VrindaOrders.normalizeStatus(entry.status)
        : entry.status;
      if (!map[key]) map[key] = entry.at || null;
    });
    return map;
  }

  function deliveryRow(label, value, fallback) {
    const shown = value || fallback || '';
    return `
      <div class="detail-row">
        <span class="detail-label">${UI.escapeHtml(label)}</span>
        <span class="detail-value">${shown ? UI.escapeHtml(shown) : '<em class="detail-pending">Awaiting update</em>'}</span>
      </div>
    `;
  }

  function phoneRow(label, phone) {
    if (!phone) return deliveryRow(label, '');
    const digits = String(phone).replace(/[^\d+]/g, '');
    return `
      <div class="detail-row">
        <span class="detail-label">${UI.escapeHtml(label)}</span>
        <span class="detail-value">
          <a href="tel:${UI.escapeHtml(digits)}">${UI.escapeHtml(phone)}</a>
        </span>
      </div>
    `;
  }

  UI.deliveryType = function (order) {
    return (order && order.delivery && order.delivery.type === 'local') ? 'local' : 'courier';
  };

  /**
   * Delivery tracking card: local express rider vs. courier partner.
   * Fields stay in the "Awaiting update" state until the delivery manager fills them.
   */
  UI.deliveryCardHtml = function (order) {
    const delivery = (order && order.delivery) || {};
    const gift = (order && order.gifting) || {};
    const ship = (order && order.shipping) || {};
    const isLocal = UI.deliveryType(order) === 'local';

    const rows = isLocal ? [
      deliveryRow('Rider Name', delivery.riderName, 'Assigned on dispatch day'),
      phoneRow('Rider Phone', delivery.riderPhone),
      deliveryRow('Vehicle No.', delivery.vehicleNumber, 'Shared before pickup'),
      deliveryRow('ETA', delivery.eta, 'Within 3–5 hours of dispatch'),
      deliveryRow('Delivery Date', UI.prettyDate(delivery.expectedDeliveryDate || gift.deliveryDate), 'Scheduled after packing')
    ] : [
      deliveryRow('Courier Partner', delivery.courierName, 'India Post / BlueDart'),
      deliveryRow('Tracking No.', delivery.trackingNumber, 'Generated at dispatch'),
      phoneRow('Courier Phone', delivery.courierPhone),
      deliveryRow('Expected Delivery', UI.prettyDate(delivery.expectedDeliveryDate || gift.deliveryDate), 'Shared once dispatched'),
      deliveryRow('Service', delivery.shippingMode === 'express' ? 'Express air courier' : 'Standard surface courier')
    ];

    const trackUrl = delivery.trackingUrl
      ? `<a class="btn btn-outline btn-sm" href="${UI.escapeHtml(delivery.trackingUrl)}" target="_blank" rel="noopener noreferrer">Track Shipment</a>`
      : '';

    return `
      <div class="delivery-card delivery-card-${isLocal ? 'local' : 'courier'}">
        <div class="delivery-card-head">
          <span class="delivery-card-icon" aria-hidden="true">${isLocal ? '🛵' : '🚚'}</span>
          <div>
            <strong>${isLocal ? 'Local Express Rider' : 'Courier Partner'}</strong>
            <span>${isLocal
              ? 'Same-day hand delivery inside the city'
              : 'Insured doorstep courier across India'}</span>
          </div>
        </div>
        <div class="detail-grid">
          ${rows.join('')}
          ${deliveryRow('Deliver To', [ship.city, ship.pincode].filter(Boolean).join(' · '))}
        </div>
        ${trackUrl ? `<div class="delivery-card-actions">${trackUrl}</div>` : ''}
      </div>
    `;
  };

  /** Inline cancellation-state explainer (requested | approved | rejected). */
  UI.cancellationNoticeHtml = function (order) {
    const state = (order && order.cancellationStatus) || 'none';
    if (state === 'none') return '';

    const copy = {
      requested: ['⏳', 'info', 'Cancellation request received',
        'Our Super Admin team is reviewing your request and will confirm the outcome on WhatsApp.'],
      approved: ['✅', 'success', 'Cancellation approved',
        'This order has been cancelled. Any prepaid amount is refunded to the original payment method.'],
      rejected: ['ℹ️', 'warning', 'Cancellation request declined',
        'This order was already in crafting or dispatched, so it could not be cancelled. Our concierge can help with an exchange.']
    }[state];

    if (!copy) return '';

    return `
      <div class="cancel-note cancel-note-${copy[1]}">
        <span class="cancel-note-icon" aria-hidden="true">${copy[0]}</span>
        <div>
          <strong>${UI.escapeHtml(copy[2])}</strong>
          <p>${UI.escapeHtml(copy[3])}</p>
        </div>
      </div>
    `;
  };

  /**
   * The shared 11-step visual order timeline.
   *
   * @param {object} order  full /orders/{orderId} record
   * @param {object} [options]
   * @param {'full'|'compact'} [options.variant='full']  full adds descriptions + hints
   * @param {boolean} [options.showTimestamps=true]
   */
  UI.timelineHtml = function (order, options) {
    const opts = options || {};
    const Orders = window.VrindaOrders;
    if (!order || !Orders || typeof Orders.getTimelineProgress !== 'function') return '';

    const progress = Orders.getTimelineProgress(order.status);
    const variant = opts.variant === 'compact' ? 'compact' : 'full';
    const stamps = opts.showTimestamps === false ? {} : historyLookup(order);
    const active = progress.activeStep || progress.steps[0];
    const headline = progress.isCancelled ? '🚫 Cancelled before dispatch' : active.description;

    const steps = progress.steps.map((step) => {
      const stampable = step.state === 'done' || step.state === 'active' || step.state === 'cancelled';
      const at = stampable ? stamps[step.status] : null;
      const marker = step.state === 'done' ? '✓'
        : step.state === 'active' ? '●'
          : step.state === 'cancelled' ? '✕' : '';

      return `
        <li class="vtrk-step vtrk-${step.state}">
          <span class="vtrk-marker" aria-hidden="true">${marker}</span>
          <div class="vtrk-body">
            <div class="vtrk-title">
              <span class="vtrk-icon" aria-hidden="true">${UI.escapeHtml(step.icon)}</span>
              <span>${UI.escapeHtml(step.label)}</span>
            </div>
            ${variant === 'full' && step.state !== 'pending'
              ? `<p class="vtrk-desc">${UI.escapeHtml(step.description)}</p>` : ''}
            ${variant === 'full' && step.state === 'active'
              ? `<p class="vtrk-hint">${UI.escapeHtml(step.hint)}</p>` : ''}
            ${at ? `<div class="vtrk-time">${UI.escapeHtml(UI.prettyDateTime(at))}</div>` : ''}
          </div>
        </li>
      `;
    }).join('');

    return `
      <div class="vtrk vtrk-${variant}${progress.isCancelled ? ' vtrk-is-cancelled' : ''}">
        <div class="vtrk-head">
          <div class="vtrk-headline">
            <span class="status-pill ${UI.statusClass(progress.currentStatus)}">${UI.escapeHtml(progress.currentStatus)}</span>
            <span class="vtrk-count">${progress.isCancelled
              ? 'Tracking stopped'
              : 'Step ' + (progress.currentIndex + 1) + ' of ' + progress.totalSteps}</span>
          </div>
          <div class="vtrk-progress" role="progressbar" aria-label="Order progress"
               aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress.percentage}">
            <span class="vtrk-progress-bar" style="width: ${Math.max(progress.percentage, 3)}%"></span>
          </div>
          <p class="vtrk-active-note">${UI.escapeHtml(headline)}</p>
        </div>
        <ol class="vtrk-list">${steps}</ol>
        ${UI.cancellationNoticeHtml(order)}
      </div>
    `;
  };

  /** Compact 11-dot progress strip used inside the My Orders list cards. */
  UI.timelineStripHtml = function (order) {
    const Orders = window.VrindaOrders;
    if (!order || !Orders || typeof Orders.getTimelineProgress !== 'function') return '';

    const progress = Orders.getTimelineProgress(order.status);
    const dots = progress.steps.map((step) => `
      <li class="vstrip-dot vstrip-${step.state}" title="${UI.escapeHtml(step.label)}">
        <span aria-hidden="true">${UI.escapeHtml(step.icon)}</span>
      </li>
    `).join('');

    return `
      <div class="vstrip-wrap">
        <ol class="vstrip" aria-label="Order progress: ${UI.escapeHtml(progress.currentStatus)}">${dots}</ol>
        <div class="vstrip-bar"><span style="width: ${Math.max(progress.percentage, 3)}%"></span></div>
        <div class="vstrip-caption">
          <span>${UI.escapeHtml(progress.currentStatus)}</span>
          <span>${progress.isCancelled ? 'Cancelled' : (progress.currentIndex + 1) + ' / ' + progress.totalSteps}</span>
        </div>
      </div>
    `;
  };

  /* ---------------------------------------------------------- date helpers */

  UI.todayIso = function () {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  };

  UI.addDaysIso = function (days) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  };

  UI.prettyDate = function (iso) {
    if (!iso) return '';
    const parsed = new Date(iso + (String(iso).length === 10 ? 'T00:00:00' : ''));
    if (isNaN(parsed.getTime())) return iso;
    return parsed.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  UI.prettyDateTime = function (timestamp) {
    if (!timestamp) return '';
    const parsed = new Date(Number(timestamp));
    if (isNaN(parsed.getTime())) return '';
    return parsed.toLocaleString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit'
    });
  };

  window.VrindaCommerceUI = UI;
})();
