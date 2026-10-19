"use strict";
/* App-Hülle: Tooltip-Lage (dom.js) und die Texte von Kopfzeile, Navigation
   und Tastaturhilfe in allen vier Sprachen. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const I = require("../assets/js/ui/i18n.js");

/* dom.js ist ein reines Browser-Skript; ohne document richtet es keine
   Ereignisse ein, die reinen Rechenhelfer sind trotzdem nutzbar. */
function loadDom() {
  const sandbox = { setTimeout, clearTimeout, setInterval, clearInterval };
  sandbox.self = sandbox;
  sandbox.ZK = { I18n: I };
  const code = fs.readFileSync(path.join(__dirname, "../assets/js/ui/dom.js"), "utf8");
  vm.runInNewContext(code, sandbox, { filename: "dom.js" });
  return sandbox.ZK.Dom;
}

const D = loadDom();
const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });

test("Tooltip über einem Element mitten im Bild steht darüber und zentriert", () => {
  const p = D.tipPlacement(rect(500, 400, 40, 40), 120, 30, 1440, 900);
  assert.equal(p.below, false);
  assert.equal(p.top, 400 - 8 - 30);
  assert.equal(p.left, 520 - 60);
  assert.equal(p.arrow, 60);
});

test("Tooltip in der Kopfzeile klappt nach unten statt aus dem Bild", () => {
  const p = D.tipPlacement(rect(1380, 11, 40, 40), 140, 30, 1440, 900);
  assert.equal(p.below, true);
  assert.equal(p.top, 51 + 8);
});

test("Tooltip am rechten Rand wird hineingeschoben, Pfeil zeigt weiter aufs Element", () => {
  const p = D.tipPlacement(rect(1390, 400, 40, 40), 200, 30, 1440, 900);
  assert.equal(p.left, 1440 - 8 - 200);
  assert.ok(p.left + 200 <= 1440 - 8);
  assert.equal(p.arrow, 1410 - p.left);
});

test("Tooltip am linken Rand und auf schmalem Handy bleibt im Bild", () => {
  const p = D.tipPlacement(rect(2, 300, 10, 10), 260, 44, 320, 568);
  assert.equal(p.left, 8);
  assert.ok(p.arrow >= 10);
  const wide = D.tipPlacement(rect(150, 300, 20, 20), 304, 60, 320, 568);
  assert.ok(wide.left >= 8 && wide.left + 304 <= 320 - 8 + 0.5);
});

test("Tooltip ohne Platz oben und unten nimmt die grössere Seite und bleibt im Bild", () => {
  const p = D.tipPlacement(rect(100, 20, 40, 340), 100, 60, 400, 400);
  assert.ok(p.top >= 8 && p.top + 60 <= 400 - 8);
});

const CHROME_KEYS = [
  "balance.account", "balance.accountShort", "balance.live", "balance.liveShift",
  "balance.tipSettled", "balance.tipLive", "nav.more", "nav.main", "nav.views",
  "nav.volatile", "nav.privacy", "nav.daysStored", "nav.daysStored.one", "hdr.day",
  "app.viewError", "toast.online", "ach.newBadges", "kbd.space", "kbd.inToday",
  "kbd.close", "common.fileUnreadable", "common.redo", "kbd.theme", "toast.storageFullSub"
];

test("Texte der App-Hülle gibt es in allen vier Sprachen", () => {
  for (const lang of ["de", "en", "fr", "it"]) {
    for (const key of CHROME_KEYS) {
      const v = I.DICT[lang][key];
      assert.equal(typeof v, "string", lang + " fehlt " + key);
      assert.ok(v.trim().length > 0, lang + " leer: " + key);
    }
  }
});

test("Die Saldo-Pille heisst Zeitkonto, nicht Tagessaldo", () => {
  I.setLang("de");
  assert.equal(I.t("balance.account"), "Zeitkonto");
  assert.notEqual(I.t("balance.account"), I.t("day.balance"));
  I.setLang("en");
  assert.equal(I.t("balance.account"), "Balance");
  for (const lang of ["de", "en", "fr", "it"]) {
    I.setLang(lang);
    assert.ok(I.t("balance.live", { v: "+0:12" }).indexOf("+0:12") >= 0, lang);
    assert.ok(I.t("balance.tipLive", { v: "−2:18" }).indexOf("−2:18") >= 0, lang);
    assert.ok(I.t("ach.newBadges", { n: 3 }).indexOf("3") >= 0, lang);
  }
  I.setLang("de");
});

test("Zählform der gespeicherten Tage", () => {
  I.setLang("de");
  assert.equal(I.tn("nav.daysStored", 1), "1 Tag");
  assert.equal(I.tn("nav.daysStored", 207), "207 Tage");
  I.setLang("fr");
  assert.equal(I.tn("nav.daysStored", 1), "1 jour");
  I.setLang("de");
});

test("Schweizer Schreibweise: kein ß in den neuen deutschen Texten", () => {
  for (const key of CHROME_KEYS) assert.ok(!/ß/.test(I.DICT.de[key]), key);
});

test("Browsersprache wird für den ersten Start erkannt", () => {
  assert.equal(I.detect({ languages: ["fr-CH", "de-CH"] }), "fr");
  assert.equal(I.detect({ languages: ["it-CH"] }), "it");
  assert.equal(I.detect({ language: "en-GB" }), "en");
  assert.equal(I.detect({ languages: ["pt-BR"] }), "de");
});

test("Navigation: nur eigene Ansichten — „#/constructor“ ist keine Ansicht", () => {
  const src = fs.readFileSync(path.join(__dirname, "../assets/js/ui/app.js"), "utf8");
  const m = /function isView\(key\) \{[\s\S]*?\n  \}/.exec(src);
  assert.ok(m, "app.js prüft Ansichten mit isView()");
  const sandbox = { ZK: { Views: { today: { render() {} }, stats: { render() {} } } } };
  vm.runInNewContext(m[0] + "\nthis.isView = isView;", sandbox);
  ["today", "stats"].forEach((k) => assert.equal(sandbox.isView(k), true, k));
  ["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf", "nope", "", undefined].forEach((k) => {
    assert.equal(sandbox.isView(k), false, String(k));
  });
  // Alle Stellen, die eine Ansicht aus Adresse oder Aufruf übernehmen, gehen über isView
  assert.ok(!/ZK\.Views\[(m\[1\]|view|App\.view)\]\s*\)/.test(src.replace(m[0], "")), "keine Prototyp-Suche mehr in go/readHash/renderView");
});
