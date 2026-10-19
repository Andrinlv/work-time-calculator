"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");

const Q = require("../assets/js/core/qr.js");

/* QR-Kodierer: Bausteine gegen veröffentlichte Werte, ganze Symbole gegen
   unabhängige Kodierer, und ein eigener kleiner Leser, der jedes Symbol
   zurückliest (Format, Maske, Zickzack, Blöcke, Reed-Solomon-Syndrome). */

/* ---------------------------------------------------------------------- */
/* Referenzsymbole                                                         */
/* ---------------------------------------------------------------------- */
/* Erzeugt mit zwei unabhängigen Kodierern im Byte-Modus: Nayukis
   „QR Code generator library“ (1.8.0, automatische Maske, ohne ECC-Anhebung)
   für die ersten drei, npm qrcode 1.5.4 (Maske fest) für das vierte.
   „#“ = dunkles Modul, ohne Ruhezone. */
const REF = {
  zeitkonto: { version: 1, mask: 2, rows: [
    "#######..#.##.#######",
    "#.....#..##...#.....#",
    "#.###.#.#####.#.###.#",
    "#.###.#.#.#...#.###.#",
    "#.###.#.#...#.#.###.#",
    "#.....#.#..#..#.....#",
    "#######.#.#.#.#######",
    "........#.#..........",
    "#.#####....#..#####..",
    "##.#.#.#...###..###.#",
    "..######.##.#....###.",
    "...###.#.#.###.####.#",
    ".#...##.###.#.#.#...#",
    "........###.#####..#.",
    "#######..###.##..###.",
    "#.....#.##......####.",
    "#.###.#.#..#....##..#",
    "#.###.#.##.########..",
    "#.###.#.#...#.#...#..",
    "#.....#...#####.###..",
    "#######.#...#..##..#.",
  ] },
  stamp: { version: 3, mask: 3, rows: [
    "#######.#...#..##..##.#######",
    "#.....#.##.#..##.#....#.....#",
    "#.###.#.....####...##.#.###.#",
    "#.###.#.##.#....##.#..#.###.#",
    "#.###.#...#..#.....#..#.###.#",
    "#.....#...#...#...###.#.....#",
    "#######.#.#.#.#.#.#.#.#######",
    "........#.#####..#..#........",
    "#.##.###.#.#.##.####..#..#.##",
    "...##..###..#..##.#######...#",
    ".#..###.#...#.##.##.#.##..##.",
    "#.##.#..#.#.####..##.#.#....#",
    "..#.#.#..#..#....####..#.##..",
    "##...#...##.##.....#..#...###",
    ".####.#..#..#.#.######.#..###",
    ".#####...#####.#....#.#....#.",
    ".#.####....#....#...##.###.#.",
    ".....#.#...#.#.#....#..#.###.",
    "#.##.###.#.....####...###.#..",
    "..#....####.#...####..#...#..",
    ".######..#.#.#.###..#######..",
    "........#.##.##.###.#...#####",
    "#######.##...#..#.###.#.##.#.",
    "#.....#.##..#...#.###...##.##",
    "#.###.#..####.##.#..#####.##.",
    "#.###.#.####..######.#.###..#",
    "#.###.#.#...###.##..##.#..#.#",
    "#.....#..###..###...#....#.#.",
    "#######.##.#..#.#.###..###.#.",
  ] },
  v7: { version: 7, mask: 2, rows: [
    "#######..##.#.##.....##..#...##.#...#.#######",
    "#.....#....#.#..#.#....##.#....###.#..#.....#",
    "#.###.#.#.#..###.##.#..#.####...##.#..#.###.#",
    "#.###.#.##.#.##..#######..#....#...##.#.###.#",
    "#.###.#.##.##.#.##.########.###.#.###.#.###.#",
    "#.....#.#.##.##...#.#...#...#....#....#.....#",
    "#######.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#######",
    "........##...#.#.####...#####.#.###.#........",
    "#.#####....##.#...#######....###...#..#####..",
    "....##..#..##.#.######..##...###...##...#####",
    ".#...##.##..#....##..#.#..#....#.#######.###.",
    "#......#.#...#...####....###.#####.#...####..",
    ".###.###..#....####.####..##.###.......#.#..#",
    "##..#..###.#.###.#.###.#.#.#..###..###.#.#.##",
    ".#...##..#....#.##..#..####....##.##..#..###.",
    "#.####..#.#.#..#...#.#.########.##.#....#####",
    "#.#...#.###.#..######..#.....###.#...##......",
    "######..#.#.####....#....#...###.#.###..#.#.#",
    "..#..####..##..#.#####.##.#..#...###.##.#.##.",
    "..####.##.#...###.##...#...####.#..#.##.###..",
    "#...#######..###..########...###.#.######..#.",
    ".####...#..###......#...#...#####..##...###.#",
    "#...#.#.###...#.##.##.#.##.##..######.#.#.##.",
    "....#...####....#...#...#####...#.#.#...###.#",
    "#########.#..###.#..#####....#.#.#########.##",
    "..##.....#####....######.#.##.#.#...##......#",
    "..##..#..#...##.###...#...##.#....#.##....##.",
    ".#...#.##.#..####.##.#####..##..##.#..#.#####",
    ".##.####.....#....#.#..#.....##..#....#.#..##",
    ".......#####..####...###.#..#####...#.#..#.##",
    "#.....#.#.#####.#.#.#.###.##......#.#..#..##.",
    ".####...#...#.....#..#..###.###.#.###.##..##.",
    "#.##..#######....#.....##.....##..#..####..##",
    "..##.#.#....#.###.#####.##....#.#..........##",
    "....#.###......##.#.#.##..##.....##.##.#####.",
    ".####..######.##..#..##.#####...#..##.#.###..",
    "#..##.##.###......#.#####.#..###....#####...#",
    "........###.#.....#.#...####.##.#..##...###.#",
    "#######....#.##..#.##.#.#....#....###.#.#.#..",
    "#.....#.##..######.##...##.###.##..##...###..",
    "#.###.#.#..#..#.##..#####.#..#.#.#.#######...",
    "#.###.#.###...#.#.....####.####.#....#.##.#.#",
    "#.###.#.##.#####.###.#.##.#.##....###..#.###.",
    "#.....#....#..#..####....##.##.###.#.#..###..",
    "#######.###...##...#..#.###..#.#.#.##.##...#.",
  ] },
  pauseH: { version: 3, mask: 5, rows: [
    "#######.#...#.####.##.#######",
    "#.....#..#.#.#.#.#..#.#.....#",
    "#.###.#.#..####.#.....#.###.#",
    "#.###.#....####..#..#.#.###.#",
    "#.###.#.##...##.##..#.#.###.#",
    "#.....#....#...#.#....#.....#",
    "#######.#.#.#.#.#.#.#.#######",
    "........##...###.##..........",
    ".....##.......#.......#.#.#.#",
    "###....#.#..###..##...##.#...",
    ".##.######..#..#####.#.......",
    ".#...#..####...#...##..#.#...",
    "##.##.##.#......#...#..#.#.##",
    "##.##...###.#..##.##..#.#..##",
    "##.#.##...##..#...#.##.###.##",
    ".##....#########.#...#######.",
    "...##.##.#...#.#.##.##..####.",
    "##.........#####.##..#..##.#.",
    "##..#.#####.#..#.###.##.#.#.#",
    "#.#.##......#...#.....#..#.#.",
    "#.##.##.#.##.#.###..########.",
    "........#.#...##.#.##...###.#",
    "#######..###.#....#.#.#.##..#",
    "#.....#.##...#.#..#.#...##..#",
    "#.###.#..#...##...#.#####..##",
    "#.###.#...#.....##....#...##.",
    "#.###.#...##..##.##.#..##.##.",
    "#.....#..#.#.####.#.##.#.##.#",
    "#######...##...#..#####.#.#..",
  ] },
};
const REF_INPUT = {
  zeitkonto: ["Zeitkonto", { ecl: "M" }],
  stamp: ["https://zeitkonto.example/#/stamp", { ecl: "M" }],
  v7: ["https://intranet.bellfoodgroup.example/apps/zeitkonto/index.html#/stamp/break?quelle=plakat-spind-garderobe-ost", { ecl: "M", minVersion: 7 }],
  pauseH: ["Pause ☕ Grüezi", { ecl: "H", mask: 5 }]
};

