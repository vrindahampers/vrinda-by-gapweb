#!/usr/bin/env node
/**
 * Drives the three live operations queues against the stub DOM.
 *
 * These are the screens whose tables are painted from a Realtime Database
 * subscription, and they are the ones that showed a placeholder for ever when
 * something in that path broke. Every check below stands for a way that
 * happened, or could happen again:
 *
 *   - the boot: auth gate -> service guard -> first paint
 *   - the row template, which one bad helper call can abort for a single role
 *     (escAttr called a function that did not exist, so the ledger stayed on
 *     "Loading orders ledger..." for owners while staff saw a healthy page)
 *   - the rejection callback, which the service used to drop on the floor, so
 *     unpublished rules looked exactly like an empty shop
 *   - the 12s watchdog, the only guard against a blocked socket, which reports
 *     neither a value nor an error
 *   - the failure row's Retry, which re-subscribes instead of forcing a reload
 *   - rows in view vs rows exported, which must not drift apart
 *
 * Usage:
 *   node tests/order-feed-harness.cjs                  # all three portals
 *   node tests/order-feed-harness.cjs staff            # just one
 *   node tests/order-feed-harness.cjs super-admin staff
 *
 * Exits 1 if any check fails, so it can gate a deploy.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { bootPortal, FEED_WATCHDOG_MS, ROOT } = require('./lib/portal-dom.cjs');

const PORTALS = {
  'super-admin': {
    label: 'Super Admin — Order Operations ledger',
    controller: 'js/admin-super-controller.js',
    page: 'admin/index.html',
    html: 'admin/index.html',
    tbody: 'ordersTbody',
    role: 'owner',                        // Super Admin++: the role that renders Delete
    visibleOrder: 'VRH-260928-ZZZZ',
    rowSelector: '.js-open-checklist',
    emptyCopy: /No orders yet/,
    prints: true                          // the page links css/print.css
  },
  staff: {
    label: 'Staff — order queue',
    controller: 'js/admin-staff-controller.js',
    page: 'admin/staff.html',
    html: 'admin/staff.html',
    tbody: 'staffOrdersTbody',
    role: 'staff',
    visibleOrder: 'VRH-260928-ZZZZ',
    rowSelector: '.js-open-checklist',
    emptyCopy: /No orders yet/,
    prints: true
  },
  delivery: {
    label: 'Delivery Manager — dispatch queue',
    controller: 'js/admin-delivery-controller.js',
    page: 'admin/delivery.html',
    html: 'admin/delivery.html',
    tbody: 'activeDeliveriesTbody',
    role: 'delivery',
    visibleOrder: 'VRH-260928-PACK',      // Packed is one of the hub's ACTIVE_STATUSES
    rowSelector: '.js-hub-update',
    emptyCopy: /No dispatches in transit/,
    prints: false
  }
};

/**
 * Four orders covering the branches the row templates switch on and the period
 * windows on the dashboard. Dates are relative to the day the harness runs, so
 * "today" and "last 7 days" stay meaningful instead of rotting:
 *
 *   - one placed today (courier, no coupon)
 *   - one delivered two days ago, with a coupon and a gift note (local express)
 *   - one Packed two days ago, with an unverified FamPay payment and an AWB
 *   - one cancelled four days ago, which no queue should show
 *
 * The nasty quotes and backticks in the first userId are deliberate: that value
 * ends up inside an HTML attribute via escAttr(), the function that used to throw.
 */
