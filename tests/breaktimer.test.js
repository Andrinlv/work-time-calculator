"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const T = require("../assets/js/core/time.js");
const R = require("../assets/js/core/rules.js");
const E = require("../assets/js/core/engine.js");
const S = require("../assets/js/ui/views/today.js");
const BT = require("../assets/js/ui/features/breaktimer.js");

/* Pausen-Timer: Voreinstellung aus der fehlenden Pflichtpause, Plan,
   Verlängerung, Countdown — und was Benachrichtigungen sagen und tun.
   Gerechnet wird mit der echten Engine, damit Karte und „Heute“ dieselbe
   Pause meinen. */

const FR = "2026-10-16";                       // Freitag, Soll 8:24
function settings(patch) {
  return Object.assign(R.defaultSettings(), { autoHolidays: false }, patch || {});
}
function day(rec, h, m, s) {
  return E.computeDay(Object.assign({ date: FR, start: "", end: "", breaks: [] }, rec), {
    settings: settings(s), holiday: null, isToday: true, now: new Date(2026, 9, 16, h, m)
  });
}
/** Wie die Karte: fehlende Pflichtpause für die laufende Pause des Tages. */
function missingFor(rec, h, m, s) {
  const res = day(rec, h, m, s);
  const ob = S.openBreak(res, rec, h * 60 + m);
  const set = settings(s);
  return {
    res, ob,
    missing: BT.missingBreak({
      need: S.neededNet(res), worked: res.workingTime, legalBreak: res.legalBreak,
      openMinutes: ob ? ob.minutes : 0, ruleset: set.breakRuleset, customTiers: set.customBreakTiers
    })
  };
}
const LUNCH = { id: "l", start: "12:05", end: "12:40" };
const COFFEE = { id: "c", start: "14:10", end: "" };

/* ---------------------------------------------------------------------- */
/* Dauern und Voreinstellung                                               */
/* ---------------------------------------------------------------------- */

test("Dauern 15 · 30 · 45 · 60 min, Voreinstellung deckt die fehlende Pflichtpause", () => {
  assert.deepEqual(BT.DURATIONS, [15, 30, 45, 60]);
  const cases = [[0, 15], [-5, 15], [10, 15], [15, 15], [16, 30], [30, 30], [31, 45], [45, 45], [50, 60], [60, 60], [90, 60]];
  for (const [missing, want] of cases) assert.equal(BT.defaultMinutes(missing), want, "fehlend " + missing);
});

test("Mittag schon gemacht: keine Pflichtpause mehr offen, Kaffeepause 15 min", () => {
  const { ob, missing } = missingFor({ start: "07:42", breaks: [LUNCH, COFFEE] }, 14, 23);
  assert.equal(ob.start, "14:10");
  assert.equal(ob.minutes, 13);
  assert.equal(missing, 0, "35 min Mittag decken die 30 min für 8 h 24");
  assert.equal(BT.defaultMinutes(missing), 15);
});

test("Erste Pause des Tages: die ganze Pflichtpause fehlt, die laufende zählt nicht mit", () => {
  const rec = { start: "07:42", breaks: [{ id: "m", start: "11:50", end: "" }] };
  const early = missingFor(rec, 11, 55);
  const late = missingFor(rec, 12, 25);
  assert.equal(early.missing, 30, "8 h 24 Soll → 30 min");
  assert.equal(late.missing, 30, "die Voreinstellung schrumpft nicht mit jeder Pausenminute");
  assert.equal(BT.defaultMinutes(early.missing), 30);
});

test("Teilweise erfasste Pause: nur der Rest fehlt, über 9 h die Stunde", () => {
  const short = missingFor({ start: "07:00", breaks: [{ id: "k", start: "09:30", end: "09:45" }, { id: "m", start: "12:00", end: "" }] }, 12, 5);
  assert.equal(short.missing, 15, "30 min Pflicht − 15 min erfasst");
  assert.equal(BT.defaultMinutes(short.missing), 15);

  const long = missingFor({ start: "07:00", targetOverride: 9 * 60 + 30, breaks: [{ id: "k", start: "09:30", end: "09:45" }, { id: "m", start: "12:00", end: "" }] }, 12, 5);
  assert.equal(long.missing, 45, "9 h 30 Soll → 60 min Pflicht − 15 min erfasst");
  assert.equal(BT.defaultMinutes(long.missing), 45);
});

