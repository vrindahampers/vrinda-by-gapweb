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

    // Initialize or seed Firebase RTDB if empty
    initSeedIfNeeded: async function () {
      if (typeof firebase === 'undefined' || !firebase.database) return;
      try {
        const catSnap = await firebase.database().ref('categories').once('value');
        if (!catSnap.exists() && window.VRINDA_DATA && window.VRINDA_DATA.categories) {
          const catMap = {};
          window.VRINDA_DATA.categories.forEach(c => { catMap[c.id] = c; });
          await firebase.database().ref('categories').set(catMap);
        }

        const prodSnap = await firebase.database().ref('products').once('value');
        if (!prodSnap.exists() && window.VRINDA_DATA && window.VRINDA_DATA.products) {
          const prodMap = {};
          window.VRINDA_DATA.products.forEach(p => { prodMap[p.id] = p; });
          await firebase.database().ref('products').set(prodMap);
        }
      } catch (err) {
        // Firebase might be in locked mode or placeholder keys; fallback safely
        console.warn('Catalog auto-seed notice (using local cache if RTDB offline):', err.message);
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
