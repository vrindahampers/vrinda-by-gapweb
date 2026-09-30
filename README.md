# vrindahampers 🎁

Personalized gifting e-commerce platform crafted for unforgettable moments.
Specializing in handcrafted bouquets, luxury hampers, customized keychains, polaroids, handwritten letters, and bespoke gifts.

Designed as a high-performance, mobile-first, static Progressive Web App (PWA) ready to be hosted on **GitHub Pages**.

---

## 📁 Repository & Folder Structure

```
vrindahamp/
├── assets/                     # Static media and local data
│   ├── images/                 # Product photography, banners, avatars, placeholders
│   ├── icons/                  # SVG icons: favicon.svg brand mark, app icons
│   └── data/
│       └── sample-data.js      # Local catalog seed: categories, occasions, products, testimonials, gallery, FAQ
├── css/                        # Design system & styles
│   ├── variables.css           # Design tokens: palette, typography, glassmorphism, spacing, shadows
│   ├── main.css                # Global resets, base tags, utility classes, layout grid
│   └── components.css          # Cards, buttons, badges, modals, drawers, form elements, reviews
├── js/                         # Frontend Vanilla JS modules
│   ├── firebase-config.js      # Firebase project keys + compat SDK bootstrap
│   ├── auth.js                 # AuthManager: email/password + Google, profile sync, action gating
│   ├── catalog-service.js      # VrindaCatalog: RTDB products/categories/reviews + local fallback & seeding
│   ├── layout.js               # Header, mobile drawer, search modal, auth-gated action handling, footer
│   ├── main.js                 # Homepage rendering, carousel/sliders, FAQ accordion, lazy loading
│   ├── category-controller.js  # Category/catalog listing: filter chips, search, sort, custom banner
│   ├── product-controller.js   # Product detail: SEO/OG tags, breadcrumbs, related items, reviews
│   ├── custom-controller.js    # Custom Studio configurator: live pricing, WhatsApp handoff, design submit
│   ├── 404-router.js           # GitHub Pages pretty-URL fallback router
│   ├── login-controller.js     # Login/signup/Google + email verification flows
│   ├── profile-controller.js   # Customer profile, address book, verification status
│   ├── store-service.js        # VrindaStore: RTDB cart/wishlist sync, coupons, free-shipping totals
│   ├── commerce-ui.js          # Shared commerce UI: money/dates, notices, summary rows, 11-step timeline, delivery card
│   ├── famgateway.js           # FamGateway UPI: create order, dynamic QR, verify payment, simulation mode
│   ├── order-service.js        # VrindaOrders: 11-step statuses, order creation, live listeners, WhatsApp deep links, cancellation requests
│   ├── cart-controller.js      # Cart page: RTDB lines, qty steppers, coupon apply
│   ├── wishlist-controller.js  # Wishlist page: move to cart, remove, share on WhatsApp
│   ├── checkout-controller.js  # Checkout: address capture, gifting details, draft persistence, payment handoff
│   ├── payment-return-controller.js # FamGateway return: verify payment → create order → redirect
│   ├── order-success-controller.js  # Receipt: items, payment reference, live 11-step timeline, WhatsApp handoff
│   ├── orders-controller.js    # My Orders: real-time index, expandable timeline + delivery card, cancellation requests
│   └── order-tracking-controller.js # Live tracker: lookup by order ID, real-time timeline, rider/courier tracking
├── js/admin-service.js         # VrindaAdmin: role/RBAC helpers, shared admin data access
├── js/admin-super-controller.js     # Super Admin portal: dashboard, orders, cancellations, catalog, reviews, coupons, staff roles, settings
├── js/admin-staff-controller.js     # Staff portal: order handling, WhatsApp milestone checklists, rider assignment, review moderation
├── js/admin-delivery-controller.js  # Delivery portal: live dispatch queue, forward-only status advances, completed archive, tracking
├── category/index.html         # Catalog listing route (/?slug=bouquets)
├── product/index.html          # Product detail route (/?id=prod-001&slug=...)
├── custom/index.html           # Custom configurator route (/?type=bouquet)
├── pages/                      # Customer-facing subpages (login, profile, cart, wishlist, checkout, payment-return, order-success, orders, order-tracking)
├── admin/                      # Role-gated admin dashboards
│   ├── index.html              # Super Admin portal (role: superadmin)
│   ├── staff.html              # Staff Admin portal (role: staff)
│   └── delivery.html           # Delivery Manager portal (role: delivery)
├── 404.html                    # Smart fallback router for pretty URLs (SEO)
├── firebase.json               # Firebase CLI config (database rules target; no hosting block)
├── database.rules.json         # Realtime Database security rules
├── site.webmanifest            # PWA manifest (installable app metadata + shortcuts)
├── robots.txt                  # Crawler directives (private routes disallowed)
├── sitemap.xml                 # Public route index for search engines
├── FIREBASE_SETUP.md           # Firebase project + rules setup & CLI deploy guide
├── ROUTING_AND_SEO.md          # Static routing architecture & SEO metadata strategy
├── index.html                  # Complete 14-section homepage
└── README.md                   # Project documentation & phase roadmap
```

