/* === BLUE SHELF MICROBAKERY === FILE: js/admin.js === */
/* Admin: lock/unlock, orders tab (paid/received + filter + fulfillment col),
   day summary (dropdowns, collapsible cards, fulfillment/items slider),
   products tab (delete, photos, photo URL input),
   baking days (calendar UI with ISO keys) */

/* ─── HELPERS ────────────────────────────────────────────────── */
/* MODIFIED: compatibility helpers for old orders (mode/deliveryAddr) and new (fulfillment/address) (CHANGE 5) */
function getOrderFulfillment(o) {
  return o.fulfillment || (o.mode === 'pickup' ? 'Pickup' : 'Delivery');
}
function getOrderAddress(o) {
  return o.address || o.deliveryAddr || null;
}

/* Convert a raw Supabase orders row into the shape State.orders expects. */
function normalizeDbOrder(row) {
  /* MODIFIED: items in DB is JSONB [{name, price, qty}]; include qty in display string
     so renderItemsView regex can extract the correct quantity (Task 2 quantity bug fix) */
  var itemStr = '';
  if (Array.isArray(row.items)) {
    itemStr = row.items.map(function(it) {
      var qty = it.qty || 1;
      return (it.name || 'Item') + ' \u00D7' + qty;
    }).join(', ');
  } else if (typeof row.items === 'string') {
    itemStr = row.items;
  }
  var fulfillment = row.fulfillment || 'Pickup';
  return {
    /* MODIFIED (Task 6): first 8 chars of Supabase ID — matches order.js submitWizardOrder format */
    id:           '#' + String(row.id).substring(0, 8).toUpperCase(),
    _dbId:        row.id,          /* keep DB id to preserve paid/received across refreshes */
    name:         row.name         || '',
    email:        row.email        || '',
    phone:        row.phone        || '',
    date:         row.pickup_date  || '',
    time:         fulfillment,
    payment:      row.payment      || 'N/A',
    items:        itemStr,
    total:        parseFloat(row.total || 0).toFixed(2),
    paid:         row.paid         || false,
    received:     row.received     || false,
    notes:        row.notes        || '',
    mode:         fulfillment === 'Pickup' ? 'pickup' : 'delivery',
    deliveryAddr: row.delivery_address || null,
    fulfillment:  fulfillment,
    address:      row.delivery_address || null
  };
}

/* ─── LOCK / UNLOCK ─────────────────────────────────────────── */
function unlockAdmin() {
  if (document.getElementById('admin-pwd').value === 'blueshelf123') {
    window.State.adminUnlocked = true;
    document.getElementById('admin-lock').style.display = 'none';
    document.getElementById('admin-dash').classList.add('unlocked');
    renderAdmin();
  } else {
    showToast('Incorrect password. Hint: noneofyourbusiness');
    document.getElementById('admin-pwd').value = '';
  }
}

function lockAdmin() {
  window.State.adminUnlocked = false;
  document.getElementById('admin-lock').style.display = '';
  document.getElementById('admin-dash').classList.remove('unlocked');
  document.getElementById('admin-pwd').value = '';
}

function renderAdmin() {
  if (!window.State.adminUnlocked) return;
  loadOrdersFromSupabase();
}

/**
 * Fetch the full order list from Supabase and refresh admin views.
 * Falls back to in-memory State.orders if fetch fails or Supabase is not configured.
 */
function loadOrdersFromSupabase() {
  var wrap = document.getElementById('orders-table-wrap');
  if (wrap) {
    wrap.innerHTML = '<p style="color:var(--text-muted);font-size:0.88rem;text-align:center;padding:2rem 0">Loading orders from database…</p>';
  }

  if (typeof fetchOrders !== 'function') {
    /* supabase.js not loaded yet — fall back to in-memory */
    renderOrdersTab();
    return;
  }

  fetchOrders().then(function(rows) {
    /* Preserve any in-memory paid/received toggles the admin already made this session */
    var sessionState = {};
    window.State.orders.forEach(function(o) {
      if (o._dbId !== undefined) sessionState[o._dbId] = {paid: o.paid, received: o.received};
    });

    window.State.orders = rows.map(function(row) {
      var normalized = normalizeDbOrder(row);
      if (sessionState[row.id]) {
        normalized.paid     = sessionState[row.id].paid;
        normalized.received = sessionState[row.id].received;
      }
      return normalized;
    });

    renderOrdersTab();
  }).catch(function(err) {
    console.warn('Could not load orders from Supabase:', err);
    showToast('Could not reach database — showing local orders only.');
    renderOrdersTab();
  });
}

/* ─── ORDERS TAB ────────────────────────────────────────────── */

/* REWRITTEN: togglePaid / toggleReceived no longer use array indices.
   They take the raw Supabase row id, find the order by that id, do an
   optimistic in-memory update + immediate re-render, then fire a PATCH.
   If the PATCH fails the state is reverted and the exact server error is shown. */

function _patchOrderBool(dbId, field, newVal, labelOn, labelOff) {
  /* Find the order object by its DB id — safe regardless of filter/sort state */
  var o = window.State.orders.find(function(x) { return String(x._dbId) === String(dbId); });
  if (!o) { showToast('Order not found in local state'); return; }

  /* Optimistic update */
  o[field] = newVal;
  renderOrdersTab();

  if (!dbId || dbId === 'null') {
    showToast('No database ID — status saved locally only (refresh page to persist)');
    return;
  }

  var url = (window.__ENV__ && window.__ENV__.SUPABASE_URL) || '';
  var key = (window.__ENV__ && window.__ENV__.SUPABASE_ANON_KEY) || '';
  if (!url || !key) { showToast('Supabase not configured — status saved locally only'); return; }

  var body = {};
  body[field] = newVal;

  fetch(url.replace(/\/$/, '') + '/rest/v1/orders?id=eq.' + encodeURIComponent(dbId), {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': key,
      'Authorization': 'Bearer ' + key
    },
    body: JSON.stringify(body)
  }).then(function(r) {
    if (!r.ok) {
      return r.text().then(function(t) {
        var msg = t;
        try { var p = JSON.parse(t); msg = p.message || p.hint || p.error || t; } catch (e) {}
        /* Revert on failure */
        o[field] = !newVal;
        renderOrdersTab();
        showToast('Save failed (' + r.status + '): ' + msg);
      });
    }
    showToast(o.id + ' — ' + (newVal ? labelOn : labelOff));
  }).catch(function(err) {
    /* Revert on network error */
    o[field] = !newVal;
    renderOrdersTab();
    showToast('Save failed: ' + err.message);
  });
}

function togglePaid(dbId) {
  var o = window.State.orders.find(function(x) { return String(x._dbId) === String(dbId); });
  if (!o) return;
  _patchOrderBool(dbId, 'paid', !o.paid, 'marked paid ✓', 'marked unpaid');
}

function toggleReceived(dbId) {
  var o = window.State.orders.find(function(x) { return String(x._dbId) === String(dbId); });
  if (!o) return;
  _patchOrderBool(dbId, 'received', !o.received, 'marked received ✓', 'marked not received');
}

function deleteOrderRow(idx) {
  var o = window.State.orders[idx];
  if (!o) return;
  if (!confirm('Delete order ' + o.id + ' from ' + o.name + '? This cannot be undone.')) return;

  /* Orders with no DB ID exist only in memory — remove locally */
  if (!o._dbId) {
    window.State.orders.splice(idx, 1);
    showToast('Order removed');
    renderOrdersTab();
    return;
  }

  if (typeof deleteOrder !== 'function') { showToast('Supabase not configured.'); return; }

  deleteOrder(o._dbId).then(function() {
    window.State.orders.splice(idx, 1);
    showToast(o.id + ' deleted');
    renderOrdersTab();
  }).catch(function(err) {
    showToast('Could not delete: ' + err.message);
    /* Order is NOT removed from the UI — the user can try again */
  });
}

/* MODIFIED: orders filter setter — 'all', 'pickup', 'delivery' (CHANGE 5) */
function setOrdersFilter(val) {
  window.State.ordersFilter = val;
  renderOrdersTab();
}

/* ADDED: month filter setter for Day Summary tab */
function setSummaryMonthFilter(val) {
  window.State.summaryMonthFilter = val;
  renderDaySummaryTab();
}

