# Hosting vrindahampers on GitHub Pages

The site is a **static site with only relative paths** — no build step, no bundler,
no absolute `/...` links. So GitHub Pages works as-is at
`https://<your-username>.github.io/<repo-name>/`.

---

## ⚠️ Do this FIRST: get the merchant key out of the repo

`js/famgateway.js` currently contains your **live FamGateway merchant key**. A
GitHub repository is readable by anyone, so pushing it as-is would publish a
credential that can create and query real orders on your account. The deploy
workflow **refuses to publish** while it finds one, and tells you what to do.

Move the key to the server (this is also what fixes payment verification, because
FamGateway's `verify-order.php` sends no CORS headers and no browser can call it):

```bash
cd /Users/ishikadaksh/Desktop/vrindahamp
firebase login                                                  # one-time
firebase functions:secrets:set FAMGATEWAY_API_KEY=fam_ea93a78892a4fe519445d40a71d24f80e1f792cb
firebase deploy --only database,functions
```

Then in `js/famgateway.js`:

```js
proxyCreateOrderUrl: 'https://us-central1-vrindahampers-db.cloudfunctions.net/createFamGatewayOrder',
proxyVerifyOrderUrl: 'https://us-central1-vrindahampers-db.cloudfunctions.net/verifyFamGatewayOrder',
webhookUrl:         'https://us-central1-vrindahampers-db.cloudfunctions.net/famgatewayWebhook', // optional
apiKey: '',   // ← blank this out; the key now lives in Secret Manager
```

Fill **both** proxy URLs: `usesProxy()` only returns true when they are both set,
and verification must go through the server. The `firebase deploy --only database`
in the same command also publishes the pending security-rule fixes (admin Team
tab, Custom Studio tab, FAQ writes, cancellation queue).

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
