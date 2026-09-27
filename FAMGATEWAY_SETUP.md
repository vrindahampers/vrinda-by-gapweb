# FamGateway Setup — Going Live with Real UPI Payments

The checkout page shows **🧪 Payment simulation mode** until the two Cloud
Function proxy URLs are filled in `js/famgateway.js`. The merchant API key and
UPI id alone never flip that switch — and the key must **never** live in
client-side JavaScript (FamGateway's own docs: "Never expose your secret API
key in client-side JavaScript").

Everything you need is now in this repo:

```
functions/index.js
  createFamGatewayOrder  → server-side proxy for /api/create-order
  verifyFamGatewayOrder  → server-side proxy for /api/verify-order.php
  famgatewayWebhook      → instant payment capture → /paymentSessions/{orderId}
```

## 1. Prerequisites

- Firebase **Blaze (pay-as-you-go)** plan — required for Cloud Functions.
- `firebase-tools` logged in: `firebase login`
- Your FamGateway merchant API key (`fam_...`) — the one previously pasted
  into `js/famgateway.js`. **Rotate it** if the site was ever public: it was
  committed to git history and shipped in client JS.

## 2. Install function dependencies

```bash
cd functions
npm install
cd ..
```

## 3. Store the API key as a secret

```bash
firebase functions:secrets:set FAMGATEWAY_API_KEY
# paste: fam_...
```

## 4. Deploy the functions

```bash
firebase deploy --only functions
```

Note the three printed URLs (project id: `vrindahampers-db`, region `us-central1`):

```
https://us-central1-vrindahampers-db.cloudfunctions.net/createFamGatewayOrder
https://us-central1-vrindahampers-db.cloudfunctions.net/verifyFamGatewayOrder
https://us-central1-vrindahampers-db.cloudfunctions.net/famgatewayWebhook
```

## 5. Paste the URLs into `js/famgateway.js`

```js
proxyCreateOrderUrl: 'https://us-central1-vrindahampers-db.cloudfunctions.net/createFamGatewayOrder',
proxyVerifyOrderUrl:  'https://us-central1-vrindahampers-db.cloudfunctions.net/verifyFamGatewayOrder',
webhookUrl:           'https://us-central1-vrindahampers-db.cloudfunctions.net/famgatewayWebhook',
```

The moment `proxyCreateOrderUrl` and `proxyVerifyOrderUrl` are non-empty, the
checkout banner switches to **🔒 FamGateway UPI checkout is live** — no other
config required.

## 6. Tell FamGateway about the webhook

If your FamGateway dashboard has a **Webhook URL** field, paste the
`famgatewayWebhook` URL there. (The client also attaches it per-order via
`webhook_url` when creating a session.) The webhook never trusts the payload —
it re-verifies each order against FamGateway with the server-side key before
marking `/paymentSessions/{orderId}` as paid.

## 7. Deploy the site

```bash
firebase deploy
```

## How the flow works

1. Customer pays → browser calls **createFamGatewayOrder** (Firebase ID token
   required) → function calls FamGateway with the secret key → dynamic UPI
   session/order id returned.
2. Customer completes payment on FamGateway's hosted page → returns to
   `pages/payment-return.html`.
3. Return page calls **verifyFamGatewayOrder** (same ID-token auth) → on
   `success`, the order is written to `/orders` + `/userOrders`.
4. FamGateway also hits **famgatewayWebhook** for instant capture.

Simulation mode (no proxy URLs) still works as a rehearsal: it auto-verifies
and creates a real order, with no money moving. Keep it for local testing only.
