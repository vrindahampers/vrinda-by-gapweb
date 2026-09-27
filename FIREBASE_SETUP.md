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

### Deploying rules from the CLI (recommended)

The repository already ships a `.firebaserc` that pins the project (`projects.default =
vrindahampers-db`) and a `firebase.json` that points at `database.rules.json`, so the rules publish in two commands:

```bash
npm install -g firebase-tools     # once
firebase login                    # once, per machine
firebase deploy --only database
```

> **If you see `zsh: bad CPU type in executable: firebase`:** the standalone
> binary from the Firebase website is an x86_64 build and will not run on Apple
> Silicon. `npm install -g firebase-tools` (above) installs the correct build —
> verify with `firebase --version` (should print 13.x or 15.x).

Expected tail of a successful deploy:

```
database: checking rules syntax for database vrindahampers-db-default-rtdb...
database: rules syntax for database vrindahampers-db-default-rtdb is valid
✔  Deploy complete!
Database Rules: https://console.firebase.google.com/project/vrindahampers-db/database/rules
```

`firebase deploy` reads `database.rules.json` verbatim and validates it **server-side**, so the
file's `//` comments are fully supported (the Console rules editor accepts them too). Generic JSON
linters will flag those comments — that is expected, not an error.

> GitHub Pages cannot run Firebase; the static site only *reads/writes* the Realtime Database,
> so `firebase.json` intentionally contains **only** a `database` block — no `hosting` block.

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
- **Super Admin++ (owner)**: Set `"role": "owner"` under `users/$uid/role`. No registry node needed.
- **Super Admin+ (manager)**: Set `"role": "manager"` under `users/$uid/role`. No registry node needed.
- **Super Admin**: Set `"role": "superadmin"` in RTDB under their user's `users/$uid/role` and add their UID under `admins/$uid: true`.
- **Staff Admin**: Set `"role": "staff"` under `users/$uid/role` and `staff/$uid: true`.
- **Delivery Manager**: Set `"role": "delivery"` under `users/$uid/role` and `deliveryManagers/$uid: true`.

> **Bootstrapping the first Super Admin:** the `admins` node is writable only by an existing
> Super Admin, so the very first one must be created **manually in the Firebase Console**
> (Database → Data → add `users/<uid>/role = "superadmin"` and `admins/<uid> = true`).
> After that, the **Admin → Staff & Roles** tab in `admin/index.html` can promote everyone else.
> Remember to **re-deploy `database.rules.json`** after changing rules — the portals will show
> `PERMISSION_DENIED` until the new role nodes exist in your Firebase project.

### The two elevated roles (Super Admin+ and Super Admin++)

The role ladder, highest first, is defined once in `VrindaAuth.ROLE_LEVELS`:

| Role | Value | What it adds |
| --- | --- | --- |
| **Super Admin++** | `owner` | Everything a Super Admin can do, **plus** the whole-site content editor (`/siteContent`) and the power to grant or revoke the top two roles. |
| **Super Admin+** | `manager` | Everything a Super Admin can do, **plus** deleting an order outright and editing a customer's record. |
| **Super Admin** | `superadmin` | The existing role, unchanged. Promotes staff and delivery managers, as before. |
| **Staff Admin** | `staff` | Unchanged. |
| **Delivery Manager** | `delivery` | Unchanged. |

`VrindaAuth.atLeast('superadmin')` is how privileges are checked, so a Manager or Owner walks
into the Super Admin portal without that portal having to enumerate the new roles.

**Three security properties are enforced in `database.rules.json`, not just in the UI:**

1. **Nobody may write their own role** (`users/$uid/role` has `auth.uid !== $uid`). Without
   this, a Manager could simply promote themselves to Owner.
2. **Only an Owner may grant or revoke Owner/Manager.** A Manager or Super Admin can still
   promote staff and delivery managers, but can never mint a peer. The rule inspects
   `newData.val()` to tell a promotion to the top two apart from an ordinary one.
3. **Deleting an order requires Manager or Owner.** The `/orders` node deliberately has **no
   parent `.write`** — a parent write cascades downwards and would have handed deletion to every
   operations role, because rules can only loosen, never tighten. The delete case
   (`!newData.exists()`) is therefore checked explicitly on `$orderId`.

`/siteContent` is writable by `owner` alone and is publicly readable so pages can render it.

