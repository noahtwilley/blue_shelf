/* === BLUE SHELF MICROBAKERY === FILE: js/order.js === */
/* Order wizard: steps 1–4, submit, reset */

var successRedirectTimer = null;

function buildOrderConfirmationUrl(name, total, email) {
  var params = new URLSearchParams();
  params.set('page', 'order');
  params.set('order_success', '1');
  params.set('name', name);
  params.set('total', Number(total).toFixed(2));
  params.set('email', email);
  return window.location.pathname + '?' + params.toString();
}

function showOrderSuccessScreen(name, email, total) {
  var firstName = (name || 'Customer').split(' ')[0];
  var parsedTotal = Number(total);
  var safeTotal = isNaN(parsedTotal) ? '0.00' : parsedTotal.toFixed(2);
  var payEmail = window.State.paymentEmail || 'blueshelfmicrobakery@gmail.com';

  document.getElementById('success-heading').textContent = 'Thank You, ' + firstName + '!';
  document.getElementById('success-subtext').textContent = 'Your order has been placed. A confirmation email has been sent to ' + email + '.';
  document.getElementById('success-amount').textContent = '$' + safeTotal;
  document.getElementById('success-payment-link').textContent = payEmail;
  document.getElementById('success-payment-link').href = 'mailto:' + payEmail;

  document.getElementById('wizard-wrap').style.display = 'none';
  document.getElementById('order-success').classList.add('show');

  if (successRedirectTimer) clearTimeout(successRedirectTimer);
  successRedirectTimer = setTimeout(function() { resetOrder(); }, 7000);
}

function hydrateOrderSuccessFromUrl() {
  var params = new URLSearchParams(window.location.search);
  if (params.get('order_success') !== '1') return false;

  showOrderSuccessScreen(
    params.get('name') || 'Customer',
    params.get('email') || 'your email',
    params.get('total') || '0'
  );

  /* Clear confirmation params so the success view does not reappear on refresh */
  window.history.replaceState({}, '', window.location.pathname);
  return true;
}

(function initOrderPageFromUrl() {
  var params = new URLSearchParams(window.location.search);
  if (params.get('page') !== 'order' || params.get('order_success') !== '1') return;

  var attempts = 0;
  var t = setInterval(function() {
    attempts++;
    if (typeof appReady === 'undefined' || !appReady || !document.getElementById('order-success')) {
      if (attempts > 120) clearInterval(t);
      return;
    }
    clearInterval(t);
    showPage('order');
    hydrateOrderSuccessFromUrl();
  }, 50);
})();

/* ─── WIZARD NAVIGATION ─────────────────────────────────────── */
function goToStep(n) {
  var S = window.State;
  if (n < 1 || n > 4) return;
  if (n > S.wizardState.step && !validateStep(S.wizardState.step)) {
    showToast('Complete this step first');
    return;
  }
  S.wizardState.step = n;
  var steps = document.querySelectorAll('.wizard-step');
  steps.forEach(function(s, i) { s.classList.toggle('active', i === n - 1); });
  updateProgressIndicator();
  /* Hide floating subtotal when not on step 3 */
  var subtotalEl = document.getElementById('floating-subtotal');
  if (subtotalEl) subtotalEl.classList.toggle('hide', n !== 3);
  if (n === 1) renderDatePicker();
  if (n === 2) renderPickupDeliveryStep();
  if (n === 3) renderProductsStep();
  if (n === 4) renderCheckoutStep();
  window.scrollTo(0, 100);
}

function updateProgressIndicator() {
  var S = window.State;
  var pills = document.querySelectorAll('.wizard-step-pill');
  var bar = document.querySelector('.wizard-bar-fill');
  var progress = (S.wizardState.step / 4) * 100;
  bar.style.width = progress + '%';
  pills.forEach(function(p, i) {
    p.classList.remove('active', 'done');
    if (i + 1 === S.wizardState.step) p.classList.add('active');
    if (i + 1 < S.wizardState.step) p.classList.add('done');
  });
}

function validateStep(n) {
  var S = window.State;
  if (n === 1) return S.wizardState.date !== null;
  if (n === 2) return S.wizardState.mode !== null && (S.wizardState.mode === 'pickup' ? true : (S.wizardState.deliveryAddr !== null && S.wizardState.deliveryAddr.trim() !== ''));
  if (n === 3) return S.cart.length > 0;
  if (n === 4) return document.getElementById('f-name').value.trim() && document.getElementById('f-email').value.trim();
  return true;
}

