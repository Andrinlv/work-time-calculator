/* ==========================================================================
   ZEITKONTO — Erweiterungspunkte
   --------------------------------------------------------------------------
   Zusatzfunktionen (Lückenhilfe, Zeitschieber, Erkenntnisse …) hängen sich
   hier ein, statt die Ansichten selbst umzubauen. Jede Ansicht ruft an
   festen Stellen ihre Slots auf; was dort registriert ist, wird gezeichnet.
   Ein Fehler in einer Erweiterung bleibt in ihr — die Ansicht läuft weiter.

   Slots (Stand 1.3):
     today.cards       render(host, ctx) · update(ctx) jede Minute
     stats.top         nach den Kennzahlen      stats.bottom  am Ende
     settings.sections Karten vor dem Spaltenumbruch
     reports.actions   Knöpfe im Kopf           reports.top   über dem Blatt
     calendar.top      über dem Monatsraster    calendar.cell Zellen-Dekorierer
     week.row          Zeilen-Dekorierer
     header.actions    Knöpfe in der Kopfzeile
     palette.commands  collect(query) → [{icon, label, sub, run}]
   ========================================================================== */
(function (root) {
  "use strict";
  var ZK = root.ZK = root.ZK || {};
  var slots = Object.create(null);

  /**
   * @param {String} slot
   * @param {Function|Object} def  Funktion oder { render, update, order, id }
   */
  function register(slot, def) {
    if (typeof def === "function") def = { render: def };
    def.order = def.order || 0;
    var list = slots[slot] || (slots[slot] = []);
    // Gleiche id ersetzt — sonst stapeln sich Einträge bei erneutem Laden
    for (var i = 0; i < list.length; i++) {
      if (def.id && list[i].id === def.id) { list.splice(i, 1); break; }
    }
    list.push(def);
    list.sort(function (a, b) { return a.order - b.order; });
    return def;
  }

  function list(slot) { return (slots[slot] || []).slice(); }

  function guard(fn, slot) {
    try { return fn(); }
    catch (e) {
      if (root.console) console.error("Erweiterung in " + slot + ":", e);
      return null;
    }
  }

  /**
   * Zeichnet alle Erweiterungen eines Slots in `host`. Liefert ein Objekt
   * mit update(ctx), das die Ansicht bei Zustandsänderungen aufruft.
   */
  function render(slot, host, ctx) {
    var handles = [];
    list(slot).forEach(function (def) {
      if (def.when && !guard(function () { return def.when(ctx); }, slot)) return;
      var h = guard(function () { return def.render ? def.render(host, ctx) : null; }, slot);
      handles.push({ def: def, handle: h });
    });
    return {
      count: handles.length,
      update: function (next) {
        handles.forEach(function (x) {
          var fn = (x.handle && x.handle.update) || x.def.update;
          if (fn) guard(function () { fn(next); }, slot);
        });
      }
    };
  }

  /** Sammelt Rückgabewerte (Arrays werden flach zusammengeführt). */
  function collect(slot, arg, ctx) {
    var out = [];
    list(slot).forEach(function (def) {
      var fn = def.collect || def.render;
      var r = guard(function () { return fn(arg, ctx); }, slot);
      if (Array.isArray(r)) out.push.apply(out, r);
      else if (r) out.push(r);
    });
    return out;
  }

  /** Dekorierer: dürfen ein bestehendes Element ergänzen. */
  function decorate(slot, el, ctx) {
    list(slot).forEach(function (def) {
      var fn = def.decorate || def.render;
      guard(function () { fn(el, ctx); }, slot);
    });
  }

  ZK.Ext = { register: register, render: render, collect: collect, decorate: decorate, list: list };
})(typeof self !== "undefined" ? self : this);
