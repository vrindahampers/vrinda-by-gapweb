/**
 * vrindahampers - Bulk Product Maker
 *
 * Turns a spreadsheet (pasted from Excel/Google Sheets, or a .csv file) into
 * validated product rows and writes them to /products in one batch. The admin
 * can export the same rows as a .json or .csv file to keep on disk.
 *
 * Every field is normalised here rather than at the write, so a price typed as
 * "₹1,899" or a Y/N flag becomes the exact shape catalog-service and the
 * storefront expect.
 */
(function () {
  'use strict';

  // Column order for the CSV template and for the pasted spreadsheet.
  // Short header names keep a pasted sheet readable; each maps to a product field.
  const COLUMNS = [
    { header: 'id', field: 'id' },
    { header: 'name', field: 'name' },
    { header: 'category', field: 'category' },
    { header: 'categoryName', field: 'categoryName' },
    { header: 'price', field: 'price', type: 'money' },
    { header: 'originalPrice', field: 'originalPrice', type: 'money' },
    { header: 'description', field: 'description' },
    { header: 'image', field: 'image' },
    { header: 'badge', field: 'badge' },
    { header: 'stock', field: 'stock', type: 'number' },
    { header: 'rating', field: 'rating', type: 'number' },
    { header: 'reviewCount', field: 'reviewCount', type: 'number' },
    { header: 'isBestSeller', field: 'isBestSeller', type: 'bool' },
    { header: 'isTrending', field: 'isTrending', type: 'bool' },
    { header: 'isNew', field: 'isNew', type: 'bool' },
    { header: 'isPersonalized', field: 'isPersonalized', type: 'bool' },
    { header: 'active', field: 'active', type: 'bool' }
  ];

  const Maker = {
    COLUMNS: COLUMNS,

    /** One blank row, used to generate the downloadable template. */
    SAMPLE_ROW: {
      id: '', name: '', category: '', categoryName: '', price: '', originalPrice: '',
      description: '', image: '', badge: '', stock: '', isBestSeller: '', isTrending: '',
      isNew: '', isPersonalized: '', active: 'Y'
    },

    /** Two worked examples, so the admin can see the expected format. */
    SAMPLES: [
      { name: 'Velvet Midnight Rose Bouquet', category: 'bouquets', categoryName: 'Handcrafted Bouquets', price: '₹1,899', originalPrice: '₹2,499', description: 'Deep red velvet everlasting roses wrapped in gold crepe paper.', badge: 'Best Seller', isBestSeller: 'Y', isTrending: 'Y', isPersonalized: 'Y', stock: '12', active: 'Y' },
      { name: 'The Royal Romance Luxury Hamper', category: 'hampers', categoryName: 'Luxury Hampers', price: '₹3,499', originalPrice: '₹4,299', description: 'Magnetic trunk box with candle, music frame and chocolates.', badge: 'Signature', isBestSeller: 'Y', isPersonalized: 'Y', stock: '8', active: 'Y' }
    ],

    /** "1,899" / "₹1899" / "1899.00" -> 1899 */
    toMoney: function (value) {
      if (typeof value === 'number') return Math.round(value);
      const cleaned = String(value === undefined || value === null ? '' : value)
        .replace(/[^0-9.]/g, '');   // strips currency symbols and separators
      if (!cleaned) return 0;
      const n = Math.round(parseFloat(cleaned));
      return isNaN(n) ? 0 : n;
    },

    toBool: function (value, fallback) {
      const s = String(value === undefined || value === null ? '' : value).trim().toLowerCase();
      if (!s) return fallback;
      return s === 'y' || s === 'yes' || s === 'true' || s === '1';
    },

    toNumber: function (value) {
      const n = parseFloat(value);
      return isNaN(n) ? 0 : n;
    },

    slugify: function (value) {
      return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
    },

    /**
     * Parse CSV text into rows of raw strings.
     * Handles quoted fields, escaped quotes (""), commas and newlines inside
     * quotes, and both LF and CRLF line endings — all of which a spreadsheet
     * paste produces and a naive split(',') would corrupt.
     */
    parseCsv: function (text) {
      const rows = [];
      let row = [];
      let field = '';
      let inQuotes = false;
      const src = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

      for (let i = 0; i < src.length; i++) {
        const ch = src[i];
        if (inQuotes) {
          if (ch === '"') {
            if (src[i + 1] === '"') { field += '"'; i++; }   // escaped quote
            else inQuotes = false;
          } else field += ch;
          continue;
        }
        if (ch === '"') { inQuotes = true; continue; }
        if (ch === ',') { row.push(field); field = ''; continue; }
        if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
        field += ch;
      }
      // Flush the last cell/row when the file has no trailing newline.
      if (field !== '' || row.length) { row.push(field); rows.push(row); }
      return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
    },

    /**
     * Turn raw CSV rows into product records, collecting per-row errors instead
     * of throwing, so one bad row does not lose the other forty.
     * @returns {{products: Array, errors: Array, total: number}}
     */
    rowsToProducts: function (rows) {
      const products = [];
      const errors = [];
      if (!rows || !rows.length) return { products: products, errors: errors, total: 0 };

      const header = rows[0].map((h) => String(h).trim());
      // Map the sheet's header text to a known column, tolerating case and spaces.
      const index = {};
      header.forEach((h, i) => {
        const norm = h.toLowerCase().replace(/[^a-z0-9]/g, '');
        const col = COLUMNS.find((c) => c.header.toLowerCase() === norm);
        if (col) index[col.field] = i;
      });

      // No recognisable header at all: fall back to the template column order so
      // a hand-typed sheet still imports.
      const usePositional = Object.keys(index).length === 0;
      const at = (cells, field, colIndex) => {
        const i = usePositional ? colIndex : index[field];
        return i === undefined ? '' : (cells[i] === undefined ? '' : String(cells[i]).trim());
      };

      const seen = {};
      rows.slice(1).forEach((cells, idx) => {
        const lineNo = idx + 2;   // 1-based, and the header is line 1
        const product = {};

        COLUMNS.forEach((col, colIndex) => {
          const raw = at(cells, col.field, colIndex);
          if (raw === '') return;   // leave the field off so defaults apply

          switch (col.type) {
            case 'money': product[col.field] = Maker.toMoney(raw); break;
            case 'number': product[col.field] = Maker.toNumber(raw); break;
            case 'bool':
              // `active` defaults to true so a blank means "show on the site".
              product[col.field] = Maker.toBool(raw, col.field === 'active');
              break;
            default: product[col.field] = raw;
          }
        });

        // ---- validation -------------------------------------------------
        const rowErrors = [];
        if (!product.name) rowErrors.push('name is required');
        if (!product.category) rowErrors.push('category is required');
        if (!product.price || product.price <= 0) rowErrors.push('price must be greater than 0');

        if (rowErrors.length) {
          errors.push({ line: lineNo, message: rowErrors.join('; '), raw: product.name || '(no name)' });
          return;
        }

        // ---- identity ----------------------------------------------------
        if (!product.id) {
          // Deterministic from the name, so re-importing the same sheet
          // updates rows instead of creating a second copy of every product.
          product.id = 'prod-' + Maker.slugify(product.name).slice(0, 40);
        }
        if (seen[product.id]) {
          errors.push({ line: lineNo, message: 'duplicate id "' + product.id + '" in this file', raw: product.name });
          return;
        }
        seen[product.id] = true;

        if (!product.slug) product.slug = Maker.slugify(product.name);
        // A missing or lower "was" price would render as a fake discount, so
        // fall back to the selling price.
        if (!product.originalPrice || product.originalPrice < product.price) {
          product.originalPrice = product.price;
        }
        if (product.active === undefined) product.active = true;
        if (product.rating === undefined) product.rating = 0;
        if (product.reviewCount === undefined) product.reviewCount = 0;

        products.push(product);
      });

      return { products: products, errors: errors, total: rows.length - 1 };
    },

    /** Convenience: CSV text straight to products. */
    csvToProducts: function (text) {
      return Maker.rowsToProducts(Maker.parseCsv(text));
    },

    /**
     * Write products to Firebase.
     *
     * `mode: 'merge'` (default) only writes the supplied rows, so an import
     * never deletes products that are already live. `mode: 'replace'` clears
     * the node first — that is the "remove every product and start again"
     * path, and it is deliberately an explicit choice rather than a default.
     */
    importProducts: async function (products, options) {
      const opts = options || {};
      if (typeof firebase === 'undefined' || !firebase.database) {
        return { success: false, error: 'Database unavailable' };
      }
      if (!products || !products.length) {
        return { success: false, error: 'There are no valid products to import' };
      }

      const auth = window.VrindaAuth;
      if (!auth || !auth.currentUser || !auth.atLeast || !auth.atLeast('superadmin')) {
        return { success: false, error: 'Only Super Admin and above can import products' };
      }

      const db = firebase.database();
      const stamp = firebase.database.ServerValue.TIMESTAMP;

      try {
        // One write for the whole batch: RTDB charges per operation, and 50
        // separate .set() calls would be 50 writes instead of one.
        const updates = {};
        if (opts.mode === 'replace') {
          // A null at the node root clears it, then the new rows land.
          updates['products'] = null;
        }
        products.forEach((p) => {
          updates['products/' + encodeURIComponent(p.id)] = Object.assign({}, p, {
            updatedAt: stamp,
            createdAt: p.createdAt || stamp
          });
        });

        await db.ref().update(updates);
        if (window.VrindaCatalog) window.VrindaCatalog.productsCache = null;
        return { success: true, imported: products.length, mode: opts.mode || 'merge' };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    /**
     * Empty the whole catalog. Used by the "remove every product" action; the
     * caller is responsible for confirming with the admin first, because this
     * cannot be undone from the UI.
     */
    clearProducts: async function () {
      const auth = window.VrindaAuth;
      if (!auth || !auth.currentUser || !auth.atLeast || !auth.atLeast('superadmin')) {
        return { success: false, error: 'Only Super Admin and above can clear the catalog' };
      }
      if (typeof firebase === 'undefined' || !firebase.database) {
        return { success: false, error: 'Database unavailable' };
      }
      try {
        await firebase.database().ref('products').remove();
        if (window.VrindaCatalog) window.VrindaCatalog.productsCache = null;
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    /** Serialise products to CSV (same column order as the import template). */
    toCsv: function (products) {
      const cell = (v) => {
        const s = v === undefined || v === null ? '' : String(v);
        return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      };
      const lines = [COLUMNS.map((c) => c.header).join(',')];
      (products || []).forEach((p) => {
        lines.push(COLUMNS.map((c) => cell(p[c.field])).join(','));
      });
      return lines.join('\n');
    },

    /** Serialise products to the JSON shape /products is stored in. */
    toJson: function (products) {
      const map = {};
      (products || []).forEach((p) => { map[p.id] = p; });
      return JSON.stringify(map, null, 2);
    },

    /** Trigger a browser file download. */
    download: function (text, filename, mime) {
      const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 0);
    },

    downloadCsv: function (products, filename) {
      Maker.download(Maker.toCsv(products), filename || 'products.csv', 'text/csv;charset=utf-8;');
    },

    downloadJson: function (products, filename) {
      Maker.download(Maker.toJson(products), filename || 'products.json', 'application/json');
    },

    /** The blank template the admin can fill in and paste back. */
    templateCsv: function () {
      return Maker.toCsv([Maker.SAMPLE_ROW]);
    }
  };

  window.VrindaProductMaker = Maker;
})();