/* Cart goals bar (snippets/pm-cart-goals.liquid). Draws the progress bar from the JSON config and keeps the gift lines in step:
   a reached gift goal gets exactly one line of its gift product, an unreached or removed goal gets none.
   After a gift change the cart drawer (and the icon bubble) is re-rendered; on the cart page the page reloads.
   The drawer and the cart page both carry a bar; a shared lock lets only one of them change the cart.
   A [data-preview] bar (bundle builder) never touches the cart: it shows the cart total plus an extra amount set by
   the page (setExtra(cents) or data-extra) and re-reads the cart total from /cart.js after every cart update. */
(() => {
  if (customElements.get('pm-cart-goals')) return;

  const ICONS = {
    gift: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11h16v9H4zM3 7h18v4H3zM12 7v13M12 7c-1.5-3-5-3.5-5-1.5S9.5 7 12 7zm0 0c1.5-3 5-3.5 5-1.5S14.5 7 12 7z"/></svg>',
    shipping: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 6h12v10H2zM14 10h4l3 3v3h-7zM6.5 18.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm11 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"/></svg>',
    done: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  };
  const sync = { busy: false, tries: {} };
  const root = () => (window.Shopify && Shopify.routes && Shopify.routes.root) || '/';
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  class PmCartGoals extends HTMLElement {
    connectedCallback() {
      const json = this.querySelector('script[type="application/json"]');
      if (!json) return;
      try {
        this.cfg = JSON.parse(json.textContent);
      } catch (e) {
        return;
      }
      this.goals = this.cfg.goals
        .map((g) => ({ ...g, cents: this.cents(g) }))
        .filter((g) => g.cents > 0)
        .sort((a, b) => a.cents - b.cents);
      if (!this.goals.length) return;
      this.preview = this.hasAttribute('data-preview');
      this.extra = Number(this.dataset.extra) || 0;
      this.render();
      if (!this.preview) {
        this.syncGifts();
        return;
      }
      if (!this.unsubscribe && typeof subscribe === 'function' && typeof PUB_SUB_EVENTS !== 'undefined') {
        this.unsubscribe = subscribe(PUB_SUB_EVENTS.cartUpdate, () => this.reloadTotal());
      }
    }

    disconnectedCallback() {
      if (this.unsubscribe) this.unsubscribe();
      this.unsubscribe = null;
    }

    setExtra(cents) {
      this.extra = Math.max(0, Number(cents) || 0);
      if (this.goals && this.goals.length) this.render();
    }

    // Preview bar: cart total without the gift lines, re-read after a cart change.
    async reloadTotal() {
      try {
        const cart = await (await fetch(`${root()}cart.js`)).json();
        const gifts = new Set(this.goals.map((g) => String(g.variant)));
        this.cfg.total = cart.items.filter((i) => !gifts.has(String(i.variant_id))).reduce((sum, i) => sum + i.final_line_price, 0);
        this.render();
      } catch (e) {
        console.error('[pm-cart-goals]', e);
      }
    }

    // Goal amount in cart currency cents: the currency's own amount, else USD converted and rounded up to a whole unit.
    cents(g) {
      const cur = this.cfg.currency;
      const own = Number(g.amounts[cur]);
      if (own > 0) return Math.round(own * 100);
      const base = Number(g.amounts[this.cfg.shop_currency] || g.amounts.USD);
      if (cur === this.cfg.shop_currency) return Math.round(base * 100);
      const rate = Number(window.Shopify && Shopify.currency && Shopify.currency.rate) || 1;
      return Math.ceil(base * rate) * 100;
    }

    money(cents) {
      const whole = cents % 100 === 0;
      try {
        return new Intl.NumberFormat(this.cfg.locale || 'en', {
          style: 'currency',
          currency: this.cfg.currency,
          minimumFractionDigits: whole ? 0 : 2,
          maximumFractionDigits: 2,
        }).format(cents / 100);
      } catch (e) {
        return (cents / 100).toFixed(whole ? 0 : 2) + ' ' + this.cfg.currency;
      }
    }

    // Bar fill: steps sit at the centre of equal columns; between two steps the fill moves linearly with the spend.
    fill(total) {
      const n = this.goals.length;
      const at = (i) => ((i + 0.5) / n) * 100;
      if (total >= this.goals[n - 1].cents) return 100;
      let prevCents = 0;
      let prevPos = 0;
      for (let i = 0; i < n; i++) {
        const g = this.goals[i];
        if (total < g.cents) return prevPos + ((total - prevCents) / (g.cents - prevCents)) * (at(i) - prevPos);
        prevCents = g.cents;
        prevPos = at(i);
      }
      return 100;
    }

    render() {
      const total = this.cfg.total + (this.extra || 0);
      const next = this.goals.find((g) => total < g.cents);
      const msg = next
        ? esc(this.cfg.msg_next)
            .replace('[amount]', `<strong>${esc(this.money(next.cents - total))}</strong>`)
            .replace('[goal]', `<strong>${esc(next.title.toLowerCase())}</strong>`)
        : esc(this.cfg.msg_done);
      const steps = this.goals
        .map((g) => {
          const reached = total >= g.cents;
          return `<li class="pm-goals__step${reached ? ' is-reached' : ''}">
            <span class="pm-goals__dot">${reached ? ICONS.done : ICONS[g.type] || ICONS.gift}</span>
            <span class="pm-goals__label"><strong>${esc(this.money(g.cents))}</strong> ${esc(g.title)}</span>
          </li>`;
        })
        .join('');
      this.innerHTML = `<p class="pm-goals__msg" role="status">${msg}</p>
        <div class="pm-goals__bar" style="--pm-goals-n: ${this.goals.length}; --pm-goals-fill: ${this.fill(total).toFixed(2)}%">
          <span class="pm-goals__track" aria-hidden="true"><span class="pm-goals__fill"></span></span>
          <ol class="pm-goals__steps">${steps}</ol>
        </div>`;
    }

    async syncGifts() {
      const total = this.cfg.total;
      const want = new Set(this.goals.filter((g) => g.type === 'gift' && g.variant && total >= g.cents).map((g) => String(g.variant)));
      const kept = new Set();
      const updates = {};
      (this.cfg.gift_lines || []).forEach((line) => {
        const v = String(line.variant);
        const keep = want.has(v) && !kept.has(v) ? 1 : 0;
        if (keep) kept.add(v);
        if (line.qty !== keep) updates[line.key] = keep;
      });
      const adds = [...want].filter((v) => !kept.has(v)).map((v) => ({ id: Number(v), quantity: 1 }));
      if (!adds.length && !Object.keys(updates).length) return;

      // One try per distinct change (plus one retry): a gift that cannot be added (sold out, not in this market) never loops.
      const sig = JSON.stringify([updates, adds]);
      sync.tries[sig] = (sync.tries[sig] || 0) + 1;
      if (sync.busy || sync.tries[sig] > 2) return;
      sync.busy = true;
      const post = (path, body) =>
        fetch(root() + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) });
      try {
        if (Object.keys(updates).length) await post('cart/update.js', { updates });
        if (adds.length) await post('cart/add.js', { items: adds });
        await this.refresh();
      } catch (e) {
        console.error('[pm-cart-goals]', e);
      } finally {
        sync.busy = false;
      }
    }

    async refresh() {
      // The cart page shows the lines outside the drawer: reload it so its table matches the cart.
      if (document.getElementById('main-cart-items') || !this.closest('cart-drawer')) {
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
  }

  customElements.define('pm-cart-goals', PmCartGoals);
})();
