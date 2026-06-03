/* === BLUE SHELF MICROBAKERY === FILE: js/email.js === */

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * EMAILJS SETUP INSTRUCTIONS
 * ─────────────────────────────────────────────────────────────────────────────
 * Step 1: Go to https://emailjs.com and create a free account.
 *
 * Step 2: Add an Email Service (Gmail recommended).
 *         Dashboard → Email Services → Add New Service.
 *         Select Gmail, connect your account, copy the Service ID ("service_xxx").
 *
 * Step 3: Create TWO Email Templates.
 *
 *         ── PRE-ORDER TEMPLATE (update existing EMAILJS_TEMPLATE_ID) ──────────
 *         Set the "To Email" field to: {{to_email}}
 *         Template variables:
 *           {{order_id}}          — e.g. #A1B2C3D4
 *           {{customer_name}}     — customer full name
 *           {{customer_email}}    — customer email
 *           {{items}}             — item list with quantities
 *           {{total}}             — e.g. "$18.00"
 *           {{fulfillment}}       — "Pickup" or "Delivery"
 *           {{delivery_address}}  — address or "N/A"
 *           {{pickup_date}}       — e.g. "2026-06-10"
 *           {{payment}}           — "💵 Cash" or "📧 E-Transfer"
 *           {{notes}}             — customer notes or "None"
 *           {{pickup_address}}    — your market/stand address
 *           {{pickup_schedule}}   — "Tuesdays and Fridays from 12–7pm"
 *
 *         ── STAND ORDER TEMPLATE (new — copy ID to EMAILJS_STAND_TEMPLATE_ID) ─
 *         Set the "To Email" field to: {{to_email}}
 *         Template variables:
 *           {{order_id}}          — e.g. #A1B2C3D4
 *           {{customer_name}}     — customer full name
 *           {{customer_email}}    — customer email
 *           {{order_date}}        — date of purchase
 *           {{items}}             — item list with quantities
 *           {{total}}             — e.g. "$18.00"
 *           {{payment}}           — "💵 Cash" or "📧 E-Transfer"
 *
 * Step 4: Copy your Public Key from Dashboard → Account → API Keys.
 *
 * Step 5: Fill in js/env.js with all five values below.
 * ─────────────────────────────────────────────────────────────────────────────
 */

var EMAILJS_PUBLIC_KEY       = (window.__ENV__ && window.__ENV__.EMAILJS_PUBLIC_KEY)       || '';
var EMAILJS_SERVICE_ID       = (window.__ENV__ && window.__ENV__.EMAILJS_SERVICE_ID)       || '';
var EMAILJS_TEMPLATE_ID      = (window.__ENV__ && window.__ENV__.EMAILJS_TEMPLATE_ID)      || '';
var EMAILJS_STAND_TEMPLATE_ID = (window.__ENV__ && window.__ENV__.EMAILJS_STAND_TEMPLATE_ID) || '';
var PICKUP_ADDRESS           = (window.__ENV__ && window.__ENV__.PICKUP_ADDRESS)           || '';

var EMAILJS_CONFIGURED = !!(EMAILJS_PUBLIC_KEY && EMAILJS_SERVICE_ID && EMAILJS_TEMPLATE_ID);

if (EMAILJS_CONFIGURED) {
  emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
} else {
  console.warn('EmailJS is not configured. Add keys to js/env.js.');
}

/**
 * Send a confirmation email to both the customer and admin.
 * Stand orders use a short receipt template (day, items, payment).
 * Pre-orders use the full template and include pickup address/schedule.
 * Fails silently — never blocks order submission.
 *
 * @param {Object} order - The order object pushed to window.State.orders
 */
function sendOrderEmail(order) {
  if (!EMAILJS_CONFIGURED) {
    showToast('Order placed! (Email service not configured)');
    return Promise.resolve();
  }

  var adminEmail = (window.__ENV__ && window.__ENV__.PAYMENT_EMAIL) || window.State.paymentEmail || '';
  var customerEmail = order.email || '';
  var isStand = (order.fulfillment === 'Stand' || order.orderType === 'stand');
  var templateId = isStand
    ? (EMAILJS_STAND_TEMPLATE_ID || EMAILJS_TEMPLATE_ID)
    : EMAILJS_TEMPLATE_ID;

  var baseParams = isStand ? {
    order_id:       order.id          || 'N/A',
    customer_name:  order.name        || 'N/A',
    customer_email: customerEmail,
    order_date:     order.date        || 'N/A',
    items:          order.items       || 'N/A',
    total:          '$' + (order.total || '0.00'),
    payment:        order.payment     || 'N/A'
  } : {
    email:            customerEmail,
    order_id:         order.id          || 'N/A',
    customer_name:    order.name        || 'N/A',
    customer_email:   customerEmail,
    items:            order.items       || 'N/A',
    total:            '$' + (order.total || '0.00'),
    fulfillment:      order.fulfillment || 'N/A',
    delivery_address: order.address     || 'N/A',
    pickup_date:      order.date        || 'N/A',
    payment:          order.payment     || 'N/A',
    payment_email:    adminEmail,
    notes:            order.notes       || 'None',
    pickup_address:   PICKUP_ADDRESS    || 'See our social media for location',
    pickup_schedule:  'Tuesdays and Fridays from 12–7pm'
  };

  var sends = [
    emailjs.send(EMAILJS_SERVICE_ID, templateId, Object.assign({}, baseParams, {to_email: customerEmail})),
    emailjs.send(EMAILJS_SERVICE_ID, templateId, Object.assign({}, baseParams, {to_email: adminEmail}))
  ];

  return Promise.all(sends).then(
    function() {
      showToast('Order placed! Confirmation sent.');
    },
    function(err) {
      console.warn('EmailJS send failed:', err);
      showToast('Order placed! (Email notification failed — check EmailJS setup)');
    }
  );
}
