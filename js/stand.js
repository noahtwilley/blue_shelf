/* === BLUE SHELF MICROBAKERY === FILE: js/stand.js === */
/* Mobile-first in-person "stand" kiosk page. Reached via QR code → ?page=stand. */
/* Reuses the shared cart (State.cart), availability, persistence, and email layers. */

/* ─── NAVIGATION ────────────────────────────────────────────── */
/* Dedicated show function — the stand page has no nav tab, so it can't use showPage(). */
function showStandPage() {
  if (typeof appReady !== 'undefined' && !appReady) return;
  if (typeof stopAvailabilityPolling === 'function') stopAvailabilityPolling();
  document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
  document.querySelectorAll('.nav-tab').forEach(function(t) { t.classList.remove('active'); });
  /* Hide the global nav for a clean kiosk view */
  var nav = document.querySelector('nav');
  if (nav) nav.style.display = 'none';
  document.getElementById('page-stand').classList.add('active');

  var S = window.State;
  var today = toLocalISO(new Date());
  S.wizardState.date = today;
  S.wizardState.mode = 'stand';
  S.wizardState.orderType = 'stand';
  S.cart = [];

  var dateLabel = document.getElementById('stand-date-label');
  if (dateLabel) {
    dateLabel.textContent = new Date(today + 'T00:00:00')
      .toLocaleDateString('en-US', {weekday: 'long', month: 'long', day: 'numeric'});
  }
  document.getElementById('stand-success').classList.remove('show');
  document.getElementById('stand-order-screen').style.display = '';

  var _loadP = (typeof loadProducts === 'function' && !S.productsLoaded) ? loadProducts() : Promise.resolve();
  _loadP.then(function() {
    if (typeof refreshAvailability === 'function') {
      refreshAvailability(today).then(function() { renderStand(); });
    } else {
      renderStand();
    }
  });
  window.scrollTo(0, 0);
}

/* ─── PRODUCT RENDER ────────────────────────────────────────── */
/* Builds today's available items from live daily_availability, mirroring the
   merge in renderProductsStep() (js/order.js) but rendered as compact mobile rows. */
function standMergedItems() {
  var S = window.State;
  var date = S.wizardState.date;
  var dayAvail = S.dailyAvailability && S.dailyAvailability[date];

  if (dayAvail && dayAvail.length > 0) {
    /* Sync live remaining into item.stock so changeQty caps correctly */
    dayAvail.forEach(function(row) {
      var mi = S.menuItems.find(function(i) { return i.name === row.item_name; });
      if (mi) mi.stock = Math.max(0, typeof row.remaining === 'number' ? row.remaining : row.total_available);
    });
    return dayAvail.filter(function(row) { return row.is_active || row.total_available > 0; }).map(function(row) {
      var mi = S.menuItems.find(function(i) { return i.name === row.item_name; }) || {};
      return {
        id:      mi.id || null,
        name:    row.item_name,
        price:   mi.price != null ? mi.price : row.item_price,
        emoji:   row.item_emoji || mi.emoji || '🧁',
        photo:   mi.photo || '',
        cat:     mi.cat || 'bread',
        stock:   Math.max(0, typeof row.remaining === 'number' ? row.remaining : row.total_available),
        soldOut: !row.is_active || row.remaining <= 0
      };
    }).filter(function(item) { return item.id !== null; });
  }

  /* Fallback: bakingDays + menuItems when no availability rows exist for today */
  var selectedDay = S.bakingDays[date];
  var dayItemIds = (selectedDay && selectedDay.items) ? selectedDay.items.map(function(x) { return x.id; }) : [];
  return S.menuItems.filter(function(i) {
    return i.active && i.stock > 0 && (dayItemIds.length === 0 || dayItemIds.indexOf(i.id) !== -1);
  }).map(function(i) {
    return { id: i.id, name: i.name, price: i.price, emoji: i.emoji, photo: i.photo,
             cat: i.cat, stock: i.stock, soldOut: i.stock <= 0 };
  });
}

