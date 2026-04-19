/* === BLUE SHELF MICROBAKERY === FILE: js/supabase.js === */
/* Supabase REST integration for saving orders from a vanilla JS site */

/* TODO: Replace with your Supabase project URL, e.g. https://xyzcompany.supabase.co */
var SUPABASE_URL = 'https://YOUR_PROJECT_REF.supabase.co';
/* TODO: Replace with your Supabase anon public key from Project Settings > API */
var SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

/**
 * Save one order row using Supabase PostgREST.
 * Exposed on window for non-module script usage in this static site.
 *
 * @param {Object} orderData - Payload matching the public orders table schema
 * @returns {Promise<Object>} The inserted row returned by Supabase
 */
function saveOrder(orderData) {
  var endpoint = SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/orders';

  return fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
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

/* Export for this non-module app */
window.saveOrder = saveOrder;
