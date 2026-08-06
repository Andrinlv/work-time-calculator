"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const H = require("../assets/js/core/holidays.js");

function iso(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

test("Osterdatum stimmt mit dem gregorianischen Kalender überein", () => {
  assert.equal(iso(H.easterOf(2024)), "2024-03-31");
  assert.equal(iso(H.easterOf(2025)), "2025-04-20");
  assert.equal(iso(H.easterOf(2026)), "2026-04-05");
  assert.equal(iso(H.easterOf(2027)), "2027-03-28");
  assert.equal(iso(H.easterOf(2030)), "2030-04-21");
});

test("Gesamtschweizerische Feiertage gelten in jedem Kanton", () => {
  H.CH_CANTONS.forEach(([code]) => {
    const map = H.forYear(2026, "CH-" + code);
    assert.ok(map["2026-01-01"], "Neujahr fehlt in " + code);
    assert.ok(map["2026-08-01"], "Bundesfeier fehlt in " + code);
    assert.ok(map["2026-12-25"], "Weihnachten fehlt in " + code);
    assert.ok(map["2026-05-14"], "Auffahrt fehlt in " + code);
  });
});

test("Kantonale Unterschiede werden abgebildet", () => {
  // Fronleichnam (Ostern + 60) gilt in katholischen Kantonen
  assert.ok(H.lookup("2026-06-04", "CH-LU"), "Luzern kennt Fronleichnam");
  assert.equal(H.lookup("2026-06-04", "CH-ZH"), null, "Zürich kennt Fronleichnam nicht");

  // Karfreitag fehlt im Wallis und im Tessin
  assert.ok(H.lookup("2026-04-03", "CH-BE"), "Bern hat Karfreitag");
  assert.equal(H.lookup("2026-04-03", "CH-VS"), null, "Wallis hat keinen Karfreitag");

  // Stephanstag nicht in Genf
  assert.ok(H.lookup("2026-12-26", "CH-ZH"));
  assert.equal(H.lookup("2026-12-26", "CH-GE"), null);
});

test("Berechnete Feiertage liegen auf dem richtigen Wochentag", () => {
  const naefels = H.between("2026-01-01", "2026-12-31", "CH-GL")
    .filter((h) => h.holiday.id === "naefels")[0];
  assert.ok(naefels, "Näfelser Fahrt fehlt");
  const d = new Date(naefels.date + "T00:00:00");
  assert.equal(d.getDay(), 4, "immer ein Donnerstag");
  assert.equal(d.getMonth(), 3, "immer im April");

  const jeune = H.between("2026-01-01", "2026-12-31", "CH-GE")
    .filter((h) => h.holiday.id === "jeune_ge")[0];
  assert.ok(jeune);
  assert.equal(new Date(jeune.date + "T00:00:00").getDay(), 4, "Donnerstag");
});

test("Deutschland, Österreich und Frankreich", () => {
  assert.ok(H.lookup("2026-10-03", "DE"), "Tag der Deutschen Einheit");
  assert.equal(H.lookup("2026-06-04", "DE"), null, "Fronleichnam nicht bundesweit");
  assert.ok(H.lookup("2026-06-04", "DE-BY"), "in Bayern schon");
  assert.ok(H.lookup("2026-10-26", "AT"), "österreichischer Nationalfeiertag");
  assert.ok(H.lookup("2026-07-14", "FR"), "französischer Nationalfeiertag");
  assert.equal(H.lookup("2026-04-03", "FR"), null, "Karfreitag ist in Frankreich kein Feiertag");
  assert.ok(H.lookup("2026-04-03", "FR-AM"), "in Elsass-Mosel dagegen schon");
});

test("Region „none“ liefert keine Feiertage", () => {
  assert.deepEqual(Object.keys(H.forYear(2026, "none")), []);
  assert.equal(H.lookup("2026-01-01", "none"), null);
});

test("Feiertage tragen übersetzte Namen", () => {
  const h = H.lookup("2026-08-01", "CH-BE");
  assert.equal(h.names.de, "Bundesfeier");
  assert.equal(h.names.fr, "Fête nationale");
  assert.equal(h.names.it, "Festa nazionale");
  assert.ok(h.names.en);
});

test("between liefert sortierte Ergebnisse über Jahresgrenzen", () => {
  const list = H.between("2026-12-01", "2027-01-31", "CH-ZH");
  assert.ok(list.length >= 3);
  for (let i = 1; i < list.length; i++) {
    assert.ok(list[i - 1].date <= list[i].date, "unsortiert bei " + list[i].date);
  }
  assert.ok(list.some((h) => h.date === "2027-01-01"));
});

test("Regionsliste ist vollständig und eindeutig", () => {
  const keys = H.REGIONS.map((r) => r.key);
  assert.equal(new Set(keys).size, keys.length, "keine doppelten Schlüssel");
  assert.equal(H.CH_CANTONS.length, 26, "alle Kantone");
  keys.filter((k) => k.startsWith("CH-")).forEach((k) => {
    assert.ok(Object.keys(H.forYear(2026, k)).length > 0, k + " ohne Feiertage");
  });
});