function renderOrdersTab() {
  var S = window.State;

  /* MODIFIED: apply pickup/delivery filter (CHANGE 5) */
  var filteredOrders = S.orders.filter(function(o) {
    var f = getOrderFulfillment(o);
    if (S.ordersFilter === 'pickup')   return f === 'Pickup';
    if (S.ordersFilter === 'delivery') return f !== 'Pickup';
    return true;
  });

  var badge = document.getElementById('orders-badge');
  badge.textContent = filteredOrders.length + (filteredOrders.length === 1 ? ' order' : ' orders');

  var wrap = document.getElementById('orders-table-wrap');

  /* MODIFIED: segmented filter control above the table (CHANGE 5) */
  function filterBtn(val, label) {
    var active = S.ordersFilter === val;
    return '<button onclick="setOrdersFilter(\'' + val + '\')" style="' +
      'padding:0.4rem 1rem;border-radius:50px;cursor:pointer;' +
      'font-family:\'DM Sans\',sans-serif;font-size:0.82rem;font-weight:600;transition:all 0.2s;' +
      'border:1.5px solid ' + (active ? 'var(--navy)' : 'var(--cream-dark)') + ';' +
      'background:' + (active ? 'var(--navy)' : 'var(--white)') + ';' +
      'color:' + (active ? 'var(--cream)' : 'var(--text-muted)') + '">' +
      label + '</button>';
  }
  var filterBar = '<div style="display:flex;gap:0.4rem;flex-wrap:wrap;margin-bottom:1rem;align-items:center">' +
    filterBtn('all', 'All Orders') +
    filterBtn('pickup', '\uD83C\uDFE0 Pickup Only') +
    filterBtn('delivery', '\uD83D\uDE97 Delivery Only') +
    '<button onclick="loadOrdersFromSupabase()" style="' +
      'padding:0.4rem 1rem;border-radius:50px;cursor:pointer;margin-left:auto;' +
      'font-family:\'DM Sans\',sans-serif;font-size:0.82rem;font-weight:600;transition:all 0.2s;' +
      'border:1.5px solid var(--blue);background:var(--white);color:var(--blue-dark)">' +
      '\u21BB Refresh' +
    '</button>' +
  '</div>';

  if (!filteredOrders.length) {
    wrap.innerHTML = filterBar + '<p style="color:var(--text-muted);font-size:0.88rem;text-align:center;padding:2rem 0">' +
      (S.orders.length ? 'No orders match this filter.' : 'No orders yet. Place one from the Order tab!') + '</p>';
    return;
  }

  /* MODIFIED: added Fulfillment column + horizontal scroll wrapper for wide table (CHANGE 5) */
  /* MODIFIED (Task 5): added Phone column to orders table */
  wrap.innerHTML = filterBar + '<div style="overflow-x:auto"><table class="orders-table">' +
    '<thead><tr><th>Order</th><th>Customer</th><th>Phone</th><th>Fulfillment</th><th>Items</th><th>Total</th><th>Date</th><th>Payment</th><th>Paid</th><th>Received</th><th></th></tr></thead>' +
    '<tbody>' + filteredOrders.map(function(o) {
      var realIdx = S.orders.indexOf(o); /* use real index for paid/received/delete actions */
      var fulfillment = getOrderFulfillment(o);
      var address = getOrderAddress(o);
      var itemsShort = o.items.length > 30 ? o.items.substring(0, 30) + '\u2026' : o.items;
      /* MODIFIED: fulfillment pill — blue for pickup, blush for delivery (CHANGE 5) */
      var fulfillmentCell =
        '<span class="tag ' + (fulfillment === 'Pickup' ? 'tag-blue' : 'tag-blush') + '">' +
          (fulfillment === 'Pickup' ? '\uD83C\uDFE0 Pickup' : '\uD83D\uDE97 Delivery') +
        '</span>' +
        (fulfillment !== 'Pickup' && address ? '<div style="font-size:0.7rem;color:var(--text-muted);margin-top:0.25rem">' + address + '</div>' : '');
      return '<tr>' +
        '<td><strong style="font-size:0.82rem">' + o.id + '</strong></td>' +
        '<td><span style="font-weight:600">' + o.name + '</span></td>' +
        /* ADDED (Task 5): phone number column */
        '<td><span style="font-size:0.78rem;color:var(--text-muted)">' + (o.phone || '\u2014') + '</span></td>' +
        '<td>' + fulfillmentCell + '</td>' +
        '<td>' +
          /* ADDED (Task 7): clicking items cell opens the item-quantity pop-up */
          '<span style="font-size:0.75rem;color:var(--text-muted);cursor:pointer;text-decoration:underline dotted" ' +
            'title="Click to see item details" onclick="showOrderItemsModal(' + realIdx + ')">' + itemsShort + ' \uD83D\uDCC4</span>' +
        '</td>' +
        '<td><strong>$' + o.total + '</strong></td>' +
        '<td style="font-size:0.82rem">' + o.date + '</td>' +
        '<td style="font-size:0.75rem;color:var(--text-muted)">' + o.payment + '</td>' +
        /* Pass the raw DB id (quoted) so togglePaid/toggleReceived can find the order
           regardless of filter state — replaces the old mutable array-index approach */
        '<td><span class="order-status ' + (o.paid ? 's-paid' : 's-unpaid') + '" onclick="togglePaid(\'' + o._dbId + '\')">'
          + (o.paid ? 'Paid \u2713' : 'Unpaid') + '</span></td>' +
        '<td><span class="order-status ' + (o.received ? 's-received' : 's-not-received') + '" onclick="toggleReceived(\'' + o._dbId + '\')">'
          + (o.received ? 'Received \u2713' : 'Pending') + '</span></td>' +
        '<td><button class="delete-btn" onclick="deleteOrderRow(' + realIdx + ')" title="Delete order">\u2715</button></td>' +
      '</tr>';
    }).join('') + '</tbody></table></div>';
}

/* ─── DAY SUMMARY TAB (CHANGE 2) ────────────────────────────── */

/* MODIFIED: replaced old single-filter with day+product dropdowns (CHANGE 2) */
function setSummaryDayFilter(val) {
  window.State.summaryDayFilter = val;
  renderDaySummaryTab();
}

function setSummaryProductFilter(val) {
  window.State.summaryProductFilter = val;
  renderDaySummaryTab();
}

function clearSummaryFilters() {
  window.State.summaryDayFilter = 'all';
  window.State.summaryProductFilter = 'all';
  /* ADDED: also reset month filter */
  window.State.summaryMonthFilter = 'all';
  renderDaySummaryTab();
}

/* MODIFIED: toggle expand/collapse of a day card (CHANGE 2) */
function toggleDaySummaryCard(date) {
  var S = window.State;
  S.daySummaryExpanded[date] = !S.daySummaryExpanded[date];
  renderDaySummaryTab();
}

/* MODIFIED: switch slider view between 'fulfillment' and 'items' (CHANGE 2) */
function setDaySummarySlider(date, mode) {
  window.State.daySummarySliderMode[date] = mode;
  renderDaySummaryTab();
}

/* MODIFIED: scroll to a specific day card from the deliveries dropdown (CHANGE 2) */
function scrollToDeliveryDay(date) {
  if (!date) return;
  window.State.daySummaryExpanded[date] = true;
  renderDaySummaryTab();
  setTimeout(function() {
    var card = document.getElementById('day-card-' + date);
    if (card) card.scrollIntoView({behavior: 'smooth', block: 'start'});
  }, 60);
}

/* MODIFIED: render fulfillment view — two-column Pickups | Deliveries (CHANGE 2) */
/* MODIFIED (Task 1 + Task 5): shows phone number alongside name so baker can contact customer */
function renderFulfillmentView(pickupOrders, deliveryOrders) {
  function orderRow(o) {
    var address = getOrderAddress(o);
    return '<div style="padding:0.75rem;border-bottom:1px solid var(--cream-dark);font-size:0.83rem">' +
      '<div style="font-weight:600;color:var(--navy);margin-bottom:0.15rem">' + o.name + '</div>' +
      /* ADDED (Task 5): phone number so baker can call/text the customer */
      (o.phone ? '<div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:0.2rem">\uD83D\uDCDE ' + o.phone + '</div>' : '') +
      '<div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:0.3rem;line-height:1.5">' + o.items + '</div>' +
      /* ADDED (Task 1): delivery address highlighted for delivery orders */
      (address ? '<div style="font-size:0.72rem;color:var(--blue-dark);margin-bottom:0.3rem">\uD83D\uDCCD ' + address + '</div>' : '') +
      '<div style="display:flex;gap:0.3rem;align-items:center;flex-wrap:wrap">' +
        '<strong style="font-size:0.82rem;color:var(--navy)">$' + o.total + '</strong>' +
        '<span class="order-status ' + (o.paid ? 's-paid' : 's-unpaid') + '" style="font-size:0.65rem">' + (o.paid ? 'Paid' : 'Unpaid') + '</span>' +
        '<span class="order-status ' + (o.received ? 's-received' : 's-not-received') + '" style="font-size:0.65rem">' + (o.received ? 'Received' : 'Pending') + '</span>' +
      '</div>' +
    '</div>';
  }
  var colStyle = 'border-right:1px solid var(--cream-dark)';
  var labelStyle = 'padding:0.5rem 0.75rem;font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--text-muted);background:var(--cream-dark)';
  return '<div style="display:grid;grid-template-columns:1fr 1fr;background:var(--white)">' +
    '<div style="' + colStyle + '">' +
      '<div style="' + labelStyle + '">\uD83C\uDFE0 Pickups (' + pickupOrders.length + ')</div>' +
      (pickupOrders.length ? pickupOrders.map(orderRow).join('') : '<p style="color:var(--text-muted);font-size:0.78rem;padding:1rem;text-align:center">No pickups</p>') +
    '</div>' +
    '<div>' +
      '<div style="' + labelStyle + '">\uD83D\uDE97 Deliveries (' + deliveryOrders.length + ')</div>' +
      (deliveryOrders.length ? deliveryOrders.map(orderRow).join('') : '<p style="color:var(--text-muted);font-size:0.78rem;padding:1rem;text-align:center">No deliveries</p>') +
    '</div>' +
  '</div>';
}

