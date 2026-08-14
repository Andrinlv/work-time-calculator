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

  function tip() {
    if (!tipNode) {
      tipNode = D.el("div.chart-tip", { role: "tooltip" });
      Object.assign(tipNode.style, {
        position: "fixed", zIndex: "170", pointerEvents: "none", opacity: "0",
        background: "var(--surface-invert)", color: "var(--ink-invert)",
        padding: "7px 10px", borderRadius: "8px", fontSize: "12px",
        fontWeight: "650", lineHeight: "1.45", boxShadow: "var(--shadow-md)",
        transition: "opacity .12s ease", maxWidth: "240px", whiteSpace: "nowrap"
      });
      document.body.appendChild(tipNode);
    }
    return tipNode;
  }

  function showTip(evt, html) {
    var t = tip();
    t.innerHTML = html;
    t.style.opacity = "1";
    moveTip(evt);
  }

  function moveTip(evt) {
    var t = tip();
    var pad = 14;
    var w = t.offsetWidth, h = t.offsetHeight;
    var x = evt.clientX + pad;
    var y = evt.clientY - h - pad;
    if (x + w > window.innerWidth - 8) x = evt.clientX - w - pad;
    if (y < 8) y = evt.clientY + pad;
    t.style.left = x + "px";
    t.style.top = y + "px";
  }

  function hideTip() { if (tipNode) tipNode.style.opacity = "0"; }

  function bindTip(node, htmlFn) {
    node.addEventListener("mouseenter", function (e) { showTip(e, htmlFn()); });
    node.addEventListener("mousemove", moveTip);
    node.addEventListener("mouseleave", hideTip);
    node.addEventListener("focus", function (e) {
      var r = node.getBoundingClientRect();
      showTip({ clientX: r.left + r.width / 2, clientY: r.top }, htmlFn());
    });
    node.addEventListener("blur", hideTip);
  }

  /* ------------------------------------------------------------------ */
  /* Gemeinsames Gerüst                                                  */
  /* ------------------------------------------------------------------ */
  function frame(container, height, pad) {
    D.clear(container);
    var width = Math.max(280, container.clientWidth || 640);
    var svg = svgEl("svg", {
      class: "chart",
      viewBox: "0 0 " + width + " " + height,
      width: width,
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
      svg: svg, width: width, height: height, hatch: "url(#" + hatchId + ")",
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

  function legend(container, items) {
    var wrap = D.el("div.chart-legend");
    items.forEach(function (i) {
      var span = D.el("span");
      var swatch = D.el("i", { style: { background: i.color } });
      if (i.hatch) {
        swatch.style.background =
          "repeating-linear-gradient(45deg, " + i.color + " 0 2px, transparent 2px 5px)";
        swatch.style.border = "1px solid " + i.color;
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
  /* ==================================================================== */
  function balanceArea(container, points, opts) {
    opts = opts || {};
    if (!points || points.length < 2) return emptyState(container, opts.emptyText);

    var f = frame(container, opts.height || 220, { l: 52, r: 18, t: 16, b: 26 });
    var box = plotBox(f);

    var values = points.map(function (p) { return p.value; });
    var maxV = Math.max.apply(null, values.concat([0]));
    var minV = Math.min.apply(null, values.concat([0]));
    var span = Math.max(60, maxV - minV);
    var padSpan = span * 0.12;
    var hi = maxV + padSpan, lo = minV - padSpan;

    function sx(i) { return box.x + (i / (points.length - 1)) * box.w; }
    function sy(v) { return box.y + box.h - ((v - lo) / (hi - lo)) * box.h; }

    var zeroY = sy(0);

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

    var areaPath = dLine + " L" + sx(points.length - 1).toFixed(1) + " " + zeroY.toFixed(1) +
      " L" + sx(0).toFixed(1) + " " + zeroY.toFixed(1) + " Z";

    var up = svgEl("path", { d: areaPath, "clip-path": "url(#" + clipUp + ")" });
    up.style.fill = "var(--chart-plus)";
    up.style.fillOpacity = ".16";
    f.svg.appendChild(up);

    var down = svgEl("path", { d: areaPath, "clip-path": "url(#" + clipDown + ")", fill: f.hatch });
    f.svg.appendChild(down);

    /* Nulllinie */
    f.svg.appendChild(svgEl("line", { x1: box.x, y1: zeroY, x2: box.x + box.w, y2: zeroY, class: "zero-line" }));

    /* Linie */
    var line = svgEl("path", { d: dLine, class: "line-path" });
    line.style.stroke = "var(--chart-mark)";
    f.svg.appendChild(line);

    /* Endpunkt direkt beschriften */
    var last = points[points.length - 1];
    var lx = sx(points.length - 1), ly = sy(last.value);
    var dot = svgEl("circle", { cx: lx, cy: ly, r: 4.5 });
    dot.style.fill = last.value < 0 ? "var(--chart-minus)" : "var(--chart-plus)";
    dot.style.stroke = "var(--surface)";
    dot.style.strokeWidth = "2";
    f.svg.appendChild(dot);

    var labelX = lx - 8;
    var lbl = text(labelX, ly - 11, fmtSigned(last.value), "val-txt", { "text-anchor": "end" });
    lbl.style.fontWeight = "800";
    f.svg.appendChild(lbl);

    /* X-Beschriftung: erster, mittlerer, letzter Punkt */
    [0, Math.floor(points.length / 2), points.length - 1].forEach(function (i, n, arr) {
      if (arr.indexOf(i) !== n) return;
      f.svg.appendChild(text(sx(i), f.height - 8, points[i].label || "", "axis-txt", {
        "text-anchor": i === 0 ? "start" : (i === points.length - 1 ? "end" : "middle")
      }));
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

    var capture = svgEl("rect", { x: box.x, y: box.y, width: box.w, height: box.h, fill: "transparent" });
    capture.style.cursor = "crosshair";
    f.svg.appendChild(capture);

    capture.addEventListener("mousemove", function (e) {
      var rect = f.svg.getBoundingClientRect();
      var scale = f.width / rect.width;
      var px = (e.clientX - rect.left) * scale;
      var i = Math.round(((px - box.x) / box.w) * (points.length - 1));
      i = Math.max(0, Math.min(points.length - 1, i));
      var p = points[i];
      cross.setAttribute("x1", sx(i)); cross.setAttribute("x2", sx(i)); cross.setAttribute("opacity", .55);
      hoverDot.setAttribute("cx", sx(i)); hoverDot.setAttribute("cy", sy(p.value)); hoverDot.setAttribute("opacity", 1);
      showTip(e, "<b>" + D.esc(p.title || p.label) + "</b><br>" + D.esc(opts.valueLabel || "Saldo") + " " + fmtSigned(p.value));
    });
    capture.addEventListener("mouseleave", function () {
      cross.setAttribute("opacity", 0);
      hoverDot.setAttribute("opacity", 0);
      hideTip();
    });

    legend(container, [
      { label: opts.plusLabel || "Plus", color: "var(--chart-plus)" },
      { label: opts.minusLabel || "Minus", color: "var(--chart-minus)", hatch: true }
    ]);
    return f.svg;
  }

  /* ==================================================================== */
  /* 2 · BALKEN (eine Serie, optionale Referenzlinie)                      */
  /* ==================================================================== */
  function bars(container, items, opts) {
    opts = opts || {};
    if (!items || !items.length) return emptyState(container, opts.emptyText);

    var f = frame(container, opts.height || 200, { l: 50, r: 16, t: 18, b: 30 });
    var box = plotBox(f);

    // Die Skala muss den grössten Balken UND die Referenzlinie tragen —
    // sonst zeichnet sich das Soll oberhalb des Diagramms.
    var maxV = Math.max.apply(null, items.map(function (i) { return i.value || 0; }).concat([opts.reference || 0, 1]));
    var scale = axisScale(maxV, 3);
    var ticks = scale.ticks;
    var top = scale.top;

    function sy(v) { return box.y + box.h - (v / top) * box.h; }

    ticks.forEach(function (v) {
      var y = sy(v);
      f.svg.appendChild(svgEl("line", { x1: box.x, y1: y, x2: box.x + box.w, y2: y, class: "grid-line" }));
      f.svg.appendChild(text(box.x - 8, y + 3.5, opts.tickFormat ? opts.tickFormat(v) : fmtDur(v), "axis-txt", { "text-anchor": "end" }));
    });

    var gap = 2;                                  // 2px Fläche zwischen Balken
    var slot = box.w / items.length;
    var bw = Math.max(4, Math.min(opts.maxBarWidth || 46, slot - gap * 2));

    items.forEach(function (item, i) {
      var x = box.x + slot * i + (slot - bw) / 2;
      var y = sy(item.value);
      var h = Math.max(item.value > 0 ? 3 : 0, box.y + box.h - y);
      if (h <= 0) return;
      var r = Math.min(4, bw / 2);                // 4px runde Datenenden
      var rect = svgEl("rect", {
        x: x.toFixed(1), y: y.toFixed(1), width: bw.toFixed(1), height: h.toFixed(1),
        rx: r, class: "bar-rect", tabindex: "0", role: "img",
        "aria-label": item.label + ": " + (opts.valueFormat ? opts.valueFormat(item.value) : fmtDur(item.value))
      });
      rect.style.fill = item.color || "var(--chart-mark)";
      f.svg.appendChild(rect);
      bindTip(rect, function () {
        return "<b>" + D.esc(item.title || item.label) + "</b><br>" +
          D.esc(opts.valueFormat ? opts.valueFormat(item.value) : fmtDur(item.value)) +
          (item.sub ? "<br><span style='opacity:.75'>" + D.esc(item.sub) + "</span>" : "");
      });

      if (items.length <= 14) {
        f.svg.appendChild(text(x + bw / 2, f.height - 10, item.label, "axis-txt", { "text-anchor": "middle" }));
      }
    });

    if (opts.reference) {
      var ry = sy(opts.reference);
      var refLine = svgEl("line", { x1: box.x, y1: ry, x2: box.x + box.w, y2: ry, "stroke-dasharray": "5 4" });
      refLine.style.stroke = "var(--chart-plus)";
      refLine.style.strokeWidth = "1.8";
      f.svg.appendChild(refLine);
      var rl = text(box.x + box.w, ry - 6, opts.referenceLabel || "Soll", "val-txt", { "text-anchor": "end" });
      rl.style.fill = "var(--chart-plus)";
      rl.style.fontWeight = "800";
      f.svg.appendChild(rl);
    }
    return f.svg;
  }

  /* ==================================================================== */
  /* 3 · SPANNEN-BALKEN (Ankunft → Feierabend)                             */
  /* ==================================================================== */
  function rangeBars(container, items, opts) {
    opts = opts || {};
    var valid = (items || []).filter(function (i) { return i.from !== null && i.to !== null; });
    if (!valid.length) return emptyState(container, opts.emptyText);

    var f = frame(container, opts.height || 200, { l: 50, r: 16, t: 16, b: 30 });
    var box = plotBox(f);

    var lo = Math.min.apply(null, valid.map(function (i) { return i.from; }));
    var hi = Math.max.apply(null, valid.map(function (i) { return i.to; }));
    lo = Math.floor((lo - 30) / 60) * 60;
    hi = Math.ceil((hi + 30) / 60) * 60;

    function sy(v) { return box.y + box.h - ((v - lo) / (hi - lo)) * box.h; }

    for (var t = lo; t <= hi; t += 120) {
      var y = sy(t);
      f.svg.appendChild(svgEl("line", { x1: box.x, y1: y, x2: box.x + box.w, y2: y, class: "grid-line" }));
      f.svg.appendChild(text(box.x - 8, y + 3.5, ZK.Time.formatHHMM(t), "axis-txt", { "text-anchor": "end" }));
    }

    var slot = box.w / items.length;
    var bw = Math.max(6, Math.min(28, slot - 10));

    items.forEach(function (item, i) {
      var x = box.x + slot * i + (slot - bw) / 2;
      if (item.from === null || item.to === null) {
        f.svg.appendChild(text(x + bw / 2, f.height - 10, item.label, "axis-txt", { "text-anchor": "middle" }));
        return;
      }
      var y1 = sy(item.to), y2 = sy(item.from);
      var rect = svgEl("rect", {
        x: x.toFixed(1), y: y1.toFixed(1), width: bw, height: Math.max(4, y2 - y1).toFixed(1),
        rx: Math.min(4, bw / 2), class: "bar-rect", tabindex: "0",
        "aria-label": item.label + ": " + ZK.Time.formatHHMM(item.from) + " bis " + ZK.Time.formatHHMM(item.to)
      });
      rect.style.fill = "var(--chart-mark)";
      rect.style.fillOpacity = ".8";
      f.svg.appendChild(rect);
      bindTip(rect, function () {
        return "<b>" + D.esc(item.title || item.label) + "</b><br>" +
          ZK.Time.formatHHMM(item.from) + " → " + ZK.Time.formatHHMM(item.to) +
          (item.sub ? "<br><span style='opacity:.75'>" + D.esc(item.sub) + "</span>" : "");
      });
      f.svg.appendChild(text(x + bw / 2, f.height - 10, item.label, "axis-txt", { "text-anchor": "middle" }));
    });
    return f.svg;
  }

  /* ==================================================================== */
  /* 4 · RANGLISTE (waagrechte Balken, eine Farbe, direkt beschriftet)     */
  /* ==================================================================== */
  function rankedBars(container, items, opts) {
    opts = opts || {};
    var list = (items || []).filter(function (i) { return i.value > 0; })
      .sort(function (a, b) { return b.value - a.value; });
    if (!list.length) return emptyState(container, opts.emptyText);

    D.clear(container);
    var max = list[0].value;
    var wrap = D.el("div", { style: { display: "flex", flexDirection: "column", gap: "9px" } });

    list.forEach(function (item) {
      var row = D.el("div", {
        style: { display: "grid", gridTemplateColumns: "minmax(94px, 34%) 1fr auto", gap: "10px", alignItems: "center" }
      });
      row.appendChild(D.el("span", {
        text: item.label,
        style: { fontSize: "12px", fontWeight: "650", color: "var(--ink-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }
      }));
      var track = D.el("div", { style: { height: "12px", borderRadius: "6px", background: "var(--ring-track)", overflow: "hidden" } });
      var fill = D.el("i", {
        style: {
          display: "block", height: "100%", width: Math.max(3, (item.value / max) * 100) + "%",
          borderRadius: "6px", background: item.color || "var(--chart-mark)",
          transition: "width .5s var(--ease-out)"
        }
      });
      track.appendChild(fill);
      row.appendChild(track);
      row.appendChild(D.el("span", {
        text: opts.valueFormat ? opts.valueFormat(item.value) : String(item.value),
        class: "mono",
        style: { fontSize: "12px", fontWeight: "800", color: "var(--ink)" }
      }));
      wrap.appendChild(row);
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
    var p1 = Math.max(0, Math.min(1, opts.value || 0));
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
      "stroke-dashoffset": (c1 * (1 - Math.min(1, p1))).toFixed(1)
    });
    arc1.style.stroke = opts.color || "var(--chart-mark)";
    svg.appendChild(arc1);

    /* Überstunden-Bogen: der Teil jenseits von 100 % */
    if (p1 > 1) {
      var over = svgEl("circle", {
        cx: size / 2, cy: size / 2, r: r1, fill: "none", class: "ring-arc",
        "stroke-width": stroke, "stroke-dasharray": c1.toFixed(1),
        "stroke-dashoffset": (c1 * (1 - Math.min(1, p1 - 1))).toFixed(1)
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
  /* ==================================================================== */
  function heatmap(container, cells, opts) {
    opts = opts || {};
    D.clear(container);
    if (!cells || !cells.length) return emptyState(container, opts.emptyText);

    // Leerzellen tragen keinen Wert — ohne diese Prüfung wird maxAbs zu NaN
    // und sämtliche Farben fallen still aus.
    var magnitudes = cells.map(function (c) {
      return (c.blank || c.value === null || c.value === undefined) ? 0 : Math.abs(c.value);
    });
    var maxAbs = Math.max(60, magnitudes.length ? Math.max.apply(null, magnitudes) : 0);

    var grid = D.el("div.heat");
    cells.forEach(function (c) {
      var cell = D.el("i", { tabindex: "0", role: "img" });
      if (c.blank) {
        cell.style.background = "transparent";
        cell.style.pointerEvents = "none";
      } else if (c.value === null) {
        cell.style.background = "var(--surface-3)";
        cell.setAttribute("aria-label", c.label + ": nicht erfasst");
      } else {
        // Untergrenze bewusst hoch: ein erfasster Tag mit Saldo nahe null
        // muss sich klar von „gar nichts erfasst“ unterscheiden.
        var ratio = Math.min(1, Math.abs(c.value) / maxAbs);
        var alpha = 0.34 + ratio * 0.66;
        if (c.value >= 0) {
          cell.style.background = "color-mix(in srgb, var(--chart-plus) " + Math.round(alpha * 100) + "%, var(--surface-3))";
        } else {
          cell.style.background =
            "repeating-linear-gradient(45deg, color-mix(in srgb, var(--chart-minus) " +
            Math.round(alpha * 100) + "%, var(--surface-3)) 0 3px, " +
            "color-mix(in srgb, var(--chart-minus) " + Math.round(alpha * 55) + "%, var(--surface-3)) 3px 6px)";
        }
        cell.setAttribute("aria-label", c.label + ": " + fmtSigned(c.value));
      }
      if (!c.blank) {
        bindTip(cell, function () {
          return "<b>" + D.esc(c.label) + "</b><br>" +
            (c.value === null ? (opts.notRecorded || "nicht erfasst") : fmtSigned(c.value)) +
            (c.sub ? "<br><span style='opacity:.75'>" + D.esc(c.sub) + "</span>" : "");
        });
        if (opts.onSelect) {
          cell.style.cursor = "pointer";
          cell.addEventListener("click", function () { opts.onSelect(c); });
        }
      }
      grid.appendChild(cell);
    });
    container.appendChild(grid);

    legend(container, [
      { label: opts.minusLabel || "Minus", color: "var(--chart-minus)", hatch: true },
      { label: opts.zeroLabel || "Ausgeglichen", color: "var(--surface-3)" },
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
      "<p>" + D.esc(message || "Noch keine Daten für dieses Diagramm.") + "</p>";
    container.appendChild(box);
    return box;
  }

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
    var steps = [15, 30, 60, 120, 180, 240, 300, 480, 600, 960, 1440, 2880, 4320, 7200, 14400];
    for (var i = 0; i < steps.length; i++) if (steps[i] >= raw) return steps[i];
    return steps[steps.length - 1];
  }

  /** Angenehme Achsenschritte in Minuten. */
  function niceTicks(lo, hi, count) {
    var span = hi - lo;
    if (span <= 0) return [0];
    var raw = span / Math.max(1, count);
    var steps = [15, 30, 60, 120, 180, 240, 300, 480, 600, 960, 1440, 2880, 4320, 7200, 14400];
    var step = steps[steps.length - 1];
    for (var i = 0; i < steps.length; i++) { if (steps[i] >= raw) { step = steps[i]; break; } }
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
    hideTip: hideTip
  };
})(typeof self !== "undefined" ? self : this);
