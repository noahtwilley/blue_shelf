/* === BLUE SHELF MICROBAKERY === FILE: js/router.js === */
/* Page navigation and admin tab switching */

function showPage(name) {
  if (typeof appReady !== 'undefined' && !appReady) return;
  /* Stop availability polling whenever we navigate away from the order page */
  if (typeof stopAvailabilityPolling === 'function') stopAvailabilityPolling();
  document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
  document.querySelectorAll('.nav-tab').forEach(function(t) { t.classList.remove('active'); });
  document.getElementById('page-' + name).classList.add('active');
  document.getElementById('tab-' + name).classList.add('active');
  if (name === 'menu') renderMenu();
  if (name === 'order') {
    resetWizard();
    document.getElementById('wizard-wrap').style.display = 'block';
    document.getElementById('order-success').classList.remove('show');
    document.getElementById('floating-subtotal').classList.add('hide');
    goToStep(1);
    /* Fetch today's availability for the hero badge, then start polling */
    if (typeof refreshAvailability === 'function') {
      refreshAvailability(toLocalISO(new Date())).then(function() { updateAvailabilityBadge(); });
    }
    if (typeof startAvailabilityPolling === 'function') startAvailabilityPolling();
  }
  if (name === 'admin') {
    renderAdmin();
    if (window.State.adminUnlocked) showAdminTab('orders');
  }
  window.scrollTo(0, 0);
}

function showAdminTab(tabName) {
  /* Redirect merged tabs to their replacement */
  if (tabName === 'bakingdays' || tabName === 'availability') tabName = 'schedule';
  document.querySelectorAll('.admin-tab').forEach(function(t) { t.classList.remove('active'); });
  document.querySelectorAll('.admin-sub-tab').forEach(function(t) { t.classList.remove('active'); });
  var tabEl = document.getElementById('admin-tab-' + tabName);
  if (!tabEl) return;
  tabEl.classList.add('active');
  /* Find the matching sub-tab button by data attribute */
  var btn = document.querySelector('.admin-sub-tab[data-tab="' + tabName + '"]');
  if (btn) btn.classList.add('active');
  if (tabName === 'orders')   renderOrdersTab();
  if (tabName === 'summary')  renderDaySummaryTab();
  if (tabName === 'products') renderProductsTab();
  if (tabName === 'schedule') renderScheduleTab();
}
