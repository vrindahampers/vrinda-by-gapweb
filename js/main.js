/**
 * vrindahampers - Main Homepage Interactions & Dynamic Section Renderers
 * Phase 1 Foundation: Renders collections, categories, bestsellers, trending,
 * new arrivals, custom gifts, occasions, testimonials, Instagram gallery, and FAQ.
 */

(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', () => {
    if (!window.VRINDA_DATA) return;

    renderFeaturedCollections();
    renderCategories();
    renderBestSellers();
    renderTrendingGifts();
    renderNewArrivals();
    renderPersonalizedGifts();
    renderOccasions();
    renderTestimonials();
    renderInstagramGallery();
    renderFAQ();
    initNewsletterForm();
  });

  // Helper to create product card HTML
  function createProductCardHTML(p) {
    const badgeClass = p.badge && p.badge.toLowerCase().includes('best') 
      ? 'badge-bestseller' 
      : (p.badge && p.badge.toLowerCase().includes('new') ? 'badge-new' : 'badge-primary');

    return `
      <article class="product-card">
        <div class="product-media">
          <div class="product-badges">
            ${p.badge ? `<span class="badge ${badgeClass}">${p.badge}</span>` : ''}
          </div>
          <button class="wishlist-btn auth-gate-trigger" data-gated="wishlist" aria-label="Add to wishlist" title="Save to wishlist">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
          </button>
          <img src="${p.image}" alt="${p.name}" class="product-img" loading="lazy" width="400" height="432">
        </div>
        <div class="product-content">
          <div class="product-category">${p.categoryName}</div>
          <h3 class="product-title" title="${p.name}">${p.name}</h3>
          <div class="product-rating">
            <span class="rating-stars">★★★★★</span>
            <span>${p.rating} (${p.reviewCount})</span>
          </div>
          <div class="product-price-row">
            <span class="product-price">₹${p.price.toLocaleString('en-IN')}</span>
            ${p.originalPrice ? `<span class="product-original-price">₹${p.originalPrice.toLocaleString('en-IN')}</span>` : ''}
          </div>
          <div class="product-actions">
            <button class="btn btn-primary btn-sm auth-gate-trigger" data-gated="cart" style="flex: 1;">
              Add to Cart
            </button>
            <a href="https://wa.me/919876543210?text=Hi%20vrindahampers!%20I'm%20interested%20in:%20${encodeURIComponent(p.name)}" 
               target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm" aria-label="Custom inquiry">
              Customise
            </a>
          </div>
        </div>
      </article>
    `;
  }

  // Section 2: Featured Collections
  function renderFeaturedCollections() {
    const container = document.getElementById('featuredCollectionsGrid');
    if (!container) return;

    const collections = [
      {
        title: 'Everlasting Rose Bouquets',
        desc: 'Hand-crocheted & velvet eternal florals that never wilt',
        img: 'https://images.unsplash.com/photo-1561181286-d3fee7d55364?auto=format&fit=crop&w=800&q=80',
        tag: 'Bouquet Studio'
      },
      {
        title: 'The Luxe Velvet Hamper Box',
        desc: 'Curated keepsakes, scented candles & royal parchment letters',
        img: 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&w=800&q=80',
        tag: 'Signature Hampers'
      },
      {
        title: 'Spotify Frames & Keychains',
        desc: 'Your song and favourite memories cast in crystal glass',
        img: 'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&w=800&q=80',
        tag: 'Bespoke Keepsakes'
      }
    ];

    container.innerHTML = collections.map(col => `
      <div class="glass-card" style="border-radius: var(--radius-xl); overflow: hidden; position: relative;">
        <div style="aspect-ratio: 16 / 10; overflow: hidden; position: relative;">
          <img src="${col.img}" alt="${col.title}" style="width: 100%; height: 100%; object-fit: cover;" loading="lazy">
          <div style="position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(20,15,18,0.78) 100%);"></div>
          <div style="position: absolute; bottom: 20px; left: 24px; right: 24px; color: #fff;">
            <span class="badge badge-accent" style="margin-bottom: 8px;">${col.tag}</span>
            <h3 style="color: #fff; font-size: 1.4rem; margin-bottom: 6px;">${col.title}</h3>
            <p style="font-size: 0.88rem; color: #f0e6e8; margin-bottom: 12px;">${col.desc}</p>
            <a href="#personalized" class="btn btn-glass btn-sm" style="color: #fff; border-color: rgba(255,255,255,0.4);">
              Explore Collection &rarr;
            </a>
          </div>
        </div>
      </div>
    `).join('');
  }
  // Section 3: Categories Grid
  function renderCategories() {
    const container = document.getElementById('categoriesGrid');
    if (!container) return;

    container.innerHTML = window.VRINDA_DATA.categories.map(cat => `
      <div class="category-card" style="cursor: pointer;">
        <img src="${cat.image}" alt="${cat.name}" class="category-bg" loading="lazy">
        <div class="category-overlay"></div>
        <div class="category-info">
          <span class="category-count">${cat.count}</span>
          <h3 class="category-title">${cat.name}</h3>
          <p style="font-size: 13px; opacity: 0.9; margin-bottom: 12px; line-height: 1.4;">${cat.description}</p>
          <a href="#personalized" class="btn btn-glass btn-sm" style="color: #fff; border-color: rgba(255,255,255,0.4);">
            Browse Category &rarr;
          </a>
        </div>
      </div>
    `).join('');
  }

  // Section 4: Best Sellers
  function renderBestSellers() {
    const container = document.getElementById('bestSellersGrid');
    if (!container) return;
    const items = window.VRINDA_DATA.products.filter(p => p.isBestSeller).slice(0, 4);
    container.innerHTML = items.map(createProductCardHTML).join('');
  }

  // Section 5: Trending Gifts
  function renderTrendingGifts() {
    const container = document.getElementById('trendingGiftsGrid');
    if (!container) return;
    const items = window.VRINDA_DATA.products.filter(p => p.isTrending).slice(0, 4);
    container.innerHTML = items.map(createProductCardHTML).join('');
  }

  // Section 6: New Arrivals
  function renderNewArrivals() {
    const container = document.getElementById('newArrivalsGrid');
    if (!container) return;
    const items = window.VRINDA_DATA.products.filter(p => p.isNew || p.id === 'prod-007' || p.id === 'prod-004').slice(0, 4);
    container.innerHTML = items.map(createProductCardHTML).join('');
  }

  // Section 7: Personalized Gifts
  function renderPersonalizedGifts() {
    const container = document.getElementById('personalizedGiftsGrid');
    if (!container) return;
    const items = window.VRINDA_DATA.products.filter(p => p.isPersonalized).slice(0, 4);
    container.innerHTML = items.map(createProductCardHTML).join('');
  }

  // Section 8: Occasions Grid
  function renderOccasions() {
    const container = document.getElementById('occasionsGrid');
    if (!container) return;

    container.innerHTML = window.VRINDA_DATA.occasions.map(occ => `
      <div class="glass-card" style="border-radius: var(--radius-lg); overflow: hidden; position: relative;">
        <div style="aspect-ratio: 4 / 3; overflow: hidden; position: relative;">
          <img src="${occ.image}" alt="${occ.name}" style="width: 100%; height: 100%; object-fit: cover;" loading="lazy">
          <div style="position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(20,15,18,0.78) 100%);"></div>
          <div style="position: absolute; bottom: 16px; left: 18px; right: 18px; color: #fff;">
            <span class="badge badge-accent" style="margin-bottom: 6px;">${occ.badge}</span>
            <h3 style="color: #fff; font-size: 1.25rem; margin-bottom: 4px;">${occ.name}</h3>
            <p style="font-size: 0.85rem; color: #f0e6e8; margin-bottom: 10px;">${occ.tagline}</p>
            <a href="#personalized" class="btn btn-glass btn-sm" style="color: #fff; border-color: rgba(255,255,255,0.4); padding: 0.4rem 0.9rem; font-size: 12px;">
              View Gifts &rarr;
            </a>
          </div>
        </div>
      </div>
    `).join('');
  }

  // Section 9: Testimonials
  function renderTestimonials() {
    const container = document.getElementById('testimonialsGrid');
    if (!container) return;

    container.innerHTML = window.VRINDA_DATA.testimonials.map(t => `
      <div class="testimonial-card">
        <div class="rating-stars" style="margin-bottom: 12px;">★★★★★</div>
        <p class="testimonial-quote">“${t.quote}”</p>
        <div class="testimonial-author">
          <img src="${t.avatar}" alt="${t.name}" class="testimonial-avatar" loading="lazy">
          <div>
            <div class="testimonial-name">${t.name}</div>
            <div class="testimonial-location">${t.location}</div>
          </div>
        </div>
      </div>
    `).join('');
  }

  // Section 10: Instagram Gallery
  function renderInstagramGallery() {
    const container = document.getElementById('instagramGalleryGrid');
    if (!container) return;

    container.innerHTML = window.VRINDA_DATA.gallery.map(item => `
      <div class="glass-card" style="border-radius: var(--radius-md); overflow: hidden; position: relative; aspect-ratio: 1/1;">
        <img src="${item.image}" alt="${item.caption}" style="width: 100%; height: 100%; object-fit: cover;" loading="lazy">
        <div style="position: absolute; inset: 0; background: rgba(0,0,0,0.65); opacity: 0; transition: opacity var(--transition-fast); display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 1rem; text-align: center; color: #fff;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0'">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style="margin-bottom: 6px; color: var(--color-primary-light);">
            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
          </svg>
          <p style="font-size: 13px; font-weight: 500; margin-bottom: 6px;">${item.caption}</p>
          <span style="font-size: 11px; color: var(--color-primary-light);">❤️ ${item.likes} loves</span>
        </div>
      </div>
    `).join('');
  }

  // Section 12: FAQ Accordion
  function renderFAQ() {
    const container = document.getElementById('faqContainer');
    if (!container) return;

    container.innerHTML = window.VRINDA_DATA.faqs.map((faq, index) => `
      <div class="faq-item ${index === 0 ? 'active' : ''}">
        <button class="faq-question" aria-expanded="${index === 0 ? 'true' : 'false'}">
          <span>${faq.q}</span>
          <svg class="faq-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
        <div class="faq-answer">
          <p>${faq.a}</p>
        </div>
      </div>
    `).join('');

    // Attach click listeners to accordion buttons
    container.querySelectorAll('.faq-question').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = btn.closest('.faq-item');
        const isActive = item.classList.contains('active');

        // Close other items
        container.querySelectorAll('.faq-item').forEach(other => {
          other.classList.remove('active');
          other.querySelector('.faq-question').setAttribute('aria-expanded', 'false');
        });

        // Toggle current item
        if (!isActive) {
          item.classList.add('active');
          btn.setAttribute('aria-expanded', 'true');
        }
      });
    });
  }

  // Section 13: Newsletter Form Handler
  function initNewsletterForm() {
    const form = document.getElementById('newsletterForm');
    const input = document.getElementById('newsletterEmail');
    const msg = document.getElementById('newsletterMsg');

    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = input?.value.trim();
      if (!email || !email.includes('@')) {
        if (msg) {
          msg.textContent = 'Please enter a valid email address.';
          msg.style.color = 'var(--color-error)';
        }
        return;
      }

      if (msg) {
        msg.textContent = 'Thank you for subscribing! Your VIP gifting code will arrive shortly.';
        msg.style.color = 'var(--color-success)';
      }
      form.reset();
    });
  }
})();

