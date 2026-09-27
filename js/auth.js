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
    authResolved: false,   // becomes true once Firebase reports the restored session
    sdkReady: false,       // true only once the Firebase Auth SDK is actually wired up

    /**
     * Sign-in availability. The module object always exists (other pages check for
     * it), but it is useless until init() has attached the Firebase auth listener —
     * a page must use this rather than a truthiness check on VrindaAuth.
     */
    isReady: function () {
      return !!(this.sdkReady && typeof firebase !== 'undefined' && firebase.auth);
    },

    init: function () {
      if (typeof firebase === 'undefined' || !firebase.auth) {
        console.warn('Firebase Auth SDK not detected.');
        return;
      }

      AuthManager.sdkReady = true;

      firebase.auth().onAuthStateChanged((user) => {
        AuthManager.authResolved = true;
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

    /**
     * Like onAuthChange, but fires only once Firebase has actually restored the
     * session (or after `timeoutMs` in offline/no-SDK mode). Pages that redirect
     * unauthenticated visitors must use this, otherwise the very first synchronous
     * callback (which always reports "no user") would bounce logged-in customers
     * straight back to the login page.
     */
    whenReady: function (callback, timeoutMs) {
      if (typeof callback !== 'function') return;

      let done = false;
      const fire = () => {
        if (done) return;
        done = true;
        callback(this.currentUser, this.currentProfile);
      };

      if (this.authResolved) {
        fire();
        return;
      }

      this.listeners.push(() => {
        if (this.authResolved) fire();
      });

      setTimeout(() => {
        if (done) return;
        if (!this.authResolved) {
          console.warn('vrindahampers: auth state did not resolve in time; continuing in offline mode.');
        }
        fire();
      }, timeoutMs || 4000);
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

    // Fetch role from RTDB users/$uid/role
    getUserRole: function () {
      if (this.currentProfile && this.currentProfile.role) {
        return this.currentProfile.role;
      }
      return 'customer';
    },

    /**
     * ROLE HIERARCHY (highest first).
     *
     * owner  — "Super Admin++". Full control of the entire site INCLUDING this
     *          role table: can grant or revoke every role, including owner.
     *          The only role that may hand out owner/manager.
     * manager — "Super Admin+". Everything a Super Admin can do, PLUS the
     *          destructive operations Super Admin deliberately cannot (delete an
     *          order outright, edit a customer's record). Cannot grant owner or
     *          manager, so a manager can never escalate anyone past itself.
     * superadmin — existing role, unchanged. Can still promote staff/delivery.
     *
     * Note the ordering matters: `atLeast` is a numeric comparison, so a new
     * role added in the middle automatically inherits the lower privileges.
     */
    ROLE_LEVELS: {
      customer: 0,
      delivery: 1,
      staff: 2,
      superadmin: 3,
      manager: 4,
      owner: 5
    },

    ROLE_LABELS: {
      owner: 'Super Admin++',
      manager: 'Super Admin+',
      superadmin: 'Super Admin',
      staff: 'Staff Admin',
      delivery: 'Delivery Manager',
      customer: 'Customer'
    },

    /** Numeric rank of a role; unknown roles rank as customer (0). */
    roleLevel: function (role) {
      const level = this.ROLE_LEVELS[role];
      return typeof level === 'number' ? level : 0;
    },

    /**
     * True when the signed-in user's role is at or above `role`.
     * This is what every privilege check should use, because it keeps the
     * hierarchy in ONE place instead of repeating role lists at each call site.
     */
    atLeast: function (role) {
      if (!this.currentUser) return false;
      return this.roleLevel(this.getUserRole()) >= this.roleLevel(role);
    },

    isOwner: function () {
      return !!this.currentUser && this.getUserRole() === 'owner';
    },

    isManager: function () {
      return !!this.currentUser && this.getUserRole() === 'manager';
    },

    /**
     * May the current user assign `targetRole` to somebody?
     *
     * Only an owner can grant owner or manager. Everyone else who is allowed
     * into a role table at all may only hand out the roles they already sit
     * above, which stops a manager (or a super admin) from minting a peer and
     * then using that peer to keep going.
     */
    canGrantRole: function (targetRole) {
      if (!this.currentUser) return false;
      const mine = this.getUserRole();
      if (this.roleLevel(mine) < this.roleLevel('superadmin')) return false;
      if (targetRole === 'owner' || targetRole === 'manager') return this.isOwner();
      // Granting staff/delivery/customer needs at least Super Admin.
      return true;
    },

    // Check if current user has one of the allowed roles
    hasRole: function (allowedRoles) {
      if (!this.currentUser) return false;
      const role = this.getUserRole();
      if (Array.isArray(allowedRoles)) {
        return allowedRoles.includes(role);
      }
      return role === allowedRoles;
    },

    /**
     * Shared gate guard for Admin portals (Phase 6).
     * @param {string|string[]} allowedRoles - e.g. ['superadmin', 'staff']
     * @param {object} options - redirect options
     */
    requireAdminRole: function (allowedRoles, options) {
      const opts = options || {};
      if (!this.currentUser) {
        if (!opts.silent) {
          alert('vrindahampers Admin Portal:\n\nPlease sign in with an authorized staff account.');
          const redirect = opts.redirectUrl || window.location.href;
          window.location.href = (opts.loginPath || '../pages/login.html') + '?redirect=' + encodeURIComponent(redirect);
        }
        return false;
      }

      const role = this.getUserRole();
      const rolesArray = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

      // Hierarchy-aware: a higher role satisfies a gate that lists a lower one,
      // so owner/manager walk into the Super Admin portal without it having to
      // enumerate the new roles. The comparison is "at least as high as the
      // LOWEST role on the list" — a gate for ['staff'] admits everyone from
      // staff upwards, while a gate for ['owner'] admits only an owner.
      const lowestRequired = rolesArray.reduce(
        (lowest, r) => (this.roleLevel(r) < this.roleLevel(lowest) ? r : lowest),
        rolesArray[0]
      );
      if (this.atLeast(lowestRequired)) {
        return true;
      }

      if (!opts.silent) {
        const required = rolesArray.map((r) => r.toUpperCase()).join(' or ');
        alert(
          `Access Denied:\n\nYour account role (${role.toUpperCase()}) does not have permission to view this section.\n\n` +
          `Required role: ${required}.\n` +
          `To fix this, ask your Super Admin to promote you under Admin → Staff & Roles, ` +
          `or set users/${this.currentUser.uid}/role in the Firebase Console (then sign out and back in).`
        );
        window.location.href = opts.homePath || '../index.html';
      }
      return false;
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
    },

    /**
     * Shared gate guard used by header triggers and by Phase 4 commerce controllers.
     * Returns true when the action may proceed. When it may not, it shows the standard
     * notice and redirects to login (or to the profile page for unverified emails),
     * unless `options.silent` is set — in that case it only reports the reason.
     */
    requireGate: function (actionName, options) {
      const opts = options || {};
      const gate = this.canPerformGatedAction(actionName);

      if (gate.allowed) return true;

      if (!opts.silent) {
        const extra = opts.notice ? '\n\n' + opts.notice : '\n\n(Browsing the full catalog is always 100% public.)';
        alert('vrindahampers Notice:\n\n' + gate.message + extra);

        if (gate.reason === 'unauthenticated') {
          const redirect = opts.redirectUrl || window.location.href;
          window.location.href = (opts.loginPath || '../pages/login.html') +
            '?redirect=' + encodeURIComponent(redirect);
        } else if (gate.reason === 'unverified_email') {
          window.location.href = opts.profilePath || '../pages/profile.html';
        }
      }

      return false;
    }

  };

  window.VrindaAuth = AuthManager;
  document.addEventListener('DOMContentLoaded', () => {
    AuthManager.init();
  });

})();
