# FamGateway Setup — Going Live with Real UPI Payments

> **⚠️ READ THIS FIRST — a browser can create payments but cannot verify them.**
>
> Measured against the live gateway (27 Sep 2026), from `http://127.0.0.1:5500`:
>
> | Endpoint | Preflight | CORS header | Callable from a browser? |
> | --- | --- | --- | --- |
> | `POST /api/create-order` | 200 | `access-control-allow-origin: *` | ✅ **yes** |
> | `GET /api/verify-order.php` | **401** | none | ❌ no |
> | `GET /api/checkout-status.php` | 200 | none | ❌ response unreadable |
>
> So in **direct mode** (key in `js/famgateway.js`) checkout works, but no browser
> can confirm a capture — the return page fails with “Load failed” / “Failed to
> fetch”. That is a property of the gateway, not of this code.
>
> **To go live properly you need the verification proxy** (already written in
> `functions/index.js`):
>
> ```bash
> firebase functions:secrets:set FAMGATEWAY_API_KEY   # paste: fam_ea93a78892a4fe519445d40a71d24f80e1f792cb
> firebase deploy --only functions
> ```
>
> Then paste the deployed URLs into `js/famgateway.js`:
>
> ```js
> proxyCreateOrderUrl: 'https://us-central1-<project>.cloudfunctions.net/createFamGatewayOrder',
> proxyVerifyOrderUrl: 'https://us-central1-<project>.cloudfunctions.net/verifyFamGatewayOrder',
> webhookUrl:         'https://us-central1-<project>.cloudfunctions.net/famgatewayWebhook',  // optional
> ```
>
> With `proxyVerifyOrderUrl` filled, `Gateway.usesProxy()` turns true and the return
> page verifies server-side, creating orders with `payment.verified: true`. You can
> then delete the key from `js/famgateway.js` if you prefer.
>
> **Until that is deployed**, payments still work and are never lost: the return
> page books the order with `payment.verified: false`, the admin table shows a red
> **“⚠️ Payment unverified”** badge with the UTR, and **✓ Mark Paid** records your
> manual confirmation from the FamPay dashboard.


## TL;DR — your key in `js/famgateway.js` IS the switch

Your merchant key already sits in `js/famgateway.js`:

```js
window.VRINDA_FAMGATEWAY_CONFIG = {
  apiKey: 'fam_...',                 // your key — kept in this file (your chosen setup)
  merchantUpiId: 'ishikavh@fam',
  ...
};
```

As soon as `apiKey` is non-empty, the checkout banner flips to
**🔒 FamGateway UPI checkout is live** — no Cloud Functions, no secrets, no
extra URLs to paste. The browser then talks to FamGateway directly:

1. **Create** — browser → `POST https://famgateway.in/api/create-order` with
   the key → dynamic UPI session + order id.
2. **Pay** — customer is redirected to FamGateway's hosted `/pay.php` page and
   pays by UPI (QR / intent / UPI id).
3. **Return** — `pages/payment-return.html?order_id=...` polls the public-safe
   `GET /api/checkout-status.php` (no key needed) and calls
   `GET /api/verify-order.php` (with the key) for the authoritative UTR/status.
4. **Record** — the session is mirrored in `/paymentSessions/{orderId}`; a
   successful verification writes the real order to `/orders` + `/userOrders`.

**Your entire go-live checklist:**

1. Confirm `apiKey` in `js/famgateway.js` holds your current `fam_...` key and
   `merchantUpiId` is correct.
2. `firebase deploy`
3. Run one real ₹1 test payment end to end (create → pay → order marked paid).

That's it — nothing else to configure.

## Honest trade-off of key-in-file

Anything in a public JS file is readable by anyone who views the page source —
so your API key is public too (it also appears in this repo's git history). You
have accepted that for simplicity. Rotate the key from the FamGateway dashboard
any time it becomes a concern, or move to the optional proxy setup below, which
keeps the key on a server so the browser never sends it.

## Optional hardening: Cloud Function proxies (not required)

`/functions` ships with three ready-made Cloud Functions you can adopt later:

```
functions/index.js
  createFamGatewayOrder  → proxy for POST /api/create-order
  verifyFamGatewayOrder  → proxy for GET  /api/verify-order.php
  famgatewayWebhook      → instant capture → /paymentSessions/{orderId}
```


### If/when you want the proxy path

1. **Prerequisites** — Firebase **Blaze** plan and `firebase login`.
2. **Install dependencies**

   ```bash
   cd functions && npm install && cd ..
   ```
3. **Store the key as a secret** (get it out of the browser)

   ```bash
   firebase functions:secrets:set FAMGATEWAY_API_KEY
   # paste: fam_...
   ```
4. **Deploy the functions**

   ```bash
   firebase deploy --only functions
   ```

   Note the three printed URLs (project `vrindahampers-db`, region
   `us-central1`):

   ```
   https://us-central1-vrindahampers-db.cloudfunctions.net/createFamGatewayOrder
   https://us-central1-vrindahampers-db.cloudfunctions.net/verifyFamGatewayOrder
   https://us-central1-vrindahampers-db.cloudfunctions.net/famgatewayWebhook
   ```
5. **Paste the URLs into `js/famgateway.js`**

   ```js
   proxyCreateOrderUrl: 'https://us-central1-vrindahampers-db.cloudfunctions.net/createFamGatewayOrder',
   proxyVerifyOrderUrl:  'https://us-central1-vrindahampers-db.cloudfunctions.net/verifyFamGatewayOrder',
   webhookUrl:           'https://us-central1-vrindahampers-db.cloudfunctions.net/famgatewayWebhook',
   ```

   The moment `proxyCreateOrderUrl` **and** `proxyVerifyOrderUrl` are
   non-empty, create/verify automatically route through your server and the
   key in this file is no longer sent from the browser.
6. **Webhook** — if your FamGateway dashboard has a Webhook URL field, paste
   the `famgatewayWebhook` URL there. The webhook never trusts the payload; it
   re-verifies each order with the server-side key before marking the session
   paid. Without it, verification still works via return-page polling.
7. **Deploy the site** — `firebase deploy`

## Simulation mode

With no key and no proxy URLs configured, the adapter mints a local
`fg_SIM_*` session and auto-verifies it — a full rehearsal where no money
moves but a real order is still created. Clear `apiKey` to go back to it for
local testing.

## How the flow works (proxy path)

1. Customer pays → browser calls **createFamGatewayOrder** (Firebase ID token
   required) → function calls FamGateway with the secret key → session/order
   id returned.
2. Customer completes payment on FamGateway's hosted page → returns to
   `pages/payment-return.html`.
3. Return page calls **verifyFamGatewayOrder** (same ID-token auth) → on
   `success`, the order is written to `/orders` + `/userOrders`.
4. FamGateway also hits **famgatewayWebhook** for instant capture.
