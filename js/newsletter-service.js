/**
 * vrindahampers - Newsletter Service
 *
 * Persists "Join the Inner Circle" signups to Firebase Realtime Database so the
 * list is real, exportable data rather than a thank-you message that goes
 * nowhere. A subscriber is stored once per account (keyed by uid, or by a hash
 * of the email for signed-out visitors) and re-subscribing is idempotent: the
 * form is then hidden for that visitor instead of asking again.
 *
 * Unsubscribe is supported (that is what the confirmation link in a campaign
 * points at) and is handled in unsubscribe().
 */
(function () {
  'use strict';

  const NewsletterService = {
    /**
     * The database handle. Extracted into one method so a caller (or a test)
     * can substitute a connection without the service reaching for the global
     * firebase object on every call.
     */
    _db: function () {
      if (typeof firebase === 'undefined' || !firebase.database) return null;
      return firebase.database();
    },

    /**
     * Stable storage key for the current visitor.
     *
     * A signed-in user is keyed by uid, so the same person gets ONE row no
     * matter which email they type. A signed-out visitor is keyed by a hash of
     * the email itself, which recognises a repeat signup on the same browser
     * without storing the address in a localStorage key.
     */
    _key: function (email) {
      const auth = window.VrindaAuth;
      if (auth && auth.currentUser && auth.currentUser.uid) return auth.currentUser.uid;
      return 'anon-' + NewsletterService._hash(String(email || '').trim().toLowerCase());
    },

    /** Small, dependency-free string hash (djb2). Not a security primitive. */
    _hash: function (str) {
      let h = 5381;
      for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
      return h.toString(36);
    },

    /** Rejects the obvious junk before it costs a database write. */
    isValidEmail: function (email) {
      const value = String(email || '').trim();
      if (value.length < 6 || value.length > 254) return false;
      // One @, something either side, a dot in the domain, no spaces.
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) return false;
      if (/\.\./.test(value)) return false;
      return true;
    },

    /**
     * Save a subscription.
     * @returns {Promise<{success:boolean, alreadySubscribed?:boolean, error?:string}>}
     */
    subscribe: async function (email, meta) {
      const db = this._db();
      if (!db) return { success: false, error: 'Signup is unavailable right now.' };
      if (!this.isValidEmail(email)) {
        return { success: false, error: 'Please enter a valid email address.' };
      }

      const clean = String(email).trim().toLowerCase();
      const ref = db.ref('newsletter/' + this._key(clean));

      try {
        // Re-subscribing must not create a second row or reset the original
        // signup date, so read first and treat "already there" as success.
        const existing = (await ref.once('value')).val();
        if (existing && existing.email === clean) {
          this._rememberLocally(clean);
          return { success: true, alreadySubscribed: true };
        }

        const auth = window.VrindaAuth;
        const signedIn = !!(auth && auth.currentUser);
        await ref.set({
          email: clean,
          // Who signed up: the account uid when signed in, else ''.
          userId: signedIn ? auth.currentUser.uid : '',
          userName: signedIn ? (auth.currentUser.displayName || '') : '',
          signedIn: signedIn,
          source: (meta && meta.source) || 'homepage',
          status: 'subscribed',
          // Kept from the first signup so a re-subscribe does not look new.
          createdAt: (existing && existing.createdAt) || firebase.database.ServerValue.TIMESTAMP,
          updatedAt: firebase.database.ServerValue.TIMESTAMP
        });
        this._rememberLocally(clean);
        return { success: true, alreadySubscribed: false };
      } catch (err) {
        console.warn('Newsletter signup failed:', err && err.message);
        return { success: false, error: 'We could not save that email. Please try again.' };
      }
    },

    /** Mark a subscription as unsubscribed without losing the row. */
    unsubscribe: async function (email) {
      const db = this._db();
      if (!db) return { success: false, error: 'Unsubscribe is unavailable right now.' };
      if (!this.isValidEmail(email)) return { success: false, error: 'Invalid email address.' };

      const ref = db.ref('newsletter/' + this._key(email));
      try {
        const existing = (await ref.once('value')).val();
        if (!existing || existing.email !== String(email).trim().toLowerCase()) {
          return { success: false, error: 'That address is not on the list.' };
        }
        await ref.update({ status: 'unsubscribed', updatedAt: firebase.database.ServerValue.TIMESTAMP });
        this._forgetLocally();
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    /**
     * Has THIS visitor already subscribed? Checks the local cache first so the
     * form can be hidden without a network round-trip, then falls back to one
     * read. For a signed-in user the server row is the answer.
     */
    hasSubscribed: async function () {
      const auth = window.VrindaAuth;
      const signedIn = !!(auth && auth.currentUser);
      const cached = this._readLocal();
      if (cached && !signedIn) return true;
      const db = this._db();
      if (!db) return false;

      try {
        const key = signedIn
          ? auth.currentUser.uid
          : (cached ? 'anon-' + this._hash(cached.toLowerCase()) : null);
        if (!key) return false;
        const row = (await db.ref('newsletter/' + key).once('value')).val();
        return !!(row && row.status !== 'unsubscribed');
      } catch (err) {
        return false;
      }
    },

    /* ---------------------------------------------- "already joined" local cache */

    _localKey: function () {
      const auth = window.VrindaAuth;
      return (auth && auth.currentUser && auth.currentUser.uid)
        ? 'vrinda:newsletter:' + auth.currentUser.uid
        : 'vrinda:newsletter:anon';
    },

    _rememberLocally: function (email) {
      try { localStorage.setItem(this._localKey(), String(email || '').toLowerCase()); }
      catch (e) { /* private mode */ }
    },

    _readLocal: function () {
      try { return localStorage.getItem(this._localKey()) || ''; } catch (e) { return ''; }
    },

    _forgetLocally: function () {
      try { localStorage.removeItem(this._localKey()); } catch (e) { /* private mode */ }
    }
  };

  window.VrindaNewsletter = NewsletterService;
})();