function rows(qr) {
  return qr.modules.map((r) => r.map((d) => (d ? "#" : ".")).join(""));
}

for (const key of Object.keys(REF)) {
  test("Referenzsymbol „" + key + "“ stimmt Modul für Modul", () => {
    const [text, opts] = REF_INPUT[key];
    const qr = Q.encode(text, opts);
    assert.equal(qr.version, REF[key].version, "Version");
    assert.equal(qr.mask, REF[key].mask, "Maske");
    assert.deepEqual(rows(qr), REF[key].rows);
  });
}

/* ---------------------------------------------------------------------- */
/* Bausteine                                                               */
/* ---------------------------------------------------------------------- */

test("UTF-8 wie Node: Umlaute, Akzente, Emoji (Ersatzpaare), einzelne Halbzeichen", () => {
  for (const s of ["", "abc", "Grüezi", "Äöü ß éèà ç", "€ ☕ 日本", "🕐 Pause 👍🏽", "#/stamp/break?x=1&y=ä"]) {
    assert.deepEqual(Q.utf8(s), Array.from(Buffer.from(s, "utf8")), s);
  }
  assert.deepEqual(Q.utf8("a\uD800b"), [0x61, 0xEF, 0xBF, 0xBD, 0x62], "einzelnes Ersatzzeichen-Halb → U+FFFD");
});

