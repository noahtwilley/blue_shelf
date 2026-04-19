/* === BLUE SHELF MICROBAKERY === FILE: js/email.js === */
/* MODIFIED: new file — EmailJS order confirmation handler (CHANGE 1) */

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * EMAILJS SETUP INSTRUCTIONS
 * ─────────────────────────────────────────────────────────────────────────────
 * Step 1: Go to https://emailjs.com and create a free account.
 *
 * Step 2: Add an Email Service (Gmail recommended).
 *         In the EmailJS dashboard → Email Services → Add New Service.
 *         Select Gmail, connect your Google account, give it a name.
 *         Copy the Service ID (looks like "service_xxxxxxx").
 *
 * Step 3: Create an Email Template.
 *         In the EmailJS dashboard → Email Templates → Create New Template.
 *         Use these template variables in your template body:
 *           {{order_id}}          — e.g. BSM-001
 *           {{customer_name}}     — customer full name
 *           {{customer_email}}    — customer email
 *           {{items}}             — comma-separated item list with quantities
 *           {{total}}             — order total as "$XX.XX"
 *           {{fulfillment}}       — "Pickup" or "Delivery"
 *           {{delivery_address}}  — delivery address, or "N/A" for pickup
 *           {{pickup_date}}       — ISO date string, e.g. "2026-04-14"
 *           {{payment}}           — "Cash on Pickup" or "E-Transfer"
 *           {{notes}}             — customer notes, or "None"
 *         Copy the Template ID (looks like "template_xxxxxxx").
 *
 * Step 4: Copy your Public Key.
 *         In the EmailJS dashboard → Account → API Keys → Public Key.
 *
 * Step 5: Replace the three placeholder strings below with your real values.
 *         The site will send an email to noahj.twilley@gmail.com on every order.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/* MODIFIED: replace these three values with your real EmailJS credentials (CHANGE 1) */
var EMAILJS_PUBLIC_KEY  = 'NyOukt1VkUYDWi3TY';   /* From Account > API Keys */
var EMAILJS_SERVICE_ID  = 'service_rchs3of';   /* From Email Services */
var EMAILJS_TEMPLATE_ID = 'template_slej5lx';  /* From Email Templates */
``
/* MODIFIED: initialize EmailJS with public key (CHANGE 1) */
emailjs.init(EMAILJS_PUBLIC_KEY);

/**
 * Send an order confirmation email to the admin (noahj.twilley@gmail.com).
 * Called from submitWizardOrder() in order.js after the order is pushed to State.
 * Fails silently with a toast — never blocks order submission.
 *
 * @param {Object} order - The order object freshly pushed to window.State.orders
 */
function sendOrderEmail(order) { /* MODIFIED: EmailJS send with silent error handling (CHANGE 1) */
  emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
    to_email:         'noahj.twilley@gmail.com',
    order_id:         order.id || 'N/A',
    customer_name:    order.name || 'N/A',
    customer_email:   order.email || 'N/A',
    items:            order.items || 'N/A',
    total:            '$' + (order.total || '0.00'),
    fulfillment:      order.fulfillment || 'N/A',
    delivery_address: order.address || 'N/A',
    pickup_date:      order.date || 'N/A',
    payment:          order.payment || 'N/A',
    notes:            order.notes || 'None'
  }).then(
    function() {
      /* MODIFIED: success toast (CHANGE 1) */
      showToast('Order placed! Confirmation sent.');
    },
    function(err) {
      /* MODIFIED: silent failure — never block order completion (CHANGE 1) */
      console.warn('EmailJS send failed:', err);
      showToast('Order placed! (Email notification failed \u2014 check EmailJS setup)');
    }
  );
}
