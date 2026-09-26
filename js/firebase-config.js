/**
 * vrindahampers - Firebase Configuration & Initialization
 * 
 * Instructions:
 * 1. Go to Firebase Console: https://console.firebase.google.com/
 * 2. Select or create your Firebase project: "vrindahampers"
 * 3. Go to Project Settings -> General -> "Your apps" -> Add Web App ("</>")
 * 4. Copy the firebaseConfig object properties and replace the placeholders below.
 * 5. Under Authentication -> Sign-in method:
 *    - Enable "Email/Password"
 *    - Enable "Google"
 *    - In "Authorized domains", add:
 *      - localhost
 *      - 127.0.0.1
 *      - yourusername.github.io (your GitHub Pages custom domain)
 * 6. Under Realtime Database -> Create Database (choose Singapore `asia-southeast1` or US Central):
 *    - Set up rules using the provided `database.rules.json`.
 */

(function () {
  'use strict';

  // REPLACE THESE PLACEHOLDERS WITH YOUR ACTUAL FIREBASE PROJECT KEYS
  const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
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