---

## 🎨 Design System Overview

- **Color Palette**: Luxury rose-blush hues (`#e88d9c`, `#b74d63`), warm cream accents (`#fdfbf7`, `#f9f5f0`), rich slate text (`#1f1d24`, `#58515c`), and subtle gold luxury highlights (`#d4af37`).
- **Typography Scale**: High-end serif editorial headings (`Playfair Display`, `Cormorant Garamond`) paired with ultra-clean modern sans body (`Plus Jakarta Sans`, `Inter`).
- **Glassmorphism**: Crisp frosted glass components (`backdrop-filter: blur(12px)`) with delicate border highlights for elevated luxury aesthetic.
- **Accessibility & Performance**: Target 90+ Lighthouse score, semantic HTML5, lazy-loaded images with fallback SVG placeholders, ARIA landmarks, and touch-optimized responsive tap targets.

---

## 🚀 Phases Roadmap

1. **Phase 1: Foundation (Completed)** — Clean GitHub Pages architecture, comprehensive CSS design system, dynamic header/footer partials, 14-section complete homepage with rich sample catalog and responsive UX.
2. **Phase 2: Firebase Setup & Authentication (Completed)** — Firebase Auth (Email/Pass + Google), session persistence, email verification gate, RTDB user/admin security rules, customer profile.
3. **Phase 3: Catalog & Custom Configurators (Completed)** — Filterable/searchable catalog (`/category/`), SEO-rich product detail page (`/product/`) with reviews & related items, Custom Studio configurators for Bouquet, Hamper, Keychain, Polaroids and Handwritten Letter (`/custom/`), plus the GitHub Pages pretty-URL fallback router (`404.html`).
4. **Phase 4: Cart, Wishlist, Checkout & FamGateway (Completed)** — RTDB synced cart/wishlist, checkout with occasion notes and resumable drafts, FamGateway UPI integration with dynamic QR + simulation fallback, order creation into `/orders`, `/userOrders`, `/adminNotifications` and `/paymentSessions`.
5. **Phase 5: Order Tracking & WhatsApp (Completed)** — Canonical 11-step tracking flow (Order Placed → Payment Confirmed → Awaiting Customization → Customer Contacted → Photos Received → Customization Confirmed → Production Started → Packed → Assigned To Delivery → Out For Delivery → Delivered, plus terminal Cancelled), shared visual timeline component, real-time `/orders` and `/userOrders` listeners, dedicated live tracker page (`pages/order-tracking.html`), local-rider vs. courier delivery tracking, seven contextual WhatsApp deep-link templates, and the customer cancellation request workflow (`/cancellationRequests`) reviewed by the Super Admin.
6. **Phase 6: Multi-Role Admin Dashboards (Completed)** — Super Admin (`/admin/index.html`), Staff Admin (`/admin/staff.html`) and Delivery Manager (`/admin/delivery.html`) portals behind RTDB-enforced RBAC; shared `js/admin-service.js` role gate, dashboard KPIs, order + cancellation queues, catalog/coupon/review management, staff role assignment, WhatsApp milestone checklists, rider assignment, a live dispatch board with forward-only status advances, and the completed-delivery archive.
7. **Phase 7: SEO, Blog & Growth** — Schema markup (JSON-LD), sitemap, SEO landing pages, blog module, coupon engine, and marketing rails.

