/**
 * vrindahampers - Order Service (Phase 4 + Phase 5)
 *
 * Turns a verified FamGateway payment + the checkout form into a real order.
 * One atomic multi-path write creates:
 *   /orders/{orderId}            -> the full order record (source of truth)
 *   /userOrders/{uid}/{orderId}  -> lightweight index so the customer list view
 *                                   stays a single cheap read under security rules
 *   /adminNotifications/{id}     -> admin/staff alert for the new order
 * and then clears the customer's cart.
 *
 * Phase 5 adds the canonical 11-step tracking flow, live listeners
 * (`listenToOrder` / `listenToUserOrders`), `updateOrderStatus`,
 * `updateDeliveryTracking`, the cancellation-request workflow
 * (`/cancellationRequests`) and contextual WhatsApp deep links.
 *
 * Order IDs are human-readable so they can be quoted on WhatsApp and invoices:
 *   VRH-260926-K7Q4  (prefix + YYMMDD + 4 random base36 chars)
 */

(function () {
  'use strict';

  const ORDER_PREFIX = 'VRH';

  // Authoritative 11-step tracking flow + terminal statuses
  const STATUS = {
    ORDER_PLACED: 'Order Placed',
    PAYMENT_CONFIRMED: 'Payment Confirmed',
    AWAITING_CUSTOMIZATION: 'Awaiting Customization',
    CUSTOMER_CONTACTED: 'Customer Contacted',
    PHOTOS_RECEIVED: 'Photos Received',
    CUSTOMIZATION_CONFIRMED: 'Customization Confirmed',
    PRODUCTION_STARTED: 'Production Started',
    PACKED: 'Packed',
    ASSIGNED_TO_DELIVERY: 'Assigned To Delivery',
    OUT_FOR_DELIVERY: 'Out For Delivery',
    DELIVERED: 'Delivered',
    CANCELLED: 'Cancelled'
  };

  // Backward compatibility alias keys
  STATUS.PLACED = STATUS.ORDER_PLACED;
  STATUS.IN_PRODUCTION = STATUS.PRODUCTION_STARTED;
  STATUS.DESIGN_CONFIRMED = STATUS.CUSTOMIZATION_CONFIRMED;

  // Exact 11-step sequence
  const STATUS_FLOW = [
    STATUS.ORDER_PLACED,
    STATUS.PAYMENT_CONFIRMED,
    STATUS.AWAITING_CUSTOMIZATION,
    STATUS.CUSTOMER_CONTACTED,
    STATUS.PHOTOS_RECEIVED,
    STATUS.CUSTOMIZATION_CONFIRMED,
    STATUS.PRODUCTION_STARTED,
    STATUS.PACKED,
    STATUS.ASSIGNED_TO_DELIVERY,
    STATUS.OUT_FOR_DELIVERY,
    STATUS.DELIVERED
  ];

  // Rich metadata for each step in the 11-step tracking timeline
  const TIMELINE_STEPS = [
    {
      key: 'order_placed',
      status: STATUS.ORDER_PLACED,
      label: 'Order Placed',
      shortLabel: 'Placed',
      icon: '📝',
      description: 'Your order has been recorded in our system.',
      hint: 'Awaiting payment confirmation / UPI capture.'
    },
    {
      key: 'payment_confirmed',
      status: STATUS.PAYMENT_CONFIRMED,
      label: 'Payment Confirmed',
      shortLabel: 'Paid',
      icon: '💳',
      description: 'Payment successfully captured via FamGateway UPI.',
      hint: 'Funds verified and reserved for crafting.'
    },
    {
      key: 'awaiting_customization',
      status: STATUS.AWAITING_CUSTOMIZATION,
      label: 'Awaiting Customization',
      shortLabel: 'Customizing',
      icon: '🎨',
      description: 'Ready to receive your photos, songs, and personal notes.',
      hint: 'Our concierge prepares your order docket.'
    },
    {
      key: 'customer_contacted',
      status: STATUS.CUSTOMER_CONTACTED,
      label: 'Customer Contacted',
      shortLabel: 'Contacted',
      icon: '💬',
      description: 'Our gifting concierge reached out on WhatsApp.',
      hint: 'Check your WhatsApp for a message from vrindahampers.'
    },
    {
      key: 'photos_received',
      status: STATUS.PHOTOS_RECEIVED,
      label: 'Photos Received',
      shortLabel: 'Photos In',
      icon: '📸',
      description: 'Your high-res photos & custom text are in our studio.',
      hint: 'Crafting team begins digital mockup / print layout.'
    },
    {
      key: 'customization_confirmed',
      status: STATUS.CUSTOMIZATION_CONFIRMED,
      label: 'Customization Confirmed',
      shortLabel: 'Approved',
      icon: '✨',
      description: 'Design mockup & details approved by you.',
      hint: 'Locking materials, floral arrangement & packaging.'
    },
    {
      key: 'production_started',
      status: STATUS.PRODUCTION_STARTED,
      label: 'Production Started',
      shortLabel: 'Crafting',
      icon: '🌸',
      description: 'Artisans are handcrafting your bespoke gift in our studio.',
      hint: 'Made with fresh satin ribbon, fine kraft & eternal keepsakes.'
    },
    {
      key: 'packed',
      status: STATUS.PACKED,
      label: 'Packed',
      shortLabel: 'Packed',
      icon: '🎁',
      description: 'Gift passed final quality check and sealed in premium packaging.',
      hint: 'Wax-sealed card, bubble-lined keepsake wrap & tamper tape.'
    },
    {
      key: 'assigned_to_delivery',
      status: STATUS.ASSIGNED_TO_DELIVERY,
      label: 'Assigned To Delivery',
      shortLabel: 'Assigned',
      icon: '🛵',
      description: 'Handed to courier partner or scheduled for local express rider.',
      hint: 'Tracking number or rider details generated.'
    },
    {
      key: 'out_for_delivery',
      status: STATUS.OUT_FOR_DELIVERY,
      label: 'Out For Delivery',
      shortLabel: 'Out for Deliv.',
      icon: '🚀',
      description: 'On the road! Your gift is making its way to the recipient.',
      hint: 'Keep your phone handy for rider or courier delivery call.'
    },
    {
      key: 'delivered',
      status: STATUS.DELIVERED,
      label: 'Delivered',
      shortLabel: 'Delivered',
      icon: '🎉',
      description: 'Gift safely delivered! Thank you for celebrating with vrindahampers.',
      hint: 'We hope it brought a radiant smile to their face.'
    }
  ];

  const Orders = {
    STATUS: STATUS,
    STATUS_FLOW: STATUS_FLOW,
    TIMELINE_STEPS: TIMELINE_STEPS,

    _db: function () {
      if (typeof firebase === 'undefined' || !firebase.database) return null;
      return firebase.database();
    },

    _stamp: function () {
      const db = this._db();
      return db ? firebase.database.ServerValue.TIMESTAMP : Date.now();
    },

    currentUid: function () {
      return window.VrindaAuth && window.VrindaAuth.currentUser
        ? window.VrindaAuth.currentUser.uid
        : null;
    },

    /* ------------------------------------------------------------ order id */

    generateOrderId: function () {
      const now = new Date();
      const yy = String(now.getFullYear()).slice(-2);
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      let suffix = '';
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no look-alike 0/O/1/I
      for (let i = 0; i < 4; i++) {
        suffix += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
      }
      return ORDER_PREFIX + '-' + yy + mm + dd + '-' + suffix;
    },

    /* -------------------------------------------------- timeline helper */

    /**
     * Normalizes an arbitrary status string to one of our standard statuses.
     */
    normalizeStatus: function (status) {
      if (!status) return STATUS.ORDER_PLACED;
      const s = String(status).trim().toLowerCase();
      if (s === 'order placed' || s === 'placed') return STATUS.ORDER_PLACED;
      if (s === 'payment confirmed' || s === 'paid') return STATUS.PAYMENT_CONFIRMED;
      if (s === 'awaiting customization' || s === 'awaiting customization details') return STATUS.AWAITING_CUSTOMIZATION;
      if (s === 'customer contacted' || s === 'contacted') return STATUS.CUSTOMER_CONTACTED;
      if (s === 'photos received' || s === 'photos received & verified') return STATUS.PHOTOS_RECEIVED;
      if (s === 'customization confirmed' || s === 'design confirmed' || s === 'confirmed') return STATUS.CUSTOMIZATION_CONFIRMED;
      if (s === 'production started' || s === 'in production' || s === 'crafting') return STATUS.PRODUCTION_STARTED;
      if (s === 'packed' || s === 'quality check' || s === 'ready to ship' || s === 'ready') return STATUS.PACKED;
      if (s === 'assigned to delivery' || s === 'assigned' || s === 'dispatched') return STATUS.ASSIGNED_TO_DELIVERY;
      if (s === 'out for delivery' || s === 'out_for_delivery') return STATUS.OUT_FOR_DELIVERY;
      if (s === 'delivered') return STATUS.DELIVERED;
      if (s === 'cancelled' || s === 'canceled') return STATUS.CANCELLED;
      return status;
    },

    /**
     * Calculates the progress percentage (0-100) and step node states
     * for the 11-step visual tracking component.
     */
    getTimelineProgress: function (currentStatus) {
      const norm = this.normalizeStatus(currentStatus);
      const isCancelled = norm === STATUS.CANCELLED;

      let currentIndex = STATUS_FLOW.indexOf(norm);
      if (currentIndex === -1) {
        currentIndex = isCancelled ? 0 : 0;
      }

      const totalSteps = STATUS_FLOW.length; // 11
      const percentage = isCancelled
        ? 0
        : Math.round((currentIndex / (totalSteps - 1)) * 100);

      const steps = TIMELINE_STEPS.map((stepDef, idx) => {
        let state = 'pending';
        if (isCancelled) {
          state = idx === 0 ? 'cancelled' : 'pending';
        } else if (idx < currentIndex) {
          state = 'done';
        } else if (idx === currentIndex) {
          state = 'active';
        } else {
          state = 'pending';
        }

        return {
          index: idx,
          key: stepDef.key,
          status: stepDef.status,
          label: stepDef.label,
          shortLabel: stepDef.shortLabel,
          icon: stepDef.icon,
          description: stepDef.description,
          hint: stepDef.hint,
          state: state
        };
      });

      return {
        currentStatus: norm,
        currentIndex: currentIndex,
        totalSteps: totalSteps,
        percentage: percentage,
        isComplete: norm === STATUS.DELIVERED,
        isCancelled: isCancelled,
        activeStep: steps[currentIndex] || steps[0],
        steps: steps
      };
    }
  };

  /* -------------------------------------------------- checkout draft persistence */

  const DRAFT_KEY = 'vrinda:checkout-draft';

  Orders.saveCheckoutDraft = function (draft) {
    const payload = Object.assign({}, draft, { savedAt: Date.now() });
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(payload)); } catch (e) { /* private mode */ }

    const db = this._db();
    const uid = this.currentUid();
    // Best-effort cross-device mirror; local copy already guarantees the redirect-safe case.
    if (db && uid) {
      db.ref('checkoutDrafts/' + uid).set(this._serialisable(payload)).catch((err) => {
        console.warn('Checkout draft mirror skipped:', err.message);
      });
    }
    return payload;
  };

  Orders.loadCheckoutDraft = async function () {
    try {
      const local = JSON.parse(localStorage.getItem(DRAFT_KEY));
      if (local && local.items && local.items.length) return local;
    } catch (e) { /* ignore */ }

    const db = this._db();
    const uid = this.currentUid();
    if (db && uid) {
      try {
        const snap = await db.ref('checkoutDrafts/' + uid).once('value');
        if (snap.exists()) return snap.val();
      } catch (err) {
        console.warn('Checkout draft recovery skipped:', err.message);
      }
    }
    return null;
  };

  Orders.clearCheckoutDraft = function () {
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* ignore */ }
    const db = this._db();
    const uid = this.currentUid();
    if (db && uid) db.ref('checkoutDrafts/' + uid).remove().catch(() => {});
  };

  /* ServerValue placeholders cannot be JSON-cloned, so strip them from the mirror. */
  Orders._serialisable = function (value) {
    return JSON.parse(JSON.stringify(value, (key, val) => {
      if (val && typeof val === 'object' && val['.sv']) return undefined;
      return val;
    }));
  };

  /* -------------------------------------------------------------- build order */

  /**
   * @param {object} args
   * @param {object} args.checkout  form values (name, phone, email, address..., occasion, giftMessage...)
   * @param {object} args.totals    output of VrindaStore.getTotals()
   * @param {object} args.payment   output of VrindaFamGateway.verifyOrder()
   * @param {string} args.orderId
   */
  Orders.buildOrder = function (args) {
    const checkout = args.checkout || {};
    const totals = args.totals || {};
    const payment = args.payment || {};
    const user = window.VrindaAuth && window.VrindaAuth.currentUser;
    const shippingMode = totals.shippingMode || checkout.deliverySpeed || 'standard';

    // Infer delivery type (local rider vs courier partner)
    const isLocalExpress = shippingMode === 'express' ||
      ['bengaluru', 'bangalore', 'delhi', 'delhi ncr', 'mumbai', 'pune', 'gurugram', 'noida']
        .includes(String(checkout.city || '').toLowerCase().trim());
    const deliveryType = isLocalExpress ? 'local' : 'courier';

    return {
      orderId: args.orderId,
      userId: (user && user.uid) || checkout.userId || '',
      userEmail: (user && user.email) || checkout.email || '',
      status: STATUS.ORDER_PLACED,
      cancellationStatus: 'none', // 'none' | 'requested' | 'approved' | 'rejected'
      customer: {
        name: checkout.name || '',
        phone: checkout.phone || '',
        email: checkout.email || (user && user.email) || ''
      },
      shipping: {
        addressLine1: checkout.addressLine1 || '',
        addressLine2: checkout.addressLine2 || '',
        landmark: checkout.landmark || '',
        city: checkout.city || '',
        state: checkout.state || '',
        pincode: checkout.pincode || '',
        country: 'India'
      },
      // Delivery tracking fields: local (rider) vs courier
      delivery: {
        type: deliveryType, // 'local' | 'courier'
        shippingMode: shippingMode,
        // Local delivery fields:
        riderName: '',
        riderPhone: '',
        eta: '',
        vehicleNumber: '',
        // Courier delivery fields:
        courierName: isLocalExpress ? '' : 'India Post / BlueDart',
        trackingNumber: '',
        expectedDeliveryDate: checkout.deliveryDate || '',
        trackingUrl: '',
        courierPhone: '',
        updatedAt: null
      },
      items: (totals.items || []).map((item) => ({
        productId: item.productId,
        name: item.name,
        slug: item.slug || '',
        categoryName: item.categoryName || '',
        image: item.image || '',
        price: Number(item.price) || 0,
        qty: parseInt(item.qty, 10) || 1,
        lineTotal: (Number(item.price) || 0) * (parseInt(item.qty, 10) || 1)
      })),
      pricing: {
        itemCount: totals.itemCount || 0,
        subtotal: Number(totals.subtotal) || 0,
        mrpTotal: Number(totals.mrpTotal) || 0,
        discount: Number(totals.discount) || 0,
        couponCode: totals.couponCode || '',
        shipping: Number(totals.shipping) || 0,
        shippingMode: shippingMode,
        total: Number(totals.total) || 0,
        currency: totals.currency || 'INR',
        taxNote: 'Prices inclusive of all taxes'
      },
      gifting: {
        occasion: checkout.occasion || '',
        giftMessage: checkout.giftMessage || '',
        deliveryDate: checkout.deliveryDate || '',
        deliverySlot: checkout.deliverySlot || 'Anytime (9 AM – 9 PM)',
        isSurprise: !!checkout.isSurprise,
        notes: checkout.notes || ''
      },
      payment: {
        gateway: 'FamGateway',
        mode: payment.mode || 'live',
        famgatewayOrderId: payment.orderId || '',
        transactionId: payment.transactionId || '',
        utr: payment.utr || '',
        senderName: payment.senderName || '',
        payableAmount: payment.payableAmount || null,
        paymentTime: payment.paymentTime || '',
        verifiedAt: payment.verified ? (payment.verifiedAt || Date.now()) : null,
        // False when we could not reach the gateway from the browser (FamGateway's
        // verify endpoint sends no CORS headers, so only a Cloud Function proxy can
        // confirm it). The order still exists and carries every reference we have,
        // so the team can reconcile it instead of the money vanishing.
        verified: payment.verified !== false,
        verificationNote: payment.verificationNote || '',
        simulated: !!payment.simulated
      },
      statusHistory: [
        {
          status: STATUS.ORDER_PLACED,
          at: Date.now(),
          note: 'Order placed & recorded in system for order ' + args.orderId
        },
        {
          status: STATUS.PAYMENT_CONFIRMED,
          at: Date.now() + 50,
          note: 'Payment captured via FamGateway UPI (UTR: ' + (payment.utr || 'CAPTURED') + ')'
        }
      ],
      createdAt: this._stamp(),
      updatedAt: this._stamp()
    };
  };

  /* -------------------------------------------------------------- create order */

  Orders.createOrder = async function (args) {
    const uid = this.currentUid();
    if (!uid) return { success: false, error: 'Please log in to place your order.' };

    // Checkout is a verified-email gated action per the Phase 0 business rules.
    if (window.VrindaAuth && !window.VrindaAuth.requireGate('checkout')) {
      return { success: false, error: 'Email verification is required before placing an order.' };
    }

    const db = this._db();
    if (!db) return { success: false, error: 'Order storage is unavailable right now.' };

    const totals = args.totals || {};
    if (!totals.items || totals.items.length === 0) {
      return { success: false, error: 'Your cart is empty, so there is nothing to order.' };
    }

    const orderId = args.orderId || this.generateOrderId();
    const order = this.buildOrder({
      checkout: args.checkout || {},
      totals: totals,
      payment: args.payment || {},
      orderId: orderId
    });

    const notificationRef = db.ref('adminNotifications').push();
    const gatewayOrderId = (args.payment && args.payment.orderId) || '';

    const updates = {};
    updates['orders/' + orderId] = order;
    updates['userOrders/' + uid + '/' + orderId] = {
      orderId: orderId,
      status: order.status,
      cancellationStatus: 'none',
      total: order.pricing.total,
      itemCount: order.pricing.itemCount,
      occasion: order.gifting.occasion,
      city: order.shipping.city,
      famgatewayOrderId: gatewayOrderId,
      createdAt: order.createdAt
    };
    updates['adminNotifications/' + notificationRef.key] = {
      type: 'new-order',
      orderId: orderId,
      userId: uid,
      customerName: order.customer.name,
      customerPhone: order.customer.phone,
      city: order.shipping.city,
      itemCount: order.pricing.itemCount,
      total: order.pricing.total,
      paymentMode: order.payment.mode,
      simulated: order.payment.simulated,
      read: false,
      createdAt: this._stamp()
    };
    if (gatewayOrderId) {
      updates['paymentSessions/' + gatewayOrderId] = {
        famgatewayOrderId: gatewayOrderId,
        userId: uid,
        orderId: orderId,
        amount: order.pricing.total,
        payableAmount: order.payment.payableAmount,
        status: 'converted',
        updatedAt: this._stamp()
      };
    }
    // Cart is cleared only after the order record is safely written (single atomic update).
    updates['cart/' + uid] = null;

    try {
      await db.ref().update(updates);
    } catch (err) {
      return { success: false, error: err.message };
    }

    this.clearCheckoutDraft();
    return { success: true, orderId: orderId, order: order };
  };

  /* --------------------------------------------------------- reading orders */

  Orders.getOrder = async function (orderId) {
    const db = this._db();
    if (!db || !orderId) return null;
    try {
      const snap = await db.ref('orders/' + orderId).once('value');
      return snap.exists() ? snap.val() : null;
    } catch (err) {
      console.warn('Order lookup failed:', err.message);
      return null;
    }
  };
  /**
   * Real-time subscription to an order record.
   * Returns an unsubscribe function.
   */
  Orders.listenToOrder = function (orderId, callback) {
    const db = this._db();
    if (!db || !orderId || typeof callback !== 'function') {
      return () => {};
    }

    const ref = db.ref('orders/' + orderId);
    const handler = (snap) => {
      const val = snap.exists() ? snap.val() : null;
      callback(val);
    };

    ref.on('value', handler);
    return () => ref.off('value', handler);
  };

  /**
   * Real-time subscription to ALL orders (Admin/Staff only).
   * Returns an unsubscribe function.
   */
  Orders.listenToAllOrders = function (callback) {
    const db = this._db();
    if (!db || typeof callback !== 'function') {
      return () => {};
    }

    const ref = db.ref('orders');
    const handler = (snap) => {
      const val = snap.val() || {};
      const list = Object.values(val).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      callback(list);
    };

    ref.on('value', handler);
    return () => ref.off('value', handler);
  };

  /**
   * Real-time subscription to cancellation requests (Admin/Staff only).
   * Returns an unsubscribe function.
   */
  Orders.listenToCancellationRequests = function (callback) {
    const db = this._db();
    if (!db || typeof callback !== 'function') {
      return () => {};
    }

    const ref = db.ref('cancellationRequests');
    const handler = (snap) => {
      const val = snap.val() || {};
      const list = Object.values(val).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      callback(list);
    };

    ref.on('value', handler);
    return () => ref.off('value', handler);
  };

  /**
   * Assign delivery details to an order (Staff or Super Admin).
   * Updates delivery.type, delivery.deliveryPersonnel, rider/courier fields, and status to ASSIGNED_TO_DELIVERY.
   */
  Orders.assignDelivery = async function (orderId, assignment) {
    const db = this._db();
    if (!db || !orderId) return { success: false, error: 'Missing orderId' };

    try {
      const current = (await this.getOrder(orderId)) || {};
      const currentDelivery = current.delivery || {};
      const updatedDelivery = Object.assign({}, currentDelivery, assignment, { updatedAt: Date.now() });

      const updates = {};
      updates['orders/' + orderId + '/delivery'] = updatedDelivery;
      updates['orders/' + orderId + '/status'] = STATUS.ASSIGNED_TO_DELIVERY;
      updates['orders/' + orderId + '/updatedAt'] = this._stamp();

      const history = Array.isArray(current.statusHistory) ? current.statusHistory : [];
      history.push({
        status: STATUS.ASSIGNED_TO_DELIVERY,
        at: Date.now(),
        note: assignment.note || `Assigned to ${assignment.type === 'local' ? (assignment.riderName || 'Local Rider') : (assignment.courierName || 'Courier')}`
      });
      updates['orders/' + orderId + '/statusHistory'] = history;

      if (current.userId) {
        updates['userOrders/' + current.userId + '/' + orderId + '/status'] = STATUS.ASSIGNED_TO_DELIVERY;
      }

      await db.ref().update(updates);
      return { success: true, delivery: updatedDelivery };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  /**
   * Real-time subscription to userOrders index.
   * Returns an unsubscribe function.
   */
  Orders.listenToUserOrders = function (callback) {
    const uid = this.currentUid();
    const db = this._db();
    if (!db || !uid || typeof callback !== 'function') {
      return () => {};
    }

    const ref = db.ref('userOrders/' + uid);
    const handler = (snap) => {
      const val = snap.val() || {};
      const list = Object.values(val).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      callback(list);
    };

    ref.on('value', handler);
    return () => ref.off('value', handler);
  };


  Orders.listUserOrderIndex = async function () {
    const uid = this.currentUid();
    const db = this._db();
    if (!db || !uid) return [];
    try {
      const snap = await db.ref('userOrders/' + uid).once('value');
      const val = snap.val() || {};
      return Object.values(val).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } catch (err) {
      console.warn('Order index read failed:', err.message);
      return [];
    }
  };

  Orders.hasPreviousOrders = async function () {
    const index = await this.listUserOrderIndex();
    return index.length > 0;
  };

  Orders.findSession = async function (famgatewayOrderId) {
    const db = this._db();
    if (!db || !famgatewayOrderId) return null;
    try {
      const snap = await db.ref('paymentSessions/' + famgatewayOrderId).once('value');
      return snap.exists() ? snap.val() : null;
    } catch (err) {
      return null;
    }
  };

  /* ------------------------------------------------- status update & progress (Phase 5) */

  /**
   * Updates an order's status and automatically records it in statusHistory.
   * Also updates the lightweight userOrders index and appends an adminNotification if appropriate.
   */
  Orders.updateOrderStatus = async function (orderId, newStatus, note) {
    const db = this._db();
    if (!db || !orderId || !newStatus) return { success: false, error: 'Missing parameters' };

    try {
      const orderRef = db.ref('orders/' + orderId);
      const snap = await orderRef.once('value');
      if (!snap.exists()) return { success: false, error: 'Order not found' };

      const order = snap.val();
      const history = Array.isArray(order.statusHistory) ? order.statusHistory : [];

      history.push({
        status: newStatus,
        at: Date.now(),
        note: note || ('Order moved to ' + newStatus)
      });

      const updates = {};
      updates['orders/' + orderId + '/status'] = newStatus;
      updates['orders/' + orderId + '/statusHistory'] = history;
      updates['orders/' + orderId + '/updatedAt'] = this._stamp();

      if (order.userId) {
        updates['userOrders/' + order.userId + '/' + orderId + '/status'] = newStatus;
      }

      await db.ref().update(updates);
      return { success: true, status: newStatus };
    } catch (err) {
      console.error('Failed to update order status:', err);
      return { success: false, error: err.message };
    }
  };

  /**
   * Updates delivery tracking information for an order (rider or courier).
   */
  Orders.updateDeliveryTracking = async function (orderId, deliveryData) {
    const db = this._db();
    if (!db || !orderId || !deliveryData) return { success: false, error: 'Missing parameters' };

    try {
      const current = (await this.getOrder(orderId)) || {};
      const currentDelivery = current.delivery || {};
      const payload = Object.assign({}, currentDelivery, deliveryData, { updatedAt: Date.now() });

      const updates = {};
      updates['orders/' + orderId + '/delivery'] = payload;
      updates['orders/' + orderId + '/updatedAt'] = this._stamp();

      await db.ref().update(updates);
      return { success: true, delivery: payload };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };
  /* ------------------------------------------- cancellation requests (Requirement 5) */

  /**
   * Submits a customer cancellation request.
   * Stored in RTDB at /cancellationRequests/{requestId} and updates order cancellationStatus.
   * Visible to Super Admin for approval/rejection.
   */
  Orders.submitCancellationRequest = async function (args) {
    const db = this._db();
    const uid = this.currentUid();
    if (!db) return { success: false, error: 'Database unavailable' };
    if (!args || !args.orderId) return { success: false, error: 'Order ID is required' };

    const orderId = args.orderId;
    const reason = (args.reason || 'Customer requested cancellation').trim();
    const notes = (args.notes || '').trim();

    try {
      const order = await this.getOrder(orderId);
      if (!order) return { success: false, error: 'Order not found' };

      // Ensure customer owns the order (if logged in)
      if (uid && order.userId && order.userId !== uid) {
        return { success: false, error: 'You do not have permission to cancel this order.' };
      }

      const normStatus = this.normalizeStatus(order.status);
      if (normStatus === STATUS.DELIVERED) {
        return { success: false, error: 'Delivered orders cannot be cancelled. Please contact concierge on WhatsApp for returns.' };
      }
      if (normStatus === STATUS.CANCELLED) {
        return { success: false, error: 'This order is already cancelled.' };
      }
      if (order.cancellationStatus === 'requested') {
        return { success: false, error: 'A cancellation request is already pending review for this order.' };
      }

      const requestRef = db.ref('cancellationRequests').push();
      const requestId = requestRef.key;
      const requestPayload = {
        requestId: requestId,
        orderId: orderId,
        userId: uid || order.userId || '',
        customerName: args.customerName || (order.customer && order.customer.name) || '',
        customerPhone: args.customerPhone || (order.customer && order.customer.phone) || '',
        orderTotal: (order.pricing && order.pricing.total) || 0,
        orderStatus: order.status,
        reason: reason,
        notes: notes,
        status: 'pending', // 'pending' | 'approved' | 'rejected'
        createdAt: this._stamp(),
        updatedAt: this._stamp()
      };

      const notificationRef = db.ref('adminNotifications').push();

      const updates = {};
      updates['cancellationRequests/' + requestId] = requestPayload;
      updates['orders/' + orderId + '/cancellationStatus'] = 'requested';
      updates['orders/' + orderId + '/cancellationRequestId'] = requestId;
      updates['orders/' + orderId + '/updatedAt'] = this._stamp();

      if (order.userId) {
        updates['userOrders/' + order.userId + '/' + orderId + '/cancellationStatus'] = 'requested';
      }

      updates['adminNotifications/' + notificationRef.key] = {
        type: 'cancellation-request',
        requestId: requestId,
        orderId: orderId,
        userId: uid || order.userId || '',
        reason: reason,
        read: false,
        createdAt: this._stamp()
      };

      await db.ref().update(updates);
      return { success: true, requestId: requestId, message: 'Cancellation request submitted for Super Admin review.' };
    } catch (err) {
      console.error('Cancellation request failed:', err);
      return { success: false, error: err.message };
    }
  };
  /**
   * Super Admin stub: Approve cancellation request (sets order status to Cancelled).
   */
  Orders.approveCancellationRequest = async function (requestId, adminNotes) {
    const db = this._db();
    if (!db || !requestId) return { success: false, error: 'Missing request ID' };

    try {
      const snap = await db.ref('cancellationRequests/' + requestId).once('value');
      if (!snap.exists()) return { success: false, error: 'Cancellation request not found' };

      const req = snap.val();
      const orderId = req.orderId;
      const order = await this.getOrder(orderId);

      const updates = {};
      updates['cancellationRequests/' + requestId + '/status'] = 'approved';
      updates['cancellationRequests/' + requestId + '/adminNotes'] = adminNotes || 'Approved by Super Admin';
      updates['cancellationRequests/' + requestId + '/resolvedAt'] = this._stamp();

      updates['orders/' + orderId + '/status'] = STATUS.CANCELLED;
      updates['orders/' + orderId + '/cancellationStatus'] = 'approved';
      updates['orders/' + orderId + '/updatedAt'] = this._stamp();

      if (order && order.userId) {
        updates['userOrders/' + order.userId + '/' + orderId + '/status'] = STATUS.CANCELLED;
        updates['userOrders/' + order.userId + '/' + orderId + '/cancellationStatus'] = 'approved';
      }

      await db.ref().update(updates);
      return { success: true, status: 'approved' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  /**
   * Super Admin stub: Reject cancellation request (keeps order active).
   */
  Orders.rejectCancellationRequest = async function (requestId, adminNotes) {
    const db = this._db();
    if (!db || !requestId) return { success: false, error: 'Missing request ID' };

    try {
      const snap = await db.ref('cancellationRequests/' + requestId).once('value');
      if (!snap.exists()) return { success: false, error: 'Cancellation request not found' };

      const req = snap.val();
      const orderId = req.orderId;
      const order = await this.getOrder(orderId);

      const updates = {};
      updates['cancellationRequests/' + requestId + '/status'] = 'rejected';
      updates['cancellationRequests/' + requestId + '/adminNotes'] = adminNotes || 'Rejected by Super Admin';
      updates['cancellationRequests/' + requestId + '/resolvedAt'] = this._stamp();

      updates['orders/' + orderId + '/cancellationStatus'] = 'rejected';
      updates['orders/' + orderId + '/updatedAt'] = this._stamp();

      if (order && order.userId) {
        updates['userOrders/' + order.userId + '/' + orderId + '/cancellationStatus'] = 'rejected';
      }

      await db.ref().update(updates);
      return { success: true, status: 'rejected' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };



  /* ------------------------------------------------- WhatsApp Integrations (Requirement 3) */

  /**
   * Generates a pre-filled WhatsApp link for customers or admin staff.
   *
   * @param {object} order
   * @param {string} [context='customer-order']
   *   - 'customer-order': standard post-purchase customization handoff
   *   - 'customer-tracking': customer requesting an update on their order
   *   - 'customer-cancellation': customer inquiring about their cancellation request
   *   - 'admin-contact': concierge greeting the customer
   *   - 'admin-photos-reminder': concierge asking for high-res photos
   *   - 'admin-customization-confirm': concierge asking for design sign-off
   *   - 'admin-delivery-update': concierge/delivery manager sharing rider/courier tracking
   */
  Orders.whatsAppLink = function (order, context) {
    if (!order) return 'https://wa.me/919876543210';

    const cfg = (window.VRINDA_DATA && window.VRINDA_DATA.commerceConfig) || {};
    const businessNumber = cfg.whatsappNumber || '919876543210';
    const ctx = context || 'customer-order';

    const itemsSummary = (order.items || [])
      .map((i) => '• ' + i.name + ' × ' + i.qty)
      .join('\n');

    const customerName = (order.customer && order.customer.name) || 'Customer';
    const recipientCity = (order.shipping && order.shipping.city) || 'India';
    const orderId = order.orderId || 'Order';
    const totalAmount = order.pricing ? Number(order.pricing.total).toLocaleString('en-IN') : '0';
    const deliveryDate = (order.gifting && order.gifting.deliveryDate) || 'As scheduled';

    let message = '';
    let targetNumber = businessNumber;

    if (ctx === 'customer-order') {
      message = [
        'Hi vrindahampers! 🌸 I have just placed order *' + orderId + '*.',
        '',
        itemsSummary,
        '',
        'Total: ₹' + totalAmount,
        'Delivery date: ' + deliveryDate,
        'Deliver to: ' + customerName + ', ' + recipientCity,
        '',
        'Here are my photos and personalization details →'
      ].join('\n');
    } else if (ctx === 'customer-tracking') {
      message = [
        'Hi vrindahampers! 🌸 Could you please give me a quick status update on my order *' + orderId + '*?',
        '',
        'Current status: ' + (order.status || 'Order Placed'),
        'Delivery date: ' + deliveryDate,
        'Deliver to: ' + customerName + ', ' + recipientCity,
        '',
        'Thank you!'
      ].join('\n');
    } else if (ctx === 'customer-cancellation') {
      message = [
        'Hi vrindahampers! 🌸 I submitted a cancellation request for order *' + orderId + '*.',
        '',
        'Could you please help expedite this request? Thank you!'
      ].join('\n');
    } else if (ctx === 'admin-contact') {
      targetNumber = cleanPhoneForWhatsApp(order.customer && order.customer.phone);
      message = [
        'Hello ' + customerName + '! 🌸 This is Vrinda from *vrindahampers*.',
        'Thank you so much for your order *' + orderId + '*!',
        '',
        'I am your dedicated gifting concierge for this curation.',
        'Please reply with your photos, Spotify song link, or custom message here so we can start crafting right away.'
      ].join('\n');
    } else if (ctx === 'admin-photos-reminder') {
      targetNumber = cleanPhoneForWhatsApp(order.customer && order.customer.phone);
      message = [
        'Hi ' + customerName + '! 🌸 Gentle reminder from *vrindahampers* regarding order *' + orderId + '*.',
        '',
        'We are ready to start production on your gift! Please share your high-res photos and any text changes here when you get a moment.'
      ].join('\n');
    } else if (ctx === 'admin-customization-confirm') {
      targetNumber = cleanPhoneForWhatsApp(order.customer && order.customer.phone);
      message = [
        'Hi ' + customerName + '! ✨ Here is the preview of your personalization for order *' + orderId + '*.',
        '',
        'Please review and reply with *“CONFIRMED”* so our artisans can begin handcrafting.'
      ].join('\n');
    } else if (ctx === 'admin-delivery-update') {
      targetNumber = cleanPhoneForWhatsApp(order.customer && order.customer.phone);
      const delivery = order.delivery || {};
      const isLocal = delivery.type === 'local';
      message = [
        'Hi ' + customerName + '! 🚀 Your vrindahampers order *' + orderId + '* is now ' + (order.status || 'Out For Delivery') + '!',
        '',
        isLocal
          ? ('Rider: ' + (delivery.riderName || 'Local Express Rider') + ' (' + (delivery.riderPhone || 'Contact assigned') + ')\nETA: ' + (delivery.eta || 'Today'))
          : ('Courier: ' + (delivery.courierName || 'Courier Partner') + '\nTracking No: ' + (delivery.trackingNumber || 'Tracking ID generated') + '\nTrack: ' + (delivery.trackingUrl || 'https://www.indiapost.gov.in/')),
        '',
        'We hope you and the recipient love the gift!'
      ].join('\n');
    } else {
      message = 'Hi vrindahampers! Regarding order *' + orderId + '*.';
    }

    return 'https://wa.me/' + targetNumber + '?text=' + encodeURIComponent(message);
  };

  /**
   * Helper for Admin tables to get direct WhatsApp links for customer rows.
   */
  Orders.getWhatsAppAdminLink = function (order, templateType) {
    return this.whatsAppLink(order, templateType || 'admin-contact');
  };

  function cleanPhoneForWhatsApp(phone) {
    if (!phone) return '919876543210';
    let p = String(phone).replace(/[^\d]/g, '');
    if (p.length === 10) p = '91' + p;
    return p || '919876543210';
  }

  window.VrindaOrders = Orders;
})();