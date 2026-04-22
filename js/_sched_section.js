
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
    var dayData  = S.bakingDays[iso];
    var isOn     = dayData && dayData.active;

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
  var isOn  = !!(S.bakingDays[iso] && S.bakingDays[iso].active);

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

/* Toggle "Day Active" for a date.  Mutates State.bakingDays and updates the DOM
   in-place without re-rendering the item rows (unsaved qty values are preserved). */
function toggleScheduleDay(iso) {
  var S = window.State;
  if (!S.bakingDays[iso]) {
    S.bakingDays[iso] = { active: true, notes: '', pickup: true, items: [] };
  } else {
    S.bakingDays[iso].active = !S.bakingDays[iso].active;
  }
  var isOn = S.bakingDays[iso].active;

  /* Update toggle button */
  var toggleBtn = document.getElementById('sched-day-toggle');
  if (toggleBtn) toggleBtn.classList.toggle('on', isOn);

  /* Update status text */
  var statusEl = document.getElementById('sched-day-status');
  if (statusEl) statusEl.textContent = isOn
    ? 'On \u2014 visible in order form'
    : 'Off \u2014 hidden from order form';

  /* Add / remove dot on the calendar cell without re-rendering */
  var cell = document.querySelector('.calendar-cell[data-sched-iso="' + iso + '"]');
  if (cell) {
    var dot = cell.querySelector('.dot');
    if (isOn && !dot) {
      var newDot = document.createElement('span');
      newDot.className = 'dot';
      cell.appendChild(newDot);
    } else if (!isOn && dot) {
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
