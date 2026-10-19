"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");

global.self = global;
require("../assets/js/ui/ext.js");
const X = global.ZK.Ext;

test("Erweiterungen werden nach Reihenfolge gezeichnet und aktualisiert", () => {
  const seen = [];
  X.register("t.cards", { id: "b", order: 2, render: (h) => { seen.push("b"); return { update: (c) => seen.push("ub" + c.n) }; } });
  X.register("t.cards", { id: "a", order: 1, render: () => { seen.push("a"); } , update: (c) => seen.push("ua" + c.n) });
  const h = X.render("t.cards", {}, {});
  h.update({ n: 1 });
  assert.deepEqual(seen, ["a", "b", "ua1", "ub1"]);
});

test("Gleiche id ersetzt statt doppelt einzuhängen", () => {
  X.register("t.dup", { id: "x", render: () => 1 });
  X.register("t.dup", { id: "x", render: () => 2 });
  assert.equal(X.list("t.dup").length, 1);
});

test("Ein Fehler bleibt in seiner Erweiterung", () => {
  const orig = console.error; console.error = () => {};
  X.register("t.err", { id: "bad", order: 1, render: () => { throw new Error("kaputt"); } });
  let ok = false;
  X.register("t.err", { id: "good", order: 2, render: () => { ok = true; } });
  X.render("t.err", {}, {});
  console.error = orig;
  assert.equal(ok, true);
});

test("collect sammelt und glättet Ergebnisse", () => {
  X.register("t.col", { id: "1", collect: (q) => [{ label: q + "1" }] });
  X.register("t.col", { id: "2", collect: (q) => ({ label: q + "2" }) });
  X.register("t.col", { id: "3", collect: () => null });
  assert.deepEqual(X.collect("t.col", "q").map((c) => c.label), ["q1", "q2"]);
});

test("when blendet Erweiterungen bedingt aus", () => {
  let drawn = 0;
  X.register("t.when", { id: "w", when: (ctx) => ctx.show, render: () => { drawn++; } });
  X.render("t.when", {}, { show: false });
  X.render("t.when", {}, { show: true });
  assert.equal(drawn, 1);
});