test("GF(256): Multiplikation mit Polynom 0x11D, α^8 = 0x1D", () => {
  let a = 1;
  for (let i = 0; i < 8; i++) a = Q._gfMul(a, 2);
  assert.equal(a, 0x1D);
  assert.equal(Q._gfMul(0, 0x53), 0);
  assert.equal(Q._gfMul(1, 0x53), 0x53);
  assert.equal(Q._gfMul(0x53, 0xCA), Q._gfMul(0xCA, 0x53));
});

test("Reed-Solomon: Tutorial-Beispiel „HELLO WORLD“ 1-M ergibt die bekannten 10 Korrektur-Codewörter", () => {
  const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
  assert.deepEqual(Q._rsRemainder(data, Q._rsDivisor(10)), [196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
});

test("Formatinformation: alle 32 Kombinationen wie in der Norm (Anhang C)", () => {
  const TABLE = {
    L: ["111011111000100", "111001011110011", "111110110101010", "111100010011101", "110011000101111", "110001100011000", "110110001000001", "110100101110110"],
    M: ["101010000010010", "101000100100101", "101111001111100", "101101101001011", "100010111111001", "100000011001110", "100111110010111", "100101010100000"],
    Q: ["011010101011111", "011000001101000", "011111100110001", "011101000000110", "010010010110100", "010000110000011", "010111011011010", "010101111101101"],
    H: ["001011010001001", "001001110111110", "001110011100111", "001100111010000", "000011101100010", "000001001010101", "000110100001100", "000100000111011"]
  };
  const all = [];
  for (const ecl of Q.LEVELS) {
    for (let mask = 0; mask < 8; mask++) {
      const bits = Q.formatBits(ecl, mask);
      assert.equal(bits.toString(2).padStart(15, "0"), TABLE[ecl][mask], ecl + mask);
      all.push(bits);
    }
  }
  // BCH(15,5): je zwei Codes unterscheiden sich in mindestens 7 Bits
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      let d = all[i] ^ all[j], n = 0;
      while (d) { n += d & 1; d >>>= 1; }
      assert.ok(n >= 7, "Abstand " + i + "/" + j);
    }
  }
});

test("Versionsinformation 7–40 wie in der Norm (Anhang D)", () => {
  const TABLE = [0x07C94, 0x085BC, 0x09A99, 0x0A4D3, 0x0BBF6, 0x0C762, 0x0D847, 0x0E60D, 0x0F928, 0x10B78,
    0x1145D, 0x12A17, 0x13532, 0x149A6, 0x15683, 0x168C9, 0x177EC, 0x18EC4, 0x191E1, 0x1AFAB, 0x1B08E,
    0x1CC1A, 0x1D33F, 0x1ED75, 0x1F250, 0x209D5, 0x216F0, 0x228BA, 0x2379F, 0x24B0B, 0x2542E, 0x26A64,
    0x27541, 0x28C69];
  for (let v = 7; v <= 40; v++) assert.equal(Q.versionBits(v), TABLE[v - 7], "Version " + v);
});

test("Ausrichtungsmuster an den Positionen der Norm (Anhang E)", () => {
  assert.deepEqual(Q.alignmentPositions(1), []);
  assert.deepEqual(Q.alignmentPositions(2), [6, 18]);
  assert.deepEqual(Q.alignmentPositions(6), [6, 34]);
  assert.deepEqual(Q.alignmentPositions(7), [6, 22, 38]);
  assert.deepEqual(Q.alignmentPositions(10), [6, 28, 50]);
  assert.deepEqual(Q.alignmentPositions(14), [6, 26, 46, 66]);
  assert.deepEqual(Q.alignmentPositions(23), [6, 30, 54, 78, 102]);
  assert.deepEqual(Q.alignmentPositions(32), [6, 34, 60, 86, 112, 138], "Sonderfall Abstand 26");
  assert.deepEqual(Q.alignmentPositions(36), [6, 24, 50, 76, 102, 128, 154]);
  assert.deepEqual(Q.alignmentPositions(40), [6, 30, 58, 86, 114, 142, 170]);
});