test("Wer schon länger gearbeitet hat als das Soll, braucht die Pause dieser Arbeitszeit", () => {
  assert.equal(BT.missingBreak({ need: 4 * 60, worked: 7 * 60 + 30, legalBreak: 5, openMinutes: 5 }), 30);
  assert.equal(BT.missingBreak({ need: 4 * 60, worked: 3 * 60, legalBreak: 0, openMinutes: 0 }), 0, "Halbtag: keine Pflichtpause");
  assert.equal(BT.missingBreak({}), 0);
});

/* ---------------------------------------------------------------------- */
/* Plan, Wahl und Verlängerung                                             */
/* ---------------------------------------------------------------------- */

test("Plan gilt nur für dieselbe Pause; ohne Wahl folgt er der Voreinstellung", () => {
  const key = BT.keyOf(FR, { ref: "c", start: "14:10" });
  assert.equal(key, "2026-10-16|c");
  assert.equal(BT.keyOf(FR, { start: "14:10" }), "2026-10-16|14:10", "ohne Zeilen-ID der Beginn");

  assert.deepEqual(BT.planFor(null, key, 0), { key, minutes: 15, extra: 0, fired: false, chosen: false });
  assert.deepEqual(BT.planFor("kaputt", key, 20), { key, minutes: 30, extra: 0, fired: false, chosen: false });

  const chosen = { key, minutes: 45, extra: 5, fired: true, chosen: true };
  assert.deepEqual(BT.planFor(chosen, key, 0), chosen, "Wahl, Verlängerung und „gemeldet“ überleben das Neuladen");
  assert.equal(BT.planFor(chosen, "2026-10-16|neu", 0).minutes, 15, "neue Pause, neuer Plan");
  assert.equal(BT.planFor({ key, minutes: 15, chosen: false }, key, 30).minutes, 30, "ohne Wahl gilt die aktuelle Voreinstellung");
  assert.equal(BT.planFor({ key, minutes: 20, chosen: true }, key, 0).minutes, 15, "unbekannte Dauer verworfen");
  assert.equal(BT.planFor({ key, minutes: 30, chosen: true, extra: -9 }, key, 0).extra, 0);
});

test("Andere Dauer wählen setzt Verlängerung und „gemeldet“ zurück", () => {
  const plan = { key: "k", minutes: 15, extra: 10, fired: true, chosen: false };
  assert.deepEqual(BT.choose(plan, 45), { key: "k", minutes: 45, extra: 0, fired: false, chosen: true });
  assert.equal(BT.choose(plan, 20), plan, "nur angebotene Dauern");
});

test("+5 min vor dem Ende verlängert das geplante Ende", () => {
  const plan = { key: "k", minutes: 15, extra: 0, fired: false, chosen: false };
  const next = BT.extend(plan, 5, 12);
  assert.equal(BT.totalMinutes(next), 20);
  assert.equal(next.minutes, 15, "die gewählte Dauer bleibt sichtbar");
});

test("+5 min bei überzogener Pause zählt ab jetzt — sonst brächte ein später Klick nur Sekunden", () => {
  const plan = { key: "k", minutes: 15, extra: 0, fired: true, chosen: true };
  const next = BT.extend(plan, 5, 18);
  assert.equal(BT.totalMinutes(next), 23);
  assert.equal(next.fired, false, "meldet sich am neuen Ende wieder");
  assert.equal(next.chosen, true);
  assert.equal(BT.totalMinutes(BT.extend(plan, 5, 15 + 40 / 60)), 21, "auf die Minute gerundet");
  assert.equal(BT.totalMinutes(BT.extend(next, 5, 19)), 28, "zweimal +5 vor dem Ende");
});

