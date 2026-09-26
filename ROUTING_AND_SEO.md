# GitHub Pages Static Routing & SEO-friendly URL Patterns

On **GitHub Pages**, there is no server-side URL rewriting engine (like Apache `.htaccess` or Nginx `try_files`). 

To achieve clean, SEO-friendly, canonical URLs without hash fragments (`#`) or query params, **vrindahampers** uses a **dual-layer static routing architecture**:

---

## 1. Directory-per-Slug Pattern (Physical Clean URLs)
Every category and custom configurator has its own dedicated directory with an `index.html` file:

- `/category/index.html` (resolves at `/category/?slug=bouquets` or canonical sub-paths)
- `/product/index.html` (resolves at `/product/?id=prod-001&slug=velvet-midnight-rose-bouquet`)
- `/custom/index.html` (resolves at `/custom/?type=bouquet`)

When a user visits `https://<username>.github.io/vrindahampers/category/?slug=bouquets`:
- The browser URL stays clean and canonical.
- Static web hosts serve `/category/index.html` directly with HTTP 200.

---

## 2. GitHub Pages 404 Fallback Router (`404.html`)
To support pretty URLs like:
- `/bouquets/velvet-midnight-rose-bouquet`
- `/hampers/royal-romance-luxury-hamper`
- `/custom/bouquet`

We provide a custom **`404.html` SPA router**:
1. When GitHub Pages encounters a path without a physical folder (e.g. `/bouquets/red-rose-bouquet`), it serves `404.html`.
2. `404.html` reads `window.location.pathname`, detects whether it matches a known category, product slug, or custom builder, and seamlessly redirects or loads the appropriate view using `sessionStorage` or instant client-side pushState, ensuring search engines and direct links land precisely on the right gift page.

---

## 3. SEO Metadata & Canonical Tags
Every generated product and category page dynamically populates:
- `<title>` with Product Name and brand suffix (`| vrindahampers`)
- `<meta name="description">` with product description
- `<meta property="og:title">`, `<meta property="og:image">`, `<meta property="og:price:amount">`
- Breadcrumb navigation (`Home > Category > Product Name`)

---

## 4. URL → Route Resolution Map

| Incoming pretty URL | Resolved static route |
| --- | --- |
| `/<repo>/bouquets` | `/<repo>/category/?slug=bouquets` |
| `/<repo>/bouquets/velvet-midnight-rose-bouquet` | `/<repo>/product/?id=prod-001&slug=velvet-midnight-rose-bouquet` |
| `/<repo>/product/velvet-midnight-rose-bouquet` | `/<repo>/product/?slug=velvet-midnight-rose-bouquet` |
| `/<repo>/velvet-midnight-rose-bouquet` | `/<repo>/product/?slug=velvet-midnight-rose-bouquet` |
| `/<repo>/custom/hamper` | `/<repo>/custom/?type=hamper` |
| `/<repo>/totally-unknown` | Friendly suggestions page (Home / Catalog / WhatsApp) — **no redirect loop** |

### Root resolution on deep 404 URLs
GitHub Pages serves `404.html` **at the requested URL** (e.g. `/<repo>/bouquets/red-rose`),
which would break relative asset paths. `404.html` therefore runs a tiny inline script that
derives the deployment root (first known route keyword, category slug or asset folder wins;
otherwise the first path segment is treated as the repo root) and writes it into a `<base href>`
tag **before** any stylesheet or script is requested. `js/404-router.js` uses the exact same
root-resolution rule so redirect targets and in-page suggestion links always stay absolute.

---

## 5. Loop Safety & Analytics Hooks
- The router never redirects to the current URL (`target.url !== pathname + search`) and never
  redirects to a path that would 404 again — every target is a real static directory.
- The refused/original path is stored in `sessionStorage` under `vrinda:lastMiss` so a future
  analytics hook can surface broken inbound links.