test("Kapazität im Byte-Modus wie in der Norm (Tabelle 7)", () => {
  const TABLE = { 1: [17, 14, 11, 7], 2: [32, 26, 20, 14], 5: [106, 84, 60, 44], 7: [154, 122, 86, 64],
    10: [271, 213, 151, 119], 23: [1091, 857, 611, 461], 40: [2953, 2331, 1663, 1273] };
  for (const v of Object.keys(TABLE)) {
    Q.LEVELS.forEach((ecl, i) => assert.equal(Q.capacity(+v, ecl), TABLE[v][i], v + "-" + ecl));
  }
});

test("Kleinste passende Version: volle Kapazität bleibt, ein Byte mehr springt weiter", () => {
  for (let v = 1; v <= 40; v++) {
    for (const ecl of Q.LEVELS) {
      const cap = Q.capacity(v, ecl);
      assert.equal(Q.encode("x".repeat(cap), { ecl, mask: 0 }).version, v, v + "-" + ecl);
      if (v < 40) assert.equal(Q.encode("x".repeat(cap + 1), { ecl, mask: 0 }).version, v + 1, v + "-" + ecl + " +1");
    }
  }
  assert.throws(() => Q.encode("x".repeat(2954), { ecl: "L" }), RangeError);
  assert.throws(() => Q.encode("x".repeat(15), { ecl: "M", maxVersion: 1 }), RangeError);
});

test("Ungültige Optionen werden abgewiesen, Standard ist M", () => {
  assert.throws(() => Q.encode("a", { ecl: "X" }), RangeError);
  assert.throws(() => Q.encode("a", { mask: 8 }), RangeError);
  assert.throws(() => Q.encode("a", { minVersion: 41 }), RangeError);
  assert.equal(Q.encode("a").ecl, "M");
  assert.equal(Q.encode("a", { ecl: "q" }).ecl, "Q");
});

test("Bitstrom: Modus, Zähler, Abschluss und Füllbytes 0xEC/0x11", () => {
  // 1-M hat 16 Daten-Codewörter: 0100 | 00000001 | 01100001 | 0000 → 0x40 0x16 0x10, dann EC 11 EC …
  assert.deepEqual(Q._dataStream([0x61], 1, "M"), [0x40, 0x16, 0x10, 0xEC, 0x11, 0xEC, 0x11, 0xEC, 0x11, 0xEC, 0x11, 0xEC, 0x11, 0xEC, 0x11, 0xEC]);
  // ab Version 10 zählt der Byte-Modus mit 16 Bit
  const s = Q._dataStream([0x61], 10, "H");
  assert.deepEqual(s.slice(0, 4), [0x40, 0x00, 0x16, 0x10]);
});

/* ---------------------------------------------------------------------- */
/* Feste Muster                                                            */
/* ---------------------------------------------------------------------- */

const FINDER = ["#######", "#.....#", "#.###.#", "#.###.#", "#.###.#", "#.....#", "#######"];

function readFormat(m, copy) {
  const size = m.length;
  let bits = 0;
  const at = (i) => {
    if (copy === 1) {
      if (i <= 5) return m[i][8];
      if (i === 6) return m[7][8];
      if (i === 7) return m[8][8];
      if (i === 8) return m[8][7];
      return m[8][14 - i];
    }
    return i < 8 ? m[8][size - 1 - i] : m[size - 15 + i][8];
  };
  for (let i = 0; i < 15; i++) if (at(i)) bits |= 1 << i;
  return bits;
}

