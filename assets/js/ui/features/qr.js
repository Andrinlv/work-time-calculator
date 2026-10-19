/* ==========================================================================
   ZEITKONTO — QR-Stempel-Plakat
   --------------------------------------------------------------------------
   Ein QR-Code für die Spindtür: Handy drauf halten, Kommen oder Gehen ist
   gestempelt. Der Code trägt den Stempel-Link (#/stamp bzw. #/stamp/break)
   und erscheint an drei Stellen:

     · Einstellungen → Installation → Stempel-Link: Code zum direkten
       Abscannen, Auswahl Kommen/Gehen oder nur Pause
     · Plakat (A4/A5) zum Drucken — Vorschau im Dialog, gedruckt wird ein
       eigenes Blatt, solange der Dialog offen ist (auch mit Ctrl+P)
     · PNG zum Weitergeben, gezeichnet auf einem Canvas

   Kodiert wird mit ZK.QR (core/qr.js), Stufe M. Code und Plakat sind
   „Papier“ und bleiben in jedem Thema hell — Scanner erwarten dunkle
   Module auf hellem Grund, mit vier Modulen Ruhezone.
   ========================================================================== */
(function (root) {
  "use strict";
  var ZK = root.ZK = root.ZK || {};
  var I = ZK.I18n, D = ZK.Dom, Q = ZK.QR;

  I.add({
    de: {
      "qr.kind": "Was der Code stempelt",
      "qr.kind.toggle": "Kommen/Gehen",
      "qr.kind.break": "Nur Pause",
      "qr.what.toggle": "Erster Scan stempelt Kommen, der nächste Gehen.",
      "qr.what.break": "Erster Scan startet die Pause, der nächste beendet sie.",
      "qr.alt": "QR-Code zum Stempel-Link ({kind})",
      "qr.print": "Plakat drucken",
      "qr.png": "Als Bild speichern",
      "qr.pngDone": "QR-Code als Bild gespeichert",
      "qr.pngFailed": "Das Bild liess sich nicht erstellen",
      "qr.dialogSub": "Für Spindtür, Eingang oder Pausenraum",
      "qr.paper": "Papier",
      "qr.preview": "Vorschau",
      "qr.printNow": "Drucken",
      "qr.printTip": "Im Druckdialog die Grösse auf 100 % lassen — der Code misst dann rund {cm} cm.",
      "qr.poster.title": "Zeitkonto · Stempeln",
      "qr.poster.kind.toggle": "Kommen · Gehen",
      "qr.poster.kind.break": "Pause",
      "qr.poster.step1": "Kamera öffnen und auf den Code richten.",
      "qr.poster.step2": "Link antippen — Zeitkonto öffnet sich.",
      "qr.poster.step3.toggle": "Fertig: Der erste Scan stempelt Kommen, der nächste Gehen.",
      "qr.poster.step3.break": "Fertig: Der erste Scan startet die Pause, der nächste beendet sie.",
      "qr.poster.iosLead": "iPhone/iPad:",
      "qr.poster.ios": "Der Code öffnet Safari, nicht die App vom Home-Bildschirm — die beiden haben getrennte Daten. Auf dem iPhone deshalb über das App-Symbol stempeln. Mit Android stempelt der Code direkt in der App.",
      "qr.poster.data": "Ohne Server — die Zeiten bleiben auf deinem Handy.",
      "qr.cmd": "QR-Stempel-Plakat",
      "qr.cmdSub": "Code für Spindtür oder Eingang drucken"
    },
    en: {
      "qr.kind": "What the code stamps",
      "qr.kind.toggle": "In/Out",
      "qr.kind.break": "Break only",
      "qr.what.toggle": "First scan clocks you in, the next one clocks you out.",
      "qr.what.break": "First scan starts the break, the next one ends it.",
      "qr.alt": "QR code for the stamp link ({kind})",
      "qr.print": "Print poster",
      "qr.png": "Save as image",
      "qr.pngDone": "QR code saved as image",
      "qr.pngFailed": "The image could not be created",
      "qr.dialogSub": "For the locker door, entrance or break room",
      "qr.paper": "Paper",
      "qr.preview": "Preview",
      "qr.printNow": "Print",
      "qr.printTip": "Keep the print scale at 100 % — the code then measures about {cm} cm.",
      "qr.poster.title": "Zeitkonto · Clock in",
      "qr.poster.kind.toggle": "In · Out",
      "qr.poster.kind.break": "Break",
      "qr.poster.step1": "Open the camera and point it at the code.",
      "qr.poster.step2": "Tap the link — Zeitkonto opens.",
      "qr.poster.step3.toggle": "Done: the first scan clocks you in, the next one clocks you out.",
      "qr.poster.step3.break": "Done: the first scan starts your break, the next one ends it.",
      "qr.poster.iosLead": "iPhone/iPad:",
      "qr.poster.ios": "the code opens Safari, not the home-screen app — the two keep separate data. On iPhone, stamp via the app icon instead. On Android, the code stamps right in the app.",
      "qr.poster.data": "No server — your times stay on your phone.",
      "qr.cmd": "QR stamp poster",
      "qr.cmdSub": "Print a code for the locker door or entrance"
    },
    fr: {
      "qr.kind": "Ce que le code pointe",
      "qr.kind.toggle": "Arrivée/Départ",
      "qr.kind.break": "Pause seule",
      "qr.what.toggle": "Le premier scan pointe l'arrivée, le suivant le départ.",
      "qr.what.break": "Le premier scan démarre la pause, le suivant la termine.",
      "qr.alt": "QR code du lien de pointage ({kind})",
      "qr.print": "Imprimer l'affiche",
      "qr.png": "Enregistrer l'image",
      "qr.pngDone": "QR code enregistré comme image",
      "qr.pngFailed": "Impossible de créer l'image",
      "qr.dialogSub": "Pour la porte du casier, l'entrée ou la salle de pause",
      "qr.paper": "Papier",
      "qr.preview": "Aperçu",
      "qr.printNow": "Imprimer",
      "qr.printTip": "Laissez l'échelle d'impression à 100 % — le code mesure alors environ {cm} cm.",
      "qr.poster.title": "Zeitkonto · Pointer",
      "qr.poster.kind.toggle": "Arrivée · Départ",
      "qr.poster.kind.break": "Pause",
      "qr.poster.step1": "Ouvrez l'appareil photo et visez le code.",
      "qr.poster.step2": "Touchez le lien — Zeitkonto s'ouvre.",
      "qr.poster.step3.toggle": "C'est fait : le premier scan pointe l'arrivée, le suivant le départ.",
      "qr.poster.step3.break": "C'est fait : le premier scan démarre la pause, le suivant la termine.",
      "qr.poster.iosLead": "iPhone/iPad :",
      "qr.poster.ios": "le code ouvre Safari et non l'app de l'écran d'accueil — les deux ont des données séparées. Sur iPhone, pointez plutôt via l'icône de l'app. Sur Android, le code pointe directement dans l'app.",
      "qr.poster.data": "Sans serveur — vos heures restent sur votre téléphone.",
      "qr.cmd": "Affiche QR de pointage",
      "qr.cmdSub": "Imprimer un code pour la porte du casier ou l'entrée"
    },
    it: {
      "qr.kind": "Cosa timbra il codice",
      "qr.kind.toggle": "Entrata/Uscita",
      "qr.kind.break": "Solo pausa",
      "qr.what.toggle": "La prima scansione timbra l'entrata, la successiva l'uscita.",
      "qr.what.break": "La prima scansione avvia la pausa, la successiva la termina.",
      "qr.alt": "Codice QR del link di timbratura ({kind})",
      "qr.print": "Stampa il poster",
      "qr.png": "Salva come immagine",
      "qr.pngDone": "Codice QR salvato come immagine",
      "qr.pngFailed": "Impossibile creare l'immagine",
      "qr.dialogSub": "Per l'armadietto, l'ingresso o la sala pausa",
      "qr.paper": "Carta",
      "qr.preview": "Anteprima",
      "qr.printNow": "Stampa",
      "qr.printTip": "Lascia la scala di stampa al 100 % — il codice misura così circa {cm} cm.",
      "qr.poster.title": "Zeitkonto · Timbrare",
      "qr.poster.kind.toggle": "Entrata · Uscita",
      "qr.poster.kind.break": "Pausa",
      "qr.poster.step1": "Apri la fotocamera e inquadra il codice.",
      "qr.poster.step2": "Tocca il link — si apre Zeitkonto.",
      "qr.poster.step3.toggle": "Fatto: la prima scansione timbra l'entrata, la successiva l'uscita.",
      "qr.poster.step3.break": "Fatto: la prima scansione avvia la pausa, la successiva la termina.",
      "qr.poster.iosLead": "iPhone/iPad:",
      "qr.poster.ios": "il codice apre Safari, non l'app della schermata Home — le due hanno dati separati. Su iPhone timbra quindi dall'icona dell'app. Su Android il codice timbra direttamente nell'app.",
      "qr.poster.data": "Senza server — i tuoi orari restano sul telefono.",
      "qr.cmd": "Poster QR per timbrare",
      "qr.cmdSub": "Stampa un codice per l'armadietto o l'ingresso"
    }
  });

  /* Papierfarben, nicht Themenfarben: dunkel auf hell in jedem Modus */
  var INK = "#1A1715", PAPER = "#FFFFFF";
  var QUIET = 4;
  var KINDS = ["toggle", "break"];
  /* Bedruckbare Fläche bei 10 mm Rand. Der Code nimmt CODE_SHARE der Breite
     (samt Ruhezone; gleicher Wert wie .qr-sheet-code in views.css) — auf A5
     sind das 84 mm, der Code selbst also ab Version 2 über 6 cm. */
  var PAPERS = {
    a4: { label: "A4", w: 190 },
    a5: { label: "A5", w: 128 }
  };
  var CODE_SHARE = 0.66;

  var state = { kind: "toggle", paper: "a4" };
  var memo = { text: null, qr: null };
  var poster = null;      // offener Plakat-Dialog
  var panelRedraw = null; // Code in den Einstellungen nachziehen

  function encode(text) {
    if (memo.text !== text) memo = { text: text, qr: Q.encode(text, { ecl: "M" }) };
    return memo.qr;
  }

  function link(App, kind) { return App.stampLink(kind === "break" ? "break" : "toggle"); }

  /**
   * SVG mit weissem Grund samt Ruhezone. opts.px = feste Kantenlänge
   * (sonst füllt es die Breite), opts.label = Beschreibung für Screenreader.
   */
  function svgMarkup(qr, opts) {
    opts = opts || {};
    var n = qr.size + 2 * QUIET;
    return '<svg class="qr-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + n + " " + n + '"' +
      (opts.px ? ' width="' + opts.px + '" height="' + opts.px + '"' : "") +
      ' shape-rendering="crispEdges"' +
      (opts.label ? ' role="img" aria-label="' + D.esc(opts.label) + '"' : ' aria-hidden="true"') + ">" +
      '<rect width="' + n + '" height="' + n + '" fill="' + PAPER + '"/>' +
      '<path fill="' + INK + '" d="' + Q.toPath(qr.modules, QUIET) + '"/></svg>';
  }

  /** Ganze Pixel je Modul, damit der Code auf dem Bildschirm scharf bleibt —
      so nah an target wie möglich (lange Links: kleinere Module). */
  function tilePx(qr, target) {
    var n = qr.size + 2 * QUIET;
    return Math.max(2, Math.round(target / n)) * n;
  }

  /** PNG: mindestens 1024 px Kante, mindestens 8 px je Modul. */
  function pngScale(qr) {
    return Math.max(8, Math.ceil(1024 / (qr.size + 2 * QUIET)));
  }

  /** Kantenlänge des gedruckten Codes ohne Ruhezone, in mm. */
  function codeMm(qr, paper) {
    return PAPERS[paper].w * CODE_SHARE * qr.size / (qr.size + 2 * QUIET);
  }

  function segmented(label, options, value, onChange) {
    var seg = D.el("div.segmented", { role: "group", "aria-label": label });
    options.forEach(function (o) {
      var btn = D.el("button", { type: "button", text: o[1], "aria-pressed": o[0] === value ? "true" : "false" });
      btn.addEventListener("click", function () {
        D.qsa("button", seg).forEach(function (b) { b.setAttribute("aria-pressed", b === btn ? "true" : "false"); });
        onChange(o[0]);
      });
      seg.appendChild(btn);
    });
    return seg;
  }

  function kindOptions() {
    return KINDS.map(function (k) { return [k, I.t("qr.kind." + k)]; });
  }

  function iconButton(cls, icon, label, onClick) {
    var btn = D.el("button.btn" + cls, { type: "button", html: D.icon(icon) + "<span>" + D.esc(label) + "</span>" });
    btn.addEventListener("click", onClick);
    return btn;
  }

  /* ==================================================================== */
  /* Einstellungen: Code im Stempel-Link-Block                             */
  /* ==================================================================== */
  function renderPanel(host, ctx) {
    var App = ctx.App;
    var panel = D.el("div.qr-panel");
    var seg = segmented(I.t("qr.kind"), kindOptions(), state.kind, function (k) { state.kind = k; draw(); });
    var row = D.el("div.qr-row");
    var tile = D.el("figure.qr-tile");
    var side = D.el("div.qr-side");
    var what = D.el("p.qr-what");
    side.appendChild(what);
    side.appendChild(iconButton(".block", "printer", I.t("qr.print"), function () { openPoster(App); }));
    side.appendChild(iconButton(".block", "download", I.t("qr.png"), function () { savePng(App, state.kind); }));
    row.appendChild(tile);
    row.appendChild(side);
    panel.appendChild(seg);
    panel.appendChild(row);
    host.appendChild(panel);

    function draw() {
      var text = link(App, state.kind);
      // Der Link daneben und „Kopieren“ zeigen immer, was der Code enthält
      if (ctx.input) ctx.input.value = text;
      var qr = encode(text);
      tile.innerHTML = svgMarkup(qr, { px: tilePx(qr, 160), label: I.t("qr.alt", { kind: I.t("qr.kind." + state.kind) }) });
      what.textContent = I.t("qr.what." + state.kind);
      D.qsa("button", seg).forEach(function (b, i) { b.setAttribute("aria-pressed", KINDS[i] === state.kind ? "true" : "false"); });
    }
    panelRedraw = function () { if (panel.isConnected) draw(); };
    draw();
  }

  /* ==================================================================== */
  /* Plakat                                                                */
  /* ==================================================================== */
  var RINGS = '<svg class="qr-rings" viewBox="0 0 100 100" aria-hidden="true">' +
    '<circle class="r1" cx="31.85" cy="31.85" r="11.36"/><circle class="r2" cx="68.15" cy="31.85" r="11.36"/>' +
    '<circle class="r3" cx="31.85" cy="68.15" r="11.36"/><circle class="r4" cx="68.15" cy="68.15" r="14.29"/></svg>';

  function posterNode(App, kind, paper) {
    var text = link(App, kind);
    var qr = encode(text);
    var steps = ["qr.poster.step1", "qr.poster.step2", "qr.poster.step3." + kind].map(function (key, i) {
      return "<li><b>" + (i + 1) + "</b><span>" + D.esc(I.t(key)) + "</span></li>";
    }).join("");
    return D.el("div.qr-sheet.is-" + paper, {
      lang: I.getLang(),
      html: '<div class="qr-sheet-in">' +
        '<div class="qr-sheet-head">' + RINGS +
          '<div><div class="qr-sheet-title">' + D.esc(I.t("qr.poster.title")) + "</div>" +
          '<div class="qr-sheet-kind">' + D.esc(I.t("qr.poster.kind." + kind)) + "</div></div></div>" +
        '<div class="qr-sheet-code">' + svgMarkup(qr, { label: I.t("qr.alt", { kind: I.t("qr.kind." + kind) }) }) + "</div>" +
        '<div class="qr-sheet-url">' + D.esc(text) + "</div>" +
        '<ol class="qr-sheet-steps">' + steps + "</ol>" +
        '<p class="qr-sheet-ios"><b>' + D.esc(I.t("qr.poster.iosLead")) + "</b> " + D.esc(I.t("qr.poster.ios")) + "</p>" +
        '<p class="qr-sheet-foot">' + D.esc(I.t("qr.poster.data")) + "</p>" +
        "</div>"
    });
  }

  /* Seitengrösse fürs Drucken: eine @page-Regel, solange der Dialog offen
     ist — sie überstimmt die A4-Vorgabe des Rapports. */
  function pageStyle(paper) {
    var el = document.getElementById("zk-qr-page");
    if (!el) {
      el = document.createElement("style");
      el.id = "zk-qr-page";
      document.head.appendChild(el);
    }
    el.textContent = "@media print { @page { size: " + PAPERS[paper].label + " portrait; margin: 10mm; } }";
  }

  function openPoster(App) {
    if (poster) return poster;
    var uid = Date.now().toString(36);
    var body = D.el("div.qr-dialog");
    var controls = D.el("div.qr-dialog-controls");
    var preview = D.el("div.qr-preview", { role: "group", "aria-label": I.t("qr.preview") });
    var tip = D.el("p.qr-tip");

    var kindId = "qr-kind-" + uid, paperId = "qr-paper-" + uid;
    var kindSeg = segmented(I.t("qr.kind"), kindOptions(), state.kind, function (k) { state.kind = k; draw(); });
    kindSeg.removeAttribute("aria-label");
    kindSeg.setAttribute("aria-labelledby", kindId);
    var paperSeg = segmented(I.t("qr.paper"), Object.keys(PAPERS).map(function (p) { return [p, PAPERS[p].label]; }), state.paper,
      function (p) { state.paper = p; draw(); });
    paperSeg.removeAttribute("aria-label");
    paperSeg.setAttribute("aria-labelledby", paperId);

    var f1 = D.el("div.qr-field");
    f1.appendChild(D.el("div.section-title", { id: kindId, text: I.t("qr.kind") }));
    f1.appendChild(kindSeg);
    var f2 = D.el("div.qr-field");
    f2.appendChild(D.el("div.section-title", { id: paperId, text: I.t("qr.paper") }));
    f2.appendChild(paperSeg);
    controls.appendChild(f1);
    controls.appendChild(f2);
    controls.appendChild(tip);
    body.appendChild(controls);
    body.appendChild(preview);

    // Das Druckblatt liegt ausserhalb des Dialogs direkt im body
    var host = D.el("div.qr-print-host", { "aria-hidden": "true" });
    document.body.appendChild(host);
    document.documentElement.classList.add("qr-printing");

    function draw() {
      D.clear(preview);
      preview.appendChild(posterNode(App, state.kind, state.paper));
      D.clear(host);
      host.appendChild(posterNode(App, state.kind, state.paper));
      pageStyle(state.paper);
      tip.textContent = I.t("qr.printTip", { cm: Math.round(codeMm(encode(link(App, state.kind)), state.paper) / 10) });
    }

    var m = D.modal({
      title: I.t("qr.print"),
      sub: I.t("qr.dialogSub"),
      size: "wide",
      body: body,
      footer: [
        iconButton(".left", "download", I.t("qr.png"), function () { savePng(App, state.kind); }),
        iconButton(".primary", "printer", I.t("qr.printNow"), function () { root.print(); })
      ],
      onClose: function () {
        if (host.parentNode) host.parentNode.removeChild(host);
        document.documentElement.classList.remove("qr-printing");
        var st = document.getElementById("zk-qr-page");
        if (st && st.parentNode) st.parentNode.removeChild(st);
        poster = null;
        if (panelRedraw) panelRedraw();
      }
    });
    m.box.classList.add("qr-modal");
    draw();
    poster = m;
    return m;
  }

  /* ==================================================================== */
  /* PNG                                                                   */
  /* ==================================================================== */
  function savePng(App, kind) {
    var qr = encode(link(App, kind));
    var s = pngScale(qr), px = (qr.size + 2 * QUIET) * s;
    var name = kind === "break" ? "zeitkonto-pause-qr.png" : "zeitkonto-stempeln-qr.png";
    function fail() { D.toast(I.t("qr.pngFailed"), { tone: "warn" }); }
    try {
      var canvas = document.createElement("canvas");
      canvas.width = canvas.height = px;
      var g = canvas.getContext("2d");
      if (!g) { fail(); return; }
      g.fillStyle = PAPER;
      g.fillRect(0, 0, px, px);
      g.fillStyle = INK;
      qr.modules.forEach(function (row, y) {
        row.forEach(function (dark, x) { if (dark) g.fillRect((x + QUIET) * s, (y + QUIET) * s, s, s); });
      });
      var done = function (blob) {
        if (!blob) { fail(); return; }
        D.download(name, blob);
        D.toast(I.t("qr.pngDone"), { icon: "check", sub: name });
      };
      if (canvas.toBlob) canvas.toBlob(done, "image/png");
      else done(dataUrlBlob(canvas.toDataURL("image/png")));
    } catch (e) {
      fail();
    }
  }

  function dataUrlBlob(url) {
    var bin = atob(url.split(",")[1]), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: "image/png" });
  }

  /* ==================================================================== */
  /* Anmeldung                                                             */
  /* ==================================================================== */
  /* Über file:// gibt es keinen Link, den ein Handy öffnen könnte */
  function linkable() { return !!root.location && root.location.protocol !== "file:"; }

  if (ZK.Ext) {
    ZK.Ext.register("settings.stampLink", { id: "qr", render: renderPanel });

    ZK.Ext.register("palette.commands", {
      id: "qr",
      collect: function (query, ctx) {
        if (!linkable()) return null;
        var q = String(query || "").trim().toLowerCase();
        if (q.length < 2) return null;
        var words = [I.t("qr.cmd"), I.t("qr.print"), I.t("qr.png"), "qr"];
        var strong = false, hit = false;
        words.forEach(function (w) {
          var i = w.toLowerCase().indexOf(q);
          if (i === 0) strong = true;
          if (i >= 0) hit = true;
        });
        if (!hit) return null;
        return [{
          group: I.t("cmd.group.actions"),
          icon: "printer",
          label: I.t("qr.cmd"),
          sub: I.t("qr.cmdSub"),
          late: !strong,
          run: function () { openPoster(ctx.App); }
        }];
      }
    });
  }

  ZK.StampQR = {
    svg: svgMarkup,
    tilePx: tilePx,
    pngScale: pngScale,
    codeMm: codeMm,
    PAPERS: PAPERS,
    KINDS: KINDS,
    open: openPoster,
    savePng: savePng
  };
})(typeof self !== "undefined" ? self : this);
