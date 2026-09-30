#!/usr/bin/env node
/**
 * Checks the contract between the portals and js/order-service.js
 *
 * The portal harness stubs this file, so nothing else exercises it. That
 * matters because the second half of the "ledger stuck on Loading..." bug lived
 * here: the subscription never passed Firebase's rejection callback through, so
 * a refused read (unpublished rules) produced no callback at all. The portal
 * then had nothing to paint, and its spinner stayed for ever.
 *
 * These checks pin the contract the portals rely on:
 *   - a value listener on /orders and /cancellationRequests
 *   - a rejection handler registered alongside it, and handed to the caller
 *   - a refusal with no handler at all still warns, instead of vanishing
 *   - an absent SDK calls the caller's onError rather than hanging
 *   - a snapshot arrives as a newest-first array
 *
 * No Firebase SDK and no network: a small fake records what gets registered.
 *
 * Usage: node tests/order-service-harness.cjs
 */

'use strict';

const { createSandbox, loadScript } = require('./lib/portal-dom.cjs');

/** Stands in for firebase.database(), recording everything registered on it. */
function fakeFirebase() {
  const registrations = [];
  const database = () => ({
    ref: (path) => ({
      path,
      on: (event, handler, errorHandler) => registrations.push({ path, event, handler, errorHandler }),
      off: (event, handler) => registrations.push({ path, event: 'off:' + event, handler })
    })
  });
  database.ServerValue = { TIMESTAMP: 1774000000000 };
  return { database, registrations };
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok });
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name
    + (!ok && detail !== undefined ? '  ->  ' + String(detail).replace(/\s+/g, ' ').slice(0, 150) : ''));
}

function loadService(firebase) {
  const page = createSandbox({ page: 'admin/index.html', stubServices: false, firebase });
  try {
    loadScript(page.sandbox, 'js/order-service.js');
  } catch (err) {
    page.runtime.errors.push('load: ' + err.message);
  }
  return page;
}

/** What a Realtime Database hands a value listener. */
function snapshot(value) {
  return { val: () => value };
}

console.log('order-service.js contract');

const firebase = fakeFirebase();
const page = loadService(firebase);
const Orders = page.sandbox.VrindaOrders;

check('loads without throwing', page.runtime.errors.length === 0, page.runtime.errors[0]);
check('exposes Orders on window', !!(Orders && typeof Orders.listenToAllOrders === 'function'));

/* ------------------------------------------------------------ orders feed */

const delivered = [];
let refusal = null;
const unsubscribe = Orders.listenToAllOrders((orders) => delivered.push(orders), (err) => { refusal = err; });
const listener = firebase.registrations.filter((r) => r.path === 'orders' && r.event === 'value').pop();

check('registers a value listener on /orders (not the whole database)',
  !!listener, firebase.registrations.map((r) => r.path).join(', '));

// The fix: the third argument is Firebase's rejection callback. Without it a
// PERMISSION_DENIED read is indistinguishable from an empty shop.
check('registers a rejection handler alongside it',
  !!(listener && typeof listener.errorHandler === 'function'));

listener.handler(snapshot({
  older: { orderId: 'VRH-OLD', createdAt: 1000 },
  newer: { orderId: 'VRH-NEW', createdAt: 2000 }
}));
check('a snapshot reaches the caller as a newest-first array',
  delivered.length === 1 && Array.isArray(delivered[0])
  && delivered[0].map((o) => o.orderId).join(',') === 'VRH-NEW,VRH-OLD',
  JSON.stringify(delivered[0] && delivered[0].map((o) => o.orderId)));

listener.errorHandler({ code: 'PERMISSION_DENIED', message: 'permission_denied' });
check("a refusal reaches the caller's onError",
  !!refusal && refusal.code === 'PERMISSION_DENIED', JSON.stringify(refusal));

if (typeof unsubscribe === 'function') unsubscribe();
check('unsubscribe calls off("value", handler)',
  firebase.registrations.some((r) => r.event === 'off:value'),
  JSON.stringify(firebase.registrations.map((r) => r.event)));

/* ------------------------------------------------------ a refusal, plainly */

const quiet = fakeFirebase();
const quietPage = loadService(quiet);
quietPage.sandbox.VrindaOrders.listenToAllOrders(() => {});
const quietListener = quiet.registrations.filter((r) => r.path === 'orders' && r.event === 'value').pop();
let threw = null;
try {
  quietListener.errorHandler({ code: 'PERMISSION_DENIED' });
} catch (err) {
  threw = err;
}
check('a refusal with no onError warns instead of throwing or vanishing',
  !threw && quietPage.runtime.warnings.some((w) => /Orders subscription refused:/.test(w)),
  threw ? threw.message : JSON.stringify(quietPage.runtime.warnings));

/* --------------------------------------------------------------- no SDK -- */

const bare = loadService(undefined);   // a phone where the SDK never parsed
let sdkError = null;
bare.sandbox.VrindaOrders.listenToAllOrders(() => {}, (err) => { sdkError = err; });
check('an absent SDK calls onError (UNAVAILABLE) instead of hanging',
  !!sdkError && sdkError.code === 'UNAVAILABLE', JSON.stringify(sdkError));

/* --------------------------------------------------------- cancellations -- */

let cancelRefusal = null;
Orders.listenToCancellationRequests(() => {}, (err) => { cancelRefusal = err; });
const cancelListener = firebase.registrations
  .filter((r) => r.path === 'cancellationRequests' && r.event === 'value').pop();

check('registers a value listener on /cancellationRequests',
  !!cancelListener, firebase.registrations.map((r) => r.path).join(', '));
check('its rejection handler is passed through as well',
  !!(cancelListener && typeof cancelListener.errorHandler === 'function'));

cancelListener.errorHandler({ code: 'PERMISSION_DENIED' });
check('a refused cancellation read reaches the caller too',
  !!cancelRefusal && cancelRefusal.code === 'PERMISSION_DENIED', JSON.stringify(cancelRefusal));

/* ------------------------------------------------------------------ DONE -- */

const passed = results.filter((r) => r.ok).length;
const failed = results.length - passed;
console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed) {
  console.log('\nFailed checks:');
  results.filter((r) => !r.ok).forEach((r) => console.log('  - ' + r.name));
  process.exitCode = 1;
}
