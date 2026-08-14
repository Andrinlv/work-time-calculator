/* ==========================================================================
   ZEITKONTO — Datenhaltung
   --------------------------------------------------------------------------
   Alle Daten bleiben auf dem Gerät (localStorage). Kein Server, kein Konto,
   kein Tracking. Schema-Versionierung + Migrationen sorgen dafür, dass
   ältere Datenstände beim Update nicht verloren gehen.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else { root.ZK = root.ZK || {}; root.ZK.Store = factory(); }
})(typeof self !== "undefined" ? self : globalThis, function () {
  "use strict";

  var KEY = "zeitkonto:v1";
  var BACKUP_KEY = "zeitkonto:backup";
  var SCHEMA = 3;

  /**
   * Prüft einen Tagesschlüssel auf ein echtes Kalenderdatum.
   * Die Form allein genügt nicht — "2026-13-45" sieht richtig aus, ist es
   * aber nicht, und ein solcher Schlüssel würde die Auswertungen verwirren.
   */
  function isValidDateKey(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
    var y = +iso.slice(0, 4), m = +iso.slice(5, 7), d = +iso.slice(8, 10);
    var date = new Date(y, m - 1, d);
    return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
  }

  /* ------------------------------------------------------------------ */
  /* Speicher-Backend                                                    */
  /* ------------------------------------------------------------------ */
  function memoryBackend() {
    var mem = Object.create(null);
    return {
      getItem: function (k) { return k in mem ? mem[k] : null; },
      setItem: function (k, v) { mem[k] = String(v); },
      removeItem: function (k) { delete mem[k]; },
      volatile: true
    };
  }

  function detectBackend() {
    try {
      var ls = (typeof localStorage !== "undefined") ? localStorage : null;
      if (!ls) return memoryBackend();
      var probe = "zeitkonto:probe";
      ls.setItem(probe, "1");
      ls.removeItem(probe);
      return ls;
    } catch (e) {
      return memoryBackend();
    }
  }

  /* ------------------------------------------------------------------ */
  /* Migrationen                                                         */
  /* ------------------------------------------------------------------ */
  var MIGRATIONS = {
    /* 1 -> 2: Pausen bekommen stabile IDs und ein `paid`-Flag. */
    2: function (state) {
      Object.keys(state.days || {}).forEach(function (iso) {
        var d = state.days[iso];
        (d.breaks || []).forEach(function (b, i) {
          if (!b.id) b.id = "b" + i + "_" + iso;
          if (b.paid === undefined) b.paid = false;
        });
      });
      return state;
    },
    /* 2 -> 3: Abwesenheitsfaktor (Halbtage) + Standort je Tag. */
    3: function (state) {
      Object.keys(state.days || {}).forEach(function (iso) {
        var d = state.days[iso];
        if (d.absenceFactor === undefined) d.absenceFactor = 1;
        if (!d.location) d.location = "office";
      });
      return state;
    }
  };

  function migrate(state) {
    var from = state.version || 1;
    for (var v = from + 1; v <= SCHEMA; v++) {
      if (MIGRATIONS[v]) state = MIGRATIONS[v](state);
      state.version = v;
    }
    state.version = SCHEMA;
    return state;
  }

  /* ------------------------------------------------------------------ */
  /* Store                                                               */
  /* ------------------------------------------------------------------ */
  function createStore(options) {
    options = options || {};
    var backend = options.backend || detectBackend();
    var defaults = options.defaultSettings || function () { return {}; };

    var state = null;
    var listeners = [];
    var undoStack = [];
    var redoStack = [];
    var saveTimer = null;
    var dirty = false;
    var lastError = null;

    function blank() {
      return {
        version: SCHEMA,
        settings: defaults(),
        days: {},
        achievements: { earned: {}, xp: 0, bestStreak: 0, seen: {} },
        meta: {
          createdAt: new Date().toISOString(),
          lastOpenedAt: new Date().toISOString(),
          onboarded: false,
          device: (typeof navigator !== "undefined" && navigator.userAgent) ? navigator.userAgent.slice(0, 90) : ""
        }
      };
    }

    function load() {
      var raw = null;
      try { raw = backend.getItem(KEY); } catch (e) { lastError = e; }
      if (!raw) { state = blank(); return state; }
      try {
        var parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") throw new Error("bad shape");
        state = migrate(normalize(parsed));
      } catch (e) {
        lastError = e;
        // Defekte Daten nicht verwerfen: als Backup sichern, dann neu starten.
        try { backend.setItem(BACKUP_KEY + ":corrupt", raw); } catch (e2) { /* ignorieren */ }
        state = blank();
        state.meta.recoveredFromCorruption = true;
      }
      state.meta = state.meta || {};
      state.meta.lastOpenedAt = new Date().toISOString();
      return state;
    }

    function normalize(parsed) {
      var s = blank();
      s.version = parsed.version || 1;
      s.settings = Object.assign(defaults(), parsed.settings || {});
      s.days = parsed.days && typeof parsed.days === "object" ? parsed.days : {};
      s.achievements = Object.assign({ earned: {}, xp: 0, bestStreak: 0, seen: {} }, parsed.achievements || {});
      s.meta = Object.assign(s.meta, parsed.meta || {});
      // Tageseinträge säubern
      Object.keys(s.days).forEach(function (iso) {
        var d = s.days[iso];
        if (!d || typeof d !== "object" || !isValidDateKey(iso)) { delete s.days[iso]; return; }
        d.date = iso;
        d.breaks = Array.isArray(d.breaks) ? d.breaks : [];
        d.start = typeof d.start === "string" ? d.start : "";
        d.end = typeof d.end === "string" ? d.end : "";
        d.note = typeof d.note === "string" ? d.note : "";
      });
      return s;
    }

    function persist(immediate) {
      dirty = true;
      if (saveTimer) clearTimeout(saveTimer);
      if (immediate) return flush();
      saveTimer = setTimeout(flush, 220);
    }

    function flush() {
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
      if (!dirty || !state) return true;
      try {
        backend.setItem(KEY, JSON.stringify(state));
        dirty = false;
        lastError = null;
        return true;
      } catch (e) {
        lastError = e;
        emit({ type: "error", error: e });
        return false;
      }
    }

    function emit(evt) {
      listeners.forEach(function (fn) {
        try { fn(evt || { type: "change" }, state); } catch (e) { /* Listener isolieren */ }
      });
    }

    function subscribe(fn) {
      listeners.push(fn);
      return function () {
        var i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      };
    }

    /* ---- Tage ------------------------------------------------------ */

    function getDay(iso) { return state.days[iso] || null; }

    function getDayOrEmpty(iso) {
      return state.days[iso] || { date: iso, type: null, start: "", end: "", breaks: [], location: "office", note: "", absenceFactor: 1, targetOverride: null };
    }

    function setDay(iso, patch, opts) {
      opts = opts || {};
      pushUndo(opts.label || "day");
      var current = state.days[iso] || { date: iso, breaks: [] };
      var next = Object.assign({}, current, patch, { date: iso, updatedAt: new Date().toISOString() });
      state.days[iso] = next;
      persist(opts.immediate);
      emit({ type: "day", date: iso });
      return next;
    }

    function deleteDay(iso, opts) {
      if (!state.days[iso]) return false;
      pushUndo((opts && opts.label) || "delete");
      delete state.days[iso];
      persist();
      emit({ type: "day", date: iso, deleted: true });
      return true;
    }

    function setDays(map, opts) {
      pushUndo((opts && opts.label) || "bulk");
      Object.keys(map).forEach(function (iso) {
        if (map[iso] === null) delete state.days[iso];
        else state.days[iso] = Object.assign({}, state.days[iso] || { date: iso, breaks: [] }, map[iso], { date: iso, updatedAt: new Date().toISOString() });
      });
      persist();
      emit({ type: "bulk", count: Object.keys(map).length });
    }

    function allDays() { return state.days; }

    function dayCount() { return Object.keys(state.days).length; }

    /* ---- Einstellungen --------------------------------------------- */

    function getSettings() { return state.settings; }

    function updateSettings(patch, opts) {
      pushUndo("settings");
      Object.assign(state.settings, patch);
      persist(opts && opts.immediate);
      emit({ type: "settings", patch: patch });
      return state.settings;
    }

    /* ---- Erfolge ---------------------------------------------------- */

    function getAchievements() { return state.achievements; }

    function saveAchievements(next) {
      state.achievements = next;
      persist();
      emit({ type: "achievements" });
    }

    /* ---- Meta ------------------------------------------------------- */

    function getMeta() { return state.meta; }
    function updateMeta(patch) {
      Object.assign(state.meta, patch);
      persist();
    }

    /* ---- Rückgängig ------------------------------------------------- */

    function snapshot() {
      return JSON.stringify({ days: state.days, settings: state.settings });
    }

    function pushUndo(label) {
      try {
        undoStack.push({ label: label, snap: snapshot(), at: Date.now() });
        if (undoStack.length > 40) undoStack.shift();
        redoStack.length = 0;
      } catch (e) { /* Snapshot ist optional */ }
    }

    function applySnapshot(snap) {
      var parsed = JSON.parse(snap);
      state.days = parsed.days;
      state.settings = parsed.settings;
      persist(true);
      emit({ type: "restore" });
    }

    function undo() {
      if (!undoStack.length) return false;
      var entry = undoStack.pop();
      redoStack.push({ label: entry.label, snap: snapshot() });
      applySnapshot(entry.snap);
      return entry.label;
    }

    function redo() {
      if (!redoStack.length) return false;
      var entry = redoStack.pop();
      undoStack.push({ label: entry.label, snap: snapshot() });
      applySnapshot(entry.snap);
      return entry.label;
    }

    function canUndo() { return undoStack.length > 0; }
    function canRedo() { return redoStack.length > 0; }

    /* ---- Import / Export -------------------------------------------- */

    function exportState() {
      return {
        app: "Zeitkonto",
        schema: SCHEMA,
        exportedAt: new Date().toISOString(),
        settings: state.settings,
        days: state.days,
        achievements: state.achievements,
        meta: { createdAt: state.meta.createdAt }
      };
    }

    /**
     * @param {Object} data  geparster Export
     * @param {String} mode  "replace" | "merge" | "merge-keep"
     */
    function importState(data, mode) {
      if (!data || typeof data !== "object") throw new Error("Ungültige Datei");
      var incomingDays = data.days || (data.state && data.state.days);
      if (!incomingDays || typeof incomingDays !== "object") throw new Error("Keine Tagesdaten gefunden");

      pushUndo("import");
      var added = 0, updated = 0, skipped = 0;

      if (mode === "replace") {
        state.days = {};
        if (data.settings) state.settings = Object.assign(defaults(), data.settings);
      }

      Object.keys(incomingDays).forEach(function (iso) {
        if (!isValidDateKey(iso)) { skipped++; return; }
        var incoming = incomingDays[iso];
        if (!incoming || typeof incoming !== "object") { skipped++; return; }
        incoming.date = iso;
        if (!state.days[iso]) { state.days[iso] = incoming; added++; return; }
        if (mode === "merge-keep") { skipped++; return; }
        state.days[iso] = Object.assign({}, state.days[iso], incoming);
        updated++;
      });

      if (mode === "merge" && data.settings) {
        state.settings = Object.assign(state.settings, data.settings);
      }
      if (data.achievements && mode !== "merge-keep") {
        state.achievements = Object.assign(state.achievements, data.achievements);
      }

      state = migrate(state);
      persist(true);
      emit({ type: "import" });
      return { added: added, updated: updated, skipped: skipped };
    }

    function reset(keepSettings) {
      pushUndo("reset");
      var keep = keepSettings ? state.settings : null;
      state = blank();
      if (keep) state.settings = keep;
      persist(true);
      emit({ type: "reset" });
    }

    /* ---- Sicherung -------------------------------------------------- */

    function makeBackup() {
      try {
        backend.setItem(BACKUP_KEY, JSON.stringify({ at: new Date().toISOString(), data: exportState() }));
        return true;
      } catch (e) { return false; }
    }

    function readBackup() {
      try {
        var raw = backend.getItem(BACKUP_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) { return null; }
    }

    /* ---- Diagnose --------------------------------------------------- */

    function usageBytes() {
      try { return (backend.getItem(KEY) || "").length; } catch (e) { return 0; }
    }

    function diagnostics() {
      return {
        schema: SCHEMA,
        days: dayCount(),
        bytes: usageBytes(),
        volatile: !!backend.volatile,
        lastError: lastError ? String(lastError.message || lastError) : null,
        undoDepth: undoStack.length
      };
    }

    return {
      SCHEMA: SCHEMA,
      load: load,
      flush: flush,
      subscribe: subscribe,
      get state() { return state; },
      getDay: getDay,
      getDayOrEmpty: getDayOrEmpty,
      setDay: setDay,
      setDays: setDays,
      deleteDay: deleteDay,
      allDays: allDays,
      dayCount: dayCount,
      getSettings: getSettings,
      updateSettings: updateSettings,
      getAchievements: getAchievements,
      saveAchievements: saveAchievements,
      getMeta: getMeta,
      updateMeta: updateMeta,
      undo: undo,
      redo: redo,
      canUndo: canUndo,
      canRedo: canRedo,
      exportState: exportState,
      importState: importState,
      reset: reset,
      makeBackup: makeBackup,
      readBackup: readBackup,
      diagnostics: diagnostics
    };
  }

  return {
    createStore: createStore,
    memoryBackend: memoryBackend,
    isValidDateKey: isValidDateKey,
    SCHEMA: SCHEMA,
    KEY: KEY
  };
});
