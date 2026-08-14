#!/usr/bin/env node
/* ==========================================================================
   ZEITKONTO — Einzeldatei-Bau
   --------------------------------------------------------------------------
   Packt CSS, JavaScript und Icons in eine einzige HTML-Datei. Das Ergebnis
   lässt sich per Doppelklick öffnen, auf einen USB-Stick legen oder per
   Mail verschicken — kein Server, keine Installation, kein Internet.

       node tools/build-single-file.js

   Ergebnis: dist/zeitkonto.html
   ========================================================================== */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const SOURCE = path.join(ROOT, "index.html");
const TARGET = path.join(DIST, "zeitkonto.html");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function readBase64(rel) {
  return fs.readFileSync(path.join(ROOT, rel)).toString("base64");
}

/** Verhindert, dass ein </script> im Quelltext das umgebende Tag beendet. */
function guardScript(code) {
  return code.replace(/<\/script/gi, "<\\/script");
}

function build() {
  let html = read("index.html");
  const version = /CACHE_VERSION\s*=\s*"([^"]+)"/.exec(read("sw.js"));

  const cssFiles = [];
  const jsFiles = [];

  /* ---- Stylesheets einbetten ---------------------------------------- */
  html = html.replace(/[ \t]*<link rel="stylesheet" href="([^"]+)"[^>]*>\n?/g, (_, href) => {
    cssFiles.push(href);
    return "";
  });

  /* ---- Skripte einbetten -------------------------------------------- */
  html = html.replace(/[ \t]*<script src="([^"]+)"><\/script>\n?/g, (_, src) => {
    jsFiles.push(src);
    return "";
  });

  const css = cssFiles
    .map((f) => `/* ===== ${f} ===== */\n${read(f)}`)
    .join("\n\n");

  const js = jsFiles
    .map((f) => `/* ===== ${f} ===== */\n${guardScript(read(f))}`)
    .join("\n;\n");

  /* ---- Externe Verweise ersetzen ------------------------------------- */
  const iconSvg = read("assets/icons/icon.svg");
  const iconData = "data:image/svg+xml;base64," + Buffer.from(iconSvg, "utf8").toString("base64");
  const appleIcon = "data:image/png;base64," + readBase64("assets/icons/apple-touch-icon.png");

  html = html
    // Manifest und Serviceworker ergeben in einer Einzeldatei keinen Sinn
    .replace(/[ \t]*<link rel="manifest"[^>]*>\n?/g, "")
    .replace(/href="assets\/icons\/icon\.svg"/g, `href="${iconData}"`)
    .replace(/href="assets\/icons\/apple-touch-icon\.png"/g, `href="${appleIcon}"`)
    .replace(
      /<title>[^<]*<\/title>/,
      "<title>Zeitkonto · Arbeitszeitrechner (Einzeldatei)</title>"
    );

  /* ---- Zusammensetzen ------------------------------------------------ */
  const banner =
    "<!--\n" +
    "  ZEITKONTO — Einzeldatei-Fassung\n" +
    "  Erzeugt aus dem Quellverzeichnis mit tools/build-single-file.js\n" +
    (version ? "  Version: " + version[1] + "\n" : "") +
    "  Diese Datei ist vollständig eigenständig: einfach im Browser öffnen.\n" +
    "  Alle Daten bleiben im lokalen Speicher dieses Browsers.\n" +
    "-->\n";

  html = html.replace("</head>", `  <style>\n${css}\n  </style>\n</head>`);
  html = html.replace(
    "</body>",
    `  <script>\nwindow.ZK_SINGLE_FILE = true;\n${js}\n  </script>\n</body>`
  );
  html = banner + html;

  fs.mkdirSync(DIST, { recursive: true });
  fs.writeFileSync(TARGET, html, "utf8");

  const kb = (Buffer.byteLength(html, "utf8") / 1024).toFixed(0);
  console.log("Zeitkonto · Einzeldatei erstellt");
  console.log(`  ${cssFiles.length} Stylesheets, ${jsFiles.length} Skripte eingebettet`);
  console.log(`  → dist/zeitkonto.html  (${kb} KB)`);

  /* ---- Absicherung: nichts Externes darf übrig bleiben ---------------- */
  const leftovers = [];
  if (/<link rel="stylesheet"/.test(html)) leftovers.push("nicht eingebettetes Stylesheet");
  if (/<script src=/.test(html)) leftovers.push("nicht eingebettetes Skript");
  if (/(src|href)="(?!data:|#)[^"]*\.(png|svg|js|css|webmanifest)"/.test(html)) {
    leftovers.push("externer Dateiverweis");
  }
  if (leftovers.length) {
    console.error("  ⚠ " + leftovers.join(", "));
    process.exitCode = 1;
  } else {
    console.log("  ✓ keine externen Abhängigkeiten");
  }
}

if (require.main === module) build();
module.exports = { build };
