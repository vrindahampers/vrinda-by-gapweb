/**
 * vrindahampers - Print Service (packing slips & gift notes)
 *
 * The team packs hampers at a table with a printer. Every order needs a slip
 * saying what goes in the box and where it is going, and orders that carry a
 * gift message need that message in a form somebody can copy by hand.
 *
 * How it works, and why:
 *   - Both artifacts are rendered into one hidden sheet (#printSheet) appended to
 *     <body>, and then window.print() runs. No pop-up window, so pop-up blockers
 *     and the browser's own print settings behave normally.
 *   - The sheet is hidden on screen with an inline style and revealed only when
 *     printing by css/print.css, which also hides the rest of the page. That file
 *     is linked with media="print" on the two admin pages that print, so nothing
 *     about the on-screen layout changes.
 *   - The sheet is deliberately NOT cleared after printing: Safari prints
 *     asynchronously and a sheet cleared on a timer comes out blank. It is rebuilt
 *     on every print, so a stale copy can never be printed.
 *   - Prices are off by default (a packing slip is not an invoice). Pass
 *     { showPrices: true } for a copy that doubles as the money record.
 *
 * Exposes window.VrindaPrint: { printOrders, packingSlip, clear, isLoaded }.
 */

(function () {
  'use strict';

  const SHEET_ID = 'printSheet';

  /* -------------------------------------------------------------- UTILITIES */

  function escapeText(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
    ));
  }

  /** Rupees, formatted the way the rest of the admin formats them. */
  function money(value) {
    return '₹' + (Number(value) || 0).toLocaleString('en-IN');
  }

  function asDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }

  function formatDate(value) {
    const date = asDate(value);
    return date ? date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  }

  function formatDateTime(value) {
    const date = asDate(value);
    return date ? date.toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    }) : '—';
  }

  function when(order) {
    return order.createdAt || order.placedAt
      || (Array.isArray(order.statusHistory) && order.statusHistory[0] && order.statusHistory[0].at)
      || null;
  }

  /**
   * The recipient, with the same legacy fallbacks the three portals use: an order
   * written before the customer/shipping split still carries shippingAddress.
   */
  function recipient(order) {
    const legacy = order.shippingAddress || {};
    const customer = order.customer || {};
    const shipping = order.shipping || {};
    return {
      name: customer.name || legacy.fullName || legacy.name || 'Customer',
      phone: customer.phone || legacy.phone || '',
      email: customer.email || order.userEmail || '',
      lines: [
        shipping.addressLine1 || legacy.line1 || legacy.addressLine1 || '',
        shipping.addressLine2 || legacy.line2 || legacy.addressLine2 || '',
        shipping.landmark ? 'Landmark: ' + shipping.landmark : ''
      ].filter(Boolean),
      city: shipping.city || legacy.city || '',
      state: shipping.state || legacy.state || '',
      pincode: shipping.pincode || legacy.pincode || ''
    };
  }

  function deliveryOf(order) {
    const delivery = order.delivery || {};
    const gifting = order.gifting || {};
    const isLocal = delivery.type !== 'courier';
    return {
      label: isLocal ? 'Local Express (rider)' : 'Courier partner',
      partner: isLocal ? (delivery.riderName || 'Rider not assigned yet') : (delivery.courierName || 'Courier not assigned yet'),
      partnerPhone: isLocal ? (delivery.riderPhone || '') : (delivery.courierPhone || ''),
      reference: isLocal ? (delivery.vehicleNumber || '') : (delivery.trackingNumber || ''),
      surface: gifting.deliverySlot || 'Standard slot',
      date: gifting.deliveryDate || delivery.expectedDeliveryDate || ''
    };
  }

  function itemsOf(order) {
    return Array.isArray(order.items) ? order.items : [];
  }

  function itemName(item) {
    return (item && (item.name || item.title)) || 'Item';
  }

  function itemQty(item) {
    return (item && (item.qty || item.quantity)) || 1;
  }

  function paymentOf(order) {
    const payment = order.payment || {};
    const pricing = order.pricing || {};
    const verified = payment.verified === false
      ? 'UNVERIFIED — confirm in FamPay before dispatch'
      : (payment.status || 'PAID');
    return {
      verifiedLine: verified,
      mode: payment.mode || '',
      amount: pricing.total || 0,
      coupon: pricing.couponCode || '',
      discount: Number(pricing.discount) || 0,
      utr: payment.utr || '',
      simulated: !!payment.simulated
    };
  }

  /* ---------------------------------------------------------------- MARKUP */

  function slipHeaderHtml(order, index, total) {
    const sequence = total > 1 ? 'Packing slip ' + (index + 1) + ' of ' + total : 'Packing slip';
    return `
      <header class="slip-head">
        <div>
          <div class="slip-brand">vrindahampers</div>
          <div class="slip-doc">${escapeText(sequence)}</div>
        </div>
        <div class="slip-order">
          <div class="slip-order-id">${escapeText(order.orderId || '—')}</div>
          <div class="slip-muted">Placed ${escapeText(formatDateTime(when(order)))}</div>
          <div class="slip-muted">Status ${escapeText(order.status || '—')}</div>
        </div>
      </header>`;
  }

  function slipBodyHtml(order, options) {
    const to = recipient(order);
    const delivery = deliveryOf(order);
    const payment = paymentOf(order);
    const gifting = order.gifting || {};
    const addressLines = to.lines.concat([
      [to.city, to.state].filter(Boolean).join(', '),
      to.pincode
    ].filter(Boolean));

    const items = itemsOf(order).map((item) => `
        <tr>
          <td class="slip-qty">${escapeText(itemQty(item))}×</td>
          <td>${escapeText(itemName(item))}${item.categoryName ? `<div class="slip-muted">${escapeText(item.categoryName)}</div>` : ''}</td>
          ${options.showPrices ? `<td class="slip-num">${escapeText(money(item.lineTotal || (Number(item.price) || 0) * itemQty(item)))}</td>` : ''}
        </tr>`).join('');

    return `
      <div class="slip-columns">
        <section class="slip-block">
          <h2>Deliver to</h2>
          <div class="slip-strong">${escapeText(to.name)}</div>
          ${to.phone ? `<div>${escapeText(to.phone)}</div>` : ''}
          ${addressLines.map((line) => `<div>${escapeText(line)}</div>`).join('')}
          ${to.email ? `<div class="slip-muted">${escapeText(to.email)}</div>` : ''}
        </section>
        <section class="slip-block">
          <h2>Delivery</h2>
          <div><span class="slip-label">Via</span> ${escapeText(delivery.label)}</div>
          <div><span class="slip-label">With</span> ${escapeText(delivery.partner)}${delivery.partnerPhone ? ' · ' + escapeText(delivery.partnerPhone) : ''}</div>
          <div><span class="slip-label">Slot</span> ${escapeText(delivery.surface)}${delivery.date ? ' · ' + escapeText(formatDate(delivery.date)) : ''}</div>
          ${delivery.reference ? `<div><span class="slip-label">Ref</span> ${escapeText(delivery.reference)}</div>` : ''}
        </section>
      </div>

      ${gifting.isSurprise ? '<div class="slip-flag">🤫 Surprise order — do not call or message the recipient.</div>' : ''}
      ${gifting.notes ? `<div class="slip-note"><span class="slip-label">Packing / delivery notes</span> ${escapeText(gifting.notes)}</div>` : ''}

      <table class="slip-items">
        <thead>
          <tr>
            <th class="slip-qty">Qty</th>
            <th>Item</th>
            ${options.showPrices ? '<th class="slip-num">Line total</th>' : ''}
          </tr>
        </thead>
        <tbody>${items || '<tr><td class="slip-qty">—</td><td>No items recorded on this order.</td></tr>'}</tbody>
        <tfoot>
          <tr>
            <td class="slip-qty">${escapeText(itemsOf(order).reduce((sum, item) => sum + Number(itemQty(item)), 0))}×</td>
            <td>${escapeText(payment.verifiedLine)}${payment.mode ? ' · ' + escapeText(payment.mode) : ''}${payment.utr ? ' · UTR ' + escapeText(payment.utr) : ''}</td>
            <td class="slip-num">${escapeText(money(payment.amount))}</td>
          </tr>
        </tfoot>
      </table>`;
  }

  function giftNoteHtml(order) {
    const gifting = order.gifting || {};
    const message = String(gifting.giftMessage || '').trim();
    if (!message) return '';
    const to = recipient(order);
    return `
      <section class="slip-gift">
        <h2>Gift note — copy this out by hand</h2>
        <div class="slip-muted">For ${escapeText(to.name)}${gifting.occasion ? ' · ' + escapeText(gifting.occasion) : ''}</div>
        <div class="slip-gift-message">${escapeText(message)}</div>
        <div class="slip-gift-sign">From: ______________________</div>
      </section>`;
  }

  function slipFooterHtml(order) {
    return `
      <footer class="slip-foot">
        <div class="slip-sign">Packed by ________________</div>
        <div class="slip-sign">Checked by ________________</div>
        <div class="slip-sign">Date ____________</div>
        <div class="slip-muted">Keep this slip with the hamper until handover · ${escapeText(order.orderId || '')}</div>
      </footer>`;
  }

  /* ------------------------------------------------------------------ SHEET */

  function sheetElement() {
    let sheet = document.getElementById(SHEET_ID);
    if (!sheet) {
      sheet = document.createElement('div');
      sheet.id = SHEET_ID;
      sheet.setAttribute('aria-hidden', 'true');
      // Hidden on screen; css/print.css reveals it with display:block !important
      // and hides everything else, so nothing flashes while the admin works.
      sheet.style.display = 'none';
      document.body.appendChild(sheet);
    }
    return sheet;
  }

  /**
   * Build (or rebuild) the sheet. Returns how many orders were rendered, so a
   * caller can decide against opening the print dialog for nothing.
   */
  function packingSlip(orders, options) {
    const list = (Array.isArray(orders) ? orders : [orders]).filter(Boolean);
    const settings = Object.assign({ showPrices: false }, options || {});
    const sheet = sheetElement();

    sheet.innerHTML = list.map((order, index) => `
      <article class="print-slip" data-order-id="${escapeText(order.orderId || '')}">
        ${slipHeaderHtml(order, index, list.length)}
        ${slipBodyHtml(order, settings)}
        ${giftNoteHtml(order)}
        ${slipFooterHtml(order)}
      </article>`).join('');

    return list.length;
  }

  /** Build the sheet and open the print dialog. Returns the order count. */
  function printOrders(orders, options) {
    const count = packingSlip(orders, options);
    if (!count) return 0;
    if (typeof window.print === 'function') window.print();
    return count;
  }

  /** Empty the sheet (kept between prints on purpose — see the file header). */
  function clear() {
    const sheet = document.getElementById(SHEET_ID);
    if (sheet) sheet.innerHTML = '';
  }

  window.VrindaPrint = {
    isLoaded: true,
    printOrders: printOrders,
    packingSlip: packingSlip,
    clear: clear
  };
})();

