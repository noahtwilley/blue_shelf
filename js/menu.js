/* === BLUE SHELF MICROBAKERY === FILE: js/menu.js === */
/* Menu rendering, filtering, cart operations, sold-out logic */

var bgMap = {
  bread:  'linear-gradient(135deg,#f5e6c8,#e8d0a0)',
  pastry: 'linear-gradient(135deg,#e8f1f8,#c5d8e8)',
  sweet:  'linear-gradient(135deg,#fdeee8,#e8b4a0)',
  cake:   'linear-gradient(135deg,#e8f0e8,#b4d4b4)'
};

/* MODIFIED: category tag colour map for showcase cards (CHANGE 3) */
var catTagMap = {
  bread:  'muted',
  pastry: 'blue',
  sweet:  'blush',
  cake:   'green'
};

/**
 * Check whether an item is available on any upcoming active baking day.
 * An item is "available" if at least one active baking day in the next 14 days
 * includes it in that day's items list.
 */
function isItemAvailable(itemId) {
  var today = new Date();
  today.setHours(0,0,0,0);
  for (var i = 0; i < 14; i++) {
    var d = new Date(today);
    d.setDate(d.getDate() + i);
    var iso = toLocalISO(d);
    var day = window.State.bakingDays[iso];
    if (day && day.active && day.pickup) {
      if (day.items && day.items.length > 0) {
        for (var j = 0; j < day.items.length; j++) {
          if (day.items[j].id === itemId) return true;
        }
      }
    }
  }
  return false;
}

function renderMenu() {
  var S = window.State;
  var grid = document.getElementById('menu-grid');
  var items = S.menuItems.filter(function(i) {
    return i.active && (S.activeFilter === 'all' || i.cat === S.activeFilter);
  });
  if (!items.length) {
    grid.innerHTML = '<p style="color:var(--text-muted);grid-column:1/-1;padding:2rem 0">No items in this category right now.</p>';
    return;
  }
  grid.innerHTML = items.map(function(item) {
    /* MODIFIED: photo with emoji fallback; removed sold-out overlay (CHANGE 3, CHANGE 4) */
    var imgHtml;
    if (item.photo) { /* MODIFIED: use Unsplash photo when available (CHANGE 4) */
      imgHtml = '<div class="menu-card-img">' +
        '<img src="' + item.photo + '" alt="' + item.name + '" style="width:100%;height:100%;object-fit:cover" ' +
          'onerror="this.style.display=\'none\';this.nextSibling.style.display=\'flex\'" />' +
        '<span style="display:none;font-size:3.8rem;align-items:center;justify-content:center;' +
          'width:100%;height:100%;background:' + (bgMap[item.cat] || 'var(--cream-dark)') + '">' + item.emoji + '</span>' +
      '</div>';
    } else {
      imgHtml = '<div class="menu-card-img" style="background:' + (bgMap[item.cat] || 'var(--cream-dark)') + '">' +
        '<span>' + item.emoji + '</span>' +
      '</div>';
    }

    /* MODIFIED: category tag label for showcase (CHANGE 3) */
    var catLabel = {bread:'Bread', pastry:'Pastry', sweet:'Sweet', cake:'Cake'}[item.cat] || item.cat;

    /* MODIFIED: removed Add+ button, stock count, sold-out overlay — showcase mode (CHANGE 3) */
    return '<div class="menu-card">' +
      imgHtml +
      '<div class="menu-card-body">' +
        '<div class="menu-card-top">' +
          '<h3>' + item.name + '</h3>' +
          '<span class="menu-card-price">$' + item.price + '</span>' +
        '</div>' +
        '<p>' + item.desc + '</p>' +
        '<div class="menu-card-footer">' +
          '<span class="menu-cat-tag tag tag-' + (catTagMap[item.cat] || 'muted') + '">' + catLabel + '</span>' + /* MODIFIED: category tag (CHANGE 3) */
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

function filterMenu(cat, btn) {
  window.State.activeFilter = cat;
  document.querySelectorAll('.filter-btn').forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');
  renderMenu();
}

function addToCart(id) {
  var S = window.State;
  var item = S.menuItems.find(function(i) { return i.id === id; });
  if (!item || item.stock === 0) return;
  if (!isItemAvailable(id)) { showToast('Not available this week'); return; }
  var existing = S.cart.find(function(c) { return c.id === id; });
  if (existing) {
    if (existing.qty >= item.stock) { showToast('Max stock reached!'); return; }
    existing.qty++;
  } else {
    S.cart.push({id: id, qty: 1});
  }
  updateCartBadge();
  showToast(item.emoji + ' ' + item.name + ' added!');
}

function changeQty(id, delta) {
  var S = window.State;
  var item = S.menuItems.find(function(i) { return i.id === id; });
  var c = S.cart.find(function(ci) { return ci.id === id; });
  if (!c) {
    if (delta > 0) { S.cart.push({id: id, qty: 1}); }
    else return;
  } else {
    c.qty += delta;
    if (c.qty <= 0) { S.cart = S.cart.filter(function(x) { return x.id !== id; }); }
    else if (c.qty > item.stock) { c.qty = item.stock; showToast('Max stock reached.'); return; }
  }
  updateCartBadge();
  var wizard3 = document.getElementById('wizard-step-3');
  if (wizard3 && wizard3.classList.contains('active')) {
    var card = document.querySelector('.wizard-product-card[data-item-id="' + id + '"]');
    if (card) {
      var found = S.cart.find(function(ci) { return ci.id === id; });
      var newQty = found ? found.qty : 0;
      var qtySpan = card.querySelector('.qty-num');
      var minusBtn = card.querySelector('.qty-btn:first-of-type');
      var plusBtn = card.querySelector('.qty-btn:last-of-type');
      if (qtySpan) qtySpan.textContent = newQty;
      if (minusBtn) minusBtn.style.visibility = newQty === 0 ? 'hidden' : 'visible';
      if (plusBtn) plusBtn.disabled = newQty >= item.stock;
      if (item.customizations && item.customizations.length > 0) renderProductsStep();
    }
    updateSubtotalBar();
  }
}

function selectPayment(el) {
  document.querySelectorAll('.payment-option').forEach(function(o) { o.classList.remove('selected'); });
  el.classList.add('selected');
  el.querySelector('input').checked = true;
}
