/**
 * vrindahampers - Shared Layout Component (Header, Mobile Drawer, Search, Footer)
 * Injects consistent navigation and footer across all static pages.
 */

(function () {
  'use strict';

  // Relative prefix back to the site root, captured during initLayout so the
  // announcement-link resolver (which runs on every settings change) can use it.
  let currentBasePath = './';

  function initLayout() {
    const headerPlaceholder = document.getElementById('vrinda-header');
    const footerPlaceholder = document.getElementById('vrinda-footer');

    const currentPath = window.location.pathname;
    // Every directory-level route needs its own relative prefix back to the site root.
    const SECTION_DIRS = ['/pages/', '/admin/', '/category/', '/product/', '/custom/'];
    const basePath = computeBasePath();
    currentBasePath = basePath;

    function computeBasePath() {
      // A <base href> (used by 404.html on deep pretty URLs) already fixes the root.
      if (document.querySelector && document.querySelector('base')) return './';

      const sectionDir = SECTION_DIRS.find(dir => currentPath.includes(dir));
      if (!sectionDir) return './';

      const remainder = currentPath.slice(currentPath.indexOf(sectionDir) + sectionDir.length);
      const nestedLevels = remainder.split('/').filter(Boolean).length - 1;
      return '../'.repeat(1 + Math.max(0, nestedLevels));
    }

    // 1. Inject Header HTML
    if (headerPlaceholder) {
      headerPlaceholder.innerHTML = `
        <div class="announcement-bar">
          Handcrafted with endless love 🌸 Free standard delivery on orders above ₹1499! <a href="#personalized">Explore Custom Gifts</a>
        </div>
        <header class="site-header" id="mainHeader">
          <div class="container header-inner">
            <button class="hamburger-btn" id="mobileMenuOpen" aria-label="Open mobile menu">
              <span class="hamburger-line"></span>
              <span class="hamburger-line"></span>
              <span class="hamburger-line"></span>
            </button>

            <a href="${basePath}index.html" class="brand-logo" aria-label="vrindahampers Home">
              vrinda<span>hampers</span>
            </a>

            <nav class="nav-desktop" aria-label="Main Navigation">
              <a href="${basePath}index.html" class="nav-link active">Home</a>
              <a href="${basePath}#categories" class="nav-link">Categories</a>
              <a href="${basePath}#personalized" class="nav-link">Personalized</a>
              <a href="${basePath}#bestsellers" class="nav-link">Bestsellers</a>
              <a href="${basePath}#occasions" class="nav-link">Occasions</a>
              <a href="${basePath}#why-us" class="nav-link">Why Us</a>
              <a href="${basePath}#faq" class="nav-link">FAQ</a>
            </nav>

            <div class="header-actions">
              <button class="icon-btn" id="searchToggle" aria-label="Search products" title="Search">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
              </button>

              <a href="${basePath}pages/wishlist.html" class="icon-btn auth-gate-trigger" data-gated="wishlist" data-href="${basePath}pages/wishlist.html" aria-label="Wishlist" title="Wishlist">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                </svg>
                <span class="icon-badge is-empty" data-badge="wishlist">0</span>
              </a>

              <a href="${basePath}pages/cart.html" class="icon-btn auth-gate-trigger" data-gated="cart" data-href="${basePath}pages/cart.html" aria-label="Shopping Cart" title="Cart">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle>
                  <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                </svg>
                <span class="icon-badge is-empty" data-badge="cart">0</span>
              </a>

              <div id="authActionSlot" style="display: flex; align-items: center;">
                <a href="${basePath}pages/login.html" class="btn btn-sm btn-outline auth-btn" id="loginBtn">
                  <span>Login</span>
                </a>
              </div>
            </div>
          </div>
        </header>

        <div class="mobile-drawer-overlay" id="drawerOverlay"></div>
        <aside class="mobile-drawer" id="mobileDrawer">
          <div class="drawer-header">
            <span class="brand-logo" style="font-size: 1.4rem;">vrinda<span>hampers</span></span>
            <button class="icon-btn" id="mobileMenuClose" aria-label="Close menu">&times;</button>
          </div>
          <div class="drawer-nav-list">
            <a href="${basePath}index.html" class="drawer-nav-link">Home <span>&rarr;</span></a>
            <a href="${basePath}#categories" class="drawer-nav-link">Shop By Category <span>&rarr;</span></a>
            <a href="${basePath}#personalized" class="drawer-nav-link">Custom & Personalized <span>&rarr;</span></a>
            <a href="${basePath}#bestsellers" class="drawer-nav-link">Best Sellers <span>&rarr;</span></a>
            <a href="${basePath}#occasions" class="drawer-nav-link">Occasions <span>&rarr;</span></a>
            <a href="${basePath}#why-us" class="drawer-nav-link">Why Choose Us <span>&rarr;</span></a>
            <a href="${basePath}#faq" class="drawer-nav-link">FAQ & Support <span>&rarr;</span></a>
            <a href="${basePath}pages/orders.html" class="drawer-nav-link auth-gate-trigger" data-gated="account" data-href="${basePath}pages/orders.html">My Orders <span>&rarr;</span></a>
            <a href="${basePath}pages/order-tracking.html" class="drawer-nav-link auth-gate-trigger" data-gated="tracking" data-href="${basePath}pages/order-tracking.html">Track Your Order <span>&rarr;</span></a>
          </div>
          <div id="drawerAuthSlot" style="padding: 14px 24px; border-top: 1px solid var(--color-border-subtle); margin-top: auto;">
            <a href="${basePath}pages/login.html" class="btn btn-outline btn-sm" style="display: block; width: 100%; text-align: center;">Login / Sign Up</a>
          </div>
        </aside>

        <div id="searchModal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(6px); z-index: var(--z-modal); align-items: flex-start; justify-content: center; padding: 5rem 1rem;">
          <div class="glass-card" style="width: 100%; max-width: 600px; padding: 1.5rem; border-radius: var(--radius-lg);">
            <div style="display: flex; gap: 8px; margin-bottom: 1rem;">
              <input type="text" id="searchInputField" class="form-input" placeholder="Search bouquets, hampers, polaroids..." autofocus>
              <button id="closeSearchModal" class="btn btn-secondary btn-sm">Close</button>
            </div>
            <div id="searchResults" style="max-height: 320px; overflow-y: auto;">
              <p style="font-size: 13px; color: var(--color-text-light); text-align: center; padding: 1rem 0;">Type to search vrindahampers...</p>
            </div>
          </div>
        </div>
      `;
    }
    // 2. Inject Shared Footer HTML
    if (footerPlaceholder) {
      footerPlaceholder.innerHTML = `
        <footer class="site-footer">
          <div class="container">
            <div class="footer-top">
              <div class="footer-brand">
                <h3>vrinda<span>hampers</span></h3>
                <p>Curating heartfelt personal connections through artisanal bouquets, bespoke hampers, and eternal keepsakes. Every creation tells your unrepeatable story.</p>
                <div style="margin-top: 1.25rem;">
                  <a href="https://wa.me/919876543210?text=Hi%20vrindahampers!" target="_blank" rel="noopener noreferrer" class="btn btn-whatsapp btn-sm">
                    <span>Chat on WhatsApp</span>
                  </a>
                </div>
              </div>

              <div class="footer-col">
                <h4>Collections</h4>
                <div class="footer-links">
                  <a href="${basePath}#categories">Handcrafted Bouquets</a>
                  <a href="${basePath}#categories">Luxury Gift Hampers</a>
                  <a href="${basePath}#categories">Spotify & Initials Keychains</a>
                  <a href="${basePath}#categories">Retro Polaroid Sets</a>
                  <a href="${basePath}#categories">Calligraphy Letters</a>
                  <a href="${basePath}#personalized">Custom Keepsakes</a>
                </div>
              </div>

              <div class="footer-col">
                <h4>Occasions</h4>
                <div class="footer-links">
                  <a href="${basePath}#occasions">Birthdays</a>
                  <a href="${basePath}#occasions">Anniversaries</a>
                  <a href="${basePath}#occasions">Valentine & Romance</a>
                  <a href="${basePath}#occasions">Friendship & Besties</a>
                  <a href="${basePath}#occasions">Festive Curations</a>
                </div>
              </div>

              <div class="footer-col">
                <h4>Support & Info</h4>
                <div class="footer-links">
                  <a href="${basePath}pages/contact.html">Contact Us</a>
                  <a href="${basePath}policies.html">Privacy Policy</a>
                  <a href="${basePath}policies.html#terms-of-service">Terms of Service</a>
                  <a href="${basePath}policies.html#shipping-delivery">Shipping &amp; Delivery</a>
                  <a href="${basePath}policies.html#returns-refunds">Returns &amp; Refunds</a>
                  <a href="${basePath}policies.html#cancellation-policy">Cancellation Policy</a>
                  <a href="${basePath}pages/orders.html" class="auth-gate-trigger" data-gated="account" data-href="${basePath}pages/orders.html">My Orders</a>
                  <a href="${basePath}pages/order-tracking.html" class="auth-gate-trigger" data-gated="tracking" data-href="${basePath}pages/order-tracking.html">Track Your Order</a>
                </div>
              </div>
            </div>

            <div class="footer-bottom">
              <p>&copy; ${new Date().getFullYear()} vrindahampers. Handcrafted with love in India. All rights reserved.</p>
              <div class="footer-payments">
                <span>Secure Payments via FamGateway</span>
                <span>•</span>
                <span>Prepaid & Bespoke</span>
              </div>
            </div>
          </div>
        </footer>

        <!-- Floating WhatsApp Concierge -->
        <a href="https://wa.me/919876543210?text=Hi%20vrindahampers!%20I%20would%20like%20to%20inquire%20about%20a%20personalized%20gift." 
           class="whatsapp-float" target="_blank" rel="noopener noreferrer" aria-label="Chat with our gifting concierge on WhatsApp">
          <svg class="whatsapp-float-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2zm5.78 14.12c-.24.68-1.2 1.34-1.68 1.42-.45.08-1.04.14-3.04-.69-2.55-1.06-4.2-3.66-4.33-3.83-.13-.17-1.04-1.38-1.04-2.64 0-1.26.66-1.88.89-2.14.24-.26.52-.32.7-.32.17 0 .35 0 .5.01.16.01.38-.06.59.45.22.52.75 1.83.82 1.96.07.14.11.3.02.48-.09.18-.14.29-.27.45-.14.15-.29.35-.42.47-.14.13-.28.27-.12.55.16.27.7 1.16 1.5 1.88 1.03.92 1.9 1.21 2.18 1.34.27.14.43.12.59-.07.16-.18.68-.79.86-1.06.18-.27.36-.23.6-.14.24.09 1.55.73 1.81.86.26.13.43.2.49.31.06.11.06.66-.18 1.34z"/>
          </svg>
          <span>WhatsApp Help</span>
        </a>
      `;
    }

    // Apply admin-managed settings/SEO that may have arrived before the chrome existed.
    if (window.VrindaStore) {
      applyStoreChrome(window.VrindaStore.config());
      applyHomeSeo(window.VrindaStore.seo());
    }

    attachLayoutEvents(basePath);
  }

  // Header search runs against the admin-managed Firebase catalog. The bundled
  // sample is used only until the live /products read lands (or if it fails).
  let searchProductsCache = null;
  let searchCatalogRequested = false;

  function searchCatalog() {
    if (searchProductsCache) return searchProductsCache;
    // Firebase only. The bundled sample array is empty now, and seeding it
    // from VRINDA_DATA would make search suggest products that no longer exist.
    searchProductsCache = [];

    if (!searchCatalogRequested && window.VrindaCatalog && typeof window.VrindaCatalog.getProducts === 'function') {
      searchCatalogRequested = true;
      window.VrindaCatalog.getProducts().then((products) => {
        if (Array.isArray(products) && products.length) searchProductsCache = products;
      }).catch(() => { /* keep the bundled sample */ });
    }
    return searchProductsCache;
  }

  /**
   * Push admin-managed store settings into the injected chrome: the announcement
   * bar (text, link and on/off are all editable in Admin -> Store Settings) and
   * every wa.me link. Driven live by the "vrinda:settings-changed" event.
   */
  function applyStoreChrome(cfg) {
    if (!cfg) return;

    const bar = document.querySelector('.announcement-bar');
    if (bar) {
      const announcement = cfg.announcement;

      if (announcement && announcement.enabled === false) {
        bar.style.display = 'none';
      } else if (cfg.freeShippingThreshold != null && !Number.isNaN(Number(cfg.freeShippingThreshold))) {
        const threshold = '₹' + Number(cfg.freeShippingThreshold).toLocaleString('en-IN');
        const fallback = 'Handcrafted with endless love 🌸 Free standard delivery on orders above ' + threshold + '!';
        // {threshold} keeps the admin's sentence live without hard-coding a price.
        const text = announcement && announcement.text
          ? String(announcement.text).replace(/\{threshold\}/g, threshold)
          : fallback;

        const label = (announcement && announcement.linkLabel) || 'Explore Custom Gifts';
        const href = resolveAnnouncementLink(announcement && announcement.link);

        bar.style.display = '';
        bar.innerHTML = escapeHtml(text) + ' <a href="' + escapeHtml(href) + '">' + escapeHtml(label) + '</a>';
      }
    }

    if (cfg.whatsappNumber && /[0-9]/.test(String(cfg.whatsappNumber))) {
      document.querySelectorAll('a[href*="wa.me/"]').forEach((a) => {
        const href = a.getAttribute('href');
        if (href) a.setAttribute('href', href.replace(/wa\.me\/\d+/, 'wa.me/' + cfg.whatsappNumber));
      });
    }
  }

  /**
   * Apply the admin-managed default SEO meta tags — homepage only (marked by
   * .hero-section) so per-page titles elsewhere stay untouched.
   */
  function applyHomeSeo(seo) {
    if (!seo) return;
    if (!document.querySelector('.hero-section')) return;

    if (seo.title) document.title = seo.title;
    if (seo.description) {
      const meta = document.querySelector('meta[name="description"]');
      if (meta) meta.setAttribute('content', seo.description);
    }
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
    ));
  }

  /**
   * Turns whatever the admin typed for the announcement link into an href that
   * works on EVERY page. The old hard-coded "#personalized" only did anything on
   * the homepage; a bare anchor is now resolved against the homepage, a relative
   * path against the site root, and an absolute URL is left alone.
   */
  function resolveAnnouncementLink(link) {
    const base = currentBasePath || './';
    const value = String(link || '').trim();
    if (!value) return base + 'index.html#personalized';
    if (/^https?:\/\//i.test(value)) return value;
    if (value.charAt(0) === '#') return base + 'index.html' + value;
    return base + value.replace(/^\.\//, '');
  }

  // Live re-apply whenever the Super Admin saves Store Settings & SEO.
  document.addEventListener('vrinda:settings-changed', (e) => applyStoreChrome(e.detail));
  document.addEventListener('vrinda:seo-changed', (e) => applyHomeSeo(e.detail));

  function attachLayoutEvents(basePath) {
    // Header scroll background effect
    const mainHeader = document.getElementById('mainHeader');
    window.addEventListener('scroll', () => {
      if (window.scrollY > 40) {
        mainHeader?.classList.add('scrolled');
      } else {
        mainHeader?.classList.remove('scrolled');
      }
    }, { passive: true });

    // Mobile Drawer Open / Close
    const mobileMenuOpen = document.getElementById('mobileMenuOpen');
    const mobileMenuClose = document.getElementById('mobileMenuClose');
    const mobileDrawer = document.getElementById('mobileDrawer');
    const drawerOverlay = document.getElementById('drawerOverlay');

    function openDrawer() {
      mobileDrawer?.classList.add('open');
      drawerOverlay?.classList.add('open');
      document.body.style.overflow = 'hidden';
    }

    function closeDrawer() {
      mobileDrawer?.classList.remove('open');
      drawerOverlay?.classList.remove('open');
      document.body.style.overflow = '';
    }

    mobileMenuOpen?.addEventListener('click', openDrawer);
    mobileMenuClose?.addEventListener('click', closeDrawer);
    drawerOverlay?.addEventListener('click', closeDrawer);

    // Close drawer when any drawer link is clicked (delegated so links rendered
    // later by updateAuthUI are covered too)
    document.addEventListener('click', (e) => {
      if (e.target.closest && e.target.closest('.drawer-nav-link')) closeDrawer();
    });

    // Search Modal Toggle & Handling
    const searchToggle = document.getElementById('searchToggle');
    const searchModal = document.getElementById('searchModal');
    const closeSearchModal = document.getElementById('closeSearchModal');
    const searchInputField = document.getElementById('searchInputField');
    const searchResults = document.getElementById('searchResults');

    function toggleSearch(show) {
      if (!searchModal) return;
      searchModal.style.display = show ? 'flex' : 'none';
      if (show) {
        searchInputField?.focus();
        document.body.style.overflow = 'hidden';
      } else {
        document.body.style.overflow = '';
      }
    }

    searchToggle?.addEventListener('click', () => toggleSearch(true));
    closeSearchModal?.addEventListener('click', () => toggleSearch(false));
    searchModal?.addEventListener('click', (e) => {
      if (e.target === searchModal) toggleSearch(false);
    });

    searchInputField?.addEventListener('input', (e) => {
      const query = e.target.value.trim().toLowerCase();
      const pool = searchCatalog();
      if (!query || !pool.length) {
        searchResults.innerHTML = `<p style="font-size: 13px; color: var(--color-text-light); text-align: center; padding: 1rem 0;">Type to search vrindahampers...</p>`;
        return;
      }
      const matched = pool.filter(p =>
        (p.name || '').toLowerCase().includes(query) ||
        (p.categoryName || p.category || '').toLowerCase().includes(query) ||
        (p.description || '').toLowerCase().includes(query)
      );

      if (matched.length === 0) {
        searchResults.innerHTML = `<p style="font-size: 14px; color: var(--color-text-muted); text-align: center; padding: 1rem 0;">No gifts found matching "${e.target.value}".</p>`;
        return;
      }

      searchResults.innerHTML = matched.map(p => `
        <div style="display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--color-border-subtle);">
          <img src="${p.image}" alt="${p.name}" style="width: 50px; height: 50px; border-radius: 8px; object-fit: cover;">
          <div style="flex-grow: 1;">
            <div style="font-size: 14px; font-weight: 600; color: var(--color-text-main);">${p.name}</div>
            <div style="font-size: 12px; color: var(--color-text-muted);">₹${p.price} • ${p.categoryName}</div>
          </div>
          <a href="#personalized" class="btn btn-sm btn-primary">View</a>
        </div>
      `).join('');
    });

    // Auth gating for protected actions per the Phase 0 business rules.
    // Delegated (rather than per-element) so buttons rendered later by the shop
    // controllers — product cards, wishlist hearts — are covered automatically.
    document.addEventListener('click', (e) => {
      const target = e.target;
      if (!target || typeof target.closest !== 'function') return;

      const trigger = target.closest('.auth-gate-trigger');
      if (!trigger) return;

      e.preventDefault();
      const gatedAction = trigger.getAttribute('data-gated') || 'account';
      const destination = trigger.getAttribute('data-href') || '';

      const allowed = window.VrindaAuth
        ? window.VrindaAuth.requireGate(gatedAction, {
            redirectUrl: destination || window.location.href,
            loginPath: `${basePath}pages/login.html`,
            profilePath: `${basePath}pages/profile.html`
          })
        : false;

      if (!allowed) return;

      // Authenticated (and verified where required) — let page controllers react too.
      document.dispatchEvent(new CustomEvent('vrinda:gated-action', {
        detail: { action: gatedAction, trigger: trigger }
      }));

      if (gatedAction === 'tracking') {
        window.location.href = destination || `${basePath}pages/order-tracking.html`;
        return;
      }

      if (destination) window.location.href = destination;
    });

    // Keep the header cart/wishlist counters in sync with the RTDB cart.
    refreshHeaderBadges();
    // Real-time Auth UI State Observer
    if (window.VrindaAuth) {
      window.VrindaAuth.onAuthChange((user, profile) => {
        updateAuthUI(user, profile, basePath);
      });
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        if (window.VrindaAuth) {
          window.VrindaAuth.onAuthChange((user, profile) => {
            updateAuthUI(user, profile, basePath);
          });
        }
      });
    }

    /**
     * Header cart / wishlist counters. store-service.js owns the numbers; on pages
     * that load it after layout.js we poll briefly instead of failing silently.
     */
    function refreshHeaderBadges() {
      if (window.VrindaStore && typeof window.VrindaStore.refreshBadges === 'function') {
        window.VrindaStore.refreshBadges();
        return;
      }

      let attempts = 0;
      const timer = setInterval(() => {
        attempts += 1;
        if (window.VrindaStore && typeof window.VrindaStore.refreshBadges === 'function') {
          window.VrindaStore.refreshBadges();
          clearInterval(timer);
        } else if (attempts > 20) {
          clearInterval(timer);
        }
      }, 250);
    }

    function updateAuthUI(user, profile, basePath) {
      const authContainer = document.getElementById('authActionSlot');
      const drawerAuthContainer = document.getElementById('drawerAuthSlot');
      if (!authContainer) return;

      if (user) {
        const displayName = (profile && profile.name) || user.displayName || user.email.split('@')[0];
        const isVerified = user.emailVerified;
        const role = (profile && profile.role) || 'customer';

        authContainer.innerHTML = `
          <div style="position: relative; display: inline-block;">
            <button class="btn btn-sm btn-glass" id="profileDropdownBtn" style="gap: 6px; padding: 0.4rem 0.9rem;">
              <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${isVerified ? 'var(--color-success)' : 'var(--color-warning)'};"></span>
              <span style="max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${displayName}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </button>
            <div id="profileDropdownMenu" style="display: none; position: absolute; right: 0; top: calc(100% + 8px); width: 220px; background: var(--color-bg-surface); border: 1px solid var(--color-border-light); border-radius: var(--radius-md); box-shadow: var(--shadow-lg); z-index: var(--z-modal); overflow: hidden;">
              <div style="padding: 10px 14px; border-bottom: 1px solid var(--color-border-subtle); background: var(--color-bg-subtle);">
                <div style="font-size: 13px; font-weight: 700; color: var(--color-text-main);">${displayName}</div>
                <div style="font-size: 11px; color: var(--color-text-muted);">${user.email}</div>
                ${!isVerified ? `<span class="badge badge-accent" style="margin-top: 4px; font-size: 10px;">Unverified Email</span>` : ''}
              </div>
              <div style="padding: 6px 0;">
                <a href="${basePath}pages/profile.html" style="display: flex; align-items: center; gap: 8px; padding: 8px 14px; font-size: 13px; color: var(--color-text-main);">
                  👤 My Profile & Addresses
                </a>
                <a href="${basePath}pages/orders.html" style="display: flex; align-items: center; gap: 8px; padding: 8px 14px; font-size: 13px; color: var(--color-text-main);">
                  📦 Order History
                </a>
                <a href="${basePath}pages/order-tracking.html" style="display: flex; align-items: center; gap: 8px; padding: 8px 14px; font-size: 13px; color: var(--color-text-main);">
                  📍 Track an Order
                </a>
                ${role === 'superadmin' ? `
                  <a href="${basePath}admin/index.html" style="display: flex; align-items: center; gap: 8px; padding: 8px 14px; font-size: 13px; color: var(--color-primary); font-weight: 600;">
                    👑 Super Admin Portal
                  </a>
                ` : role === 'staff' ? `
                  <a href="${basePath}admin/staff.html" style="display: flex; align-items: center; gap: 8px; padding: 8px 14px; font-size: 13px; color: var(--color-primary); font-weight: 600;">
                    📋 Staff Operations
                  </a>
                ` : role === 'delivery' ? `
                  <a href="${basePath}admin/delivery.html" style="display: flex; align-items: center; gap: 8px; padding: 8px 14px; font-size: 13px; color: var(--color-primary); font-weight: 600;">
                    🛵 Delivery Hub
                  </a>
                ` : ''}
                <hr style="border: 0; border-top: 1px solid var(--color-border-subtle); margin: 4px 0;">
                <button id="logoutBtnHeader" style="width: 100%; text-align: left; display: flex; align-items: center; gap: 8px; padding: 8px 14px; font-size: 13px; color: var(--color-error); cursor: pointer; background: none; border: none;">
                  🚪 Sign Out
                </button>
              </div>
            </div>
          </div>
        `;

        const dropBtn = document.getElementById('profileDropdownBtn');
        const dropMenu = document.getElementById('profileDropdownMenu');
        dropBtn?.addEventListener('click', (e) => {
          e.stopPropagation();
          dropMenu.style.display = dropMenu.style.display === 'block' ? 'none' : 'block';
        });

        document.addEventListener('click', () => {
          if (dropMenu) dropMenu.style.display = 'none';
        });

        document.getElementById('logoutBtnHeader')?.addEventListener('click', async () => {
          if (window.VrindaAuth) {
            await window.VrindaAuth.logout();
            window.location.reload();
          }
        });

        // Mobile drawer mirrors the header account controls.
        if (drawerAuthContainer) {
          drawerAuthContainer.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
              <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; background: ${isVerified ? 'var(--color-success)' : 'var(--color-warning)'};"></span>
              <div style="min-width: 0;">
                <div style="font-size: 13px; font-weight: 700; color: var(--color-text-main); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${displayName}</div>
                <div style="font-size: 11px; color: var(--color-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${user.email}</div>
              </div>
            </div>
            <a href="${basePath}pages/profile.html" class="drawer-nav-link">👤 My Profile &amp; Addresses <span>&rarr;</span></a>
            <a href="${basePath}pages/orders.html" class="drawer-nav-link">📦 Order History <span>&rarr;</span></a>
            ${role === 'superadmin' ? `<a href="${basePath}admin/index.html" class="drawer-nav-link" style="color: var(--color-primary); font-weight: 600;">👑 Super Admin Portal <span>&rarr;</span></a>` : ''}
            ${role === 'staff' ? `<a href="${basePath}admin/staff.html" class="drawer-nav-link" style="color: var(--color-primary); font-weight: 600;">📋 Staff Operations <span>&rarr;</span></a>` : ''}
            ${role === 'delivery' ? `<a href="${basePath}admin/delivery.html" class="drawer-nav-link" style="color: var(--color-primary); font-weight: 600;">🛵 Delivery Hub <span>&rarr;</span></a>` : ''}
            <button id="logoutBtnDrawer" style="width: 100%; text-align: left; display: flex; align-items: center; gap: 8px; padding: 12px 0; font-size: var(--font-size-md); font-family: var(--font-serif); color: var(--color-error); cursor: pointer; background: none; border: none;">
              🚪 Sign Out
            </button>
          `;
          document.getElementById('logoutBtnDrawer')?.addEventListener('click', async () => {
            if (window.VrindaAuth) {
              await window.VrindaAuth.logout();
              window.location.reload();
            }
          });
        }
      } else {
        authContainer.innerHTML = `
          <a href="${basePath}pages/login.html" class="btn btn-sm btn-outline auth-btn" id="loginBtn">
            <span>Login</span>
          </a>
        `;
        if (drawerAuthContainer) {
          drawerAuthContainer.innerHTML = `
            <a href="${basePath}pages/login.html" class="btn btn-outline btn-sm" style="display: block; width: 100%; text-align: center;">Login / Sign Up</a>
          `;
        }
      }
    }

  }

  // Self-execute once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLayout);
  } else {
    initLayout();
  }

  // Global image fallback: any broken remote product photo degrades to the
  // local brand mark instead of a broken-image icon (capture phase catches
  // resource errors that do not bubble).
  document.addEventListener('error', (e) => {
    const t = e.target;
    if (t && t.tagName === 'IMG' && !t.dataset.vhFallback) {
      t.dataset.vhFallback = '1';
      const inSection = window.location.pathname.includes('/pages/') ||
        window.location.pathname.includes('/admin/') ||
        window.location.pathname.includes('/category/') ||
        window.location.pathname.includes('/product/') ||
        window.location.pathname.includes('/custom/');
      t.src = (inSection ? '../' : './') + 'assets/icons/favicon.svg';
    }
  }, true);
})();

