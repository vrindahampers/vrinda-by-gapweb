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

    /* --------------------------------------------------------- ANALYTICS & STATS */

    computeStats: function (orders, users, reviews) {
      const ords = Array.isArray(orders) ? orders : [];
      const validOrders = ords.filter(o => o.status !== 'Cancelled');
      const totalRevenue = validOrders.reduce((sum, o) => sum + ((o.pricing && o.pricing.total) || 0), 0);
      const activeDeliveries = validOrders.filter(o => ['Assigned To Delivery', 'Out For Delivery'].includes(o.status)).length;
      const pendingCustomization = validOrders.filter(o => ['Awaiting Customization', 'Customer Contacted', 'Photos Received'].includes(o.status)).length;

      return {
        totalOrders: ords.length,
        activeOrders: validOrders.filter(o => o.status !== 'Delivered').length,
        deliveredOrders: validOrders.filter(o => o.status === 'Delivered').length,
        cancelledOrders: ords.filter(o => o.status === 'Cancelled').length,
        totalRevenue: totalRevenue,
        totalCustomers: (users || []).length,
        totalReviews: (reviews || []).length,
        activeDeliveries: activeDeliveries,
        pendingCustomization: pendingCustomization
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