/* === BLUE SHELF MICROBAKERY === FILE: js/router.js === */
/* Page navigation and admin tab switching */

function showPage(name) {
  if (typeof appReady !== 'undefined' && !appReady) return;
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
  }
  if (name === 'admin') {
    renderAdmin();
    if (window.State.adminUnlocked) showAdminTab('orders');
  }
  window.scrollTo(0, 0);
}

function showAdminTab(tabName) {
  document.querySelectorAll('.admin-tab').forEach(function(t) { t.classList.remove('active'); });
  document.querySelectorAll('.admin-sub-tab').forEach(function(t) { t.classList.remove('active'); });
  document.getElementById('admin-tab-' + tabName).classList.add('active');
  /* Find the matching sub-tab button by data attribute */
  var btn = document.querySelector('.admin-sub-tab[data-tab="' + tabName + '"]');
  if (btn) btn.classList.add('active');
  if (tabName === 'orders') renderOrdersTab();
  if (tabName === 'summary') renderDaySummaryTab();
  if (tabName === 'products') renderProductsTab();
  if (tabName === 'bakingdays') renderBakingDaysTab();
}