test("Snooze-Längen: Pause +5, Feierabend +15", () => {
  assert.equal(BT.SNOOZE.break, 5);
  assert.equal(BT.SNOOZE.leave, 15);
});

/* ---------------------------------------------------------------------- */
/* Countdown                                                               */
/* ---------------------------------------------------------------------- */

test("Restzeit und Ring aus dem Beginn der Pause — auch nach dem Neuladen", () => {
  const ob = { start: "14:10", startTl: 14 * 60 + 10 };
  const plan = { key: "k", minutes: 15, extra: 0 };
  const now = (14 * 60 + 23) * 60;
  assert.equal(BT.endTl(ob, plan), 14 * 60 + 25);
  assert.equal(BT.secondsLeft(ob, plan, now), 120);
  assert.equal(BT.secondsLeft(ob, plan, now + 150), -30, "überzogen");
  assert.ok(Math.abs(BT.progress(ob, plan, now) - 13 / 15) < 1e-9);
  assert.equal(BT.progress(ob, plan, now + 999), 1);
  assert.equal(BT.progress(ob, plan, 0), 0);
  assert.equal(BT.progress(ob, { minutes: 0, extra: 0 }, now), 1);
});

test("Nachtschicht: Pause nach Mitternacht liegt auf der Zeitachse hinter 24:00", () => {
  const rec = { date: FR, start: "22:00", end: "", breaks: [{ id: "n", start: "02:00", end: "" }] };
  const res = E.computeDay(rec, { settings: settings(), holiday: null, isToday: false, now: new Date(2026, 9, 17, 2, 10) });
  assert.equal(res.running, true);
  const nowTl = S.nowOnTimeline(res, 2 * 60 + 10);
  const ob = S.openBreak(res, rec, nowTl);
  assert.equal(ob.startTl, T.DAY + 120);
  assert.equal(BT.secondsLeft(ob, { minutes: 30, extra: 0 }, nowTl * 60), 20 * 60);
});

test("Countdown-Text: aufgerundet, nie negativ, mit Stunden; überzogen mit Plus", () => {
  assert.equal(BT.formatLeft(120), "2:00");
  assert.equal(BT.formatLeft(119.2), "2:00", "aufgerundet — 0:00 erst am Ende");
  assert.equal(BT.formatLeft(0.2), "0:01");
  assert.equal(BT.formatLeft(0), "0:00");
  assert.equal(BT.formatLeft(-5), "0:00");
  assert.equal(BT.formatLeft(NaN), "0:00");
  assert.equal(BT.formatLeft(3725), "1:02:05");
  assert.equal(BT.formatOver(-130), "+2:10");
  assert.equal(BT.formatOver(-0.5), "+0:00");
  assert.equal(BT.formatOver(30), "+0:00");
});

/* ---------------------------------------------------------------------- */
/* Benachrichtigungen                                                      */
/* ---------------------------------------------------------------------- */

test("Weg der Benachrichtigung: Serviceworker vor klassisch, Android nie ohne Serviceworker", () => {
  assert.equal(BT.channel({ api: true, permission: "granted", sw: true, mobile: true }), "sw", "Android/Chrome");
  assert.equal(BT.channel({ api: true, permission: "granted", sw: true, mobile: false }), "sw");
  assert.equal(BT.channel({ api: true, permission: "granted", sw: false, mobile: false }), "page", "Desktop ohne SW");
  assert.equal(BT.channel({ api: true, permission: "granted", sw: false, mobile: true }), "none", "new Notification wirft dort");
  assert.equal(BT.channel({ api: true, permission: "default", sw: true }), "none");
  assert.equal(BT.channel({ api: true, permission: "denied", sw: true }), "none");
  assert.equal(BT.channel({ api: false, permission: "granted", sw: true }), "none", "iOS-Safari im Tab");
  assert.equal(BT.channel(null), "none");
});

const fx = { t: (k, v) => (v ? k + JSON.stringify(v) : k), dur: (m) => m + " min" };

