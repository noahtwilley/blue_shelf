/* === BLUE SHELF MICROBAKERY === FILE: js/toast.js === */
/* Toast notifications and cart badge */

var toastTimer;
function showToast(msg) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function() { t.classList.remove('show'); }, 2600);
}

function updateCartBadge() {
  var el = document.getElementById('cart-count');
  if (!el) return;
  var total = window.State.cart.reduce(function(s, c) { return s + c.qty; }, 0);
  el.textContent = total;
  el.classList.add('bump');
  setTimeout(function() { el.classList.remove('bump'); }, 350);
}
