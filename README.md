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
│   ├── icons/                  # SVG icons, favicon, app icons
│   └── data/                   # Initial local JSON/JS sample dataset
├── css/                        # Design system & styles
│   ├── variables.css           # Design tokens: palette, typography, glassmorphism, spacing, shadows
│   ├── main.css                # Global resets, base tags, utility classes, layout grid
│   └── components.css          # Cards, buttons, badges, modals, drawers, form elements
├── js/                         # Frontend Vanilla JS modules
│   ├── sample-data.js          # Sample catalog items, categories, reviews, FAQ, gallery
│   ├── layout.js               # Header, mobile drawer, search modal, footer injector & active states
│   └── main.js                 # Homepage rendering, carousel/sliders, FAQ accordion, lazy loading
├── pages/                      # Customer-facing subpages (catalog, about, contact, etc.)
├── admin/                      # Role-gated admin dashboards (Super Admin, Staff, Delivery)
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
2. **Phase 2: Firebase Setup & Authentication** — Firebase Auth (Email/Pass + Google), session persistence, email verification gate, RTDB user/admin security rules, customer profile.
3. **Phase 3: Catalog & Custom Configurators** — Filterable catalog, product detail page, custom configurators (Bouquet, Hamper, Keychain, Polaroids, Handwritten Letter), SEO static routing.
4. **Phase 4: Cart, Wishlist, Checkout & FamGateway** — RTDB synced cart/wishlist, checkout with occasion notes, FamGateway payment integration.
5. **Phase 5: Order Tracking & WhatsApp** — 11-step visual tracking timeline, WhatsApp deep-link generation, courier/local delivery tracking, customer cancellation request workflow.
6. **Phase 6: Multi-Role Admin Dashboards** — Super Admin, Staff Admin, and Delivery Manager portals with role-based access control and order checklists.
7. **Phase 7: SEO, Blog & Growth** — Schema markup (JSON-LD), sitemap, SEO landing pages, blog module, coupon engine, and marketing rails.