test("Pause um: Tag, Text und Knöpfe „Pause beenden“ / „+5 min“", () => {
  const n = BT.notice("break", { iso: FR, now: 1234, minutes: 30, start: "14:10" }, fx);
  assert.equal(n.tag, "zeitkonto-pause");
  assert.equal(n.title, "bt.overTitle");
  assert.equal(n.body, 'bt.overSub{"v":"30 min","time":"14:10"}');
  assert.deepEqual(n.actions.map((a) => a.action), ["end-break", "snooze"]);
  assert.equal(n.actions[1].title, 'bt.plus{"n":5}');
  assert.deepEqual(n.data, { kind: "break", date: FR, at: 1234 });
});

test("Feierabend: „Gehen stempeln“ und „+15 min“, Text je nach Vorlauf", () => {
  const soon = BT.notice("leave", { iso: FR, now: 1, leave: "16:54", inMin: 10 }, fx);
  assert.equal(soon.tag, "zeitkonto-feierabend");
  assert.equal(soon.title, "day.recommendedLeave 16:54");
  assert.equal(soon.body, 'bt.leaveSoon{"v":"10 min"}');
  assert.deepEqual(soon.actions.map((a) => a.action), ["stamp-out", "snooze"]);
  assert.equal(soon.actions[0].title, "day.stampOut");
  assert.equal(soon.actions[1].title, 'bt.plus{"n":15}');
  assert.equal(BT.notice("leave", { leave: "16:54", inMin: 0 }, fx).body, "toast.goalReached", "Vorlauf 0: Soll erreicht");
});

test("Pflichtpause bald fällig: „Pause starten“, mindestens eine Minute", () => {
  const n = BT.notice("breakDue", { iso: FR, now: 1, inMin: 0, req: 30 }, fx);
  assert.equal(n.tag, "zeitkonto-pflichtpause");
  assert.deepEqual(n.actions.map((a) => a.action), ["start-break"]);
  assert.equal(n.body, 'toast.breakDue{"v":"1 min","req":"30 min"}');
});

test("Knöpfe stempeln nur, wenn es noch passt", () => {
  const working = { date: FR, running: true, onBreak: false };
  const onBreak = { date: FR, running: true, onBreak: true };
  const off = { date: FR, running: false, onBreak: false };
  const leave = { kind: "leave", date: FR };
  const brk = { kind: "break", date: FR };

  assert.deepEqual(BT.route("stamp-out", leave, working), { stamp: "out" });
  assert.deepEqual(BT.route("stamp-out", leave, onBreak), { stamp: "out" }, "Gehen schliesst die Pause");
  assert.deepEqual(BT.route("stamp-out", leave, off), { skip: "notRunning" }, "schon gegangen — nicht wieder einstempeln");
  assert.deepEqual(BT.route("stamp-out", { kind: "leave", date: "2026-10-15" }, working), { skip: "stale" }, "Meldung von gestern");

  assert.deepEqual(BT.route("end-break", brk, onBreak), { stamp: "break" });
  assert.deepEqual(BT.route("end-break", brk, working), { skip: "noBreak" }, "sonst begänne eine neue Pause");
  assert.deepEqual(BT.route("start-break", { kind: "breakDue", date: FR }, working), { stamp: "break" });
  assert.deepEqual(BT.route("start-break", { kind: "breakDue", date: FR }, onBreak), { skip: "onBreak" });
  assert.deepEqual(BT.route("start-break", { kind: "breakDue" }, off), { skip: "notRunning" });
});

test("+15 min am Feierabend, +5 min an der Pause — nur solange es etwas zu erinnern gibt", () => {
  assert.deepEqual(BT.route("snooze", { kind: "leave" }, { running: true }), { snooze: 15, kind: "leave" });
  assert.deepEqual(BT.route("snooze", {}, { running: true }), { snooze: 15, kind: "leave" });
  assert.deepEqual(BT.route("snooze", { kind: "break" }, { running: true, onBreak: true }), { snooze: 5, kind: "break" });
  assert.deepEqual(BT.route("snooze", { kind: "break" }, { running: true, onBreak: false }), { skip: "noBreak" });
  assert.deepEqual(BT.route("snooze", { kind: "leave" }, { running: false }), { skip: "notRunning" });
});