function renderStand() {
  var S = window.State;
  var grid = document.getElementById('stand-products-grid');
  if (!grid) return;

  if (!S.productsLoaded) {
    grid.innerHTML = '<p style="color:var(--text-muted);padding:1.5rem 0">Loading…</p>';
    return;
  }

  var items = standMergedItems();
  if (!items.length) {
    grid.innerHTML = '<p style="color:var(--text-muted);padding:1.5rem 0">Nothing available right now — check back soon!</p>';
    updateStandSubtotal();
    return;
  }

  grid.innerHTML = items.map(function(item) {
    var cartItem = S.cart.find(function(c) { return c.id === item.id; });
    var qty = cartItem ? cartItem.qty : 0;
    var imgHtml = item.photo
      ? '<div class="stand-card-img"><img src="' + item.photo + '" alt="' + item.name + '" ' +
          'onerror="this.style.display=\'none\';this.parentNode.textContent=\'' + item.emoji + '\'" /></div>'
      : '<div class="stand-card-img" style="background:' + (bgMap[item.cat] || 'var(--cream-dark)') + '">' + item.emoji + '</div>';
    var stockHtml = item.soldOut
      ? '<span class="stand-soldout-tag">Sold out</span>'
      : '<span class="stand-card-stock' + (item.stock <= 3 ? ' low' : '') + '">' + item.stock + ' left</span>';

    return '<div class="stand-card' + (item.soldOut ? ' stand-card--soldout' : '') + '" data-item-id="' + item.id + '">' +
      imgHtml +
      '<div class="stand-card-body">' +
        '<div class="stand-card-name">' + item.name + '</div>' +
        '<div class="stand-card-meta"><span class="stand-card-price">$' + item.price + '</span>' + stockHtml + '</div>' +
      '</div>' +
      '<div class="stand-qty">' +
        '<button class="stand-qty-btn' + (qty === 0 || item.soldOut ? ' hidden' : '') + '" onclick="standChangeQty(' + item.id + ',-1)">−</button>' +
        '<span class="stand-qty-num">' + qty + '</span>' +
        '<button class="stand-qty-btn" onclick="standChangeQty(' + item.id + ',1)"' + (qty >= item.stock || item.soldOut ? ' disabled' : '') + '>+</button>' +
      '</div>' +
    '</div>';
  }).join('');

  updateStandSubtotal();
}

/* ─── CART ──────────────────────────────────────────────────── */
function standChangeQty(id, delta) {
  var S = window.State;
  var item = S.menuItems.find(function(i) { return i.id === id; });
  if (!item) return;
  var c = S.cart.find(function(ci) { return ci.id === id; });
  if (!c) {
    if (delta > 0) S.cart.push({id: id, qty: 1}); else return;
  } else {
    c.qty += delta;
    if (c.qty <= 0) { S.cart = S.cart.filter(function(x) { return x.id !== id; }); }
    else if (c.qty > item.stock) { c.qty = item.stock; showToast('Max stock reached.'); return; }
  }
  if (typeof updateCartBadge === 'function') updateCartBadge();
  renderStand();
}

function updateStandSubtotal() {
  var S = window.State;
  var count = S.cart.reduce(function(s, c) { return s + c.qty; }, 0);
  var total = S.cart.reduce(function(s, c) {
    var item = S.menuItems.find(function(i) { return i.id === c.id; });
    return s + (item ? item.price * c.qty : 0);
  }, 0);
  document.getElementById('stand-subtotal-items').textContent = count + ' item' + (count === 1 ? '' : 's');
  document.getElementById('stand-subtotal-total').textContent = '$' + total.toFixed(2);
  document.getElementById('stand-checkout-bar').classList.toggle('hide', count === 0);
}

/* ─── PAYMENT TOGGLE ────────────────────────────────────────── */
function selectStandPayment(btn) {
  document.querySelectorAll('.stand-pay-option').forEach(function(b) { b.classList.remove('selected'); });
  btn.classList.add('selected');
}

/* ─── SUBMIT ────────────────────────────────────────────────── */
function submitStandOrder() {
  var S = window.State;
  var name = document.getElementById('stand-f-name').value.trim();
  var phone = document.getElementById('stand-f-phone').value.trim();
  var email = document.getElementById('stand-f-email').value.trim();
  var notes = document.getElementById('stand-f-notes').value;
  var payEl = document.querySelector('.stand-pay-option.selected');
  var payment = payEl ? payEl.getAttribute('data-pay') : '💵 Cash';
  var btn = document.getElementById('stand-place-btn');

  if (!name || !phone) { showToast('Please add a name and phone number'); return; }
  if (!email) { showToast('Please add an email address'); return; }
  if (!S.cart.length) { showToast('Add at least one item'); return; }

  var total = S.cart.reduce(function(s, c) {
    var item = S.menuItems.find(function(i) { return i.id === c.id; });
    return s + (item ? item.price * c.qty : 0);
  }, 0);

  var dbItems = S.cart.map(function(c) {
    var item = S.menuItems.find(function(i) { return i.id === c.id; });
    return { name: item ? item.name : 'Unknown Item', price: item ? Number(item.price) : 0, qty: c.qty };
  });

  var payload = {
    name: name,
    email: email,
    phone: phone,
    items: dbItems,
    quantity: S.cart.reduce(function(sum, c) { return sum + c.qty; }, 0),
    pickup_date: S.wizardState.date,
    fulfillment: 'Stand',
    delivery_address: null,
    payment: payment,
    paid: false,
    received: false,
    notes: notes,
    total: Number(total.toFixed(2))
  };

  if (typeof saveOrder !== 'function') {
    showToast('Order service is not configured yet.'); return;
  }

  btn.disabled = true;
  var originalLabel = btn.textContent;
  btn.textContent = 'Placing…';

  saveOrder(payload).then(function(saved) {
    /* Deduct stock locally after persistence succeeds */
    S.cart.forEach(function(c) {
      var item = S.menuItems.find(function(i) { return i.id === c.id; });
      if (item) item.stock = Math.max(0, item.stock - c.qty);
    });

    var order = {
      id:       saved.id ? '#' + String(saved.id).substring(0, 8).toUpperCase() : '#' + String(S.orders.length + 1).padStart(8, '0'),
      _dbId:    saved.id || null,
      name:     name,
      email:    email || '',
      phone:    phone,
      date:     S.wizardState.date,
      time:     'Stand Order',
      payment:  payment,
      items:    S.cart.map(function(c) {
                  var item = S.menuItems.find(function(i) { return i.id === c.id; });
                  return item.emoji + ' ' + item.name + ' ×' + c.qty;
                }).join(', '),
      total:    total.toFixed(2),
      paid:     false,
      received: false,
      notes:    notes,
      mode:     'stand',
      deliveryAddr: null,
      fulfillment: 'Stand',
      address:  null,
      orderType: 'stand'
    };

    S.orders.push(order);
    S.cart = [];
    if (typeof updateCartBadge === 'function') updateCartBadge();

    var done = function() { showStandSuccess(name, payment, total.toFixed(2)); btn.disabled = false; btn.textContent = originalLabel; };
    if (typeof sendOrderEmail === 'function') {
      sendOrderEmail(order).then(done, done);
    } else {
      done();
    }
  }).catch(function(err) {
    console.warn('Supabase save failed:', err);
    showToast('Could not place the order. Please try again.');
    btn.disabled = false;
    btn.textContent = originalLabel;
  });
}

