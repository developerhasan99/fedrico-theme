/**
 * "Filter and sort" drawer of the collection toolbar (snippets/pm-filters.liquid), modelled on
 * magyx.co (assets/mgx-filters.js). Filtering and sorting stay with Dawn's facets.js: the drawer's
 * form is form#FacetFiltersForm inside <facet-filters-form>, so facets.js builds the URL, re-renders
 * #ProductGridContainer, #ProductCount and every details.js-filter, and handles Back / Forward.
 * This file adds:
 * - the drawer: the pill opens it, the X, the overlay, Escape and Apply close it; scroll locked and
 *   focus kept inside while open; Apply returns to the top of the grid;
 * - a tick or a sort choice applies at once (facets.js waits 800ms after any input, which suits the
 *   price fields it still drives, not a checkbox);
 * - after every facets.js render, the elements marked data-pm-fsync (pill count, Apply count,
 *   "Remove all") are copied from the fresh section, by id.
 * Infinite scroll and the search re-arm themselves when #ProductGridContainer changes
 * (assets/pm-collection-grid-loader.js, assets/pm-collection-search.js).
 */
(() => {
  if (window.pmFilters) return;
  window.pmFilters = true;

  const DRAWER = 'PmFiltersDrawer';
  const LOCK = 'pm-filters-lock';
  const byId = (id) => document.getElementById(id);
  const trigger = () => document.querySelector('.pm-filters__trigger');
  let lastFocus = null;

  const focusables = (root) =>
    [...root.querySelectorAll('a[href], button, input, summary, [tabindex]:not([tabindex="-1"])')].filter(
      (el) => !el.disabled && el.offsetParent !== null
    );

  const open = () => {
    const drawer = byId(DRAWER);
    if (!drawer || !drawer.hidden) return;
    lastFocus = document.activeElement;
    drawer.hidden = false;
    document.body.classList.add(LOCK);
    const toolbar = drawer.closest('.pm-ctoolbar');
    if (toolbar) toolbar.classList.add('is-filters-open');
    const btn = trigger();
    if (btn) btn.setAttribute('aria-expanded', 'true');
    const close = drawer.querySelector('.pm-filters__x');
    if (close) close.focus({ preventScroll: true });
  };

  const close = (toGrid) => {
    const drawer = byId(DRAWER);
    if (!drawer || drawer.hidden) return;
    drawer.hidden = true;
    document.body.classList.remove(LOCK);
    const toolbar = drawer.closest('.pm-ctoolbar');
    if (toolbar) toolbar.classList.remove('is-filters-open');
    const btn = trigger();
    if (btn) btn.setAttribute('aria-expanded', 'false');
    if (toGrid && toolbar) {
      // Under the sticky header when it is showing.
      const header = document.querySelector('.section-header');
      const offset =
        header && !header.classList.contains('shopify-section-header-hidden')
          ? Math.max(0, header.getBoundingClientRect().bottom)
          : 0;
      const top = toolbar.getBoundingClientRect().top + window.scrollY - offset;
      if (top < window.scrollY) window.scrollTo({ top });
    }
    const back = btn || lastFocus;
    if (back && back.focus) back.focus({ preventScroll: true });
  };

  document.addEventListener('click', (event) => {
    if (event.target.closest('.pm-filters__trigger')) {
      open();
      return;
    }
    const closer = event.target.closest('#' + DRAWER + ' [data-pm-filters-close]');
    if (closer) close(closer.hasAttribute('data-pm-filters-apply'));
  });

  document.addEventListener('keydown', (event) => {
    const drawer = byId(DRAWER);
    if (!drawer || drawer.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close(false);
      return;
    }
    if (event.key !== 'Tab') return;
    const sheet = drawer.querySelector('.pm-filters__sheet');
    const items = sheet ? focusables(sheet) : [];
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    } else if (!sheet.contains(document.activeElement)) {
      event.preventDefault();
      first.focus();
    }
  });

  // A tick or a sort choice applies at once. The input event is stopped before facets.js's own
  // debounced listener on the form sees it; a short wait still folds a quick run of ticks into one
  // request, so an older response can never land after a newer one.
  let timer = null;
  document.addEventListener(
    'input',
    (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || (input.type !== 'checkbox' && input.type !== 'radio')) return;
      const wrap = input.closest('#' + DRAWER + ' facet-filters-form');
      if (!wrap || typeof wrap.onSubmitHandler !== 'function') return;
      event.stopPropagation();
      clearTimeout(timer);
      timer = setTimeout(() => wrap.onSubmitHandler(event), 150);
    },
    true
  );

  // After every facets.js render (filters, sort, Remove all, Back / Forward): copy the marked
  // elements from the fresh section. renderAdditionalElements runs once per render, after the
  // filters, with the parsed section.
  const patch = (Form) => {
    if (!Form || Form.pmFiltersPatched) return;
    const original = Form.renderAdditionalElements;
    Form.renderAdditionalElements = function (html) {
      if (html && html.querySelectorAll) {
        html.querySelectorAll('[data-pm-fsync][id]').forEach((fresh) => {
          const current = byId(fresh.id);
          if (current) current.innerHTML = fresh.innerHTML;
        });
      }
      return original.call(this, html);
    };
    Form.pmFiltersPatched = true;
  };
  if (window.customElements) {
    const Form = customElements.get('facet-filters-form');
    if (Form) patch(Form);
    else customElements.whenDefined('facet-filters-form').then(() => patch(customElements.get('facet-filters-form')));
  }

  // Theme editor: a section reload drops the drawer, not the scroll lock.
  document.addEventListener('shopify:section:unload', () => document.body.classList.remove(LOCK));
})();