test("Klick auf die Meldung selbst öffnet nur", () => {
  assert.deepEqual(BT.route("", {}, {}), { open: true });
  assert.deepEqual(BT.route("irgendwas", {}, { running: true }), { open: true });
});

/* Die Lage aus stale.js: Die Meldung stand noch in der Leiste, die App, die
   sie gezeigt hatte, war längst ersetzt (Tab verworfen). Knopf → #/notify/…
   oder Nachricht ans offene Fenster — beide laufen über route(). */
const at = (h, m) => new Date(2026, 9, 16, h, m).getTime();

test("Jüngste Stempelzeit eines Tages — auch nach Mitternacht und mit offener Pause", () => {
  assert.equal(BT.stampedAt(FR, { start: "07:42", end: "17:00", breaks: [LUNCH] }), at(17, 0));
  assert.equal(BT.stampedAt(FR, { start: "07:42", end: "", breaks: [LUNCH, COFFEE] }), at(14, 10), "offene Pause zählt mit ihrem Beginn");
  assert.equal(BT.stampedAt(FR, { start: "07:42", end: "", breaks: [] }), at(7, 42));
  assert.equal(BT.stampedAt(FR, { start: "22:00", end: "", breaks: [{ start: "02:10", end: "02:40" }] }), at(26, 40), "Nachtschicht: 02:40 am Folgetag");
  assert.equal(BT.stampedAt(FR, { start: "", end: "", breaks: [] }), 0);
  assert.equal(BT.stampedAt(FR, null), 0);
  assert.equal(BT.stampedAt("kein-datum", { start: "07:00" }), 0);
});

test("Alte Meldung ohne offenes Fenster: stempelt nie, wenn sich der Tag seither geändert hat", () => {
  const leave = { kind: "leave", date: FR, at: at(16, 50), link: true };
  // 17:00 gegangen, um 18:30 auf „Gehen stempeln“ getippt — darf Gehen nicht verschieben
  assert.deepEqual(BT.route("stamp-out", leave, { date: FR, running: false, now: at(18, 30), changedAt: at(17, 0) }), { skip: "notRunning" });
  // Pause schon vorbei, „Pause beenden“ getippt — darf keine neue Pause beginnen
  const brk = { kind: "break", date: FR, at: at(12, 35), link: true };
  assert.deepEqual(BT.route("end-break", brk, { date: FR, running: true, onBreak: false, now: at(14, 23), changedAt: at(12, 40) }), { skip: "noBreak" });
  // Pause beendet und eine neue begonnen: der alte Knopf meint die alte Pause
  assert.deepEqual(BT.route("end-break", brk, { date: FR, running: true, onBreak: true, now: at(14, 23), changedAt: at(14, 10) }), { skip: "stale" });
  // „Pause starten“, die Pause ist inzwischen genommen
  const due = { kind: "breakDue", date: FR, at: at(11, 50), link: true };
  assert.deepEqual(BT.route("start-break", due, { date: FR, running: true, onBreak: false, now: at(13, 0), changedAt: at(12, 40) }), { skip: "stale" });
  // Nach Feierabend gestempelt: notRunning
  assert.deepEqual(BT.route("start-break", due, { date: FR, running: false, now: at(18, 30), changedAt: at(17, 0) }), { skip: "notRunning" });
});

test("Frische Meldung: der Knopf stempelt — mit und ohne offenes Fenster", () => {
  const leave = { kind: "leave", date: FR, at: at(16, 50) };
  const state = { date: FR, running: true, onBreak: false, now: at(16, 55), changedAt: at(12, 40) };
  assert.deepEqual(BT.route("stamp-out", leave, state), { stamp: "out" });
  assert.deepEqual(BT.route("stamp-out", Object.assign({ link: true }, leave), state), { stamp: "out" });
  const brk = { kind: "break", date: FR, at: at(14, 25), link: true };
  assert.deepEqual(BT.route("end-break", brk, { date: FR, running: true, onBreak: true, now: at(14, 30), changedAt: at(14, 10) }), { stamp: "break" });
  // Gleiche Minute: eine im Sekundenbruchteil vorher gestempelte Pause macht die Meldung nicht alt
  assert.deepEqual(BT.route("stamp-out", { date: FR, at: at(14, 10) + 30000 }, { date: FR, running: true, now: at(14, 11), changedAt: at(14, 10) }), { stamp: "out" });
});

