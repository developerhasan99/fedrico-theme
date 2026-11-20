/*
  Designer prices (custom.designer_price_usd). Amounts live in USD cents everywhere;
  only the display converts to the cart currency.

  window.pmDesignerCents(usdCents)        -> cart-currency cents, whole units (rounded up outside USD,
                                             same rule as pm-cart-goals.js)
  window.pmDesignerFormat(usdCents, minusCents)
                                          -> formatted text, e.g. "$235" / "£134";
                                             with minusCents (cart-currency cents) returns the saving,
                                             floored to whole units; '' when nothing to show
  <pm-designer-price data-usd data-minus data-strike>
                                          -> fills its own text on connect and whenever data-usd /
                                             data-minus change (Alpine :data-usd bindings work)
*/
(function () {
  function rate() {
    var r = Number(window.Shopify && Shopify.currency && Shopify.currency.rate);
    return r > 0 ? r : 1;
  }

  function isBase() {
    var active = window.Shopify && Shopify.currency && Shopify.currency.active;
    return !active || active === 'USD';
  }

  function designerCents(usdCents) {
    var usd = Number(usdCents) || 0;
    if (usd <= 0) return 0;
    if (isBase()) return Math.round(usd);
    return Math.ceil((usd / 100) * rate()) * 100;
  }

  function money(cents) {
    var text = window.pmMoney ? window.pmMoney(cents) : '$' + (cents / 100).toFixed(2);
    return text.replace(/[.,]00(?=\D*$)/, '');
  }

  function designerFormat(usdCents, minusCents) {
    var cents = designerCents(usdCents);
    var sub = Number(minusCents) || 0;
    if (sub > 0) cents = Math.floor((cents - sub) / 100) * 100;
    return cents > 0 ? money(cents) : '';
  }

  window.pmDesignerCents = designerCents;
  window.pmDesignerFormat = designerFormat;

  if (customElements.get('pm-designer-price')) return;

  class PmDesignerPrice extends HTMLElement {
    static get observedAttributes() {
      return ['data-usd', 'data-minus'];
    }

    connectedCallback() {
      this.render();
    }

    attributeChangedCallback() {
      if (this.isConnected) this.render();
    }

    render() {
      var text = designerFormat(this.dataset.usd, this.dataset.minus);
      var target = this.hasAttribute('data-strike') ? this.querySelector('s') || this : this;
      if (target.textContent !== text) target.textContent = text;
      this.hidden = text === '';
    }
  }

  customElements.define('pm-designer-price', PmDesignerPrice);
})();
