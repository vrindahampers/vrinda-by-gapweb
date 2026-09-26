/**
 * vrindahampers - GitHub Pages 404 Fallback Router
 * GitHub Pages serves this file for any path without a physical file.
 * We resolve pretty URLs (e.g. /bouquets/red-rose-bouquet, /custom/bouquet)
 * to the matching static directory + query-string route declared in ROUTING_AND_SEO.md.
 */

(function () {
  'use strict';

  const DATA = window.VRINDA_DATA || { categories: [], products: [] };
  const ROUTE_KEYWORDS = ['category', 'product', 'custom', 'pages', 'admin', 'index.html', 'index'];
  const CATEGORY_SLUGS = (DATA.categories || []).map(c => (c.slug || c.id).toLowerCase());

  function slugify(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function findProduct(identifier) {
    const slug = String(identifier || '').toLowerCase();
    return (DATA.products || []).find(p =>
      p.id === slug || p.slug === slug || slugify(p.name) === slug
    ) || null;
  }

  function findCategory(identifier) {
    const slug = String(identifier || '').toLowerCase();
    return (DATA.categories || []).find(c =>
      c.id === slug || c.slug === slug || slugify(c.name) === slug
    ) || null;
  }

  function getSegments() {
    return window.location.pathname.split('/').filter(Boolean);
  }

  /**
   * Splits the current pathname into { basePath, segments } where basePath is the
   * deployment root (e.g. '/vrindahampers') and segments are the route parts.
   */
  function splitPath() {
    const parts = getSegments();
    const routeIndex = parts.findIndex(part => {
      const lower = part.toLowerCase();
      return ROUTE_KEYWORDS.includes(lower) || CATEGORY_SLUGS.includes(lower);
    });

    if (routeIndex === -1) {
      return {
        // Unknown deep path: assume the first segment is the deployment root (e.g. /<repo>/).
        basePath: parts.length > 1 ? '/' + parts[0] : '',
        segments: [],
        isAssetPath: true
      };
    }

    return {
      basePath: routeIndex === 0 ? '' : '/' + parts.slice(0, routeIndex).join('/'),
      segments: parts.slice(routeIndex),
      isAssetPath: false
    };
  }

  function buildTarget(basePath) {
    const segments = splitPath().segments;

    if (segments.length === 0) return null;

    const primary = segments[0].toLowerCase();

    // /category/<slug> or /category/<slug>/
    if (primary === 'category') {
      const slug = segments[1] ? slugify(segments[1]) : 'all';
      return { url: `${basePath}/category/?slug=${encodeURIComponent(slug)}`, label: (findCategory(slug) || {}).name || 'Catalog' };
    }

    // /product/<id-or-slug>
    if (primary === 'product') {
      const identifier = segments[1] ? segments[1].toLowerCase() : '';
      const product = findProduct(identifier) || findProduct(slugify(identifier));
      return {
        url: `${basePath}/product/?id=${encodeURIComponent(product ? product.id : identifier)}&slug=${encodeURIComponent(product ? (product.slug || slugify(product.name)) : identifier)}`,
        label: product ? product.name : 'Product Details'
      };
    }

    // /custom/<type>
    if (primary === 'custom') {
      const type = segments[1] ? slugify(segments[1]) : 'bouquet';
      return { url: `${basePath}/custom/?type=${encodeURIComponent(type)}`, label: 'Custom Studio' };
    }

    // /<category-slug>/<product-slug> or /<category-slug>
    const category = findCategory(primary);
    if (category) {
      if (segments[1]) {
        const product = findProduct(slugify(segments[1]));
        if (product) {
          return {
            url: `${basePath}/product/?id=${encodeURIComponent(product.id)}&slug=${encodeURIComponent(product.slug || slugify(product.name))}`,
            label: product.name
          };
        }
      } else {
        return { url: `${basePath}/category/?slug=${encodeURIComponent(category.slug || category.id)}`, label: category.name };
      }
    }

    // /<product-slug> on its own
    const orphanProduct = findProduct(slugify(segments[segments.length - 1]));
    if (orphanProduct) {
      return {
        url: `${basePath}/product/?id=${encodeURIComponent(orphanProduct.id)}&slug=${encodeURIComponent(orphanProduct.slug || slugify(orphanProduct.name))}`,
        label: orphanProduct.name
      };
    }

    return null;
  }

  function renderFallbackSuggestions(basePath) {
    const container = document.getElementById('routerSuggestions');
    const spinner = document.getElementById('routerSpinner');
    const title = document.getElementById('routerTitle');
    const message = document.getElementById('routerMessage');

    if (spinner) spinner.style.display = 'none';
    if (title) title.textContent = 'That gift page has moved';
    if (message) {
      message.textContent = 'We could not match that link. Explore one of these handcrafted collections instead — or ping our concierge on WhatsApp.';
    }
    document.title = 'Page Not Found — vrindahampers';
    if (!container) return;

    const showcase = (DATA.products || []).slice(0, 4);
    const categoryLinks = (DATA.categories || []).slice(0, 5).map(cat => `
      <a class="router-suggestion" href="${basePath}/category/?slug=${encodeURIComponent(cat.slug || cat.id)}">
        <span>🎁 ${cat.name}</span>
        <span style="color: var(--color-primary-dark); font-weight: 700;">Browse &rarr;</span>
      </a>
    `).join('');

    const productLinks = showcase.map(p => `
      <a class="router-suggestion" href="${basePath}/product/?id=${encodeURIComponent(p.id)}&slug=${encodeURIComponent(p.slug || slugify(p.name))}">
        <span>✨ ${p.name}</span>
        <span style="color: var(--color-primary-dark); font-weight: 700;">₹${p.price.toLocaleString('en-IN')}</span>
      </a>
    `).join('');

    container.innerHTML = categoryLinks + productLinks;
  }

  function init() {
    const split = splitPath();
    let target = null;
    let basePath = split.basePath;

    if (!split.isAssetPath) {
      target = buildTarget(basePath);
    } else {
      // Unknown route shape (e.g. /<repo>/velvet-midnight-rose-bouquet) — try the final segment as a product slug.
      const parts = getSegments();
      const last = parts.length ? parts[parts.length - 1].toLowerCase() : '';
      const product = findProduct(last) || findProduct(slugify(last));
      if (product) {
        basePath = parts.length > 1 ? '/' + parts.slice(0, -1).join('/') : '';
        target = {
          url: `${basePath}/product/?id=${encodeURIComponent(product.id)}&slug=${encodeURIComponent(product.slug || slugify(product.name))}`,
          label: product.name
        };
      }
    }

    // Loop guard: never bounce back to the exact same URL.
    if (target && target.url !== window.location.pathname + window.location.search) {
      try {
        sessionStorage.setItem('vrinda:lastMiss', window.location.pathname);
      } catch (e) {
        // sessionStorage may be blocked in strict privacy modes — routing should still work.
      }

      const title = document.getElementById('routerTitle');
      const message = document.getElementById('routerMessage');
      if (title) title.textContent = `Opening ${target.label}…`;
      if (message) message.textContent = 'Redirecting you to the right vrindahampers page.';

      setTimeout(() => window.location.replace(target.url), 350);
      return;
    }

    renderFallbackSuggestions(basePath);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