test("Zu alte, verstellte oder unvollständige Meldung stempelt nicht", () => {
  const working = { date: FR, running: true, onBreak: false, now: at(18, 0), changedAt: at(7, 42) };
  const H6 = BT.NOTICE_FRESH_MS;
  assert.equal(H6, 6 * 3600 * 1000);
  assert.deepEqual(BT.route("stamp-out", { date: FR, at: working.now - H6 - 1000 }, working), { skip: "stale" }, "älter als 6 h");
  assert.deepEqual(BT.route("stamp-out", { date: FR, at: working.now - H6 + 60000 }, working), { stamp: "out" }, "knapp unter 6 h");
  assert.deepEqual(BT.route("stamp-out", { date: FR, at: working.now + 5 * 60000 }, working), { skip: "stale" }, "aus der Zukunft");
  assert.deepEqual(BT.route("stamp-out", { date: "2026-10-15", at: working.now - 60000, link: true }, working), { skip: "stale" }, "anderer Tag");
  // Der Link muss Tag und Zeitpunkt tragen — sonst wäre er ein Direktlink
  assert.deepEqual(BT.route("stamp-out", { date: FR, at: 0, link: true }, working), { skip: "stale" });
  assert.deepEqual(BT.route("stamp-out", { date: "", at: working.now, link: true }, working), { skip: "stale" });
  assert.deepEqual(BT.route("", { link: true }, working), { open: true }, "Klick auf den Text öffnet nur");
});

test("Meldungen, deren Anlass vorbei ist, gehören aus der Leiste", () => {
  const T6 = BT.TAGS;
  const base = { date: FR, running: true, onBreak: false, breakDue: true, now: at(14, 23), changedAt: at(12, 40) };
  const fresh = { date: FR, at: at(14, 0) };
  // Alles passt noch: nichts schliessen
  assert.equal(BT.staleNotice(T6.leave, fresh, base), false);
  assert.equal(BT.staleNotice(T6.breakDue, fresh, base), false);
  assert.equal(BT.staleNotice(T6["break"], fresh, Object.assign({}, base, { onBreak: true, breakDue: false })), false);
  // Gegangen: alle drei weg
  const off = Object.assign({}, base, { running: false, breakDue: false });
  for (const tag of [T6.leave, T6["break"], T6.breakDue]) assert.equal(BT.staleNotice(tag, fresh, off), true, tag);
  // Pause beendet / Pause genommen / gerade in der Pause
  assert.equal(BT.staleNotice(T6["break"], fresh, base), true, "keine offene Pause mehr");
  assert.equal(BT.staleNotice(T6.breakDue, fresh, Object.assign({}, base, { breakDue: false })), true, "Pflichtpause erfasst");
  assert.equal(BT.staleNotice(T6.breakDue, fresh, Object.assign({}, base, { onBreak: true })), true, "Pause läuft schon");
  // Seither gestempelt, anderer Tag, zu alt
  assert.equal(BT.staleNotice(T6.leave, fresh, Object.assign({}, base, { changedAt: at(14, 10) })), true);
  assert.equal(BT.staleNotice(T6.leave, { date: "2026-10-15", at: at(14, 0) }, base), true);
  assert.equal(BT.staleNotice(T6.leave, { date: FR, at: at(7, 0) }, Object.assign({}, base, { changedAt: 0 })), true);
  // Fremde Meldungen (Probe) bleiben, Meldungen ohne Daten nur nach dem Stand
  assert.equal(BT.staleNotice("zeitkonto-test", {}, off), false);
  assert.equal(BT.staleNotice(T6.leave, undefined, base), false);
  assert.equal(BT.staleNotice(T6.leave, undefined, off), true);
});

