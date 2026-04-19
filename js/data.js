/* === BLUE SHELF MICROBAKERY === FILE: js/data.js === */
/* Global state: menu items, orders, cart, baking days, wizard state */

/* MODIFIED: Unsplash photo URLs for default products (CHANGE 4) */
var photoMap = {
  1: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400&q=80', /* sourdough */
  2: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=400&q=80',   /* croissants */
  3: 'https://images.unsplash.com/photo-1586444248902-2f64eddc13df?w=400&q=80',/* babka */
  4: 'https://images.unsplash.com/photo-1519915028121-7d3463d20b13?w=400&q=80',/* lemon tart */
  5: 'https://images.unsplash.com/photo-1561339429-36e837a8b8e8?w=400&q=80',   /* cinnamon rolls */
};

window.State = {
  /* MODIFIED: added photo field to each item from photoMap (CHANGE 4) */
  menuItems: [
    {id:1,name:'Sourdough Round Loaf - Classic',cat:'bread',price:10,emoji:'🍞',photo:photoMap[1],desc:'Long-ferment sourdough with a crackling crust and open, airy crumb.',stock:8,active:true,customizations:[]},
    {id:2,name:'Sourdough Round Loaf - Jalapeno Cheddar',cat:'bread',price:12,emoji:'🥐',photo:photoMap[2],desc:'Buttery, flaky, laminated croissants baked fresh every morning.',stock:12,active:true,customizations:[]},
    {id:3,name:'Sourdough - Croissant',cat:'bread',price:15,emoji:'🍫',photo:photoMap[3],desc:'Enriched dough swirled with dark chocolate and a hint of orange zest.',stock:4,active:true,customizations:[]},
    {id:4,name:'Apple Fritter Loaf',cat:'cake',price:7,emoji:'🍋',photo:photoMap[4],desc:'Silky lemon curd in a buttery shortcrust shell. Perfectly tart.',stock:6,active:true,customizations:[]},
    {id:5,name:'Sourdough - Chocolate Chip Cookies',cat:'cookies',price:14,emoji:'🌀',photo:photoMap[5],desc:'Pillowy rolls finished with brown butter cream cheese frosting.',stock:0,active:true,customizations:[]},
     ],

  cart: [],
  orders: [],
  paymentEmail: 'noahj.twilley@gmail.com',
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

  deliveryFee: 5.00,

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
  ordersFilter: 'all'              /* 'all', 'pickup', or 'delivery' */
};

/* Timezone-safe ISO date helper: returns "YYYY-MM-DD" in local time */
function toLocalISO(d) {
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  var day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

/* Seed default baking days for the next 8 weeks (Mon/Wed/Fri active)
   Each seeded day includes all currently active menu items. */
(function seedBakingDays() {
  var S = window.State;
  var today = new Date();
  today.setHours(0,0,0,0);
  var defaultItems = S.menuItems.filter(function(i) { return i.active; }).map(function(i) { return {id: i.id, qty: i.stock}; });
  for (var i = 0; i < 56; i++) {
    var d = new Date(today);
    d.setDate(d.getDate() + i);
    var dow = d.getDay(); /* 0=Sun */
    var iso = toLocalISO(d);
    if (dow === 1 || dow === 3 || dow === 5) { /* Mon, Wed, Fri */
      S.bakingDays[iso] = {active: true, notes: '', pickup: true, items: defaultItems.map(function(x) { return {id: x.id, qty: x.qty}; })};
    }
  }
})();
