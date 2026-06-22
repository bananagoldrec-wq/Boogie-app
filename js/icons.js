/**
 * icons.js — ícones 2D próprios (SVG monoline), substituindo emojis.
 * Uso: window.Icon.radio, window.Icon.heart(), etc. (strings de SVG)
 */
(function () {
  "use strict";
  const S = (inner, extra = "") =>
    `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
    `stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" ${extra}>${inner}</svg>`;

  window.Icon = {
    radio: S('<rect x="2.5" y="8" width="19" height="12" rx="1.6"/><path d="M16.6 3.2 8 8"/><circle cx="8.3" cy="14" r="3"/><path d="M14.6 12h4.3M14.6 15.2h4.3"/>'),
    headphones: S('<path d="M4 14v-2.2a8 8 0 0 1 16 0V14"/><rect x="2.3" y="13.4" width="4" height="6.6" rx="1.3"/><rect x="17.7" y="13.4" width="4" height="6.6" rx="1.3"/>'),
    heart: S('<path d="M12 20s-7-4.6-7-9.4A3.6 3.6 0 0 1 12 8a3.6 3.6 0 0 1 7 2.6C19 15.4 12 20 12 20Z"/>'),
    heartFilled: S('<path d="M12 20s-7-4.6-7-9.4A3.6 3.6 0 0 1 12 8a3.6 3.6 0 0 1 7 2.6C19 15.4 12 20 12 20Z" fill="currentColor" stroke="none"/>'),
    x: S('<path d="M6 6l12 12M18 6 6 18"/>'),
    play: S('<path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none"/>'),
    plus: S('<path d="M12 5v14M5 12h14"/>'),
    note: S('<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.4"/><circle cx="16.5" cy="16" r="2.4"/>'),
    disc: S('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.4"/><circle cx="12" cy="12" r="0.5" fill="currentColor" stroke="none"/>'),
    trash: S('<path d="M4 7h16M9 7V5h6v2M6.5 7l1 13h9l1-13"/>'),
    ban: S('<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6 18.4 18.4"/>'),
    restore: S('<path d="M4 12a8 8 0 1 0 2.3-5.6M4 4.5V8h3.5"/>'),
  };
})();
