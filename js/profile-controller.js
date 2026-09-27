/**
 * vrindahampers - Customer Profile & Addresses Controller
 */

(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', () => {
    const notice = document.getElementById('profileNotice');
    function showNotice(text, isError) {
      if (!notice) return;
      notice.style.display = 'block';
      notice.style.background = isError ? 'var(--color-error-bg)' : 'var(--color-success-bg)';
      notice.style.color = isError ? 'var(--color-error)' : 'var(--color-success)';
      notice.style.border = `1px solid ${isError ? 'var(--color-error)' : 'var(--color-success)'}`;
      notice.textContent = text;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Use whenReady (not onAuthChange) for the login redirect: onAuthChange's
    // first synchronous callback always reports "no user" while the Firebase
    // session is still restoring, which bounced logged-in customers straight
    // back to login.html and caused an endless refresh loop between the two pages.
    window.VrindaAuth.whenReady((user, profile) => {
      if (!user) {
        window.location.href = './login.html?redirect=' + encodeURIComponent(window.location.href);
        return;
      }

      // Email verification alert
      const unverifiedBanner = document.getElementById('unverifiedNotice');
      if (unverifiedBanner) {
        unverifiedBanner.style.display = user.emailVerified ? 'none' : 'flex';
      }

      // Populate Form Fields
      const emailField = document.getElementById('profileEmail');
      const nameField = document.getElementById('profileName');
      const phoneField = document.getElementById('profilePhone');

      if (emailField) emailField.value = user.email || '';
      if (nameField) nameField.value = (profile && profile.name) || user.displayName || '';
      if (phoneField) phoneField.value = (profile && profile.phone) || '';

      const role = (profile && profile.role) || 'customer';
      const roleBadge = document.getElementById('profileRoleBadge');
      if (roleBadge) {
        roleBadge.innerHTML = `<span class="badge ${role === 'superadmin' ? 'badge-accent' : role === 'staff' ? 'badge-new' : 'badge-primary'}">${role.toUpperCase()}</span>`;
      }

      const defaultAddr = (profile && profile.addresses && profile.addresses.default) || {};
      const addrLine1 = document.getElementById('addrLine1');
      const addrCity = document.getElementById('addrCity');
      const addrState = document.getElementById('addrState');
      const addrPincode = document.getElementById('addrPincode');

      if (addrLine1) addrLine1.value = defaultAddr.line1 || '';
      if (addrCity) addrCity.value = defaultAddr.city || '';
      if (addrState) addrState.value = defaultAddr.state || '';
      if (addrPincode) addrPincode.value = defaultAddr.pincode || '';
    });

    // Handle Resend Verification
    document.getElementById('resendVerificationBtn')?.addEventListener('click', async () => {
      const btn = document.getElementById('resendVerificationBtn');
      btn.textContent = 'Sending...';
      btn.disabled = true;

      const res = await window.VrindaAuth.resendVerificationEmail();
      btn.textContent = 'Resend Verification Email';
      btn.disabled = false;

      if (res.success) {
        showNotice(res.message, false);
      } else {
        showNotice(res.error, true);
      }
    });

    // Handle Profile Form Submit
    document.getElementById('profileForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const saveBtn = document.getElementById('saveProfileBtn');
      saveBtn.textContent = 'Saving...';
      saveBtn.disabled = true;

      const name = document.getElementById('profileName').value.trim();
      const phone = document.getElementById('profilePhone').value.trim();
      const line1 = document.getElementById('addrLine1').value.trim();
      const city = document.getElementById('addrCity').value.trim();
      const state = document.getElementById('addrState').value.trim();
      const pincode = document.getElementById('addrPincode').value.trim();

      const updates = {
        name: name,
        phone: phone,
        'addresses/default': {
          line1: line1,
          city: city,
          state: state,
          pincode: pincode
        }
      };

      const res = await window.VrindaAuth.updateUserProfile(updates);
      saveBtn.textContent = 'Save Profile Changes';
      saveBtn.disabled = false;

      if (res.success) {
        showNotice('Profile and delivery addresses saved successfully!', false);
      } else {
        showNotice(res.error, true);
      }
    });
  });
})();
