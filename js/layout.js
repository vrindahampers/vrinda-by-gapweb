/**
 * vrindahampers - Shared Layout Component (Header, Mobile Drawer, Search, Footer)
 * Injects consistent navigation and footer across all static pages.
 */

(function () {
  'use strict';

  function initLayout() {
    const headerPlaceholder = document.getElementById('vrinda-header');
    const footerPlaceholder = document.getElementById('vrinda-footer');

    const currentPath = window.location.pathname;
    // Every directory-level route needs its own relative prefix back to the site root.
    const SECTION_DIRS = ['/pages/', '/admin/', '/category/', '/product/', '/custom/'];
    const basePath = computeBasePath();

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

              <a href="javascript:void(0)" class="icon-btn auth-gate-trigger" data-gated="wishlist" aria-label="Wishlist">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                </svg>
                <span class="icon-badge">0</span>
              </a>

              <a href="javascript:void(0)" class="icon-btn auth-gate-trigger" data-gated="cart" aria-label="Shopping Cart">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle>
                  <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                </svg>
                <span class="icon-badge">0</span>
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
                  <a href="${basePath}#faq">How Personalization Works</a>
                  <a href="${basePath}#faq">Shipping & Delivery Policies</a>
                  <a href="${basePath}#faq">Cancellation Requests</a>
                  <a href="javascript:void(0)" class="auth-gate-trigger" data-gated="tracking">Track Your Order</a>
                  <a href="https://wa.me/919876543210" target="_blank" rel="noopener noreferrer">WhatsApp Concierge</a>
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

    attachLayoutEvents();
  }

  function attachLayoutEvents() {
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

    // Close drawer when any drawer link is clicked
    document.querySelectorAll('.drawer-nav-link').forEach(link => {
      link.addEventListener('click', closeDrawer);
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
      if (!query || !window.VRINDA_DATA?.products) {
        searchResults.innerHTML = `<p style="font-size: 13px; color: var(--color-text-light); text-align: center; padding: 1rem 0;">Type to search vrindahampers...</p>`;
        return;
      }
      const matched = window.VRINDA_DATA.products.filter(p => 
        p.name.toLowerCase().includes(query) || 
        p.categoryName.toLowerCase().includes(query) ||
        p.description.toLowerCase().includes(query)
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

    // Auth gating for protected actions per Phase 0 Business Rules
    document.querySelectorAll('.auth-gate-trigger').forEach(trigger => {
      trigger.addEventListener('click', (e) => {
        e.preventDefault();
        const gatedAction = trigger.getAttribute('data-gated') || 'account';
        const gate = window.VrindaAuth
          ? window.VrindaAuth.canPerformGatedAction(gatedAction)
          : {
              allowed: false,
              reason: 'unauthenticated',
              message: 'Account services are still initializing. Please try again in a moment.'
            };

        if (!gate.allowed) {
          alert(`vrindahampers Notice:\n\n${gate.message}\n\n(Browsing the full catalog is always 100% public.)`);
          if (gate.reason === 'unauthenticated') {
            window.location.href = `${basePath}pages/login.html?redirect=${encodeURIComponent(window.location.href)}`;
          } else if (gate.reason === 'unverified_email') {
            window.location.href = `${basePath}pages/profile.html`;
          }
          return;
        }

        // Authenticated (and verified where required) — let page controllers pick the action up.
        document.dispatchEvent(new CustomEvent('vrinda:gated-action', {
          detail: { action: gatedAction, trigger: trigger }
        }));

        const pendingNotice = {
          cart: 'Cart, checkout and FamGateway payments release in Phase 4 of our rollout.',
          wishlist: 'Wishlist account sync releases in Phase 4 of our rollout.',
          tracking: 'Live 11-step order tracking releases in Phase 5 of our rollout.'
        }[gatedAction];

        if (pendingNotice) {
          alert(`vrindahampers Notice:\n\n${pendingNotice}\n\nYour account is verified — this feature activates in the next release.`);
        }
      });
    });
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
      } else {
        authContainer.innerHTML = `
          <a href="${basePath}pages/login.html" class="btn btn-sm btn-outline auth-btn" id="loginBtn">
            <span>Login</span>
          </a>
        `;
      }
    }

  }

  // Self-execute once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLayout);
  } else {
    initLayout();
  }
})();