/* MODIFIED: render items view — grouped by product (CHANGE 2) */
function renderItemsView(dateOrders) {
  var S = window.State;
  var productTotals = {};
  dateOrders.forEach(function(o) {
    S.menuItems.forEach(function(mi) {
      if (o.items.indexOf(mi.name) !== -1) {
        var re = new RegExp(mi.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \u00D7(\\d+)');
        var match = o.items.match(re);
        var qty = match ? parseInt(match[1]) : 1;
        if (!productTotals[mi.id]) {
          productTotals[mi.id] = {item: mi, qty: 0, customers: []};
        }
        productTotals[mi.id].qty += qty;
        if (productTotals[mi.id].customers.indexOf(o.name) === -1) {
          productTotals[mi.id].customers.push(o.name);
        }
      }
    });
  });
  var ids = Object.keys(productTotals);
  if (!ids.length) {
    return '<div style="padding:1.5rem;text-align:center;color:var(--text-muted);font-size:0.88rem">No product data available.</div>';
  }
  return '<div style="padding:1rem;background:var(--white)">' +
    ids.map(function(id) {
      var pt = productTotals[id];
      /* MODIFIED: show photo thumbnail if available, else emoji (CHANGE 4) */
      var thumbHtml = pt.item.photo
        ? '<img src="' + pt.item.photo + '" alt="' + pt.item.name + '" style="width:38px;height:38px;border-radius:8px;object-fit:cover;flex-shrink:0;margin-right:0.75rem" onerror="this.style.display=\'none\'" />'
        : '<span style="font-size:1.6rem;margin-right:0.75rem;flex-shrink:0">' + pt.item.emoji + '</span>';
      return '<div style="display:flex;align-items:flex-start;padding:0.75rem;background:var(--cream);border-radius:10px;margin-bottom:0.75rem;border:1px solid var(--cream-dark)">' +
        thumbHtml +
        '<div style="flex:1;min-width:0">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.3rem">' +
            '<strong style="font-size:0.88rem;color:var(--navy)">' + pt.item.name + '</strong>' +
            '<span style="background:var(--navy);color:var(--cream);padding:0.2rem 0.65rem;border-radius:50px;font-size:0.72rem;font-weight:700;white-space:nowrap">\u00D7' + pt.qty + ' total</span>' +
          '</div>' +
          '<div style="font-size:0.72rem;color:var(--text-muted);margin-top:0.3rem">Customers: ' + pt.customers.join(', ') + '</div>' +
        '</div>' +
      '</div>';
    }).join('') +
  '</div>';
}

/* MODIFIED: build one collapsible day summary card (CHANGE 2) */
function renderDaySummaryCard(date, dateOrders) {
  var S = window.State;
  var dt = new Date(date + 'T00:00:00');
  var shortLabel = dt.toLocaleDateString('en-US', {weekday: 'long', month: 'short', day: 'numeric'});
  var dateTotal = dateOrders.reduce(function(s, o) { return s + parseFloat(o.total); }, 0);
  var pickupOrders   = dateOrders.filter(function(o) { return getOrderFulfillment(o) === 'Pickup'; });
  var deliveryOrders = dateOrders.filter(function(o) { return getOrderFulfillment(o) !== 'Pickup'; });
  var isExpanded = !!S.daySummaryExpanded[date];
  var sliderMode = S.daySummarySliderMode[date] || 'fulfillment';

  /* Header */
  var hdrBg    = isExpanded ? 'var(--navy)' : 'var(--white)';
  var hdrColor = isExpanded ? 'var(--cream)' : 'var(--navy)';
  var hdrMuted = isExpanded ? 'rgba(253,246,236,0.65)' : 'var(--text-muted)';
  var hdrRadius = isExpanded ? 'var(--radius) var(--radius) 0 0' : 'var(--radius)';

  var headerHtml =
    '<div onclick="toggleDaySummaryCard(\'' + date + '\')" style="' +
      'display:flex;justify-content:space-between;align-items:center;cursor:pointer;padding:1.1rem 1.4rem;' +
      'background:' + hdrBg + ';border-radius:' + hdrRadius + ';transition:all 0.2s;border:1px solid var(--cream-dark)">' +
      '<div>' +
        '<div style="font-family:\'Playfair Display\',serif;font-size:1.05rem;font-weight:600;color:' + hdrColor + '">' + shortLabel + '</div>' +
        '<div style="font-size:0.78rem;color:' + hdrMuted + ';margin-top:0.15rem">$' + dateTotal.toFixed(2) + ' revenue</div>' +
      '</div>' +
      '<div style="display:flex;gap:0.4rem;align-items:center;flex-wrap:wrap">' +
        '<span class="tag tag-muted" style="font-size:0.68rem">' + dateOrders.length + ' order' + (dateOrders.length === 1 ? '' : 's') + '</span>' +
        (pickupOrders.length   ? '<span class="tag tag-blue"  style="font-size:0.68rem">\uD83C\uDFE0 ' + pickupOrders.length   + '</span>' : '') +
        (deliveryOrders.length ? '<span class="tag tag-blush" style="font-size:0.68rem">\uD83D\uDE97 ' + deliveryOrders.length + '</span>' : '') +
        '<span style="color:' + hdrColor + ';font-size:0.9rem;margin-left:0.2rem">' + (isExpanded ? '\u25B4' : '\u25BE') + '</span>' +
      '</div>' +
    '</div>';

  var bodyHtml = '';
  if (isExpanded) {
    /* Summary strip */
    var strip =
      '<div style="padding:0.6rem 1.4rem;background:var(--blue-xlight);font-size:0.8rem;color:var(--navy);font-weight:500;border-left:1px solid var(--cream-dark);border-right:1px solid var(--cream-dark)">' +
        dateOrders.length + ' order' + (dateOrders.length === 1 ? '' : 's') +
        ' \u00B7 $' + dateTotal.toFixed(2) + ' revenue' +
        ' \u00B7 ' + pickupOrders.length + ' pickup' + (pickupOrders.length === 1 ? '' : 's') +
        ' \u00B7 ' + deliveryOrders.length + ' deliver' + (deliveryOrders.length === 1 ? 'y' : 'ies') +
      '</div>';

    /* Slider toggle */
    function sliderBtn(mode, label) {
      var active = sliderMode === mode;
      return '<button onclick="setDaySummarySlider(\'' + date + '\',\'' + mode + '\')" style="' +
        'padding:0.28rem 0.9rem;border:none;cursor:pointer;' +
        'font-family:\'DM Sans\',sans-serif;font-size:0.76rem;font-weight:600;transition:all 0.2s;' +
        'background:' + (active ? 'var(--navy)' : 'transparent') + ';' +
        'color:' + (active ? 'var(--cream)' : 'var(--text-muted)') + '">' +
        label + '</button>';
    }
    var slider =
      '<div style="display:flex;align-items:center;gap:0.75rem;padding:0.75rem 1.4rem;border:1px solid var(--cream-dark);border-top:none;background:var(--white)">' +
        '<span style="font-size:0.76rem;font-weight:600;color:var(--text-muted)">View by:</span>' +
        '<div style="display:flex;border:1.5px solid var(--cream-dark);border-radius:50px;overflow:hidden;background:var(--white)">' +
          sliderBtn('fulfillment', 'Fulfillment') +
          sliderBtn('items', 'Items') +
        '</div>' +
      '</div>';

    /* Content view */
    var viewHtml = sliderMode === 'fulfillment'
      ? renderFulfillmentView(pickupOrders, deliveryOrders)
      : renderItemsView(dateOrders);

    bodyHtml =
      '<div style="border:1px solid var(--cream-dark);border-top:none;border-radius:0 0 var(--radius) var(--radius);overflow:hidden">' +
        strip + slider + viewHtml +
      '</div>';
  }

  return '<div id="day-card-' + date + '" style="margin-bottom:1rem">' + headerHtml + bodyHtml + '</div>';
}

/* MODIFIED: complete rewrite — enhanced day summary with dropdowns, collapsible cards, slider (CHANGE 2) */
function renderDaySummaryTab() {
  var S = window.State;
  var wrap = document.getElementById('summary-content');

  if (!S.orders.length) {
    wrap.innerHTML = '<p style="color:var(--text-muted);font-size:0.88rem;text-align:center;padding:2rem 0">No orders yet.</p>';
    return;
  }

  /* Collect unique dates and product names that appear in orders */
  var allDates = [];
  var allProductNames = [];
  S.orders.forEach(function(o) {
    if (allDates.indexOf(o.date) === -1) allDates.push(o.date);
    S.menuItems.forEach(function(mi) {
      if (o.items.indexOf(mi.name) !== -1 && allProductNames.indexOf(mi.name) === -1) {
        allProductNames.push(mi.name);
      }
    });
  });
  allDates.sort();
  allProductNames.sort();

  /* ADDED: collect unique YYYY-MM months from orders for the month filter */
  var allMonths = [];
  S.orders.forEach(function(o) {
    if (o.date && o.date.length >= 7) {
      var ym = o.date.substring(0, 7);
      if (allMonths.indexOf(ym) === -1) allMonths.push(ym);
    }
  });
  allMonths.sort();

  /* Apply month pre-filter first so day/product dropdowns only show options within that month */
  var monthFiltered = S.summaryMonthFilter === 'all'
    ? S.orders
    : S.orders.filter(function(o) { return o.date && o.date.substring(0, 7) === S.summaryMonthFilter; });

  /* Dates that have at least one delivery */
  var deliveryDates = allDates.filter(function(d) {
    return S.orders.some(function(o) { return o.date === d && getOrderFulfillment(o) !== 'Pickup'; });
  });

  /* MODIFIED: "Filter by Day" dropdown (CHANGE 2) */
  var dayOpts = '<option value="all"' + (S.summaryDayFilter === 'all' ? ' selected' : '') + '>All Days</option>' +
    allDates.map(function(d) {
      var label = new Date(d + 'T00:00:00').toLocaleDateString('en-US', {weekday: 'short', month: 'short', day: 'numeric'});
      return '<option value="' + d + '"' + (S.summaryDayFilter === d ? ' selected' : '') + '>' + label + '</option>';
    }).join('');

  /* MODIFIED: "Filter by Product" dropdown (CHANGE 2) */
  var prodOpts = '<option value="all"' + (S.summaryProductFilter === 'all' ? ' selected' : '') + '>All Products</option>' +
    allProductNames.map(function(name) {
      return '<option value="' + name + '"' + (S.summaryProductFilter === name ? ' selected' : '') + '>' + name + '</option>';
    }).join('');

  var inputStyle = 'width:100%;padding:0.55rem 0.8rem;border-radius:10px;border:1.5px solid var(--cream-dark);background:var(--cream);font-family:\'DM Sans\',sans-serif;font-size:0.85rem;outline:none';

  /* ADDED: "Filter by Month" dropdown — drives revenue-per-month view */
  var monthOpts = '<option value="all"' + (S.summaryMonthFilter === 'all' ? ' selected' : '') + '>All Months</option>' +
    allMonths.map(function(ym) {
      var parts = ym.split('-');
      var label = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, 1)
        .toLocaleDateString('en-US', {month: 'long', year: 'numeric'});
      return '<option value="' + ym + '"' + (S.summaryMonthFilter === ym ? ' selected' : '') + '>' + label + '</option>';
    }).join('');

  /* MODIFIED: header row with two dropdowns + Clear Filters button (CHANGE 2) */
  /* MODIFIED: added Month filter dropdown */
  var headerHtml =
    '<div style="display:flex;gap:1rem;align-items:flex-end;flex-wrap:wrap;margin-bottom:1.5rem;padding:1.25rem;background:var(--cream);border-radius:var(--radius);border:1px solid var(--cream-dark)">' +
      '<div class="form-group" style="margin:0;flex:1;min-width:130px">' +
        '<label>Month</label>' +
        '<select onchange="setSummaryMonthFilter(this.value)" style="' + inputStyle + '">' + monthOpts + '</select>' +
      '</div>' +
      '<div class="form-group" style="margin:0;flex:1;min-width:130px">' +
        '<label>Filter by Day</label>' +
        '<select onchange="setSummaryDayFilter(this.value)" style="' + inputStyle + '">' + dayOpts + '</select>' +
      '</div>' +
      '<div class="form-group" style="margin:0;flex:1;min-width:130px">' +
        '<label>Filter by Product</label>' +
        '<select onchange="setSummaryProductFilter(this.value)" style="' + inputStyle + '">' + prodOpts + '</select>' +
      '</div>' +
      '<button onclick="clearSummaryFilters()" class="wizard-btn-prev" style="padding:0.55rem 1.1rem;align-self:flex-end;white-space:nowrap">Clear Filters</button>' +
    '</div>';

  /* MODIFIED: "🚗 Deliveries" jump dropdown (CHANGE 2) */
  var deliveriesHtml = '';
  if (deliveryDates.length) {
    var delOpts = '<option value="">-- Jump to date --</option>' +
      deliveryDates.map(function(d) {
        var label = new Date(d + 'T00:00:00').toLocaleDateString('en-US', {weekday: 'short', month: 'short', day: 'numeric'});
        return '<option value="' + d + '">' + label + '</option>';
      }).join('');
    deliveriesHtml =
      '<div class="form-group" style="margin-bottom:1.5rem">' +
        '<label>\uD83D\uDE97 Deliveries \u2014 Jump to day</label>' +
        '<select onchange="scrollToDeliveryDay(this.value)" style="' + inputStyle + '">' + delOpts + '</select>' +
      '</div>';
  }

  /* Apply day + product filters on top of the already month-filtered set */
  var filtered = monthFiltered.filter(function(o) {
    var dayMatch  = S.summaryDayFilter === 'all' || o.date === S.summaryDayFilter;
    var prodMatch = S.summaryProductFilter === 'all' || o.items.indexOf(S.summaryProductFilter) !== -1;
    return dayMatch && prodMatch;
  });

  /* ADDED: show a revenue summary strip when a month is selected */
  var monthSummaryHtml = '';
  if (S.summaryMonthFilter !== 'all' && monthFiltered.length) {
    var mRevenue = monthFiltered.reduce(function(s, o) { return s + parseFloat(o.total || 0); }, 0);
    var mPaid    = monthFiltered.filter(function(o) { return o.paid; }).reduce(function(s, o) { return s + parseFloat(o.total || 0); }, 0);
    var mUnpaid  = mRevenue - mPaid;
    var parts    = S.summaryMonthFilter.split('-');
    var mLabel   = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, 1)
      .toLocaleDateString('en-US', {month: 'long', year: 'numeric'});
    monthSummaryHtml =
      '<div style="display:flex;gap:0.75rem;flex-wrap:wrap;margin-bottom:1.25rem;' +
        'padding:1rem 1.25rem;background:var(--blue-xlight);border-radius:var(--radius);' +
        'border:1px solid var(--blue-light);font-size:0.85rem;align-items:center">' +
        '<span style="font-weight:600;color:var(--navy)">' + mLabel + '</span>' +
        '<span style="color:var(--text-muted)">\u00B7</span>' +
        '<span style="color:var(--text-muted)">' + monthFiltered.length + ' orders</span>' +
        '<span style="color:var(--text-muted)">\u00B7</span>' +
        '<span style="color:var(--text-muted)">Total <strong style="color:var(--navy)">$' + mRevenue.toFixed(2) + '</strong></span>' +
        '<span style="color:var(--text-muted)">\u00B7</span>' +
        '<span style="color:#3a7a4a">Paid <strong>$' + mPaid.toFixed(2) + '</strong></span>' +
        '<span style="color:var(--text-muted)">\u00B7</span>' +
        '<span style="color:#a03030">Unpaid <strong>$' + mUnpaid.toFixed(2) + '</strong></span>' +
      '</div>';
  }

  /* Group by date */
  var grouped = {};
  filtered.forEach(function(o) {
    if (!grouped[o.date]) grouped[o.date] = [];
    grouped[o.date].push(o);
  });
  var sortedDates = Object.keys(grouped).sort();

  /* MODIFIED: collapsible day cards (CHANGE 2) */
  var cardsHtml = sortedDates.length
    ? sortedDates.map(function(d) { return renderDaySummaryCard(d, grouped[d]); }).join('')
    : '<p style="color:var(--text-muted);text-align:center;padding:2rem 0;font-size:0.88rem">No orders match the current filters.</p>';

  wrap.innerHTML = headerHtml + monthSummaryHtml + deliveriesHtml + cardsHtml;
}

