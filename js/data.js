/* === BLUE SHELF MICROBAKERY === FILE: js/data.js === */
/* Global state: menu items, orders, cart, baking days, wizard state */

/* Placeholder images in pictures/ — swap in real photos using the same filenames */
var photoMap = {
  1: 'pictures/sourdough-round-loaf-classic.jpg',
  2: 'pictures/sourdough-round-loaf-jalapeno-cheddar.jpg',
  3: 'pictures/sourdough-croissant.jpg',
  4: 'pictures/apple-fritter-loaf.jpg',
  5: 'pictures/sourdough-chocolate-chip-cookies.jpg'
};

window.State = {
  /* MODIFIED: added photo field to each item from photoMap (CHANGE 4) */
  menuItems: [
    {id:1,name:'Sourdough Round Loaf - Classic',cat:'bread',price:10,emoji:'🍞',photo:photoMap[1],desc:'Long-ferment sourdough with a crackling crust and open, airy crumb.',stock:8,active:true,customizations:[]},
    {id:2,name:'Sourdough Round Loaf - Jalapeno Cheddar',cat:'bread',price:12,emoji:'🥐',photo:photoMap[2],desc:'Buttery, flaky, laminated croissants baked fresh every morning.',stock:12,active:true,customizations:[]},
    {id:3,name:'Sourdough - Croissant',cat:'bread',price:15,emoji:'🍫',photo:photoMap[3],desc:'Enriched dough swirled with dark chocolate and a hint of orange zest.',stock:4,active:true,customizations:[]},
    {id:4,name:'Apple Fritter Loaf',cat:'cake',price:7,emoji:'🍋',photo:photoMap[4],desc:'Silky lemon curd in a buttery shortcrust shell. Perfectly tart.',stock:6,active:true,customizations:[]},
    {id:5,name:'Sourdough - Chocolate Chip Cookies',cat:'sweet',price:14,emoji:'🌀',photo:photoMap[5],desc:'Pillowy rolls finished with brown butter cream cheese frosting.',stock:0,active:true,customizations:[]},
     ],

  cart: [],
  orders: [],
  paymentEmail: (window.__ENV__ && window.__ENV__.PAYMENT_EMAIL) || 'blueshelfmicrobakery@gmail.com',
  activeFilter: 'all',
  adminUnlocked: false,

  /* bakingDays: keyed by ISO date strings (e.g. "2026-04-14") */
  bakingDays: {},

  wizardState: {
    step: 1,
    date: null,
    mode: null,
    deliveryAddr: null
  },

  deliveryFee: 2.00,

  /* Calendar navigation state for admin baking days */
  calendarMonth: new Date().getMonth(),
  calendarYear: new Date().getFullYear(),
  calendarSelectedDate: null,

  /* MODIFIED: replaced summaryFilter with granular day+product filters (CHANGE 2) */
  summaryFilter: 'all',            /* kept for backwards compat */
  summaryDayFilter: 'all',         /* MODIFIED: day dropdown filter (CHANGE 2) */
  summaryProductFilter: 'all',     /* MODIFIED: product dropdown filter (CHANGE 2) */
  daySummaryExpanded: {},          /* MODIFIED: tracks which day cards are open (CHANGE 2) */
  daySummarySliderMode: {},        /* MODIFIED: 'fulfillment' or 'items' per day (CHANGE 2) */

  /* MODIFIED: orders filter state for Pickup/Delivery segmented control (CHANGE 5) */
  ordersFilter: 'all',             /* 'all', 'pickup', or 'delivery' */

  /* Daily availability from Supabase: keyed by ISO date, value is array of availability rows.
     undefined = not yet fetched; [] = fetched but no rows (fall back to bakingDays); [...] = live data */
  dailyAvailability: {},

  /* Specific dates that are active for ordering, keyed by ISO date e.g. "2026-04-24": true.
     Populated by initActiveDays() from the active_days Supabase table. */
  activeDays: {}
};

/* Timezone-safe ISO date helper: returns "YYYY-MM-DD" in local time */
function toLocalISO(d) {
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  var day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

/* Seed / re-seed State.bakingDays for the next 56 days based on State.activeDays.
   activeDays is keyed by ISO date string — only those specific dates are active. */
function reseedBakingDays() {
  var S = window.State;
  S.bakingDays = {};
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var defaultItems = S.menuItems.filter(function(i) { return i.active; })
    .map(function(i) { return {id: i.id, qty: i.stock}; });
  for (var i = 0; i < 56; i++) {
    var d = new Date(today);
    d.setDate(d.getDate() + i);
    var iso = toLocalISO(d);
    if (S.activeDays[iso]) {
      S.bakingDays[iso] = {active: true, notes: '', pickup: true,
        items: defaultItems.map(function(x) { return {id: x.id, qty: x.qty}; })};
    }
  }
}

/* Initial seed — empty until Supabase loads, since active days are now date-specific. */
reseedBakingDays();

/**
 * Fetch active_days from Supabase, update State.activeDays (keyed by ISO date),
 * and re-seed bakingDays so the order wizard reflects the persisted schedule.
 */
function initActiveDays() {
  if (typeof fetchActiveDays !== 'function') return;
  fetchActiveDays().then(function(rows) {
    var S = window.State;
    S.activeDays = {};
    (rows || []).forEach(function(row) {
      if (row.date && row.is_active) S.activeDays[row.date] = true;
    });
    reseedBakingDays();
  }).catch(function(err) {
    console.warn('Could not load active days from Supabase:', err.message);
  });
}