> **Shipped in the admin portal since Phase 6:** the Order Operations ledger names a refused
> or silent database read instead of sitting on "Loading orders ledger..." (with a Retry that
> re-subscribes, and a 12 second watchdog for a blocked socket); filters by search, status,
> unverified payments and a placed-date range with a "This month" preset; exports exactly the
> rows in view as a CSV named after the range; prints a packing slip per order — with the gift
> note below it — via `js/print-service.js` + `css/print.css`; and supports bulk selection for
> **Mark Packed** and **Print slips**. The dashboard adds Today / 7 day / 30 day revenue cards
> and an unverified-payments badge on the Orders tab. All of it is pinned by the
> dependency-free harnesses in `tests/` (`tests/README.md`).

> **Shipped early in Phase 7 prep:** `site.webmanifest` (installable PWA metadata + shortcuts),
> `robots.txt`, `sitemap.xml` and the SVG brand favicon (`assets/icons/favicon.svg`), all wired
> into every page head. Replace the `YOUR-DOMAIN` placeholders in `robots.txt` and
> `sitemap.xml` with your deployed origin before submitting to Search Console.

---

## 🚢 Deployment (GitHub Pages + Firebase RTDB)

The site itself is pure static output — push to GitHub and enable **Pages** in the repo settings.
The database half needs the security rules published once:

```bash
firebase login
firebase deploy --only database      # .firebaserc pins vrindahampers-db + firebase.json points at database.rules.json
```

Then bootstrap the first Super Admin manually (see `FIREBASE_SETUP.md` §5): set
`users/<uid>/role = "superadmin"` and `admins/<uid> = true` in the Firebase Console. Until the
rules are deployed, the three admin portals will correctly report `PERMISSION_DENIED` instead of
leaking data.

---

## 🔗 Static Routing, SEO & Auth Gating

- **Directory-per-slug routes**: `/category/?slug=bouquets`, `/product/?id=prod-001&slug=velvet-midnight-rose-bouquet`, `/custom/?type=hamper`.
- **Pretty URLs**: `404.html` + `js/404-router.js` resolve paths like `/bouquets/velvet-midnight-rose-bouquet` or `/custom/bouquet` to the correct static route, and lock the deployment root with a `<base>` tag so assets load even on deep 404 URLs. See `ROUTING_AND_SEO.md`.
- **Dynamic SEO**: product and category controllers inject `<title>`, `meta[name="description"]`, canonical, and OpenGraph/product price tags at runtime.
- **Auth gating**: cart, wishlist, tracking, reviews and custom design submission require login (reviews and design submissions additionally require a verified email). Browsing the full catalog is always public. `js/layout.js` handles gated triggers and hands verified actions to page controllers via the `vrinda:gated-action` DOM event.

---

## 🧪 Tests (dependency-free)

`tests/` holds small Node harnesses that boot the real admin portal controllers
behind a stub DOM and drive the Realtime Database feeds by hand — 105 checks
across the feed contract (`js/order-service.js`), the dashboard numbers
(`js/admin-service.js`), and the three operations portals (Super Admin ledger,
Staff queue, Delivery hub).

```bash
node tests/run-all.cjs     # everything; exits 1 if any check fails
```

They exist because this class of bug cannot be caught by a syntax check: a bad
helper call inside one row template threw mid-`innerHTML`, so the ledger sat on
"Loading orders ledger..." for owners only, while staff saw a healthy page. See
`tests/README.md`.