> **Bootstrapping the first Owner:** because rule 1 above blocks self-promotion, the very first
> `owner` must be set **manually in the Firebase console** (`users/<uid>/role = "owner"`).
> After that, the Owner can promote anyone from **Admin → Staff & Roles**.

### Role resolution in the rules (important)

`database.rules.json` now accepts **either** source of truth for an operations role, so a
profile that says `"superadmin"` is enough on its own:

1. the legacy registry nodes — `admins/$uid`, `staff/$uid`, `deliveryManagers/$uid`, or
2. the profile field — `users/$uid/role` (`"superadmin" | "staff" | "delivery"`).

Source 2 is what the app reads (`VrindaAuth.getUserRole`, `requireAdminRole`) and what the
Admin → Staff & Roles table displays. Previously the two could disagree: a user whose profile
said `superadmin` but who had no `admins/$uid` row passed the UI gate and then got
`PERMISSION_DENIED` on **every** write (products, categories, coupons, settings, seo, banners,
blogs, role changes) — which is what used to leave the Catalog and Team tabs stuck on
"Loading ...". `VrindaAdmin.updateUserRole` keeps both sources in sync from now on.

**Publish the rules, then reload the portal:**

```bash
firebase deploy --only database
```

Two more one-time notes for a brand-new project:

- The first Super Admin still has to be bootstrapped in the Firebase console
  (`users/<uid>/role = "superadmin"`), because no client is allowed to write its own role.
- If `/products` and `/categories` are empty, open **Admin → Product Catalog** and press
  **⬇ Import sample catalog** (or just load any page while signed in as Super Admin — the
  seeder then fills the empty nodes from `assets/data/sample-data.js`). It never overwrites
  rows that already exist, so it is safe to re-run. After that the storefront reads products
  from Firebase; the JSON file is only an offline safety net.

### What the Super Admin portal writes where

| Portal action | RTDB node | Read by the storefront as |
| --- | --- | --- |
| Product Catalog (add/edit/delete) | `products/$id`, `categories/$id` | every product grid, product page, search, cart |
| Promotional Coupons (create/edit/delete) | `coupons/$CODE` | cart + checkout discount, free-delivery rules |
| Team & Roles (promote/reassign) | `users/$uid/role` + `admins` / `staff` / `deliveryManagers` | portal access everywhere |
| Store Settings (contact, thresholds) | `settings` | free-delivery threshold, shipping fee, cart totals, announcement bar, WhatsApp links |
| SEO meta tags | `seo` | homepage `<title>` + `<meta name="description">` |
| FAQ & Content | `faqs/$id` | homepage FAQ section (live, no reload needed) |
| Custom Studio requests | `customRequests/$uid/$requestId` (written by the customer) | status + quote back into the portal |

Product visibility: unticking **“Live on the storefront”** keeps a product in the admin
catalog (where you can still edit it) but hides it from every customer-facing read.
`VrindaCatalog.getAllProducts()` (admin) is unfiltered; `getProducts()` (storefront) skips
anything with `active: false`.

The Custom Studio "Gift" type collects a **gift name** from the customer; that name is
stored on the request, shown in the admin Custom Studio tab, and included in the WhatsApp
handoff message so fulfilment and the customer see the same name.

Saving Store Settings reports the real outcome — a denied write now says so (and points at
`firebase deploy --only database`) instead of claiming success.

---

## 6. Realtime Database Node Map

`database.rules.json` protects the following nodes:

| Node | Access |
| --- | --- |
| `users/$uid` | Owner read/write; Admins read all; role field only writable by Admins |
| `admins`, `staff`, `deliveryManagers` | Staff registries; only Super Admins write |
| `products`, `categories` | Public read; Admin-only write (catalog auto-seeds from `sample-data.js` when empty) |
| `reviews/$productId/$reviewId` | Public read; a verified shopper may only create/edit/delete their **own** review row (`userId == auth.uid`); Staff & Super Admins can moderate any review |
| `cart/$uid`, `wishlist/$uid` | Owner-only read/write (Phase 4) |
| `orders/$orderId` | Read: the order owner, Admins, Staff & Delivery Managers. Write: Admins/Staff/Delivery Managers, plus a customer creating a brand-new order stamped with their own `userId`. A customer may only additionally set the `cancellationStatus` / `cancellationRequestId` markers on their own order (Phase 4/5/6) |
| `userOrders/$uid` | Owner read/write (one cheap index read per customer); Admins, Staff & Delivery Managers read/write all (Phase 4/5/6) |
| `cancellationRequests/$requestId` | Read: request owner, Admins & Staff. Create: the requesting customer (their own `userOrders` entry must exist). Approve/reject: Admins only (Phase 5) |
| `adminNotifications` | Admin, Staff & Delivery Manager read; any authenticated user can append an alert (Phase 4/5) |
| `paymentSessions/$famgatewayOrderId` | Authenticated read/write — maps a FamGateway order to the created order so `payment-return.html` can recover it (Phase 4) |
| `checkoutDrafts/$uid` | Owner-only read/write — cross-device checkout recovery (Phase 4) |
| `customRequests/$uid` | Owner read/write (verified email required); Admins & Staff read all — Custom Studio designs |

