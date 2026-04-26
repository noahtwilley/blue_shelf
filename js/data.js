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
    {id:1,name:'Classic Loaf',cat:'bread',price:10,emoji:'🍞',photo:photoMap[1],desc:'Crusty sourdough with a deep golden crackle, a tender airy crumb, and a delicate tang.',stock:8,active:true,customizations:[]},
    {id:2,name:'Jalapeno Cheddar Loaf',cat:'bread',price:12,emoji:'🥐',photo:photoMap[2],desc:'Crusty sourdough with a crispy golden crust, a soft and airy crumb, and the perfect balance of smoky richness and gentle heat in every bite',stock:12,active:true,customizations:[]},
    {id:3,name:'Croissant Loaf',cat:'bread',price:15,emoji:'🍫',photo:photoMap[3],desc:'Delicate, buttery flaky layers that peel apart in soft sheets, and a light, airy crumb.',stock:4,active:true,customizations:[]},
    {id:4,name:'Apple Fritter Loaf',cat:'cake',price:8,emoji:'🍋',photo:photoMap[4],desc:'',stock:6,active:true,customizations:[]},
    {id:5,name:'Chocolate Chip Cookies',cat:'sweet',price:12,emoji:'🌀',photo:photoMap[5],desc:'',stock:0,active:true,customizations:[]},
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

  /* True once loadProducts() has resolved at least once */
  productsLoaded: false,

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

/**
 * Load menu items from Supabase and update State.menuItems.
 * Falls back silently to hardcoded defaults if Supabase is unavailable or returns nothing.
 */
function loadProducts() {
  if (typeof fetchProducts !== 'function') return Promise.resolve();
  return fetchProducts().then(function(rows) {
    if (!rows || !rows.length) return;
    window.State.menuItems = rows.map(function(row) {
      return {
        id: row.id,
        name: row.name,
        cat: row.cat,
        price: row.price,
        emoji: row.emoji,
        photo: row.photo || '',
        desc: row.desc || '',
        stock: row.stock,
        active: row.active,
        customizations: Array.isArray(row.customizations) ? row.customizations : []
      };
    });
    window.State.productsLoaded = true;
    reseedBakingDays();
  }).catch(function(err) {
    console.warn('Could not load products from Supabase, using defaults:', err.message || err);
    /* Mark loaded anyway so the wizard doesn't hang on the loading state */
    window.State.productsLoaded = true;
  });
}