/* ---------------------------------------------------------------------- */
/* Palette                                                                 */
/* ---------------------------------------------------------------------- */

test("Palette: „pause“, „break“, „timer“ in allen Sprachen, Zahl wählt die Dauer", () => {
  for (const q of ["pause", "Pausen-Timer", "pausentimer", "break", "pausa", "minuteur", "timer", "Kaffee", "café"]) {
    const m = BT.matches(q);
    assert.equal(m && m.strength, "strong", q);
    assert.deepEqual(m.durations, [15, 30, 45, 60], q);
  }
  assert.deepEqual(BT.matches("pause 30").durations, [30]);
  assert.equal(BT.matches("pause 30").exact, true, "mit Zahl ganz oben");
  assert.equal(BT.matches("pause").exact, false, "ohne Zahl hinter den eingebauten Befehlen");
  assert.deepEqual(BT.matches("30 45 pause").durations, [30, 45]);
  assert.deepEqual(BT.matches("pause 20").durations, [15, 30, 45, 60], "unbekannte Zahl filtert nicht");
  assert.equal(BT.matches("pa").strength, "weak");
  for (const q of ["", "30", "ferien", "gehen 17:00", "x"]) assert.equal(BT.matches(q), null, q);
});

/* ---------------------------------------------------------------------- */
/* Texte und Einbindung                                                    */
/* ---------------------------------------------------------------------- */

test("Alle Texte in vier Sprachen mit denselben Platzhaltern, Schweizer ss", () => {
  const holes = (s) => (s.match(/\{\w+\}/g) || []).sort().join(",");
  const keys = Object.keys(BT.STRINGS.de).sort();
  for (const lang of ["en", "fr", "it"]) {
    assert.deepEqual(Object.keys(BT.STRINGS[lang]).sort(), keys, lang);
    for (const k of keys) {
      assert.ok(BT.STRINGS[lang][k].trim(), lang + " " + k);
      assert.equal(holes(BT.STRINGS[lang][k]), holes(BT.STRINGS.de[k]), lang + " " + k);
    }
  }
  for (const k of keys) assert.ok(!/ß/.test(BT.STRINGS.de[k]), k);
});

test("Jeder benutzte Text existiert — in der Funktion und in den Erinnerungen von app.js", () => {
  const I = require("../assets/js/ui/i18n.js");
  I.add(BT.STRINGS);
  const src = ["assets/js/ui/features/breaktimer.js", "assets/js/ui/app.js"]
    .map((f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8")).join("\n");
  const used = new Set();
  const re = /\bt\(\s*"((?:bt|day|toast|set|common|cmd)\.[\w.]+)"/g;
  let m;
  while ((m = re.exec(src))) if (!m[1].endsWith(".")) used.add(m[1]);   // „bt.skip.“ + Grund: unten einzeln
  for (const k of ["bt.skip.noBreak", "bt.skip.notRunning", "bt.skip.onBreak", "bt.skip.stale",
    "bt.notif.granted", "bt.notif.denied", "bt.notif.default", "bt.notif.unsupported"]) used.add(k);
  assert.ok(used.size > 30);
  for (const lang of ["de", "en", "fr", "it"]) {
    I.setLang(lang);
    for (const k of used) assert.notEqual(I.t(k), k, lang + ": " + k);
  }
  I.setLang("de");
});

test("Eingebunden nach „Heute“ (TodayState) und vor app.js, im Offline-Cache", () => {
  const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
  const at = (f) => html.search(new RegExp('src="assets/js/' + f.replace(/\./g, "\\.") + '(\\?v=[^"]*)?"'));
  assert.ok(at("ui/features/breaktimer.js") > at("ui/views/today.js"));
  assert.ok(at("ui/features/breaktimer.js") > at("ui/ext.js"));
  assert.ok(at("ui/features/breaktimer.js") < at("ui/app.js"));
  const sw = fs.readFileSync(path.join(__dirname, "../sw.js"), "utf8");
  assert.ok(sw.includes('"./assets/js/ui/features/breaktimer.js"'));
});