> **Note:** Verified-email gates match the Phase 0 business rules — reviews and custom design
> submissions are rejected by the database itself if the customer has not verified their email.

---

## 7. Phase 5 — Order Tracking Data Model

The canonical 11-step flow lives in `js/order-service.js` (`STATUS` / `STATUS_FLOW` /
`TIMELINE_STEPS`) and is rendered by `VrindaCommerceUI.timelineHtml()`:

```
Order Placed → Payment Confirmed → Awaiting Customization → Customer Contacted →
Photos Received → Customization Confirmed → Production Started → Packed →
Assigned To Delivery → Out For Delivery → Delivered     (+ terminal: Cancelled)
```

An order record (`/orders/$orderId`) carries the tracking state:

```json
{
  "orderId": "VRH-260926-K7Q4",
  "status": "Photos Received",
  "cancellationStatus": "none",
  "cancellationRequestId": "-Nabc123",
  "statusHistory": [
    { "status": "Order Placed", "at": 1758880000000, "note": "Order placed & recorded in system" },
    { "status": "Payment Confirmed", "at": 1758880000050, "note": "Payment captured via FamGateway UPI (UTR: 4021...)" }
  ],
  "delivery": {
    "type": "local",
    "shippingMode": "express",
    "riderName": "Arun",
    "riderPhone": "9876500011",
    "vehicleNumber": "KA01 AB 1234",
    "eta": "Today, 6:30 pm",
    "courierName": "",
    "trackingNumber": "",
    "expectedDeliveryDate": "2026-10-02",
    "trackingUrl": "",
    "courierPhone": "",
    "updatedAt": 1758881111111
  }
}
```

- `delivery.type` is inferred at checkout — `local` for express shipping or metro cities
  (Bengaluru, Delhi NCR, Mumbai, Pune, Gurugram, Noida), otherwise `courier`.
- `statusHistory` is appended automatically by `VrindaOrders.updateOrderStatus()` (Phase 6 admin
  dashboards) and drives the timestamps shown inside the timeline.
- `VrindaOrders.updateDeliveryTracking(orderId, {...})` fills the rider/courier fields;
  delivery managers use this in Phase 6.

### Cancellation workflow (`/cancellationRequests`)

1. Customer taps **Request Cancellation** on `pages/orders.html` or the live tracker and picks a reason.
2. `VrindaOrders.submitCancellationRequest()` atomically writes the request, sets
   `orders/$orderId/cancellationStatus = "requested"`, mirrors it onto `userOrders/$uid` and raises an
   `adminNotifications` alert.
3. The Super Admin calls `approveCancellationRequest()` (order becomes `Cancelled`) or
   `rejectCancellationRequest()` in Phase 6 — customers then see the outcome badge and can
   deep-link to WhatsApp for the refund status.

### Manual verification checklist

1. Place a test order → the receipt (`pages/order-success.html`) shows the timeline at **Step 1 of 11**.
2. Manually edit `/orders/$orderId/status` in the Firebase console to `Production Started` →
   the receipt and `pages/orders.html` update live without a refresh (see the green “Live status
   updates on” flag).
3. Open `pages/order-tracking.html?orderId=VRH-...` → the tracker resolves the order, shows the
   timeline, the rider card (metro/express) or courier card, and the WhatsApp action buttons.
4. Tap **Request Cancellation** → `/cancellationRequests/$requestId` appears with `status: "pending"`
   and the order shows the “Cancellation request received” notice.
5. Try to track another customer's order ID → the read is denied by the rules and the page shows
   the “We could not find that order” state.

