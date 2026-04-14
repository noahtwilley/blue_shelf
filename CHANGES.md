# Blue Shelf — Phase 3 Changes

## CHANGE 1 — EmailJS Order Confirmation Email

**Files modified:** `index.html`, `js/email.js` (new), `js/order.js`

Adds automatic email notification to `noahj.twilley@gmail.com` on every successful order submission. Uses the EmailJS browser SDK (CDN, no backend required).

- `index.html`: loads EmailJS CDN from jsDelivr before `</head>`; loads `js/email.js` in script block
- `js/email.js` (new): full 5-step setup instructions in comments (account → service → template → API key → configure placeholders); three config constants (`EMAILJS_PUBLIC_KEY`, `EMAILJS_SERVICE_ID`, `EMAILJS_TEMPLATE_ID`); `sendOrderEmail(order)` sends 10 template variables; success toast "Order placed! Confirmation sent."; silent failure toast (never blocks the order)
- `js/order.js`: calls `sendOrderEmail(order)` after the order is pushed to `window.State.orders`; adds `fulfillment` and `address` fields to the order object (required by the email template)

**Setup required:** Replace the three `YOUR_*` placeholder strings in `js/email.js` with real EmailJS credentials. See the comment block at the top of that file for step-by-step instructions.

---

## CHANGE 2 — Enhanced Day Summary Tab

**Files modified:** `js/admin.js`, `js/data.js`

Completely replaces the old flat order-list day summary with a rich, interactive interface.

- **Filter bar**: "Filter by Day" and "Filter by Product" `<select>` dropdowns + "Clear Filters" button. State tracked in `State.summaryDayFilter` and `State.summaryProductFilter`.
- **Deliveries jump dropdown**: "🚗 Deliveries Today" select scrolls to the day card matching the chosen date.
- **Collapsible day cards**: each card shows date label, revenue, order count, pickup badge, delivery badge, and a chevron toggle. Expand/collapse state stored in `State.daySummaryExpanded`.
- **Fulfillment / Items segmented slider**: inside each expanded card, a two-button toggle switches between views. Slider mode stored in `State.daySummarySliderMode`.
  - *Fulfillment view*: two-column grid — Pickups on the left, Deliveries on the right (with address).
  - *Items view*: products grouped by name, showing total qty baked and a customer list per product.
- New helper functions: `setSummaryDayFilter`, `setSummaryProductFilter`, `clearSummaryFilters`, `toggleDaySummaryCard`, `setDaySummarySlider`, `scrollToDeliveryDay`

---

## CHANGE 3 — Menu Page Showcase Mode

**Files modified:** `js/menu.js`, `css/menu.css`, `pages/menu.html`

Transforms the Menu page from a transactional product grid into a read-only visual showcase.

- **Removed** from each card: "Add +" button, stock count label, sold-out overlay and unavailability text
- **Added** to each card: category pill tag (colours: Bread = muted, Pastry = blue, Sweet = blush, Cake = green) via `catTagMap`
- **CTA banner** (`div.menu-cta-banner`) added above the filter buttons: "Ready to order? Pick your baking date and customize your box." with an "Order Now →" link that navigates to the order wizard
- Card image height increased from `150px` to `200px`
- Card hover changed from `translateY(-5px)` to `scale(1.03)` for a more photogenic feel
- `isItemAvailable`, `addToCart`, `changeQty`, `selectPayment` kept intact (used by the order wizard)

---

## CHANGE 4 — Product Photos with Emoji Fallback

**Files modified:** `js/data.js`, `js/menu.js`, `js/order.js`, `js/admin.js`, `pages/admin.html`

Replaces emoji-only displays with real Unsplash product photos, with a graceful emoji fallback on load error.

- `js/data.js`: `photoMap` constant maps item IDs 1–9 to Unsplash CDN URLs; `photo: photoMap[n]` field added to every `menuItem`
- `js/menu.js`: menu showcase cards use `<img>` when `item.photo` is set; on `onerror` the img is hidden and adjacent hidden `<span>` (with emoji + gradient background) is shown via `display:flex`
- `js/order.js`: same `<img>` + `<span>` fallback pattern applied to wizard step 3 product cards
- `js/admin.js`:
  - Products tab: each row shows a 40×40px photo thumbnail (emoji fallback if no photo); per-product "Photo URL" text input (`oninput` calls `updatePhoto(id, url)`)
  - `updatePhoto(id, url)` mutates `item.photo` in state
  - "Add Product" form: reads `document.getElementById('add-photo').value` for the new product's photo URL
- `pages/admin.html`: "Photo URL (optional)" `<input id="add-photo">` added as a full-width row in the Add Product form grid

---

## CHANGE 5 — Fulfillment Column and Filter in Orders Tab

**Files modified:** `js/data.js`, `js/order.js`, `js/admin.js`

Adds first-class fulfillment visibility to the Orders admin tab.

- **New order fields**: `fulfillment` ("Pickup" or "Delivery") and `address` (delivery address or `null`). Legacy `mode` and `deliveryAddr` fields retained for backwards compatibility with existing orders.
- **Fulfillment column**: added between Customer and Total in the orders table. Shows a pill tag — `🏠 Pickup` (blue) or `🚗 Delivery` (blush) — with the delivery address displayed below the tag for delivery orders.
- **Segmented filter bar** above the orders table: [All Orders] [🏠 Pickup Only] [🚗 Delivery Only]. Filter state stored in `State.ordersFilter`.
- `setOrdersFilter(val)`: updates state and re-renders orders tab
- `getOrderFulfillment(o)` and `getOrderAddress(o)`: compatibility helpers that read from either legacy (`mode`/`deliveryAddr`) or new (`fulfillment`/`address`) fields
- Table wrapped in a horizontal-scroll `<div>` to prevent layout overflow on narrow screens
