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

test("Näfelser Fahrt weicht dem Hohen Donnerstag aus", () => {
  const naefels = (y) => {
    const map = H.forYear(y, "CH-GL");
    return Object.keys(map).filter((k) => map[k].id === "naefels")[0];
  };
  // Erster Donnerstag im April ist Gründonnerstag → eine Woche später
  assert.equal(naefels(2015), "2015-04-09");
  assert.equal(naefels(2021), "2021-04-08");
  assert.equal(naefels(2023), "2023-04-13");
  assert.equal(naefels(2026), "2026-04-09");
  // Sonst der erste Donnerstag im April, auch in der Osterwoche
  assert.equal(naefels(2018), "2018-04-05", "Ostern 1.4. — Donnerstag nach Ostern bleibt");
  assert.equal(naefels(2024), "2024-04-04");
  assert.equal(naefels(2025), "2025-04-03");
  assert.equal(naefels(2027), "2027-04-01");
  assert.equal(H.lookup("2026-04-02", "CH-GL"), null, "2026 ist der 2.4. kein Feiertag in Glarus");
});

test("Waadt kennt keinen Stephanstag", () => {
  assert.equal(H.lookup("2028-12-26", "CH-VD"), null);
  assert.equal(H.lookup("2027-12-26", "CH-VD"), null);
  assert.ok(H.lookup("2028-12-26", "CH-BE"), "Bern schon");
  // Waadt: 9 Feiertage, davon der Bettagsmontag
  const vd = H.forYear(2027, "CH-VD");
  assert.deepEqual(Object.keys(vd).sort(), [
    "2027-01-01", "2027-01-02", "2027-03-26", "2027-03-29", "2027-05-06",
    "2027-05-17", "2027-08-01", "2027-09-20", "2027-12-25"
  ]);
});

test("Kantonslisten 2026/2027: Stichproben", () => {
  // Genf: Jeûne genevois (Do nach dem 1. Sonntag im September) und Restauration
  assert.equal(H.lookup("2026-09-10", "CH-GE").id, "jeune_ge");
  assert.equal(H.lookup("2027-09-09", "CH-GE").id, "jeune_ge");
  assert.equal(H.lookup("2027-12-31", "CH-GE").id, "ge_restauration");
  // Wallis: kein Karfreitag, kein Ostermontag, kein Pfingstmontag, kein Stephanstag
  ["2027-03-26", "2027-03-29", "2027-05-17", "2027-12-26"].forEach((d) => assert.equal(H.lookup(d, "CH-VS"), null, d));
  assert.equal(H.lookup("2027-03-19", "CH-VS").id, "josef");
  // Tessin: San Giuseppe, Peter und Paul, kein Karfreitag
  assert.equal(H.lookup("2026-06-29", "CH-TI").id, "peterpaul");
  assert.equal(H.lookup("2026-04-03", "CH-TI"), null);
  // Jura: 23. Juni, kein Stephanstag; Neuenburg: 1. März
  assert.equal(H.lookup("2026-06-23", "CH-JU").id, "ju_unabh");
  assert.equal(H.lookup("2027-12-26", "CH-JU"), null);
  assert.equal(H.lookup("2027-03-01", "CH-NE").id, "ne_republik");
  // Obwalden: Bruder Klaus; Luzern 2027: Fronleichnam 27.5.
  assert.equal(H.lookup("2026-09-25", "CH-OW").id, "bruderklaus");
  assert.equal(H.lookup("2027-05-27", "CH-LU").id, "fronleichnam");
  // Basel-Stadt: Tag der Arbeit, aber kein Berchtoldstag
  assert.ok(H.lookup("2026-05-01", "CH-BS"));
  assert.equal(H.lookup("2026-01-02", "CH-BS"), null);
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
