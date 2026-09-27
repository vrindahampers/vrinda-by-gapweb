/**
 * vrindahampers - Commerce Store Service (Phase 4)
 *
 * The single source of truth for the RTDB-backed cart, wishlist and money math.
 *  - Cart        -> /cart/{uid}       (items + applied coupon, live synced)
 *  - Wishlist    -> /wishlist/{uid}   (items, live synced)
 *  - Coupons     -> /coupons/{CODE}   (admin managed, seeded from VRINDA_DATA.coupons)
 *
 * Guests who click "Add to Cart" before logging in are not punished: the action is
 * stashed in localStorage and flushed into their RTDB cart the moment they log in,
 * which is what makes the cart survive sessions and devices.
 */

(function () {
  'use strict';

  const CART_NODE = 'cart';
  const WISHLIST_NODE = 'wishlist';
  const LOCAL_KEY = 'vrinda:commerce-pending';

  const DEFAULT_CONFIG = {
    currency: 'INR',
    currencySymbol: '₹',
    freeShippingThreshold: 1499,
    standardShippingFee: 99,
    expressShippingFee: 249,
    whatsappNumber: '919876543210',
    supportEmail: 'care@vrindahampers.in',
    maxGiftMessageLength: 500
  };

  const Store = {
    cart: { items: {}, coupon: null },
    wishlist: { items: {} },
    ready: false,

    _uid: null,
    _cartRef: null,
    _wishlistRef: null,
    _cartHandler: null,
    _wishlistHandler: null,
    _cartListeners: [],
    _wishlistListeners: [],
    _hasOrdersCache: null,
    _catalogCache: null,
    // Live overrides pushed from the admin-managed /settings + /seo RTDB nodes.
    _rtdbConfig: {},
    _seo: {},
    _faqs: [],
    // Resolved by the first /cart/{uid} snapshot so pages can await the real cart
    // instead of painting a false "empty cart" while the read is still in flight.
    _cartReady: null,
    _resolveCartReady: null,

    /* ------------------------------------------------------------------ utils */

    config: function () {
      const base = (window.VRINDA_DATA && window.VRINDA_DATA.commerceConfig) || {};
      // Defaults < local sample config < admin-managed /settings node.
      return Object.assign({}, DEFAULT_CONFIG, base, this._rtdbConfig);
    },

    seo: function () {
      return this._seo || {};
    },

    /* ------------------------------------------------------------------- FAQs */

    /**
     * Homepage FAQ content, admin-managed in the Super Admin portal and stored at
     * /faqs/{id}. The bundled sample answers render until the node is populated
     * (or if the read is denied / offline).
     */
    faqList: function () {
      if (this._faqs && this._faqs.length) return this._faqs;
      return (window.VRINDA_DATA && window.VRINDA_DATA.faqs) || [];
    },

    money: function (value) {
      const cfg = this.config();
      return cfg.currencySymbol + Math.round(Number(value) || 0).toLocaleString('en-IN');
    },

    _db: function () {
      if (typeof firebase === 'undefined' || !firebase.database) return null;
      return firebase.database();
    },

    _stamp: function () {
      const db = this._db();
      return db ? firebase.database.ServerValue.TIMESTAMP : Date.now();
    },

    isLoggedIn: function () {
      return !!(window.VrindaAuth && window.VrindaAuth.currentUser);
    }
  };

  /* ------------------------------------------------- init & realtime syncing */

  Store.init = function () {
    if (this.ready) return;
    this.ready = true;

    this.bindDelegatedActions();
    this.loadStoreSettings();
    this.loadFaqs();

    const auth = window.VrindaAuth;
    if (auth && typeof auth.onAuthChange === 'function') {
      auth.onAuthChange((user) => this._handleAuth(user));
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        if (window.VrindaAuth) window.VrindaAuth.onAuthChange((user) => Store._handleAuth(user));
      });
    }
  };

  Store._handleAuth = function (user) {
    const uid = user ? user.uid : null;
    if (uid === this._uid) return;

    this._uid = uid;
    this._hasOrdersCache = null;

    if (uid) {
      this._bindUser(uid);
      this._flushPending(uid);
    } else {
      this._unbindUser();
    }
  };

  Store._bindUser = function (uid) {
    const db = this._db();
    if (!db) return;

    this._unbindUser();
    this._uid = uid;
    this._cartReady = new Promise((resolve) => { this._resolveCartReady = resolve; });

    const settleCartReady = () => {
      if (!this._resolveCartReady) return;
      const resolve = this._resolveCartReady;
      this._resolveCartReady = null;
      resolve(this.cart);
    };

    this._cartRef = db.ref(CART_NODE + '/' + uid);
    this._cartHandler = this._cartRef.on('value', (snap) => {
      const val = snap.val() || {};
      this.cart = {
        items: val.items || {},
        coupon: val.coupon || null
      };
      this.refreshBadges();
      this._notify(this._cartListeners, this.cart);
      settleCartReady();
    }, (err) => {
      // A denied or offline read must not strand the checkout on a spinner.
      console.warn('Cart sync warning:', err.message);
      settleCartReady();
    });

    this._wishlistRef = db.ref(WISHLIST_NODE + '/' + uid);
    this._wishlistHandler = this._wishlistRef.on('value', (snap) => {
      const val = snap.val() || {};
      this.wishlist = { items: val.items || {} };
      this.refreshBadges();
      this._notify(this._wishlistListeners, this.wishlist);
    }, (err) => console.warn('Wishlist sync warning:', err.message));
  };

  Store._unbindUser = function () {
    if (this._cartRef && this._cartHandler) this._cartRef.off('value', this._cartHandler);
    if (this._wishlistRef && this._wishlistHandler) this._wishlistRef.off('value', this._wishlistHandler);

    // Never leave a whenCartReady() waiter hanging when the user signs out.
    if (this._resolveCartReady) {
      const resolve = this._resolveCartReady;
      this._resolveCartReady = null;
      resolve(this.cart);
    }
    this._cartReady = null;

    this._cartRef = null;
    this._wishlistRef = null;
    this._cartHandler = null;
    this._wishlistHandler = null;
    this._uid = null;
    this.cart = { items: {}, coupon: null };
    this.wishlist = { items: {} };
    this.refreshBadges();
  };

  Store._notify = function (listeners, payload) {
    listeners.forEach((cb) => {
      try { cb(payload); } catch (e) { console.error('Commerce listener error:', e); }
    });
  };

  Store.onCartChange = function (cb) {
    if (typeof cb !== 'function') return;
    this._cartListeners.push(cb);
    cb(this.cart);
  };

  /**
   * Waits for the first /cart/{uid} snapshot (the RTDB read is asynchronous, so
   * a page that checks the cart the instant auth resolves sees an empty cart).
   * Falls back to the current state after timeoutMs so a denied or offline read
   * can never hang the caller.
   * @returns {Promise<{items: object, coupon: ?string}>}
   */
  Store.whenCartReady = function (timeoutMs) {
    if (!this._cartReady) return Promise.resolve(this.cart);
    return Promise.race([
      this._cartReady,
      new Promise((resolve) => setTimeout(() => resolve(this.cart), timeoutMs || 3000))
    ]);
  };

  Store.onWishlistChange = function (cb) {
    if (typeof cb !== 'function') return;
    this._wishlistListeners.push(cb);
    cb(this.wishlist);
  };

  /* ------------------------------------------------------ local (guest) stash */

  Store._readLocal = function () {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_KEY)) || { cart: {}, wishlist: {} };
    } catch (e) {
      return { cart: {}, wishlist: {} };
    }
  };

  Store._writeLocal = function (data) {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(data)); } catch (e) { /* storage disabled */ }
  };

  Store._stashPending = function (bucket, productId, value) {
    const local = this._readLocal();
    if (!local[bucket]) local[bucket] = {};
    local[bucket][productId] = value;
    this._writeLocal(local);
  };

  Store._dropPending = function (bucket, productId) {
    const local = this._readLocal();
    if (local[bucket]) delete local[bucket][productId];
    this._writeLocal(local);
  };

  /* ------------------------------------------------------------- line builder */

  Store.toLine = function (product, qty) {
    const quantity = Math.max(1, parseInt(qty, 10) || 1);
    const slug = product.slug || (product.name || product.productId || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    return {
      productId: product.productId || product.id,
      name: product.name || 'vrindahampers gift',
      slug: slug,
      category: product.category || '',
      categoryName: product.categoryName || product.category || 'Bespoke Gift',
      price: Number(product.price) || 0,
      originalPrice: Number(product.originalPrice) || Number(product.price) || 0,
      image: product.image || '',
      isPersonalized: !!product.isPersonalized,
      qty: quantity
    };
  };

  /* ------------------------------------------------------------------- toasts */

  Store.toast = function (message, type) {
    const host = document.getElementById('vrindaToastHost') || (function () {
      const el = document.createElement('div');
      el.id = 'vrindaToastHost';
      el.className = 'vrinda-toast-host';
      document.body.appendChild(el);
      return el;
    })();

    const node = document.createElement('div');
    node.className = 'vrinda-toast vrinda-toast-' + (type || 'success');
    node.innerHTML = '<span>' + message + '</span>';
    host.appendChild(node);

    setTimeout(() => node.classList.add('show'), 10);
    setTimeout(() => {
      node.classList.remove('show');
      setTimeout(() => node.remove(), 300);
    }, 3200);
  };

  /* --------------------------------------------------------------- cart write */

  Store.addToCart = async function (product, qty) {
    const quantity = Math.max(1, parseInt(qty, 10) || 1);
    const line = this.toLine(product, quantity);

    // Guests: keep the intention, then send them through the login gate.
    if (!this.isLoggedIn()) {
      this._stashPending('cart', line.productId, line);
      this.toast('💾 Saved “' + line.name + '” — log in to keep it in your cart.', 'info');
      if (window.VrindaAuth) {
        window.VrindaAuth.requireGate('cart', {
          notice: '“' + line.name + '” is waiting for you. It will move into your cart the moment you log in.'
        });
      }
      return { success: true, pending: true, message: 'Item saved locally. Log in to sync your cart.' };
    }

    const db = this._db();
    if (!db) return { success: false, error: 'Cart storage is unavailable right now.' };

    try {
      const itemRef = db.ref(CART_NODE + '/' + this._uid + '/items/' + line.productId);
      const snap = await itemRef.once('value');
      const existing = snap.val();

      await itemRef.set(existing
        ? Object.assign({}, existing, { qty: (parseInt(existing.qty, 10) || 0) + quantity })
        : line);

      await db.ref(CART_NODE + '/' + this._uid + '/updatedAt').set(this._stamp());
      this.toast('🛍️ Added “' + line.name + '” to your cart.', 'success');
      return { success: true, itemCount: this.getCartCount() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  Store.updateQty = async function (productId, qty) {
    const quantity = parseInt(qty, 10) || 0;
    if (quantity <= 0) return this.removeFromCart(productId);
    if (!this._uid || !this._db()) return { success: false, error: 'Please log in to update your cart.' };

    try {
      await this._db().ref(CART_NODE + '/' + this._uid + '/items/' + productId).update({
        qty: Math.min(quantity, 25)
      });
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  Store.removeFromCart = async function (productId) {
    if (!this._uid || !this._db()) return { success: false, error: 'Please log in to modify your cart.' };
    try {
      await this._db().ref(CART_NODE + '/' + this._uid + '/items/' + productId).remove();
      this._dropPending('cart', productId);
      await this._db().ref(CART_NODE + '/' + this._uid + '/updatedAt').set(this._stamp());
      this.toast('Removed from your cart.', 'info');
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  Store.clearCart = async function (keepCoupon) {
    if (!this._uid || !this._db()) return { success: false, error: 'Please log in to modify your cart.' };
    try {
      const payload = { items: null, updatedAt: this._stamp() };
      if (!keepCoupon) payload.coupon = null;
      await this._db().ref(CART_NODE + '/' + this._uid).update(payload);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  Store._flushPending = async function (uid) {
    const local = this._readLocal();
    const db = this._db();
    if (!db) return;

    const pendingCart = Object.keys(local.cart || {});
    const pendingWish = Object.keys(local.wishlist || {});

    if (pendingCart.length === 0 && pendingWish.length === 0) return;

    try {
      for (const productId of pendingCart) {
        const line = local.cart[productId];
        const itemRef = db.ref(CART_NODE + '/' + uid + '/items/' + productId);
        const snap = await itemRef.once('value');
        const existing = snap.val();
        await itemRef.set(existing ? Object.assign({}, line, { qty: (parseInt(existing.qty, 10) || 0) + (parseInt(line.qty, 10) || 1) }) : line);
      }

      for (const productId of pendingWish) {
        await db.ref(WISHLIST_NODE + '/' + uid + '/items/' + productId).set(local.wishlist[productId]);
      }

      this._writeLocal({ cart: {}, wishlist: {} });
      this.toast('✅ Saved items moved into your account cart.', 'success');
    } catch (err) {
      console.warn('Pending cart merge failed:', err.message);
    }
  };

  /* ------------------------------------------------------------- cart reading */

  Store.getCartItems = function () {
    const items = this.cart.items || {};
    return Object.values(items)
      .filter((item) => item && item.productId)
      .sort((a, b) => (b.qty * b.price) - (a.qty * a.price));
  };

  Store.getCartCount = function () {
    return this.getCartItems().reduce((sum, item) => sum + (parseInt(item.qty, 10) || 0), 0);
  };

  Store.getSubtotal = function () {
    return this.getCartItems().reduce((sum, item) => sum + (Number(item.price) || 0) * (parseInt(item.qty, 10) || 0), 0);
  };

  Store.getMrpTotal = function () {
    return this.getCartItems().reduce((sum, item) => {
      const mrp = Number(item.originalPrice) || Number(item.price) || 0;
      return sum + mrp * (parseInt(item.qty, 10) || 0);
    }, 0);
  };

  Store.isEmpty = function () {
    return this.getCartCount() === 0;
  };

  /* --------------------------------------------------------- coupon engine */

  Store._catalogCoupons = function () {
    return (window.VRINDA_DATA && window.VRINDA_DATA.coupons) || [];
  };

  /**
   * Real-time subscription to all coupons (Admin)
   */
  Store.listenToCoupons = function (callback) {
    const db = this._db();
    if (!db || typeof callback !== 'function') {
      if (typeof callback === 'function') callback(this._catalogCoupons());
      return () => {};
    }

    const ref = db.ref('coupons');
    const handler = (snap) => {
      if (snap.exists()) {
        const val = snap.val() || {};
        const list = Object.keys(val).map(k => Object.assign({ code: k }, val[k]));
        callback(list);
      } else {
        callback(this._catalogCoupons());
      }
    };
    ref.on('value', handler);
    return () => ref.off('value', handler);
  };

  /**
   * Save or update coupon (Admin)
   */
  Store.saveCoupon = async function (couponData) {
    const db = this._db();
    if (!db) return { success: false, error: 'Database unavailable' };
    const code = String(couponData.code || '').trim().toUpperCase();
    if (!code) return { success: false, error: 'Coupon code is required' };

    try {
      await db.ref('coupons/' + code).set(Object.assign({}, couponData, { code: code }));
      return { success: true, coupon: couponData };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  /**
   * Delete coupon (Admin)
   */
  Store.deleteCoupon = async function (code) {
    const db = this._db();
    if (!db) return { success: false, error: 'Database unavailable' };
    const normalised = String(code || '').trim().toUpperCase();
    try {
      await db.ref('coupons/' + normalised).remove();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  Store.findCoupon = async function (code) {
    const normalised = String(code || '').trim().toUpperCase();
    if (!normalised) return null;

    const db = this._db();
    if (db) {
      try {
        const snap = await db.ref('coupons/' + normalised).once('value');
        if (snap.exists()) return Object.assign({ code: normalised }, snap.val());
      } catch (err) {
        console.warn('Coupon lookup fell back to local seeds:', err.message);
      }
    }

    const local = this._catalogCoupons().find((c) => String(c.code).toUpperCase() === normalised);
    return local ? Object.assign({}, local) : null;
  };

  Store._hasPreviousOrders = async function () {
    if (this._hasOrdersCache !== null) return this._hasOrdersCache;
    const db = this._db();
    if (!db || !this._uid) return false;

    try {
      const snap = await db.ref('userOrders/' + this._uid).once('value');
      this._hasOrdersCache = snap.exists();
    } catch (err) {
      this._hasOrdersCache = false;
    }
    return this._hasOrdersCache;
  };

  /**
   * Validates a coupon against the live cart.
   * @returns {{valid: boolean, coupon?: object, discount?: number, freeShipping?: boolean, message: string}}
   */
  Store.validateCoupon = async function (code) {
    const coupon = await this.findCoupon(code);
    if (!coupon) {
      return { valid: false, message: 'That coupon code is not recognised. Please check the spelling.' };
    }
    if (coupon.active === false) {
      return { valid: false, message: 'This coupon has expired.' };
    }

    const subtotal = this.getSubtotal();
    const minOrder = Number(coupon.minOrder) || 0;
    if (subtotal < minOrder) {
      return {
        valid: false,
        message: 'Add ' + this.money(minOrder - subtotal) + ' more to unlock ' + coupon.code + ' (minimum order ' + this.money(minOrder) + ').'
      };
    }

    if (coupon.firstOrderOnly && await this._hasPreviousOrders()) {
      return { valid: false, message: coupon.code + ' is valid on your first order only.' };
    }

    const type = coupon.type || 'flat';
    let discount = 0;
    let freeShipping = false;

    if (type === 'percent') {
      discount = Math.round(subtotal * (Number(coupon.value) || 0) / 100);
      if (coupon.maxDiscount) discount = Math.min(discount, Number(coupon.maxDiscount));
    } else if (type === 'flat') {
      discount = Math.min(Number(coupon.value) || 0, subtotal);
    } else if (type === 'shipping') {
      freeShipping = true;
    } else {
      return { valid: false, message: 'This coupon type is not supported by the storefront yet.' };
    }

    return {
      valid: true,
      coupon: coupon,
      discount: discount,
      freeShipping: freeShipping,
      message: coupon.description || (coupon.code + ' applied successfully!')
    };
  };

  Store.applyCoupon = async function (code) {
    const result = await this.validateCoupon(code);
    if (!result.valid) return result;

    if (!this.isLoggedIn()) {
      this._stashPending('coupon', 'code', result.coupon.code);
      return Object.assign(result, { pending: true });
    }

    try {
      await this._db().ref(CART_NODE + '/' + this._uid + '/coupon').set(result.coupon.code);
    } catch (err) {
      return { valid: false, message: 'Could not save the coupon: ' + err.message };
    }

    this.cart.coupon = result.coupon.code;
    this.toast('🎟️ ' + result.message, 'success');
    return result;
  };

  Store.removeCoupon = async function () {
    if (this._uid && this._db()) {
      try {
        await this._db().ref(CART_NODE + '/' + this._uid + '/coupon').remove();
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
    this._dropPending('coupon', 'code');
    this.cart.coupon = null;
    return { success: true };
  };

  /* ------------------------------------------------------------------ totals */

  /**
   * Live order math. All prices in the catalog are tax inclusive, so the only
   * additions are the shipping fee (0 when the free-delivery promise applies).
   */
  Store.getTotals = async function (options) {
    const opts = options || {};
    const cfg = this.config();
    const items = this.getCartItems();
    const subtotal = this.getSubtotal();
    const mrpTotal = this.getMrpTotal();

    let discount = 0;
    let freeShipping = false;
    let appliedCoupon = null;
    let couponName = '';
    let couponMessage = '';
    let couponRejected = false;

    const code = opts.couponCode || this.cart.coupon;
    if (code) {
      const verdict = await this.validateCoupon(code);
      if (verdict.valid) {
        discount = verdict.discount || 0;
        freeShipping = !!verdict.freeShipping;
        appliedCoupon = verdict.coupon.code;
        couponName = verdict.coupon.label || verdict.coupon.description || '';
        couponMessage = verdict.message;
      } else {
        couponRejected = true;
        couponMessage = verdict.message;
      }
    }

    const shippingMode = opts.shippingMode === 'express' ? 'express' : 'standard';
    const freeThresholdMet = subtotal >= cfg.freeShippingThreshold;
    const qualifiesFree = freeShipping || freeThresholdMet;

    let shipping = 0;
    if (items.length > 0) {
      shipping = shippingMode === 'express'
        ? cfg.expressShippingFee
        : (qualifiesFree ? 0 : cfg.standardShippingFee);
    }

    const cappedDiscount = Math.min(discount, subtotal);
    const total = Math.max(0, subtotal - cappedDiscount) + shipping;

    return {
      itemCount: this.getCartCount(),
      items: items,
      subtotal: subtotal,
      mrpTotal: mrpTotal,
      catalogSavings: Math.max(0, mrpTotal - subtotal),
      couponCode: appliedCoupon,
      couponName: couponName,
      couponMessage: couponMessage,
      couponRejected: couponRejected,
      discount: cappedDiscount,
      shipping: shipping,
      shippingMode: shippingMode,
      freeShippingThreshold: cfg.freeShippingThreshold,
      amountToFreeShipping: Math.max(0, cfg.freeShippingThreshold - subtotal),
      qualifiesFreeShipping: qualifiesFree,
      total: total,
      currency: cfg.currency,
      totalSavings: Math.max(0, mrpTotal - subtotal) + cappedDiscount
    };
  };

  /* --------------------------------------------------------------- wishlist */

  Store.getWishlistItems = function () {
    const items = this.wishlist.items || {};
    return Object.values(items).filter((item) => item && item.productId);
  };

  Store.getWishlistCount = function () {
    return this.getWishlistItems().length;
  };

  Store.isInWishlist = function (productId) {
    return !!(this.wishlist.items && this.wishlist.items[productId]);
  };

  Store.addToWishlist = async function (product) {
    const line = this.toLine(product, 1);
    delete line.qty;

    if (!this.isLoggedIn()) {
      this._stashPending('wishlist', line.productId, line);
      this.toast('❤️ Saved “' + line.name + '” — log in to sync your wishlist.', 'info');
      if (window.VrindaAuth) {
        window.VrindaAuth.requireGate('wishlist', {
          notice: '“' + line.name + '” is waiting in your wishlist. Log in to sync it to your account.'
        });
      }
      return { success: true, pending: true };
    }

    try {
      await this._db().ref(WISHLIST_NODE + '/' + this._uid + '/items/' + line.productId).set(line);
      this.toast('❤️ “' + line.name + '” added to your wishlist.', 'success');
      return { success: true, added: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  Store.removeFromWishlist = async function (productId) {
    if (!this._uid || !this._db()) {
      this._dropPending('wishlist', productId);
      return { success: true, added: false };
    }
    try {
      await this._db().ref(WISHLIST_NODE + '/' + this._uid + '/items/' + productId).remove();
      this._dropPending('wishlist', productId);
      return { success: true, added: false };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  Store.toggleWishlist = async function (product) {
    const id = product.productId || product.id;
    if (this.isInWishlist(id)) {
      const res = await this.removeFromWishlist(id);
      if (res.success) {
        this.toast('Removed from your wishlist.', 'info');
        this.syncWishlistButtons();
      }
      return res;
    }
    const res = await this.addToWishlist(product);
    this.syncWishlistButtons();
    return res;
  };

  Store.moveWishlistToCart = async function (productId) {
    const line = (this.wishlist.items || {})[productId];
    if (!line) return { success: false, error: 'That item is no longer in your wishlist.' };

    const addResult = await this.addToCart(line, 1);
    if (!addResult.success) return addResult;

    await this.removeFromWishlist(productId);
    this.syncWishlistButtons();
    this.toast('🛍️ “' + line.name + '” moved to your cart.', 'success');
    return { success: true };
  };

  /* ------------------------------------------------- product lookup & badges */

  Store.resolveProduct = async function (productId) {
    if (window.VrindaCatalog && typeof window.VrindaCatalog.getProductByIdOrSlug === 'function') {
      const fromCatalog = await window.VrindaCatalog.getProductByIdOrSlug(productId);
      if (fromCatalog) return fromCatalog;
    }
    if (this._catalogCache) {
      const cached = this._catalogCache.find((p) => p.id === productId || p.slug === productId);
      if (cached) return cached;
    }
    return null;
  };

  Store.loadCatalogCache = async function () {
    if (this._catalogCache) return this._catalogCache;
    if (window.VrindaCatalog) {
      this._catalogCache = await window.VrindaCatalog.getProducts();
    } else {
      this._catalogCache = (window.VRINDA_DATA && window.VRINDA_DATA.products) || [];
    }
    return this._catalogCache;
  };

  /**
   * Guards against stale saved carts: any line whose catalog price changed is
   * refreshed before payment, and the changes are reported to the caller.
   */
  Store.revalidateCartPrices = async function () {
    const catalog = await this.loadCatalogCache();
    const changes = [];

    for (const item of this.getCartItems()) {
      const live = catalog.find((p) => p.id === item.productId || p.slug === item.productId);
      if (!live) continue;

      if (Number(live.price) !== Number(item.price)) {
        changes.push({ name: item.name, from: Number(item.price), to: Number(live.price) });
        if (this._uid && this._db()) {
          await this._db().ref(CART_NODE + '/' + this._uid + '/items/' + item.productId).update({ price: Number(live.price) });
        }
      }
    }

    return changes;
  };

  Store.refreshBadges = function () {
    const cartCount = this.getCartCount();
    const wishCount = this.getWishlistCount();

    document.querySelectorAll('[data-badge="cart"]').forEach((el) => {
      el.textContent = cartCount;
      el.classList.toggle('is-empty', cartCount === 0);
    });
    document.querySelectorAll('[data-badge="wishlist"]').forEach((el) => {
      el.textContent = wishCount;
      el.classList.toggle('is-empty', wishCount === 0);
    });
    document.querySelectorAll('[data-cart-count]').forEach((el) => { el.textContent = cartCount; });
    document.querySelectorAll('[data-wishlist-count]').forEach((el) => { el.textContent = wishCount; });

    document.dispatchEvent(new CustomEvent('vrinda:cart-synced', {
      detail: { cartCount: cartCount, wishlistCount: wishCount, totalsReady: true }
    }));
  };

  Store.syncWishlistButtons = function () {
    document.querySelectorAll('.js-toggle-wishlist[data-product-id]').forEach((btn) => {
      const active = Store.isInWishlist(btn.getAttribute('data-product-id'));
      btn.classList.toggle('active', active);
    });
  };

  /* ------------------------------------------- delegated button click handling */

  Store._handleStoreAction = async function (button, kind) {
    const productId = button.getAttribute('data-product-id');
    if (!productId) return;

    if (button.getAttribute('data-busy') === '1') return;
    button.setAttribute('data-busy', '1');

    const qty = parseInt(button.getAttribute('data-qty'), 10) || 1;
    const product = button.getAttribute('data-name')
      ? {
          id: productId,
          productId: productId,
          name: button.getAttribute('data-name'),
          slug: button.getAttribute('data-slug') || '',
          price: Number(button.getAttribute('data-price')) || 0,
          originalPrice: Number(button.getAttribute('data-mrp')) || Number(button.getAttribute('data-price')) || 0,
          image: button.getAttribute('data-image') || '',
          category: button.getAttribute('data-category') || '',
          categoryName: button.getAttribute('data-category-name') || ''
        }
      : await this.resolveProduct(productId);

    if (!product) {
      this.toast('Sorry, that gift is no longer available.', 'error');
      button.removeAttribute('data-busy');
      return;
    }

    let result;
    if (kind === 'wishlist') {
      result = await this.toggleWishlist(product);
    } else {
      result = await this.addToCart(product, qty);
      if (!result.success) this.toast(result.error || 'Could not add to cart.', 'error');
    }

    if (result && result.success) button.classList.add('is-pulsing');
    setTimeout(() => {
      button.removeAttribute('data-busy');
      button.classList.remove('is-pulsing');
    }, 400);
  };

  Store.bindDelegatedActions = function () {
    if (this._delegatedBound) return;
    this._delegatedBound = true;

    document.addEventListener('click', (e) => {
      const target = e.target;
      if (!target || typeof target.closest !== 'function') return;

      const cartBtn = target.closest('.js-add-to-cart');
      if (cartBtn) {
        e.preventDefault();
        this._handleStoreAction(cartBtn, 'cart');
        return;
      }

      const wishBtn = target.closest('.js-toggle-wishlist');
      if (wishBtn) {
        e.preventDefault();
        this._handleStoreAction(wishBtn, 'wishlist');
        return;
      }

      const moveBtn = target.closest('.js-move-to-cart');
      if (moveBtn) {
        e.preventDefault();
        if (window.VrindaAuth && !window.VrindaAuth.requireGate('cart')) return;
        this.moveWishlistToCart(moveBtn.getAttribute('data-product-id'));
      }
    });
  };

  /**
   * Live subscription to the admin-managed /faqs node. Until it answers (or if
   * the read is denied/offline) faqList() falls back to the bundled answers.
   */
  Store.loadFaqs = function () {
    const db = this._db();
    if (!db) return;

    db.ref('faqs').on('value', (snap) => {
      const val = snap.val() || {};
      const list = Object.keys(val)
        .map((id) => Object.assign({ id: id }, val[id]))
        .filter((f) => f && f.q && f.active !== false);
      list.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
      this._faqs = list;
      document.dispatchEvent(new CustomEvent('vrinda:faqs-changed', { detail: list }));
    }, (err) => console.warn('FAQ sync warning:', err && err.message));
  };

  /**
   * Live subscription to the admin-managed /settings and /seo RTDB nodes.
   * Anything the Super Admin saves in "Store Settings & SEO" (free-delivery
   * threshold, shipping fee, WhatsApp number, support email, meta tags) is
   * merged into config() and announced so chrome (announcement bar, WhatsApp
   * links, homepage SEO) can re-apply itself.
   */
  Store.loadStoreSettings = function () {
    const db = this._db();
    if (!db) return;

    const settingsHandler = (snap) => {
      const s = snap.val() || {};
      const next = {};
      const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

      if (s.whatsapp) next.whatsappNumber = String(s.whatsapp).replace(/[^0-9]/g, '');
      if (s.email) next.supportEmail = String(s.email);
      const threshold = num(s.freeShippingThreshold);
      if (threshold !== null && !Number.isNaN(threshold) && threshold >= 0) next.freeShippingThreshold = threshold;
      const fee = num(s.shippingFee);
      if (fee !== null && !Number.isNaN(fee) && fee >= 0) next.standardShippingFee = fee;

      this._rtdbConfig = next;
      document.dispatchEvent(new CustomEvent('vrinda:settings-changed', { detail: this.config() }));
    };

    const seoHandler = (snap) => {
      this._seo = snap.val() || {};
      document.dispatchEvent(new CustomEvent('vrinda:seo-changed', { detail: this._seo }));
    };

    const onErr = (err) => console.warn('Store settings sync warning:', err && err.message);
    db.ref('settings').on('value', settingsHandler, onErr);
    db.ref('seo').on('value', seoHandler, onErr);
  };

  window.VrindaStore = Store;

  document.addEventListener('DOMContentLoaded', () => Store.init());
})();