/* ─── STEP 1: DATE PICKER ─────────────────────────────────── */
function getAvailableDates() {
  var S = window.State;
  var dates = [];
  var today = new Date();
  today.setHours(0,0,0,0);
  for (var i = 0; i < 14; i++) {
    var d = new Date(today);
    d.setDate(d.getDate() + i);
    var iso = toLocalISO(d);
    var day = S.bakingDays[iso];
    if (day && day.active && day.pickup) {
      dates.push(d);
    }
  }
  return dates;
}

function renderDatePicker() {
  var S = window.State;
  var available = getAvailableDates();
  var grid = document.getElementById('date-picker');
  if (!available.length) {
    grid.innerHTML = '<p style="color:var(--text-muted);padding:2rem 0">No baking days available in the next 2 weeks. Check back soon!</p>';
    return;
  }
  grid.innerHTML = available.map(function(d) {
    var dateStr = toLocalISO(d);
    var dayName = d.toLocaleDateString('en-US', {weekday: 'short'});
    var dateNum = d.getDate();
    var monthName = d.toLocaleDateString('en-US', {month: 'short'});
    return '<div class="date-card' + (S.wizardState.date === dateStr ? ' selected' : '') + '" onclick="selectDate(\'' + dateStr + '\')">' +
      '<div class="date-card-day">' + dayName + '</div>' +
      '<div class="date-card-date">' + monthName + ' ' + dateNum + '</div>' +
    '</div>';
  }).join('');
}

function selectDate(dateStr) {
  window.State.wizardState.date = dateStr;
  renderDatePicker();
  document.getElementById('btn-step1-next').disabled = false;
  /* Pre-fetch availability so Step 3 renders with live stock counts */
  if (typeof refreshAvailability === 'function') {
    refreshAvailability(dateStr).then(function() { updateSoldOutBanner(dateStr); });
  }
}

/* ─── STEP 2: PICKUP / DELIVERY ───────────────────────────── */
function renderPickupDeliveryStep() {
  var S = window.State;
  var pickupCard = document.querySelector('.option-cards .option-card:nth-child(1)');
  var deliveryCard = document.querySelector('.option-cards .option-card:nth-child(2)');
  var deliveryForm = deliveryCard.querySelector('.delivery-addr-wrap');

  pickupCard.classList.toggle('selected', S.wizardState.mode === 'pickup');
  deliveryCard.classList.toggle('selected', S.wizardState.mode === 'delivery');
  deliveryForm.classList.toggle('show', S.wizardState.mode === 'delivery');
  deliveryForm.querySelector('input').value = S.wizardState.deliveryAddr || '';
  deliveryForm.querySelector('input').oninput = function(e) {
    S.wizardState.deliveryAddr = e.target.value;
    updateNextButtonState();
  };
  updateNextButtonState();
}

function selectPickupOrDelivery(mode, card) {
  window.State.wizardState.mode = mode;
  window.State.wizardState.deliveryAddr = null;
  renderPickupDeliveryStep();
}

function updateNextButtonState() {
  var S = window.State;
  var btn = document.getElementById('btn-step2-next');
  if (S.wizardState.mode === 'pickup') {
    btn.disabled = false;
  } else if (S.wizardState.mode === 'delivery') {
    btn.disabled = !S.wizardState.deliveryAddr || !S.wizardState.deliveryAddr.trim();
  } else {
    btn.disabled = true;
  }
}

