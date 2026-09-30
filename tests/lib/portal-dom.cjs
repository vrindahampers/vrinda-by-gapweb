/**
 * vrindahampers - a tiny DOM for booting the operations portals under Node
 *
 * The three live operations screens (Super Admin ledger, Staff queue, Delivery
 * hub) all paint the same way: an async init gated behind auth, a Realtime
 * Database subscription with a rejection callback, then one innerHTML
 * assignment built from a .map() over the snapshot. Two production bugs lived
 * in exactly that seam, and neither was visible until a specific role or a
 * specific database state was hit in a browser:
 *
 *   - escAttr() called escText(), which does not exist, so every ledger row
 *     threw for owners/managers and the table stayed on "Loading orders
 *     ledger..." for ever.
 *   - A refused read (rules not published) produced no callback at all, because
 *     the order service never passed Firebase's error handler through.
 *
 * This harness boots the real controller file against this stub and drives the
 * feed by hand, so both cases are decided in milliseconds on every run instead
 * of in production.
 *
 * Deliberate limits, so nobody trusts it further than it goes:
 *   - innerHTML is parsed flat (no nesting), which is all the row templates
 *     need: the harness looks up buttons and rows, it does not lay them out.
 *   - Selectors: tag, .class, [attr], [attr="value"] and comma lists of those.
 *     Anything else returns [] rather than throwing.
 *   - No layout, no CSS, no navigation, no network. window.firebase is
 *     undefined, exactly like a phone that never loaded the SDK, which is why
 *     every service is stubbed here.
 *
 * No dependencies: plain Node, the `vm` module and the repository's own files.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
// Must match armOrdersWatchdog()/armStaffOrdersWatchdog()/armHubWatchdog().
const FEED_WATCHDOG_MS = 12000;

/* ----------------------------------------------------------------- ELEMENTS */

function parseAttributes(raw) {
  const attrs = {};
  const re = /([:@\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m;
  while ((m = re.exec(raw))) {
    const value = m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : ''));
    attrs[m[1].toLowerCase()] = value;
  }
  return attrs;
}


