/**
 * vrindahampers - Elevated-role admin panels
 *
 * Three panels for the new roles:
 *   - Bulk Product Maker  (Super Admin and above)
 *   - Customers           (Super Admin+ / ++) — edit a customer's details
 *   - Site Content        (Super Admin++ only) — every string, image and link
 *
 * Each panel hides itself for anyone below its role, so a Staff Admin never
 * sees a button that the database would refuse anyway.
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  function esc(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ==================================================== BULK PRODUCT MAKER ==== */

  const Maker = {
    parsed: { products: [], errors: [], total: 0 },

    parse: function () {
      const box = $('makerCsv');
      const M = window.VrindaProductMaker;
      if (!box || !M) return;

      const result = M.csvToProducts(box.value);
      this.parsed = result;

      const summary = $('makerSummary');
      if (summary) {
        summary.innerHTML = result.products.length
          ? '<strong style="color: var(--color-success);">✓ ' + result.products.length + ' product(s) ready</strong>' +
            (result.total > result.products.length
              ? ' <span style="color: var(--color-text-muted);">from ' + result.total + ' rows</span>' : '')
          : '<span style="color: var(--color-text-muted);">Nothing to import yet — paste some rows above.</span>';
      }

      const errBox = $('makerErrors');
      if (errBox) {
        if (result.errors.length) {
          errBox.style.display = 'block';
          errBox.innerHTML = '<div class="notice-bar" style="display:block; border-color: var(--color-error);">' +
            '<strong>' + result.errors.length + ' row(s) were skipped:</strong><ul style="margin: 0.5rem 0 0 1rem; font-size: 13px;">' +
            result.errors.slice(0, 12).map((e) =>
              '<li>Line ' + e.line + ' (' + esc(e.raw) + '): ' + esc(e.message) + '</li>').join('') +
            (result.errors.length > 12 ? '<li>…and ' + (result.errors.length - 12) + ' more</li>' : '') +
            '</ul></div>';
        } else {
          errBox.style.display = 'none';
          errBox.innerHTML = '';
        }
      }
      this.renderPreview();
    },

    renderPreview: function () {
      const wrap = $('makerPreviewWrap');
      const head = $('makerPreviewHead');
      const body = $('makerPreviewBody');
      const M = window.VrindaProductMaker;
      if (!wrap || !head || !body || !M) return;

      const rows = this.parsed.products;
      if (!rows.length) { wrap.style.display = 'none'; return; }

      wrap.style.display = 'block';
      const cols = M.COLUMNS;
      head.innerHTML = cols.map((c) => '<th>' + esc(c.header) + '</th>').join('');
      body.innerHTML = rows.map((p) => '<tr>' + cols.map((c) => {
        const v = p[c.field];
        return '<td>' + (c.type === 'bool' ? (v ? '✔' : '—') : esc(v === undefined ? '' : v)) + '</td>';
      }).join('') + '</tr>').join('');
    },

    /** Shared by both import buttons. */
    doImport: function (mode) {
      const M = window.VrindaProductMaker;
      if (!M) return;
      if (!this.parsed.products.length) {
        alert('There is nothing valid to import. Paste some rows and press Preview first.');
        return;
      }
      const n = this.parsed.products.length;
      if (mode === 'replace') {
        const ok = confirm(
          'REPLACE the catalog?\n\n' + n + ' product(s) will be written and EVERY existing product will be deleted.\n\n' +
          'This cannot be undone. Continue?'
        );
        if (!ok) return;
      } else if (!confirm('Import ' + n + ' product(s) into the website?\n\nExisting products are kept; matching ids are updated.')) {
        return;
      }

      M.importProducts(this.parsed.products, { mode: mode }).then((res) => {
        if (res.success) {
          alert('✔ Imported ' + res.imported + ' product(s) (' + res.mode + ').');
          if (typeof window.loadProducts === 'function') window.loadProducts();
        } else {
          alert('Import failed: ' + res.error);
        }
      });
    },

    init: function () {
      const M = window.VrindaProductMaker;
      if (!$('makerCsv') || !M) return;

      const box = $('makerCsv');
      // Debounced so a large paste does not re-render per keystroke.
      let timer = null;
      box.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => Maker.parse(), 250);
      });

      $('btnMakerTemplate')?.addEventListener('click', () => {
        M.downloadCsv(M.SAMPLE_ROW, 'product-template.csv');
      });

      $('btnMakerSample')?.addEventListener('click', () => {
        box.value = M.toCsv(M.SAMPLES);
        Maker.parse();
      });

      $('btnMakerClear')?.addEventListener('click', () => {
        box.value = '';
        Maker.parse();
      });

      $('makerFile')?.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => { box.value = String(reader.result || ''); Maker.parse(); };
        reader.onerror = () => alert('That file could not be read.');
        reader.readAsText(file);
      });

      $('btnMakerPreview')?.addEventListener('click', () => Maker.parse());
      $('btnMakerDownloadCsv')?.addEventListener('click', () => {
        if (!Maker.parsed.products.length) Maker.parse();
        if (Maker.parsed.products.length) M.downloadCsv(Maker.parsed.products);
        else alert('Nothing to download yet.');
      });
      $('btnMakerDownloadJson')?.addEventListener('click', () => {
        if (!Maker.parsed.products.length) Maker.parse();
        if (Maker.parsed.products.length) M.downloadJson(Maker.parsed.products);
        else alert('Nothing to download yet.');
      });
      $('btnMakerImport')?.addEventListener('click', () => Maker.doImport('merge'));
      $('btnMakerImportReplace')?.addEventListener('click', () => Maker.doImport('replace'));

      $('btnMakerWipe')?.addEventListener('click', () => {
        // A typed confirmation, not a single click: this empties the live shop.
        const typed = prompt('This deletes EVERY product from the live website.\n\nType DELETE to confirm:');
        if (typed !== 'DELETE') {
          if (typed !== null) alert('Cancelled — nothing was deleted.');
          return;
        }
        M.clearProducts().then((res) => {
          if (res.success) {
            alert('All products have been removed.');
            if (typeof window.loadProducts === 'function') window.loadProducts();
          } else {
            alert('Could not clear the catalog: ' + res.error);
          }
        });
      });
    }
  };

  window.VrindaMakerPanel = Maker;

  /* ================================================ CUSTOMERS (Super Admin+) ==== */

  const Customers = {
    users: null,

    init: function () {
      if (!$('customersTbody')) return;
      this.load();
    },

    load: function () {
      const tbody = $('customersTbody');
      const A = window.VrindaAdmin;
      if (!tbody || !A || !A.listenToUsers) return;

      this._off = A.listenToUsers((users) => {
        // Only real customers: ops roles are managed on the Staff & Roles tab.
        this.users = users.filter((u) => (u.role || 'customer') === 'customer');
        this.render();
      }, () => {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:2rem; color: var(--color-error);">' +
          'Could not load customers. Publish the database rules first:<br>firebase deploy --only database</td></tr>';
      });
    },

    render: function () {
      const tbody = $('customersTbody');
      if (!tbody || !this.users) return;
      const auth = window.VrindaAuth;
      const canEdit = !!(auth && auth.atLeast && auth.atLeast('manager'));
      const myUid = (auth && auth.currentUser && auth.currentUser.uid) || '';

      if (!this.users.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:2rem; color: var(--color-text-muted);">No customers yet.</td></tr>';
        return;
      }

      tbody.innerHTML = this.users.map((u) => {
        const joined = u.createdAt ? new Date(Number(u.createdAt)).toLocaleDateString('en-IN') : '—';
        return '<tr>' +
          '<td><strong>' + esc(u.name || 'Unnamed') + '</strong>' +
            '<div style="font-size:11px; color: var(--color-text-muted);">' + esc(u.uid) + '</div></td>' +
          '<td>' + esc(u.email || '—') + '</td>' +
          '<td>' + esc(u.phone || '—') + '</td>' +
          '<td>' + joined + '</td>' +
          '<td>' + (canEdit && u.uid !== myUid
            ? '<button class="btn btn-xs btn-outline js-edit-customer" data-uid="' + esc(u.uid) + '">Edit</button>'
            : '<span style="color: var(--color-text-muted); font-size:12px;">—</span>') + '</td>' +
          '</tr>';
      }).join('');

      tbody.querySelectorAll('.js-edit-customer').forEach((btn) => {
        btn.addEventListener('click', () => Customers.openEditor(btn.getAttribute('data-uid')));
      });
    },

    openEditor: function (uid) {
      const user = (this.users || []).find((u) => u.uid === uid);
      if (!user) return;
      const name = prompt('Name for ' + (user.email || uid) + ':', user.name || '');
      if (name === null) return;
      const phone = prompt('Phone / WhatsApp number:', user.phone || '');
      if (phone === null) return;

      window.VrindaAdmin.updateCustomer(uid, { name: name, phone: phone }).then((res) => {
        if (res.success) alert('Customer updated.');
        else alert('Could not update: ' + res.error);
      });
    }
  };

  /* ============================================= SITE CONTENT (Super Admin++) === */

  const SiteContent = {
    values: {},

    init: function () {
      if (!$('siteContentForm')) return;
      $('siteContentSave')?.addEventListener('click', () => this.save());
      $('siteContentReset')?.addEventListener('click', () => {
        if (!confirm('Clear every editable field on this tab?\n\nPages fall back to their built-in text until you set them again.')) return;
        this.build();
        this.save();
      });
      this.load();
    },

    load: async function () {
      const res = await window.VrindaSiteContent.load();
      if (!res.success) { this.summary('Could not load site content: ' + res.error); return; }
      this.values = res.values;
      this.build();
    },

    build: function () {
      const form = $('siteContentForm');
      const S = window.VrindaSiteContent;
      if (!form || !S) return;

      form.innerHTML = S.SCHEMA.map((group) => {
        const rows = group.items.map((item) => {
          // A stored override wins; otherwise show the shipped default, so the
          // owner sees the text that is actually live rather than a blank box.
          const stored = S.get(this.values, item.key, undefined);
          const value = stored === undefined ? (item.default || '') : stored;
          const overridden = stored !== undefined && String(stored) !== String(item.default || '');
          const id = 'sc-' + item.key.replace(/\./g, '-');
          const control = item.type === 'textarea'
            ? '<textarea id="' + id + '" class="form-input" rows="3" data-sc-key="' + esc(item.key) + '">' + esc(value) + '</textarea>'
            : item.type === 'bool'
              ? '<select id="' + id + '" class="form-select" data-sc-key="' + esc(item.key) + '">' +
                '<option value=""' + (value === '' ? ' selected' : '') + '>Default</option>' +
                '<option value="yes"' + (value === 'yes' ? ' selected' : '') + '>On</option>' +
                '<option value="no"' + (value === 'no' ? ' selected' : '') + '>Off</option></select>'
              : '<input type="' + (item.type === 'url' ? 'url' : 'text') + '" id="' + id +
                '" class="form-input" value="' + esc(value) + '" data-sc-key="' + esc(item.key) + '">';
          return '<div class="form-group" style="margin-bottom: 1rem;">' +
            '<label class="form-label" for="' + id + '">' + esc(item.label) +
              (overridden ? ' <span class="badge badge-new" style="font-size: 10px;">edited</span>' : '') +
            '</label>' + control +
            '<div style="font-size: 11px; color: var(--color-text-muted); margin-top: 3px;">' + esc(item.key) + '</div>' +
            '</div>';
        }).join('');

        return '<fieldset style="border: 1px solid var(--color-border-subtle); border-radius: var(--radius-lg); padding: 1.25rem; margin-bottom: 1.25rem;">' +
          '<legend style="font-size: 13px; font-weight: 700; padding: 0 0.5rem;">' + esc(group.group) + '</legend>' +
          rows + '</fieldset>';
      }).join('');

      this.summary('');
    },

    save: async function () {
      const patch = {};
      document.querySelectorAll('[data-sc-key]').forEach((el) => {
        patch[el.getAttribute('data-sc-key')] = el.value;
      });
      this.summary('Saving…');
      const res = await window.VrindaSiteContent.save(patch);
      if (res.success) {
        this.summary('✔ Saved ' + res.saved + ' field(s). The storefront picks these up on the next page load.', true);
      } else {
        this.summary('✖ ' + res.error, false, true);
      }
    },

    summary: function (text, ok, bad) {
      const el = $('siteContentSummary');
      if (!el) return;
      el.textContent = text;
      el.style.color = bad ? 'var(--color-error)' : (ok ? 'var(--color-success)' : 'var(--color-text-muted)');
      el.style.fontSize = '13px';
    }
  };

  window.VrindaSiteContentPanel = SiteContent;

  /* =============================================================== BOOTSTRAP ==== */

  document.addEventListener('DOMContentLoaded', function () {
    const auth = window.VrindaAuth;
    const start = function () {
      // Hide any panel the current role may not use, rather than showing a
      // button whose write the database would refuse anyway.
      const manager = !!(auth && auth.atLeast && auth.atLeast('manager'));
      const owner = !!(auth && auth.atLeast && auth.atLeast('owner'));
      document.querySelectorAll('[data-requires]').forEach((el) => {
        const need = el.getAttribute('data-requires');
        const allowed = need === 'owner' ? owner : (need === 'manager' ? manager : true);
        el.style.display = allowed ? '' : 'none';
      });

      Maker.init();
      if (manager) Customers.init();
      if (owner) SiteContent.init();
    };

    if (auth && typeof auth.whenReady === 'function') auth.whenReady(start);
    else start();
  });
})();