/* ─── STEP 3: PRODUCTS ─────────────────────────────────────── */
function renderProductsStep() {
  var S = window.State;
  var grid = document.getElementById('wizard-products-grid');
  var date = S.wizardState.date;

  /* === PRODUCTS LOADING GUARD === */
  if (!S.productsLoaded) {
    grid.innerHTML = '<p style="color:var(--text-muted);padding:2rem 0;grid-column:1/-1">Loading products…</p>';
    document.getElementById('floating-subtotal').classList.add('hide');
    if (typeof loadProducts === 'function') {
      loadProducts().then(function() { renderProductsStep(); });
    }
    return;
  }

  /* === LIVE AVAILABILITY PATH === */
  var dayAvail = S.dailyAvailability && S.dailyAvailability[date];

  if (dayAvail === undefined) {
    /* Not yet fetched — show loading state and trigger fetch */
    grid.innerHTML = '<p style="color:var(--text-muted);padding:2rem 0;grid-column:1/-1">Loading availability…</p>';
    document.getElementById('floating-subtotal').classList.add('hide');
    if (typeof refreshAvailability === 'function') {
      refreshAvailability(date).then(function() { renderProductsStep(); });
    }
    return;
  }

  if (dayAvail && dayAvail.length > 0) {
    /* Sync live remaining into item.stock so changeQty() caps correctly */
    dayAvail.forEach(function(row) {
      var mi = S.menuItems.find(function(i) { return i.name === row.item_name; });
      if (mi) mi.stock = Math.max(0, typeof row.remaining === 'number' ? row.remaining : row.total_available);
    });

    /* Build merged items: DB availability row + matching menuItem metadata */
    var mergedItems = dayAvail.filter(function(row) {
      return row.is_active || row.total_available > 0;
    }).map(function(row) {
      var mi = S.menuItems.find(function(i) { return i.name === row.item_name; }) || {};
      return {
        id:             mi.id || null,
        name:           row.item_name,
        price:          row.item_price,
        emoji:          row.item_emoji || mi.emoji || '🧁',
        photo:          mi.photo || '',
        cat:            mi.cat   || 'bread',
        desc:           mi.desc  || '',
        customizations: mi.customizations || [],
        stock:          Math.max(0, typeof row.remaining === 'number' ? row.remaining : row.total_available),
        soldOut:        !row.is_active || row.remaining <= 0
      };
    }).filter(function(item) { return item.id !== null; }); /* skip rows not in State.menuItems */

    if (!mergedItems.length) {
      grid.innerHTML = '<p style="color:var(--text-muted);padding:2rem 0;grid-column:1/-1">No products available for this date. Try a different baking day.</p>';
      document.getElementById('floating-subtotal').classList.add('hide');
      return;
    }

    grid.innerHTML = mergedItems.map(function(item) {
      var cartItem = S.cart.find(function(c) { return c.id === item.id; });
      var qty = cartItem ? cartItem.qty : 0;
      var imgHtml;
      if (item.photo) {
        imgHtml = '<div class="wizard-product-img">' +
          '<img src="' + item.photo + '" alt="' + item.name + '" style="width:100%;height:100%;object-fit:cover" ' +
            'onerror="this.style.display=\'none\';this.nextSibling.style.display=\'flex\'" />' +
          '<span style="display:none;font-size:3.5rem;align-items:center;justify-content:center;' +
            'width:100%;height:100%;background:' + (bgMap[item.cat] || 'var(--cream-dark)') + '">' + item.emoji + '</span>' +
        '</div>';
      } else {
        imgHtml = '<div class="wizard-product-img" style="background:' + (bgMap[item.cat] || 'var(--cream-dark)') + '">' +
          '<span>' + item.emoji + '</span>' +
        '</div>';
      }
      var stockLabel = item.soldOut
        ? '<span class="stock-sold-out">Sold Out</span>'
        : '<span style="font-size:0.78rem;color:' + (item.stock <= 3 ? 'var(--red)' : 'var(--text-muted)') + '">' + item.stock + ' left</span>';

      return '<div class="wizard-product-card' + (item.soldOut ? ' wizard-product-card--soldout' : '') + '" data-item-id="' + item.id + '">' +
        imgHtml +
        (item.soldOut ? '<div class="soldout-overlay">Sold Out</div>' : '') +
        '<div class="wizard-product-body">' +
          '<div class="wizard-product-top">' +
            '<h3>' + item.name + '</h3>' +
            '<span class="wizard-product-price">$' + item.price + '</span>' +
          '</div>' +
          '<p>' + item.desc + '</p>' +
          '<div class="wizard-product-footer">' +
            stockLabel +
            '<div class="wizard-qty-controls">' +
              '<button class="qty-btn" onclick="changeQty(' + item.id + ',-1)"' + (qty === 0 || item.soldOut ? ' style="visibility:hidden"' : '') + '>\u2212</button>' +
              '<span class="qty-num" style="min-width:24px">' + qty + '</span>' +
              '<button class="qty-btn" onclick="changeQty(' + item.id + ',1)"' + (qty >= item.stock || item.soldOut ? ' disabled' : '') + '>+</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
        (item.customizations && item.customizations.length > 0 && qty > 0 ?
          '<div style="padding:1rem;border-top:1px solid var(--cream-dark);background:var(--cream)">' +
            '<div style="font-size:0.8rem;font-weight:600;margin-bottom:0.75rem;color:var(--navy)">Customizations</div>' +
            item.customizations.map(function(cust, idx) { return renderCustomizationField(item.id, idx, cust); }).join('') +
          '</div>' : '') +
      '</div>';
    }).join('');

    document.getElementById('floating-subtotal').classList.remove('hide');
    updateSubtotalBar();
    return;
  }

  /* === FALLBACK PATH: bakingDays + menuItems (no daily_availability rows for this date) === */
  var selectedDay = S.bakingDays[S.wizardState.date];
  var dayItemIds = (selectedDay && selectedDay.items) ? selectedDay.items.map(function(x) { return x.id; }) : [];

  var availableItems = S.menuItems.filter(function(i) {
    return i.active && i.stock > 0 && dayItemIds.indexOf(i.id) !== -1;
  });

  if (!availableItems.length) {
    grid.innerHTML = '<p style="color:var(--text-muted);padding:2rem 0;grid-column:1/-1">No products available for this date. Try a different baking day.</p>';
    var subtotalEl = document.getElementById('floating-subtotal');
    subtotalEl.classList.add('hide');
    return;
  }

  grid.innerHTML = availableItems.map(function(item) {
    var cartItem = S.cart.find(function(c) { return c.id === item.id; });
    var qty = cartItem ? cartItem.qty : 0;

    /* MODIFIED: photo with emoji fallback pattern (CHANGE 4) */
    var imgHtml;
    if (item.photo) {
      imgHtml = '<div class="wizard-product-img">' +
        '<img src="' + item.photo + '" alt="' + item.name + '" style="width:100%;height:100%;object-fit:cover" ' +
          'onerror="this.style.display=\'none\';this.nextSibling.style.display=\'flex\'" />' +
        '<span style="display:none;font-size:3.5rem;align-items:center;justify-content:center;' +
          'width:100%;height:100%;background:' + (bgMap[item.cat] || 'var(--cream-dark)') + '">' + item.emoji + '</span>' +
      '</div>';
    } else {
      imgHtml = '<div class="wizard-product-img" style="background:' + (bgMap[item.cat] || 'var(--cream-dark)') + '">' +
        '<span>' + item.emoji + '</span>' +
      '</div>';
    }

    return '<div class="wizard-product-card" data-item-id="' + item.id + '">' +
      imgHtml +
      '<div class="wizard-product-body">' +
        '<div class="wizard-product-top">' +
          '<h3>' + item.name + '</h3>' +
          '<span class="wizard-product-price">$' + item.price + '</span>' +
        '</div>' +
        '<p>' + item.desc + '</p>' +
        '<div class="wizard-product-footer">' +
          '<span style="font-size:0.78rem;color:var(--text-muted)">' + item.stock + ' left</span>' +
          '<div class="wizard-qty-controls">' +
            '<button class="qty-btn" onclick="changeQty(' + item.id + ',-1)"' + (qty === 0 ? ' style="visibility:hidden"' : '') + '>\u2212</button>' +
            '<span class="qty-num" style="min-width:24px">' + qty + '</span>' +
            '<button class="qty-btn" onclick="changeQty(' + item.id + ',1)"' + (qty >= item.stock ? ' disabled' : '') + '>+</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      (item.customizations && item.customizations.length > 0 && qty > 0 ?
        '<div style="padding:1rem;border-top:1px solid var(--cream-dark);background:var(--cream)">' +
          '<div style="font-size:0.8rem;font-weight:600;margin-bottom:0.75rem;color:var(--navy)">Customizations</div>' +
          item.customizations.map(function(cust, idx) { return renderCustomizationField(item.id, idx, cust); }).join('') +
        '</div>' : '') +
    '</div>';
  }).join('');

  var subtotal = document.getElementById('floating-subtotal');
  subtotal.classList.remove('hide');
  updateSubtotalBar();
}

