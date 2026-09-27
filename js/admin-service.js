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

    // Update user role (Super Admin only: assigns role and syncs admins/staff/deliveryManagers node)
    updateUserRole: async function (uid, newRole) {
      const db = this._db();
      if (!db || !uid || !newRole) return { success: false, error: 'Missing parameters' };

      try {
        const updates = {};
        updates['users/' + uid + '/role'] = newRole;

        // Clear existing role tables
        updates['admins/' + uid] = null;
        updates['staff/' + uid] = null;
        updates['deliveryManagers/' + uid] = null;

        // Set matching role table
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