function checkStructure(qr, label) {
  const m = qr.modules, size = qr.size;
  assert.equal(size, qr.version * 4 + 17, label + " Grösse");
  assert.equal(m.length, size);
  m.forEach((r) => assert.equal(r.length, size));
  // Suchmuster mit Trennstreifen in drei Ecken
  for (const [ox, oy] of [[0, 0], [size - 7, 0], [0, size - 7]]) {
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < 7; x++) assert.equal(m[oy + y][ox + x], FINDER[y][x] === "#", label + " Suchmuster " + ox + "/" + oy);
    }
  }
  for (let i = 0; i < 8; i++) {
    assert.equal(m[7][i], false, label + " Trennstreifen");
    assert.equal(m[i][7], false);
    assert.equal(m[7][size - 1 - i], false);
    assert.equal(m[i][size - 8], false);
    assert.equal(m[size - 8][i], false);
    assert.equal(m[size - 1 - i][7], false);
  }
  // Taktlinien
  for (let i = 8; i < size - 8; i++) {
    assert.equal(m[6][i], i % 2 === 0, label + " Taktlinie waagrecht " + i);
    assert.equal(m[i][6], i % 2 === 0, label + " Taktlinie senkrecht " + i);
  }
  // Dunkles Modul
  assert.equal(m[size - 8][8], true, label + " dunkles Modul");
  // Ausrichtungsmuster
  const pos = Q.alignmentPositions(qr.version), n = pos.length;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          assert.equal(m[pos[j] + dy][pos[i] + dx], Math.max(Math.abs(dx), Math.abs(dy)) !== 1, label + " Ausrichtung " + pos[i] + "/" + pos[j]);
        }
      }
    }
  }
  // Formatinformation: beide Kopien gleich und passend zu Stufe und Maske
  const want = Q.formatBits(qr.ecl, qr.mask);
  assert.equal(readFormat(m, 1), want, label + " Format oben links");
  assert.equal(readFormat(m, 2), want, label + " Format zweite Kopie");
  // Versionsinformation ab 7: Block oben rechts (6 Zeilen × 3) und unten links (3 × 6)
  if (qr.version >= 7) {
    const vb = Q.versionBits(qr.version);
    for (let i = 0; i < 18; i++) {
      const bit = ((vb >>> i) & 1) === 1;
      assert.equal(m[Math.floor(i / 3)][size - 11 + i % 3], bit, label + " Version oben rechts " + i);
      assert.equal(m[size - 11 + i % 3][Math.floor(i / 3)], bit, label + " Version unten links " + i);
    }
  }
}

test("Feste Muster stimmen in allen Versionen 1–40, jeder Stufe und Maske", () => {
  for (let v = 1; v <= 40; v++) {
    for (const ecl of Q.LEVELS) {
      const mask = (v + ecl.charCodeAt(0)) % 8;
      checkStructure(Q.encode("Zeitkonto " + v, { ecl, mask, minVersion: v }), v + "-" + ecl + "/" + mask);
    }
  }
  for (let mask = 0; mask < 8; mask++) checkStructure(Q.encode("https://x.example/#/stamp", { mask }), "Maske " + mask);
});

/* ---------------------------------------------------------------------- */
/* Eigener Leser: liest Symbole der Versionen 1–10 vollständig zurück      */
/* ---------------------------------------------------------------------- */

// Blockstruktur der Norm (Tabelle 9) für 1–10: [Korrektur je Block, Blöcke]
const BLOCKS = {
  L: [[7, 1], [10, 1], [15, 1], [20, 1], [26, 1], [18, 2], [20, 2], [24, 2], [30, 2], [18, 4]],
  M: [[10, 1], [16, 1], [26, 1], [18, 2], [24, 2], [16, 4], [18, 4], [22, 4], [22, 5], [26, 5]],
  Q: [[13, 1], [22, 1], [18, 2], [26, 2], [18, 4], [24, 4], [18, 6], [22, 6], [20, 8], [24, 8]],
  H: [[17, 1], [28, 1], [22, 2], [16, 4], [22, 4], [28, 4], [26, 5], [26, 6], [24, 8], [28, 8]]
};
const EXP = [], LOG = [];
for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11D; }
const MASK_FN = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0
];

