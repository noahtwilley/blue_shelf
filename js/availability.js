/* === BLUE SHELF MICROBAKERY === FILE: js/availability.js === */
/* Daily availability: fetch, cache, poll, and update hero status badge */

var _availPollInterval = null;

/**
 * Fetch and cache availability for a date into window.State.dailyAvailability[date].
 * Silently falls back to an empty array on network errors.
 */
function refreshAvailability(date) {
  if (!date || typeof fetchAvailability !== 'function') return Promise.resolve([]);
  return fetchAvailability(date).then(function(rows) {
    if (!window.State.dailyAvailability) window.State.dailyAvailability = {};
    window.State.dailyAvailability[date] = rows || [];
    return rows || [];
  }).catch(function(err) {
    console.warn('[availability] fetch failed for', date, ':', err.message);
    if (!window.State.dailyAvailability) window.State.dailyAvailability = {};
    /* Preserve any existing cached value on error — don't overwrite with undefined */
    if (window.State.dailyAvailability[date] === undefined) {
      window.State.dailyAvailability[date] = [];
    }
    return window.State.dailyAvailability[date];
  });
}

/**
 * Update the status badge in the order-page hero.
 * Shows "🟢 Taking orders" or "🔴 Sold out today" based on today's rows.
 */
function updateAvailabilityBadge() {
  var badge = document.getElementById('availability-badge');
  if (!badge) return;
  var today = toLocalISO(new Date());
  var avail = window.State.dailyAvailability && window.State.dailyAvailability[today];
  if (!avail || !avail.length) { badge.style.display = 'none'; return; }
  var open = avail.some(function(r) { return r.is_active && r.remaining > 0; });
  badge.style.display = 'inline-flex';
  badge.className = 'avail-badge ' + (open ? 'avail-badge--open' : 'avail-badge--closed');
  badge.textContent = open ? '🟢 Taking orders' : '🔴 Sold out today';
}

/**
 * Show or hide the sold-out banner for the selected order date.
 * Only fires if all items on that date are sold out or unavailable.
 */
function updateSoldOutBanner(date) {
  var banner = document.getElementById('soldout-banner');
  if (!banner) return;
  var avail = window.State.dailyAvailability && window.State.dailyAvailability[date];
  if (!avail || !avail.length) { banner.style.display = 'none'; return; }
  var anyAvail = avail.some(function(r) { return r.is_active && r.remaining > 0; });
  banner.style.display = anyAvail ? 'none' : 'block';
}

/**
 * Poll availability every 60 seconds.
 * Refreshes the currently selected date (or today if none selected).
 * Re-renders Step 3 if the user is currently on it.
 */
function startAvailabilityPolling() {
  if (_availPollInterval) clearInterval(_availPollInterval);
  _availPollInterval = setInterval(function() {
    var date = (window.State.wizardState && window.State.wizardState.date) || toLocalISO(new Date());
    refreshAvailability(date).then(function() {
      updateAvailabilityBadge();
      if (window.State.wizardState && window.State.wizardState.step === 3) {
        if (typeof renderProductsStep === 'function') renderProductsStep();
      }
    });
  }, 60000);
}

function stopAvailabilityPolling() {
  if (_availPollInterval) { clearInterval(_availPollInterval); _availPollInterval = null; }
}