class StubElement {
  constructor(tagName, attrsRaw, doc) {
    this.ownerDocument = doc;
    this.tagName = String(tagName || 'div').toUpperCase();
    this._attrs = attrsRaw ? parseAttributes(attrsRaw) : {};
    this._listeners = Object.create(null);
    this._children = [];
    this._classes = new Set();
    this._html = '';
    this.style = {};
    this.value = '';
    this.checked = false;
    this.disabled = false;
    this.hidden = false;
    this.textContent = '';
    this.href = '';
    this.download = '';
    this.dataset = {};
    this.id = this._attrs.id || '';

    this.className = this._attrs.class || '';
    if (this.className) this.className.split(/\s+/).filter(Boolean).forEach((c) => this._classes.add(c));

    Object.keys(this._attrs).forEach((key) => {
      if (key.indexOf('data-') === 0) {
        this.dataset[key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = this._attrs[key];
      }
    });

    this.classList = {
      add: (c) => this._classes.add(c),
      remove: (c) => this._classes.delete(c),
      contains: (c) => this._classes.has(c),
      toggle: (c, force) => {
        const on = force === undefined ? !this._classes.has(c) : !!force;
        if (on) this._classes.add(c); else this._classes.delete(c);
        return on;
      }
    };
  }

  get innerHTML() {
    return this._html;
  }

  set innerHTML(html) {
    this._html = String(html == null ? '' : html);
    this._children = parseTags(this._html, this.ownerDocument);
  }

  addEventListener(type, fn) {
    if (typeof fn !== 'function') return;
    (this._listeners[type] = this._listeners[type] || []).push(fn);
  }

  removeEventListener(type, fn) {
    const handlers = this._listeners[type] || [];
    const at = handlers.indexOf(fn);
    if (at >= 0) handlers.splice(at, 1);
  }

  /** Fire every listener for `type`; returns how many ran. Used by the harness. */
  dispatch(type, event) {
    const handlers = (this._listeners[type] || []).slice();
    handlers.forEach((fn) => {
      try {
        fn.call(this, event || {
          type,
          target: this,
          preventDefault() {},
          stopPropagation() {}
        });
      } catch (err) {
        // A browser would log this and carry on. Recording it keeps the rest of
        // the harness running so one broken handler is not mistaken for the
        // harness itself failing.
        const runtime = this.ownerDocument && this.ownerDocument.__runtime;
        if (runtime) runtime.errors.push('listener(' + type + '): ' + err.message);
        else throw err;
      }
    });
    return handlers.length;
  }

  click() {
    const ran = this.dispatch('click');
    // A download link is how the CSV export leaves the page - the controller sets
    // a.download and clicks it - so record the filename for the checks.
    const runtime = this.ownerDocument && this.ownerDocument.__runtime;
    if (runtime && this.tagName === 'A' && this.download) {
      runtime.downloads.push({ name: this.download, href: this.href });
    }
    return ran;
  }

  getAttribute(name) {
    const key = String(name).toLowerCase();
    return key in this._attrs ? this._attrs[key] : null;
  }

  setAttribute(name, value) {
    this._attrs[String(name).toLowerCase()] = String(value);
  }

  removeAttribute(name) {
    delete this._attrs[String(name).toLowerCase()];
  }

  hasAttribute(name) {
    return String(name).toLowerCase() in this._attrs;
  }

  appendChild(child) {
    this._children.push(child);
    return child;
  }

  removeChild(child) {
    const at = this._children.indexOf(child);
    if (at >= 0) this._children.splice(at, 1);
    return child;
  }

  remove() {
    this._removed = true;
  }

  focus() {
    this.ownerDocument.activeElement = this;
  }

  blur() {}

  scrollIntoView() {}

  closest() {
    return null;
  }

  querySelectorAll(selector) {
    return matchAll(this._children, selector);
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
}

/** Flat tag scan: enough to find every button, row and cell the templates emit. */
function parseTags(html, doc) {
  const found = [];
  const re = /<([a-zA-Z][\w-]*)\b([^>]*)>/g;
  let m;
  while ((m = re.exec(html))) found.push(new StubElement(m[1], m[2], doc));
  return found;
}

function matchesSelector(el, rawPart) {
  const part = rawPart.trim();
  if (!part) return false;
  if (part[0] === '#') return el.id === part.slice(1);
  if (part[0] === '.') return el._classes.has(part.slice(1));
  if (part[0] === '[') {
    const m = /^\[([\w-]+)(?:\s*=\s*"?([^"\]]*)"?)?\]$/.exec(part);
    if (!m) return false;
    const value = el._attrs[m[1].toLowerCase()];
    return m[2] === undefined ? value !== undefined : value === m[2];
  }
  if (/^[a-zA-Z][\w-]*$/.test(part)) return el.tagName === part.toUpperCase();
  return false;
}

function matchAll(elements, selector) {
  // Comma lists are supported; a comma inside an attribute value is not, and
  // none of the portals' selectors need it.
  const parts = String(selector).split(',').map((s) => s.trim()).filter(Boolean);
  return elements.filter((el) => parts.some((part) => matchesSelector(el, part)));
}

/* ----------------------------------------------------------------- DOCUMENT */

function createDocument() {
  const doc = {
    readyState: 'complete',
    title: 'vrindahampers harness',
    activeElement: null,
    _ids: new Map(),
    _listeners: Object.create(null)
  };

  // Ids are looked up in the live tree first (a service may have created and
  // appended an element, like the print sheet), then created on demand: a
  // controller that queries a table gets an empty one and paints its empty state
  // instead of a TypeError.
  doc.getElementById = (id) => {
    const key = String(id);
    const existing = allElements(doc).find((el) => el.id === key);
    if (existing) return existing;
    const created = new StubElement('div', 'id="' + key + '"', doc);
    doc._ids.set(key, created);
    return created;
  };

  doc.createElement = (tag) => new StubElement(tag, '', doc);
  doc.querySelectorAll = (selector) => matchAll(allElements(doc), selector);
  doc.querySelector = (selector) => doc.querySelectorAll(selector)[0] || null;
  doc.addEventListener = (type, fn) => {
    (doc._listeners[type] = doc._listeners[type] || []).push(fn);
  };
  doc.removeEventListener = (type, fn) => {
    const handlers = doc._listeners[type] || [];
    const at = handlers.indexOf(fn);
    if (at >= 0) handlers.splice(at, 1);
  };

  doc.body = new StubElement('body', '', doc);
  doc.documentElement = new StubElement('html', '', doc);
  return doc;
}

/** Every element the portals could talk about: registered ids and their rows. */
function allElements(doc) {
  const out = [];
  const add = (el) => {
    out.push(el);
    el._children.forEach((child) => out.push(child));
  };
  doc._ids.forEach(add);
  doc.body._children.forEach(add);
  return out;
}

/* ------------------------------------------------------------------ RUNTIME */

/** Everything the harness asserts on, in one object. */
function createRuntime() {
  const runtime = {
    errors: [],          // sync throws during load/boot, async rejections, timer throws
    warnings: [],        // console.warn
    consoleErrors: [],   // console.error, kept apart so warnings never mask them
    dialogs: [],         // alert / confirm / prompt, in order
    blobs: [],           // every Blob handed to URL.createObjectURL (the CSV export)
    timers: [],          // recorded setTimeout/setInterval calls, never actually waited on
    confirmAnswer: false,// `false` so a stray delete in a test can never proceed
    promptAnswer: null,
    prints: 0,           // window.print() calls (the packing slips)
    downloads: [],       // <a download> clicks, so the CSV filename can be checked
    statusUpdates: [],   // every updateOrderStatus(orderId, status, note) the UI made
    feed: null
  };
  return runtime;
}

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(String(k)) ? map.get(String(k)) : null),
    setItem: (k, v) => map.set(String(k), String(v)),
    removeItem: (k) => map.delete(String(k)),
    clear: () => map.clear(),
    key: (i) => Array.from(map.keys())[i] || null,
    get length() {
      return map.size;
    }
  };
}

