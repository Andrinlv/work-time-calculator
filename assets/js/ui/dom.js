/* ==========================================================================
   ZEITKONTO — DOM-Werkzeuge, Icons, Toasts, Modals, Konfetti
   ========================================================================== */
(function (root) {
  "use strict";
  var ZK = root.ZK = root.ZK || {};

  /* ------------------------------------------------------------------ */
  /* Grundlagen                                                          */
  /* ------------------------------------------------------------------ */

  function qs(sel, scope) { return (scope || document).querySelector(sel); }
  function qsa(sel, scope) { return Array.prototype.slice.call((scope || document).querySelectorAll(sel)); }

  /** HTML-Escaping für alles, was aus Nutzereingaben stammt. */
  function esc(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /** Element erzeugen: el("div.card", { id: "x" }, [kind1, "text"]) */
  function el(spec, attrs, children) {
    var parts = String(spec).split(/(?=[.#])/);
    var node = document.createElement(parts[0] || "div");
    parts.slice(1).forEach(function (p) {
      if (p[0] === ".") node.classList.add(p.slice(1));
      else if (p[0] === "#") node.id = p.slice(1);
    });
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === "html") node.innerHTML = v;
        else if (k === "text") node.textContent = v;
        else if (k === "class") node.className += (node.className ? " " : "") + v;
        else if (k === "style" && typeof v === "object") setStyles(node, v);
        else if (k.indexOf("on") === 0 && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === "dataset") Object.assign(node.dataset, v);
        else node.setAttribute(k, v === true ? "" : v);
      });
    }
    (children || []).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  /* Eigene CSS-Variablen („--c“, „--p“) lassen sich nicht als normale
     Eigenschaft zuweisen — Object.assign(style, …) verwirft sie still.
     Darum jede Angabe einzeln, Variablen über setProperty(). */
  function setStyles(node, styles) {
    Object.keys(styles).forEach(function (k) {
      var val = styles[k];
      if (val === null || val === undefined || val === false) return;
      if (k.slice(0, 2) === "--") node.style.setProperty(k, String(val));
      else node.style[k] = val;
    });
  }

  function on(node, type, handler, opts) {
    if (!node) return function () {};
    node.addEventListener(type, handler, opts);
    return function () { node.removeEventListener(type, handler, opts); };
  }

  /** Ereignisdelegation — überlebt komplette Neuaufbauten des Inhalts. */
  function delegate(rootNode, type, selector, handler) {
    return on(rootNode, type, function (e) {
      var target = e.target.closest ? e.target.closest(selector) : null;
      if (target && rootNode.contains(target)) handler(e, target);
    });
  }

  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); }

  function debounce(fn, wait) {
    var timer = null;
    return function () {
      var args = arguments, self = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(self, args); }, wait || 150);
    };
  }

  function throttle(fn, wait) {
    var last = 0, timer = null;
    return function () {
      var now = Date.now(), args = arguments, self = this;
      if (now - last >= wait) { last = now; fn.apply(self, args); }
      else if (!timer) {
        timer = setTimeout(function () { timer = null; last = Date.now(); fn.apply(self, args); }, wait - (now - last));
      }
    };
  }

  /* ------------------------------------------------------------------ */
  /* Icons — 24×24, Strichstärke 1.8, an das Logo angelehnt              */
  /* ------------------------------------------------------------------ */
  var ICONS = {
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 1.9"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    calendarDays: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4M7.5 14h.01M12 14h.01M16.5 14h.01M7.5 17.5h.01M12 17.5h.01"/>',
    week: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M7 14h10M7 17.5h6"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    report: '<path d="M6 3h8l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5M8.5 13h7M8.5 16.5h4.5"/>',
    trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M7 6H4.5a2.5 2.5 0 0 0 2.5 4M17 6h2.5a2.5 2.5 0 0 1-2.5 4M9.5 19h5M12 14v5"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-1-1.4 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.4-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 1 1.4 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.4 1z"/>',
    play: '<path d="M7 4.5l12 7.5-12 7.5z"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
    coffee: '<path d="M4 9h13v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V9z"/><path d="M17 10.5h1.5a2.5 2.5 0 0 1 0 5H17M7 3v2.5M11 3v2.5M15 3v2.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    left: '<path d="M15 5l-7 7 7 7"/>',
    right: '<path d="M9 5l7 7-7 7"/>',
    down: '<path d="M5 9l7 7 7-7"/>',
    up: '<path d="M19 15l-7-7-7 7"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/>',
    sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8"/>',
    moon: '<path d="M20 14.2A8.5 8.5 0 0 1 9.8 4 8.5 8.5 0 1 0 20 14.2z"/>',
    download: '<path d="M12 3v12M7.5 10.5L12 15l4.5-4.5M4 20h16"/>',
    upload: '<path d="M12 16V4M7.5 8.5L12 4l4.5 4.5M4 20h16"/>',
    printer: '<path d="M7 8V3h10v5"/><rect x="3" y="8" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    check: '<path d="M4.5 12.5l5 5L20 7"/>',
    alert: '<path d="M12 3.5L22 20H2L12 3.5z"/><path d="M12 9.5v4.5M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    home: '<path d="M4 10.5L12 4l8 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M9.5 21v-6h5v6"/>',
    briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 12.5h18"/>',
    pin: '<path d="M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>',
    plane: '<path d="M10.5 20l1.5-5.5L21 10l-.5-2-9.5 2.5L7 5.5 5 6l2.5 5.5L4 13l.5 2 4-1 1 6z"/>',
    zap: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    keyboard: '<rect x="2" y="6" width="20" height="12" rx="2.5"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-.6 4"/><path d="M20 5v6h-6"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    star: '<path d="M12 3.5l2.6 5.6 6 .8-4.4 4.2 1.1 6.1-5.3-2.9-5.3 2.9 1.1-6.1L3.4 9.9l6-.8z"/>',
    umbrella: '<path d="M12 3a9 9 0 0 1 9 9H3a9 9 0 0 1 9-9z"/><path d="M12 12v6.5a2.5 2.5 0 0 0 5 0"/>',
    shield: '<path d="M12 3l7.5 3v6c0 4.5-3.1 8.2-7.5 9.5C7.6 20.2 4.5 16.5 4.5 12V6z"/>',
    book: '<path d="M5 4h9a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M17 7h2v13h-2M8 8h6M8 12h6"/>',
    pulse: '<path d="M2 12h4l2.5-6 4 12 3-6h6.5"/>',
    swap: '<path d="M4 8h13l-3.5-3.5M20 16H7l3.5 3.5"/>',
    bell: '<path d="M18 15V10a6 6 0 0 0-12 0v5l-2 3h16z"/><path d="M10 21h4"/>',
    lock: '<rect x="4.5" y="10" width="15" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    flame: '<path d="M12 3s5 4.5 5 9a5 5 0 0 1-10 0c0-1.6.7-3 1.5-4 .2 1.3 1 2 2 2 0-3 1.5-5.5 1.5-7z"/>',
    grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
    filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
    save: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v6h7V3M8 21v-6h8v6"/>',
    external: '<path d="M14 4h6v6M20 4l-8.5 8.5"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'
  };

  function icon(name, cls) {
    var path = ICONS[name] || ICONS.info;
    return '<svg class="ic ' + (cls || "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + path + "</svg>";
  }

  /* ------------------------------------------------------------------ */
  /* Toasts                                                              */
  /* ------------------------------------------------------------------ */
  var toastHost = null;
  /* Mehr als drei Meldungen liest niemand — und auf dem Handy decken sie
     sonst die halbe Ansicht zu. Die neueste verdrängt die älteste. */
  var TOAST_MAX = 3;

  function ensureToastHost() {
    if (!toastHost) {
      toastHost = el("div.toasts", { role: "status", "aria-live": "polite" });
      document.body.appendChild(toastHost);
    }
    return toastHost;
  }

  /**
   * Meldungen dürfen weder die Tableiste noch die wichtigsten Knöpfe
   * verdecken. Unten fest klebende Leisten (Tableiste, alles mit
   * [data-toast-avoid]) schieben den Stapel nach oben. Liegt eine
   * Stempelleiste oder ein anderes [data-toast-avoid]-Element gerade dort,
   * wo der Stapel hinkäme, wandert er an den oberen Rand unter die
   * Kopfzeile. Lage und Höhe ändern sich mit Scrollen, Ausrichtung und
   * Dichte — deshalb wird bei jeder Meldung neu gemessen.
   */
  var PROTECTED = ".tabbar, .stamp-bar, [data-toast-avoid]";

  function placeToasts(host, incoming) {
    var vh = window.innerHeight;
    var limit = vh;
    var protect = qsa(PROTECTED).filter(function (n) {
      var cs = getComputedStyle(n);
      return cs.display !== "none" && cs.visibility !== "hidden" && n.getClientRects().length > 0;
    });
    protect.forEach(function (n) {
      var cs = getComputedStyle(n);
      if (cs.position !== "fixed" && cs.position !== "sticky") return;
      var r = n.getBoundingClientRect();
      if (!r.height || r.top >= vh || r.bottom < vh - 4) return;   // klebt nicht am unteren Rand
      limit = Math.min(limit, r.top);
    });
    var bottom = limit < vh ? vh - limit + 10 : 16;
    var zoneTop = vh - bottom - host.offsetHeight - (incoming || 72);
    var covers = protect.some(function (n) {
      var r = n.getBoundingClientRect();
      return r.height > 0 && r.top < vh - bottom && r.bottom > zoneTop && r.top < limit;
    });
    host.classList.toggle("top", covers);
    host.style.bottom = covers || limit >= vh ? "" : Math.round(bottom) + "px";
  }

  /**
   * toast("Titel", { sub, tone: "plus"|"minus"|"warn", icon, action:{label,onClick}, duration,
   *                  sticky: bleibt bis zum Wegklicken (mit X), onDismiss })
   */
  function toast(title, opts) {
    opts = opts || {};
    var host = ensureToastHost();

    /* Gleiche Meldung nicht doppelt stapeln, und höchstens TOAST_MAX zeigen.
       Stehende Warnungen (sticky) werden nie verdrängt — nur die übrigen. */
    var live = qsa(".toast:not(.out)", host);
    live.forEach(function (t) { if (t._title === title && t._dismiss) t._dismiss(true); });
    live = qsa(".toast:not(.out)", host);
    var movable = live.filter(function (t) { return !t._sticky; });
    while (live.length >= TOAST_MAX && movable.length) {
      var oldest = movable.shift();
      live.splice(live.indexOf(oldest), 1);
      if (oldest._dismiss) oldest._dismiss(true);
    }
    placeToasts(host);

    var node = el("div.toast" + (opts.tone ? "." + opts.tone : "") + (opts.sticky ? ".sticky" : ""), opts.sticky ? { role: "alert" } : null);
    node._title = title;
    node._sticky = !!opts.sticky;
    node.innerHTML =
      icon(opts.icon || (opts.tone === "minus" ? "alert" : opts.tone === "warn" ? "alert" : "check")) +
      '<div class="body"><b>' + esc(title) + "</b>" +
      (opts.sub ? "<span>" + esc(opts.sub) + "</span>" : "") + "</div>";

    if (opts.action) {
      var btn = el("button.act", { type: "button", text: opts.action.label });
      btn.addEventListener("click", function () {
        // Eine stehende Warnung bleibt, bis ihr Grund behoben ist
        try { opts.action.onClick(); } finally { if (!opts.sticky) dismiss(true); }
      });
      node.appendChild(btn);
    }
    if (opts.sticky) {
      var x = el("button.act.close", {
        type: "button", html: icon("x"),
        "aria-label": ZK.I18n ? ZK.I18n.t("common.close") : "×"
      });
      x.addEventListener("click", function () { dismiss(); });
      node.appendChild(x);
    }

    host.appendChild(node);
    var timer = opts.sticky ? null : setTimeout(dismiss, opts.duration || (opts.action ? 8000 : 3600));

    /* Verdrängte Meldungen verschwinden sofort; ihr Ausblenden würde die
       neue sonst noch einen Moment lang verschieben. */
    function dismiss(now) {
      clearTimeout(timer);
      if (!node.parentNode) return;
      if (opts.onDismiss) { try { opts.onDismiss(); } catch (e) { /* egal */ } }
      if (now === true) { node.parentNode.removeChild(node); return; }
      node.classList.add("out");
      setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 220);
    }
    node._dismiss = dismiss;
    node.addEventListener("click", function (e) { if (e.target === node && !opts.sticky) dismiss(); });
    return dismiss;
  }

  /* ------------------------------------------------------------------ */
  /* Modal                                                               */
  /* ------------------------------------------------------------------ */
  var openModals = [];
  var modalSeq = 0;
  var FOCUSABLE = 'button, [href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])';

  function usable(n) {
    return !!n && !n.disabled && n.offsetParent !== null && n.getAttribute("aria-hidden") !== "true";
  }

  /**
   * Wohin der Fokus beim Öffnen springt. Nie auf das Schliessen-X: das
   * erste Feld im Inhalt, sonst die Hauptaktion unten, sonst der Dialog
   * selbst. Auf Touch-Geräten kein Textfeld — sonst schiebt sich sofort
   * die Bildschirmtastatur über den Dialog.
   */
  function initialFocus(box, body, foot, wanted) {
    if (wanted) {
      var w = typeof wanted === "string" ? box.querySelector(wanted) : wanted;
      if (usable(w)) return w;
    }
    var coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    if (!coarse) {
      var field = qsa("input, select, textarea", body).filter(function (n) {
        return usable(n) && !n.readOnly && !/^(hidden|checkbox|radio|file|range|color)$/i.test(n.type || "");
      })[0];
      if (field) return field;
    }
    if (foot) {
      var primary = qs(".btn.primary", foot);
      if (usable(primary)) return primary;
    }
    var inBody = qsa(FOCUSABLE, body).filter(usable)[0];
    if (inBody && !(coarse && /^(INPUT|TEXTAREA|SELECT)$/.test(inBody.tagName))) return inBody;
    if (foot) {
      var btns = qsa("button", foot).filter(usable);
      if (btns.length) return btns[btns.length - 1];
    }
    return box;
  }

  /**
   * modal({ title, sub, body: Node|string, footer: [Node], size, onClose, closeOnScrim,
   *         focus: Selektor|Element — was beim Öffnen den Fokus bekommt })
   */
  function modal(opts) {
    opts = opts || {};
    var titleId = "zkModalTitle" + (++modalSeq);
    var scrim = el("div.modal-scrim", { role: "dialog", "aria-modal": "true", "aria-labelledby": titleId });
    var box = el("div.modal" + (opts.size === "wide" ? ".wide" : opts.size === "slim" ? ".slim" : ""), { tabindex: "-1" });

    var head = el("div.modal-head");
    head.innerHTML =
      '<div><h2 id="' + titleId + '">' + esc(opts.title || "") + "</h2>" +
      (opts.sub ? '<div class="sub">' + esc(opts.sub) + "</div>" : "") + "</div>";
    var closeBtn = el("button.btn.ghost.icon.sm.close", { type: "button", "aria-label": ZK.I18n ? ZK.I18n.t("common.close") : "×", html: icon("x") });
    closeBtn.addEventListener("click", function () { close(); });
    head.appendChild(closeBtn);

    var body = el("div.modal-body");
    if (typeof opts.body === "string") body.innerHTML = opts.body;
    else if (opts.body) body.appendChild(opts.body);

    box.appendChild(head);
    box.appendChild(body);

    var foot = null;
    if (opts.footer && opts.footer.length) {
      foot = el("div.modal-foot");
      opts.footer.forEach(function (f) { if (f) foot.appendChild(f); });
      box.appendChild(foot);
    }

    hideTip();
    scrim.appendChild(box);
    document.body.appendChild(scrim);
    document.body.style.overflow = "hidden";
    document.body.classList.add("has-modal");

    var previousFocus = document.activeElement;
    setTimeout(function () {
      if (!scrim.parentNode) return;
      var target = initialFocus(box, body, foot, opts.focus);
      // preventScroll: sonst springt auf dem Handy die Seite hinter dem Dialog
      try { target.focus({ preventScroll: true }); } catch (e) { target.focus(); }
    }, 40);

    function onKey(e) {
      // Nur der oberste Dialog reagiert — Escape schliesst nicht alle auf einmal
      if (openModals[openModals.length - 1] !== entry) return;
      if (e.key === "Escape") { e.stopPropagation(); close(); }
      if (e.key === "Tab") trapFocus(e, box);
    }
    document.addEventListener("keydown", onKey, true);

    if (opts.closeOnScrim !== false) {
      scrim.addEventListener("mousedown", function (e) { if (e.target === scrim) close(); });
    }

    var entry = { scrim: scrim, close: close };
    openModals.push(entry);

    function close(result) {
      document.removeEventListener("keydown", onKey, true);
      var i = openModals.indexOf(entry);
      if (i >= 0) openModals.splice(i, 1);
      if (!openModals.length) {
        document.body.style.overflow = "";
        document.body.classList.remove("has-modal");
      }
      if (scrim.parentNode) scrim.parentNode.removeChild(scrim);
      hideTip();
      if (previousFocus && previousFocus.focus && document.contains(previousFocus)) {
        try { previousFocus.focus({ preventScroll: true }); } catch (e) { previousFocus.focus(); }
      }
      if (opts.onClose) opts.onClose(result);
    }

    return { close: close, body: body, box: box, scrim: scrim };
  }

  function trapFocus(e, container) {
    var items = qsa(FOCUSABLE, container).filter(usable);
    if (!items.length) { e.preventDefault(); return; }
    var first = items[0], last = items[items.length - 1];
    var active = document.activeElement;
    if (!container.contains(active) || active === container) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
    }
    else if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
  }

  /** Bestätigungsdialog, gibt ein Promise<boolean> zurück. */
  function confirmDialog(opts) {
    return new Promise(function (resolve) {
      var decided = false;
      var cancel = el("button.btn", { type: "button", text: opts.cancelLabel || (ZK.I18n ? ZK.I18n.t("common.cancel") : "×") });
      var ok = el("button.btn" + (opts.danger ? ".minus" : ".primary"), { type: "button", text: opts.okLabel || "OK" });
      var m = modal({
        title: opts.title,
        sub: opts.sub,
        size: "slim",
        body: el("p", { text: opts.message || "", style: { fontSize: "14px", lineHeight: "1.6", color: "var(--ink-2)" } }),
        footer: [cancel, ok],
        // Bei Gefahr steht der Fokus auf der sicheren Wahl
        focus: opts.danger ? cancel : ok,
        onClose: function () { if (!decided) resolve(false); }
      });
      cancel.addEventListener("click", function () { decided = true; m.close(); resolve(false); });
      ok.addEventListener("click", function () { decided = true; m.close(); resolve(true); });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Tooltips — eine einzige Ebene für alle [data-tip]                   */
  /* ------------------------------------------------------------------ */
  /* Früher hing an jedem Element ein ::after. Das wurde in Containern mit
     overflow:hidden abgeschnitten, öffnete sich in der Kopfzeile über den
     Bildschirmrand hinaus und machte die Seite auf dem Handy breiter —
     auch unsichtbar. Jetzt gibt es genau ein fest positioniertes Element
     am Ende von <body>, das in den sichtbaren Bereich geklemmt wird.
     Maus: beim Überfahren. Tastatur: beim Fokus. Touch: Antippen von
     Elementen, die selbst nichts tun (Notizpunkt, Abzeichen …), oder
     langes Drücken. Scrollen, Escape oder Tippen daneben schliesst. */
  var tipNode = null, tipAnchor = null, tipTimer = null, tipWatch = null, tipHiddenAt = 0;
  var lastPointer = "mouse";
  var TIP_GAP = 8, TIP_EDGE = 8;
  var INTERACTIVE = 'button, a[href], input, select, textarea, label, summary, [role="button"], [role="link"], [contenteditable="true"]';

  function tipLayer() {
    if (!tipNode) {
      tipNode = el("div.tip-layer#zkTip", { role: "tooltip" });
      tipNode.appendChild(el("span.tip-text"));
      tipNode.appendChild(el("i.tip-arrow", { "aria-hidden": "true" }));
      document.body.appendChild(tipNode);
    }
    return tipNode;
  }

  /**
   * Lage des Tooltips zum Element `r` (getBoundingClientRect). Lieber
   * oben; reicht der Platz nicht (Kopfzeile), darunter. Immer mit Abstand
   * TIP_EDGE in den sichtbaren Bereich geklemmt, der Pfeil zeigt trotzdem
   * auf die Mitte des Elements.
   * → { left, top, below, arrow }  (Pixel, ganzzahlig)
   */
  function tipPlacement(r, w, h, vw, vh) {
    var below = r.top - TIP_GAP - h < TIP_EDGE;
    if (below && r.bottom + TIP_GAP + h > vh - TIP_EDGE && r.top > vh - r.bottom) below = false;
    var top = below ? r.bottom + TIP_GAP : r.top - TIP_GAP - h;
    top = Math.max(TIP_EDGE, Math.min(vh - TIP_EDGE - h, top));
    var cx = r.left + r.width / 2;
    var left = Math.max(TIP_EDGE, Math.min(vw - TIP_EDGE - w, cx - w / 2));
    return {
      left: Math.round(left),
      top: Math.round(top),
      below: below,
      arrow: Math.round(Math.max(10, Math.min(w - 10, cx - left)))
    };
  }

  function showTip(anchor) {
    clearTimeout(tipTimer);
    var text = anchor && anchor.getAttribute("data-tip");
    if (!text || !document.contains(anchor)) { hideTip(); return; }
    var node = tipLayer();
    if (tipAnchor && tipAnchor !== anchor) unlinkTip(tipAnchor);
    tipAnchor = anchor;
    node.firstChild.textContent = text;
    node.classList.remove("below");
    node.style.transform = "translate(0px, 0px)";

    var pos = tipPlacement(anchor.getBoundingClientRect(), node.offsetWidth, node.offsetHeight,
      document.documentElement.clientWidth || window.innerWidth, window.innerHeight);
    node.style.transform = "translate(" + pos.left + "px, " + pos.top + "px)";
    node.style.setProperty("--tip-ax", pos.arrow + "px");
    node.classList.toggle("below", pos.below);
    node.classList.add("on");

    var described = anchor.getAttribute("aria-describedby") || "";
    if (!/\bzkTip\b/.test(described)) anchor.setAttribute("aria-describedby", (described + " zkTip").trim());

    // Wird das Element neu gezeichnet, verschwindet der Tooltip mit ihm
    clearInterval(tipWatch);
    tipWatch = setInterval(function () { if (!tipAnchor || !document.contains(tipAnchor)) hideTip(); }, 400);
  }

  function unlinkTip(anchor) {
    var d = (anchor.getAttribute("aria-describedby") || "").replace(/\s*\bzkTip\b/, "").trim();
    if (d) anchor.setAttribute("aria-describedby", d);
    else anchor.removeAttribute("aria-describedby");
  }

  function hideTip() {
    clearTimeout(tipTimer);
    clearInterval(tipWatch);
    if (tipAnchor) { unlinkTip(tipAnchor); tipHiddenAt = Date.now(); }
    tipAnchor = null;
    if (tipNode) tipNode.classList.remove("on");
  }

  function scheduleTip(anchor, delay) {
    clearTimeout(tipTimer);
    // Wer von einem Tooltip zum nächsten fährt, wartet nicht erneut
    if (Date.now() - tipHiddenAt < 400 || tipAnchor) delay = 0;
    tipTimer = setTimeout(function () { showTip(anchor); }, delay);
  }

  function tipTarget(node) {
    return node && node.nodeType === 1 && node.closest ? node.closest("[data-tip]") : null;
  }

  function setupTips() {
    if (typeof document === "undefined" || !document.addEventListener) return;
    document.addEventListener("pointerdown", function (e) {
      lastPointer = e.pointerType || "mouse";
      if (tipAnchor && !tipAnchor.contains(e.target)) hideTip();
    }, true);
    document.addEventListener("pointerover", function (e) {
      if (e.pointerType === "touch" || e.pointerType === "pen") return;
      var a = tipTarget(e.target);
      if (!a || a === tipAnchor) return;
      scheduleTip(a, 300);
    });
    document.addEventListener("pointerout", function (e) {
      if (e.pointerType === "touch" || e.pointerType === "pen") return;
      var a = tipTarget(e.target);
      if (!a) return;
      if (e.relatedTarget && a.contains(e.relatedTarget)) return;
      clearTimeout(tipTimer);
      if (a === tipAnchor) hideTip();
    });
    document.addEventListener("focusin", function (e) {
      var t = e.target;
      if (!t || !t.hasAttribute || !t.hasAttribute("data-tip")) return;
      var keyboard = true;
      try { keyboard = t.matches(":focus-visible"); } catch (x) { keyboard = lastPointer !== "touch"; }
      if (keyboard) scheduleTip(t, 0);
    });
    document.addEventListener("focusout", function (e) {
      if (e.target === tipAnchor) hideTip();
    });
    document.addEventListener("click", function (e) {
      if (lastPointer !== "touch") return;
      var a = tipTarget(e.target);
      if (!a) return;
      if (a.closest(INTERACTIVE)) return;            // Knöpfe tun, was sie tun
      if (a === tipAnchor) hideTip(); else showTip(a);
    });
    document.addEventListener("contextmenu", function (e) {
      if (lastPointer !== "touch") return;
      var a = tipTarget(e.target);
      if (!a) return;
      e.preventDefault();                             // langes Drücken zeigt den Text
      showTip(a);
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && tipAnchor) hideTip(); }, true);
    window.addEventListener("scroll", function () { if (tipAnchor) hideTip(); }, { capture: true, passive: true });
    window.addEventListener("resize", function () { if (tipAnchor) hideTip(); });
  }
  setupTips();

  /* ------------------------------------------------------------------ */
  /* Konfetti — die zwei Ringe des Logos, in Einzelteile zerlegt         */
  /* ------------------------------------------------------------------ */
  function confetti(opts) {
    opts = opts || {};
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    var layer = el("div.confetti-layer");
    document.body.appendChild(layer);
    var colors = opts.colors || ["#857C74", "#C4BBB2", "#3F8F5B", "#B8842A", "#DCD6D0", "#6D655E"];
    var count = opts.count || 90;
    var originX = opts.x !== undefined ? opts.x : window.innerWidth / 2;
    var originY = opts.y !== undefined ? opts.y : window.innerHeight * 0.36;
    var bits = [];

    for (var i = 0; i < count; i++) {
      var bit = el("div.confetti-bit");
      var round = Math.random() < 0.35;
      bit.style.background = colors[i % colors.length];
      if (round) {
        bit.style.borderRadius = "50%";
        bit.style.background = "transparent";
        bit.style.border = "3px solid " + colors[i % colors.length];
        bit.style.width = bit.style.height = (7 + Math.random() * 7).toFixed(0) + "px";
      }
      bit.style.left = originX + "px";
      bit.style.top = originY + "px";
      layer.appendChild(bit);
      var angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      var speed = 5 + Math.random() * 9;
      bits.push({
        node: bit,
        x: 0, y: 0,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 6,
        rot: Math.random() * 360,
        vr: (Math.random() - 0.5) * 22,
        life: 1
      });
    }

    var start = performance.now();
    function frame(now) {
      var dt = Math.min(32, now - start) / 16;
      start = now;
      var alive = 0;
      bits.forEach(function (b) {
        if (b.life <= 0) return;
        alive++;
        b.vy += 0.42 * dt;
        b.vx *= 0.992;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.rot += b.vr * dt;
        b.life -= 0.011 * dt;
        b.node.style.transform = "translate(" + b.x.toFixed(1) + "px," + b.y.toFixed(1) + "px) rotate(" + b.rot.toFixed(0) + "deg)";
        b.node.style.opacity = Math.max(0, b.life).toFixed(2);
      });
      if (alive > 0) requestAnimationFrame(frame);
      else if (layer.parentNode) layer.parentNode.removeChild(layer);
    }
    requestAnimationFrame(frame);
    setTimeout(function () { if (layer.parentNode) layer.parentNode.removeChild(layer); }, 4200);
  }

  /* ------------------------------------------------------------------ */
  /* Dateien                                                             */
  /* ------------------------------------------------------------------ */
  function download(filename, content, mime) {
    var blob = content instanceof Blob ? content : new Blob([content], { type: (mime || "text/plain") + ";charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = el("a", { href: url, download: filename, style: { display: "none" } });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(url);
      if (a.parentNode) a.parentNode.removeChild(a);
    }, 400);
  }

  function readFile(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || "")); };
      reader.onerror = function () { reject(reader.error || new Error(ZK.I18n ? ZK.I18n.t("common.fileUnreadable") : "File unreadable")); };
      reader.readAsText(file);
    });
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = el("textarea", { style: { position: "fixed", opacity: "0", top: "0" } });
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); resolve(); }
      catch (e) { reject(e); }
      finally { document.body.removeChild(ta); }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Zeitfeld-Verhalten: "0750" wird beim Tippen zu "07:50"              */
  /* ------------------------------------------------------------------ */
  function attachTimeInput(input, onChange) {
    if (!input || input.dataset.timeBound) return;
    input.dataset.timeBound = "1";
    input.setAttribute("inputmode", "numeric");
    input.setAttribute("autocomplete", "off");
    input.setAttribute("spellcheck", "false");
    input.setAttribute("maxlength", "5");

    function liveFormat() {
      var caretAtEnd = input.selectionStart === input.value.length;
      var digits = input.value.replace(/\D/g, "").slice(0, 4);
      var next = digits.length <= 2 ? digits : digits.slice(0, 2) + ":" + digits.slice(2);
      if (next !== input.value) {
        input.value = next;
        if (caretAtEnd) input.setSelectionRange(next.length, next.length);
      }
    }

    on(input, "input", function () {
      liveFormat();
      if (onChange) onChange(input.value, false);
    });

    on(input, "blur", function () {
      var d = input.value.replace(/\D/g, "");
      if (!d) { input.value = ""; }
      else {
        if (d.length === 1) d = "0" + d + "00";
        else if (d.length === 2) d = d + "00";
        else if (d.length === 3) d = "0" + d;
        var mins = ZK.Time.parseHHMM(d.slice(0, 2) + ":" + d.slice(2, 4));
        input.value = mins === null ? "" : ZK.Time.formatHHMM(mins);
      }
      input.classList.toggle("invalid", !!input.value && ZK.Time.parseHHMM(input.value) === null);
      if (onChange) onChange(input.value, true);
    });

    on(input, "keydown", function (e) {
      if (e.key === "Backspace") {
        var pos = input.selectionStart;
        if (pos === input.selectionEnd && pos > 0 && input.value[pos - 1] === ":") {
          e.preventDefault();
          input.value = input.value.slice(0, pos - 1) + input.value.slice(pos);
          liveFormat();
          if (onChange) onChange(input.value, false);
        }
        return;
      }
      // Pfeiltasten verändern die Zeit minutenweise (Shift = 15 Minuten)
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        var cur = ZK.Time.parseHHMM(input.value);
        if (cur === null) return;
        e.preventDefault();
        var step = e.shiftKey ? 15 : 1;
        var next = cur + (e.key === "ArrowUp" ? step : -step);
        next = ((next % 1440) + 1440) % 1440;
        input.value = ZK.Time.formatHHMM(next);
        if (onChange) onChange(input.value, true);
      }
    });

    /* Beim Betreten alles markieren — verzögert, sonst hebt der Mausklick die
       Markierung wieder auf. Aber nur, solange noch nichts getippt wurde:
       sonst markiert select() die erste Ziffer und die zweite überschreibt
       sie („1630“ würde zu „06:30“). */
    on(input, "focus", function () {
      var typed = false;
      function mark() { typed = true; }
      input.addEventListener("keydown", mark);
      setTimeout(function () {
        input.removeEventListener("keydown", mark);
        if (!typed && document.activeElement === input) input.select();
      }, 10);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Zahlen animieren                                                    */
  /* ------------------------------------------------------------------ */
  function animateValue(node, from, to, format, duration) {
    if (!node) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      node.textContent = format(to);
      return;
    }
    var startAt = performance.now();
    var span = duration || 420;
    function step(now) {
      var p = Math.min(1, (now - startAt) / span);
      var eased = 1 - Math.pow(1 - p, 3);
      node.textContent = format(from + (to - from) * eased);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  ZK.Dom = {
    qs: qs, qsa: qsa, el: el, esc: esc, on: on, delegate: delegate, clear: clear,
    debounce: debounce, throttle: throttle,
    icon: icon, ICONS: ICONS,
    toast: toast, modal: modal, confirmDialog: confirmDialog, confetti: confetti,
    showTip: showTip, hideTip: hideTip, tipPlacement: tipPlacement,
    download: download, readFile: readFile, copyText: copyText,
    attachTimeInput: attachTimeInput, animateValue: animateValue
  };
})(typeof self !== "undefined" ? self : this);