/* ─── BUDGET TAB ──────────────────────────────────────────────── */

/* ADDED: period filter setter — 'month', 'ytd', or 'all' */
function setBudgetPeriod(val) {
  window.State.budgetPeriodFilter = val;
  renderBudgetTab();
}

/* ADDED: load supply expenses from Supabase into State then re-render */
function loadSupplyExpenses() {
  if (typeof fetchSupplyExpenses !== 'function') return;
  fetchSupplyExpenses().then(function(rows) {
    window.State.supplyExpenses = (rows || []).map(function(r) {
      return { id: r.id, date: r.date || '', amount: parseFloat(r.amount || 0), notes: r.notes || '' };
    });
    renderBudgetTab();
  }).catch(function(err) {
    showToast('Could not load expenses: ' + err.message);
  });
}

/* ADDED: save a new supply expense from the inline form */
function addSupplyExpense() {
  var dateEl   = document.getElementById('supply-date');
  var amtEl    = document.getElementById('supply-amount');
  var notesEl  = document.getElementById('supply-notes');
  if (!dateEl || !amtEl) return;
  var date   = dateEl.value.trim();
  var amount = parseFloat(amtEl.value);
  var notes  = notesEl ? notesEl.value.trim() : '';
  if (!date || isNaN(amount) || amount <= 0) { showToast('Enter a valid date and amount'); return; }

  var row = { date: date, amount: amount, notes: notes };

  if (typeof saveSupplyExpense !== 'function') {
    /* Offline fallback — store locally only */
    row.id = Date.now();
    window.State.supplyExpenses.unshift(row);
    dateEl.value = ''; amtEl.value = ''; if (notesEl) notesEl.value = '';
    renderBudgetTab();
    return;
  }

  var btn = document.getElementById('supply-save-btn');
  if (btn) btn.disabled = true;
  saveSupplyExpense(row).then(function(saved) {
    window.State.supplyExpenses.unshift({ id: saved.id, date: saved.date, amount: parseFloat(saved.amount), notes: saved.notes || '' });
    dateEl.value = ''; amtEl.value = ''; if (notesEl) notesEl.value = '';
    showToast('Expense saved');
    renderBudgetTab();
  }).catch(function(err) {
    showToast('Could not save: ' + err.message);
    if (btn) btn.disabled = false;
  });
}

/* ADDED: delete a supply expense row */
function deleteSupplyExpenseRow(id) {
  if (!confirm('Delete this expense? This cannot be undone.')) return;
  window.State.supplyExpenses = window.State.supplyExpenses.filter(function(e) { return e.id !== id; });
  renderBudgetTab();
  if (typeof deleteSupplyExpense === 'function') {
    deleteSupplyExpense(id).catch(function(err) { showToast('Delete failed: ' + err.message); });
  }
}

/* ADDED: pure-SVG donut chart — no external libraries */
function buildDonutChart(segments, size) {
  var total = segments.reduce(function(s, seg) { return s + seg.value; }, 0);
  if (total <= 0) return '<div style="text-align:center;color:var(--text-muted);font-size:0.85rem;padding:2rem 0">No data yet.</div>';
  var cx = size / 2, cy = size / 2;
  var r = size * 0.38, innerR = size * 0.22;
  var paths = '';
  var startAngle = -Math.PI / 2;
  segments.forEach(function(seg) {
    if (seg.value <= 0) return;
    var angle = (seg.value / total) * 2 * Math.PI;
    /* Tiny gap between slices */
    var gap = 0.018;
    var endAngle = startAngle + angle - gap;
    var ax1 = cx + r * Math.cos(startAngle + gap);
    var ay1 = cy + r * Math.sin(startAngle + gap);
    var ax2 = cx + r * Math.cos(endAngle);
    var ay2 = cy + r * Math.sin(endAngle);
    var ix1 = cx + innerR * Math.cos(endAngle);
    var iy1 = cy + innerR * Math.sin(endAngle);
    var ix2 = cx + innerR * Math.cos(startAngle + gap);
    var iy2 = cy + innerR * Math.sin(startAngle + gap);
    var largeArc = (angle - gap) > Math.PI ? 1 : 0;
    paths += '<path d="M ' + ax1.toFixed(2) + ' ' + ay1.toFixed(2) +
      ' A ' + r + ' ' + r + ' 0 ' + largeArc + ' 1 ' + ax2.toFixed(2) + ' ' + ay2.toFixed(2) +
      ' L ' + ix1.toFixed(2) + ' ' + iy1.toFixed(2) +
      ' A ' + innerR + ' ' + innerR + ' 0 ' + largeArc + ' 0 ' + ix2.toFixed(2) + ' ' + iy2.toFixed(2) +
      ' Z" fill="' + seg.color + '" />';
    startAngle += angle;
  });
  /* Legend */
  var legend = segments.filter(function(s) { return s.value > 0; }).map(function(seg) {
    var pct = Math.round((seg.value / total) * 100);
    return '<div style="display:flex;align-items:center;gap:0.45rem;font-size:0.78rem;margin-bottom:0.3rem">' +
      '<span style="display:inline-block;width:11px;height:11px;border-radius:3px;background:' + seg.color + ';flex-shrink:0"></span>' +
      '<span style="color:var(--text-muted)">' + seg.label + '</span>' +
      '<span style="font-weight:700;color:var(--navy);margin-left:auto">$' + seg.value.toFixed(2) + '</span>' +
      '<span style="color:var(--text-muted);width:30px;text-align:right">' + pct + '%</span>' +
    '</div>';
  }).join('');
  return '<div style="display:flex;align-items:center;gap:2rem;flex-wrap:wrap;justify-content:center">' +
    '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" style="flex-shrink:0">' +
      paths +
    '</svg>' +
    '<div style="min-width:200px">' + legend + '</div>' +
  '</div>';
}

