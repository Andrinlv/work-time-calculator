"use strict";
/* Kontrast der Design-Tokens (WCAG 2.2 AA) in hell, dunkel und beiden
   Kontrast-Modi. Liest assets/css/tokens.css, baut die Kaskade nach
   (:root → hell → dunkel → Kontrast-Modus) und rechnet halbtransparente
   Flächen auf ihren Untergrund. Prüft die Paare, die in der Oberfläche
   tatsächlich vorkommen — nicht jede denkbare Kombination.

   Tabelle ausgeben:  CONTRAST_TABLE=1 node tests/contrast.test.js       */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const css = fs.readFileSync(process.env.TOKENS_CSS || path.join(__dirname, "../assets/css/tokens.css"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "");

/* ---- Kaskade nachbauen ------------------------------------------------ */
const blocks = {};
css.replace(/([^{}]+)\{([^{}]*)\}/g, (m, sel, body) => {
  const key = sel.replace(/\s+/g, " ").trim();
  const decl = blocks[key] = blocks[key] || {};
  body.replace(/(--[\w-]+)\s*:\s*([^;]+);/g, (d, name, val) => { decl[name] = val.trim(); });
});
const pick = (sel) => {
  assert.ok(blocks[sel], "Block fehlt in tokens.css: " + sel);
  return blocks[sel];
};
const light = Object.assign({}, pick(":root"), pick(':root, [data-theme="light"]'));
const dark = Object.assign({}, light, pick('[data-theme="dark"]'));
const THEMES = {
  hell: light,
  dunkel: dark,
  "hell+Kontrast": Object.assign({}, light, pick('[data-contrast="high"]:not([data-theme="dark"])')),
  "dunkel+Kontrast": Object.assign({}, dark, pick('[data-theme="dark"][data-contrast="high"]'))
};

/* ---- Farbrechnung ------------------------------------------------------ */
function resolve(theme, value, depth) {
  if ((depth || 0) > 10) throw new Error("Zirkelbezug: " + value);
  const m = /^var\((--[\w-]+)\s*(?:,\s*(.+))?\)$/.exec(value.trim());
  if (!m) return value.trim();
  const v = theme[m[1]];
  if (v === undefined) {
    if (m[2]) return resolve(theme, m[2], (depth || 0) + 1);
    throw new Error("Unbekanntes Token: " + m[1]);
  }
  return resolve(theme, v, (depth || 0) + 1);
}
function parseColor(s) {
  s = s.trim();
  let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (m) {
    let h = m[1];
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 };
  }
  m = /^rgba?\(([^)]+)\)$/.exec(s);
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] };
  }
  throw new Error("Farbe nicht lesbar: " + s);
}
const over = (top, under) => ({
  r: top.r * top.a + under.r * (1 - top.a),
  g: top.g * top.a + under.g * (1 - top.a),
  b: top.b * top.a + under.b * (1 - top.a),
  a: 1
});
function luminance(c) {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}
function ratio(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
/* "plus-soft/bg" = plus-soft über bg; "plus*0.2/surface" = plus mit 20 %
   Deckkraft (wie color-mix(… 20%, transparent)); "#FFFFFF" = fester Wert */
function color(theme, spec) {
  const layers = spec.split("/").map((part) => {
    const m = /^([#\w-]+)(?:\*([\d.]+))?$/.exec(part.trim());
    const c = parseColor(m[1][0] === "#" ? m[1] : resolve(theme, "var(--" + m[1] + ")"));
    if (m[2]) c.a *= Number(m[2]);
    return c;
  });
  return layers.reduceRight((under, top) => (under ? over(top, under) : top), null);
}

/* ---- Paare aus der Oberfläche -------------------------------------------- */
const TEXT = 4.5, UI = 3;
const TONES = ["plus", "minus", "warn", "info"];
const TYPES = ["vacation", "holiday", "sick", "accident", "comp", "military", "training", "unpaid", "free"];
// Flächen, auf denen Text steht (Tönungen = KPI-Kopf, Saldo-Pille, Hinweise)
const SURFACES = ["bg", "surface", "surface-2", "surface-3", "surface-inset", "accent-soft/surface"];
const TINTS = TONES.map((t) => t + "-soft/bg");

const PAIRS = [];
const add = (what, fg, bgs, min) => bgs.forEach((bg) => PAIRS.push({ what, fg, bg, min }));

add("Tinte", "ink", SURFACES.concat(TINTS), TEXT);
add("Tinte 2", "ink-2", SURFACES.concat(TINTS), TEXT);
add("gedämpfte Tinte", "ink-3", SURFACES.concat(TINTS), TEXT);
TONES.forEach((t) => {
  add("Funktionsschrift " + t, t + "-ink",
    ["bg", "surface", "surface-2", "surface-3", "accent-soft/surface", t + "-soft/bg", t + "-soft/surface", t + "*0.2/surface"], TEXT);
});
["plus", "minus", "warn"].forEach((t) => {
  add("Beschriftung gefüllt " + t, "on-tone", [t + "-solid"], TEXT);
  add("Toast-Aktion " + t, "on-tone", ["surface-invert*0.22/" + t + "-solid", "surface-invert*0.34/" + t + "-solid"], TEXT);
});
add("Primärtaste", "ink-invert", ["surface-invert", "surface-invert-hover"], TEXT);
add("Textauswahl", "#FFFFFF", ["brand-600"], TEXT);
TYPES.forEach((t) => add("Tagesart als Schrift " + t, "type-" + t, ["surface", "surface-2", "accent-soft/surface"], TEXT));

add("Kontur Eingabefeld/Schalter/Segment", "line-input", ["surface", "surface-2", "surface-3"], UI);
add("Fokuskontur", "accent", ["bg", "surface", "surface-2", "surface-3"], UI);
add("Schalter aus: Knopf auf Schiene", "ink-3", ["surface-inset"], UI);
add("Schalter ein: Schiene", "switch-on", ["surface", "surface-2"], UI);
add("Schalter ein: Knopf", "#FFFFFF", ["switch-on"], UI);
TONES.forEach((t) => add("Funktionsfläche " + t, t, ["surface", "surface-2"], UI));
add("Diagramm Plus", "chart-plus", ["surface"], UI);
add("Diagramm Minus", "chart-minus", ["surface"], UI);

function measure(themeName) {
  const theme = THEMES[themeName];
  return PAIRS.map((p) => Object.assign({ theme: themeName, ratio: ratio(color(theme, p.fg), color(theme, p.bg)) }, p));
}

for (const name of Object.keys(THEMES)) {
  test("Kontrast-Tokens erfüllen WCAG AA: " + name, () => {
    const fails = measure(name).filter((r) => r.ratio < r.min)
      .map((r) => r.what + ": " + r.fg + " auf " + r.bg + " = " + r.ratio.toFixed(2) + " < " + r.min);
    assert.deepEqual(fails, []);
  });
}

test("Kontrast-Modus hebt Schrift, Konturen und Flächen tatsächlich an", () => {
  const raised = ["ink", "ink-2", "ink-3", "line-input", "accent"]
    .concat(TONES.map((t) => t + "-ink"), TONES);
  for (const [base, hc] of [["hell", "hell+Kontrast"], ["dunkel", "dunkel+Kontrast"]]) {
    for (const tok of raised) {
      const before = ratio(color(THEMES[base], tok), color(THEMES[base], "surface"));
      const after = ratio(color(THEMES[hc], tok), color(THEMES[hc], "surface"));
      assert.ok(after > before + 0.2, hc + ": --" + tok + " nicht angehoben (" + before.toFixed(2) + " → " + after.toFixed(2) + ")");
    }
    for (const t of ["plus", "minus", "warn"]) {
      const before = ratio(color(THEMES[base], "on-tone"), color(THEMES[base], t + "-solid"));
      const after = ratio(color(THEMES[hc], "on-tone"), color(THEMES[hc], t + "-solid"));
      assert.ok(after > before, hc + ": gefüllte Taste " + t + " nicht angehoben");
    }
  }
});

test("Kontrast-Modus: Schrift-Tokens erreichen 7:1 (AAA) auf den Grundflächen", () => {
  for (const name of ["hell+Kontrast", "dunkel+Kontrast"]) {
    for (const tok of ["ink", "ink-2", "ink-3"].concat(TONES.map((t) => t + "-ink"))) {
      for (const bg of ["bg", "surface", "surface-2"]) {
        const r = ratio(color(THEMES[name], tok), color(THEMES[name], bg));
        assert.ok(r >= 7, name + ": --" + tok + " auf " + bg + " nur " + r.toFixed(2));
      }
    }
  }
});

test("Kontrast-Modus ist für hell und dunkel gleich vollständig", () => {
  const hcLight = pick('[data-contrast="high"]:not([data-theme="dark"])');
  const hcDark = pick('[data-theme="dark"][data-contrast="high"]');
  // Was der helle Kontrast-Modus anhebt, muss der dunkle ebenfalls setzen —
  // sonst bliebe im Dunkeln der normale (schwächere) Wert stehen.
  // Ausnahme: die Schalter-Schiene bleibt im Dunkeln beim Logo-Ton, weil
  // der weisse Knopf darauf schon 4:1 hat.
  for (const tok of Object.keys(hcLight)) {
    if (tok === "--switch-on") continue;
    assert.ok(tok in hcDark, tok + " fehlt im dunklen Kontrast-Modus");
  }
});

if (process.env.CONTRAST_TABLE) {
  const rows = Object.keys(THEMES).flatMap(measure);
  const w = Math.max(...rows.map((r) => (r.fg + " / " + r.bg).length));
  let last = "";
  for (const r of rows) {
    if (r.theme !== last) { console.log("\n== " + r.theme + " =="); last = r.theme; }
    console.log((r.fg + " / " + r.bg).padEnd(w + 2) + r.ratio.toFixed(2).padStart(6) + "  " +
      (r.ratio >= r.min ? "ok " : "FEHLT ") + "(min " + r.min + ")  " + r.what);
  }
}
