/**
 * vrindahampers - Sample Data Store (Phase 1 Placeholder Data)
 * Categories, Occasions and Products
 */

window.VRINDA_DATA = {
  categories: [
    {
      id: 'bouquets',
      name: 'Handcrafted Bouquets',
      slug: 'bouquets',
      count: '18 Designs',
      image: 'https://images.unsplash.com/photo-1561181286-d3fee7d55364?auto=format&fit=crop&w=700&q=80',
      description: 'Everlasting crocheted and velvet floral blooms curated with eternal love.'
    },
    {
      id: 'hampers',
      name: 'Luxury Hampers',
      slug: 'hampers',
      count: '24 Curations',
      image: 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&w=700&q=80',
      description: 'Bespoke gift boxes filled with premium treats, candles, and keepsakes.'
    },
    {
      id: 'keychains',
      name: 'Custom Keychains',
      slug: 'keychains',
      count: '15 Styles',
      image: 'https://images.unsplash.com/photo-1614036417651-efe5912149d8?auto=format&fit=crop&w=700&q=80',
      description: 'Acrylic, resin, and metallic personalized charms engraved to perfection.'
    },
    {
      id: 'polaroids',
      name: 'Polaroids & Frames',
      slug: 'polaroids',
      count: '12 Sets',
      image: 'https://images.unsplash.com/photo-1526047932273-341f2a7631f9?auto=format&fit=crop&w=700&q=80',
      description: 'Vintage mini retro prints, photo strips, and glowing memory glass frames.'
    },
    {
      id: 'handwritten-letters',
      name: 'Handwritten Letters',
      slug: 'handwritten-letters',
      count: '8 Formats',
      image: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format&fit=crop&w=700&q=80',
      description: 'Calligraphy parchment scrolls sealed with hot wax and royal stamp.'
    },
    {
      id: 'personalized-gifts',
      name: 'Bespoke Keepsakes',
      slug: 'personalized-gifts',
      count: '30+ Creations',
      image: 'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&w=700&q=80',
      description: 'One-of-a-kind treasures customized with names, dates, and secret codes.'
    }
    ,
    {
      id: 'birthday-gifts',
      name: 'Birthday Gifts',
      slug: 'birthday-gifts',
      count: '25 Curations',
      image: 'https://images.unsplash.com/photo-1513151233558-d860c5398176?auto=format&fit=crop&w=700&q=80',
      description: 'Make milestone birthday moments unforgettable with customized gift boxes and blooms.'
    },
    {
      id: 'anniversary-gifts',
      name: 'Anniversary Gifts',
      slug: 'anniversary-gifts',
      count: '20 Curations',
      image: 'https://images.unsplash.com/photo-1518199266791-5375a83190b7?auto=format&fit=crop&w=700&q=80',
      description: 'Romantic milestones commemorated with eternal velvet flowers, letters, and custom photo plaques.'
    },
    {
      id: 'valentines-gifts',
      name: "Valentine's Gifts",
      slug: 'valentines-gifts',
      count: '30 Curations',
      image: 'https://images.unsplash.com/photo-1518895949257-7621c3c786d7?auto=format&fit=crop&w=700&q=80',
      description: 'Soul-stirring romantic expressions designed with everlasting crimson blooms and intimate notes.'
    },
    {
      id: 'friendship-gifts',
      name: 'Friendship Gifts',
      slug: 'friendship-gifts',
      count: '15 Curations',
      image: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=700&q=80',
      description: 'Cute, quirky, and heartwarming treasures crafted for besties and soulmates.'
    }

  ],

  occasions: [
    {
      id: 'birthday',
      name: 'Birthday Celebrations',
      tagline: 'Make their day feel truly monumental',
      image: 'https://images.unsplash.com/photo-1513151233558-d860c5398176?auto=format&fit=crop&w=600&q=80',
      badge: 'Popular'
    },
    {
      id: 'anniversary',
      name: 'Anniversary Milestones',
      tagline: 'Cherish every year and cherished memory',
      image: 'https://images.unsplash.com/photo-1518199266791-5375a83190b7?auto=format&fit=crop&w=600&q=80',
      badge: 'Romantic'
    },
    {
      id: 'valentine',
      name: 'Valentine & Love',
      tagline: 'Unspoken feelings spoken through elegance',
      image: 'https://images.unsplash.com/photo-1518895949257-7621c3c786d7?auto=format&fit=crop&w=600&q=80',
      badge: 'Special'
    },
    {
      id: 'friendship',
      name: 'Besties & Soulmates',
      tagline: 'Celebrate laughter, late nights, and bonds',
      image: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=600&q=80',
      badge: 'Warm'
    }
  ],

  /* --- Phase 4: Commerce Configuration (single source of truth for money math) --- */
  commerceConfig: {
    currency: 'INR',
    currencySymbol: '₹',
    freeShippingThreshold: 1499,   // matches the homepage announcement bar promise
    standardShippingFee: 99,
    expressShippingFee: 249,
    codFee: 49,
    whatsappNumber: '919876543210', // TODO: replace with the real business WhatsApp number
    supportEmail: 'care@vrindahampers.in',
    maxGiftMessageLength: 500,
    advanceBookingDays: 45
  },

  /* Coupon engine seeds. Admins can also publish coupons in RTDB at /coupons/<CODE>. */
  coupons: [
    {
      code: 'VRINDA10',
      label: '10% off sitewide',
      type: 'percent',
      value: 10,
      minOrder: 1499,
      maxDiscount: 400,
      active: true,
      description: 'Get 10% off on orders above ₹1,499 (maximum ₹400 off).'
    },
    {
      code: 'LOVE200',
      label: 'Flat ₹200 off',
      type: 'flat',
      value: 200,
      minOrder: 1999,
      active: true,
      description: 'Flat ₹200 off on orders above ₹1,999.'
    },
    {
      code: 'FIRSTGIFT',
      label: '15% off your first gift',
      type: 'percent',
      value: 15,
      minOrder: 999,
      maxDiscount: 300,
      firstOrderOnly: true,
      active: true,
      description: '15% off (maximum ₹300) on your first vrindahampers order above ₹999.'
    },
    {
      code: 'FREESHIP',
      label: 'Free standard delivery',
      type: 'shipping',
      value: 0,
      minOrder: 499,
      active: true,
      description: 'Free standard delivery on orders above ₹499.'
    }
  ],

  /* Preferred delivery time slots offered at checkout */
  deliverySlots: [
    { id: 'anytime', label: 'Anytime (9 AM – 9 PM)' },
    { id: 'morning', label: 'Morning (9 AM – 12 PM)' },
    { id: 'afternoon', label: 'Afternoon (12 PM – 4 PM)' },
    { id: 'evening', label: 'Evening (4 PM – 9 PM)' },
    { id: 'midnight', label: 'Midnight Surprise (11:30 PM – 12:30 AM)' }
  ],

  /* ---------------------------------------------------------------------
   * PRODUCTS ARE NOT DEFINED HERE.
   *
   * The catalog lives in Firebase at /products and nowhere else. These eight
   * placeholder rows used to ship in this file, which caused two problems:
   *   1. Deleting every product from the database appeared to do nothing,
   *      because catalog-service.js fell back to this array whenever the
   *      Firebase read failed or the node was empty.
   *   2. A Super Admin loading any page with an empty catalog silently
   *      re-imported them, so an intentionally empty shop was impossible.
   *
   * The array is kept as an empty list so the page scripts that read
   * window.VRINDA_DATA.products keep working, and so an empty catalog is a
   * normal, supported state rather than a crash.
   *
   * To add products, use Admin -> Bulk Product Maker, which writes to
   * /products in Firebase.
   * ------------------------------------------------------------------- */
  products: [],
  testimonials: [
    {
      name: 'Aanya Sharma',
      location: 'South Delhi',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80',
      quote: 'The wax-sealed calligraphy letter and velvet rose bouquet brought tears to my partners eyes! The WhatsApp team coordinated every custom detail so patiently.',
      rating: 5
    },
    {
      name: 'Rohan Deshmukh',
      location: 'Pune, Maharashtra',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80',
      quote: 'Packaging was top-notch luxury! Delivered right on time via Porter. Getting the order preview on WhatsApp before final dispatch gave total peace of mind.',
      rating: 5
    },
    {
      name: 'Pooja Nair',
      location: 'Bengaluru, Karnataka',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80',
      quote: 'Ordered the Polaroid tin set and Spotify acrylic stand for our 3rd anniversary. The print resolution and acrylic clarity are unmatched!',
      rating: 5
    }
  ],

  gallery: [
    {
      image: 'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&w=600&q=80',
      caption: 'Bespoke music plaque for Aryan & Riya ✨',
      likes: '428'
    },
    {
      image: 'https://images.unsplash.com/photo-1561181286-d3fee7d55364?auto=format&fit=crop&w=600&q=80',
      caption: 'Crimson eternal roses wrapped for a surprise proposal 🌹',
      likes: '891'
    },
    {
      image: 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&w=600&q=80',
      caption: 'Unboxing moments: The Luxury Velvet Trunk Box 🎀',
      likes: '654'
    },
    {
      image: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format&fit=crop&w=600&q=80',
      caption: 'Handwritten sentiments that transcend time 📜',
      likes: '312'
    },
    {
      image: 'https://images.unsplash.com/photo-1526047932273-341f2a7631f9?auto=format&fit=crop&w=600&q=80',
      caption: 'Retro polaroids preserving sunlit wanderlust memories 📸',
      likes: '720'
    },
    {
      image: 'https://images.unsplash.com/photo-1614036417651-efe5912149d8?auto=format&fit=crop&w=600&q=80',
      caption: 'Scannable song keychains: Music you can hold forever 🎵',
      likes: '519'
    }
  ],

  faqs: [
    {
      q: 'How does personalization work without uploading photos on the website?',
      a: 'To give you the smoothest experience, you place your order online first. Once confirmed, our concierge connects with you on WhatsApp to collect your high-resolution photos, names, song links, and custom messages. We share preview drafts before production begins!'
    },
    {
      q: 'How long does it take to make and deliver my gift?',
      a: 'Because each gift is handcrafted to order: production takes 24–48 hours once details are confirmed on WhatsApp. Local deliveries (Delhi NCR, Bengaluru, Mumbai, Pune) arrive same-day or next-day via Rapido/Porter. Nationwide courier orders arrive in 3–5 business days via India Post/Courier.'
    },
    {
      q: 'Can I request urgent / same-day delivery?',
      a: 'Yes! For select metro cities and select hampers/bouquets, we can arrange urgent priority crafting and expedited dispatch via Porter or Rapido. Reach out via WhatsApp directly with your pin code to check immediate feasibility.'
    },
    {
      q: 'Can I cancel or modify my order after paying?',
      a: 'Since items are personalized made-to-order, customers can submit a cancellation request through their account portal before production starts. Super Admin reviews and approves valid requests per our gifting terms.'
    },
    {
      q: 'Is cash on delivery (COD) available?',
      a: 'Since every hamper, letter, and frame is completely customized with your personal photos and names, we operate exclusively on prepaid orders via secure FamGateway (UPI, Cards, NetBanking).'
    }
  ]

};