function renderCustomizationField(itemId, custIdx, cust) {
  if (!cust) return '';
  var fieldHtml;
  if (cust.type === 'text') {
    fieldHtml = '<input type="text" placeholder="Enter ' + cust.label + '" style="width:100%;padding:0.4rem;border:1px solid var(--cream-dark);border-radius:8px;font-size:0.85rem;outline:none" />';
  } else if (cust.type === 'select') {
    fieldHtml = '<select style="width:100%;padding:0.4rem;border:1px solid var(--cream-dark);border-radius:8px;font-size:0.85rem;outline:none;font-family:\'DM Sans\'">' +
      '<option value="">Choose ' + cust.label + '...</option>' +
      (cust.options || []).map(function(opt) { return '<option value="' + opt + '">' + opt + '</option>'; }).join('') +
    '</select>';
  } else {
    fieldHtml = '<label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;font-size:0.85rem"><input type="checkbox" style="cursor:pointer" /> ' + cust.label + '</label>';
  }
  return '<div style="margin-bottom:0.75rem"><label style="display:block;font-size:0.75rem;color:var(--text-muted);margin-bottom:0.3rem;font-weight:600">' + cust.label + (cust.required ? ' *' : '') + '</label>' + fieldHtml + '</div>';
}

function updateSubtotalBar() {
  var S = window.State;
  var itemCount = S.cart.reduce(function(s, c) { return s + c.qty; }, 0);
  var itemTotal = S.cart.reduce(function(s, c) {
    var item = S.menuItems.find(function(i) { return i.id === c.id; });
    return s + (item ? item.price * c.qty : 0);
  }, 0);
  var total = S.wizardState.mode === 'delivery' ? itemTotal + S.deliveryFee : itemTotal;
  document.getElementById('subtotal-items').textContent = itemCount + ' item' + (itemCount === 1 ? '' : 's');
  document.getElementById('subtotal-total').textContent = '$' + total.toFixed(2);
  document.getElementById('btn-step3-next').disabled = S.cart.length === 0;
}

