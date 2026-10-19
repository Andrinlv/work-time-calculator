"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

/* Stylesheets ohne Bundler: Eine verlorene Klammer lässt alles Folgende
   still in einen fremden Block rutschen (z. B. nur noch beim Drucken).
   Deshalb prüfen wir die Klammertiefe — und dass jeder Abschnittskopf
   wieder auf oberster Ebene beginnt. */

function scan(css) {
  const problems = [];
  let depth = 0, line = 1, inComment = false, quote = null;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === "\n") line++;
    if (inComment) {
      if (c === "*" && css[i + 1] === "/") { inComment = false; i++; }
      continue;
    }
    if (quote) { if (c === quote && css[i - 1] !== "\\") quote = null; continue; }
    if (c === "/" && css[i + 1] === "*") {
      if (/^\/\*\s*={4,}/.test(css.slice(i, i + 12)) && depth !== 0) problems.push("Abschnitt in Zeile " + line + " beginnt auf Tiefe " + depth);
      inComment = true; i++; continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth < 0) { problems.push("überzählige } in Zeile " + line); depth = 0; } }
  }
  if (inComment) problems.push("offener Kommentar am Dateiende");
  if (depth !== 0) problems.push("Endtiefe " + depth);
  return problems;
}

const dir = path.join(__dirname, "..", "assets", "css");
fs.readdirSync(dir).filter((f) => f.endsWith(".css")).forEach((file) => {
  test("CSS-Klammern sind ausgeglichen: " + file, () => {
    assert.deepEqual(scan(fs.readFileSync(path.join(dir, file), "utf8")), []);
  });
});

test("Der Prüfer erkennt eine verlorene Klammer", () => {
  const broken = "@media print {\n  .a { color: red; }\n/* ===== FEATURE: x ===== */\n.b { color: blue; }\n";
  assert.ok(scan(broken).length > 0);
});