/** Just enough Blob for the CSV export to hand its text back to a check. */
class StubBlob {
  constructor(parts, options) {
    this.parts = (parts || []).map(String);
    this.type = (options && options.type) || '';
    this.size = this.parts.join('').length;
  }

  text() {
    return Promise.resolve(this.parts.join(''));
  }
}

function createWindow(document, runtime, portal) {
  const win = {
    document,
    location: {
      href: 'https://vrindahampers.in/' + portal.page,
      pathname: '/' + portal.page,
      origin: 'https://vrindahampers.in',
      search: '',
      hash: ''
    },
    navigator: { userAgent: 'vrindahampers portal harness', onLine: true },
    innerWidth: 390,   // a phone: the layout the owners actually use
    innerHeight: 844,
    localStorage: memoryStorage(),
    sessionStorage: memoryStorage(),
    // No SDK on purpose: every service is stubbed, and a test that silently
    // needed firebase would fail here rather than somewhere confusing.
    firebase: undefined,
    crypto: { randomUUID: () => 'harness-' + Math.random().toString(16).slice(2) },

    alert: (message) => runtime.dialogs.push({ type: 'alert', message: String(message) }),
    confirm: (message) => {
      runtime.dialogs.push({ type: 'confirm', message: String(message) });
      return runtime.confirmAnswer;
    },
    prompt: (message) => {
      runtime.dialogs.push({ type: 'prompt', message: String(message) });
      return runtime.promptAnswer;
    },

    // Timers are recorded, never waited on: the 12s watchdog is decided in a
    // millisecond, and a harness that slept 12 seconds per check would not run.
    setTimeout: (fn, ms) => {
      const id = runtime.timers.length + 1;
      runtime.timers.push({ id, fn, ms: Number(ms) || 0, cleared: false, interval: false });
      return id;
    },
    clearTimeout: (id) => {
      const timer = runtime.timers.find((t) => t.id === id);
      if (timer) timer.cleared = true;
    },
    setInterval: (fn, ms) => {
      const id = runtime.timers.length + 1;
      runtime.timers.push({ id, fn, ms: Number(ms) || 0, cleared: false, interval: true });
      return id;
    },
    clearInterval: (id) => {
      const timer = runtime.timers.find((t) => t.id === id);
      if (timer) timer.cleared = true;
    },
    requestAnimationFrame: (fn) => {
      fn(0);
      return 0;
    },
    cancelAnimationFrame: () => {},

    URL: {
      createObjectURL: (blob) => {
        runtime.blobs.push(blob);
        return 'blob:harness/' + runtime.blobs.length;
      },
      revokeObjectURL: () => {}
    },
    Blob: StubBlob,
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {}, removeEventListener() {} }),
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    scrollTo: () => {},
    open: (url) => {
      runtime.dialogs.push({ type: 'open', message: String(url) });
      return null;
    },
    fetch: () => Promise.reject(new Error('the harness does not do network calls')),
    print: () => {
      runtime.prints += 1;
    },
    console: {
      log: () => {},
      info: () => {},
      warn: (...args) => runtime.warnings.push(args.map(String).join(' ')),
      error: (...args) => runtime.consoleErrors.push(args.map(String).join(' '))
    }
  };

  return win;
}