function readSymbol(m) {
  const size = m.length, version = (size - 17) / 4;
  // Stufe und Maske aus der Formatinformation
  const fmt = readFormat(m, 1);
  let ecl = null, mask = -1;
  for (const e of Q.LEVELS) for (let k = 0; k < 8; k++) if (Q.formatBits(e, k) === fmt) { ecl = e; mask = k; }
  assert.ok(ecl, "Formatinformation lesbar");
  // Reservierte Bereiche
  const res = Array.from({ length: size }, () => new Array(size).fill(false));
  const block = (x0, y0, w, h) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) res[y][x] = true; };
  block(0, 0, 9, 9); block(size - 8, 0, 8, 9); block(0, size - 8, 9, 8);
  block(6, 0, 1, size); block(0, 6, size, 1);
  const pos = Q.alignmentPositions(version), n = pos.length;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
    block(pos[i] - 2, pos[j] - 2, 5, 5);
  }
  if (version >= 7) { block(size - 11, 0, 3, 6); block(0, size - 11, 6, 3); }
  // Zickzack von unten rechts, Maske dabei entfernen
  const bits = [];
  let up = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (let k = 0; k < size; k++) {
      const y = up ? size - 1 - k : k;
      for (const x of [col, col - 1]) {
        if (res[y][x]) continue;
        bits.push(m[y][x] !== MASK_FN[mask](x, y) ? 1 : 0);
      }
    }
    up = !up;
  }
  const words = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) words.push(parseInt(bits.slice(i, i + 8).join(""), 2));
  // Blöcke entflechten
  const [eccLen, numBlocks] = BLOCKS[ecl][version - 1];
  const total = words.length;
  const shortLen = Math.floor(total / numBlocks), numShort = numBlocks - total % numBlocks;
  const blocks = Array.from({ length: numBlocks }, () => []);
  let p = 0;
  for (let i = 0; i < shortLen - eccLen + 1; i++) {
    for (let b = 0; b < numBlocks; b++) {
      if (i === shortLen - eccLen && b < numShort) continue;
      blocks[b].push(words[p++]);
    }
  }
  for (let i = 0; i < eccLen; i++) for (let b = 0; b < numBlocks; b++) blocks[b].push(words[p++]);
  assert.equal(p, total, "alle Codewörter verteilt");
  // Syndrome: das Codewort-Polynom hat α^0 … α^(ecc−1) als Nullstellen
  const data = [];
  blocks.forEach((cw, b) => {
    for (let i = 0; i < eccLen; i++) {
      let s = 0;
      for (const c of cw) s = (s === 0 ? 0 : EXP[(LOG[s] + i) % 255]) ^ c;
      assert.equal(s, 0, "Syndrom " + i + " in Block " + b);
    }
    data.push(...cw.slice(0, cw.length - eccLen));
  });
  // Byte-Segment lesen
  const stream = data.map((w) => w.toString(2).padStart(8, "0")).join("");
  assert.equal(stream.slice(0, 4), "0100", "Byte-Modus");
  const cb = version <= 9 ? 8 : 16;
  const len = parseInt(stream.slice(4, 4 + cb), 2);
  const out = [];
  for (let i = 0; i < len; i++) out.push(parseInt(stream.slice(4 + cb + i * 8, 12 + cb + i * 8), 2));
  return { version, ecl, mask, bytes: out };
}

test("Eigener Leser: jede Stufe × Maske in Version 1–10 liest den Text zurück", () => {
  const texts = ["", "Zeitkonto", "https://zeitkonto.example/app/#/stamp", "Grüezi ☕ 🕐 Pause",
    "https://intranet.example/zeitkonto/index.html#/stamp/break"];
  for (let v = 1; v <= 10; v++) {
    for (const ecl of Q.LEVELS) {
      const cap = Q.capacity(v, ecl);
      const pool = texts.filter((t) => Buffer.byteLength(t) <= cap).concat(["Z".repeat(cap)]);
      for (let mask = 0; mask < 8; mask++) {
        const text = pool[(v + mask) % pool.length];
        const qr = Q.encode(text, { ecl, mask, minVersion: v });
        const back = readSymbol(qr.modules);
        assert.equal(back.version, v);
        assert.equal(back.ecl, ecl);
        assert.equal(back.mask, mask);
        assert.equal(Buffer.from(back.bytes).toString("utf8"), text, v + "-" + ecl + "/" + mask);
      }
    }
  }
});

/* ---------------------------------------------------------------------- */
/* Masken und Strafpunkte                                                  */
/* ---------------------------------------------------------------------- */

function matrix(lines) { return lines.map((l) => l.split("").map((c) => c === "#")); }

test("Strafpunkte: ganz dunkles Symbol nach allen vier Regeln", () => {
  const m = Array.from({ length: 21 }, () => new Array(21).fill(true));
  const p = Q.penaltyParts(m);
  assert.equal(p.n1, 42 * (3 + 16), "N1: 42 Läufe à 21");
  assert.equal(p.n2, 20 * 20 * 3, "N2: alle 2×2-Blöcke");
  assert.equal(p.n3, 0);
  assert.equal(p.n4, 90, "N4: 100 % dunkel");
  assert.equal(Q.penalty(m), p.n1 + p.n2 + p.n3 + p.n4);
});

/* Quadratisch und hell, nur die mittlere Zeile trägt das Muster — die
   Spalten haben dann höchstens ein dunkles Modul und zählen nicht mit. */
function oneRow(line) {
  const size = line.length;
  return Array.from({ length: size }, (_, y) => line.split("").map((c) => y === size >> 1 && c === "#"));
}

test("Strafpunkte N3: Suchmuster-Imitat mit hellem Rand, auch vergrössert", () => {
  // 1:1:3:1:1 mit 5 hellen Modulen links und rechts → je Seite 40
  assert.equal(Q.penaltyParts(oneRow(".....#.###.#.....")).n3, 80);
  // links nur 1 hell, dann dunkel: zählt nur die rechte Seite
  assert.equal(Q.penaltyParts(oneRow("####.#.###.#....#")).n3, 40);
  // erster dunkler Lauf zu lang: kein Imitat
  assert.equal(Q.penaltyParts(oneRow(".....##.###.#.....")).n3, 0);
  // doppelt so gross 2:2:6:2:2 am Rand — ausserhalb zählt als hell (Ruhezone)
  assert.equal(Q.penaltyParts(oneRow("##..######..##")).n3, 80);
});

