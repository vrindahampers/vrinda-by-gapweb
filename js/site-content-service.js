/**
 * vrindahampers - Site Content Service (Super Admin++ only)
 *
 * Reads and writes /siteContent, the node that holds every editable string,
 * image URL, button label and link target on the storefront, keyed by a dotted
 * path such as "home.hero.title".
 *
 * Reads are public (pages need them to render); writes are gated to the `owner`
 * role by database.rules.json, so this service is a convenience, not the guard.
 */
(function () {
  'use strict';

  const ContentService = {
    /**
     * The editable fields, grouped for the editor UI.
     *
     * `default` is the value that is ALREADY on the live site. The editor
     * pre-fills each control with it, so the form shows what visitors really
     * see right now instead of a wall of empty boxes. Saving is what creates an
     * override: a field left at its default is never written, so the page keeps
     * using its built-in markup and the editor can be cleared again at any time.
     */
    SCHEMA: [
      {
        group: 'Homepage — hero',
        items: [
          { key: 'home.hero.tag', label: 'Hero eyebrow text', type: 'text', default: 'Handcrafted With Soul' },
          { key: 'home.hero.title', label: 'Hero headline', type: 'text', default: 'Personalized Gifting, Crafted For The Heart.' },
          { key: 'home.hero.subtitle', label: 'Hero sub-heading', type: 'textarea', default: 'From eternal crochet bouquets and curated luxury hampers to retro polaroids and wax-sealed calligraphy letters — unwrap memories designed to linger forever.' },
          { key: 'home.hero.image', label: 'Hero visual image URL', type: 'url', default: '' },
          { key: 'home.hero.ctaText', label: 'Hero button label', type: 'text', default: 'Explore Custom Gifts' },
          { key: 'home.hero.ctaUrl', label: 'Hero button link', type: 'text', default: '#personalized' },
          { key: 'home.hero.secondaryText', label: 'Second button label', type: 'text', default: 'Browse Catalog' },
          { key: 'home.hero.secondaryUrl', label: 'Second button link', type: 'text', default: './category/?slug=all' }
        ]
      },
      {
        group: 'Homepage — newsletter',
        items: [
          { key: 'home.newsletter.tag', label: 'Section eyebrow', type: 'text', default: 'Join The Inner Circle' },
          { key: 'home.newsletter.title', label: 'Section headline', type: 'text', default: 'Get 10% Off Your First Handcrafted Gift' },
          { key: 'home.newsletter.body', label: 'Section description', type: 'textarea', default: 'Subscribe to receive secret discount codes, festival gift guides, and early access to limited edition drops.' },
          { key: 'home.newsletter.buttonText', label: 'Subscribe button label', type: 'text', default: 'Subscribe' }
        ]
      },
      {
        group: 'Announcement bar',
        items: [
          { key: 'announce.text', label: 'Message', type: 'text', default: '' },
          { key: 'announce.linkUrl', label: 'Link (optional)', type: 'text', default: '' },
          { key: 'announce.enabled', label: 'Show the bar', type: 'bool', default: '' }
        ]
      },
      {
        group: 'Footer',
        items: [
          { key: 'footer.about', label: 'About text', type: 'textarea', default: 'Curating heartfelt personal connections through artisanal bouquets, bespoke hampers, and eternal keepsakes. Every creation tells your unrepeatable story.' },
          { key: 'footer.whatsapp', label: 'WhatsApp number', type: 'text', default: '919876543210' },
          { key: 'footer.email', label: 'Contact email', type: 'text', default: 'care@vrindahampers.in' },
          { key: 'footer.instagramUrl', label: 'Instagram link', type: 'text', default: '' },
          { key: 'footer.facebookUrl', label: 'Facebook link', type: 'text', default: '' }
        ]
      }
    ],

    _db: function () {
      if (typeof firebase === 'undefined' || !firebase.database) return null;
      return firebase.database();
    },

    /** Reads the whole /siteContent node. Public, so any page may call it. */
    load: async function () {
      const db = this._db();
      if (!db) return { success: false, error: 'Database unavailable' };
      try {
        const snap = await db.ref('siteContent').once('value');
        return { success: true, values: snap.val() || {} };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    /**
     * One field by dotted path. This is what the storefront uses to render a
     * single string: get('home.hero.title', 'Fallback text').
     *
     * When no fallback is passed, the schema's own `default` is used, so a page
     * can simply call get('home.hero.title') and still get the shipped copy
     * even when the owner has never saved an override.
     */
    get: function (values, key, fallback) {
      const parts = String(key || '').split('.');
      let cur = values;
      let found = true;
      for (let i = 0; i < parts.length; i++) {
        if (cur === undefined || cur === null) { found = false; break; }
        cur = cur[parts[i]];
      }
      if (found && cur !== undefined && cur !== null) return cur;

      if (fallback !== undefined) return fallback;
      const item = this.findField(key);
      return item && item.default !== undefined ? item.default : '';
    },

    /** The schema entry for a dotted key, or null. */
    findField: function (key) {
      for (let g = 0; g < this.SCHEMA.length; g++) {
        const hit = this.SCHEMA[g].items.find((i) => i.key === key);
        if (hit) return hit;
      }
      return null;
    },

    /**
     * Write a batch of { key: value } pairs.
     * The caller is responsible for having checked the role — the database
     * refuses anything but an owner, which is the real enforcement.
     */
    save: async function (patch) {
      // The role check comes FIRST, before the database is even touched: this
      // is a permission decision, and it must not depend on connectivity or on
      // which check happens to be written higher up.
      const auth = window.VrindaAuth;
      if (!auth || !auth.currentUser || !auth.isOwner || !auth.isOwner()) {
        return { success: false, error: 'Only Super Admin++ can edit site content' };
      }

      const db = this._db();
      if (!db) return { success: false, error: 'Database unavailable' };
      if (!patch || typeof patch !== 'object') return { success: false, error: 'Nothing to save' };

      try {
        const updates = {};
        let count = 0;
        Object.keys(patch).forEach((key) => {
          const value = patch[key];
          const item = this.findField(key);

          // Saving a field that still equals its shipped default writes nothing,
          // so /siteContent holds only genuine overrides. That keeps the node
          // small, makes "Clear all" a real reset, and means the editor can
          // never freeze the live copy by accident.
          if (item && item.default !== undefined && String(value) === String(item.default)) return;

          // A dotted key becomes a nested path so pages can read it as
          // values.home.hero.title rather than values['home.hero.title'].
          updates['siteContent/' + String(key).replace(/\./g, '/')] =
            (value === '' || value === undefined || value === null) ? null : value;
          count++;
        });
        if (!count) {
          return { success: true, saved: 0, note: 'No changes to save.' };
        }

        await db.ref().update(updates);
        return { success: true, saved: count };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    /** Restore every key in the schema to the shipped default. */
    reset: async function () {
      const patch = {};
      this.SCHEMA.forEach((g) => g.items.forEach((i) => { patch[i.key] = ''; }));
      return this.save(patch);
    }
  };

  window.VrindaSiteContent = ContentService;
})();