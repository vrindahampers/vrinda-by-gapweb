/**
 * vrindahampers - Legal / Policy Content
 *
 * The policy pages are authored as DATA in one place rather than as six
 * hand-maintained HTML files. That way /policies.html (the index) and any
 * single-policy view render from the same source, and the Super Admin++ Site
 * Content editor can override a section without anyone editing markup.
 *
 * `body` is HTML on purpose: it is written here in the repository by the shop
 * owner, not typed by a customer, and it is static policy text. Anything a
 * user CAN type is escaped by the editor before it is stored.
 */
(function () {
  'use strict';

  const Policies = {
    LIST: [
      {
        slug: 'privacy-policy',
        title: 'Privacy Policy',
        summary: 'What we collect, why we collect it, and the control you have over it.',
        updated: '1 September 2026',
        body: [
          '<h3>Who we are</h3>',
          '<p>vrindahampers ("we", "us") is an Indian gifting brand that handcrafts bouquets, hampers and personalised keepsakes. This policy explains what happens to your personal information when you browse or order from us.</p>',

          '<h3>What we collect</h3>',
          '<ul>',
          '<li><strong>Account details</strong> — your name, email address and phone/WhatsApp number, given to us when you register or check out.</li>',
          '<li><strong>Delivery details</strong> — the address you save for delivery, including pin code and city.</li>',
          '<li><strong>Order details</strong> — what you bought, the gift message you wrote, and any personalisation instructions you supplied.</li>',
          '<li><strong>Newsletter signups</strong> — your email address, if you chose to join the Inner Circle.</li>',
          '<li><strong>Payment status</strong> — the payment reference (UTR or transaction id) returned by our payment gateway. We never see or store your card or UPI credentials.</li>',
          '</ul>',

          '<h3>Why we collect it</h3>',
          '<ul>',
          '<li>To take your order, make the gift and deliver it to you.</li>',
          '<li>To send order updates — production, packing, dispatch and delivery.</li>',
          '<li>To answer your questions on WhatsApp or email.</li>',
          '<li>To send the newsletter, but only if you asked for it. Every email includes an unsubscribe link.</li>',
          '</ul>',

          '<h3>Who we share it with</h3>',
          '<p>We share only what is necessary: our payment gateway to process the payment, and our delivery partner to bring the order to you. We do not sell your data to anyone, and we do not share your phone number or address for advertising.</p>',

          '<h3>Your choices</h3>',
          '<p>You can ask us to correct or delete your information at any time by writing to us. Unsubscribing from the newsletter does not affect your order receipts or delivery updates, which are sent separately.</p>',

          '<h3>Contact</h3>',
          '<p>Questions about this policy? Write to us using the details on our contact page and we will respond.</p>'
        ].join('\n')
      },
      {
        slug: 'terms-of-service',
        title: 'Terms of Service',
        summary: 'The agreement between you and vrindahampers when you place an order.',
        updated: '1 September 2026',
        body: [
          '<h3>Using this website</h3>',
          '<p>By placing an order you confirm you are at least 18 years old, or buying with the consent of a parent or guardian, and that the information you give us is accurate.</p>',

          '<h3>Orders and acceptance</h3>',
          '<p>Your order is an offer to buy. A contract is formed only when we confirm your order and the payment is captured. If an item turns out to be unavailable after you have ordered, we will contact you and refund any amount paid.</p>',

          '<h3>Prices and payment</h3>',
          '<p>Prices are in Indian Rupees and include applicable taxes. Payment is processed by our gateway; we never receive your card or UPI credentials.</p>',

          '<h3>Personalisation</h3>',
          '<p>Personalised items — custom text, photographs, names and dates — are made exactly as you supply them. Please check the spelling of names and dates carefully, because a personalised item cannot be returned once it has been made. Photographs and other materials you upload must be yours to use, and you give us permission to use them to make your gift.</p>',

          '<h3>Delivery</h3>',
          '<p>Delivery dates are estimates, not guarantees. We are not liable for delays caused by events outside our reasonable control, such as courier strikes, weather or public holidays. Please see our Shipping &amp; Delivery policy for more detail.</p>',

          '<h3>Cancellations and returns</h3>',
          '<p>You can request cancellation from your order page while the order has not yet entered production. Because most of our items are made to order, we cannot accept returns on personalised or customised goods once production has started. If something arrives damaged or faulty, contact us within 48 hours and we will make it right.</p>',

          '<h3>Acceptable use</h3>',
          '<p>You may not use this site to post unlawful content, attempt to breach its security, or copy its content commercially without permission.</p>',

          '<h3>Liability</h3>',
          '<p>To the extent the law allows, our liability for any order is limited to the amount you paid for that order. Nothing in these terms limits liability that cannot lawfully be limited.</p>',

          '<h3>Governing law</h3>',
          '<p>These terms are governed by the laws of India, and the courts of India have jurisdiction over any dispute.</p>'
        ].join('\n')
      },
      {
        slug: 'shipping-delivery',
        title: 'Shipping & Delivery',
        summary: 'Where we deliver, how long it takes, and what it costs.',
        updated: '1 September 2026',
        body: [
          '<h3>Where we deliver</h3>',
          '<p>We currently deliver across India. A handful of pin codes may not be serviceable for express delivery; the checkout will tell you before you pay if your address is affected.</p>',

          '<h3>How long it takes</h3>',
          '<ul>',
          '<li><strong>Standard delivery</strong> — 4 to 7 working days after your order enters production.</li>',
          '<li><strong>Express delivery</strong> — 2 to 4 working days, available on eligible pin codes.</li>',
          '<li><strong>Festival season</strong> — during Diwali, Christmas and similar peaks, add 2 to 3 days. We publish festival deadlines on the homepage.</li>',
          '</ul>',
          '<p>Personalised and made-to-order items take longer because they are genuinely handmade. The estimate shown on your order is the one we plan to.</p>',

          '<h3>Delivery charges</h3>',
          '<p>Standard delivery is free on orders above ₹1,499. Below that it is a flat ₹99. Express delivery is ₹249. Charges appear in the order summary before you pay, so there are no surprises at the end.</p>',

          '<h3>Tracking</h3>',
          '<p>As soon as your order is dispatched you receive a tracking link by email and on your order page. You can also track any order at any time from your account.</p>',

          '<h3>Failed delivery</h3>',
          '<p>If the courier cannot reach you, the parcel returns to us and we will contact you to arrange redelivery. Perishable or personalised items that cannot be restocked are not re-dispatched without a fresh order.</p>',

          '<h3>Address changes</h3>',
          '<p>You can change the delivery address from your order page until the order moves into production. After that, changes depend on whether the parcel has left our workshop.</p>',

          '<h3>Damaged or wrong items</h3>',
          '<p>Please message us within 48 hours of delivery with a photo. We will replace or refund the affected item.</p>'
        ].join('\n')
      },
      {
        slug: 'returns-refunds',
        title: 'Returns & Refunds',
        summary: 'What can be returned, what cannot, and how refunds work.',
        updated: '1 September 2026',
        body: [
          '<h3>Made-to-order items</h3>',
          '<p>Most of what we sell is made to order — bouquets are assembled, hampers are curated, and personalised pieces are made with your text or photographs. Once production of such an item has started it cannot be returned or exchanged, because it cannot be resold.</p>',

          '<h3>What we do accept back</h3>',
          '<ul>',
          '<li>Items that arrive damaged, faulty or not as described — tell us within 48 hours with a photo and we will replace or refund.</li>',
          '<li>Items that are wrong because of a mistake on our side.</li>',
          '<li>If an item cannot be made at all, we refund in full.</li>',
          '</ul>',

          '<h3>Cancellation</h3>',
          '<p>You can request a cancellation from your order page, or on WhatsApp, as long as the order has not entered production. Approved cancellations are refunded to the original payment method within 5 to 7 working days.</p>',

          '<h3>How refunds are paid</h3>',
          '<p>We always refund to the original payment method — the same UPI ID or card you paid with. We cannot refund to a different account for security reasons.</p>',

          '<h3>Personalisation mistakes</h3>',
          '<p>If a name, date or message is wrong because of a typo in the details you supplied, we are sorry but we cannot remake or refund it. Please check your details carefully before confirming the order — the order page shows exactly what will be printed.</p>',

          '<h3>How to start a return</h3>',
          '<p>Use our contact page or WhatsApp. Include your order number and, for a damage claim, a photo. We reply within one working day.</p>'
        ].join('\n')
      },
      {
        slug: 'cancellation-policy',
        title: 'Cancellation Policy',
        summary: 'The window in which an order can be stopped, and what happens after.',
        updated: '1 September 2026',
        body: [
          '<h3>Free cancellation window</h3>',
          '<p>You can cancel an order free of charge at any point before it moves to <strong>Production Started</strong>. Use the Cancel button on your order page, or message us on WhatsApp.</p>',

          '<h3>What each status means for cancellation</h3>',
          '<ul>',
          '<li><strong>Order Placed → Customer Contacted → Customization Confirmed</strong> — free cancellation, full refund.</li>',
          '<li><strong>Production Started</strong> — cancellation is no longer possible, because your item is already being made.</li>',
          '<li><strong>Packed → Assigned to Delivery → Out for Delivery</strong> — the order has left us. Contact us and we will try to intercept it, but this is not guaranteed.</li>',
          '</ul>',

          '<h3>How to request one</h3>',
          '<ol>',
          '<li>Open My Orders and find the order.</li>',
          '<li>Choose Request Cancellation and tell us briefly why.</li>',
          '<li>We confirm, and the order moves to Cancelled.</li>',
          '</ol>',
          '<p>If you would rather not sign in, message us on WhatsApp with your order number.</p>',

          '<h3>Refunds</h3>',
          '<p>Refunds go back to the original payment method and usually land within 5 to 7 working days, sometimes a little longer depending on your bank.</p>',

          '<h3>Made-to-order deposits</h3>',
          '<p>If an item required an advance that was used to start production, cancelling after <strong>Production Started</strong> means that advance cannot be refunded. You will see this stated on your order if it applies.</p>'
        ].join('\n')
      },
      {
        slug: 'refund-policy',
        title: 'Refund Policy',
        summary: 'How, when and where your money comes back.',
        updated: '1 September 2026',
        body: [
          '<h3>Refunds always go to the original payment method</h3>',
          '<p>Whatever the reason, a refund returns to the UPI ID or card you paid with. We cannot send a refund to a different account, because doing so is the most common way payment fraud is attempted.</p>',

          '<h3>How long it takes</h3>',
          '<ul>',
          '<li>We process a refund within <strong>2 to 3 working days</strong> of approving it.</li>',
          '<li>It then appears on your statement within <strong>5 to 7 working days</strong>, depending on your bank or UPI provider.</li>',
          '</ul>',
          '<p>If the money has not arrived after 7 working days, message us with your order number and we will chase it directly.</p>',

          '<h3>Order cancelled before dispatch</h3>',
          '<p>Full refund, including any delivery charge you paid. There is no cancellation fee.</p>',

          '<h3>Item damaged or faulty</h3>',
          '<p>Full refund of the item, or a free replacement, at your choice. Delivery charges are refunded if the whole order has to go back.</p>',

          '<h3>Order could not be fulfilled</h3>',
          '<p>If we cannot make your item — for example a material is unavailable — we refund in full. We will always tell you rather than leaving the order open.</p>',

          '<h3>What is not refundable</h3>',
          '<p>Personalised items that have already entered production cannot be refunded, and neither can delivery charges already incurred on a dispatched order. See Returns &amp; Refunds.</p>',

          '<h3>Partial refunds</h3>',
          '<p>If only part of an order is affected, we refund that part. Any discount you used is apportioned across the items, so a partial refund is calculated on the amount you actually paid for the affected item.</p>'
        ].join('\n')
      }
    ],

    /**
     * Look up one policy by its slug.
     * @returns {object|null} the policy, or null when the slug is unknown
     */
    get: function (slug) {
      const key = String(slug || '').trim().toLowerCase();
      return Policies.LIST.find((p) => p.slug === key) || null;
    }
  };

  window.VrindaPolicies = Policies;
})();
