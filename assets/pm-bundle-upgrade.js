/* Bundle & Save line upgrades (sections/pm-bundle-save.liquid). An upgrade line (properties _bundle_id + _bundle_per) belongs to
   the bundle line with the same _bundle_id and holds _bundle_per bottles per bundle. After every cart change (and on load when
   the cart has upgrade lines) its quantity is set to _bundle_per x the bundle quantity, 0 when the bundle is gone.
   After a change the cart drawer (and the icon bubble) is re-rendered; on the cart page the page reloads. */
(function () {
  if (window.__pmBundleUpgrade) return;
  window.__pmBundleUpgrade = true;

  const root = () => (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || '/';
  const tries = {};
  let busy = false;
  let again = false;

  async function check() {
    if (busy) {
      again = true;
      return;
    }
    busy = true;
    try {
      const cart = await (await fetch(`${root()}cart.js`, { headers: { Accept: 'application/json' } })).json();
      const bundles = {};
      cart.items.forEach((item) => {
        const p = item.properties || {};
        if (p._bundle_id && !p._bundle_per) bundles[p._bundle_id] = (bundles[p._bundle_id] || 0) + item.quantity;
      });
      const updates = {};
      cart.items.forEach((item) => {
        const p = item.properties || {};
        if (!p._bundle_per) return;
        const want = (bundles[p._bundle_id] || 0) * (parseInt(p._bundle_per, 10) || 0);
        if (item.quantity !== want) updates[item.key] = want;
      });
      if (!Object.keys(updates).length) return;

      // One try per distinct change (plus one retry), so a refused update never loops.
      const sig = JSON.stringify(updates);
      tries[sig] = (tries[sig] || 0) + 1;
      if (tries[sig] > 2) return;
      await fetch(`${root()}cart/update.js`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ updates })
      });
      await refresh();
    } catch (e) {
      console.error('[pm-bundle-upgrade]', e);
    } finally {
      busy = false;
      if (again) {
        again = false;
        check();
      }
    }
  }

  async function refresh() {
    if (document.getElementById('main-cart-items')) {
      window.location.reload();
      return;
    }
    const res = await fetch(`${root()}?sections=cart-drawer,cart-icon-bubble`);
    const sections = await res.json();
    const parse = (html) => new DOMParser().parseFromString(html, 'text/html');
    const inner = document.querySelector('#CartDrawer .drawer__inner');
    const fresh = sections['cart-drawer'] && parse(sections['cart-drawer']).querySelector('.drawer__inner');
    if (inner && fresh) inner.innerHTML = fresh.innerHTML;
    const bubble = document.getElementById('cart-icon-bubble');
    const freshBubble = sections['cart-icon-bubble'] && parse(sections['cart-icon-bubble']).querySelector('.shopify-section');
    if (bubble && freshBubble) bubble.innerHTML = freshBubble.innerHTML;
  }

  const checkOnLoad = document.currentScript && document.currentScript.hasAttribute('data-check');
  const start = () => {
    if (typeof subscribe === 'function' && typeof PUB_SUB_EVENTS !== 'undefined') subscribe(PUB_SUB_EVENTS.cartUpdate, check);
    if (checkOnLoad) check();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
