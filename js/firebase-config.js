/**
 * vrindahampers - Firebase Configuration & Initialization
 *
 * The web app keys below are already configured for the live
 * "vrindahampers-db" project. If you ever need to rotate them:
 * 1. Firebase Console -> https://console.firebase.google.com/
 * 2. Project Settings -> General -> Your apps -> Web app -> Regenerate keys
 * 3. Update the firebaseConfig object below.
 * 4. Under Authentication -> Sign-in method, ensure "Email/Password" and
 *    "Google" are enabled, and under "Authorized domains" add:
 *      - localhost
 *      - 127.0.0.1
 *      - your deployed domain (e.g. yourusername.github.io or your custom domain)
 * 5. Realtime Database rules are published from database.rules.json
 *    (see FIREBASE_SETUP.md).
 */

(function () {
  'use strict';

  // Live keys for the vrindahampers-db Firebase project (see header for rotation steps).
  const firebaseConfig = {
  apiKey: "AIzaSyAj9TuSSVW8SQAKYMDU8pBSRExWElsqdE0",
  authDomain: "vrindahampers-db.firebaseapp.com",
  databaseURL: "https://vrindahampers-db-default-rtdb.firebaseio.com",
  projectId: "vrindahampers-db",
  storageBucket: "vrindahampers-db.firebasestorage.app",
  messagingSenderId: "690883110721",
  appId: "1:690883110721:web:ed46a35847cf98065963c0"
};

  // Safe initialization
  if (typeof firebase !== 'undefined' && !firebase.apps.length) {
    try {
      firebase.initializeApp(firebaseConfig);
      // Ensure persistence across static page navigations
      firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL)
        .catch(function(err) {
          console.warn('Firebase persistence setting warning:', err);
        });
      console.log('vrindahampers Firebase initialized successfully.');
    } catch (error) {
      console.error('Firebase initialization error:', error);
    }
  }

  window.VRINDA_FIREBASE_CONFIG = firebaseConfig;
})();