test("Strafpunkte N4: 45–55 % dunkel kostet nichts, darüber je 5 % zehn Punkte", () => {
  const make = (dark) => Array.from({ length: 10 }, (_, y) => Array.from({ length: 10 }, (_, x) => y * 10 + x < dark));
  assert.equal(Q.penaltyParts(make(55)).n4, 0);
  assert.equal(Q.penaltyParts(make(45)).n4, 0);
  assert.equal(Q.penaltyParts(make(56)).n4, 10);
  assert.equal(Q.penaltyParts(make(39)).n4, 20);
});

test("Automatische Maske = die mit den wenigsten Strafpunkten", () => {
  for (const [text, ecl] of [["Zeitkonto", "M"], ["https://zeitkonto.example/#/stamp", "M"], ["https://zeitkonto.example/#/stamp/break", "Q"], ["x".repeat(200), "L"]]) {
    const auto = Q.encode(text, { ecl });
    const scores = [];
    for (let k = 0; k < 8; k++) scores.push(Q.penalty(Q.encode(text, { ecl, mask: k }).modules));
    const best = Math.min(...scores);
    assert.equal(auto.mask, scores.indexOf(best), text);
    assert.deepEqual(auto.modules, Q.encode(text, { ecl, mask: auto.mask }).modules);
  }
});

/* ---------------------------------------------------------------------- */
/* SVG-Pfad                                                                */
/* ---------------------------------------------------------------------- */

test("SVG-Pfad: ein Rechteck je dunklem Lauf, Ruhezone als Versatz", () => {
  const m = matrix(["##.#", "....", "####"]);
  assert.equal(Q.toPath(m, 0), "M0 0h2v1h-2zM3 0h1v1h-1zM0 2h4v1h-4z");
  assert.equal(Q.toPath(m, 4), "M4 4h2v1h-2zM7 4h1v1h-1zM4 6h4v1h-4z");
  // Fläche des Pfads = Anzahl dunkler Module
  const qr = Q.encode("https://zeitkonto.example/#/stamp");
  const area = Q.toPath(qr.modules).match(/h\d+/g).reduce((sum, h) => sum + +h.slice(1), 0);
  const dark = qr.modules.reduce((s, r) => s + r.filter(Boolean).length, 0);
  assert.equal(area, dark);
});

/* ---------------------------------------------------------------------- */
/* Oberfläche (features/qr.js): Texte und reine Helfer                     */
/* ---------------------------------------------------------------------- */

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const I = require("../assets/js/ui/i18n.js");

/* features/qr.js ist ein Browser-Skript. Im Sandkasten laufen dom.js (ohne
   document richtet es nichts ein), ext.js und der Kodierer echt mit. */
function loadFeature(protocol) {
  const sandbox = { setTimeout, clearTimeout, setInterval, clearInterval, location: { protocol: protocol || "https:" } };
  sandbox.self = sandbox;
  sandbox.ZK = { I18n: I, QR: Q };
  for (const file of ["ui/dom.js", "ui/ext.js", "ui/features/qr.js"]) {
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../assets/js", file), "utf8"), sandbox, { filename: file });
  }
  return sandbox.ZK;
}
const ZK = loadFeature();
const SQ = ZK.StampQR;

test("Plakat-Texte: jeder Schlüssel in allen vier Sprachen, ohne ß", () => {
  const keys = Object.keys(I.DICT.de).filter((k) => k.indexOf("qr.") === 0);
  assert.ok(keys.length >= 25, "Texte geladen");
  for (const lang of ["de", "en", "fr", "it"]) {
    for (const k of keys) {
      assert.equal(typeof I.DICT[lang][k], "string", lang + " " + k);
      assert.ok(I.DICT[lang][k].trim().length > 0, lang + " " + k);
    }
    const own = Object.keys(I.DICT[lang]).filter((k) => k.indexOf("qr.") === 0);
    assert.deepEqual(own.sort(), keys.slice().sort(), lang + ": keine zusätzlichen Schlüssel");
  }
  keys.forEach((k) => assert.ok(!/ß/.test(I.DICT.de[k]), "Schweizer Schreibweise: " + k));
  // Zu jeder Stempelart gibt es Auswahl, Erklärung, Plakatzeile und Schritt 3
  for (const kind of SQ.KINDS) {
    for (const prefix of ["qr.kind.", "qr.what.", "qr.poster.kind.", "qr.poster.step3."]) assert.ok(I.DICT.de[prefix + kind], prefix + kind);
  }
  // Platzhalter bleiben in jeder Sprache erhalten
  for (const lang of ["de", "en", "fr", "it"]) {
    assert.ok(I.DICT[lang]["qr.printTip"].indexOf("{cm}") >= 0, lang);
    assert.ok(I.DICT[lang]["qr.alt"].indexOf("{kind}") >= 0, lang);
  }
});

