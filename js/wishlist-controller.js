/**
 * vrindahampers - Wishlist Page Controller (Phase 4)
 * RTDB-backed wishlist at /wishlist/{uid}: add/remove, move-to-cart and a
 * one-tap "add everything to cart" for shoppers who are ready to gift.
 */

(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', () => {
    const UI = window.VrindaCommerceUI;
    const Store = window.VrindaStore;

    if (!UI || !Store) {
      console.error('Wishlist page: commerce modules failed to load.');
      return;
    }

    window.VrindaAuth.whenReady((user) => {
      if (!user) {
        window.location.href = './login.html?redirect=' + encodeURIComponent('./wishlist.html');
        return;
      }
      render();
    });

    Store.onWishlistChange(() => {
      if (window.VrindaAuth.currentUser) render();
    });

    function render() {
      const items = Store.getWishlistItems();
      UI.hide('wishlistLoading');

      const grid = document.getElementById('wishlistGrid');
      const countRow = document.getElementById('wishlistCountRow');

      if (items.length === 0) {
        UI.hide(grid);
        UI.show('wishlistEmpty', 'block');
        if (countRow) countRow.style.display = 'none';
        UI.notice('wishlistNotice', '');
        return;
      }

      UI.hide('wishlistEmpty');
      UI.show(grid, 'grid');
      if (countRow) countRow.style.display = 'block';

      grid.innerHTML = items.map(cardHtml).join('');
      document.querySelectorAll('[data-wishlist-count]').forEach((el) => { el.textContent = items.length; });
    }

    function cardHtml(item) {
      const productUrl = '../product/?id=' + encodeURIComponent(item.productId) +
        '&slug=' + encodeURIComponent(item.slug || item.productId);
      const price = Number(item.price) || 0;
      const mrp = Number(item.originalPrice) || 0;

      return `
        <article class="wishlist-card" data-wishlist-id="${UI.escapeHtml(item.productId)}">
          <a class="wishlist-card-media" href="${productUrl}">
            <img src="${UI.escapeHtml(item.image)}" alt="${UI.escapeHtml(item.name)}" loading="lazy">
          </a>
          <div class="wishlist-card-body">
            <div class="cart-item-cat">${UI.escapeHtml(item.categoryName || 'Bespoke Gift')}</div>
            <a class="cart-item-title" href="${productUrl}">${UI.escapeHtml(item.name)}</a>
            <div class="cart-item-price">
              <strong>${UI.money(price)}</strong>
              ${mrp > price ? `<span class="cart-item-mrp">${UI.money(mrp)}</span>` : ''}
            </div>
          </div>
          <div class="wishlist-card-actions">
            <button type="button" class="btn btn-primary btn-sm js-move-to-cart"
                    data-product-id="${UI.escapeHtml(item.productId)}">Move to Cart</button>
            <button type="button" class="btn btn-secondary btn-sm js-wishlist-remove"
                    data-product-id="${UI.escapeHtml(item.productId)}">Remove</button>
          </div>
        </article>
      `;
    }

    document.addEventListener('click', async (event) => {
      const target = event.target;
      if (!target || typeof target.closest !== 'function') return;

      const removeBtn = target.closest('.js-wishlist-remove');
      if (removeBtn) {
        event.preventDefault();
        await Store.removeFromWishlist(removeBtn.getAttribute('data-product-id'));
        Store.toast('Removed from your wishlist.', 'info');
        render();
        return;
      }

      const allBtn = target.closest('#moveAllToCartBtn');
      if (allBtn) {
        event.preventDefault();
        const items = Store.getWishlistItems();
        if (items.length === 0) return;

        UI.setBusy(allBtn, true, 'Moving…');
        for (const item of items) {
          await Store.addToCart(item, 1);
          await Store.removeFromWishlist(item.productId);
        }
        UI.setBusy(allBtn, false, null, 'Move All to Cart');
        Store.toast('🛍️ ' + items.length + ' gift(s) moved to your cart.', 'success');
        render();
      }
    });
  });
})();
