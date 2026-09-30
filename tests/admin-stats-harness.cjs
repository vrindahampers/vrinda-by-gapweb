#!/usr/bin/env node
/**
 * Checks js/admin-service.js computeStats, the one function every dashboard
 * number comes from.
 *
 * The dashboard's four original cards and the three period cards added for
 * "what came in today / this week / this month" are all computed here, from the
 * live orders snapshot, in one place. That makes it worth pinning: an off-by-one
 * in a window, or money counted twice, is the kind of bug nobody notices until a
 * GST return or a stock order is wrong.
 *
 * computeStats is pure (orders, users, reviews in; numbers out), so this loads
 * the real file with no SDK and no DOM and calls it directly.
 *
 * Usage: node tests/admin-stats-harness.cjs
 */

'use strict';

const { createSandbox, loadScript } = require('./lib/portal-dom.cjs');

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok });
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name
    + (!ok && detail !== undefined ? '  ->  ' + String(detail).replace(/\s+/g, ' ').slice(0, 160) : ''));
}

console.log('admin-service.js computeStats');

const page = createSandbox({ page: 'admin/index.html', stubServices: false });
try {
  loadScript(page.sandbox, 'js/admin-service.js');
} catch (err) {
  page.runtime.errors.push('load: ' + err.message);
}

check('loads without throwing', page.runtime.errors.length === 0, page.runtime.errors[0]);

const Admin = page.sandbox.VrindaAdmin;
check('exposes computeStats', !!(Admin && typeof Admin.computeStats === 'function'));
if (!Admin || typeof Admin.computeStats !== 'function') {
  console.log('\n0 passed, ' + results.length + ' failed');
  process.exit(1);
}

const day = 24 * 60 * 60 * 1000;
const startOfToday = new Date();
startOfToday.setHours(0, 0, 0, 0);
const today = startOfToday.getTime();
const at = (daysAgo, hour) => today - daysAgo * day + (hour || 12) * 60 * 60 * 1000;

const orders = [
  // Today, and inside every window.
  { orderId: 'A', status: 'Payment Confirmed', createdAt: at(0, 9), pricing: { total: 1000 }, payment: { verified: true } },
  // Cancelled today: out of the money AND out of the counts, in every window.
  { orderId: 'B', status: 'Cancelled', createdAt: at(0, 10), pricing: { total: 500 }, payment: { verified: true } },
  // Six days ago: the oldest order that still counts as "last 7 days".
  { orderId: 'C', status: 'Packed', createdAt: at(6), pricing: { total: 200 }, payment: { verified: false } },
  // Seven days ago: outside "last 7 days", inside "last 30 days".
  { orderId: 'D', status: 'Assigned To Delivery', createdAt: at(7), pricing: { total: 400 }, payment: { verified: true } },
  // Twenty-nine days ago: the oldest order inside "last 30 days".
  { orderId: 'E', status: 'Delivered', createdAt: at(29), pricing: { total: 800 }, payment: { verified: true } },
  // Forty days ago: all-time only.
  { orderId: 'F', status: 'Delivered', createdAt: at(40), pricing: { total: 300 }, payment: { verified: true } },
  // No timestamp at all (an old record): all-time only, never in a window.
  { orderId: 'G', status: 'Packed', pricing: { total: 700 }, payment: { verified: true } }
];

const stats = Admin.computeStats(orders, [{ uid: 'u1' }, { uid: 'u2' }], [{ id: 'r1' }]);

check('counts every order, including the cancelled one',
  stats.totalOrders === 7, stats.totalOrders);
check('keeps cancelled money out of the all-time total',
  stats.totalRevenue === 3400, stats.totalRevenue);
check('counts only what was placed today, and skips a cancelled order',
  stats.revenueToday === 1000 && stats.ordersToday === 1,
  stats.revenueToday + ' / ' + stats.ordersToday);
check('"last 7 days" means today plus the previous six days',
  stats.revenue7 === 1200 && stats.orders7 === 2,
  stats.revenue7 + ' / ' + stats.orders7);
check('"last 30 days" means today plus the previous twenty-nine',
  stats.revenue30 === 2400 && stats.orders30 === 4,
  stats.revenue30 + ' / ' + stats.orders30);
check('an order with no timestamp stays out of the windows',
  stats.revenue30 === 2400, stats.revenue30);
check('counts the payments still waiting for a human',
  stats.unverifiedPayments === 1, stats.unverifiedPayments);
check('splits delivered, active and cancelled',
  stats.deliveredOrders === 2 && stats.cancelledOrders === 1 && stats.activeOrders === 4,
  [stats.deliveredOrders, stats.cancelledOrders, stats.activeOrders].join('/'));
check('reads customers and reviews from the lists it is given',
  stats.totalCustomers === 2 && stats.totalReviews === 1,
  stats.totalCustomers + '/' + stats.totalReviews);
check('survives empty input',
  (() => {
    const empty = Admin.computeStats([], null, undefined);
    return empty.totalOrders === 0 && empty.totalRevenue === 0 && empty.revenueToday === 0
      && empty.unverifiedPayments === 0 && empty.orders30 === 0;
  })(), JSON.stringify(Admin.computeStats([], null, undefined)));

const passed = results.filter((r) => r.ok).length;
const failed = results.length - passed;
console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed) {
  console.log('\nFailed checks:');
  results.filter((r) => !r.ok).forEach((r) => console.log('  - ' + r.name));
  process.exitCode = 1;
}