/* ---------------------------------------------------------------- SERVICES */

// Mirrors js/auth.js ROLE_LEVELS exactly. `atLeast` is a numeric comparison, and
// manager (Super Admin+) / owner (Super Admin++) sit above superadmin - which is
// exactly who the ledger's delete button renders for, and so who hit escAttr.
const ROLE_RANK = {
  customer: 0,
  delivery: 1,
  staff: 2,
  superadmin: 3,
  manager: 4,
  owner: 5
};

const ROLE_LABELS = {
  owner: 'Super Admin++',
  manager: 'Super Admin+',
  superadmin: 'Super Admin',
  staff: 'Staff Admin',
  delivery: 'Delivery Manager',
  customer: 'Customer'
};

/**
 * The service layer, with the live feeds exposed as switches the harness pulls.
 * Everything else answers the way a healthy deployment would.
 */
function installServices(win, runtime, role, options) {
  const feed = {
    ordersSubscriptions: 0,
    cancellationsSubscriptions: 0,
    ordersCb: null,
    ordersErr: null,
    cancellationsCb: null,
    cancellationsErr: null,

    /** Push a snapshot at the portal, the way the Realtime Database would. */
    snapshot(orders) {
      if (typeof this.ordersCb !== 'function') {
        runtime.errors.push('the portal never subscribed to the orders feed');
        return;
      }
      try {
        this.ordersCb(orders);
      } catch (err) {
        // A throw inside the controller's row template: record it and let the
        // checks that look at the table report what is (or is not) on screen.
        runtime.errors.push('snapshot: ' + err.message);
      }
    },

    /** Refuse the read, the way unpublished database rules do. */
    fail(err) {
      if (typeof this.ordersErr !== 'function') {
        runtime.errors.push('the portal subscribed without a rejection callback, so a refused read is invisible');
        return;
      }
      try {
        this.ordersErr(err);
      } catch (thrown) {
        runtime.errors.push('refusal: ' + thrown.message);
      }
    }
  };
  runtime.feed = feed;

  const ok = async () => ({ success: true });
  const steps = [
    'Order Placed', 'Payment Confirmed', 'Awaiting Customization', 'Customer Contacted',
    'Photos Received', 'Customization Confirmed', 'Production Started', 'Packed',
    'Assigned To Delivery', 'Out For Delivery', 'Delivered'
  ];

  win.VrindaAuth = {
    ROLE_LABELS: ROLE_LABELS,
    roleLevel: (role) => ROLE_RANK[role] || 0,
    whenReady(callback) {
      if (typeof callback === 'function') {
        callback({ email: role + '@vrindahampers.in', uid: 'uid-' + role }, { role, name: 'Harness ' + role });
      }
    },
    requireAdminRole: () => true,
    atLeast: (required) => (ROLE_RANK[role] || 0) >= (ROLE_RANK[required] || 0)
  };

  win.VrindaOrders = {
    TIMELINE_STEPS: steps.map((label) => ({ label })),
    STATUS_FLOW: steps.slice(),
    listenToAllOrders(callback, onError) {
      feed.ordersSubscriptions += 1;
      feed.ordersCb = callback;
      feed.ordersErr = onError;
      return () => {};
    },
    listenToCancellationRequests(callback, onError) {
      feed.cancellationsSubscriptions += 1;
      feed.cancellationsCb = callback;
      feed.cancellationsErr = onError;
      if (typeof callback === 'function') callback([]);
      return () => {};
    },
    getWhatsAppAdminLink: (order, template) => 'https://wa.me/919999999999?text=' + encodeURIComponent(template + ' ' + (order && order.orderId)),
    assignDelivery: ok,
    updateDeliveryTracking: ok,
    // Recorded, so a check can prove a bulk action wrote the right status to the
    // right orders through the service, rather than only re-rendering the table.
    updateOrderStatus: async (orderId, status, note) => {
      runtime.statusUpdates.push({ orderId, status, note });
      return { success: true };
    },
    approveCancellationRequest: ok,
    rejectCancellationRequest: ok
  };

  win.VrindaAdmin = {
    CHECKLIST_STEPS: steps.map((label) => ({ label, message: label })),
    // Mirrors admin-service.js computeStats, period windows included, so the
    // dashboard checks exercise the same shapes the real service returns. The real
    // function has its own harness (tests/admin-stats-harness.cjs); this stub is
    // here so a portal can boot without the whole service layer.
    computeStats: (orders) => {
      const list = Array.isArray(orders) ? orders : [];
      const valid = list.filter((o) => o.status !== 'Cancelled');
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const dayMs = 24 * 60 * 60 * 1000;
      const placedAt = (o) => Number(o.createdAt) || Number(o.placedAt) || 0;
      const since = (ms) => valid.filter((o) => placedAt(o) >= ms);
      const sum = (rows) => rows.reduce((total, o) => total + Number((o.pricing && o.pricing.total) || 0), 0);
      const today = since(startOfToday.getTime());
      const week = since(startOfToday.getTime() - 6 * dayMs);
      const month = since(startOfToday.getTime() - 29 * dayMs);
      return {
        totalRevenue: sum(valid),
        totalOrders: list.length,
        activeOrders: valid.filter((o) => o.status !== 'Delivered').length,
        totalCustomers: 0,
        deliveredOrders: valid.filter((o) => o.status === 'Delivered').length,
        cancelledOrders: list.filter((o) => o.status === 'Cancelled').length,
        unverifiedPayments: valid.filter((o) => o.payment && o.payment.verified === false).length,
        revenueToday: sum(today),
        ordersToday: today.length,
        revenue7: sum(week),
        orders7: week.length,
        revenue30: sum(month),
        orders30: month.length
      };
    },
    listenToUsers: (callback) => {
      if (typeof callback === 'function') callback([]);
      return () => {};
    },
    listenToSettings: (callback) => {
      if (typeof callback === 'function') callback({});
      return () => {};
    },
    listenToSeo: (callback) => {
      if (typeof callback === 'function') callback({});
      return () => {};
    },
    listenToFaqs: (callback) => {
      if (typeof callback === 'function') callback([]);
      return () => {};
    },
    listenToCustomRequests: (callback) => {
      if (typeof callback === 'function') callback([]);
      return () => {};
    },
    listNewsletter: async () => [],
    downloadNewsletterCsv: () => {},
    markPaymentVerified: ok,
    deleteOrder: ok,
    updateUserRole: ok,
    saveSettings: ok,
    saveSeo: ok,
    saveFaq: ok,
    deleteFaq: ok,
    importSampleFaqs: ok,
    toggleChecklistStep: ok,
    updateCustomRequestStatus: ok
  };

  win.VrindaCatalog = {
    getAllProducts: async () => [],
    listenToAllReviews: (callback) => {
      if (typeof callback === 'function') callback([]);
      return () => {};
    },
    saveProduct: ok,
    deleteProduct: ok,
    deleteReview: ok
  };

  win.VrindaStore = {
    listenToCoupons: (callback) => {
      if (typeof callback === 'function') callback([]);
      return () => {};
    },
    saveCoupon: ok,
    deleteCoupon: ok
  };

  // A page where order-service.js never loaded or threw on parse: the portals
  // must name the missing script rather than keep their spinner. This is the
  // same class of failure as an unpublished-rules refusal, one layer up.
  if (options && options.omitOrders) delete win.VrindaOrders;

  return feed;
}

