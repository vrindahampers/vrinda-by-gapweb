/**
 * vrindahampers - Category & Catalog Listing Controller
 * Supports filtering by category, search by keywords, sorting,
 * and linking to custom product configurators.
 */

(function () {
  'use strict';

  let currentCategory = 'all';
  let allProducts = [];
  let allCategories = [];

  document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    currentCategory = urlParams.get('slug') || 'all';

    // 1) Paint immediately from the bundled catalog — zero network wait.
    //    This is what makes ?slug=all feel instant instead of blocking on
    //    two sequential Firebase RTDB round-trips.
    if (window.VRINDA_DATA) {
      allCategories = window.VRINDA_DATA.categories || [];
      allProducts = window.VRINDA_DATA.products || [];
    }

    renderCategoryChips();
    updateCategoryHeader();
    setupEventListeners();
    applyFiltersAndRender();

    // 2) Re-paint in the background once the live Firebase catalog arrives.
    hydrateFromFirebase();
  });

  async function hydrateFromFirebase() {
    if (!window.VrindaCatalog ||
        typeof window.VrindaCatalog.getCategories !== 'function' ||
        typeof window.VrindaCatalog.getProducts !== 'function') {
      return;
    }

    try {
      const [cats, prods] = await Promise.all([
        window.VrindaCatalog.getCategories(),
        window.VrindaCatalog.getProducts()
      ]);

      if (cats && cats.length) allCategories = cats;
      if (prods && prods.length) allProducts = prods;

      renderCategoryChips();
      updateCategoryHeader();
      applyFiltersAndRender();
    } catch (err) {
      console.warn('Live catalog refresh skipped; showing bundled catalog.', err && err.message);
    }
  }

  function renderCategoryChips() {
    const chipsContainer = document.getElementById('categoryFilterChips');
    if (!chipsContainer) return;

    let html = `<a href="?slug=all" class="filter-chip ${currentCategory === 'all' ? 'active' : ''}" data-slug="all">All Gifts</a>`;

    allCategories.forEach(cat => {
      const isActive = currentCategory === cat.slug || currentCategory === cat.id;
      html += `
        <a href="?slug=${cat.slug}" class="filter-chip ${isActive ? 'active' : ''}" data-slug="${cat.slug}">
          ${cat.name}
        </a>
      `;
    });

    chipsContainer.innerHTML = html;
  }

  function updateCategoryHeader() {
    const titleEl = document.getElementById('categoryPageTitle');
    const descEl = document.getElementById('categoryPageDescription');
    const badgeEl = document.getElementById('categoryBadge');
    const customBanner = document.getElementById('customConfiguratorBanner');
    const customBannerTitle = document.getElementById('customBannerTitle');
    const customBannerLink = document.getElementById('customBannerLink');

    if (currentCategory === 'all') {
      if (titleEl) titleEl.textContent = 'All Handcrafted Collections';
      if (descEl) descEl.textContent = 'Browse our complete catalog of eternal rose bouquets, luxury hampers, personalized Spotify prints, and calligraphy letters.';
      if (badgeEl) badgeEl.textContent = 'Full Collection';
      if (customBanner) customBanner.style.display = 'flex';
      return;
    }

    const matchedCat = allCategories.find(c => c.slug === currentCategory || c.id === currentCategory);
    if (matchedCat) {
      if (titleEl) titleEl.textContent = matchedCat.name;
      if (descEl) descEl.textContent = matchedCat.description || 'Artisanal made-to-order treasures curated with endless love.';
      if (badgeEl) badgeEl.textContent = matchedCat.count || 'Curated';
      document.title = `${matchedCat.name} — vrindahampers`;

      const customMapping = {
        'bouquets': { type: 'bouquet', name: 'Custom Everlasting Bouquet' },
        'hampers': { type: 'hamper', name: 'Custom Luxury Hamper' },
        'keychains': { type: 'keychain', name: 'Custom Spotify Keychain' },
        'polaroids': { type: 'polaroids', name: 'Custom Retro Polaroids' },
        'handwritten-letters': { type: 'letter', name: 'Wax-Sealed Handwritten Letter' }
      };

      if (customBanner) {
        if (customMapping[matchedCat.slug] || customMapping[matchedCat.id]) {
          const cfg = customMapping[matchedCat.slug] || customMapping[matchedCat.id];
          customBanner.style.display = 'flex';
          if (customBannerTitle) customBannerTitle.textContent = `Design Your Own ${cfg.name}`;
          if (customBannerLink) customBannerLink.href = `../custom/?type=${cfg.type}`;
        } else {
          customBanner.style.display = 'none';
        }
      }
    }
  }

  function setupEventListeners() {
    const searchInput = document.getElementById('catalogSearch');
    const sortSelect = document.getElementById('catalogSort');
    const resetBtn = document.getElementById('resetFiltersBtn');

    searchInput?.addEventListener('input', () => applyFiltersAndRender());
    sortSelect?.addEventListener('change', () => applyFiltersAndRender());
    resetBtn?.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      if (sortSelect) sortSelect.value = 'featured';
      window.location.href = '?slug=all';
    });
  }
  function applyFiltersAndRender() {
    const searchVal = (document.getElementById('catalogSearch')?.value || '').trim().toLowerCase();
    const sortVal = document.getElementById('catalogSort')?.value || 'featured';

    let filtered = allProducts.slice();

    if (currentCategory !== 'all') {
      filtered = filtered.filter(p => p.category === currentCategory || p.categorySlug === currentCategory);
    }

    if (searchVal) {
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(searchVal) ||
        (p.description && p.description.toLowerCase().includes(searchVal)) ||
        (p.categoryName && p.categoryName.toLowerCase().includes(searchVal))
      );
    }

    if (sortVal === 'price-low') {
      filtered.sort((a, b) => a.price - b.price);
    } else if (sortVal === 'price-high') {
      filtered.sort((a, b) => b.price - a.price);
    } else if (sortVal === 'rating') {
      filtered.sort((a, b) => b.rating - a.rating);
    } else if (sortVal === 'newest') {
      filtered.sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0));
    }

    renderProducts(filtered);
  }

  function renderProducts(items) {
    const grid = document.getElementById('categoryProductsGrid');
    const countEl = document.getElementById('itemCount');
    const emptyNotice = document.getElementById('noProductsNotice');

    if (countEl) countEl.textContent = items.length;
    if (!grid) return;

    if (items.length === 0) {
      grid.innerHTML = '';
      if (emptyNotice) emptyNotice.style.display = 'block';
      return;
    }

    if (emptyNotice) emptyNotice.style.display = 'none';

    grid.innerHTML = items.map(p => {
      const badgeClass = p.badge && p.badge.toLowerCase().includes('best')
        ? 'badge-bestseller'
        : (p.badge && p.badge.toLowerCase().includes('new') ? 'badge-new' : 'badge-primary');

      const productSlug = p.slug || p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const productUrl = `../product/?id=${p.id}&slug=${productSlug}`;
      const attrs = `data-product-id="${p.id}"` +
        ` data-name="${p.name}"` +
        ` data-slug="${productSlug}"` +
        ` data-price="${p.price}"` +
        ` data-mrp="${p.originalPrice || p.price}"` +
        ` data-image="${p.image || ''}"` +
        ` data-category="${p.category || ''}"` +
        ` data-category-name="${p.categoryName || p.category || ''}"`;

      return `
        <article class="product-card">
          <div class="product-media">
            <div class="product-badges">
              ${p.badge ? `<span class="badge ${badgeClass}">${p.badge}</span>` : ''}
            </div>
            <button type="button" class="wishlist-btn js-toggle-wishlist" ${attrs} aria-label="Add to wishlist" title="Save to wishlist">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
              </svg>
            </button>
            <a href="${productUrl}">
              <img src="${p.image}" alt="${p.name}" class="product-img" loading="lazy" width="400" height="432">
            </a>
          </div>
          <div class="product-content">
            <div class="product-category">${p.categoryName || p.category}</div>
            <h3 class="product-title">
              <a href="${productUrl}" style="color: inherit;">${p.name}</a>
            </h3>
            <div class="product-rating">
              <span class="rating-stars">★★★★★</span>
              <span>${p.rating || 5.0} (${p.reviewCount || 10})</span>
            </div>
            <div class="product-price-row">
              <span class="product-price">₹${p.price.toLocaleString('en-IN')}</span>
              ${p.originalPrice ? `<span class="product-original-price">₹${p.originalPrice.toLocaleString('en-IN')}</span>` : ''}
            </div>
            <div class="product-actions">
              <button type="button" class="btn btn-primary btn-sm js-add-to-cart" ${attrs} style="flex: 1;">
                Add to Cart
              </button>
              <a href="${productUrl}" class="btn btn-secondary btn-sm" style="flex: 1;">
                View Details
              </a>
              <a href="https://wa.me/919876543210?text=Hi%20vrindahampers!%20I'm%20interested%20in%20customizing:%20${encodeURIComponent(p.name)}" 
                 target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm" aria-label="Custom inquiry">
                Customise
              </a>
            </div>
          </div>
        </article>
      `;
    }).join('');

    // Reflect wishlist heart states on the freshly rendered cards.
    if (window.VrindaStore && typeof window.VrindaStore.syncWishlistButtons === 'function') {
      window.VrindaStore.syncWishlistButtons();
    }
  }
})();

