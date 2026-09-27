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
    /** The editable fields the owner can change, grouped for the editor UI. */
    SCHEMA: [
      {
        group: 'Homepage — hero',
        items: [
          { key: 'home.hero.tag', label: 'Hero eyebrow text', type: 'text' },
          { key: 'home.hero.title', label: 'Hero headline', type: 'text' },
          { key: 'home.hero.subtitle', label: 'Hero sub-heading', type: 'text' },
          { key: 'home.hero.image', label: 'Hero background image URL', type: 'url' },
          { key: 'home.hero.ctaText', label: 'Hero button label', type: 'text' },
          { key: 'home.hero.ctaUrl', label: 'Hero button link', type: 'url' }
        ]
      },
      {
        group: 'Homepage — newsletter',
        items: [
          { key: 'home.newsletter.tag', label: 'Section eyebrow', type: 'text' },
          { key: 'home.newsletter.title', label: 'Section headline', type: 'text' },
          { key: 'home.newsletter.body', label: 'Section description', type: 'textarea' },
          { key: 'home.newsletter.buttonText', label: 'Subscribe button label', type: 'text' }
        ]
      },
      {
        group: 'Announcement bar',
        items: [
          { key: 'announce.text', label: 'Message', type: 'text' },
          { key: 'announce.linkUrl', label: 'Link (optional)', type: 'url' },
          { key: 'announce.enabled', label: 'Show the bar', type: 'bool' }
        ]
      },
      {
        group: 'Footer',
        items: [
          { key: 'footer.about', label: 'About text', type: 'textarea' },
          { key: 'footer.whatsapp', label: 'WhatsApp number', type: 'text' },
          { key: 'footer.email', label: 'Contact email', type: 'text' },
          { key: 'footer.instagramUrl', label: 'Instagram link', type: 'url' },
          { key: 'footer.facebookUrl', label: 'Facebook link', type: 'url' }
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
     */
    get: function (values, key, fallback) {
      if (!values || !key) return fallback === undefined ? '' : fallback;
      const parts = String(key).split('.');
      let cur = values;
      for (let i = 0; i < parts.length; i++) {
        if (cur === undefined || cur === null) return fallback === undefined ? '' : fallback;
        cur = cur[parts[i]];
      }
      return cur === undefined || cur === null ? (fallback === undefined ? '' : fallback) : cur;
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
          // A dotted key becomes a nested path so pages can read it as
          // values.home.hero.title rather than values['home.hero.title'].
          const value = patch[key];
          updates['siteContent/' + String(key).replace(/\./g, '/')] =
            (value === '' || value === undefined || value === null) ? null : value;
          count++;
        });
        if (!count) return { success: false, error: 'Nothing to save' };

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