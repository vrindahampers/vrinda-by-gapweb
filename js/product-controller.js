/**
 * vrindahampers - Product Detail Page Controller
 * Handles reading product from RTDB / catalog, updating SEO titles,
 * rendering WhatsApp deep links, handling reviews, and related products.
 */

(function () {
  'use strict';

  let currentProduct = null;

  document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const productId = urlParams.get('id');
    const productSlug = urlParams.get('slug');

    if (!productId && !productSlug) {
      window.location.href = '../category/?slug=all';
      return;
    }

    if (window.VrindaCatalog) {
      currentProduct = await window.VrindaCatalog.getProductByIdOrSlug(productId || productSlug);
    }

    // Fallback to the bundled catalog ONLY if it actually holds the product.
    // This used to end in "|| VRINDA_DATA.products[0]", so a URL for a product
    // that had been deleted (or a typo) silently rendered a completely
    // DIFFERENT product's page. Never do that: an unknown product must 404.
    if (!currentProduct && window.VRINDA_DATA && Array.isArray(window.VRINDA_DATA.products) && window.VRINDA_DATA.products.length) {
      currentProduct = window.VRINDA_DATA.products.find(
        p => p.id === productId || p.slug === productSlug
      ) || null;
    }

    if (!currentProduct) {
      // Prefer a real 404 over redirecting to the catalog, so a deleted or
      // mistyped product URL reports honestly.
      window.location.replace('../404.html');
      return;
    }

    renderProductDetails();
    await renderRelatedProducts();
    initReviewSystem();
  });

  function renderProductDetails() {
    const p = currentProduct;

    // SEO updates
    document.title = `${p.name} — vrindahampers`;
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute('content', `${p.name}: ${p.description}`);

    const ogTitle = document.getElementById('ogTitle');
    const ogDesc = document.getElementById('ogDesc');
    const ogImage = document.getElementById('ogImage');
    const ogPrice = document.getElementById('ogPrice');
    const canonicalLink = document.getElementById('canonicalLink');

    if (ogTitle) ogTitle.setAttribute('content', `${p.name} — vrindahampers`);
    if (ogDesc) ogDesc.setAttribute('content', p.description);
    if (ogImage) ogImage.setAttribute('content', p.image);
    if (ogPrice) ogPrice.setAttribute('content', p.price);
    if (canonicalLink) canonicalLink.setAttribute('href', window.location.origin + window.location.pathname);

    // Breadcrumbs
    const bcCat = document.getElementById('bcCategoryLink');
    const bcProd = document.getElementById('bcProductName');
    if (bcCat) {
      bcCat.textContent = p.categoryName || p.category;
      bcCat.href = `../category/?slug=${p.category}`;
    }
    if (bcProd) bcProd.textContent = p.name;

    // Elements
    const titleEl = document.getElementById('pDetailTitle');
    const catEl = document.getElementById('pDetailCategory');
    const descEl = document.getElementById('pDetailDescription');
    const priceEl = document.getElementById('pDetailPrice');
    const origPriceEl = document.getElementById('pDetailOrigPrice');
    const discountEl = document.getElementById('pDetailDiscount');
    const imgEl = document.getElementById('pDetailImg');
    const badgesEl = document.getElementById('pDetailBadges');
    const ratingEl = document.getElementById('pDetailRating');
    const waBtn = document.getElementById('pWhatsAppBtn');

    if (titleEl) titleEl.textContent = p.name;
    if (catEl) catEl.textContent = (p.categoryName || p.category).toUpperCase();
    if (descEl) descEl.textContent = p.description;
    if (priceEl) priceEl.textContent = `₹${p.price.toLocaleString('en-IN')}`;
    if (imgEl) {
      imgEl.src = p.image;
      imgEl.alt = p.name;
    }

    if (p.originalPrice && p.originalPrice > p.price) {
      if (origPriceEl) origPriceEl.textContent = `₹${p.originalPrice.toLocaleString('en-IN')}`;
      const pct = Math.round(((p.originalPrice - p.price) / p.originalPrice) * 100);
      if (discountEl) discountEl.textContent = `SAVE ${pct}%`;
    } else {
      if (origPriceEl) origPriceEl.style.display = 'none';
      if (discountEl) discountEl.style.display = 'none';
    }

    if (badgesEl && p.badge) {
      badgesEl.innerHTML = `<span class="badge badge-bestseller">${p.badge}</span>`;
    }

    if (ratingEl) {
      ratingEl.textContent = `${p.rating || 5.0} (${p.reviewCount || 24} reviews)`;
    }

    if (waBtn) {
      const waText = `Hi vrindahampers! I would like to order and customize: "${p.name}" (Ref: ${p.id}, ₹${p.price}). Please guide me through customization.`;
      waBtn.href = `https://wa.me/919876543210?text=${encodeURIComponent(waText)}`;
    }
  }

  async function renderRelatedProducts() {
    const grid = document.getElementById('relatedProductsGrid');
    if (!grid) return;

    let products = [];
    if (window.VrindaCatalog) {
      products = await window.VrindaCatalog.getProducts();
    } else if (window.VRINDA_DATA) {
      products = window.VRINDA_DATA.products || [];
    }

    const related = products.filter(p => p.id !== currentProduct.id).slice(0, 4);

    grid.innerHTML = related.map(p => `
      <article class="product-card">
        <div class="product-media">
          <a href="./?id=${p.id}&slug=${p.slug || p.id}">
            <img src="${p.image}" alt="${p.name}" class="product-img" loading="lazy">
          </a>
        </div>
        <div class="product-content">
          <div class="product-category">${p.categoryName || p.category}</div>
          <h4 class="product-title">
            <a href="./?id=${p.id}&slug=${p.slug || p.id}" style="color: inherit;">${p.name}</a>
          </h4>
          <div class="product-price-row">
            <span class="product-price">₹${p.price.toLocaleString('en-IN')}</span>
          </div>
        </div>
      </article>
    `).join('');
  }
  function initReviewSystem() {
    const reviewsList = document.getElementById('reviewsList');
    const writeReviewBtn = document.getElementById('writeReviewBtn');
    const reviewFormCard = document.getElementById('reviewFormCard');
    const cancelReviewBtn = document.getElementById('cancelReviewBtn');
    const newReviewForm = document.getElementById('newReviewForm');

    const sampleReviews = [
      {
        userName: 'Priya M.',
        rating: 5,
        comment: 'Absolutely stunning work! The flowers look immortal and the handwritten letter had real wax stamping. 10/10 recommend!'
      },
      {
        userName: 'Karan V.',
        rating: 5,
        comment: 'Coordination on WhatsApp was super quick. They sent a photo mockup before packaging. Arrived promptly via Porter.'
      }
    ];

    function renderReviews(reviews) {
      if (!reviewsList) return;
      const displayReviews = (reviews && reviews.length > 0) ? reviews : sampleReviews;

      reviewsList.innerHTML = displayReviews.map(r => `
        <div class="review-card">
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
            <strong style="font-size: 14px; color: var(--color-text-main);">${r.userName || 'Verified Buyer'}</strong>
            <span class="rating-stars">${'★'.repeat(r.rating || 5)}</span>
          </div>
          <p style="font-size: 13px; color: var(--color-text-body); margin: 0; line-height: 1.5;">${r.comment}</p>
        </div>
      `).join('');
    }

    renderReviews([]);

    if (window.VrindaCatalog && currentProduct) {
      window.VrindaCatalog.listenToReviews(currentProduct.id, (reviews) => {
        if (reviews && reviews.length > 0) renderReviews(reviews);
      });
    }

    writeReviewBtn?.addEventListener('click', () => {
      if (window.VrindaAuth) {
        const gate = window.VrindaAuth.canPerformGatedAction('review');
        if (!gate.allowed) {
          alert(`vrindahampers Notice:\n\n${gate.message}`);
          if (gate.reason === 'unauthenticated') {
            window.location.href = `../pages/login.html?redirect=${encodeURIComponent(window.location.href)}`;
          }
          return;
        }
      }
      if (reviewFormCard) reviewFormCard.style.display = 'block';
    });

    cancelReviewBtn?.addEventListener('click', () => {
      if (reviewFormCard) reviewFormCard.style.display = 'none';
    });

    newReviewForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const rating = parseInt(document.getElementById('reviewRating')?.value || '5', 10);
      const comment = document.getElementById('reviewComment')?.value.trim();

      if (!comment) return;

      if (window.VrindaCatalog) {
        const res = await window.VrindaCatalog.addReview(currentProduct.id, { rating, comment });
        if (res.success) {
          alert('Thank you! Your review has been posted.');
          newReviewForm.reset();
          if (reviewFormCard) reviewFormCard.style.display = 'none';
        } else {
          alert(res.error || 'Failed to submit review.');
        }
      }
    });
  }
})();