/* ─── STEP 4: CHECKOUT ─────────────────────────────────────── */
function renderCheckoutStep() {
  var S = window.State;
  var itemTotal = S.cart.reduce(function(s, c) {
    var item = S.menuItems.find(function(i) { return i.id === c.id; });
    return s + (item ? item.price * c.qty : 0);
  }, 0);
  var total = S.wizardState.mode === 'delivery' ? itemTotal + S.deliveryFee : itemTotal;
  var dateObj = new Date(S.wizardState.date + 'T00:00:00');
  var dateFormatted = dateObj.toLocaleDateString('en-US', {weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'});

  /* MODIFIED: renamed to avoid confusion — "Pickup" or delivery address (CHANGE 5) */
  var modeLabel = S.wizardState.mode === 'pickup' ? 'Pickup' : S.wizardState.deliveryAddr;

  var summary = document.getElementById('checkout-summary');
  summary.innerHTML =
    '<div class="summary-item">' +
      '<div class="summary-label">Selected Date</div>' +
      '<div class="summary-value">' + dateFormatted + '</div>' +
    '</div>' +
    '<div class="summary-item">' +
      '<div class="summary-label">' + (S.wizardState.mode === 'pickup' ? 'Method' : 'Delivery Address') + '</div>' +
      '<div class="summary-value">' + modeLabel + '</div>' +
    '</div>' +
    '<div class="summary-item">' +
      '<div class="summary-label">Order Items</div>' +
      '<ul class="summary-items-list">' +
        S.cart.map(function(c) {
          var item = S.menuItems.find(function(i) { return i.id === c.id; });
          return '<li>' + item.emoji + ' ' + item.name + ' <strong>\u00D7' + c.qty + '</strong> \u2014 $' + (item.price * c.qty).toFixed(2) + '</li>';
        }).join('') +
      '</ul>' +
    '</div>' +
    '<div class="summary-item">' +
      '<div class="summary-label">Subtotal</div>' +
      '<div class="summary-value">$' + itemTotal.toFixed(2) + '</div>' +
    '</div>' +
    (S.wizardState.mode === 'delivery' ?
      '<div class="summary-item">' +
        '<div class="summary-label">Delivery Fee</div>' +
        '<div class="summary-value">+$' + S.deliveryFee.toFixed(2) + '</div>' +
      '</div>' : '') +
    '<div class="summary-item summary-total">' +
      '<div class="summary-label">Total Due</div>' +
      '<div class="summary-total-value">$' + total.toFixed(2) + '</div>' +
    '</div>';
}

/* ─── SUBMIT ───────────────────────────────────────────────── */
function submitWizardOrder() {
  var S = window.State;
  var name = document.getElementById('f-name').value.trim();
  var email = document.getElementById('f-email').value.trim();
  var phone = document.getElementById('f-phone').value.trim();
  var notes = document.getElementById('f-notes').value;
  var submitBtn = document.getElementById('submit-btn');
  var originalSubmitLabel = submitBtn.textContent;

  if (!name || !email || !phone) { showToast('Please fill in your name, email, and phone'); return; }
  if (!S.cart.length) { showToast('Your cart is empty!'); return; }

  var itemTotal = S.cart.reduce(function(s, c) {
    var item = S.menuItems.find(function(i) { return i.id === c.id; });
    return s + (item ? item.price * c.qty : 0);
  }, 0);
  var total = S.wizardState.mode === 'delivery' ? itemTotal + S.deliveryFee : itemTotal;
  var payment = document.querySelector('.payment-option.selected label').textContent.trim();

  var dbItems = S.cart.map(function(c) {
    var item = S.menuItems.find(function(i) { return i.id === c.id; });
    return {
      name:  item ? item.name  : 'Unknown Item',
      price: item ? Number(item.price) : 0,
      qty:   c.qty
    };
  });

  var orderPayload = {
    name: name,
    email: email,
    phone: phone,
    items: dbItems,
    quantity: S.cart.reduce(function(sum, c) { return sum + c.qty; }, 0),
    pickup_date: S.wizardState.date,
    notes: notes,
    total: Number(total.toFixed(2))
  };

  if (typeof placeOrderRpc !== 'function' && typeof saveOrder !== 'function') {
    showToast('Order service is not configured yet.');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Placing order...';

  var orderFn = typeof placeOrderRpc === 'function' ? placeOrderRpc : saveOrder;
  orderFn(orderPayload).then(function(savedOrder) {
    /* Deduct stock only after persistence succeeds */
    S.cart.forEach(function(c) {
      var item = S.menuItems.find(function(i) { return i.id === c.id; });
      if (item) item.stock = Math.max(0, item.stock - c.qty);
    });

    var fulfillment = S.wizardState.mode === 'pickup' ? 'Pickup' : 'Delivery';
    var modeLabel = fulfillment === 'Pickup' ? 'Pickup' : 'Delivery - ' + S.wizardState.deliveryAddr;
    var order = {
      id:           savedOrder.id || ('BSM-' + String(S.orders.length + 1).padStart(3, '0')),
      name:         name,
      email:        email,
      phone:        phone,
      date:         S.wizardState.date,
      time:         modeLabel,
      payment:      payment,
      items:        S.cart.map(function(c) {
                      var item = S.menuItems.find(function(i) { return i.id === c.id; });
                      return item.emoji + ' ' + item.name + ' \u00D7' + c.qty;
                    }).join(', '),
      total:        total.toFixed(2),
      paid:         false,
      received:     false,
      notes:        notes,
      mode:         S.wizardState.mode,
      deliveryAddr: S.wizardState.deliveryAddr,
      fulfillment:  fulfillment,
      address:      S.wizardState.deliveryAddr || null
    };

    S.orders.push(order);

    S.cart = [];
    updateCartBadge();

    var confirmUrl = buildOrderConfirmationUrl(name, total, email);
    sendOrderEmail(order).then(function() {
      window.location.href = confirmUrl;
    }, function() {
      window.location.href = confirmUrl;
    });
  }).catch(function(err) {
    console.warn('Supabase save failed:', err);
    showToast('We could not place your order right now. Please try again.');
    submitBtn.disabled = false;
    submitBtn.textContent = originalSubmitLabel;
  });
}

function resetWizard() {
  var S = window.State;
  S.wizardState = {step: 1, date: null, mode: null, deliveryAddr: null};
  document.getElementById('floating-subtotal').classList.add('hide');
  ['f-name', 'f-email', 'f-phone', 'f-notes'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });
}

function resetOrder() {
  if (successRedirectTimer) { clearTimeout(successRedirectTimer); successRedirectTimer = null; }
  document.getElementById('wizard-wrap').style.display = 'block';
  document.getElementById('order-success').classList.remove('show');
  resetWizard();
  showPage('menu');
}

function goBackNow() {
  if (successRedirectTimer) { clearTimeout(successRedirectTimer); successRedirectTimer = null; }
  resetOrder();
}
