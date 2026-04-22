/* === BLUE SHELF MICROBAKERY === FILE: js/supabase.js === */
/* Supabase REST integration for saving orders from a vanilla JS site */

/* Values are sourced from window.__ENV__ (provided by local js/env.js). */
/* Keep real secrets out of git by storing them in .env + js/env.js (both ignored). */
/* Keys are read lazily inside saveOrder() so env.js load-order doesn't matter. */

/**
 * Save one order row using Supabase PostgREST.
 * Exposed on window for non-module script usage in this static site.
 *
 * @param {Object} orderData - Payload matching the public orders table schema
 * @returns {Promise<Object>} The inserted row returned by Supabase
 */
function saveOrder(orderData) {
  /* Read keys at call time so env.js load order is irrelevant */
  var url = (window.__ENV__ && window.__ENV__.SUPABASE_URL) || '';
  var key = (window.__ENV__ && window.__ENV__.SUPABASE_ANON_KEY) || '';

  if (!url || !key) {
    /* Return a rejected Promise — synchronous throw is NOT caught by .catch() on the caller */
    return Promise.reject(new Error('Supabase is not configured. Add SUPABASE_URL and SUPABASE_ANON_KEY to js/env.js.'));
  }

  var endpoint = url.replace(/\/$/, '') + '/rest/v1/orders';

  return fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': key,
      'Authorization': 'Bearer ' + key,
      /* return=representation returns inserted rows so client can confirm write */
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(orderData)
  }).then(function(response) {
    if (!response.ok) {
      return response.text().then(function(raw) {
        var detail = raw;
        try {
          var parsed = JSON.parse(raw);
          detail = parsed.message || parsed.error_description || parsed.error || raw;
        } catch (e) {
          /* Keep raw text detail if the response is not JSON */
        }
        throw new Error('Failed to save order to Supabase (' + response.status + '): ' + detail);
      });
    }

    return response.json().then(function(rows) {
      return rows && rows[0] ? rows[0] : {};
    });
  });
}

/**
 * Fetch all orders from Supabase, sorted oldest-first.
 * Used by the admin panel to load the full persisted order history.
 *
 * @returns {Promise<Array>} Raw Supabase rows from the orders table
 */
function fetchOrders() {
  var url = (window.__ENV__ && window.__ENV__.SUPABASE_URL) || '';
  var key = (window.__ENV__ && window.__ENV__.SUPABASE_ANON_KEY) || '';

  if (!url || !key) {
    return Promise.reject(new Error('Supabase is not configured. Add keys to js/env.js.'));
  }

  var endpoint = url.replace(/\/$/, '') + '/rest/v1/orders?select=*&order=created_at.asc';

  return fetch(endpoint, {
    method: 'GET',
    headers: {
      'apikey': key,
      'Authorization': 'Bearer ' + key
    }
  }).then(function(response) {
    if (!response.ok) {
      return response.text().then(function(raw) {
        var detail = raw;
        try {
          var parsed = JSON.parse(raw);
          detail = parsed.message || parsed.error_description || parsed.error || raw;
        } catch (e) { /* keep raw text */ }
        throw new Error('Failed to fetch orders (' + response.status + '): ' + detail);
      });
    }
    return response.json();
  });
}

/* Export for this non-module app */
window.saveOrder   = saveOrder;
window.fetchOrders = fetchOrders;

/**
 * Fetch daily availability for a date using the get_availability RPC.
 * Returns [{id, date, item_name, item_price, item_emoji, total_available, total_ordered, remaining, is_active}]
 */
function fetchAvailability(date) {
  var url = (window.__ENV__ && window.__ENV__.SUPABASE_URL) || '';
  var key = (window.__ENV__ && window.__ENV__.SUPABASE_ANON_KEY) || '';
  if (!url || !key) return Promise.reject(new Error('Supabase not configured.'));
  return fetch(url.replace(/\/$/, '') + '/rest/v1/rpc/get_availability', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': key, 'Authorization': 'Bearer ' + key },
    body: JSON.stringify({ p_date: date })
  }).then(function(r) {
    if (!r.ok) return r.text().then(function(t) { throw new Error('Availability fetch failed (' + r.status + '): ' + t); });
    return r.json();
  });
}

/**
 * Upsert one availability row (admin use).
 * Matches on the UNIQUE(date, item_name) constraint via Prefer: resolution=merge-duplicates.
 */
function upsertAvailability(row) {
  var url = (window.__ENV__ && window.__ENV__.SUPABASE_URL) || '';
  var key = (window.__ENV__ && window.__ENV__.SUPABASE_ANON_KEY) || '';
  if (!url || !key) return Promise.reject(new Error('Supabase not configured.'));
  return fetch(url.replace(/\/$/, '') + '/rest/v1/daily_availability?on_conflict=date,item_name', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': key,
      'Authorization': 'Bearer ' + key,
      'Prefer': 'resolution=merge-duplicates,return=representation'
    },
    body: JSON.stringify(row)
  }).then(function(r) {
    if (!r.ok) return r.text().then(function(t) { throw new Error('Upsert failed (' + r.status + '): ' + t); });
    return r.json();
  });
}

/**
 * Place an order via the place_order RPC for atomic stock checking.
 * Falls back to saveOrder() if the RPC is not yet deployed (backward compatible).
 */
function placeOrderRpc(orderData) {
  var url = (window.__ENV__ && window.__ENV__.SUPABASE_URL) || '';
  var key = (window.__ENV__ && window.__ENV__.SUPABASE_ANON_KEY) || '';
  if (!url || !key) return Promise.reject(new Error('Supabase not configured.'));
  return fetch(url.replace(/\/$/, '') + '/rest/v1/rpc/place_order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': key, 'Authorization': 'Bearer ' + key },
    body: JSON.stringify(orderData)
  }).then(function(r) {
    /* 404 = RPC not yet deployed — degrade gracefully to direct insert */
    if (r.status === 404) return saveOrder(orderData);
    if (!r.ok) return r.text().then(function(t) {
      var msg = t;
      try { var p = JSON.parse(t); msg = p.message || p.hint || t; } catch(e) {}
      throw new Error(msg);
    });
    return r.json();
  });
}

window.fetchAvailability  = fetchAvailability;
window.upsertAvailability = upsertAvailability;
window.placeOrderRpc      = placeOrderRpc;

/**
 * Delete a single order row by its numeric database ID.
 * Returns a resolved Promise on success, rejected on any HTTP error.
 */
function deleteOrder(dbId) {
  var url = (window.__ENV__ && window.__ENV__.SUPABASE_URL) || '';
  var key = (window.__ENV__ && window.__ENV__.SUPABASE_ANON_KEY) || '';
  if (!url || !key) return Promise.reject(new Error('Supabase not configured.'));
  return fetch(url.replace(/\/$/, '') + '/rest/v1/orders?id=eq.' + encodeURIComponent(dbId), {
    method: 'DELETE',
    headers: {
      'apikey': key,
      'Authorization': 'Bearer ' + key
    }
  }).then(function(r) {
    if (!r.ok) {
      return r.text().then(function(t) {
        var detail = t;
        try { var p = JSON.parse(t); detail = p.message || p.error_description || p.error || t; } catch (e) {}
        throw new Error('Delete failed (' + r.status + '): ' + detail);
      });
    }
    return true;
  });
}

window.deleteOrder = deleteOrder;
