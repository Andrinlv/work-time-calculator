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
        else if (k === "style" && typeof v === "object") Object.assign(node.style, v);
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

  function ensureToastHost() {
    if (!toastHost) {
      toastHost = el("div.toasts", { role: "status", "aria-live": "polite" });
      document.body.appendChild(toastHost);
    }
    return toastHost;
  }

  /**
   * toast("Titel", { sub, tone: "plus"|"minus"|"warn", icon, action:{label,onClick}, duration })
   */
  function toast(title, opts) {
    opts = opts || {};
    var host = ensureToastHost();
    var node = el("div.toast" + (opts.tone ? "." + opts.tone : ""));
    node.innerHTML =
      icon(opts.icon || (opts.tone === "minus" ? "alert" : opts.tone === "warn" ? "alert" : "check")) +
      '<div class="body"><b>' + esc(title) + "</b>" +
      (opts.sub ? "<span>" + esc(opts.sub) + "</span>" : "") + "</div>";

    if (opts.action) {
      var btn = el("button.act", { type: "button", text: opts.action.label });
      btn.addEventListener("click", function () {
        try { opts.action.onClick(); } finally { dismiss(); }
      });
      node.appendChild(btn);
    }

    host.appendChild(node);
    var timer = setTimeout(dismiss, opts.duration || (opts.action ? 8000 : 3600));

    function dismiss() {
      clearTimeout(timer);
      if (!node.parentNode) return;
      node.classList.add("out");
      setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 220);
    }
    node.addEventListener("click", function (e) { if (e.target === node) dismiss(); });
    return dismiss;
  }

  /* ------------------------------------------------------------------ */
  /* Modal                                                               */
  /* ------------------------------------------------------------------ */
  var openModals = [];

  /**
   * modal({ title, sub, body: Node|string, footer: [Node], size, onClose, closeOnScrim })
   */
  function modal(opts) {
    opts = opts || {};
    var scrim = el("div.modal-scrim", { role: "dialog", "aria-modal": "true" });
    var box = el("div.modal" + (opts.size === "wide" ? ".wide" : opts.size === "slim" ? ".slim" : ""));

    var head = el("div.modal-head");
    head.innerHTML =
      '<div><h2>' + esc(opts.title || "") + "</h2>" +
      (opts.sub ? '<div class="sub">' + esc(opts.sub) + "</div>" : "") + "</div>";
    var closeBtn = el("button.btn.ghost.icon.sm.close", { type: "button", "aria-label": "Schliessen", html: icon("x") });
    closeBtn.addEventListener("click", function () { close(); });
    head.appendChild(closeBtn);

    var body = el("div.modal-body");
    if (typeof opts.body === "string") body.innerHTML = opts.body;
    else if (opts.body) body.appendChild(opts.body);

    box.appendChild(head);
    box.appendChild(body);

    if (opts.footer && opts.footer.length) {
      var foot = el("div.modal-foot");
      opts.footer.forEach(function (f) { if (f) foot.appendChild(f); });
      box.appendChild(foot);
    }

    scrim.appendChild(box);
    document.body.appendChild(scrim);
    document.body.style.overflow = "hidden";

    var previousFocus = document.activeElement;
    var focusables = box.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (focusables.length) setTimeout(function () { (opts.focus ? box.querySelector(opts.focus) : focusables[0]).focus(); }, 40);

    function onKey(e) {
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
      if (!openModals.length) document.body.style.overflow = "";
      if (scrim.parentNode) scrim.parentNode.removeChild(scrim);
      if (previousFocus && previousFocus.focus) previousFocus.focus();
      if (opts.onClose) opts.onClose(result);
    }

    return { close: close, body: body, box: box, scrim: scrim };
  }

  function trapFocus(e, container) {
    var items = Array.prototype.filter.call(
      container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
      function (n) { return n.offsetParent !== null && !n.disabled; }
    );
    if (!items.length) return;
    var first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  /** Bestätigungsdialog, gibt ein Promise<boolean> zurück. */
  function confirmDialog(opts) {
    return new Promise(function (resolve) {
      var decided = false;
      var cancel = el("button.btn", { type: "button", text: opts.cancelLabel || "Abbrechen" });
      var ok = el("button.btn" + (opts.danger ? ".minus" : ".primary"), { type: "button", text: opts.okLabel || "OK" });
      var m = modal({
        title: opts.title,
        sub: opts.sub,
        size: "slim",
        body: el("p", { text: opts.message || "", style: { fontSize: "14px", lineHeight: "1.6", color: "var(--ink-2)" } }),
        footer: [cancel, ok],
        onClose: function () { if (!decided) resolve(false); }
      });
      cancel.addEventListener("click", function () { decided = true; m.close(); resolve(false); });
      ok.addEventListener("click", function () { decided = true; m.close(); resolve(true); });
    });
  }

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
      reader.onerror = function () { reject(reader.error || new Error("Datei konnte nicht gelesen werden")); };
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

    on(input, "focus", function () { setTimeout(function () { input.select(); }, 10); });
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
    download: download, readFile: readFile, copyText: copyText,
    attachTimeInput: attachTimeInput, animateValue: animateValue
  };
})(typeof self !== "undefined" ? self : this);