/* -------------------------------------------------------------------- BOOT */

function loadScript(sandbox, relPath) {
  const src = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  // The filename is passed through so a stack trace names the real file and
  // line, not "<anonymous>": that is what makes a failure actionable.
  vm.runInContext(src, sandbox, { filename: relPath });
}

/** The two relevant stack frames, with the vm's file names kept intact. */
function whereThrown(err) {
  const frames = String((err && err.stack) || '').split('\n').slice(1)
    .map((line) => line.trim())
    .filter((line) => /\.js:\d+/.test(line))
    .slice(0, 2)
    .map((line) => line.replace(/^at\s+/, ''));
  return frames.length ? '  [' + frames.join('  <-  ') + ']' : '';
}

/** Copy the tbody the page ships, so the harness can prove it gets replaced. */
function seedTbody(document, htmlRelPath, tbodyId) {
  const html = fs.readFileSync(path.join(ROOT, htmlRelPath), 'utf8');
  const re = new RegExp('<tbody[^>]*id="' + tbodyId + '"[^>]*>([\\s\\S]*?)</tbody>');
  const match = re.exec(html);
  document.getElementById(tbodyId).innerHTML = match ? match[1].trim() : '';
}

/**
 * A contextified page: DOM, window and runtime, with the SDK or the service
 * stubs installed as asked, but no controller booted yet. bootPortal() builds on
 * this; the service-level harness uses it directly to load one file and poke it.
 */