/* ADDED: main budget render */
function renderBudgetTab() {
  var S = window.State;
  var wrap = document.getElementById('budget-content');
  if (!wrap) return;

  /* ── Period filter helper ─────────────────────────────────── */
  var now = new Date();
  var thisYearStr  = String(now.getFullYear());
  var thisMonthStr = thisYearStr + '-' + String(now.getMonth() + 1).padStart(2, '0');

  function inPeriod(isoDate) {
    if (!isoDate) return false;
    if (S.budgetPeriodFilter === 'month') return isoDate.substring(0, 7) === thisMonthStr;
    if (S.budgetPeriodFilter === 'ytd')   return isoDate.substring(0, 4) === thisYearStr;
    return true; /* 'all' */
  }

  var periodOrders   = S.orders.filter(function(o) { return inPeriod(o.date); });
  var periodExpenses = S.supplyExpenses.filter(function(e) { return inPeriod(e.date); });

  /* ── Financials ───────────────────────────────────────────── */
  var paidOrders    = periodOrders.filter(function(o) { return o.paid; });
  var unpaidOrders  = periodOrders.filter(function(o) { return !o.paid; });
  var paidRevenue   = paidOrders.reduce(function(s, o)   { return s + parseFloat(o.total   || 0); }, 0);
  var unpaidRevenue = unpaidOrders.reduce(function(s, o) { return s + parseFloat(o.total   || 0); }, 0);
  var totalRevenue  = paidRevenue + unpaidRevenue;
  var supplyCost    = periodExpenses.reduce(function(s, e) { return s + parseFloat(e.amount || 0); }, 0);
  var netProfit     = paidRevenue - supplyCost;

  /* ── Period buttons ───────────────────────────────────────── */
  function periodBtn(val, label) {
    var active = S.budgetPeriodFilter === val;
    return '<button onclick="setBudgetPeriod(\'' + val + '\')" style="' +
      'padding:0.38rem 1rem;border-radius:50px;cursor:pointer;white-space:nowrap;' +
      'font-family:\'DM Sans\',sans-serif;font-size:0.82rem;font-weight:600;transition:all 0.2s;' +
      'border:1.5px solid ' + (active ? 'var(--navy)' : 'var(--cream-dark)') + ';' +
      'background:' + (active ? 'var(--navy)' : 'var(--white)') + ';' +
      'color:' + (active ? 'var(--cream)' : 'var(--text-muted)') + '">' + label + '</button>';
  }
  var periodBar =
    '<div style="display:flex;gap:0.4rem;flex-wrap:wrap;margin-bottom:1.5rem;align-items:center">' +
      periodBtn('month', 'This Month') +
      periodBtn('ytd',   'Year to Date') +
      periodBtn('all',   'All Time') +
      '<button onclick="loadSupplyExpenses()" style="' +
        'padding:0.38rem 1rem;border-radius:50px;cursor:pointer;margin-left:auto;' +
        'font-family:\'DM Sans\',sans-serif;font-size:0.82rem;font-weight:600;transition:all 0.2s;' +
        'border:1.5px solid var(--blue);background:var(--white);color:var(--blue-dark)">\u21BB Refresh</button>' +
    '</div>';

  /* ── Stat cards ───────────────────────────────────────────── */
  function statCard(label, amount, sub, colorVar, bgVar) {
    var sign = amount < 0 ? '' : '';
    return '<div style="background:' + bgVar + ';border-radius:var(--radius);padding:1.25rem 1.5rem;' +
      'border:1px solid var(--cream-dark);text-align:center;flex:1;min-width:140px">' +
      '<div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;' +
        'color:var(--text-muted);margin-bottom:0.4rem">' + label + '</div>' +
      '<div style="font-family:\'Playfair Display\',serif;font-size:1.7rem;font-weight:700;' +
        'color:' + colorVar + '">' + sign + '$' + Math.abs(amount).toFixed(2) + '</div>' +
      (sub ? '<div style="font-size:0.76rem;color:var(--text-muted);margin-top:0.2rem">' + sub + '</div>' : '') +
    '</div>';
  }
  var statsHtml =
    '<div style="display:flex;gap:0.75rem;flex-wrap:wrap;margin-bottom:1.5rem">' +
      statCard('Paid Revenue',   paidRevenue,   paidOrders.length + ' orders',   '#3a7a4a',       'var(--green-light)') +
      statCard('Unpaid Revenue', unpaidRevenue, unpaidOrders.length + ' orders', '#a03030',       'var(--red-light)') +
      statCard('Supply Costs',   supplyCost,    periodExpenses.length + ' purchases', '#8a4a30', '#fdeee8') +
      statCard(netProfit >= 0 ? 'Net Profit' : 'Net Loss', netProfit, 'paid \u2212 supplies',
        netProfit >= 0 ? 'var(--navy)' : 'var(--red)', 'var(--cream)') +
    '</div>';

  /* ── Pie / donut chart ────────────────────────────────────── */
  var chartSegments = [
    { label: 'Paid Revenue',   value: paidRevenue,   color: 'var(--green)' },
    { label: 'Unpaid Revenue', value: unpaidRevenue, color: 'var(--red)' },
    { label: 'Supply Costs',   value: supplyCost,    color: '#E8B4A0' }
  ];
  var chartHtml =
    '<div style="background:var(--cream);border:1px solid var(--cream-dark);border-radius:var(--radius);' +
      'padding:1.5rem;margin-bottom:1.5rem">' +
      '<div style="font-size:0.78rem;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;' +
        'color:var(--text-muted);margin-bottom:1rem">Breakdown</div>' +
      buildDonutChart(chartSegments, 180) +
    '</div>';

  /* ── Log supply purchase form ─────────────────────────────── */
  var inputStyle = 'flex:1;padding:0.5rem 0.7rem;border-radius:8px;border:1.5px solid var(--cream-dark);' +
    'background:var(--white);font-family:\'DM Sans\',sans-serif;font-size:0.85rem;outline:none;min-width:100px';
  var supplyFormHtml =
    '<div style="background:var(--cream);border:1px solid var(--cream-dark);border-radius:var(--radius);' +
      'padding:1.25rem 1.5rem;margin-bottom:1.5rem">' +
      '<div style="font-size:0.78rem;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;' +
        'color:var(--text-muted);margin-bottom:0.85rem">Log Supply Purchase</div>' +
      '<div style="display:flex;gap:0.6rem;flex-wrap:wrap;align-items:flex-end">' +
        '<div style="display:flex;flex-direction:column;gap:0.25rem;flex:1;min-width:120px">' +
          '<label style="font-size:0.7rem;font-weight:600;text-transform:uppercase;letter-spacing:0.07em;color:var(--text-muted)">Date</label>' +
          '<input type="date" id="supply-date" value="' + toLocalISO(new Date()) + '" style="' + inputStyle + '" />' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:0.25rem;flex:1;min-width:100px">' +
          '<label style="font-size:0.7rem;font-weight:600;text-transform:uppercase;letter-spacing:0.07em;color:var(--text-muted)">Amount $</label>' +
          '<input type="number" id="supply-amount" min="0" step="0.01" placeholder="0.00" style="' + inputStyle + '" />' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:0.25rem;flex:2;min-width:160px">' +
          '<label style="font-size:0.7rem;font-weight:600;text-transform:uppercase;letter-spacing:0.07em;color:var(--text-muted)">Notes</label>' +
          '<input type="text" id="supply-notes" placeholder="e.g. Flour, butter from Costco" style="' + inputStyle + '" />' +
        '</div>' +
        '<button id="supply-save-btn" onclick="addSupplyExpense()" class="add-btn" ' +
          'style="padding:0.5rem 1.2rem;align-self:flex-end">+ Add</button>' +
      '</div>' +
    '</div>';

  /* ── Supply expenses table ────────────────────────────────── */
  var allExpenses = S.supplyExpenses;
  var expenseTableHtml = '';
  if (allExpenses.length) {
    expenseTableHtml =
      '<div style="margin-bottom:1.5rem">' +
        '<div style="font-size:0.78rem;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;' +
          'color:var(--text-muted);margin-bottom:0.75rem">Supply Expense Log (all time)</div>' +
        '<div style="overflow-x:auto"><table class="orders-table">' +
          '<thead><tr><th>Date</th><th>Amount</th><th>Notes</th><th></th></tr></thead>' +
          '<tbody>' +
            allExpenses.map(function(e) {
              return '<tr>' +
                '<td style="font-size:0.82rem">' + e.date + '</td>' +
                '<td><strong>$' + parseFloat(e.amount).toFixed(2) + '</strong></td>' +
                '<td style="font-size:0.8rem;color:var(--text-muted)">' + (e.notes || '\u2014') + '</td>' +
                '<td><button class="delete-btn" onclick="deleteSupplyExpenseRow(' + e.id + ')" title="Delete">\u2715</button></td>' +
              '</tr>';
            }).join('') +
          '</tbody>' +
        '</table></div>' +
      '</div>';
  }

  /* ── Orders in period ─────────────────────────────────────── */
  var ordersTableHtml = '';
  if (periodOrders.length) {
    ordersTableHtml =
      '<div>' +
        '<div style="font-size:0.78rem;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;' +
          'color:var(--text-muted);margin-bottom:0.75rem">Orders in Period</div>' +
        '<div style="overflow-x:auto"><table class="orders-table">' +
          '<thead><tr><th>Order</th><th>Customer</th><th>Date</th><th>Total</th><th>Status</th></tr></thead>' +
          '<tbody>' +
            periodOrders.map(function(o) {
              return '<tr>' +
                '<td><strong style="font-size:0.82rem">' + o.id + '</strong></td>' +
                '<td>' + o.name + '</td>' +
                '<td style="font-size:0.82rem">' + o.date + '</td>' +
                '<td><strong>$' + o.total + '</strong></td>' +
                '<td><span class="order-status ' + (o.paid ? 's-paid' : 's-unpaid') + '">' + (o.paid ? 'Paid' : 'Unpaid') + '</span></td>' +
              '</tr>';
            }).join('') +
          '</tbody>' +
        '</table></div>' +
      '</div>';
  } else {
    ordersTableHtml = '<p style="color:var(--text-muted);font-size:0.88rem;text-align:center;padding:1rem 0">No orders in this period.</p>';
  }

  wrap.innerHTML = periodBar + statsHtml + chartHtml + supplyFormHtml + expenseTableHtml + ordersTableHtml;
}

