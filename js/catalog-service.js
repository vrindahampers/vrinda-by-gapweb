/**
 * vrindahampers - Product & Category Catalog Service
 * Reads catalog data in real time from Firebase Realtime Database (/products & /categories)
 * with graceful fallback to local data if Firebase keys are placeholders or offline.
 */

(function () {
  'use strict';

  const CatalogService = {
    // Cache
    productsCache: null,
    categoriesCache: null,

    // Only Super Admins may write the catalog (see database.rules.json).
    // Anonymous storefront visitors used to fire a doomed set() on /categories
    // that logged "PERMISSION_DENIED" on every page load; they now skip it.
    canWriteCatalog: function () {
      const auth = window.VrindaAuth;
      return !!(auth && auth.currentUser && typeof auth.hasRole === 'function' && auth.hasRole('superadmin'));
    },

    // Initialize or seed Firebase RTDB if empty (Super Admin only, once the
    // auth session has resolved so we never attempt a denied write).
    initSeedIfNeeded: function () {
      if (typeof firebase === 'undefined' || !firebase.database) return;

      const run = () => {
        if (this.canWriteCatalog()) this.importSampleCatalog();
      };

      const auth = window.VrindaAuth;
      if (auth && typeof auth.whenReady === 'function') auth.whenReady(run);
      else if (auth && typeof auth.onAuthChange === 'function') auth.onAuthChange(run);
      else run();
    },

    /**
     * One-shot migration of the bundled sample catalog into the RTDB /categories
     * and /products nodes, so the storefront and admin portal read products from
     * Firebase instead of the JSON sample. Runs automatically the first time a
     * Super Admin opens a page while the RTDB catalog is still empty, and can be
     * re-triggered from the admin portal ("Import sample catalog" button).
     * Existing rows are never overwritten unless { force: true } is passed.
     * @returns {Promise<{success: boolean, imported?: object, error?: string}>}
     */
    importSampleCatalog: async function (options) {
      const opts = options || {};
      const db = (typeof firebase !== 'undefined' && firebase.database) ? firebase.database() : null;
      if (!db) return { success: false, error: 'Database unavailable' };
      if (!window.VRINDA_DATA) return { success: false, error: 'Sample catalog not loaded on this page' };

      const imported = { categories: 0, products: 0 };

      try {
        const catSnap = await db.ref('categories').once('value');
        if ((opts.force || !catSnap.exists()) && window.VRINDA_DATA.categories) {
          const catMap = {};
          window.VRINDA_DATA.categories.forEach(c => { catMap[c.id] = c; });
          if (Object.keys(catMap).length) {
            await db.ref('categories').set(catMap);
            imported.categories = Object.keys(catMap).length;
          }
        }

        const prodSnap = await db.ref('products').once('value');
        if ((opts.force || !prodSnap.exists()) && window.VRINDA_DATA.products) {
          const prodMap = {};
          window.VRINDA_DATA.products.forEach(p => { prodMap[p.id] = p; });
          if (Object.keys(prodMap).length) {
            await db.ref('products').set(prodMap);
            imported.products = Object.keys(prodMap).length;
          }
        }

        this.categoriesCache = null;
        this.productsCache = null;
        return { success: true, imported: imported };
      } catch (err) {
        console.warn('Catalog import failed:', err.message);
        return { success: false, error: err.message };
      }
    },

    // Fetch all categories
    getCategories: async function () {
      if (this.categoriesCache) return this.categoriesCache;

      if (typeof firebase !== 'undefined' && firebase.database) {
        try {
          const snapshot = await firebase.database().ref('categories').once('value');
          if (snapshot.exists()) {
            const data = snapshot.val();
            this.categoriesCache = Array.isArray(data) ? data : Object.values(data);
            return this.categoriesCache;
          }
        } catch (e) {
          console.warn('Firebase RTDB categories read warning; using local data:', e.message);
        }
      }

      // Fallback to VRINDA_DATA
      this.categoriesCache = (window.VRINDA_DATA && window.VRINDA_DATA.categories) || [];
      return this.categoriesCache;
    },

    // Fetch single category by slug
    getCategoryBySlug: async function (slug) {
      const all = await this.getCategories();
      return all.find(c => c.slug === slug || c.id === slug) || null;
    },

    // Fetch all products
    getProducts: async function () {
      if (this.productsCache) return this.productsCache;

      if (typeof firebase !== 'undefined' && firebase.database) {
        try {
          const snapshot = await firebase.database().ref('products').once('value');
          if (snapshot.exists()) {
            const data = snapshot.val();
            this.productsCache = Array.isArray(data) ? data : Object.values(data);
            return this.productsCache;
          }
        } catch (e) {
          console.warn('Firebase RTDB products read warning; using local data:', e.message);
        }
      }

      this.productsCache = (window.VRINDA_DATA && window.VRINDA_DATA.products) || [];
      return this.productsCache;
    },

    // Fresh admin read: always re-reads /products from RTDB so the catalog
    // table reflects add/edit/delete immediately (never a stale cache).
    getAllProducts: async function () {
      if (typeof firebase !== 'undefined' && firebase.database) {
        try {
          const snapshot = await firebase.database().ref('products').once('value');
          if (snapshot.exists()) {
            const data = snapshot.val();
            const list = Array.isArray(data) ? data.filter(Boolean) : Object.values(data);
            this.productsCache = list;
            return list;
          }
        } catch (e) {
          console.warn('Firebase RTDB products (fresh) read warning; using local data:', e.message);
        }
      }
      return this.getProducts();
    },

    // Fetch single product by ID or slug
    getProductByIdOrSlug: async function (identifier) {
      const all = await this.getProducts();
      return all.find(p => p.id === identifier || p.slug === identifier || 
        p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') === identifier) || null;
    },

    // Fetch products by category
    getProductsByCategory: async function (catId) {
      const all = await this.getProducts();
      if (!catId || catId === 'all') return all;
      return all.filter(p => p.category === catId);
    },

    // Listen to real-time reviews for a product
    listenToReviews: function (productId, callback) {
      if (typeof firebase === 'undefined' || !firebase.database) {
        if (typeof callback === 'function') callback([]);
        return () => {};
      }
      const ref = firebase.database().ref('reviews/' + productId);
      const handler = (snapshot) => {
        const val = snapshot.val();
        const reviews = val ? Object.values(val) : [];
        if (typeof callback === 'function') callback(reviews);
      };
      ref.on('value', handler);
      return () => ref.off('value', handler);
    },

    // Listen to ALL reviews across all products (Admin only)
    listenToAllReviews: function (callback) {
      if (typeof firebase === 'undefined' || !firebase.database) {
        if (typeof callback === 'function') callback([]);
        return () => {};
      }
      const ref = firebase.database().ref('reviews');
      const handler = (snapshot) => {
        const val = snapshot.val() || {};
        const all = [];
        Object.keys(val).forEach(productId => {
          const productReviews = val[productId] || {};
          Object.keys(productReviews).forEach(reviewKey => {
            all.push(Object.assign({ id: reviewKey, productId: productId }, productReviews[reviewKey]));
          });
        });
        all.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        if (typeof callback === 'function') callback(all);
      };
      ref.on('value', handler);
      return () => ref.off('value', handler);
    },

    // Delete review (Admin/Staff only)
    deleteReview: async function (productId, reviewId) {
      if (typeof firebase === 'undefined' || !firebase.database) return { success: false, error: 'Database unavailable' };
      try {
        await firebase.database().ref('reviews/' + productId + '/' + reviewId).remove();
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    // Save or update product (Admin only)
    saveProduct: async function (productData) {
      if (typeof firebase === 'undefined' || !firebase.database) return { success: false, error: 'Database unavailable' };
      try {
        const id = productData.id || ('prod-' + Date.now().toString(36));
        const record = Object.assign({}, productData, { id: id, updatedAt: firebase.database.ServerValue.TIMESTAMP });
        await firebase.database().ref('products/' + id).set(record);
        this.productsCache = null; // Invalidate cache
        return { success: true, product: record };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    // Delete product (Super Admin only)
    deleteProduct: async function (productId) {
      if (typeof firebase === 'undefined' || !firebase.database) return { success: false, error: 'Database unavailable' };
      try {
        await firebase.database().ref('products/' + productId).remove();
        this.productsCache = null; // Invalidate cache
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    // Save or update category (Admin only)
    saveCategory: async function (categoryData) {
      if (typeof firebase === 'undefined' || !firebase.database) return { success: false, error: 'Database unavailable' };
      try {
        const id = categoryData.id || categoryData.slug || ('cat-' + Date.now().toString(36));
        const record = Object.assign({}, categoryData, { id: id });
        await firebase.database().ref('categories/' + id).set(record);
        this.categoriesCache = null;
        return { success: true, category: record };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    // Delete category (Super Admin only)
    deleteCategory: async function (categoryId) {
      if (typeof firebase === 'undefined' || !firebase.database) return { success: false, error: 'Database unavailable' };
      try {
        await firebase.database().ref('categories/' + categoryId).remove();
        this.categoriesCache = null;
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    // Add review (verified customer gate enforced per Phase 0)
    addReview: async function (productId, reviewData) {
      if (!window.VrindaAuth) return { success: false, error: 'Auth not initialized.' };
      const gate = window.VrindaAuth.canPerformGatedAction('review');
      if (!gate.allowed) return { success: false, error: gate.message };

      const user = window.VrindaAuth.currentUser;
      const newReview = {
        userId: user.uid,
        userName: user.displayName || 'Verified Buyer',
        rating: reviewData.rating || 5,
        comment: reviewData.comment || '',
        createdAt: firebase.database.ServerValue.TIMESTAMP
      };

      try {
        await firebase.database().ref('reviews/' + productId).push(newReview);
        return { success: true, message: 'Review submitted successfully!' };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  };

  window.VrindaCatalog = CatalogService;

  document.addEventListener('DOMContentLoaded', () => {
    CatalogService.initSeedIfNeeded();
  });
})();
