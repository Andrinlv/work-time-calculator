/* ==========================================================================
   ZEITKONTO — Diagramme
   --------------------------------------------------------------------------
   Handgezeichnetes SVG, keine Fremdbibliothek. Regeln, die überall gelten:

   · Eine Achse. Nie zwei Skalen in einem Bild.
   · Einzelne Serien bekommen keine Legende — der Titel benennt sie.
   · Plus/Minus wird dreifach codiert: Farbe, Lage zur Nulllinie und
     Schraffur auf negativen Flächen. Farbe steht nie allein.
   · Marken sind dünn, Gitter ist zurückhaltend, beschriftet wird sparsam.
   · Jede Marke hat einen Tooltip; Zahlen tragen Textfarbe, nie Serienfarbe.
   · Ein Diagramm ist EIN Tabulator-Stopp. Pfeiltasten wandern durch die
     Marken, ein Bildschirmleser hört den Wert über eine Live-Region.
   · Touch: Antippen zeigt den Tooltip, Scrollen oder Tippen daneben
     blendet ihn aus.
   ========================================================================== */
(function (root) {
  "use strict";
  var ZK = root.ZK = root.ZK || {};
  var D = ZK.Dom;

  var NS = "http://www.w3.org/2000/svg";
  var idSeq = 0;

  function svgEl(name, attrs) {
    var node = document.createElementNS(NS, name);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (attrs[k] === null || attrs[k] === undefined) return;
      node.setAttribute(k, attrs[k]);
    });
    return node;
  }

  function text(x, y, value, cls, extra) {
    var node = svgEl("text", Object.assign({ x: x, y: y, class: cls || "axis-txt" }, extra || {}));
    node.textContent = value;
    return node;
  }

  /* ------------------------------------------------------------------ */
  /* Tooltip                                                             */
  /* ------------------------------------------------------------------ */
  var tipNode = null;
  var tipOwner = null;     // Diagramm, dem der sichtbare Tooltip gehört
  var tipCleanup = null;   // nimmt dessen Hervorhebung zurück
  var tipTimer = null;
  var tipAnchor = null;    // Tastatur: Position an der Marke statt am Zeiger
  var liveNode = null;
  var globalBound = false;

  function tip() {
    if (!tipNode) {
      tipNode = D.el("div.chart-tip", { role: "tooltip", "aria-hidden": "true" });
      Object.assign(tipNode.style, {
        position: "fixed", zIndex: "170", pointerEvents: "none", opacity: "0",
        background: "var(--surface-invert)", color: "var(--ink-invert)",
        padding: "7px 10px", borderRadius: "8px", fontSize: "12px",
        fontWeight: "650", lineHeight: "1.45", boxShadow: "var(--shadow-md)",
        transition: "opacity .12s ease", maxWidth: "260px", whiteSpace: "nowrap",
        left: "0", top: "0"
      });
      document.body.appendChild(tipNode);
    }
    return tipNode;
  }

  /** Eine gemeinsame, unsichtbare Live-Region für die Tastaturnavigation. */
  function announce(message) {
    if (!liveNode) {
      liveNode = D.el("div.sr-only", { "aria-live": "polite", "aria-atomic": "true" });
      document.body.appendChild(liveNode);
    }
    liveNode.textContent = message || "";
  }

  function bindGlobal() {
    if (globalBound) return;
    globalBound = true;
    // Ein Tooltip mit position:fixed wandert sonst beim Scrollen über
    // fremde Karten — auf dem Handy der häufigste Fall.
    // Bei Tastaturbedienung bleibt er an seiner Marke (Fokus scrollt mit).
    window.addEventListener("scroll", function () {
      if (!tipOwner) return;
      if (tipAnchor && document.activeElement === tipOwner) {
        var p = tipAnchor();
        placeTip(p.clientX, p.clientY);
        return;
      }
      hideTip();
    }, { capture: true, passive: true });
    document.addEventListener("pointerdown", function (e) {
      if (tipOwner && !tipOwner.contains(e.target)) hideTip();
    }, true);
    window.addEventListener("blur", function () { if (tipOwner) hideTip(); });
  }

  function placeTip(clientX, clientY) {
    var node = tip();
    var pad = 14;
    var w = node.offsetWidth, h = node.offsetHeight;
    var x = clientX + pad;
    var y = clientY - h - pad;
    if (x + w > window.innerWidth - 8) x = clientX - w - pad;
    if (x < 8) x = 8;
    if (y < 8) y = clientY + pad;
    node.style.left = Math.round(x) + "px";
    node.style.top = Math.round(y) + "px";
  }

  function showTip(owner, pos, html, opts) {
    bindGlobal();
    opts = opts || {};
    var node = tip();
    if (tipOwner && tipOwner !== owner && tipCleanup) {
      var prev = tipCleanup;
      tipCleanup = null;
      prev();
    }
    tipOwner = owner;
    tipCleanup = opts.cleanup || null;
    tipAnchor = opts.anchor || null;
    node.innerHTML = html;
    node.style.opacity = "1";
    placeTip(pos.clientX, pos.clientY);
    clearTimeout(tipTimer);
    // Auf Touch gibt es kein „Maus verlässt“ — der Tooltip geht von selbst.
    if (opts.touch) tipTimer = setTimeout(hideTip, 3200);
  }

  function hideTip() {
    clearTimeout(tipTimer);
    if (tipNode) tipNode.style.opacity = "0";
    var c = tipCleanup;
    tipCleanup = null;
    tipOwner = null;
    tipAnchor = null;
    if (c) c();
  }

  /**
   * Gemeinsames Interaktionsmodell für alle Diagramme.
   * m: { count, hit(evt) → index|-1, anchor(i) → {clientX, clientY},
   *      html(i), speak(i), highlight(i | -1), valid(i)?, initial()?,
   *      move(i, key) → index|null ?, onSelect(i)?, label }
   */
  function interact(host, m) {
    var active = -1;
    var lastPointer = "mouse";
    var wasActive = false;
    host.setAttribute("tabindex", "0");
    if (m.label) host.setAttribute("aria-label", m.label);
    // Waagrechtes Wischen bedient das Diagramm, senkrechtes scrollt die Seite.
    // (Nicht bei der Heatmap: dort scrollt waagrechtes Wischen das Jahr.)
    if (m.touchAction !== false) host.style.touchAction = "pan-y";

    function valid(i) { return i >= 0 && i < m.count && (!m.valid || m.valid(i)); }

    function clear() {
      active = -1;
      if (m.highlight) m.highlight(-1);
    }

    function show(i, pos, touch) {
      if (!valid(i)) { if (tipOwner === host) hideTip(); return; }
      active = i;
      // ohne Zeigerposition kommt der Wechsel von der Tastatur
      if (m.highlight) m.highlight(i, !pos);
      showTip(host, pos || m.anchor(i), m.html(i), {
        touch: touch, cleanup: clear,
        anchor: pos ? null : function () { return m.anchor(i); }
      });
    }

    host.addEventListener("pointermove", function (e) {
      if (e.pointerType === "touch" && tipOwner !== host) return;
      var i = m.hit(e);
      if (i !== active || tipOwner !== host) show(i, e, e.pointerType !== "mouse");
      else if (valid(i)) placeTip(e.clientX, e.clientY);
    });
    host.addEventListener("pointerdown", function (e) {
      lastPointer = e.pointerType || "mouse";
      if (lastPointer === "mouse") return;
      var i = m.hit(e);
      wasActive = (i === active && tipOwner === host);
      show(i, e, true);
    });
    host.addEventListener("pointerleave", function (e) {
      if (e.pointerType === "mouse" && tipOwner === host) hideTip();
    });
    if (m.onSelect) {
      host.addEventListener("click", function (e) {
        var i = m.hit(e);
        if (!valid(i)) return;
        // Touch: erst antippen = Tooltip, nochmals antippen = öffnen.
        if (lastPointer !== "mouse" && !wasActive) return;
        m.onSelect(i);
      });
    }

    host.addEventListener("focus", function () {
      var visible = true;
      try { visible = host.matches(":focus-visible"); } catch (e) { /* ältere Browser */ }
      if (!visible) return;
      var i = active >= 0 ? active : (m.initial ? m.initial() : 0);
      if (valid(i)) { show(i); announce(m.speak(i)); }
    });
    host.addEventListener("blur", function () { if (tipOwner === host) hideTip(); });

    host.addEventListener("keydown", function (e) {
      var key = e.key;
      if (key === "Escape") { if (tipOwner === host) hideTip(); return; }
      if ((key === "Enter" || key === " ") && m.onSelect && valid(active)) {
        e.preventDefault();
        m.onSelect(active);
        return;
      }
      var cur = active >= 0 ? active : (m.initial ? m.initial() : 0);
      var next = m.move ? m.move(cur, key) : null;
      if (next === null || next === undefined) {
        if (key === "ArrowLeft" || key === "ArrowUp") next = cur - 1;
        else if (key === "ArrowRight" || key === "ArrowDown") next = cur + 1;
        else if (key === "Home") next = 0;
        else if (key === "End") next = m.count - 1;
        else return;
      }
      e.preventDefault();
      var dir = next < cur ? -1 : 1;
      var guard = 0;
      while (next >= 0 && next < m.count && !valid(next) && guard++ < m.count) next += dir;
      if (!valid(next)) return;
      show(next);
      announce(m.speak(next));
    });
  }

  /** Bildschirm-Koordinate → SVG-Koordinate (viewBox ist immer 1:1 zur Breite). */
  function svgX(f, evt) {
    var rect = f.svg.getBoundingClientRect();
    return (evt.clientX - rect.left) * (f.width / Math.max(1, rect.width));
  }

  function anchorOf(f, x, y) {
    var rect = f.svg.getBoundingClientRect();
    var k = rect.width / Math.max(1, f.width);
    return { clientX: rect.left + x * k, clientY: rect.top + y * k };
  }

  /* ------------------------------------------------------------------ */
  /* Gemeinsames Gerüst                                                  */
  /* ------------------------------------------------------------------ */
  function frame(container, height, pad, width) {
    D.clear(container);
    // Breite einmal von aussen übergeben spart pro Diagramm ein Layout.
    var w = Math.max(280, width || container.clientWidth || 640);
    var svg = svgEl("svg", {
      class: "chart",
      viewBox: "0 0 " + w + " " + height,
      width: w,
      height: height,
      role: "img"
    });
    svg.style.width = "100%";
    svg.style.height = "auto";

    var defs = svgEl("defs");
    var hatchId = "zk-hatch-" + (++idSeq);
    var hatch = svgEl("pattern", {
      id: hatchId, width: 6, height: 6,
      patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)"
    });
    hatch.appendChild(svgEl("rect", { width: 6, height: 6, fill: "var(--chart-minus)", "fill-opacity": ".16" }));
    hatch.appendChild(svgEl("line", { x1: 0, y1: 0, x2: 0, y2: 6, stroke: "var(--chart-minus)", "stroke-width": 2.4, "stroke-opacity": ".55" }));
    defs.appendChild(hatch);
    svg.appendChild(defs);

    container.appendChild(svg);
    return {
      svg: svg, width: w, height: height, hatch: "url(#" + hatchId + ")",
      pad: Object.assign({ t: 14, r: 16, b: 26, l: 44 }, pad || {})
    };
  }

  function plotBox(f) {
    return {
      x: f.pad.l,
      y: f.pad.t,
      w: Math.max(10, f.width - f.pad.l - f.pad.r),
      h: Math.max(10, f.height - f.pad.t - f.pad.b)
    };
  }

  /**
   * Legende. items: { label, color, hatch?, outline?, dashed?, soft? }
   */
  function legend(container, items) {
    var wrap = D.el("div.chart-legend");
    items.forEach(function (i) {
      var span = D.el("span");
      var swatch = D.el("i");
      swatch.style.background = i.color;
      if (i.hatch) {
        swatch.style.background =
          "repeating-linear-gradient(45deg, " + i.color + " 0 2px, transparent 2px 5px)";
        swatch.style.border = "1px solid " + i.color;
      }
      if (i.soft) swatch.style.opacity = ".5";
      if (i.outline) {
        swatch.style.background = "transparent";
        swatch.style.border = "1.5px dashed " + i.color;
      }
      if (i.dashed) {
        swatch.className = "dash";
        swatch.style.background = "transparent";
        swatch.style.borderTop = "2px dashed " + i.color;
      }
      span.appendChild(swatch);
      span.appendChild(document.createTextNode(i.label));
      wrap.appendChild(span);
    });
    container.appendChild(wrap);
    return wrap;
  }

  function fmtSigned(minutes) { return ZK.Time.formatSigned(minutes, "clock"); }
  function fmtDur(minutes) { return ZK.Time.formatDuration(minutes, "clock"); }

  /* ==================================================================== */
  /* 1 · SALDO-VERLAUF                                                     */
  /*     Eine Serie, Fläche um die Nulllinie. Oberhalb = Plus (grün),      */
  /*     unterhalb = Minus (rostrot + Schraffur).                          */
  /*     opts.slots > points.length: die x-Achse reicht weiter als die     */
  /*     Daten (z. B. bis Monatsende) — die Linie endet bei „Heute“.       */
  /* ==================================================================== */
  function balanceArea(container, points, opts) {
    opts = opts || {};
    if (!points || points.length < 2) return emptyState(container, opts.emptyText);

    var f = frame(container, opts.height || 220, { l: 52, r: 18, t: 22, b: 26 }, opts.width);
    var box = plotBox(f);
    var slots = Math.max(points.length, opts.slots || 0);

    var values = points.map(function (p) { return p.value; });
    var maxV = Math.max.apply(null, values.concat([0]));
    var minV = Math.min.apply(null, values.concat([0]));
    var span = Math.max(60, maxV - minV);
    var padSpan = span * 0.12;
    var hi = maxV + padSpan, lo = minV - padSpan;

    function sx(i) { return box.x + (i / (slots - 1)) * box.w; }
    function sy(v) { return box.y + box.h - ((v - lo) / (hi - lo)) * box.h; }

    var zeroY = sy(0);
    var lastI = points.length - 1;

    /* Gitter — nur wenige Linien, sehr zurückhaltend */
    var ticks = niceTicks(lo, hi, 4);
    ticks.forEach(function (v) {
      var y = sy(v);
      f.svg.appendChild(svgEl("line", { x1: box.x, y1: y, x2: box.x + box.w, y2: y, class: "grid-line" }));
      f.svg.appendChild(text(box.x - 8, y + 3.5, fmtSigned(v), "axis-txt", { "text-anchor": "end" }));
    });

    /* Flächen: getrennt nach Vorzeichen, damit Position und Farbe dasselbe sagen */
    var dLine = points.map(function (p, i) { return (i ? "L" : "M") + sx(i).toFixed(1) + " " + sy(p.value).toFixed(1); }).join(" ");

    var clipUp = "zk-clip-up-" + (++idSeq);
    var clipDown = "zk-clip-down-" + (++idSeq);
    var defs = f.svg.querySelector("defs");
    var cu = svgEl("clipPath", { id: clipUp });
    cu.appendChild(svgEl("rect", { x: box.x, y: box.y, width: box.w, height: Math.max(0, zeroY - box.y) }));
    var cd = svgEl("clipPath", { id: clipDown });
    cd.appendChild(svgEl("rect", { x: box.x, y: zeroY, width: box.w, height: Math.max(0, box.y + box.h - zeroY) }));
    defs.appendChild(cu);
    defs.appendChild(cd);

    var areaPath = dLine + " L" + sx(lastI).toFixed(1) + " " + zeroY.toFixed(1) +
      " L" + sx(0).toFixed(1) + " " + zeroY.toFixed(1) + " Z";

    var up = svgEl("path", { d: areaPath, "clip-path": "url(#" + clipUp + ")" });
    up.style.fill = "var(--chart-plus)";
    up.style.fillOpacity = ".16";
    f.svg.appendChild(up);

    var down = svgEl("path", { d: areaPath, "clip-path": "url(#" + clipDown + ")", fill: f.hatch });
    f.svg.appendChild(down);

    /* Nulllinie */
    f.svg.appendChild(svgEl("line", { x1: box.x, y1: zeroY, x2: box.x + box.w, y2: zeroY, class: "zero-line" }));

    /* Heute-Marke: senkrechte Linie, wenn die Achse über heute hinausreicht */
    var lx = sx(lastI), ly = sy(points[lastI].value);
    if (opts.markerLabel && slots > points.length) {
      f.svg.appendChild(svgEl("line", { x1: lx, y1: box.y, x2: lx, y2: box.y + box.h, class: "today-line" }));
      f.svg.appendChild(text(lx, box.y - 8, opts.markerLabel, "axis-txt marker-txt",
        { "text-anchor": lx > box.x + box.w - 40 ? "end" : "middle" }));
    }

    /* Linie */
    var line = svgEl("path", { d: dLine, class: "line-path" });
    line.style.stroke = "var(--chart-mark)";
    f.svg.appendChild(line);

    /* Endpunkt direkt beschriften */
    var last = points[lastI];
    var dot = svgEl("circle", { cx: lx, cy: ly, r: 4.5 });
    dot.style.fill = last.value < 0 ? "var(--chart-minus)" : "var(--chart-plus)";
    dot.style.stroke = "var(--surface)";
    dot.style.strokeWidth = "2";
    f.svg.appendChild(dot);

    var roomRight = (box.x + box.w) - lx > 70;
    var lblY = ly - 11 < box.y + 4 ? ly + 18 : ly - 11;
    var lbl = text(roomRight ? lx + 8 : lx - 8, lblY, fmtSigned(last.value), "val-txt", { "text-anchor": roomRight ? "start" : "end" });
    lbl.style.fontWeight = "800";
    f.svg.appendChild(lbl);

    /* X-Beschriftung: Anfang, letzter Datenpunkt, Achsenende — ohne Überlappung */
    var marks = [{ x: sx(0), label: points[0].label || "", anchor: "start" }];
    if (slots > points.length) {
      marks.push({ x: lx, label: last.label || "", anchor: "middle" });
      if (opts.endLabel) marks.push({ x: box.x + box.w, label: opts.endLabel, anchor: "end" });
    } else {
      var mid = Math.floor(lastI / 2);
      if (mid > 0 && mid < lastI) marks.push({ x: sx(mid), label: points[mid].label || "", anchor: "middle" });
      marks.push({ x: lx, label: last.label || "", anchor: "end" });
    }
    var placed = [];
    marks.forEach(function (mk) {
      if (!mk.label) return;
      var clash = placed.some(function (p) { return Math.abs(p - mk.x) < 58; });
      if (clash) return;
      placed.push(mk.x);
      f.svg.appendChild(text(mk.x, f.height - 8, mk.label, "axis-txt", { "text-anchor": mk.anchor }));
    });

    /* Fadenkreuz + Tooltip */
    var cross = svgEl("line", { y1: box.y, y2: box.y + box.h, class: "grid-line", opacity: 0 });
    cross.style.stroke = "var(--ink-3)";
    cross.style.strokeWidth = "1";
    f.svg.appendChild(cross);
    var hoverDot = svgEl("circle", { r: 4, opacity: 0 });
    hoverDot.style.fill = "var(--chart-mark)";
    hoverDot.style.stroke = "var(--surface)";
    hoverDot.style.strokeWidth = "2";
    f.svg.appendChild(hoverDot);

    function speak(i) { return (points[i].title || points[i].label) + ": " + fmtSigned(points[i].value); }

    interact(f.svg, {
      count: points.length,
      label: (opts.ariaLabel ? opts.ariaLabel + ". " : "") + speak(0) + " … " + speak(lastI),
      hit: function (e) {
        var px = svgX(f, e);
        if (px < box.x - 12 || px > box.x + box.w + 12) return -1;
        var i = Math.round(((px - box.x) / box.w) * (slots - 1));
        return Math.max(0, Math.min(lastI, i));
      },
      anchor: function (i) { return anchorOf(f, sx(i), sy(points[i].value)); },
      initial: function () { return lastI; },
      html: function (i) {
        var p = points[i];
        return "<b>" + D.esc(p.title || p.label) + "</b><br>" + D.esc(opts.valueLabel || "Saldo") + " " + fmtSigned(p.value) +
          (p.sub ? "<br><span style='opacity:.75'>" + D.esc(p.sub) + "</span>" : "");
      },
      speak: speak,
      highlight: function (i) {
        if (i < 0) {
          cross.setAttribute("opacity", 0);
          hoverDot.setAttribute("opacity", 0);
          return;
        }
        cross.setAttribute("x1", sx(i)); cross.setAttribute("x2", sx(i)); cross.setAttribute("opacity", .55);
        hoverDot.setAttribute("cx", sx(i)); hoverDot.setAttribute("cy", sy(points[i].value)); hoverDot.setAttribute("opacity", 1);
      }
    });
    f.svg.style.cursor = "crosshair";

    legend(container, [
      { label: opts.plusLabel || "Plus", color: "var(--chart-plus)" },
      { label: opts.minusLabel || "Minus", color: "var(--chart-minus)", hatch: true }
    ]);
    return f.svg;
  }

  /* ==================================================================== */
  /* 2 · BALKEN (eine Serie, optionale Referenzlinie)                      */
  /*     item.ref: eigenes Soll pro Balken (kurzer Strich) — z. B. für     */
  /*     angeschnittene Wochen. item.partial: heller gezeichnet.           */
  /* ==================================================================== */
  function bars(container, items, opts) {
    opts = opts || {};
    // Lauter Nullen sind kein Diagramm — sonst stehen leere Achsen da.
    var any = (items || []).some(function (i) { return (i.value || 0) > 0; });
    if (!items || !items.length || !any) return emptyState(container, opts.emptyText);

    var f = frame(container, opts.height || 200, { l: 50, r: 16, t: 18, b: 30 }, opts.width);
    var box = plotBox(f);

    // Die Skala muss den grössten Balken UND die Referenzlinie tragen —
    // sonst zeichnet sich das Soll oberhalb des Diagramms.
    var maxV = Math.max.apply(null, items.map(function (i) { return Math.max(i.value || 0, i.ref || 0); })
      .concat([opts.reference || 0, 1]));
    var scale = axisScale(maxV, opts.tickCount || 4);
    var top = scale.top;

    function sy(v) { return box.y + box.h - (v / top) * box.h; }

    scale.ticks.forEach(function (v) {
      var y = sy(v);
      f.svg.appendChild(svgEl("line", { x1: box.x, y1: y, x2: box.x + box.w, y2: y, class: "grid-line" }));
      f.svg.appendChild(text(box.x - 8, y + 3.5, opts.tickFormat ? opts.tickFormat(v) : fmtDur(v), "axis-txt", { "text-anchor": "end" }));
    });

    var hl = svgEl("rect", { class: "bar-hl", opacity: 0, rx: 4 });
    f.svg.appendChild(hl);

    var gap = 2;                                  // 2px Fläche zwischen Balken
    var slot = box.w / items.length;
    var bw = Math.max(3, Math.min(opts.maxBarWidth || 46, slot - gap * 2));
    var fmtV = opts.valueFormat || fmtDur;

    // Bei vielen Balken nur jede n-te Beschriftung — aber nie gar keine.
    // item.axis (auch "") legt die Beschriftung ausdrücklich fest.
    var maxLabels = Math.max(2, Math.floor(box.w / (opts.labelWidth || 40)));
    var step = Math.max(1, Math.ceil(items.length / maxLabels));
    var explicit = items.some(function (it) { return it.axis !== undefined; });

    var rects = [];
    items.forEach(function (item, i) {
      var x = box.x + slot * i + (slot - bw) / 2;
      var h = Math.max(item.value > 0 ? 3 : 0, box.y + box.h - sy(item.value || 0));
      var rect = null;
      if (h > 0) {
        rect = svgEl("rect", {
          x: x.toFixed(1), y: (box.y + box.h - h).toFixed(1), width: bw.toFixed(1), height: h.toFixed(1),
          rx: Math.min(4, bw / 2), class: "bar-rect" + (item.partial ? " is-partial" : "")
        });
        rect.style.fill = item.color || "var(--chart-mark)";
        f.svg.appendChild(rect);
      }
      rects.push(rect);

      if (item.ref) {
        var ry = sy(item.ref).toFixed(1);
        f.svg.appendChild(svgEl("line", {
          x1: (x - 3).toFixed(1), x2: (x + bw + 3).toFixed(1), y1: ry, y2: ry, class: "ref-tick"
        }));
      }

      // Die Beschriftung kommt immer — auch bei Wert 0 (Sa/So, leere Wochen).
      var lab = explicit ? item.axis : (i % step === 0 ? item.label : "");
      if (lab) {
        f.svg.appendChild(text(x + bw / 2, f.height - 10, lab, "axis-txt", { "text-anchor": "middle" }));
      }
    });

    if (opts.reference) {
      var refY = sy(opts.reference);
      var refLine = svgEl("line", { x1: box.x, y1: refY, x2: box.x + box.w, y2: refY, "stroke-dasharray": "5 4" });
      refLine.style.stroke = "var(--chart-plus)";
      refLine.style.strokeWidth = "1.8";
      f.svg.appendChild(refLine);
      var rl = text(box.x + box.w, refY - 6, opts.referenceLabel || "Soll", "val-txt", { "text-anchor": "end" });
      rl.style.fill = "var(--plus-ink)";
      rl.style.fontWeight = "800";
      f.svg.appendChild(rl);
    }

    function speak(i) {
      var item = items[i];
      return (item.title || item.label) + ": " + fmtV(item.value || 0) + (item.sub ? " · " + item.sub : "");
    }

    interact(f.svg, {
      count: items.length,
      label: (opts.ariaLabel ? opts.ariaLabel + ". " : "") + items.map(function (it) {
        return it.label + " " + fmtV(it.value || 0);
      }).join(", "),
      hit: function (e) {
        var i = Math.floor((svgX(f, e) - box.x) / slot);
        return i >= 0 && i < items.length ? i : -1;
      },
      anchor: function (i) {
        var y = sy(Math.max(items[i].value || 0, items[i].ref || 0));
        return anchorOf(f, box.x + slot * i + slot / 2, y);
      },
      initial: function () {
        for (var k = items.length - 1; k >= 0; k--) if ((items[k].value || 0) > 0) return k;
        return items.length - 1;
      },
      html: function (i) {
        var item = items[i];
        return "<b>" + D.esc(item.title || item.label) + "</b><br>" + D.esc(fmtV(item.value || 0)) +
          (item.sub ? "<br><span style='opacity:.75'>" + D.esc(item.sub) + "</span>" : "");
      },
      speak: speak,
      highlight: function (i) {
        rects.forEach(function (r, k) { if (r) r.classList.toggle("is-active", k === i); });
        if (i < 0) { hl.setAttribute("opacity", 0); return; }
        hl.setAttribute("x", (box.x + slot * i + 1).toFixed(1));
        hl.setAttribute("y", box.y);
        hl.setAttribute("width", Math.max(2, slot - 2).toFixed(1));
        hl.setAttribute("height", box.h);
        hl.setAttribute("opacity", 1);
      }
    });
    return f.svg;
  }

  /* ==================================================================== */
  /* 3 · SPANNEN-BALKEN (Ankunft → Feierabend)                             */
  /* ==================================================================== */
  function rangeBars(container, items, opts) {
    opts = opts || {};
    var valid = (items || []).filter(function (i) { return i.from !== null && i.to !== null; });
    if (!valid.length) return emptyState(container, opts.emptyText);

    var f = frame(container, opts.height || 200, { l: 50, r: 16, t: 16, b: 30 }, opts.width);
    var box = plotBox(f);

    var lo = Math.min.apply(null, valid.map(function (i) { return i.from; }));
    var hi = Math.max.apply(null, valid.map(function (i) { return i.to; }));
    lo = Math.floor((lo - 30) / 60) * 60;
    hi = Math.ceil((hi + 30) / 60) * 60;

    function sy(v) { return box.y + box.h - ((v - lo) / (hi - lo)) * box.h; }

    for (var tm = lo; tm <= hi; tm += 120) {
      var y = sy(tm);
      f.svg.appendChild(svgEl("line", { x1: box.x, y1: y, x2: box.x + box.w, y2: y, class: "grid-line" }));
      f.svg.appendChild(text(box.x - 8, y + 3.5, ZK.Time.formatHHMM(tm), "axis-txt", { "text-anchor": "end" }));
    }

    var slot = box.w / items.length;
    var bw = Math.max(6, Math.min(28, slot - 10));
    var rects = [];

    items.forEach(function (item, i) {
      var x = box.x + slot * i + (slot - bw) / 2;
      f.svg.appendChild(text(x + bw / 2, f.height - 10, item.label, "axis-txt", { "text-anchor": "middle" }));
      if (item.from === null || item.to === null) { rects.push(null); return; }
      var y1 = sy(item.to), y2 = sy(item.from);
      var rect = svgEl("rect", {
        x: x.toFixed(1), y: y1.toFixed(1), width: bw, height: Math.max(4, y2 - y1).toFixed(1),
        rx: Math.min(4, bw / 2), class: "bar-rect"
      });
      rect.style.fill = "var(--chart-mark)";
      rect.style.fillOpacity = ".8";
      f.svg.appendChild(rect);
      rects.push(rect);
    });

    function span(item) {
      return ZK.Time.formatHHMM(item.from) + " – " + ZK.Time.formatHHMM(item.to);
    }

    interact(f.svg, {
      count: items.length,
      label: (opts.ariaLabel ? opts.ariaLabel + ". " : "") + valid.map(function (it) { return it.label + " " + span(it); }).join(", "),
      valid: function (i) { return items[i].from !== null && items[i].to !== null; },
      hit: function (e) {
        var i = Math.floor((svgX(f, e) - box.x) / slot);
        return i >= 0 && i < items.length ? i : -1;
      },
      anchor: function (i) { return anchorOf(f, box.x + slot * i + slot / 2, sy(items[i].to)); },
      initial: function () { return items.indexOf(valid[0]); },
      html: function (i) {
        var item = items[i];
        return "<b>" + D.esc(item.title || item.label) + "</b><br>" + span(item) +
          (item.sub ? "<br><span style='opacity:.75'>" + D.esc(item.sub) + "</span>" : "");
      },
      speak: function (i) { return (items[i].title || items[i].label) + ": " + span(items[i]); },
      highlight: function (i) {
        rects.forEach(function (r, k) { if (r) r.classList.toggle("is-active", k === i); });
      }
    });
    return f.svg;
  }

  /* ==================================================================== */
  /* 4 · RANGLISTE (waagrechte Balken, eine Farbe, direkt beschriftet)     */
  /*     Ein gemeinsames Raster: alle Spuren sind gleich lang, sonst       */
  /*     verzerrt die Breite der Wertspalte den Vergleich.                 */
  /* ==================================================================== */
  function rankedBars(container, items, opts) {
    opts = opts || {};
    var list = (items || []).filter(function (i) { return i.value > 0; })
      .sort(function (a, b) { return b.value - a.value; });
    if (!list.length) return emptyState(container, opts.emptyText);

    D.clear(container);
    var max = list[0].value;
    var wrap = D.el("div.ranked");

    list.forEach(function (item) {
      wrap.appendChild(D.el("span.r-label", { text: item.label, title: item.label }));
      var track = D.el("div.r-track");
      var fill = D.el("i");
      fill.style.width = Math.max(3, (item.value / max) * 100) + "%";
      fill.style.background = item.color || "var(--chart-mark)";
      track.appendChild(fill);
      wrap.appendChild(track);
      wrap.appendChild(D.el("span.r-val.mono", { text: opts.valueFormat ? opts.valueFormat(item.value) : String(item.value) }));
    });
    container.appendChild(wrap);
    return wrap;
  }

  /* ==================================================================== */
  /* 5 · RING — das „OO“ des Logos als Fortschrittsanzeige                 */
  /* ==================================================================== */
  function ring(container, opts) {
    opts = opts || {};
    D.clear(container);
    var size = opts.size || 180;
    var stroke = opts.stroke || 14;
    var inner = opts.inner || null;      // zweiter, innerer Ring
    var r1 = (size - stroke) / 2;
    var r2 = r1 - stroke - 6;
    var c1 = 2 * Math.PI * r1;
    var c2 = 2 * Math.PI * r2;
    // Rohwert behalten: über 100 % zeichnet sich der Überzeit-Bogen.
    var raw = Math.max(0, opts.value || 0);
    var p1 = Math.min(1, raw);
    var p2 = inner ? Math.max(0, Math.min(1, inner.value || 0)) : 0;

    var svg = svgEl("svg", { viewBox: "0 0 " + size + " " + size, class: "chart", role: "img", "aria-label": opts.ariaLabel || "" });
    svg.style.width = "100%";
    svg.style.maxWidth = size + "px";
    svg.style.height = "auto";

    svg.appendChild(svgEl("circle", {
      cx: size / 2, cy: size / 2, r: r1, fill: "none",
      class: "ring-track", "stroke-width": stroke
    }));
    var arc1 = svgEl("circle", {
      cx: size / 2, cy: size / 2, r: r1, fill: "none", class: "ring-arc",
      "stroke-width": stroke, "stroke-dasharray": c1.toFixed(1),
      "stroke-dashoffset": (c1 * (1 - p1)).toFixed(1)
    });
    arc1.style.stroke = opts.color || "var(--chart-mark)";
    svg.appendChild(arc1);

    /* Überstunden-Bogen: der Teil jenseits von 100 % */
    if (raw > 1) {
      var over = svgEl("circle", {
        cx: size / 2, cy: size / 2, r: r1, fill: "none", class: "ring-arc",
        "stroke-width": stroke, "stroke-dasharray": c1.toFixed(1),
        "stroke-dashoffset": (c1 * (1 - Math.min(1, raw - 1))).toFixed(1)
      });
      over.style.stroke = "var(--chart-plus)";
      svg.appendChild(over);
    }

    if (inner) {
      svg.appendChild(svgEl("circle", {
        cx: size / 2, cy: size / 2, r: r2, fill: "none",
        class: "ring-track", "stroke-width": stroke - 5
      }));
      var arc2 = svgEl("circle", {
        cx: size / 2, cy: size / 2, r: r2, fill: "none", class: "ring-arc",
        "stroke-width": stroke - 5, "stroke-dasharray": c2.toFixed(1),
        "stroke-dashoffset": (c2 * (1 - p2)).toFixed(1)
      });
      arc2.style.stroke = inner.color || "var(--chart-mark-2)";
      svg.appendChild(arc2);
    }

    container.appendChild(svg);
    return svg;
  }

  /* ==================================================================== */
  /* 6 · JAHRES-HEATMAP (divergierend um null)                             */
  /*     cells: { blank } | { date, kind, value, label, state, sub,        */
  /*     monthStart }. kind: "value" (Plus/Minus) · "zero" (±0,            */
  /*     Abwesenheit) · "gap" (Soll ohne Eintrag) · "off" · "future".      */
  /*     Spalten = Wochen (Mo–So), Zeilen = Wochentage.                    */
  /* ==================================================================== */
  function heatmap(container, cells, opts) {
    opts = opts || {};
    D.clear(container);
    if (!cells || !cells.length) return emptyState(container, opts.emptyText);

    // Leerzellen tragen keinen Wert — ohne diese Prüfung wird maxAbs zu NaN
    // und sämtliche Farben fallen still aus.
    var maxAbs = 60;
    cells.forEach(function (c) {
      if (!c.blank && c.kind === "value" && Math.abs(c.value) > maxAbs) maxAbs = Math.abs(c.value);
    });

    var wrap = D.el("div.heat-wrap");
    var days = D.el("div.heat-days", { "aria-hidden": "true" });
    (opts.dayLabels || []).forEach(function (l) { days.appendChild(D.el("span", { text: l || "" })); });
    wrap.appendChild(days);

    var scroller = D.el("div.heat-scroll");
    var months = D.el("div.heat-months", { "aria-hidden": "true" });
    var grid = D.el("div.heat", { role: "group" });

    // Ein String statt ~370 Einzelknoten mit je fünf Listenern.
    var html = [];
    cells.forEach(function (c, i) {
      if (c.monthStart) {
        var col = Math.floor(i / 7) + 1;
        months.appendChild(D.el("span", { text: c.monthStart, style: { gridColumn: col + " / span 4" } }));
      }
      if (c.blank) { html.push('<i class="h-blank"></i>'); return; }
      var cls = "h-" + (c.kind || "off");
      var style = "";
      if (c.kind === "value") {
        // Untergrenze bewusst hoch: ein erfasster Tag mit Saldo nahe null
        // muss sich klar von „gar nichts erfasst“ unterscheiden.
        var alpha = Math.round((0.34 + Math.min(1, Math.abs(c.value) / maxAbs) * 0.66) * 100);
        if (c.value > 0) {
          cls = "h-plus";
          style = "background:color-mix(in srgb, var(--chart-plus) " + alpha + "%, var(--surface-3))";
        } else {
          cls = "h-minus";
          style = "background:repeating-linear-gradient(45deg, color-mix(in srgb, var(--chart-minus) " + alpha +
            "%, var(--surface-3)) 0 3px, color-mix(in srgb, var(--chart-minus) " + Math.round(alpha * 0.55) +
            "%, var(--surface-3)) 3px 6px)";
        }
      }
      if (c.today) cls += " is-today";
      html.push('<i class="' + cls + '" data-i="' + i + '"' + (style ? ' style="' + style + '"' : "") + "></i>");
    });
    grid.innerHTML = html.join("");
    scroller.appendChild(months);
    scroller.appendChild(grid);
    wrap.appendChild(scroller);
    container.appendChild(wrap);

    var nodes = grid.children;
    var activeNode = null;

    function valueText(c) {
      return c.kind === "value" ? fmtSigned(c.value) : (c.state || "");
    }

    interact(grid, {
      count: cells.length,
      label: opts.ariaLabel || "",
      touchAction: false,
      valid: function (i) { return !!cells[i] && !cells[i].blank; },
      hit: function (e) {
        var target = e.target && e.target.closest ? e.target.closest("i[data-i]") : null;
        return target ? +target.getAttribute("data-i") : -1;
      },
      anchor: function (i) {
        var r = nodes[i].getBoundingClientRect();
        return { clientX: r.left + r.width / 2, clientY: r.top };
      },
      initial: function () {
        if (opts.initialIndex !== undefined && opts.initialIndex >= 0) return opts.initialIndex;
        for (var k = cells.length - 1; k >= 0; k--) if (!cells[k].blank) return k;
        return 0;
      },
      move: function (i, key) {
        if (key === "ArrowLeft") return i - 7;
        if (key === "ArrowRight") return i + 7;
        if (key === "ArrowUp") return i - 1;
        if (key === "ArrowDown") return i + 1;
        return null;
      },
      html: function (i) {
        var c = cells[i];
        return "<b>" + D.esc(c.label) + "</b><br>" + D.esc(valueText(c)) +
          (c.sub ? "<br><span style='opacity:.75'>" + D.esc(c.sub) + "</span>" : "");
      },
      speak: function (i) {
        var c = cells[i];
        return c.label + ": " + valueText(c) + (c.sub ? " · " + c.sub : "");
      },
      highlight: function (i, byKeyboard) {
        if (activeNode) activeNode.classList.remove("is-active");
        activeNode = i >= 0 ? nodes[i] : null;
        if (!activeNode) return;
        activeNode.classList.add("is-active");
        if (!byKeyboard) return;
        // Tastatur: die aktive Zelle im waagrechten Scroller sichtbar halten
        var left = activeNode.offsetLeft - scroller.scrollLeft;
        if (left < 8 || left > scroller.clientWidth - 24) {
          scroller.scrollLeft = Math.max(0, activeNode.offsetLeft - scroller.clientWidth / 2);
        }
      },
      onSelect: opts.onSelect ? function (i) { opts.onSelect(cells[i]); } : null
    });

    // Auf schmalen Bildschirmen beginnt der Scroller sonst im Januar.
    if (opts.initialIndex !== undefined && opts.initialIndex >= 0) {
      var focusCol = Math.floor(opts.initialIndex / 7);
      var run = function () {
        if (!scroller.isConnected || scroller.scrollWidth <= scroller.clientWidth) return;
        var colW = nodes[7] ? (nodes[7].offsetLeft - nodes[0].offsetLeft) || 16 : 16;
        var target = (focusCol + 3) * colW - scroller.clientWidth;
        if (target > 0) scroller.scrollLeft = target;
      };
      if (root.requestAnimationFrame) root.requestAnimationFrame(run); else run();
    }

    legend(container, opts.legend || [
      { label: opts.minusLabel || "Minus", color: "var(--chart-minus)", hatch: true },
      { label: opts.zeroLabel || "±0", color: "var(--heat-zero)" },
      { label: opts.plusLabel || "Plus", color: "var(--chart-plus)" }
    ]);
    return grid;
  }

  /* ------------------------------------------------------------------ */
  /* Hilfen                                                              */
  /* ------------------------------------------------------------------ */
  function emptyState(container, message) {
    D.clear(container);
    var box = D.el("div.empty");
    box.innerHTML =
      '<div class="rings"><i></i><i></i></div>' +
      "<p>" + D.esc(message || ZK.I18n.t("chart.empty")) + "</p>";
    container.appendChild(box);
    return box;
  }

  /* Achsenschritte in Minuten. Oberhalb von 5 h in ganzen, gut lesbaren
     Stunden (8, 12, 20, 40, 50 h …) statt in Vielfachen von 24 h. */
  var STEPS = [15, 30, 60, 120, 180, 240, 300, 480, 600, 720, 1200, 1800, 2400, 3000, 6000, 12000, 18000, 30000, 60000];

  /**
   * Achse von 0 bis oberhalb von `maxV`, auf einen runden Schritt aufgezogen.
   * Der oberste Tick liegt garantiert bei oder über maxV.
   */
  function axisScale(maxV, count) {
    var step = niceStep((maxV * 1.08) / Math.max(1, count));
    var top = Math.max(step, Math.ceil(maxV / step) * step);
    var ticks = [];
    for (var v = 0; v <= top + 0.001; v += step) ticks.push(Math.round(v));
    return { top: top, ticks: ticks, step: step };
  }

  function niceStep(raw) {
    for (var i = 0; i < STEPS.length; i++) if (STEPS[i] >= raw) return STEPS[i];
    return STEPS[STEPS.length - 1];
  }

  /** Angenehme Achsenschritte in Minuten. */
  function niceTicks(lo, hi, count) {
    var span = hi - lo;
    if (span <= 0) return [0];
    var step = niceStep(span / Math.max(1, count));
    var out = [];
    var start = Math.ceil(lo / step) * step;
    for (var v = start; v <= hi + 0.001; v += step) out.push(Math.round(v));
    if (!out.length) out.push(Math.round(lo));
    return out;
  }

  ZK.Charts = {
    balanceArea: balanceArea,
    bars: bars,
    rangeBars: rangeBars,
    rankedBars: rankedBars,
    ring: ring,
    heatmap: heatmap,
    legend: legend,
    emptyState: emptyState,
    hideTip: hideTip,
    axisScale: axisScale
  };
})(typeof self !== "undefined" ? self : this);
