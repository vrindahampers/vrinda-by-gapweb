/**
 * vrindahampers - Login & Register Page Controller
 */

(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', () => {
    const notice = document.getElementById('authNotice');
    function showNotice(text, isError) {
      if (!notice) return;
      notice.style.display = 'block';
      notice.style.background = isError ? 'var(--color-error-bg)' : 'var(--color-success-bg)';
      notice.style.color = isError ? 'var(--color-error)' : 'var(--color-success)';
      notice.style.border = `1px solid ${isError ? 'var(--color-error)' : 'var(--color-success)'}`;
      notice.textContent = text;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const redirectUrl = urlParams.get('redirect') || '../index.html';

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

      const res = await window.VrindaAuth.loginWithEmail(email, password);
      btn.textContent = 'Sign In';
      btn.disabled = false;

      if (res.success) {
        showNotice('Login successful! Redirecting...', false);
        setTimeout(() => { window.location.href = redirectUrl; }, 600);
      } else {
        showNotice(res.error, true);
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

      const res = await window.VrindaAuth.signUpWithEmail(name, email, password, phone);
      btn.textContent = 'Create Account';
      btn.disabled = false;

      if (res.success) {
        showNotice(res.message, false);
        setTimeout(() => { window.location.href = redirectUrl; }, 1400);
      } else {
        showNotice(res.error, true);
      }
    });

    // Google Auth
    document.getElementById('googleAuthBtn')?.addEventListener('click', async () => {
      const res = await window.VrindaAuth.loginWithGoogle();
      if (res.success) {
        showNotice('Signed in with Google! Redirecting...', false);
        setTimeout(() => { window.location.href = redirectUrl; }, 600);
      } else {
        showNotice(res.error, true);
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
      const res = await window.VrindaAuth.sendPasswordReset(email);
      if (res.success) {
        showNotice(res.message, false);
      } else {
        showNotice(res.error, true);
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