function createSandbox(options) {
  const config = options || {};
  const document = createDocument();
  const runtime = createRuntime();
  const sandbox = createWindow(document, runtime, { page: config.page || 'admin/index.html' });

  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  if (config.firebase) sandbox.firebase = config.firebase;
  vm.createContext(sandbox);

  // The stubs are what the pages see when everything works. `stubServices:false`
  // leaves the services absent, which is how the downgrade paths get tested.
  if (config.stubServices !== false) installServices(sandbox, runtime, config.role || 'manager', config);
  // So a listener that throws while the harness is clicking (dispatched by
  // StubElement.dispatch) is recorded rather than fatal.
  document.__runtime = runtime;
  return { sandbox, document, runtime };
}

/**
 * Boot one portal against the stub and hand back the switches.
 *
 * @param {object} options
 * @param {string} options.controller repository-relative path to the controller
 * @param {string} options.html       the page whose tbody placeholder to copy
 * @param {string} options.tbody      id of that tbody
 * @param {string} options.page       location.pathname for the page being booted
 * @param {string} options.role       role the fake auth session reports
 * @returns {Promise<object>} { window, document, runtime, feed, settle, fireTimers, html, click }
 */
async function bootPortal(options) {
  const config = options || {};
  const page = createSandbox(config);
  const document = page.document;
  const sandbox = page.sandbox;
  const runtime = page.runtime;

  if (config.tbody) seedTbody(document, config.html, config.tbody);

  try {
    loadScript(sandbox, 'assets/data/sample-data.js');   // both pages load this first
    // print-service.js is listed on the admin pages that print, before the
    // controller; loading it here keeps the harness in step with the page.
    loadScript(sandbox, 'js/print-service.js');
    loadScript(sandbox, config.controller);
  } catch (err) {
    runtime.errors.push('load: ' + err.message + whereThrown(err));
  }

  // Fire DOMContentLoaded the way the browser does. These listeners are the
  // portals' init functions: the async ones hand back a promise, and a throw in
  // there would otherwise vanish into an unhandled rejection.
  const pending = [];
  (document._listeners.DOMContentLoaded || []).forEach((fn) => {
    try {
      const result = fn({ type: 'DOMContentLoaded' });
      if (result && typeof result.then === 'function') pending.push(result);
    } catch (err) {
      runtime.errors.push('sync: ' + err.message + whereThrown(err));
    }
  });
  pending.forEach((p) => p.then(null, (err) => runtime.errors.push('async: ' + err.message + whereThrown(err))));

  /** Let every await in the boot chain finish. Real ticks, faked timers. */
  const settle = async (ticks) => {
    const rounds = ticks || 20;
    for (let i = 0; i < rounds; i += 1) await new Promise((resolve) => setImmediate(resolve));
  };

  /** Run the last armed timer of `ms` (the 12s watchdogs), reporting a throw. */
  const fireTimers = (ms) => {
    const timer = runtime.timers.filter((t) => t.ms === ms && !t.cleared).pop();
    if (!timer) return false;
    try {
      timer.fn();
    } catch (err) {
      runtime.errors.push('timer: ' + err.message + whereThrown(err));
    }
    return true;
  };

  return {
    window: sandbox,
    document,
    runtime,
    feed: runtime.feed,
    settle,
    fireTimers,
    html: (id) => document.getElementById(id).innerHTML,
    click: (selector) => {
      const el = document.querySelector(selector);
      if (!el) return false;
      el.dispatch('click');
      return true;
    }
  };
}

module.exports = { bootPortal, createSandbox, loadScript, FEED_WATCHDOG_MS, ROLE_RANK, ROOT };



