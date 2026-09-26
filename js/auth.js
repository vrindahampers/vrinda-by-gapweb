/**
 * vrindahampers - Authentication Engine & Auth State Manager
 * Handles: Email/Password signup, Login, Google Auth, Forgot Password,
 * Email Verification gate, RTDB user syncing, Session handling.
 */

(function () {
  'use strict';

  const AuthManager = {
    currentUser: null,
    currentProfile: null,
    listeners: [],

    init: function () {
      if (typeof firebase === 'undefined' || !firebase.auth) {
        console.warn('Firebase Auth SDK not detected.');
        return;
      }

      firebase.auth().onAuthStateChanged((user) => {
        AuthManager.currentUser = user;
        if (user) {
          AuthManager.fetchUserProfile(user.uid, (profile) => {
            AuthManager.currentProfile = profile;
            AuthManager.notifyListeners();
          });
        } else {
          AuthManager.currentProfile = null;
          AuthManager.notifyListeners();
        }
      });
    },

    onAuthChange: function (callback) {
      if (typeof callback === 'function') {
        this.listeners.push(callback);
        callback(this.currentUser, this.currentProfile);
      }
    },

    notifyListeners: function () {
      this.listeners.forEach(cb => {
        try {
          cb(this.currentUser, this.currentProfile);
        } catch (e) {
          console.error('Error in auth state listener:', e);
        }
      });
    },

    // Sign up with Email and Password
    signUpWithEmail: async function (name, email, password, phone) {
      try {
        const cred = await firebase.auth().createUserWithEmailAndPassword(email, password);
        const user = cred.user;

        // Send verification email
        await user.sendEmailVerification();
        await user.updateProfile({ displayName: name });

        // Save user record in RTDB
        const userRecord = {
          uid: user.uid,
          name: name,
          email: email,
          phone: phone || '',
          role: 'customer',
          createdAt: firebase.database.ServerValue.TIMESTAMP,
          addresses: {
            default: {
              line1: '',
              city: '',
              state: '',
              pincode: ''
            }
          }
        };

        await firebase.database().ref('users/' + user.uid).set(userRecord);

        return {
          success: true,
          user: user,
          message: 'Account created! A verification link has been sent to your email.'
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    // Login with Email and Password
    loginWithEmail: async function (email, password) {
      try {
        const cred = await firebase.auth().signInWithEmailAndPassword(email, password);
        return { success: true, user: cred.user };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
    // Login / Sign Up with Google
    loginWithGoogle: async function () {
      try {
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        const result = await firebase.auth().signInWithPopup(provider);
        const user = result.user;

        const snapshot = await firebase.database().ref('users/' + user.uid).once('value');
        if (!snapshot.exists()) {
          const userRecord = {
            uid: user.uid,
            name: user.displayName || 'Customer',
            email: user.email,
            phone: user.phoneNumber || '',
            role: 'customer',
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            addresses: {
              default: {
                line1: '',
                city: '',
                state: '',
                pincode: ''
              }
            }
          };
          await firebase.database().ref('users/' + user.uid).set(userRecord);
        }

        return { success: true, user: user };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    // Send Password Reset Email
    sendPasswordReset: async function (email) {
      try {
        await firebase.auth().sendPasswordResetEmail(email);
        return { success: true, message: 'Password reset link sent to your email!' };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    // Resend Verification Email
    resendVerificationEmail: async function () {
      if (!this.currentUser) return { success: false, error: 'User is not logged in.' };
      try {
        await this.currentUser.sendEmailVerification();
        return { success: true, message: 'Verification link resent. Please check your inbox & spam folder.' };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    // Fetch user profile from RTDB
    fetchUserProfile: function (uid, callback) {
      if (!firebase.database) return;
      firebase.database().ref('users/' + uid).on('value', (snapshot) => {
        const profile = snapshot.val();
        if (typeof callback === 'function') {
          callback(profile);
        }
      });
    },

    // Update user profile details
    updateUserProfile: async function (updates) {
      if (!this.currentUser) return { success: false, error: 'User not logged in' };
      try {
        await firebase.database().ref('users/' + this.currentUser.uid).update(updates);
        return { success: true, message: 'Profile updated successfully!' };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    // Sign out
    logout: async function () {
      try {
        await firebase.auth().signOut();
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    // Gate check for actions per Phase 0 rules
    canPerformGatedAction: function (actionName) {
      if (!this.currentUser) {
        return {
          allowed: false,
          reason: 'unauthenticated',
          message: 'Please log in to access ' + (actionName || 'this feature') + '.'
        };
      }

      if (!this.currentUser.emailVerified && ['checkout', 'review', 'customization'].includes(actionName)) {
        return {
          allowed: false,
          reason: 'unverified_email',
          message: 'Please verify your email address to proceed with ' + actionName + '.'
        };
      }

      return { allowed: true };
    }

  };

  window.VrindaAuth = AuthManager;
  document.addEventListener('DOMContentLoaded', () => {
    AuthManager.init();
  });

})();