test("SVG: Ruhezone von vier Modulen, weisser Grund, Pfad aus dem Kodierer", () => {
  const qr = Q.encode("https://zeitkonto.example/#/stamp");
  const svg = SQ.svg(qr, { px: 148, label: "QR <Test> & \"Link\"" });
  const n = qr.size + 8;
  assert.ok(svg.indexOf('viewBox="0 0 ' + n + " " + n + '"') > 0);
  assert.ok(svg.indexOf('width="148" height="148"') > 0);
  assert.ok(svg.indexOf('<rect width="' + n + '" height="' + n + '" fill="#FFFFFF"/>') > 0);
  assert.ok(svg.indexOf('d="' + Q.toPath(qr.modules, 4) + '"') > 0);
  assert.ok(svg.indexOf('shape-rendering="crispEdges"') > 0);
  assert.ok(svg.indexOf('aria-label="QR &lt;Test&gt; &amp; &quot;Link&quot;"') > 0, "Beschriftung maskiert");
  assert.ok(SQ.svg(qr).indexOf('aria-hidden="true"') > 0, "ohne Beschriftung für Screenreader verborgen");
  assert.ok(SQ.svg(qr).split(">")[0].indexOf("width=") < 0, "ohne px skaliert es mit dem Behälter");
});

test("Kachel: ganze Pixel je Modul, nahe an der Zielgrösse", () => {
  for (let v = 1; v <= 12; v++) {
    const qr = Q.encode("x", { minVersion: v });
    const n = qr.size + 8, px = SQ.tilePx(qr, 160);
    assert.equal(px % n, 0, "Version " + v);
    assert.ok(px >= 2 * n);
    assert.ok(Math.abs(px - 160) <= n / 2 + 1 || px === 2 * n, "Version " + v + ": " + px);
  }
});

test("PNG: mindestens 1024 px Kante und 8 px je Modul", () => {
  for (const v of [1, 3, 6, 10, 20, 40]) {
    const qr = Q.encode("x", { minVersion: v });
    const s = SQ.pngScale(qr);
    assert.equal(Math.floor(s), s);
    assert.ok(s >= 8);
    assert.ok((qr.size + 8) * s >= 1024, "Version " + v);
  }
});

test("Druckgrösse: auch auf A5 misst der Code (ohne Ruhezone) mindestens 6 cm", () => {
  // Kürzester denkbarer Stempel-Link → Version 2; längere Links werden grösser
  const short = Q.encode("http://a.ch/#/stamp");
  assert.equal(short.version, 2);
  for (let v = 2; v <= 10; v++) {
    const qr = Q.encode("x", { minVersion: v });
    assert.ok(SQ.codeMm(qr, "a5") >= 60, "A5 Version " + v + ": " + SQ.codeMm(qr, "a5").toFixed(1));
    assert.ok(SQ.codeMm(qr, "a4") > SQ.codeMm(qr, "a5"));
  }
  assert.deepEqual(Object.keys(SQ.PAPERS), ["a4", "a5"]);
});

test("Befehlspalette: „qr“ und „Plakat“ finden das Plakat, über file:// nicht", () => {
  I.setLang("de");
  const hit = ZK.Ext.collect("palette.commands", "qr", { App: {} });
  assert.equal(hit.length, 1);
  assert.equal(hit[0].label, "QR-Stempel-Plakat");
  assert.equal(hit[0].late, false);
  assert.equal(ZK.Ext.collect("palette.commands", "plakat", { App: {} })[0].late, false);
  assert.equal(ZK.Ext.collect("palette.commands", "drucken", { App: {} })[0].late, true, "Treffer mitten im Wort kommt später");
  assert.equal(ZK.Ext.collect("palette.commands", "ferien", { App: {} }).length, 0);
  assert.equal(ZK.Ext.collect("palette.commands", "q", { App: {} }).length, 0, "ein Zeichen ist zu wenig");
  const fileZK = loadFeature("file:");
  assert.equal(fileZK.Ext.collect("palette.commands", "qr", { App: {} }).length, 0);
  assert.equal(ZK.Ext.list("settings.stampLink").length, 1, "hängt sich in den Stempel-Link-Block");
});
