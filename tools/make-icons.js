#!/usr/bin/env node
/* ==========================================================================
   ZEITKONTO — Icon-Generator
   --------------------------------------------------------------------------
   Erzeugt alle PNG-Icons aus der Vier-Ringe-Marke. Bewusst ohne
   Fremdbibliotheken: gerastert wird von Hand (4-fach überabgetastet),
   kodiert wird mit dem in Node eingebauten zlib.

       node tools/make-icons.js
   ========================================================================== */
"use strict";

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const OUT_DIR = path.join(__dirname, "..", "assets", "icons");

/* ---- Farben ---------------------------------------------------------- */
const INK = [246, 244, 242, 255];      // helle Ringe
const BG = [109, 101, 94, 255];        // Marken-Taupe, dunkle Stufe
const BG_LIGHT = [246, 244, 242, 255]; // heller Grund für maskierbare Variante
const INK_DARK = [109, 101, 94, 255];

/* ====================================================================== */
/* PNG-Kodierung                                                           */
/* ====================================================================== */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // Bittiefe
  ihdr[9] = 6;   // Farbtyp RGBA
  ihdr[10] = 0;  // Kompression
  ihdr[11] = 0;  // Filter
  ihdr[12] = 0;  // kein Interlace

  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0; // Filtertyp „None“
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

/* ====================================================================== */
/* Rasterung                                                               */
/* ====================================================================== */

const SS = 4; // Überabtastung pro Achse

function blend(dst, offset, color, alpha) {
  if (alpha <= 0) return;
  const a = Math.min(1, alpha);
  for (let c = 0; c < 3; c++) {
    dst[offset + c] = Math.round(dst[offset + c] * (1 - a) + color[c] * a);
  }
  dst[offset + 3] = Math.round(Math.min(255, dst[offset + 3] + 255 * a));
}

/**
 * Zeichnet die Marke: abgerundetes Quadrat + vier Ringe (unten rechts gefüllt).
 * @param {number} size      Kantenlänge in Pixel
 * @param {object} opts      { bg, ink, padding (0..0.5), radius (0..0.5), transparent }
 */
function renderMark(size, opts) {
  const bg = opts.bg || BG;
  const ink = opts.ink || INK;
  const pad = opts.padding === undefined ? 0.17 : opts.padding;
  const cornerR = (opts.radius === undefined ? 0.22 : opts.radius) * size;

  const px = Buffer.alloc(size * size * 4, 0);

  // Geometrie der vier Ringe (relativ zur Kantenlänge)
  const inner = size * (1 - 2 * pad);
  const gap = inner * 0.10;
  const d = (inner - gap) / 2;            // Durchmesser eines Rings
  const r = d / 2;
  const stroke = d * 0.235;
  const originX = size * pad + r;
  const originY = size * pad + r;
  const step = d + gap;

  const centers = [
    { x: originX, y: originY, filled: false },
    { x: originX + step, y: originY, filled: false },
    { x: originX, y: originY + step, filled: false },
    { x: originX + step, y: originY + step, filled: true }
  ];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let bgHits = 0;
      let inkHits = 0;

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px0 = x + (sx + 0.5) / SS;
          const py0 = y + (sy + 0.5) / SS;

          if (!opts.transparent && insideRoundedRect(px0, py0, size, cornerR)) bgHits++;

          for (let i = 0; i < centers.length; i++) {
            const c = centers[i];
            const dist = Math.hypot(px0 - c.x, py0 - c.y);
            const hit = c.filled
              ? dist <= r - stroke * 0.08
              : Math.abs(dist - (r - stroke / 2)) <= stroke / 2;
            if (hit) { inkHits++; break; }
          }
        }
      }

      const total = SS * SS;
      const offset = (y * size + x) * 4;
      if (bgHits > 0) blend(px, offset, bg, bgHits / total);
      if (inkHits > 0) blend(px, offset, ink, inkHits / total);
    }
  }

  return px;
}

function insideRoundedRect(x, y, size, r) {
  if (x < 0 || y < 0 || x > size || y > size) return false;
  const cx = Math.min(Math.max(x, r), size - r);
  const cy = Math.min(Math.max(y, r), size - r);
  return Math.hypot(x - cx, y - cy) <= r;
}

/* ====================================================================== */
/* SVG-Variante (scharf in jeder Grösse)                                   */
/* ====================================================================== */

function renderSVG(opts) {
  opts = opts || {};
  const bg = opts.bg || "#6D655E";
  const ink = opts.ink || "#F6F4F2";
  const pad = 17;
  const inner = 100 - 2 * pad;
  const gap = inner * 0.10;
  const d = (inner - gap) / 2;
  const r = d / 2;
  const stroke = d * 0.235;
  const o = pad + r;
  const step = d + gap;

  const circle = (cx, cy, filled) => filled
    ? `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${(r - stroke * 0.08).toFixed(2)}" fill="${ink}"/>`
    : `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${(r - stroke / 2).toFixed(2)}" fill="none" stroke="${ink}" stroke-width="${stroke.toFixed(2)}"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100" role="img" aria-label="Zeitkonto">
  <title>Zeitkonto</title>
  ${opts.transparent ? "" : `<rect width="100" height="100" rx="22" fill="${bg}"/>`}
  ${circle(o, o, false)}
  ${circle(o + step, o, false)}
  ${circle(o, o + step, false)}
  ${circle(o + step, o + step, true)}
</svg>
`;
}

/* ====================================================================== */
/* Ausgabe                                                                 */
/* ====================================================================== */

function write(name, buffer) {
  const target = path.join(OUT_DIR, name);
  fs.writeFileSync(target, buffer);
  const kb = (buffer.length / 1024).toFixed(1);
  console.log(`  ✓ ${name.padEnd(26)} ${kb.padStart(7)} KB`);
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log("Zeitkonto · Icons werden erzeugt");

  write("icon.svg", Buffer.from(renderSVG(), "utf8"));
  write("icon-mono.svg", Buffer.from(renderSVG({ transparent: true, ink: "#857C74" }), "utf8"));

  [
    ["icon-192.png", 192, { padding: 0.17 }],
    ["icon-512.png", 512, { padding: 0.17 }],
    ["apple-touch-icon.png", 180, { padding: 0.19, radius: 0 }],
    ["favicon-32.png", 32, { padding: 0.12, radius: 0.2 }],
    // Maskierbare Variante: Motiv innerhalb der 80-%-Sicherheitszone
    ["maskable-512.png", 512, { padding: 0.27, radius: 0.5 }]
  ].forEach(([name, size, opts]) => {
    write(name, encodePNG(size, size, renderMark(size, opts)));
  });

  // Helle Variante für Kontexte mit dunklem Hintergrund
  write("icon-light-512.png", encodePNG(512, 512, renderMark(512, { bg: BG_LIGHT, ink: INK_DARK, padding: 0.17 })));

  console.log("Fertig.");
}

if (require.main === module) main();

module.exports = { encodePNG, renderMark, renderSVG };