/* ─── SUCCESS / RESET ───────────────────────────────────────── */
function showStandSuccess(name, payment, total) {
  var first = (name || 'there').split(' ')[0];
  document.getElementById('stand-success-heading').textContent = 'Thanks, ' + first + '!';

  var etransferCard = document.getElementById('stand-etransfer-card');
  var isEtransfer = payment && payment.toLowerCase().indexOf('transfer') !== -1;

  if (isEtransfer && etransferCard) {
    var payEmail = (window.State && window.State.paymentEmail) || '';
    var amountStr = total ? '$' + total : '';
    document.getElementById('stand-etransfer-amount').textContent = amountStr;
    var copyBtn = document.getElementById('stand-etransfer-copy');
    copyBtn.textContent = payEmail;
    copyBtn.setAttribute('data-email', payEmail);
    etransferCard.style.display = 'block';
    document.getElementById('stand-success-sub').textContent = 'Your order is in — please send your e-transfer now.';
  } else {
    if (etransferCard) etransferCard.style.display = 'none';
    document.getElementById('stand-success-sub').textContent = 'Your order is in. Enjoy!';
  }

  document.getElementById('stand-success').classList.add('show');
  document.getElementById('stand-checkout-bar').classList.add('hide');
}

function copyEtransferEmail() {
  var btn = document.getElementById('stand-etransfer-copy');
  var email = btn ? btn.getAttribute('data-email') : '';
  if (!email) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(email).then(function() {
      var orig = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(function() { btn.textContent = orig; }, 2000);
    });
  } else {
    /* Fallback for older mobile browsers */
    var ta = document.createElement('textarea');
    ta.value = email;
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    var orig = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(function() { btn.textContent = orig; }, 2000);
  }
}

function standNextCustomer() {
  var S = window.State;
  S.cart = [];
  if (typeof updateCartBadge === 'function') updateCartBadge();
  ['stand-f-name', 'stand-f-phone', 'stand-f-email', 'stand-f-notes'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });
  /* Reset payment to Cash */
  document.querySelectorAll('.stand-pay-option').forEach(function(b, i) { b.classList.toggle('selected', i === 0); });
  document.getElementById('stand-success').classList.remove('show');
  document.getElementById('stand-order-screen').style.display = '';
  /* Re-fetch today's stock for the next customer */
  var today = toLocalISO(new Date());
  if (typeof refreshAvailability === 'function') {
    refreshAvailability(today).then(function() { renderStand(); });
  } else {
    renderStand();
  }
  window.scrollTo(0, 0);
}

/* ─── DEEP-LINK INIT (mirrors initOrderPageFromUrl in js/order.js) ─── */
(function initStandPageFromUrl() {
  var params = new URLSearchParams(window.location.search);
  if (params.get('page') !== 'stand') return;

  var attempts = 0;
  var t = setInterval(function() {
    attempts++;
    if (typeof appReady === 'undefined' || !appReady || !document.getElementById('page-stand')) {
      if (attempts > 120) clearInterval(t);
      return;
    }
    clearInterval(t);
    showStandPage();
    /* Clean the query string so a refresh of the SPA root doesn't re-trigger */
    window.history.replaceState({}, '', window.location.pathname);
  }, 50);
})();
