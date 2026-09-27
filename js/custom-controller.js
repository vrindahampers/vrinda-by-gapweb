/**
 * vrindahampers - Custom Gift Configurator Controller
 * Interactive builder for bouquets, hampers, keychains, polaroids, and letters.
 * Live price estimation, WhatsApp handoff, and RTDB design submission.
 */

(function () {
  'use strict';

  const WHATSAPP_NUMBER = '919876543210';

  const CONFIGS = {
    bouquet: {
      label: 'Bouquet',
      headline: 'Bouquet',
      description: 'Everlasting velvet or crochet blooms wrapped in premium Korean crepe paper with fairy glow.',
      image: 'https://images.unsplash.com/photo-1561181286-d3fee7d55364?auto=format&fit=crop&w=700&q=80',
      basePrice: 1499,
      bases: [
        { id: 'velvet-rose', label: 'Velvet Eternal Roses', price: 1899 },
        { id: 'crochet-mix', label: 'Crochet Pastel Mix', price: 1599 },
        { id: 'bell-jar', label: 'Bell Jar Butterfly Dome', price: 2099 },
        { id: 'sunflower', label: 'Sunflower Sunshine Bunch', price: 1399 }
      ],
      palettes: ['Crimson Red', 'Blush Pink', 'Ivory White', 'Lavender Lilac', 'Sunshine Yellow', 'Midnight Blue'],
      addons: [
        { id: 'fairy-lights', label: 'Warm fairy lights ✨', price: 149 },
        { id: 'wax-letter', label: 'Wax-sealed handwritten letter 📜', price: 349 },
        { id: 'polaroid-prints', label: '3 personalized polaroid prints 📸', price: 299 },
        { id: 'chocolate-box', label: 'Assorted chocolate box 🍫', price: 399 }
      ]
    },
    hamper: {
      label: 'Luxury Hamper',
      headline: 'Luxury Hamper',
      description: 'A magnetic trunk box curated with gourmet treats, keepsakes, and scented candles.',
      image: 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&w=700&q=80',
      basePrice: 2499,
      bases: [
        { id: 'royal-trunk', label: 'Royal Magnetic Trunk', price: 3499 },
        { id: 'coffee-evening', label: 'Cosy Coffee Evening', price: 2799 },
        { id: 'spa-calm', label: 'Spa & Calm Ritual', price: 2999 },
        { id: 'snack-sweet', label: 'Sweet & Snack Fiesta', price: 2299 }
      ],
      palettes: ['Blush Pink', 'Midnight Blue', 'Ivory White', 'Emerald Green', 'Blush & Gold'],
      addons: [
        { id: 'music-plaque', label: 'Spotify acrylic music plaque 🎵', price: 599 },
        { id: 'wax-letter', label: 'Wax-sealed handwritten letter 📜', price: 349 },
        { id: 'polaroid-prints', label: '5 polaroid prints 📸', price: 449 },
        { id: 'name-engraving', label: 'Custom name engraving ✍️', price: 249 }
      ]
    },
    keychain: {
      label: 'Custom Keychain',
      headline: 'Custom Keychain',
      description: 'Acrylic and resin charms engraved with your songs, initials, and photos.',
      image: 'https://images.unsplash.com/photo-1614036417651-efe5912149d8?auto=format&fit=crop&w=700&q=80',
      basePrice: 399,
      bases: [
        { id: 'spotify-code', label: 'Scannable Spotify Code', price: 399 },
        { id: 'photo-initial', label: 'Photo + Initials Charm', price: 449 },
        { id: 'couple-set', label: 'Couple Matching Set (2 pcs)', price: 699 },
        { id: 'mini-frame', label: 'Mini Photo Frame Acrylic', price: 499 }
      ],
      palettes: ['Clear Gloss', 'Frosted Matte', 'Blush Pink', 'Midnight Black', 'Gold Mirror'],
      addons: [
        { id: 'gift-tin', label: 'Velvet gift tin packaging 🎁', price: 149 },
        { id: 'name-engraving', label: 'Back-side text engraving ✍️', price: 99 }
      ]
    },
    polaroids: {
      label: 'Retro Polaroids',
      headline: 'Retro Polaroids',
      description: 'High-gloss retro prints in a customized vintage tin or glowing glass frame.',
      image: 'https://images.unsplash.com/photo-1526047932273-341f2a7631f9?auto=format&fit=crop&w=700&q=80',
      basePrice: 549,
      bases: [
        { id: 'tin-16', label: 'Mini Tin Set (16 Prints)', price: 549 },
        { id: 'tin-32', label: 'Mega Tin Set (32 Prints)', price: 999 },
        { id: 'glass-frame', label: 'Illuminated Glass Frame', price: 1299 },
        { id: 'photo-strip', label: 'Photo Booth Strip Set', price: 649 }
      ],
      palettes: ['Glossy Original', 'Vintage Sepia', 'Soft Pastel', 'Black & White', 'Warm Film'],
      addons: [
        { id: 'fairy-lights', label: 'Fairy light string ✨', price: 149 },
        { id: 'wax-letter', label: 'Wax-sealed handwritten letter 📜', price: 349 },
        { id: 'photo-clips', label: 'Wooden photo clips set 📎', price: 199 }
      ]
    },
    letter: {
      label: 'Handwritten Letter',
      headline: 'Handwritten Letter',
      description: 'Burnt-edge parchment calligraphy, tied in twine, and sealed with wax.',
      image: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format&fit=crop&w=700&q=80',
      basePrice: 699,
      bases: [
        { id: 'parchment-scroll', label: 'Burnt-Edge Parchment Scroll', price: 699 },
        { id: 'royal-set', label: 'Royal Bundle (Letter + Rose)', price: 1199 },
        { id: 'vintage-diary', label: 'Vintage Mini Diary Notes', price: 899 },
        { id: 'anniversary-9', label: 'Anniversary 9-Letter Box', price: 1799 }
      ],
      palettes: ['Classic Charcoal Ink', 'Royal Blue Ink', 'Crimson Wax Seal', 'Gold Wax Seal', 'Emerald Wax Seal'],
      addons: [
        { id: 'polaroid-prints', label: '3 polaroid prints inside 📸', price: 299 },
        { id: 'dried-flowers', label: 'Pressed dried flowers 🌸', price: 199 },
        { id: 'perfume-mist', label: 'Signature perfume mist 🌷', price: 149 }
      ]
    }
  };

  let currentType = 'bouquet';
  let selection = { base: null, palette: null, addons: [] };
  let submitting = false;

  document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const typeParam = (urlParams.get('type') || '').toLowerCase();
    currentType = CONFIGS[typeParam] ? typeParam : 'bouquet';

    renderTypeChips();
    loadType(currentType);
    setupListeners();
  });

  function renderTypeChips() {
    const container = document.getElementById('cfTypeChips');
    if (!container) return;

    container.innerHTML = Object.keys(CONFIGS).map(key => `
      <button type="button" class="option-chip ${key === currentType ? 'active' : ''}" data-type="${key}">
        ${CONFIGS[key].label}
      </button>
    `).join('');

    container.querySelectorAll('[data-type]').forEach(btn => {
      btn.addEventListener('click', () => {
        currentType = btn.getAttribute('data-type');
        const url = new URL(window.location.href);
        url.searchParams.set('type', currentType);
        window.history.replaceState({}, '', url);
        renderTypeChips();
        loadType(currentType);
      });
    });
  }

  function loadType(type) {
    const cfg = CONFIGS[type];
    if (!cfg) return;

    selection = {
      base: cfg.bases[0].id,
      palette: cfg.palettes[0],
      addons: []
    };

    const headline = document.getElementById('cfTypeHeadline');
    const desc = document.getElementById('cfTypeDescription');
    if (headline) headline.textContent = cfg.headline;
    if (desc) desc.textContent = cfg.description;
    document.title = `Design Your Own ${cfg.label} — vrindahampers`;

    renderBaseOptions();
    renderPaletteOptions();
    renderAddons();
    updateSummary();
  }

  function renderBaseOptions() {
    const container = document.getElementById('cfBaseOptions');
    if (!container) return;

    container.innerHTML = CONFIGS[currentType].bases.map(base => `
      <button type="button" class="option-chip ${base.id === selection.base ? 'active' : ''}" data-base="${base.id}">
        ${base.label} · ₹${base.price.toLocaleString('en-IN')}
      </button>
    `).join('');

    container.querySelectorAll('[data-base]').forEach(btn => {
      btn.addEventListener('click', () => {
        selection.base = btn.getAttribute('data-base');
        renderBaseOptions();
        updateSummary();
      });
    });
  }

  function renderPaletteOptions() {
    const container = document.getElementById('cfPaletteOptions');
    if (!container) return;

    container.innerHTML = CONFIGS[currentType].palettes.map(palette => `
      <button type="button" class="option-chip ${palette === selection.palette ? 'active' : ''}" data-palette="${palette}">
        ${palette}
      </button>
    `).join('');

    container.querySelectorAll('[data-palette]').forEach(btn => {
      btn.addEventListener('click', () => {
        selection.palette = btn.getAttribute('data-palette');
        renderPaletteOptions();
        updateSummary();
      });
    });
  }

  function renderAddons() {
    const container = document.getElementById('cfAddonList');
    if (!container) return;

    container.innerHTML = CONFIGS[currentType].addons.map(addon => `
      <label class="addon-row" for="addon-${addon.id}">
        <span style="display: flex; align-items: center; gap: 10px;">
          <input type="checkbox" id="addon-${addon.id}" data-addon="${addon.id}" ${selection.addons.includes(addon.id) ? 'checked' : ''}>
          <span style="font-size: var(--font-size-xs); color: var(--color-text-body); font-weight: 600;">${addon.label}</span>
        </span>
        <strong style="font-size: var(--font-size-xs); color: var(--color-primary-dark);">+₹${addon.price.toLocaleString('en-IN')}</strong>
      </label>
    `).join('');

    container.querySelectorAll('[data-addon]').forEach(box => {
      box.addEventListener('change', () => {
        const addonId = box.getAttribute('data-addon');
        if (box.checked) {
          if (!selection.addons.includes(addonId)) selection.addons.push(addonId);
        } else {
          selection.addons = selection.addons.filter(id => id !== addonId);
        }
        updateSummary();
      });
    });
  }


  function getBaseOption() {
    const cfg = CONFIGS[currentType];
    return cfg.bases.find(b => b.id === selection.base) || cfg.bases[0];
  }

  function getSelectedAddons() {
    const cfg = CONFIGS[currentType];
    return cfg.addons.filter(a => selection.addons.includes(a.id));
  }

  function calculateTotal() {
    const base = getBaseOption();
    const addonTotal = getSelectedAddons().reduce((sum, a) => sum + a.price, 0);
    return base.price + addonTotal;
  }

  function buildSummaryData() {
    const cfg = CONFIGS[currentType];
    const base = getBaseOption();
    const addons = getSelectedAddons();

    return {
      type: currentType,
      typeLabel: cfg.label,
      occasion: document.getElementById('cfOccasion')?.value || 'Birthday',
      recipient: document.getElementById('cfRecipient')?.value.trim() || '',
      base: base.id,
      baseLabel: base.label,
      palette: selection.palette,
      addons: addons.map(a => a.label),
      note: document.getElementById('cfNote')?.value.trim() || '',
      estimatedTotal: calculateTotal()
    };
  }

  function updateSummary() {
    const data = buildSummaryData();
    const linesEl = document.getElementById('cfSummaryLines');
    const totalEl = document.getElementById('cfTotalPrice');
    const waBtn = document.getElementById('cfWhatsAppBtn');

    if (linesEl) {
      linesEl.innerHTML = `
        <div class="summary-line"><span>Gift Type</span><strong>${data.typeLabel}</strong></div>
        <div class="summary-line"><span>Occasion</span><strong>${data.occasion}</strong></div>
        ${data.recipient ? `<div class="summary-line"><span>Personalized For</span><strong>${data.recipient}</strong></div>` : ''}
        <div class="summary-line"><span>Base Design</span><strong>${data.baseLabel}</strong></div>
        <div class="summary-line"><span>Palette</span><strong>${data.palette}</strong></div>
        <div class="summary-line"><span>Add-Ons</span><strong>${data.addons.length ? data.addons.length + ' selected' : 'None'}</strong></div>
      `;
    }

    if (totalEl) totalEl.textContent = `₹${data.estimatedTotal.toLocaleString('en-IN')}`;

    if (waBtn) {
      waBtn.href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(buildWhatsAppMessage(data))}`;
    }
  }

  /**
   * Shared WhatsApp handoff message — used by the sticky "Confirm on WhatsApp"
   * button and by the post-submission confirmation panel.
   */
  function buildWhatsAppMessage(data) {
    return [
      `Hi vrindahampers! I built a custom ${data.typeLabel} on your Custom Studio:`,
      `• Occasion: ${data.occasion}`,
      data.recipient ? `• Personalized for: ${data.recipient}` : null,
      `• Base design: ${data.baseLabel}`,
      `• Palette: ${data.palette}`,
      `• Add-ons: ${data.addons.length ? data.addons.join(', ') : 'None'}`,
      data.note ? `• Note: "${data.note}"` : null,
      `• Estimated total: ₹${data.estimatedTotal.toLocaleString('en-IN')}`,
      '',
      'Please share the mockup and confirm my quote.'
    ].filter(Boolean).join('\n');
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, (ch) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
    ));
  }

  function setupListeners() {
    ['cfOccasion', 'cfRecipient', 'cfNote'].forEach(id => {
      const el = document.getElementById(id);
      const evt = el && el.tagName === 'SELECT' ? 'change' : 'input';
      el?.addEventListener(evt, updateSummary);
    });

    document.getElementById('cfSubmitBtn')?.addEventListener('click', submitDesign);
    document.getElementById('cfSuccessRestartBtn')?.addEventListener('click', () => {
      window.location.reload();
    });
    updateSummary();
  }

  /**
   * Replaces the builder with a confirmation card once the design is safely
   * stored — no browser alert, no filled form left behind, no double-submit.
   */
  function showSuccessPanel(data) {
    const builder = document.getElementById('cfBuilderGrid');
    const desc = document.getElementById('cfTypeDescription');
    const chips = document.getElementById('cfTypeChips');
    const panel = document.getElementById('cfSuccessPanel');
    const recap = document.getElementById('cfSuccessRecap');
    const waBtn = document.getElementById('cfSuccessWhatsAppBtn');

    if (builder) builder.style.display = 'none';
    if (desc) desc.style.display = 'none';
    if (chips) chips.style.display = 'none';

    if (recap) {
      recap.innerHTML = `
        <div class="summary-line"><span>Gift Type</span><strong>${escapeHtml(data.typeLabel)}</strong></div>
        <div class="summary-line"><span>Occasion</span><strong>${escapeHtml(data.occasion)}</strong></div>
        ${data.recipient ? `<div class="summary-line"><span>Personalized For</span><strong>${escapeHtml(data.recipient)}</strong></div>` : ''}
        <div class="summary-line"><span>Base Design</span><strong>${escapeHtml(data.baseLabel)}</strong></div>
        <div class="summary-line"><span>Palette</span><strong>${escapeHtml(data.palette)}</strong></div>
        <div class="summary-line"><span>Add-Ons</span><strong>${escapeHtml(data.addons.length ? data.addons.join(', ') : 'None')}</strong></div>
        <div class="summary-line" style="border-bottom: 0; padding-top: 10px;">
          <span style="font-weight: 600; color: var(--color-text-muted);">Estimated Total</span>
          <strong style="font-size: 1.15rem; color: var(--color-primary);">₹${data.estimatedTotal.toLocaleString('en-IN')}</strong>
        </div>
      `;
    }

    if (waBtn) {
      waBtn.href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(buildWhatsAppMessage(data))}`;
    }

    if (panel) {
      panel.style.display = 'block';
      if (typeof panel.scrollIntoView === 'function') {
        panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }

  async function submitDesign() {
    if (submitting) return;
    const data = buildSummaryData();

    if (window.VrindaAuth) {
      const gate = window.VrindaAuth.canPerformGatedAction('customization');
      if (!gate.allowed) {
        alert(`vrindahampers Notice:\n\n${gate.message}`);
        if (gate.reason === 'unauthenticated') {
          window.location.href = `../pages/login.html?redirect=${encodeURIComponent(window.location.href)}`;
        } else if (gate.reason === 'unverified_email') {
          window.location.href = '../pages/profile.html';
        }
        return;
      }
    }

    if (typeof firebase === 'undefined' || !firebase.database || !window.VrindaAuth?.currentUser) {
      alert('vrindahampers Notice:\n\nPlease tap "Confirm on WhatsApp" so our concierge can take your design forward instantly.');
      return;
    }

    const submitBtn = document.getElementById('cfSubmitBtn');
    const errorBox = document.getElementById('cfSubmitError');
    submitting = true;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending your design…';
    }
    if (errorBox) {
      errorBox.style.display = 'none';
      errorBox.textContent = '';
    }

    try {
      const uid = window.VrindaAuth.currentUser.uid;
      await firebase.database().ref('customRequests/' + uid).push({
        ...data,
        status: 'pending-review',
        createdAt: firebase.database.ServerValue.TIMESTAMP
      });
      showSuccessPanel(data);
    } catch (err) {
      const message = `We could not save your design (${err.message}). Please try again, or tap "Confirm on WhatsApp" to send it straight to our concierge.`;
      if (errorBox) {
        errorBox.textContent = message;
        errorBox.style.display = 'block';
      } else {
        alert(`vrindahampers Notice:\n\n${message}`);
      }
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit My Design';
      }
    } finally {
      submitting = false;
    }
  }
})();