function ordersFixture() {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const today = startOfToday.getTime();
  const day = 24 * 60 * 60 * 1000;

  return [
    {
      orderId: 'VRH-260928-ZZZZ',
      userId: 'uid-"quote"-`tick`',
      status: 'Delivered',
      createdAt: today - 2 * day + 9.25 * 60 * 60 * 1000,   // 09:15, two days ago
      customer: { name: 'Anita "Sharma"', phone: '9876543210' },
      shipping: { city: 'Mumbai', pincode: '400001' },
      gifting: { occasion: 'Diwali', giftMessage: 'Happy Diwali, Nani! May this year be as sweet as the hampers you used to make.', deliverySlot: 'Morning (9am - 1pm)' },
      items: [{ name: 'Celebration Box', qty: 2 }],
      pricing: { subtotal: 2400, discount: 200, couponCode: 'VRINDA200', total: 2200 },
      payment: { mode: 'FamPay', status: 'PAID', verified: true },
      delivery: { type: 'local', riderName: 'Ravi' }
    },
    {
      orderId: 'VRH-260928-PACK',
      userId: 'uid-packed',
      status: 'Packed',
      createdAt: today - 2 * day + 11 * 60 * 60 * 1000,     // 11:00, two days ago
      customer: { name: 'Bhavna Rao', phone: '9812345678' },
      shipping: { city: 'Pune', pincode: '411001' },
      gifting: { deliverySlot: 'Evening' },
      items: [{ name: 'Diwali Delight', qty: 1 }],
      pricing: { subtotal: 1500, discount: 0, total: 1500 },
      payment: { mode: 'FamPay', status: 'PENDING', verified: false, utr: 'UTR-7788' },
      delivery: { type: 'courier', courierName: 'BlueDart', trackingNumber: 'AWB999' }
    },
    {
      orderId: 'VRH-260928-CANC',
      userId: 'uid-cancelled',
      status: 'Cancelled',
      createdAt: today - 4 * day + 18.5 * 60 * 60 * 1000,   // 18:30, four days ago
      customer: { name: 'Chetan Iyer', phone: '9000000000' },
      shipping: { city: 'Bengaluru', pincode: '560001' },
      items: [{ name: 'Thank You Hamper', qty: 1 }],
      pricing: { subtotal: 900, discount: 0, total: 900 },
      payment: { mode: 'FamPay', status: 'REFUNDED', verified: true },
      delivery: { type: 'local' }
    },
    {
      orderId: 'VRH-260930-TODAY',
      userId: 'uid-today',
      status: 'Payment Confirmed',
      createdAt: today + 9.5 * 60 * 60 * 1000,              // 09:30 today
      customer: { name: 'Deepa Menon', phone: '9822001100' },
      shipping: { city: 'Kochi', pincode: '682001' },
      gifting: { deliverySlot: 'Evening (4pm - 8pm)', isSurprise: true },
      items: [{ name: 'Festive Duo', qty: 1 }],
      pricing: { subtotal: 1000, discount: 0, total: 1000 },
      payment: { mode: 'FamPay', status: 'PAID', verified: true },
      delivery: { type: 'courier', courierName: 'India Post', trackingNumber: 'AWB-TODAY' }
    }
  ];
}

const CSV_HEADER = 'order_id,placed_on,status,customer,phone,city,pincode,delivery_type,slot,'
  + 'items,item_names,subtotal,discount,coupon,total,payment_mode,payment_verified,utr';

/* ------------------------------------------------------------------- CHECKS */