/* ─── PRODUCTS TAB (CHANGE 4: photo preview + URL input + delete) */
function renderProductsTab() {
  var S = window.State;
  var wrap = document.getElementById('products-list');
  wrap.innerHTML = S.menuItems.map(function(item, i) {
    /* MODIFIED: photo thumbnail — show img if photo exists, else emoji (CHANGE 4) */
    var thumbHtml = item.photo
      ? '<img src="' + item.photo + '" alt="' + item.name + '" style="width:40px;height:40px;border-radius:8px;object-fit:cover" onerror="this.outerHTML=\'<span style=font-size:1.4rem>' + item.emoji + '</span>\'" />'
      : '<span style="font-size:1.4rem">' + item.emoji + '</span>';

    return '<div class="inventory-item" style="padding:1.5rem 0;border-bottom:1px solid var(--cream-dark);border-top:' + (i === 0 ? '1px solid var(--cream-dark)' : 'none') + '" data-product-id="' + item.id + '">' +
      /* Main info row */
      '<div style="display:flex;gap:1rem;margin-bottom:0.75rem;width:100%;align-items:center">' +
        '<div class="inv-icon">' + thumbHtml + '</div>' +
        '<div class="inv-info" style="flex:1"><h4>' + item.name + '</h4><span>' + item.cat + '</span></div>' +
        '<div class="inv-controls">' +
          '<button class="inv-toggle' + (item.active ? ' on' : '') + '" onclick="toggleItem(' + item.id + ',this)"></button>' +
          '<button class="delete-btn" onclick="deleteProduct(' + item.id + ')" title="Delete product">\u2715</button>' +
        '</div>' +
      '</div>' +
      /* Price + Desc row */
      '<div style="margin-left:3rem;margin-bottom:0.75rem;display:flex;gap:0.75rem;width:calc(100% - 3rem);flex-wrap:wrap">' +
        '<div style="display:flex;align-items:center;gap:0.4rem">' +
          '<label style="font-size:0.72rem;color:var(--text-muted);white-space:nowrap;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">Price $</label>' +
          '<input type="number" min="0" step="0.01" value="' + item.price + '" oninput="updatePrice(' + item.id + ',this.value)" ' +
            'style="width:70px;padding:0.3rem 0.5rem;border-radius:6px;border:1px solid var(--cream-dark);font-size:0.75rem;outline:none;font-family:\'DM Sans\'" />' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:0.4rem;flex:1;min-width:160px">' +
          '<label style="font-size:0.72rem;color:var(--text-muted);white-space:nowrap;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">Desc</label>' +
          '<input type="text" value="' + (item.desc || '').replace(/"/g, '&quot;') + '" placeholder="Short description…" oninput="updateDesc(' + item.id + ',this.value)" ' +
            'style="flex:1;padding:0.3rem 0.5rem;border-radius:6px;border:1px solid var(--cream-dark);font-size:0.75rem;outline:none;font-family:\'DM Sans\'" />' +
        '</div>' +
      '</div>' +
      /* Photo URL row */
      '<div style="margin-left:3rem;margin-bottom:0.75rem;display:flex;align-items:center;gap:0.5rem;width:calc(100% - 3rem)">' +
        '<label style="font-size:0.72rem;color:var(--text-muted);white-space:nowrap;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">Photo URL</label>' +
        '<input type="text" value="' + (item.photo || '') + '" placeholder="https://…" ' +
          'oninput="updatePhoto(' + item.id + ',this.value)" ' +
          'style="flex:1;padding:0.3rem 0.5rem;border-radius:6px;border:1px solid var(--cream-dark);font-size:0.75rem;outline:none;font-family:\'DM Sans\'" />' +
      '</div>' +
      /* Customizations */
      '<div style="margin-left:3rem;width:calc(100% - 3rem)">' +
        '<div style="font-size:0.8rem;font-weight:600;margin-bottom:0.75rem;color:var(--navy)">Customizations</div>' +
        '<div id="customizations-' + item.id + '" style="margin-bottom:1rem">' +
          (item.customizations && item.customizations.length > 0 ? item.customizations.map(function(cust, idx) {
            return '<div style="display:flex;gap:0.5rem;margin-bottom:0.5rem;padding:0.5rem;background:var(--cream);border-radius:8px;font-size:0.8rem;align-items:center">' +
              '<input type="text" placeholder="Label (e.g. Frosting)" value="' + (cust.label || '') + '" onchange="updateCustomization(' + item.id + ',' + idx + ',\'label\',this.value)" style="padding:0.3rem 0.5rem;border-radius:6px;border:1px solid var(--cream-dark);flex:1;outline:none;font-size:0.75rem" />' +
              '<select onchange="updateCustomization(' + item.id + ',' + idx + ',\'type\',this.value)" style="padding:0.3rem 0.5rem;border-radius:6px;border:1px solid var(--cream-dark);outline:none;font-size:0.75rem;font-family:\'DM Sans\'">' +
                '<option value="text"'     + (cust.type === 'text'     ? ' selected' : '') + '>Text</option>' +
                '<option value="select"'   + (cust.type === 'select'   ? ' selected' : '') + '>Select</option>' +
                '<option value="checkbox"' + (cust.type === 'checkbox' ? ' selected' : '') + '>Checkbox</option>' +
              '</select>' +
              (cust.type === 'select' ? '<input type="text" placeholder="Options (comma-separated)" value="' + (cust.options || []).join(', ') + '" onchange="updateCustomization(' + item.id + ',' + idx + ',\'options\',this.value)" style="padding:0.3rem 0.5rem;border-radius:6px;border:1px solid var(--cream-dark);flex:1;outline:none;font-size:0.75rem" />' : '') +
              '<label style="display:flex;align-items:center;gap:0.3rem;white-space:nowrap;cursor:pointer;"><input type="checkbox"' + (cust.required ? ' checked' : '') + ' onchange="updateCustomization(' + item.id + ',' + idx + ',\'required\',this.checked)" style="cursor:pointer" /> Required</label>' +
              '<button onclick="deleteCustomization(' + item.id + ',' + idx + ')" style="background:var(--red);color:white;border:none;border-radius:6px;padding:0.3rem 0.5rem;cursor:pointer;font-weight:600;font-size:0.7rem">\u2715</button>' +
            '</div>';
          }).join('') : '<p style="color:var(--text-muted);font-size:0.75rem">No customizations yet.</p>') +
        '</div>' +
        '<button class="add-btn" onclick="addCustomization(' + item.id + ')" style="padding:0.4rem 0.8rem;font-size:0.75rem">+ Add Customization</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

function updateStock(id, val) {
  var item = window.State.menuItems.find(function(i) { return i.id === id; });
  if (item) item.stock = Math.max(0, parseInt(val) || 0);
  if (typeof upsertProduct === 'function') upsertProduct(item).catch(function(e) { console.warn('Save failed:', e); });
  showToast(item.emoji + ' ' + item.name + ': stock updated');
}

var _priceSaveTimer = {};
function updatePrice(id, val) {
  var item = window.State.menuItems.find(function(i) { return i.id === id; });
  if (!item) return;
  var parsed = parseFloat(val);
  if (!isNaN(parsed) && parsed >= 0) item.price = parsed;
  clearTimeout(_priceSaveTimer[id]);
  _priceSaveTimer[id] = setTimeout(function() {
    if (typeof upsertProduct === 'function') upsertProduct(item).catch(function(e) { console.warn('Save failed:', e); });
  }, 800);
}

var _descSaveTimer = {};
function updateDesc(id, val) {
  var item = window.State.menuItems.find(function(i) { return i.id === id; });
  if (!item) return;
  item.desc = val;
  clearTimeout(_descSaveTimer[id]);
  _descSaveTimer[id] = setTimeout(function() {
    if (typeof upsertProduct === 'function') upsertProduct(item).catch(function(e) { console.warn('Save failed:', e); });
  }, 800);
}

function toggleItem(id, btn) {
  var item = window.State.menuItems.find(function(i) { return i.id === id; });
  if (item) item.active = !item.active;
  btn.classList.toggle('on');  if (typeof upsertProduct === 'function') upsertProduct(item).catch(function(e) { console.warn('Save failed:', e); });  showToast(item.emoji + ' ' + item.name + ' ' + (item.active ? 'listed on shelf \u2713' : 'hidden from shelf'));
}

/* MODIFIED: updatePhoto — sets item.photo in State, re-renders menu on next nav (CHANGE 4) */
var _photoSaveTimer = {};
function updatePhoto(id, url) {
  var item = window.State.menuItems.find(function(i) { return i.id === id; });
  if (item) item.photo = url.trim();
  clearTimeout(_photoSaveTimer[id]);
  _photoSaveTimer[id] = setTimeout(function() {
    if (typeof upsertProduct === 'function') upsertProduct(item).catch(function(e) { console.warn('Save failed:', e); });
  }, 800);
}

function deleteProduct(id) {
  var item = window.State.menuItems.find(function(i) { return i.id === id; });
  if (!item) return;
  if (!confirm('Delete "' + item.name + '"? This cannot be undone.')) return;
  window.State.menuItems = window.State.menuItems.filter(function(i) { return i.id !== id; });
  var days = window.State.bakingDays;
  Object.keys(days).forEach(function(key) {
    if (days[key].items) days[key].items = days[key].items.filter(function(x) { return x.id !== id; });
  });
  window.State.cart = window.State.cart.filter(function(c) { return c.id !== id; });
  updateCartBadge();
  if (typeof deleteProductDb === 'function') deleteProductDb(id).catch(function(e) { console.warn('Delete failed:', e); });
  showToast(item.emoji + ' ' + item.name + ' deleted');
  renderProductsTab();
  renderMenu();
}

function toggleAddProductForm() {
  var form = document.getElementById('add-product-form');
  form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

/* ─── ITEM QUANTITY POP-UP (Task 7) ──────────────────────────── */
/* ADDED (Task 7): show a modal with the full item list and quantities for one order.
   Triggered by clicking the items cell in the incoming orders table. */
function showOrderItemsModal(idx) {
  var o = window.State.orders[idx];
  if (!o) return;

  /* Parse the items string ("Classic Loaf ×2, Apple Fritter Loaf ×1") into rows */
  var lines = o.items.split(', ').filter(function(s) { return s.trim(); });
  var rowsHtml = lines.map(function(line) {
    /* Split on the last × to separate name from quantity */
    var crossIdx = line.lastIndexOf('\u00D7');
    var name = crossIdx !== -1 ? line.substring(0, crossIdx).trim() : line.trim();
    var qty  = crossIdx !== -1 ? line.substring(crossIdx) : '';
    return '<div style="display:flex;justify-content:space-between;align-items:center;' +
      'padding:0.6rem 0;border-bottom:1px solid var(--cream-dark)">' +
      '<span style="font-size:0.9rem;color:var(--text)">' + name + '</span>' +
      (qty ? '<span style="background:var(--navy);color:var(--cream);padding:0.15rem 0.55rem;' +
        'border-radius:50px;font-size:0.8rem;font-weight:700;white-space:nowrap">' + qty + '</span>' : '') +
    '</div>';
  }).join('');

  /* Build and inject the overlay */
  var existing = document.getElementById('order-items-modal');
  if (existing) existing.remove();

  var modal = document.createElement('div');
  modal.id = 'order-items-modal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;' +
    'background:rgba(28,43,58,0.45);backdrop-filter:blur(2px);animation:fadeIn 0.2s ease both';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  /* Click backdrop to close */
  modal.addEventListener('click', function(e) { if (e.target === modal) closeOrderItemsModal(); });

  modal.innerHTML =
    '<div style="background:var(--white);border-radius:var(--radius);padding:1.75rem;max-width:420px;' +
      'width:90%;box-shadow:var(--shadow-hover);max-height:80vh;overflow-y:auto">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1rem">' +
        '<div>' +
          '<div style="font-family:\'Playfair Display\',serif;font-size:1.1rem;font-weight:600;color:var(--navy)">' +
            o.name + '\u2019s Order</div>' +
          '<div style="font-size:0.78rem;color:var(--text-muted);margin-top:0.15rem">' +
            o.id + ' &nbsp;&middot;&nbsp; ' + o.date +
          '</div>' +
        '</div>' +
        '<button onclick="closeOrderItemsModal()" style="background:none;border:none;font-size:1.3rem;' +
          'cursor:pointer;color:var(--text-muted);line-height:1;padding:0.1rem 0.3rem">&times;</button>' +
      '</div>' +
      '<div>' + (rowsHtml || '<p style="color:var(--text-muted);font-size:0.88rem">No items found.</p>') + '</div>' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:1rem;' +
        'padding-top:0.75rem;border-top:2px solid var(--cream-dark)">' +
        '<span style="font-size:0.85rem;color:var(--text-muted)">Order total</span>' +
        '<strong style="font-size:1rem;color:var(--navy)">$' + o.total + '</strong>' +
      '</div>' +
    '</div>';

  document.body.appendChild(modal);
}

/* ADDED (Task 7): close the item-quantity modal */
function closeOrderItemsModal() {
  var modal = document.getElementById('order-items-modal');
  if (modal) modal.remove();
}

function addProduct() {
  var emoji = document.getElementById('add-emoji').value.trim();
  var name  = document.getElementById('add-name').value.trim();
  var cat   = document.getElementById('add-category').value;
  var price = parseFloat(document.getElementById('add-price').value);
  var stock = parseInt(document.getElementById('add-stock').value) || 0;
  var desc  = document.getElementById('add-desc').value.trim();
  /* MODIFIED: read photo URL from add-product form (CHANGE 4) */
  var photo = document.getElementById('add-photo').value.trim();
  if (!emoji || !name || !price) { showToast('Fill in emoji, name, and price'); return; }
  var newItem = {
    name: name, cat: cat, price: price, stock: stock, emoji: emoji,
    desc: desc, active: true, customizations: [],
    photo: photo || ''  /* MODIFIED: include photo in new items (CHANGE 4) */
  };
  var resetForm = function() {
    ['add-emoji','add-name','add-price','add-stock','add-desc','add-photo'].forEach(function(id) {
      var el = document.getElementById(id); if (el) el.value = '';
    });
    toggleAddProductForm();
  };
  if (typeof upsertProduct === 'function') {
    upsertProduct(newItem).then(function(saved) {
      newItem.id = saved.id;
      window.State.menuItems.push(newItem);
      resetForm();
      showToast(emoji + ' ' + name + ' added!');
      renderProductsTab();
      renderMenu();
    }).catch(function(e) {
      console.warn('Save failed:', e);
      showToast('Could not save to Supabase. Check the menu_items table exists.');
    });
  } else {
    newItem.id = Math.max.apply(null, window.State.menuItems.map(function(i) { return i.id; }).concat([0])) + 1;
    window.State.menuItems.push(newItem);
    resetForm();
    showToast(emoji + ' ' + name + ' added!');
    renderProductsTab();
    renderMenu();
  }
}

/* Debounced save for customization field edits */
var _custSaveTimer = {};
function _saveProductDebounced(itemId) {
  var item = window.State.menuItems.find(function(i) { return i.id === itemId; });
  if (!item || typeof upsertProduct !== 'function') return;
  clearTimeout(_custSaveTimer[itemId]);
  _custSaveTimer[itemId] = setTimeout(function() {
    upsertProduct(item).catch(function(e) { console.warn('Save failed:', e); });
  }, 800);
}

function addCustomization(itemId) {
  var item = window.State.menuItems.find(function(i) { return i.id === itemId; });
  if (!item.customizations) item.customizations = [];
  item.customizations.push({label: '', type: 'text', options: [], required: false});
  _saveProductDebounced(itemId);
  renderProductsTab();
}

function deleteCustomization(itemId, custIdx) {
  var item = window.State.menuItems.find(function(i) { return i.id === itemId; });
  if (item.customizations && item.customizations[custIdx]) {
    item.customizations.splice(custIdx, 1);
    _saveProductDebounced(itemId);
    renderProductsTab();
  }
}

function updateCustomization(itemId, custIdx, field, value) {
  var item = window.State.menuItems.find(function(i) { return i.id === itemId; });
  if (!item.customizations || !item.customizations[custIdx]) return;
  if (field === 'options') {
    item.customizations[custIdx].options = value.split(',').map(function(s) { return s.trim(); }).filter(function(s) { return s; });
  } else if (field === 'required') {
    item.customizations[custIdx].required = value;
  } else {
    item.customizations[custIdx][field] = value;
  }
  _saveProductDebounced(itemId);
}


/* ─── SCHEDULE TAB (calendar + day editor) ──────────────────── */

/**
 * Render the Schedule tab: a monthly calendar on the left and a
 * per-day item editor on the right.  Dots on calendar cells indicate
 * days that are toggled "on" in the baking schedule (State.bakingDays).
 * Item quantities are fetched from / saved to Supabase on demand.
 */
function renderScheduleTab() {
  var S    = window.State;
  var wrap = document.getElementById('sched-content');
  if (!wrap) return;

  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var todayISO = toLocalISO(today);

  var year        = S.calendarYear;
  var month       = S.calendarMonth;
  var monthLabel  = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  var firstDow    = new Date(year, month, 1).getDay();
  var daysInMonth = new Date(year, month + 1, 0).getDate();

  /* Day-of-week header */
  var labelCells = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
    .map(function(d) { return '<div class="calendar-day-label">' + d + '</div>'; }).join('');

  /* Calendar cells */
  var cells = '';
  for (var e = 0; e < firstDow; e++) cells += '<div class="calendar-cell empty"></div>';
  for (var d = 1; d <= daysInMonth; d++) {
    var cellDate = new Date(year, month, d);
    var iso      = toLocalISO(cellDate);
    var isPast   = iso < todayISO;
    var isToday  = iso === todayISO;
    var isSel    = S.calendarSelectedDate === iso;
    var isOn     = !!(S.activeDays && S.activeDays[iso]);

    var cls = 'calendar-cell';
    if (isPast)  cls += ' past';
    if (isSel)   cls += ' active';
    if (isToday && !isSel) cls += ' is-today';

    var inner = String(d);
    if (isOn) inner += '<span class="dot"></span>';

    cells += '<div class="' + cls + '" data-sched-iso="' + iso + '"' +
      (!isPast ? ' onclick="selectScheduleDate(\'' + iso + '\')"' : '') + '>' +
      inner + '</div>';
  }

  var calHtml =
    '<div class="calendar-wrap">' +
      '<div class="calendar-header">' +
        '<button class="calendar-nav-btn" onclick="navScheduleCalendar(-1)">\u2190</button>' +
        '<h3>' + monthLabel + '</h3>' +
        '<button class="calendar-nav-btn" onclick="navScheduleCalendar(1)">\u2192</button>' +
      '</div>' +
      '<div class="calendar-grid">' + labelCells + cells + '</div>' +
    '</div>';

  /* Right column: editor or empty-state prompt */
  var editorHtml = S.calendarSelectedDate
    ? _schedEditorShell(S.calendarSelectedDate)
    : '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;' +
        'min-height:220px;color:var(--text-muted);font-size:0.9rem;text-align:center;' +
        'background:var(--cream);border-radius:var(--radius);border:1px solid var(--cream-dark);padding:2rem">' +
        '<span style="font-size:2rem;margin-bottom:0.75rem">\uD83D\uDCC5</span>' +
        'Select a date on the calendar<br>to edit its baking schedule.' +
      '</div>';

  wrap.innerHTML =
    '<div style="display:flex;gap:1.5rem;align-items:flex-start;flex-wrap:wrap">' +
      '<div style="flex:0 0 auto;min-width:300px">' + calHtml + '</div>' +
      '<div style="flex:1;min-width:280px">' + editorHtml + '</div>' +
    '</div>';

  /* Async-load item rows into the editor after the DOM is ready */
  if (S.calendarSelectedDate) _loadSchedItems(S.calendarSelectedDate);
}

/* Build the static shell of the day editor (date heading + Day Active toggle).
   Item rows are injected by _loadSchedItems() once Supabase responds. */
function _schedEditorShell(iso) {
  var S     = window.State;
  var dt    = new Date(iso + 'T00:00:00');
  var label = dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  var isOn  = !!(S.activeDays && S.activeDays[iso]);

  return '<div class="day-editor">' +
    /* Header row: date label + day-active toggle */
    '<div style="display:flex;justify-content:space-between;align-items:center;' +
      'margin-bottom:1.25rem;flex-wrap:wrap;gap:0.75rem;padding-bottom:1rem;' +
      'border-bottom:1px solid var(--cream-dark)">' +
      '<h4 style="margin:0">' + label + '</h4>' +
      '<div style="display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap">' +
        '<span style="font-size:0.8rem;font-weight:600;color:var(--text-muted)">Day Active</span>' +
        '<button class="inv-toggle' + (isOn ? ' on' : '') + '" id="sched-day-toggle" ' +
          'onclick="toggleScheduleDay(\'' + iso + '\')" title="Toggle day on / off"></button>' +
        '<span id="sched-day-status" style="font-size:0.76rem;color:var(--text-muted)">' +
          (isOn ? 'On \u2014 visible in order form' : 'Off \u2014 hidden from order form') +
        '</span>' +
      '</div>' +
    '</div>' +
    /* Item rows placeholder (filled by _loadSchedItems) */
    '<div id="sched-items-content">' +
      '<p style="color:var(--text-muted);font-size:0.88rem;text-align:center;padding:1.5rem 0">Loading items\u2026</p>' +
    '</div>' +
  '</div>';
}

/* Fetch availability for `iso` from Supabase then fill #sched-items-content. */
function _loadSchedItems(iso) {
  var itemsEl = document.getElementById('sched-items-content');
  if (!itemsEl) return;

  if (typeof fetchAvailability !== 'function') {
    itemsEl.innerHTML = '<p style="color:var(--red);font-size:0.85rem">Supabase not configured \u2014 add keys to js/env.js.</p>';
    return;
  }

  var activeItems = window.State.menuItems.filter(function(i) { return i.active; });
  if (!activeItems.length) {
    itemsEl.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;text-align:center;padding:1rem 0">No active menu items.</p>';
    return;
  }

  fetchAvailability(iso).then(function(dbRows) {
    var dbByName = {};
    (dbRows || []).forEach(function(r) { dbByName[r.item_name] = r; });

    var colStyle = 'display:grid;grid-template-columns:1fr 90px 52px 64px;gap:0.6rem;align-items:center;';
    var inputStyle = 'width:100%;padding:0.3rem 0.4rem;border-radius:6px;border:1.5px solid var(--cream-dark);' +
      'font-size:0.88rem;text-align:center;outline:none;font-family:\'DM Sans\'';

    var header =
      '<div style="' + colStyle + 'padding:0.35rem 0;font-size:0.7rem;font-weight:700;' +
        'text-transform:uppercase;letter-spacing:0.07em;color:var(--text-muted);' +
        'border-bottom:2px solid var(--cream-dark);margin-bottom:0.15rem">' +
        '<span>Item</span>' +
        '<span style="text-align:center">Qty Available</span>' +
        '<span style="text-align:center">Active</span>' +
        '<span></span>' +
      '</div>';

    var rows = activeItems.map(function(item) {
      var dbRow    = dbByName[item.name];
      var qty      = dbRow ? dbRow.total_available : 0;
      var isActive = dbRow ? dbRow.is_active : true;
      return '<div style="' + colStyle + 'padding:0.6rem 0;border-bottom:1px solid var(--cream-dark)">' +
        '<span style="font-weight:600;font-size:0.87rem;color:var(--navy)">' + item.emoji + ' ' + item.name + '</span>' +
        '<div style="text-align:center">' +
          '<input type="number" min="0" value="' + qty + '" id="sched-qty-' + item.id + '" style="' + inputStyle + '" />' +
        '</div>' +
        '<div style="text-align:center">' +
          '<button class="inv-toggle' + (isActive ? ' on' : '') + '" id="sched-toggle-' + item.id + '" ' +
            'onclick="this.classList.toggle(\'on\')" title="Toggle this item"></button>' +
        '</div>' +
        '<button class="add-btn" style="padding:0.3rem 0.55rem;font-size:0.74rem" ' +
          'onclick="saveScheduleRow(\'' + iso + '\',' + item.id + ')">Save</button>' +
      '</div>';
    }).join('');

    var saveAllBtn =
      '<div style="padding:0.85rem 0 0.15rem">' +
        '<button class="add-btn" onclick="saveScheduleAll(\'' + iso + '\')" style="padding:0.45rem 1.4rem">Save All</button>' +
      '</div>';

    itemsEl.innerHTML = header + rows + saveAllBtn;
  }).catch(function(err) {
    itemsEl.innerHTML = '<p style="color:var(--red);font-size:0.85rem">Error: ' + err.message + '</p>';
  });
}

/* Navigate to next / previous month.  Clears the selected date. */
function navScheduleCalendar(delta) {
  var S = window.State;
  S.calendarMonth += delta;
  if (S.calendarMonth > 11) { S.calendarMonth = 0; S.calendarYear++; }
  if (S.calendarMonth < 0)  { S.calendarMonth = 11; S.calendarYear--; }
  S.calendarSelectedDate = null;
  renderScheduleTab();
}

/* Select a date. No-op if it is already selected (preserves unsaved qty inputs). */
function selectScheduleDate(iso) {
  if (window.State.calendarSelectedDate === iso) return;
  window.State.calendarSelectedDate = iso;
  renderScheduleTab();
}

/* Toggle "Day Active" for the specific date `iso` only.
   Persists to the active_days Supabase table, re-seeds bakingDays, and
   updates only that calendar cell in-place (no full re-render). */
function toggleScheduleDay(iso) {
  var S = window.State;
  if (!S.activeDays) S.activeDays = {};
  var newActive = !S.activeDays[iso];

  if (newActive) {
    S.activeDays[iso] = true;
  } else {
    delete S.activeDays[iso];
  }

  /* Persist to Supabase — fire-and-forget, toast on error only */
  if (typeof upsertActiveDay === 'function') {
    upsertActiveDay(iso, newActive).catch(function(err) {
      showToast('Could not save day setting: ' + err.message);
    });
  }

  /* Re-seed bakingDays so the order wizard date-picker reflects the change */
  if (typeof reseedBakingDays === 'function') reseedBakingDays();

  /* Update toggle button */
  var toggleBtn = document.getElementById('sched-day-toggle');
  if (toggleBtn) toggleBtn.classList.toggle('on', newActive);

  /* Update status text */
  var statusEl = document.getElementById('sched-day-status');
  if (statusEl) statusEl.textContent = newActive
    ? 'On \u2014 visible in order form'
    : 'Off \u2014 hidden from order form';

  /* Add / remove dot on this specific calendar cell only */
  var cell = document.querySelector('.calendar-cell[data-sched-iso="' + iso + '"]');
  if (cell) {
    var dot = cell.querySelector('.dot');
    if (newActive && !dot) {
      var newDot = document.createElement('span');
      newDot.className = 'dot';
      cell.appendChild(newDot);
    } else if (!newActive && dot) {
      dot.remove();
    }
  }
}

/* Save one item row via upsert keyed on (date, item_name). */
function saveScheduleRow(date, itemId) {
  var item = window.State.menuItems.find(function(i) { return i.id === itemId; });
  if (!item) return;
  var qtyInput  = document.getElementById('sched-qty-'    + itemId);
  var toggleBtn = document.getElementById('sched-toggle-' + itemId);
  var qty      = Math.max(0, parseInt((qtyInput && qtyInput.value) || '0') || 0);
  var isActive = toggleBtn ? toggleBtn.classList.contains('on') : true;
  if (typeof upsertAvailability !== 'function') { showToast('Supabase not configured.'); return; }
  upsertAvailability({
    date:            date,
    item_name:       item.name,
    item_price:      Number(item.price),
    item_emoji:      item.emoji,
    total_available: qty,
    is_active:       isActive
  }).then(function() {
    showToast(item.emoji + ' ' + item.name + ' saved');
    if (window.State.dailyAvailability) delete window.State.dailyAvailability[date];
  }).catch(function(err) { showToast('Save failed: ' + err.message); });
}

/* Upsert all active items for the date in one batch then re-render. */
function saveScheduleAll(date) {
  var S = window.State;
  var activeItems = S.menuItems.filter(function(i) { return i.active; });
  if (typeof upsertAvailability !== 'function') { showToast('Supabase not configured.'); return; }
  var promises = activeItems.map(function(item) {
    var qtyInput  = document.getElementById('sched-qty-'    + item.id);
    var toggleBtn = document.getElementById('sched-toggle-' + item.id);
    var qty      = Math.max(0, parseInt((qtyInput && qtyInput.value) || '0') || 0);
    var isActive = toggleBtn ? toggleBtn.classList.contains('on') : true;
    return upsertAvailability({
      date:            date,
      item_name:       item.name,
      item_price:      Number(item.price),
      item_emoji:      item.emoji,
      total_available: qty,
      is_active:       isActive
    });
  });
  Promise.all(promises).then(function() {
    showToast('Saved all items for ' + date);
    if (S.dailyAvailability) delete S.dailyAvailability[date];
    renderScheduleTab();
  }).catch(function(err) { showToast('Save failed: ' + err.message); });
}

