/**
 * vrindahampers - Login & Register Page Controller
 */

(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', () => {
    const notice = document.getElementById('authNotice');
    function showNotice(text, isError, code) {
      if (!notice) return;
      notice.style.display = 'block';
      notice.style.background = isError ? 'var(--color-error-bg)' : 'var(--color-success-bg)';
      notice.style.color = isError ? 'var(--color-error)' : 'var(--color-success)';
      notice.style.border = `1px solid ${isError ? 'var(--color-error)' : 'var(--color-success)'}`;
      notice.textContent = text;
      // The plain message above is for the customer; the raw code below is what
      // support needs, and it is what turns "login is not working" into a diagnosis.
      if (isError && code) {
        const detail = document.createElement('div');
        detail.style.marginTop = '8px';
        detail.style.paddingTop = '8px';
        detail.style.borderTop = '1px dashed rgba(0,0,0,0.15)';
        detail.style.fontSize = '11px';
        detail.style.opacity = '0.8';
        detail.textContent = 'Error code: ' + code + ' · host: ' + window.location.host;
        notice.appendChild(detail);
      }
    }

    const urlParams = new URLSearchParams(window.location.search);
    const redirectUrl = urlParams.get('redirect') || '../index.html';

    /**
     * Firebase error codes are unreadable for a customer and the raw message hides
     * the one thing they can actually act on, so translate them here.
     */
    function friendlyError(raw) {
      const message = String(raw || '');
      if (/auth\/invalid-credential|wrong-password|user-not-found|invalid-email/i.test(message)) {
        return 'That email and password combination does not match an account. Check for typos, or use “Forgot?” to reset your password.';
      }
      if (/auth\/too-many-requests/i.test(message)) {
        return 'Too many attempts. Wait a minute, then try again (or reset your password).';
      }
      if (/auth\/network-request-failed|network error|ERR_INTERNET|Failed to fetch/i.test(message)) {
        return 'We could not reach the sign-in service. Check your internet connection (or VPN/ad-blocker) and try again.';
      }
      if (/auth\/unauthorized-domain/i.test(message)) {
        return 'This site is not authorised for sign-in yet. Add "' +
          window.location.host + '" under Firebase Console → Authentication → Settings → Authorized domains.';
      }
      if (/auth\/operation-not-allowed|auth\/provider-not-found/i.test(message)) {
        return 'This sign-in method is disabled for the project. Enable Email/Password (or Google) in Firebase Console → Authentication → Sign-in method.';
      }
      if (/auth\/popup-closed/i.test(message)) {
        return 'The sign-in window was closed before finishing. Please try again.';
      }
      if (/auth\/user-disabled/i.test(message)) {
        return 'This account has been disabled. Please contact support.';
      }
      return message || 'Something went wrong while signing in. Please try again.';
    }

    // The Firebase SDK can fail to load (offline, blocked CDN, VPN). VrindaAuth
    // still EXISTS in that case (the module is always published), it is just not
    // wired up — so check isReady(), not truthiness. Otherwise every button dies
    // silently on "Signing in..." with no explanation at all.
    const authReady = typeof window.VrindaAuth !== 'undefined' &&
      typeof window.VrindaAuth.isReady === 'function' && window.VrindaAuth.isReady();

    if (!authReady) {
      showNotice(
        'Sign-in is unavailable right now: the Firebase authentication service did not load. ' +
        'Check your internet connection (a VPN or ad-blocker can block it) and refresh this page.',
        true
      );
      ['loginSubmitBtn', 'registerSubmitBtn', 'googleAuthBtn', 'loginEmail', 'loginPassword']
        .forEach((id) => { const el = document.getElementById(id); if (el) el.disabled = true; });
      return;
    }

    const tabs = document.querySelectorAll('.auth-tab');
    const panes = document.querySelectorAll('.auth-pane');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        panes.forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.getAttribute('data-target'))?.classList.add('active');
      });
    });

    document.getElementById('showForgotBtn')?.addEventListener('click', () => {
      panes.forEach(p => p.classList.remove('active'));
      document.getElementById('forgotPane')?.classList.add('active');
    });

    document.getElementById('cancelForgotBtn')?.addEventListener('click', () => {
      panes.forEach(p => p.classList.remove('active'));
      document.getElementById('loginPane')?.classList.add('active');
    });

    // Email Login
    document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('loginEmail').value.trim();
      const password = document.getElementById('loginPassword').value;

      if (!email || !password) {
        showNotice('Please enter both email and password.', true);
        return;
      }

      const btn = document.getElementById('loginSubmitBtn');
      btn.textContent = 'Signing in...';
      btn.disabled = true;

      let res;
      try {
        res = await window.VrindaAuth.loginWithEmail(email, password);
      } catch (err) {
        // A thrown error (SDK problem, blocked request) must never leave the
        // button stuck on "Signing in...".
        res = { success: false, error: err && err.message };
      }
      btn.textContent = 'Sign In';
      btn.disabled = false;

      if (res.success) {
        showNotice('Login successful! Redirecting...', false);
        setTimeout(() => { window.location.href = redirectUrl; }, 600);
      } else {
        showNotice(friendlyError(res.error), true, res.error);
      }
    });

    // Email Register
    document.getElementById('registerForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('registerName').value.trim();
      const email = document.getElementById('registerEmail').value.trim();
      const phone = document.getElementById('registerPhone').value.trim();
      const password = document.getElementById('registerPassword').value;

      if (!name || !email || !password) {
        showNotice('Please complete all required fields.', true);
        return;
      }

      const btn = document.getElementById('registerSubmitBtn');
      btn.textContent = 'Creating account...';
      btn.disabled = true;

      let res;
      try {
        res = await window.VrindaAuth.signUpWithEmail(name, email, password, phone);
      } catch (err) {
        res = { success: false, error: err && err.message };
      }
      btn.textContent = 'Create Account';
      btn.disabled = false;

      if (res.success) {
        showNotice(res.message, false);
        setTimeout(() => { window.location.href = redirectUrl; }, 1400);
      } else {
        showNotice(friendlyError(res.error), true, res.error);
      }
    });

    // Google Auth
    document.getElementById('googleAuthBtn')?.addEventListener('click', async () => {
      const btn = document.getElementById('googleAuthBtn');
      const original = btn ? btn.textContent : '';
      if (btn) { btn.disabled = true; btn.textContent = 'Opening Google…'; }
      let res;
      try {
        res = await window.VrindaAuth.loginWithGoogle();
      } catch (err) {
        res = { success: false, error: err && err.message };
      }
      if (btn) { btn.disabled = false; btn.textContent = original; }
      if (res.success) {
        showNotice('Signed in with Google! Redirecting...', false);
        setTimeout(() => { window.location.href = redirectUrl; }, 600);
      } else {
        showNotice(friendlyError(res.error), true, res.error);
      }
    });

    // Forgot Password
    document.getElementById('forgotForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('forgotEmail').value.trim();
      if (!email) {
        showNotice('Please enter your email.', true);
        return;
      }
      let res;
      try {
        res = await window.VrindaAuth.sendPasswordReset(email);
      } catch (err) {
        res = { success: false, error: err && err.message };
      }
      if (res.success) {
        showNotice(res.message, false);
      } else {
        showNotice(friendlyError(res.error), true, res.error);
      }
    });

    // Redirect if already logged in
    window.VrindaAuth.onAuthChange((user) => {
      if (user && !window.location.search.includes('stay=1')) {
        window.location.href = redirectUrl;
      }
    });
  });
})();