async function runPortal(key) {
  const cfg = PORTALS[key];
  const results = [];
  const check = (name, ok, detail) => {
    results.push({ name, ok: !!ok });
    console.log((ok ? '  PASS  ' : '  FAIL  ') + name
      + (!ok && detail !== undefined ? '  ->  ' + String(detail).replace(/\s+/g, ' ').slice(0, 150) : ''));
  };

  console.log('\n' + cfg.label);
  console.log('  ' + cfg.controller);

  const portal = await bootPortal(cfg);
  const { runtime, feed } = portal;
  const tbody = () => portal.html(cfg.tbody);
  const lastCsv = () => {
    const blob = runtime.blobs[runtime.blobs.length - 1];
    return blob && blob.parts ? blob.parts.join('') : '';
  };

  await portal.settle();

  /* -- the boot --------------------------------------------------------- */
  check('boots without throwing', runtime.errors.length === 0, runtime.errors[0]);
  check('logs nothing to console.error on a healthy boot',
    runtime.consoleErrors.length === 0, runtime.consoleErrors[0]);
  check('subscribes to the live orders feed',
    feed.ordersSubscriptions >= 1, 'subscriptions: ' + feed.ordersSubscriptions);
  check('passes a rejection callback, so a refused read cannot be invisible',
    typeof feed.ordersErr === 'function');
  check('replaces the "Loading..." row the page ships, on the first paint',
    !/Loading/.test(tbody()) && /Waiting for the (orders|dispatch) feed/.test(tbody()), tbody());
  check('arms a ' + (FEED_WATCHDOG_MS / 1000) + 's watchdog for a connection that never answers',
    runtime.timers.some((t) => t.ms === FEED_WATCHDOG_MS && !t.cleared),
    'timers: ' + JSON.stringify(runtime.timers.map((t) => t.ms)));

  /* -- a live snapshot -------------------------------------------------- */
  feed.snapshot(ordersFixture());
  check('paints ' + cfg.visibleOrder + ' from the live snapshot',
    tbody().includes(cfg.visibleOrder), tbody().slice(0, 140));
  check('binds row actions, so the row template ran to the end',
    portal.document.querySelectorAll(cfg.rowSelector).length > 0,
    'matched ' + portal.document.querySelectorAll(cfg.rowSelector).length + ' of ' + cfg.rowSelector);

  /* -- what each portal adds on top ------------------------------------- */
  if (cfg.prints) {
    const pageHtml = fs.readFileSync(path.join(ROOT, cfg.html), 'utf8');
    check('the page loads the print stylesheet with media="print"',
      /css\/print\.css"\s+media="print"/.test(pageHtml),
      'css/print.css is not linked, so printing would come out with the whole admin page');
  }

  if (key === 'super-admin') {
    // The stub creates any id it is asked for, so a typo between the controller and
    // the page would pass every other check and simply do nothing in a browser.
    // This is the wiring check that catches it.
    const markup = fs.readFileSync(path.join(ROOT, cfg.html), 'utf8');
    const wiredIds = [
      'orderDateFrom', 'orderDateTo', 'btnDateThisMonth', 'btnClearOrderDates',
      'ordersSelectAll', 'ordersBulkBar', 'ordersSelectedCount',
      'btnBulkMarkPacked', 'btnBulkPrint', 'btnBulkClear', 'ordersBadge',
      'statRevenueToday', 'statOrdersToday', 'statRevenue7', 'statOrders7',
      'statRevenue30', 'statOrders30'
    ];
    const missing = wiredIds.filter((id) => markup.indexOf('id="' + id + '"') === -1);
    check('every new ledger control exists in the page markup',
      missing.length === 0, 'missing: ' + missing.join(', '));

    // Adding the select column shifted every cell and colspan in this table, which
    // is exactly the kind of edit that silently misaligns a ledger.
    const ordersThead = (markup.split('id="ordersTbody"')[0].match(/<thead>[\s\S]*?<\/thead>/g) || []).pop() || '';
    const headerCells = (ordersThead.match(/<th[ >]/g) || []).length;
    const firstRow = (tbody().split('<tr>')[1] || '').split('</tr>')[0];
    const rowCells = (firstRow.match(/<td[ >]/g) || []).length;
    check('the ledger row still has one cell per header column',
      headerCells === 7 && rowCells === headerCells,
      headerCells + ' headers vs ' + rowCells + ' cells in the first row');

    check('the ledger row keeps the coupon discount line', /Coupon VRINDA200/.test(tbody()));
    check('flags a payment that still needs verifying', /Payment unverified/.test(tbody()));
    check('renders the owner-only Delete button without crashing the row',
      tbody().includes('js-delete-order'), tbody().slice(0, 140));
    check('escapes a hostile user id inside the delete attribute',
      tbody().includes('uid-&quot;quote&quot;-&#96;tick&#96;') && !tbody().includes('uid-"quote"'),
      (/data-user-id="[^"]*"/.exec(tbody()) || [''])[0]);

    const dialogsBefore = runtime.dialogs.length;
    const clickedDelete = portal.click('.js-delete-order');
    const confirmDialog = runtime.dialogs.slice(dialogsBefore).find((d) => d.type === 'confirm');
    check('the Delete button opens the two-step confirmation',
      clickedDelete && !!confirmDialog && confirmDialog.message.includes(cfg.visibleOrder),
      JSON.stringify(runtime.dialogs.slice(dialogsBefore).map((d) => d.type)));

    portal.click('#btnExportOrders');
    const zzzzLine = lastCsv().split('\n').find((line) => line.indexOf('VRH-260928-ZZZZ') === 0) || '';
    check('the export writes a CSV with the documented header',
      lastCsv().split('\n')[0] === CSV_HEADER, lastCsv().split('\n')[0]);
    check('the export carries the rows in view',
      lastCsv().includes('VRH-260928-ZZZZ') && lastCsv().includes('VRH-260928-PACK'),
      lastCsv().split('\n').length + ' lines');
    check('amounts stay plain numbers, so Sheets can total a column',
      zzzzLine.includes(',2400,200,VRINDA200,2200,') && !/₹/.test(lastCsv()), zzzzLine);

    const search = portal.document.getElementById('orderSearchInput');
    search.value = 'ZZZZ';
    search.dispatch('input');
    portal.click('#btnExportOrders');
    check('the export follows the search box, so it exports the view, not the history',
      lastCsv().includes('VRH-260928-ZZZZ') && !lastCsv().includes('VRH-260928-PACK'),
      lastCsv().split('\n').length + ' lines');
    search.value = '';
    search.dispatch('input');

    /* Period performance and the Orders badge ------------------------------ */
    const cardText = (id) => portal.document.getElementById(id).textContent;
    check('fills the period revenue cards from the snapshot',
      cardText('statRevenueToday') === '₹1,000' && cardText('statOrdersToday') === '1 order'
      && cardText('statRevenue7') === '₹4,700' && cardText('statOrders7') === '3 orders',
      [cardText('statRevenueToday'), cardText('statOrdersToday'), cardText('statRevenue7'), cardText('statOrders7')].join(' | '));
    check('the 30 day window leaves the cancelled order out',
      cardText('statRevenue30') === '₹4,700' && cardText('statOrders30') === '3 orders',
      cardText('statRevenue30') + ' / ' + cardText('statOrders30'));

    const badge = portal.document.getElementById('ordersBadge');
    check('puts the unverified payment count on the Orders tab',
      badge.style.display === 'inline-flex' && badge.textContent === '1',
      badge.textContent + ' (' + badge.style.display + ')');

    /* Date range ----------------------------------------------------------- */
    const fromEl = portal.document.getElementById('orderDateFrom');
    const toEl = portal.document.getElementById('orderDateTo');
    const dayInput = (offsetDays) => {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() + offsetDays);
      const pad = (n) => String(n).padStart(2, '0');
      return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
    };

    fromEl.value = dayInput(-2);
    toEl.value = dayInput(-2);
    fromEl.dispatch('change');
    check('narrows the ledger to the chosen day',
      tbody().includes('VRH-260928-ZZZZ') && tbody().includes('VRH-260928-PACK')
      && !tbody().includes('VRH-260930-TODAY') && !tbody().includes('VRH-260928-CANC'),
      tbody().slice(0, 140));

    portal.click('#btnExportOrders');
    check('names the export after the date range it covers',
      (runtime.downloads[runtime.downloads.length - 1] || {}).name === 'orders-' + dayInput(-2) + '.csv',
      JSON.stringify(runtime.downloads[runtime.downloads.length - 1]));

    portal.click('#btnDateThisMonth');
    check('the "This month" preset spans the 1st to today',
      fromEl.value === dayInput(1 - new Date().getDate()) && toEl.value === dayInput(0),
      fromEl.value + ' → ' + toEl.value);

    portal.click('#btnClearOrderDates');
    check('clearing the dates brings every order back',
      fromEl.value === '' && toEl.value === '' && tbody().includes('VRH-260930-TODAY'),
      fromEl.value + ' / ' + toEl.value);

    /* Packing slips and gift notes ----------------------------------------- */
    portal.click('.js-print-order');
    const slip = portal.document.getElementById('printSheet').innerHTML;
    check('the row Print button builds a packing slip and opens the print dialog',
      runtime.prints === 1 && /Packing slip/.test(slip) && slip.includes('VRH-260928-ZZZZ'),
      'prints: ' + runtime.prints);
    check('the slip carries the address, the items and the payment line',
      slip.includes('Anita') && slip.includes('Celebration Box') && /PAID/.test(slip),
      slip.replace(/\s+/g, ' ').slice(0, 150));
    check('the gift note comes out with the slip',
      /Gift note/.test(slip) && slip.includes('Happy Diwali, Nani!'),
      slip.replace(/\s+/g, ' ').slice(0, 150));

    /* Selection and bulk actions ------------------------------------------- */
    const boxes = portal.document.querySelectorAll('.js-row-select');
    check('every ledger row carries a selection box', boxes.length === 4, 'boxes: ' + boxes.length);

    boxes[0].checked = true;
    boxes[0].dispatch('change');
    boxes[1].checked = true;
    boxes[1].dispatch('change');
    check('ticks raise the bulk bar with a live count',
      portal.document.getElementById('ordersSelectedCount').textContent === '2'
      && portal.document.getElementById('ordersBulkBar').style.display === 'flex',
      portal.document.getElementById('ordersSelectedCount').textContent + ' selected');

    portal.click('#btnBulkPrint');
    const bulkSlip = portal.document.getElementById('printSheet').innerHTML;
    const slipCount = (bulkSlip.match(/class="print-slip"/g) || []).length;
    check('Print slips renders one slip per selected order',
      runtime.prints === 2 && slipCount === 2,
      'prints: ' + runtime.prints + ', slips: ' + slipCount);

    runtime.confirmAnswer = true;
    portal.click('#btnBulkMarkPacked');
    await portal.settle();
    check('Mark Packed writes Packed through the service, once per selected order',
      runtime.statusUpdates.length === 2
      && runtime.statusUpdates.every((u) => u.status === 'Packed')
      && runtime.statusUpdates.map((u) => u.orderId).sort().join(',') === 'VRH-260928-PACK,VRH-260928-ZZZZ',
      JSON.stringify(runtime.statusUpdates));

    check('the selection clears when the bulk action finishes',
      portal.document.getElementById('ordersSelectedCount').textContent === '0'
      && portal.document.getElementById('ordersBulkBar').style.display === 'none',
      portal.document.getElementById('ordersSelectedCount').textContent);

    const selectAll = portal.document.getElementById('ordersSelectAll');
    selectAll.checked = true;
    selectAll.dispatch('change');
    check('the header box selects everything in view',
      portal.document.getElementById('ordersSelectedCount').textContent === '4',
      portal.document.getElementById('ordersSelectedCount').textContent + ' selected');
    portal.click('#btnBulkClear');
    runtime.confirmAnswer = false;
  }

  if (key === 'staff') {
    check('the queue keeps cancelled orders out',
      !tbody().includes('VRH-260928-CANC'), tbody().slice(0, 140));

    // The packing table is where slips get printed, so the queue carries the button.
    portal.click('.js-print-order');
    check('the queue can print a packing slip too',
      runtime.prints === 1 && /Packing slip/.test(portal.document.getElementById('printSheet').innerHTML),
      'prints: ' + runtime.prints);
  }

  if (key === 'delivery') {
    check('the completed archive separates Delivered orders',
      portal.html('completedDeliveriesTbody').includes('VRH-260928-ZZZZ'),
      portal.html('completedDeliveriesTbody').slice(0, 140));
    check('the queue shows only Packed / Assigned / Out For Delivery',
      !tbody().includes('VRH-260928-CANC') && !tbody().includes('VRH-260928-ZZZZ'),
      tbody().slice(0, 140));
  }

  /* -- the failure paths ------------------------------------------------ */
  feed.snapshot([]);
  check('an empty node says so instead of spinning',
    !/Loading/.test(tbody()) && cfg.emptyCopy.test(tbody()), tbody());

  feed.fail({ code: 'PERMISSION_DENIED', message: 'permission_denied at /orders' });
  check('a refused read names the cause and the fix',
    /PERMISSION_DENIED/.test(tbody()) && /firebase deploy --only database/.test(tbody()), tbody());
  check('the failure row offers a Retry',
    portal.document.querySelectorAll('.js-retry-orders').length > 0);

  const subscriptionsBefore = feed.ordersSubscriptions;
  const clickedRetry = portal.click('.js-retry-orders');
  check('Retry re-subscribes without a page reload',
    clickedRetry && feed.ordersSubscriptions === subscriptionsBefore + 1,
    'subscriptions ' + subscriptionsBefore + ' -> ' + feed.ordersSubscriptions);

  check('the watchdog replaces the spinner with a diagnostic',
    portal.fireTimers(FEED_WATCHDOG_MS) && /No answer from the/.test(tbody()), tbody());

  check('no error was thrown at any point in this run',
    runtime.errors.length === 0, runtime.errors[0]);

  /* -- a page where the order service never loaded ---------------------- */
  const degraded = await bootPortal(Object.assign({}, cfg, { omitOrders: true }));
  await degraded.settle();
  const degradedTable = degraded.html(cfg.tbody);
  check('names a missing order service instead of spinning',
    /order service did not load/.test(degradedTable) && !/Loading/.test(degradedTable),
    degradedTable.slice(0, 130));
  check('a page without the order service still boots cleanly',
    degraded.runtime.errors.length === 0, degraded.runtime.errors[0]);

  const passed = results.filter((r) => r.ok).length;
  return { passed, failed: results.length - passed, failures: results.filter((r) => !r.ok) };
}

/* --------------------------------------------------------------------- MAIN */

async function main() {
  const args = process.argv.slice(2);
  const unknown = args.filter((key) => !PORTALS[key]);
  if (unknown.length) {
    console.log('Unknown portal: ' + unknown.join(', '));
    console.log('Known portals: ' + Object.keys(PORTALS).join(', '));
    process.exitCode = 1;
    return;
  }

  const keys = args.length ? args : Object.keys(PORTALS);
  console.log('Order feed harness — ' + keys.length + ' portal(s)');

  let passed = 0;
  let failed = 0;
  const failures = [];

  for (const key of keys) {
    const outcome = await runPortal(key);
    passed += outcome.passed;
    failed += outcome.failed;
    outcome.failures.forEach((f) => failures.push(key + ': ' + f.name));
  }

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  if (failed) {
    console.log('\nFailed checks:');
    failures.forEach((name) => console.log('  - ' + name));
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('The harness itself threw:', err);
  process.exitCode = 1;
});

module.exports = { runPortal, PORTALS };



