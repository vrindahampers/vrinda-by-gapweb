# Firebase Setup & Authentication Guide for vrindahampers

This document walks you through configuring Firebase Authentication and Realtime Database for **vrindahampers**.

---

## 1. Create Firebase Project

1. Visit [Firebase Console](https://console.firebase.google.com/) and click **"Add project"**.
2. Name your project: `vrindahampers` (or your preferred name).
3. Disable Google Analytics (optional, not strictly needed for this build) and click **Create Project**.

---

## 2. Register Web App & Get Config Keys

1. In the project dashboard, click the **Web icon `</>`** to register a web app.
2. Enter App nickname: `vrindahampers-web`.
3. Do **NOT** check "Also set up Firebase Hosting" (we are hosting on GitHub Pages).
4. Click **Register app**.
5. Copy the configuration object and paste the keys into `/js/firebase-config.js`:
   ```javascript
   const firebaseConfig = {
     apiKey: "YOUR_API_KEY",
     authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
     databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
     projectId: "YOUR_PROJECT_ID",
     storageBucket: "YOUR_PROJECT_ID.appspot.com",
     messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
     appId: "YOUR_APP_ID"
   };
   ```

---

## 3. Enable Authentication Providers

1. Go to **Authentication** in the left sidebar -> Click **Get started**.
2. Under the **Sign-in method** tab:
   - **Email/Password**: Click, toggle **Enable**, leave "Email link" disabled, click **Save**.
   - **Google**: Click, toggle **Enable**, select your Project support email, click **Save**.
3. Under the **Settings** tab -> **Authorized domains**:
   - Ensure `localhost` and `127.0.0.1` are present for local testing.
   - Click **Add domain** and enter your GitHub Pages domain (e.g., `username.github.io`).

---

## 4. Setup Realtime Database & Security Rules

1. Go to **Build** -> **Realtime Database** -> Click **Create Database**.
2. Select database location (e.g., `asia-southeast1` Singapore or `us-central1`).
3. Start in **Locked mode** (rules will be pasted next).
4. Once created, click on the **Rules** tab.
5. Copy the full contents of `database.rules.json` from the repository and paste into the editor.
6. Click **Publish**.

---

## 5. Roles & Admin Hierarchy (Business Rules)

In Realtime Database, user records are stored at `users/$uid`:
```json
{
  "email": "user@example.com",
  "name": "Jane Doe",
  "phone": "+91 9876543210",
  "role": "customer",
  "createdAt": 1711440000000,
  "addresses": {
    "default": {
      "line1": "Flat 402, Rosewood Heights",
      "city": "Bengaluru",
      "state": "Karnataka",
      "pincode": "560001"
    }
  }
}
```

To assign an Admin or Staff or Delivery Manager:
- **Super Admin**: Set `"role": "superadmin"` in RTDB under their user's `users/$uid/role` and add their UID under `admins/$uid: true`.
- **Staff Admin**: Set `"role": "staff"` under `users/$uid/role` and `staff/$uid: true`.
- **Delivery Manager**: Set `"role": "delivery"` under `users/$uid/role` and `deliveryManagers/$uid: true`.

---

## 6. Realtime Database Node Map

`database.rules.json` protects the following nodes:

| Node | Access |
| --- | --- |
| `users/$uid` | Owner read/write; Admins read all; role field only writable by Admins |
| `admins`, `staff`, `deliveryManagers` | Staff registries; only Super Admins write |
| `products`, `categories` | Public read; Admin-only write (catalog auto-seeds from `sample-data.js` when empty) |
| `reviews/$productId` | Public read; write requires `auth.token.email_verified == true` |
| `cart/$uid`, `wishlist/$uid` | Owner-only read/write (Phase 4) |
| `orders`, `cancellationRequests` | Customer-owned reads, staff/admin workflow (Phase 5) |
| `customRequests/$uid` | Owner read/write (verified email required); Admins & Staff read all — Custom Studio designs |

> **Note:** Verified-email gates match the Phase 0 business rules — reviews and custom design
> submissions are rejected by the database itself if the customer has not verified their email.
