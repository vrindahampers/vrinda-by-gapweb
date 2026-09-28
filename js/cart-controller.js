/**
 * vrindahampers - Cart Page Controller (Phase 4)
 * Real-time RTDB cart: quantity stepper, remove, clear, coupon apply/remove and
 * live totals. Every change is written to /cart/{uid} and echoes back through the
 * store's value listener, so the DOM can never drift from the database.
 */

(function () {
  'use strict';

  let couponInvalidMessage = '';

  document.addEventListener('DOMContentLoaded', () => {
    const UI = window.VrindaCommerceUI;
    const Store = window.VrindaStore;

    if (!UI || !Store) {
      console.error('Cart page: commerce modules failed to load.');
      return;
    }

    // The cart lives under /cart/{uid}, so it is owner-only by design.
    window.VrindaAuth.whenReady((user) => {
      if (!user) {
        window.location.href = './login.html?redirect=' + encodeURIComponent('./cart.html');
        return;
      }
      render();
    });

    Store.onCartChange(() => {
      if (window.VrindaAuth.currentUser) render();
    });

    /* ------------------------------------------------------------ rendering */

    async function render() {
      const items = Store.getCartItems();
      const totals = await Store.getTotals();

      UI.hide('cartLoading');

      if (items.length === 0) {
        UI.hide('cartLayout');
        UI.show('cartEmpty', 'block');
        renderCouponState(totals);
        renderAvailableCoupons();
        return;
      }

      UI.hide('cartEmpty');
      UI.show('cartLayout', 'grid');

      const grid = document.getElementById('cartItems');
      if (grid) grid.innerHTML = items.map((item) => UI.cartLineHtml(item)).join('');

      UI.renderSummary('summaryRows', totals);
      renderCouponState(totals);
      renderAvailableCoupons();
      document.querySelectorAll('[data-cart-count]').forEach((el) => { el.textContent = totals.itemCount; });
    }

    /* ------------------------------------------------ quantity / removal */

    function findQty(productId) {
      const line = (Store.cart.items || {})[productId];
      return line ? (parseInt(line.qty, 10) || 1) : 1;
    }

    document.addEventListener('click', async (event) => {
      const target = event.target;
      if (!target || typeof target.closest !== 'function') return;

      const upBtn = target.closest('.js-qty-up');
      if (upBtn) {
        const id = upBtn.getAttribute('data-product-id');
        await Store.updateQty(id, Math.min(findQty(id) + 1, 25));
        return;
      }

      const downBtn = target.closest('.js-qty-down');
      if (downBtn) {
        const id = downBtn.getAttribute('data-product-id');
        const current = findQty(id);
        if (current <= 1) {
          await Store.removeFromCart(id);
        } else {
          await Store.updateQty(id, current - 1);
        }
        return;
      }

      const removeBtn = target.closest('.js-remove-item');
      if (removeBtn) {
        await Store.removeFromCart(removeBtn.getAttribute('data-product-id'));
        return;
      }

      if (target.closest('#clearCartBtn')) {
        if (!window.confirm('Remove every gift from your cart?')) return;
        await Store.removeCoupon();
        await Store.clearCart();
        render();
      }
    });

    document.addEventListener('change', async (event) => {
      const input = event.target;
      if (!input || !input.classList || !input.classList.contains('js-qty-input')) return;

      const id = input.getAttribute('data-product-id');
      const value = parseInt(input.value, 10);
      if (isNaN(value) || value < 1) {
        await Store.removeFromCart(id);
        return;
      }
      await Store.updateQty(id, Math.min(value, 25));
    });

    /* -------------------------------------------------------------- coupons */

    async function applyCouponFromInput() {
      const input = document.getElementById('couponInput');
      const messageEl = document.getElementById('couponMessage');
      const button = document.getElementById('applyCouponBtn');
      const code = ((input && input.value) || '').trim().toUpperCase();

      if (!code) {
        UI.notice(messageEl, 'Please enter a coupon code.', 'warning');
        return;
      }

      UI.setBusy(button, true, 'Checking…');
      const result = await Store.applyCoupon(code);
      UI.setBusy(button, false, null, 'Apply');

      if (!result.valid) {
        couponInvalidMessage = result.message;
        UI.notice(messageEl, result.message, 'error');
        return;
      }

      couponInvalidMessage = '';
      UI.notice(messageEl, result.message, 'success');
      if (input) input.value = '';
      render();
    }

    function renderCouponState(totals) {
      const messageEl = document.getElementById('couponMessage');
      const appliedRow = document.getElementById('appliedCouponRow');
      const appliedLabel = document.getElementById('appliedCouponLabel');

      if (totals.couponCode) {
        if (appliedRow) appliedRow.style.display = 'flex';
        if (appliedLabel) {
          const label = totals.couponName ? ' · ' + totals.couponName : '';
          appliedLabel.innerHTML = '<strong>' + UI.escapeHtml(totals.couponCode) + '</strong>' +
            UI.escapeHtml(label) + ' — saving ' + UI.money(totals.discount) + '.';
        }
        UI.notice(messageEl, '');
        return;
      }

      if (appliedRow) appliedRow.style.display = 'none';
      if (totals.couponRejected) {
        UI.notice(messageEl, totals.couponMessage, 'warning');
      } else if (!couponInvalidMessage) {
        UI.notice(messageEl, '');
      }
    }

    function renderAvailableCoupons() {
      const host = document.getElementById('availableCoupons');
      if (!host) return;

      // Cart-page offer chips always come from the live /coupons node. They
      // used to render from the bundled samples, so an admin who deleted a
      // code would still see customers applying it from the cart page.
      const db = (window.VrindaStore && window.VrindaStore._db)
        ? window.VrindaStore._db()
        : null;
      const paint = (coupons) => {
        const list = Array.isArray(coupons) ? coupons : [];
        host.innerHTML = list
          .filter((c) => c && c.active !== false)
          .map((c) => `
            <button type="button" class="offer-chip js-use-coupon" data-code="${UI.escapeHtml(c.code)}"
                    title="${UI.escapeHtml(c.description || '')}">
              <strong>${UI.escapeHtml(c.code)}</strong>
              <span>${UI.escapeHtml(c.label || c.description || '')}</span>
            </button>
          `).join('');
      };
      if (!db) { paint([]); return; }
      db.ref('coupons').once('value').then((snap) => {
        if (!snap.exists()) { paint([]); return; }
        const val = snap.val() || {};
        paint(Object.keys(val).map((k) => Object.assign({ code: k }, val[k])));
      }).catch(() => paint([]));
    }

    document.addEventListener('click', (event) => {
      const chip = event.target && event.target.closest && event.target.closest('.js-use-coupon');
      if (!chip) return;
      const input = document.getElementById('couponInput');
      if (input) input.value = chip.getAttribute('data-code');
      applyCouponFromInput();
    });

    document.getElementById('applyCouponBtn')?.addEventListener('click', applyCouponFromInput);

    document.getElementById('couponInput')?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        applyCouponFromInput();
      }
    });

    document.getElementById('removeCouponBtn')?.addEventListener('click', async () => {
      await Store.removeCoupon();
      couponInvalidMessage = '';
      const messageEl = document.getElementById('couponMessage');
      UI.notice(messageEl, 'Coupon removed.', 'info');
      render();
    });
  });
})();
