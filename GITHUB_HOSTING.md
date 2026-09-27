# Hosting vrindahampers on GitHub Pages

The site is a **static site with only relative paths** — no build step, no bundler,
no absolute `/...` links. So GitHub Pages works as-is at
`https://<your-username>.github.io/<repo-name>/`.

---

## ⚠️ Do this FIRST: the merchant key must not be committed

You are staying on the **free (Spark) plan**, so there are no Cloud Functions and
the browser has to hold the key to create payment sessions. Rather than committing
it, the deploy workflow **injects it from a GitHub Actions secret into the
published copy only** — the repository and its history stay key-free.

1. **GitHub → Settings → Secrets and variables → Actions → New repository secret**,
   name `FAMGATEWAY_API_KEY`, value `<YOUR-FAMGATEWAY-MERCHANT-KEY>`
2. Push. The workflow fails with a clear message if the secret is missing, and also
   fails if a key was ever committed into `js/famgateway.js`.
3. **Rotate the key once in the FamPay dashboard** and update the secret — the old
   key exists in this repository's earlier commits, so treat it as burned.

For **local** testing, don't edit the file — put the key in your own browser once
and take real payments immediately:

```js
// paste in the browser console on 127.0.0.1:5500, then reload the page
localStorage.setItem('vrinda:famgateway-key', 'fam_…your-key…');
```

It is read **only** when the file has no key and no proxy is configured, so the
deployed site (which gets the key injected at build time) always ignores it.

### What "Spark" means day to day

Checkout takes real payments, but FamGateway's verification endpoints send no CORS
headers, so no browser can auto-confirm a capture. Every order is therefore created
with `payment.verified: false` and reconciled by you:

- **Admin → Orders Management → tick "Unverified payments only"** to see exactly
  the orders needing attention.
- Match the amount / UTR in your **FamPay dashboard**.
- Click **✓ Mark Paid** — the badge clears and the order is confirmed.

Everything else (catalog, coupons, FAQs, settings, announcement bar, RBAC, custom
studio, hosting) works fully on Spark. If you ever upgrade to Blaze, deploying the
two functions in `functions/` makes verification automatic and the manual step
disappears.

---

## 1. Create the repository

```bash
cd /Users/ishikadaksh/Desktop/vrindahamp
git remote add origin https://github.com/<your-username>/<repo-name>.git
git push -u origin main
```

On GitHub: **Settings → Pages → Source: GitHub Actions**. The workflow publishes
on every push to `main`; you can also trigger it manually with **Run workflow**.

The site goes live at `https://<your-username>.github.io/<repo-name>/` (usually
within a minute or two). Custom domains work too: add a `CNAME` file containing
just your domain — the workflow keeps serving the same files.

---

## 2. Add the domain to Firebase (required for sign-in)

Firebase Auth rejects any host that is not authorised, so sign-in on the new domain
fails until you add it:

**Firebase Console → Authentication → Settings → Authorized domains → Add domain**

```
<your-username>.github.io
```

The login page now names the exact host to add whenever this bites you (it prints
`Error code: auth/unauthorized-domain · host: ...`).

---

## 3. Fill in the real domain for SEO

`robots.txt` and `sitemap.xml` still contain the `YOUR-DOMAIN` placeholder:

```bash
# find-and-replace with your real origin, e.g. https://you.github.io/vrindahamp
sed -i '' 's|https://YOUR-DOMAIN|https://<your-username>.github.io/<repo-name>|g' robots.txt sitemap.xml
git commit -am "SEO: real domain" && git push
```

---

## What works as-is on GitHub Pages

| Area | Why it is fine |
| --- | --- |
| Pretty URLs (`/category/`, `/product/`, `/custom/`, `/pages/`) | `404.html` rewrites the base from `window.location.pathname`, which is how static hosts emulate them |
| Cart, orders, coupons, catalog, FAQ, settings | All read/write live in Firebase Realtime Database — nothing is server-side on GitHub |
| Payments | Created through the Cloud Function proxy; verified server-side there too |
| Header/footer links, product URLs | Computed from relative paths by `js/layout.js` |
| FamGateway return URL | Resolved from `js/famgateway.js`'s own script URL, so it is correct under a `/repo/` sub-path (covered by a test) |

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Workflow fails: *"contains a live FamGateway merchant key"* | Working as designed — do the key migration above. |
| Style/images 404 | Nothing should be absolute; if you added one, make it relative. |
| Deep link like `/category/` 404s | `404.html` must stay at the repository root. |
| Sign-in fails on the new domain | Add `<your-username>.github.io` to Firebase Authorized domains. |
| Deploy doesn't trigger | Confirm the workflow is on the **default branch** and Pages → Source is **GitHub Actions**. |
| `functions/` visible as a static page | It is excluded from the upload step. |
