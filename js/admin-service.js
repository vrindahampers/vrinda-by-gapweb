/**
 * vrindahampers - Admin Service & Data Management (Phase 6)
 * Real-time subscribers, CRUD operations, statistics computing,
 * checklists, and role management for the Super Admin, Staff, and Delivery Manager portals.
 */

(function () {
  'use strict';

  const Admin = {
    _db: function () {
      if (typeof firebase === 'undefined' || !firebase.database) return null;
      return firebase.database();
    },

    _stamp: function () {
      const db = this._db();
      return db ? firebase.database.ServerValue.TIMESTAMP : Date.now();
    },

    /* ------------------------------------------------------------- USERS & ROLES */

    // Listen to all users. The super-admin RBAC table reads the WHOLE /users
    // node, so the database rules must grant a parent-level read to ops roles
    // (see users.".read" in database.rules.json). onError keeps the UI from
    // sitting on "Loading team members..." forever when access is denied.
    listenToUsers: function (callback, onError) {
      const db = this._db();
      if (!db || typeof callback !== 'function') return () => {};
      const ref = db.ref('users');
      const handler = (snap) => {
        const val = snap.val() || {};
        const users = Object.keys(val).map(uid => Object.assign({ uid: uid }, val[uid]));
        callback(users);
      };
      const errHandler = (err) => {
        console.warn('listenToUsers error:', err && err.message);
        if (typeof onError === 'function') onError(err);
      };
      ref.on('value', handler, errHandler);
      return () => ref.off('value', handler);
    },

    // Update user role (Super Admin and above: assigns the role and syncs the
    // matching registry node). Which roles the caller may hand out is decided
    // by VrindaAuth.canGrantRole, which only an owner may use for owner/manager.
    updateUserRole: async function (uid, newRole) {
      const db = this._db();
      if (!db || !uid || !newRole) return { success: false, error: 'Missing parameters' };

      const auth = window.VrindaAuth;
      if (auth && typeof auth.canGrantRole === 'function' && !auth.canGrantRole(newRole)) {
        return {
          success: false,
          error: 'Your role cannot grant "' + newRole + '". Only Super Admin++ can assign the top two roles.'
        };
      }

      try {
        const updates = {};
        updates['users/' + uid + '/role'] = newRole;

        // Clear existing role tables
        updates['admins/' + uid] = null;
        updates['staff/' + uid] = null;
        updates['deliveryManagers/' + uid] = null;

        // Set matching role table. owner/manager deliberately have NO registry
        // node: they are recognised purely by users/$uid/role, which is the
        // source of truth every rule and every gate reads.
        if (newRole === 'superadmin') {
          updates['admins/' + uid] = true;
        } else if (newRole === 'staff') {
          updates['staff/' + uid] = true;
        } else if (newRole === 'delivery') {
          updates['deliveryManagers/' + uid] = true;
        }

        await db.ref().update(updates);
        return { success: true, role: newRole };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    /**
     * Delete an order outright, together with its per-customer index entry.
     * Reserved for Super Admin+ / Super Admin++ by the database rules, so a
     * denied write here is the rules doing their job, not a bug.
     */
    deleteOrder: async function (orderId, userId) {
      const db = this._db();
      if (!db || !orderId) return { success: false, error: 'Missing order id' };

      try {
        const updates = {};
        updates['orders/' + orderId] = null;
        if (userId) updates['userOrders/' + userId + '/' + orderId] = null;
        await db.ref().update(updates);
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    /* ----------------------------------------------------------- NEWSLETTER */

    /**
     * Every newsletter row (ops roles only — the database rules gate the read).
     * @returns {Promise<{success:boolean, rows?:Array, error?:string}>}
     */
    listNewsletter: async function () {
      const db = this._db();
      if (!db) return { success: false, error: 'Database unavailable' };
      try {
        const snap = await db.ref('newsletter').once('value');
        const val = snap.val() || {};
        const rows = Object.keys(val).map((key) => Object.assign({ key: key }, val[key]));
        rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        return { success: true, rows: rows };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    /**
     * Render newsletter rows as CSV text, ready to import into Gmail, Google
     * Sheets, Mailchimp or wherever the campaign is run from.
     *
     * Only the status "subscribed" rows are included by default: a campaign must
     * never mail somebody who unsubscribed. Values are quoted and internal
     * quotes doubled, because a comma inside a name or note would otherwise
     * shift every following column.
     */
    newsletterToCsv: function (rows, options) {
      const opts = options || {};
      const includeUnsubscribed = !!opts.includeUnsubscribed;
      const list = (rows || []).filter((r) => includeUnsubscribed || r.status !== 'unsubscribed');

      const cell = (value) => {
        const s = value === undefined || value === null ? '' : String(value);
        return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      };
      // Header names are chosen to be readable in Sheets AND usable as a
      // Gmail "To" column, which is the whole reason this export exists.
      const header = ['email', 'name', 'signed_up_on', 'user_id', 'source', 'status'];
      const isoDate = (ms) => {
        if (!ms) return '';
        // ServerValue resolves to a number once stored; guard the type anyway.
        const d = new Date(Number(ms) || ms);
        return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
      };
      const rowsCsv = list.map((r) => [
        cell(r.email), cell(r.userName), cell(isoDate(r.createdAt)),
        cell(r.userId), cell(r.source), cell(r.status || 'subscribed')
      ].join(','));

      return [header.join(',')].concat(rowsCsv).join('\n');
    },

    /** Trigger a browser download of the CSV without touching the network. */
    downloadNewsletterCsv: function (rows, filename) {
      const csv = this.newsletterToCsv(rows);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || ('newsletter-' + new Date().toISOString().slice(0, 10) + '.csv');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Revoke on the next tick so Safari has time to start the download.
      setTimeout(() => URL.revokeObjectURL(url), 0);
      return csv;
    },

    /**
     * Edit a customer's record. Reserved for Super Admin+ and Super Admin++ by
     * users/$uid/.write, so a plain Super Admin write is refused by the database.
     *
     * `role` is deliberately NOT part of the patch: changing someone's role goes
     * through updateUserRole, which enforces the grant rules. Letting it ride
     * along here would create a second, unguarded path to promotion.
     */
    updateCustomer: async function (uid, patch) {
      const db = this._db();
      if (!db || !uid || !patch) return { success: false, error: 'Missing parameters' };

      const auth = window.VrindaAuth;
      if (!auth || !auth.currentUser || !auth.atLeast || !auth.atLeast('manager')) {
        return { success: false, error: 'Only Super Admin+ and above can edit customer records' };
      }
      if (uid === auth.currentUser.uid) {
        return { success: false, error: 'You cannot edit your own account from here' };
      }

      // Only these fields may be changed by support. Anything else on the user
      // record (role, uid, timestamps) is off limits by construction.
      const allowed = ['name', 'email', 'phone', 'emailVerified'];
      const updates = {};
      allowed.forEach((field) => {
        if (patch[field] !== undefined) {
          const v = patch[field];
          updates['users/' + uid + '/' + field] = (v === '' || v === null) ? null : v;
        }
      });
      if (!Object.keys(updates).length) {
        return { success: false, error: 'Nothing to update' };
      }

      try {
        updates['users/' + uid + '/updatedAt'] = this._stamp();
        await db.ref().update(updates);
        return { success: true, updated: Object.keys(updates).length - 1 };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    /* ----------------------------------------------------------- NOTIFICATIONS */

    listenToNotifications: function (callback) {
      const db = this._db();
      if (!db || typeof callback !== 'function') return () => {};
      const ref = db.ref('adminNotifications');
      const handler = (snap) => {
        const val = snap.val() || {};
        const list = Object.keys(val).map(k => Object.assign({ id: k }, val[k]));
        list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        callback(list);
      };
      ref.on('value', handler);
      return () => ref.off('value', handler);
    },

    /* ------------------------------------------------- BANNERS, BLOGS, SETTINGS, SEO */

    listenToBanners: function (callback) {
      const db = this._db();
      if (!db || typeof callback !== 'function') return () => {};
      const ref = db.ref('banners');
      const handler = (snap) => {
        const val = snap.val() || {};
        const list = Object.keys(val).map(k => Object.assign({ id: k }, val[k]));
        callback(list);
      };
      ref.on('value', handler);
      return () => ref.off('value', handler);
    },

    saveBanner: async function (banner) {
      const db = this._db();
      if (!db) return { success: false, error: 'Database unavailable' };
      try {
        const id = banner.id || ('banner-' + Date.now().toString(36));
        const record = Object.assign({}, banner, { id: id, updatedAt: this._stamp() });
        await db.ref('banners/' + id).set(record);
        return { success: true, banner: record };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    deleteBanner: async function (bannerId) {
      const db = this._db();
      if (!db) return { success: false, error: 'Database unavailable' };
      try {
        await db.ref('banners/' + bannerId).remove();
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    listenToBlogs: function (callback) {
      const db = this._db();
      if (!db || typeof callback !== 'function') return () => {};
      const ref = db.ref('blogs');
      const handler = (snap) => {
        const val = snap.val() || {};
        const list = Object.keys(val).map(k => Object.assign({ id: k }, val[k]));
        list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        callback(list);
      };
      ref.on('value', handler);
      return () => ref.off('value', handler);
    },

    saveBlog: async function (blog) {
      const db = this._db();
      if (!db) return { success: false, error: 'Database unavailable' };
      try {
        const id = blog.id || ('blog-' + Date.now().toString(36));
        const record = Object.assign({}, blog, { id: id, updatedAt: this._stamp() });
        await db.ref('blogs/' + id).set(record);
        return { success: true, blog: record };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    deleteBlog: async function (blogId) {
      const db = this._db();
      if (!db) return { success: false, error: 'Database unavailable' };
      try {
        await db.ref('blogs/' + blogId).remove();
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    listenToSettings: function (callback) {
      const db = this._db();
      if (!db || typeof callback !== 'function') return () => {};
      const ref = db.ref('settings');
      const handler = (snap) => {
        callback(snap.val() || {});
      };
      ref.on('value', handler);
      return () => ref.off('value', handler);
    },

    saveSettings: async function (settings) {
      const db = this._db();
      if (!db) return { success: false, error: 'Database unavailable' };
      try {
        await db.ref('settings').update(settings);
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    listenToSeo: function (callback) {
      const db = this._db();
      if (!db || typeof callback !== 'function') return () => {};
      const ref = db.ref('seo');
      const handler = (snap) => {
        callback(snap.val() || {});
      };
      ref.on('value', handler);
      return () => ref.off('value', handler);
    },

    saveSeo: async function (seoData) {
      const db = this._db();
      if (!db) return { success: false, error: 'Database unavailable' };
      try {
        await db.ref('seo').update(seoData);
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    /* ------------------------------------------------- CUSTOM STUDIO REQUESTS */

    /**
     * Every Custom Studio design ever submitted, flattened out of
     * /customRequests/{uid}/{requestId}. Needs the parent-level read on
     * customRequests (see database.rules.json).
     */
    listenToCustomRequests: function (callback, onError) {
      const db = this._db();
      if (!db || typeof callback !== 'function') return () => {};
      const ref = db.ref('customRequests');
      const handler = (snap) => {
        const val = snap.val() || {};
        const list = [];
        Object.keys(val).forEach((uid) => {
          const mine = val[uid] || {};
          Object.keys(mine).forEach((requestId) => {
            list.push(Object.assign({ id: requestId, uid: uid }, mine[requestId]));
          });
        });
        list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        callback(list);
      };
      const errHandler = (err) => {
        console.warn('listenToCustomRequests error:', err && err.message);
        if (typeof onError === 'function') onError(err);
      };
      ref.on('value', handler, errHandler);
      return () => ref.off('value', handler);
    },

    // Move a submitted design through the review pipeline.
    updateCustomRequestStatus: async function (request) {
      const db = this._db();
      if (!db || !request || !request.uid || !request.id) return { success: false, error: 'Missing parameters' };
      try {
        const updates = {};
        updates['customRequests/' + request.uid + '/' + request.id + '/status'] = request.status;
        if (request.note !== undefined) {
          updates['customRequests/' + request.uid + '/' + request.id + '/adminNote'] = request.note;
        }
        if (request.quote !== undefined && request.quote !== '') {
          updates['customRequests/' + request.uid + '/' + request.id + '/quotedTotal'] = Number(request.quote) || 0;
        }
        updates['customRequests/' + request.uid + '/' + request.id + '/reviewedAt'] = this._stamp();
        await db.ref().update(updates);
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    /* ----------------------------------------------------------------- FAQs */

    listenToFaqs: function (callback, onError) {
      const db = this._db();
      if (!db || typeof callback !== 'function') return () => {};
      const ref = db.ref('faqs');
      const handler = (snap) => {
        const val = snap.val() || {};
        const list = Object.keys(val).map((id) => Object.assign({ id: id }, val[id]));
        list.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
        callback(list);
      };
      const errHandler = (err) => {
        console.warn('listenToFaqs error:', err && err.message);
        if (typeof onError === 'function') onError(err);
      };
      ref.on('value', handler, errHandler);
      return () => ref.off('value', handler);
    },

    saveFaq: async function (faq) {
      const db = this._db();
      if (!db) return { success: false, error: 'Database unavailable' };
      if (!faq || !String(faq.q || '').trim()) return { success: false, error: 'A question is required' };

      const id = faq.id || ('faq-' + Date.now().toString(36));
      const record = {
        q: String(faq.q).trim(),
        a: String(faq.a || '').trim(),
        order: Number(faq.order) || 0,
        active: faq.active !== false,
        updatedAt: this._stamp()
      };
      try {
        await db.ref('faqs/' + id).set(record);
        return { success: true, id: id, faq: record };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    deleteFaq: async function (id) {
      const db = this._db();
      if (!db || !id) return { success: false, error: 'Database unavailable' };
      try {
        await db.ref('faqs/' + id).remove();
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    // Seed /faqs from the bundled answers when the node is still empty, so the
    // admin can start editing instead of an empty table.
    importSampleFaqs: async function () {
      const db = this._db();
      if (!db) return { success: false, error: 'Database unavailable' };
      const source = (window.VRINDA_DATA && window.VRINDA_DATA.faqs) || [];
      if (!source.length) return { success: false, error: 'No bundled FAQ answers to import' };
      try {
        const snap = await db.ref('faqs').once('value');
        if (snap.exists()) return { success: true, imported: 0, skipped: true };
        const updates = {};
        source.forEach((faq, index) => {
          updates['faqs/faq-' + (index + 1)] = {
            q: faq.q,
            a: faq.a,
            order: index + 1,
            active: true
          };
        });
        await db.ref().update(updates);
        return { success: true, imported: source.length };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    // Manual payment reconciliation: confirm a capture against the FamPay
    // dashboard. Needed because FamGateway's verify endpoint cannot be called
    // from a browser (no CORS), so some orders land with verified:false.
    markPaymentVerified: async function (orderId, note) {
      const db = this._db();
      if (!db || !orderId) return { success: false, error: 'Missing order id' };
      try {
        const updates = {};
        updates['orders/' + orderId + '/payment/verified'] = true;
        updates['orders/' + orderId + '/payment/verifiedAt'] = this._stamp();
        updates['orders/' + orderId + '/payment/verifiedManually'] = true;
        if (note) updates['orders/' + orderId + '/payment/verificationNote'] = note;
        await db.ref().update(updates);
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    /* ------------------------------------------- SHARED ORDER SHAPE + CSV */

    /**
     * The order-shape fallbacks every portal renders with. `customer` /
     * `shipping` / `gifting` are canonical, but `shippingAddress` survives on
     * early-draft rows, so both spellings are honoured. Living here (rather than
     * copied into each controller) is what keeps the ledger, the staff queue and
     * the CSV export agreeing on how a customer's name reads.
     */
    orderShape: {
      recipientName: function (order) {
        const legacy = order.shippingAddress || {};
        return (order.customer && order.customer.name) || legacy.fullName || legacy.name || 'Customer';
      },
      recipientPhone: function (order) {
        const legacy = order.shippingAddress || {};
        return (order.customer && order.customer.phone) || legacy.phone || '';
      },
      recipientCity: function (order) {
        const legacy = order.shippingAddress || {};
        return (order.shipping && order.shipping.city) || legacy.city || 'India';
      },
      recipientPincode: function (order) {
        const legacy = order.shippingAddress || {};
        return (order.shipping && order.shipping.pincode) || legacy.pincode || '';
      },
      deliverySlot: function (order) {
        const legacy = order.shippingAddress || {};
        return (order.gifting && order.gifting.deliverySlot) || legacy.deliverySlot || 'Standard Delivery';
      },
      itemQty: function (item) {
        return (item && (item.qty || item.quantity)) || 1;
      },
      itemName: function (item) {
        return (item && (item.name || item.title)) || 'Item';
      }
    },

    /**
     * Spreadsheet-ready export of the rows it is handed, following the newsletter
     * export's conventions (newsletterToCsv). Amounts stay plain numbers so
     * Sheets can total a column, and any cell that could contain a comma, quote
     * or newline is quoted. Shared by the Super Admin ledger and the staff queue:
     * the monthly GST record, courier handover sheets and FamPay reconciliation
     * must not depend on which portal produced the file.
     */
    ordersToCsv: function (rows) {
      const shape = this.orderShape;
      const cell = (value) => {
        const s = value === undefined || value === null ? '' : String(value);
        return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      };
      const header = [
        'order_id', 'placed_on', 'status', 'customer', 'phone', 'city', 'pincode',
        'delivery_type', 'slot', 'items', 'item_names',
        'subtotal', 'discount', 'coupon', 'total',
        'payment_mode', 'payment_verified', 'utr'
      ];

      const rowCsv = (rows || []).map((o) => {
        const pricing = o.pricing || {};
        const payment = o.payment || {};
        const delivery = o.delivery || {};
        const placedOn = o.createdAt ? new Date(o.createdAt) : null;
        return [
          cell(o.orderId),
          cell(placedOn && !isNaN(placedOn.getTime()) ? placedOn.toISOString() : ''),
          cell(o.status),
          cell(shape.recipientName(o)),
          cell(shape.recipientPhone(o)),
          cell(shape.recipientCity(o)),
          cell(shape.recipientPincode(o)),
          cell(delivery.type || ''),
          cell(shape.deliverySlot(o)),
          cell((o.items || []).length),
          cell((o.items || []).map(i => `${i.name || 'Item'} x${i.qty || 1}`).join(' | ')),
          cell(pricing.subtotal || 0),
          cell(pricing.discount || 0),
          cell(pricing.couponCode || ''),
          cell(pricing.total || 0),
          cell(payment.mode || ''),
          cell(payment.verified === true ? 'yes' : payment.verified === false ? 'no' : ''),
          cell(payment.utr || '')
        ].join(',');
      });

      return [header.join(',')].concat(rowCsv).join('\n');
    },

    /**
     * The export's filename, so a month's file is named after the month rather
     * than after the day it happened to be downloaded:
     * orders-2026-09-01_to_2026-09-30.csv.
     */
    ordersCsvFileName: function (from, to) {
      if (from && from === to) return 'orders-' + from + '.csv';
      if (from || to) return 'orders-' + (from || 'start') + '_to_' + (to || 'today') + '.csv';
      return 'orders-' + new Date().toISOString().slice(0, 10) + '.csv';
    },

    /* --------------------------------------------------------- ANALYTICS & STATS */

    computeStats: function (orders, users, reviews) {
      const ords = Array.isArray(orders) ? orders : [];
      const validOrders = ords.filter(o => o.status !== 'Cancelled');
      const totalRevenue = validOrders.reduce((sum, o) => sum + ((o.pricing && o.pricing.total) || 0), 0);
      const activeDeliveries = validOrders.filter(o => ['Assigned To Delivery', 'Out For Delivery'].includes(o.status)).length;
      const pendingCustomization = validOrders.filter(o => ['Awaiting Customization', 'Customer Contacted', 'Photos Received'].includes(o.status)).length;

      // Period windows for the dashboard's Today / 7 days / 30 days cards. Same
      // rule as totalRevenue: cancelled orders are out of both the money and the
      // count, and a window is measured from when the order was placed. Windows
      // are calendar-based (today plus the previous N-1 days), which is how an
      // owner reads "last 7 days" - not a rolling 168 hours.
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const todayMs = startOfToday.getTime();
      const dayMs = 24 * 60 * 60 * 1000;
      const placedAt = (o) => Number(o.createdAt) || Number(o.placedAt) || 0;
      const sinceMs = (ms) => validOrders.filter(o => placedAt(o) >= ms);
      const sumOf = (list) => list.reduce((total, o) => total + ((o.pricing && o.pricing.total) || 0), 0);

      const today = sinceMs(todayMs);
      const week = sinceMs(todayMs - 6 * dayMs);
      const month = sinceMs(todayMs - 29 * dayMs);

      return {
        totalOrders: ords.length,
        activeOrders: validOrders.filter(o => o.status !== 'Delivered').length,
        deliveredOrders: validOrders.filter(o => o.status === 'Delivered').length,
        cancelledOrders: ords.filter(o => o.status === 'Cancelled').length,
        totalRevenue: totalRevenue,
        totalCustomers: (users || []).length,
        totalReviews: (reviews || []).length,
        activeDeliveries: activeDeliveries,
        pendingCustomization: pendingCustomization,

        // The number behind the Orders badge: payments nobody has confirmed in
        // FamPay yet. These are the orders the ledger's "Unverified payments only"
        // filter exists for.
        unverifiedPayments: validOrders.filter(o => o.payment && o.payment.verified === false).length,

        revenueToday: sumOf(today),
        ordersToday: today.length,
        revenue7: sumOf(week),
        orders7: week.length,
        revenue30: sumOf(month),
        orders30: month.length,

        // Money still waiting for a human, in rupees: the size of the
        // reconciliation job behind the Orders badge, not just its row count.
        unverifiedAmount: sumOf(validOrders.filter(o => o.payment && o.payment.verified === false)),

        // Where every order is sitting right now, in timeline order. Cancelled
        // is counted too — a cancellation disappearing out of the funnel is
        // exactly what an owner watches for. Zero-count steps are dropped so the
        // panel reads as "where the orders are", not an empty form.
        statusFunnel: (function () {
          const steps = [
            'Order Placed', 'Payment Confirmed', 'Awaiting Customization',
            'Customer Contacted', 'Photos Received', 'Customization Confirmed',
            'Production Started', 'Packed', 'Assigned To Delivery',
            'Out For Delivery', 'Delivered', 'Cancelled'
          ];
          return steps
            .map((status) => ({ status: status, count: ords.filter((o) => o.status === status).length }))
            .filter((row) => row.count > 0);
        })(),

        // Best sellers: quantity first (the shelf decision is "which hamper do I
        // pack more of"), money as the tiebreak. Cancelled orders are out — a
        // refund is not a sale.
        topProducts: (function () {
          const tally = {};
          validOrders.forEach((o) => (Array.isArray(o.items) ? o.items : []).forEach((item) => {
            const name = (item && (item.name || item.title)) || 'Unnamed item';
            const qty = Number((item && (item.qty || item.quantity)) || 1);
            const price = Number((item && item.price) || 0);
            const entry = tally[name] || (tally[name] = { name: name, qty: 0, revenue: 0 });
            entry.qty += qty;
            entry.revenue += qty * price;
          }));
          return Object.keys(tally)
            .map((key) => tally[key])
            .sort((a, b) => b.qty - a.qty || b.revenue - a.revenue)
            .slice(0, 5);
        })(),

        // Three-way payment truth: confirmed, waiting for a human, or no record
        // at all (draft/legacy rows). Only the middle bucket is actionable; the
        // `unverified` count mirrors `unverifiedPayments` above on purpose, so
        // the badge and the dashboard panel can never disagree.
        paymentBreakdown: {
          verified: validOrders.filter(o => o.payment && o.payment.verified === true).length,
          unverified: validOrders.filter(o => o.payment && o.payment.verified === false).length,
          untracked: validOrders.filter(o => !o.payment || (o.payment.verified !== true && o.payment.verified !== false)).length
        }
      };
    },

    /* ------------------------------------------- WHATSAPP-ORDER CHECKLIST ENGINE */

    /**
     * Standard WhatsApp-contact checklist steps tied directly to the Phase 5 tracking timeline:
     */
    CHECKLIST_STEPS: [
      { key: 'customer_contacted', label: 'Customer Contacted (WhatsApp greeting sent)', status: 'Customer Contacted' },
      { key: 'photos_received', label: 'Photos / Custom Details Received', status: 'Photos Received' },
      { key: 'design_confirmed', label: 'Customization / Design Confirmed', status: 'Customization Confirmed' },
      { key: 'production_started', label: 'Crafting & Production Started', status: 'Production Started' },
      { key: 'packed', label: 'Hamper Packed & Ribbon Sealed', status: 'Packed' },
      { key: 'assigned_delivery', label: 'Assigned To Rider / Courier', status: 'Assigned To Delivery' },
      { key: 'out_for_delivery', label: 'Dispatched / Out For Delivery', status: 'Out For Delivery' },
      { key: 'delivered', label: 'Order Handed Over & Delivered', status: 'Delivered' }
    ],

    toggleChecklistStep: async function (orderId, stepKey, isDone, notes) {
      const db = this._db();
      if (!db || !orderId || !stepKey) return { success: false, error: 'Missing parameters' };

      try {
        const orderSnap = await db.ref('orders/' + orderId).once('value');
        if (!orderSnap.exists()) return { success: false, error: 'Order not found' };

        const order = orderSnap.val();
        const checklist = Object.assign({}, order.checklist || {});
        checklist[stepKey] = {
          done: !!isDone,
          at: Date.now(),
          notes: notes || ''
        };

        const updates = {};
        updates['orders/' + orderId + '/checklist'] = checklist;
        updates['orders/' + orderId + '/updatedAt'] = this._stamp();

        const stepDef = this.CHECKLIST_STEPS.find(s => s.key === stepKey);
        if (isDone && stepDef && window.VrindaOrders) {
          await window.VrindaOrders.updateOrderStatus(orderId, stepDef.status, notes || `Checklist completed: ${stepDef.label}`);
        }

        await db.ref().update(updates);
        return { success: true, checklist: checklist };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  };

  window.VrindaAdmin = Admin;
})();