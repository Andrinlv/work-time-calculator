/* ==========================================================================
   ZEITKONTO — QR-Code
   --------------------------------------------------------------------------
   Ein kleiner, vollständiger QR-Kodierer nach ISO/IEC 18004 für den
   Stempel-Link auf dem Plakat — ohne Bibliothek, damit die App offline und
   frei von fremdem Code bleibt.

     · Byte-Modus (UTF-8), Fehlerkorrektur L, M, Q oder H, Versionen 1–40
     · Reed-Solomon über GF(256), Blöcke verschränkt wie in der Norm
     · alle acht Masken, gewählt über die vier Strafpunkt-Regeln
     · Format- und Versionsinformation mit BCH-Prüfbits

   Ergebnis ist eine Matrix aus Booleans (true = dunkles Modul), Zeile für
   Zeile, ohne Ruhezone. Gezeichnet wird in der Oberfläche (SVG, Canvas);
   toPath() liefert dafür einen fertigen SVG-Pfad.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ZK = root.ZK || {};
    root.ZK.QR = factory();
  }
})(typeof self !== "undefined" ? self : globalThis, function () {
  "use strict";

  /* Stufe → Zeile in den Tabellen und die zwei Bits der Formatinformation
     (die Norm zählt nicht der Reihe nach: L=01, M=00, Q=11, H=10). */
  var LEVELS = {
    L: { row: 0, bits: 1 },
    M: { row: 1, bits: 0 },
    Q: { row: 2, bits: 3 },
    H: { row: 3, bits: 2 }
  };

  /* Norm, Tabelle 9: Fehlerkorrektur-Codewörter je Block und Anzahl Blöcke.
     Index = Version (0 bleibt leer), Zeilen L, M, Q, H. */
  var ECC_PER_BLOCK = [
    [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30]
  ];
  var NUM_BLOCKS = [
    [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81]
  ];

  function level(ecl) {
    var l = LEVELS[String(ecl || "M").toUpperCase()];
    if (!l) throw new RangeError("QR: unbekannte Fehlerkorrektur „" + ecl + "“");
    return l;
  }

  function checkVersion(v) {
    if (!(v >= 1 && v <= 40 && Math.floor(v) === v)) throw new RangeError("QR: Version " + v + " gibt es nicht");
  }

  /* ==================================================================== */
  /* 1 · DATEN                                                             */
  /* ==================================================================== */

  /** Text → UTF-8-Bytes (ohne TextEncoder, der in Node-Tests und alten Browsern fehlen kann). */
  function utf8(str) {
    var out = [];
    str = String(str);
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c >= 0xD800 && c <= 0xDBFF && i + 1 < str.length) {
        var d = str.charCodeAt(i + 1);
        if (d >= 0xDC00 && d <= 0xDFFF) { c = 0x10000 + ((c - 0xD800) << 10) + (d - 0xDC00); i++; }
      }
      // Ein einzelnes Ersatzzeichen-Halb wäre kein gültiges UTF-8
      if (c >= 0xD800 && c <= 0xDFFF) c = 0xFFFD;
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xC0 | c >> 6, 0x80 | c & 63);
      else if (c < 0x10000) out.push(0xE0 | c >> 12, 0x80 | c >> 6 & 63, 0x80 | c & 63);
      else out.push(0xF0 | c >> 18, 0x80 | c >> 12 & 63, 0x80 | c >> 6 & 63, 0x80 | c & 63);
    }
    return out;
  }

  /** Module, die nach allen festen Mustern für Daten und Korrektur übrig bleiben. */
  function rawModules(version) {
    var n = (16 * version + 128) * version + 64;
    if (version >= 2) {
      var align = Math.floor(version / 7) + 2;
      n -= (25 * align - 10) * align - 55;
      if (version >= 7) n -= 36;
    }
    return n;
  }

  /** Anzahl Daten-Codewörter (ohne Fehlerkorrektur). */
  function dataCodewords(version, ecl) {
    var l = level(ecl);
    checkVersion(version);
    return Math.floor(rawModules(version) / 8) - ECC_PER_BLOCK[l.row][version] * NUM_BLOCKS[l.row][version];
  }

  /** Länge des Zeichenzählers im Byte-Modus. */
  function countBits(version) { return version <= 9 ? 8 : 16; }

  /** So viele Bytes passen im Byte-Modus in eine Version. */
  function capacity(version, ecl) {
    return Math.floor((dataCodewords(version, ecl) * 8 - 4 - countBits(version)) / 8);
  }

  /** Bitstrom: Modus 0100, Zähler, Bytes, Abschluss, Füllbytes 0xEC/0x11. */
  function dataStream(bytes, version, ecl) {
    var total = dataCodewords(version, ecl) * 8;
    var bits = [];
    function put(val, len) { for (var i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); }
    put(4, 4);
    put(bytes.length, countBits(version));
    for (var i = 0; i < bytes.length; i++) put(bytes[i], 8);
    if (bits.length > total) throw new RangeError("QR: Daten passen nicht in Version " + version);
    put(0, Math.min(4, total - bits.length));
    put(0, (8 - bits.length % 8) % 8);
    for (var pad = 0xEC; bits.length < total; pad ^= 0xEC ^ 0x11) put(pad, 8);
    var out = [];
    for (var b = 0; b < bits.length; b += 8) {
      var v = 0;
      for (var k = 0; k < 8; k++) v = (v << 1) | bits[b + k];
      out.push(v);
    }
    return out;
  }

  /* ==================================================================== */
  /* 2 · REED-SOLOMON                                                      */
  /* ==================================================================== */

  /** Multiplikation in GF(2^8) mit dem Polynom x^8+x^4+x^3+x^2+1 (0x11D). */
  function gfMul(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  }

  /** Generatorpolynom (x−α^0)…(x−α^(n−1)), höchster Koeffizient (immer 1) weggelassen. */
  function rsDivisor(degree) {
    var result = [];
    for (var i = 0; i < degree - 1; i++) result.push(0);
    result.push(1);
    var rootVal = 1;
    for (i = 0; i < degree; i++) {
      for (var j = 0; j < result.length; j++) {
        result[j] = gfMul(result[j], rootVal);
        if (j + 1 < result.length) result[j] ^= result[j + 1];
      }
      rootVal = gfMul(rootVal, 0x02);
    }
    return result;
  }

  /** Rest der Polynomdivision = die Korrektur-Codewörter eines Blocks. */
  function rsRemainder(data, divisor) {
    var result = [];
    var i;
    for (i = 0; i < divisor.length; i++) result.push(0);
    for (i = 0; i < data.length; i++) {
      var factor = data[i] ^ result.shift();
      result.push(0);
      for (var j = 0; j < divisor.length; j++) result[j] ^= gfMul(divisor[j], factor);
    }
    return result;
  }

  /**
   * Teilt die Daten in Blöcke, hängt jedem seine Korrektur an und
   * verschränkt alles spaltenweise. Kurze Blöcke stehen vorn; ihr fehlendes
   * letztes Datenbyte wird beim Verschränken übersprungen.
   */
  function interleave(data, version, ecl) {
    var l = level(ecl);
    var numBlocks = NUM_BLOCKS[l.row][version];
    var eccLen = ECC_PER_BLOCK[l.row][version];
    var raw = Math.floor(rawModules(version) / 8);
    var numShort = numBlocks - raw % numBlocks;
    var shortLen = Math.floor(raw / numBlocks);
    var divisor = rsDivisor(eccLen);
    var blocks = [];
    for (var i = 0, k = 0; i < numBlocks; i++) {
      var dat = data.slice(k, k + shortLen - eccLen + (i < numShort ? 0 : 1));
      k += dat.length;
      var ecc = rsRemainder(dat, divisor);
      if (i < numShort) dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    var out = [];
    for (i = 0; i < blocks[0].length; i++) {
      for (var j = 0; j < blocks.length; j++) {
        if (i !== shortLen - eccLen || j >= numShort) out.push(blocks[j][i]);
      }
    }
    return out;
  }

  /* ==================================================================== */
  /* 3 · FESTE MUSTER                                                      */
  /* ==================================================================== */

  /** Mittelpunkte der Ausrichtungsmuster (Norm, Anhang E). */
  function alignmentPositions(version) {
    checkVersion(version);
    if (version === 1) return [];
    var size = version * 4 + 17;
    var count = Math.floor(version / 7) + 2;
    var step = version === 32 ? 26 : Math.ceil((size - 13) / (count * 2 - 2)) * 2;
    var out = [6];
    for (var pos = size - 7; out.length < count; pos -= step) out.splice(1, 0, pos);
    return out;
  }

  /** 15 Bit: Stufe + Maske, BCH(15,5) mit 0x537, maskiert mit 0x5412. */
  function formatBits(ecl, mask) {
    var data = (level(ecl).bits << 3) | mask;
    var rem = data;
    for (var i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    return ((data << 10) | rem) ^ 0x5412;
  }

  /** 18 Bit: Version + BCH(18,6) mit 0x1F25 — erst ab Version 7 im Symbol. */
  function versionBits(version) {
    checkVersion(version);
    var rem = version;
    for (var i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
    return (version << 12) | rem;
  }

  function grid(size) {
    var g = [];
    for (var y = 0; y < size; y++) {
      var row = [];
      for (var x = 0; x < size; x++) row.push(false);
      g.push(row);
    }
    return g;
  }

  /** Formatinformation an beide Stellen; das dunkle Modul unten links gehört dazu. */
  function drawFormat(set, size, bits) {
    function bit(i) { return ((bits >>> i) & 1) === 1; }
    var i;
    for (i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6));
    set(8, 8, bit(7));
    set(7, 8, bit(8));
    for (i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);
  }

  /** Leeres Symbol mit allen festen Mustern; isFunction sperrt sie für Daten und Maske. */
  function skeleton(version) {
    var size = version * 4 + 17;
    var modules = grid(size), isFunction = grid(size);
    function set(x, y, dark) { modules[y][x] = dark; isFunction[y][x] = true; }
    var i, j, dx, dy;

    // Taktlinien zuerst — die Suchmuster überschreiben ihre Enden
    for (i = 0; i < size; i++) {
      set(6, i, i % 2 === 0);
      set(i, 6, i % 2 === 0);
    }
    // Suchmuster samt hellem Trennstreifen
    var finders = [[3, 3], [size - 4, 3], [3, size - 4]];
    for (var f = 0; f < finders.length; f++) {
      for (dy = -4; dy <= 4; dy++) {
        for (dx = -4; dx <= 4; dx++) {
          var x = finders[f][0] + dx, y = finders[f][1] + dy;
          if (x < 0 || y < 0 || x >= size || y >= size) continue;
          var dist = Math.max(Math.abs(dx), Math.abs(dy));
          set(x, y, dist !== 2 && dist !== 4);
        }
      }
    }
    // Ausrichtungsmuster, ausser wo sie ein Suchmuster träfen
    var pos = alignmentPositions(version), n = pos.length;
    for (i = 0; i < n; i++) {
      for (j = 0; j < n; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
        for (dy = -2; dy <= 2; dy++) {
          for (dx = -2; dx <= 2; dx++) set(pos[i] + dx, pos[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }
    // Platz für die Formatinformation — geschrieben wird sie je Maske
    drawFormat(set, size, 0);
    // Versionsinformation oben rechts und unten links
    if (version >= 7) {
      var vb = versionBits(version);
      for (i = 0; i < 18; i++) {
        var dark = ((vb >>> i) & 1) === 1;
        var a = size - 11 + i % 3, b = Math.floor(i / 3);
        set(a, b, dark);
        set(b, a, dark);
      }
    }
    return { size: size, modules: modules, isFunction: isFunction, set: set };
  }

  /** Codewörter im Zickzack: Spaltenpaare von rechts, abwechselnd hoch und runter. */
  function placeCodewords(sym, codewords) {
    var size = sym.size, i = 0, total = codewords.length * 8;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;  // senkrechte Taktlinie überspringen
      var upward = ((right + 1) & 2) === 0;
      for (var vert = 0; vert < size; vert++) {
        var y = upward ? size - 1 - vert : vert;
        for (var j = 0; j < 2; j++) {
          var x = right - j;
          if (sym.isFunction[y][x]) continue;
          // Restbits (0–7 je nach Version) bleiben hell
          if (i < total) sym.modules[y][x] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) === 1;
          i++;
        }
      }
    }
  }

  /* ==================================================================== */
  /* 4 · MASKEN UND STRAFPUNKTE                                            */
  /* ==================================================================== */

  var MASKS = [
    function (x, y) { return (x + y) % 2 === 0; },
    function (x, y) { return y % 2 === 0; },
    function (x) { return x % 3 === 0; },
    function (x, y) { return (x + y) % 3 === 0; },
    function (x, y) { return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; },
    function (x, y) { return x * y % 2 + x * y % 3 === 0; },
    function (x, y) { return (x * y % 2 + x * y % 3) % 2 === 0; },
    function (x, y) { return ((x + y) % 2 + x * y % 3) % 2 === 0; }
  ];

  /** XOR-Maske auf alle Datenmodule — zweimal angewandt hebt sie sich auf. */
  function applyMask(sym, mask) {
    var fn = MASKS[mask];
    for (var y = 0; y < sym.size; y++) {
      for (var x = 0; x < sym.size; x++) {
        if (!sym.isFunction[y][x] && fn(x, y)) sym.modules[y][x] = !sym.modules[y][x];
      }
    }
  }

  /**
   * Die vier Regeln der Norm (Abschnitt 7.8.3):
   *   N1  Läufe ≥ 5 gleicher Farbe in Zeile/Spalte: 3 + (Länge − 5)
   *   N2  jeder 2×2-Block einer Farbe: 3
   *   N3  Suchmuster-Imitat dunkel:hell:dunkel:hell:dunkel = 1:1:3:1:1
   *       (auch vergrössert, n:n:3n:n:n) mit hellem Rand von 4n auf einer
   *       Seite: 40 je Seite. Ausserhalb des Symbols zählt als hell — dort
   *       liegt die Ruhezone. Gezählt wird wie im verbreiteten
   *       Referenz-Kodierer von Nayuki, damit die Maskenwahl übereinstimmt.
   *   N4  je volle 5 % Abweichung des Dunkelanteils über 45–55 % hinaus: 10
   */
  function penaltyParts(m) {
    var size = m.length, n1 = 0, n2 = 0, n3 = 0, dark = 0;
    var x, y;
    function line(get) {
      // Lauflängen; Index gerade = hell. Der Rand kommt als heller Lauf dazu.
      var runs = [size], i;
      var color = false;
      for (i = 0; i < size; i++) {
        var c = get(i);
        if (c === color) runs[runs.length - 1]++;
        else { runs.push(1); color = c; }
      }
      if (color) runs.push(size);
      else runs[runs.length - 1] += size;
      // N1 ohne die Ränder (die Ruhezone ist kein Teil des Symbols)
      for (i = 0; i < runs.length; i++) {
        var len = runs[i] - (i === 0 ? size : 0) - (i === runs.length - 1 ? size : 0);
        if (len >= 5) n1 += 3 + len - 5;
      }
      // N3: dunkle Läufe stehen auf ungeraden Indizes
      for (i = 1; i + 5 < runs.length; i += 2) {
        var n = runs[i];
        if (runs[i + 1] !== n || runs[i + 2] !== 3 * n || runs[i + 3] !== n || runs[i + 4] !== n) continue;
        var before = runs[i - 1], after = runs[i + 5];
        if (before >= 4 * n && after >= n) n3 += 40;
        if (after >= 4 * n && before >= n) n3 += 40;
      }
    }
    for (y = 0; y < size; y++) {
      line(function (i) { return m[y][i]; });
      line(function (i) { return m[i][y]; });
    }
    for (y = 0; y < size; y++) {
      for (x = 0; x < size; x++) {
        if (m[y][x]) dark++;
        if (x < size - 1 && y < size - 1) {
          var c = m[y][x];
          if (m[y][x + 1] === c && m[y + 1][x] === c && m[y + 1][x + 1] === c) n2 += 3;
        }
      }
    }
    var total = size * size;
    // kleinstes k ≥ 0 mit (45 − 5k) % ≤ Dunkelanteil ≤ (55 + 5k) %
    var k = Math.max(0, Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1);
    return { n1: n1, n2: n2, n3: n3, n4: k * 10 };
  }

  function penalty(m) {
    var p = penaltyParts(m);
    return p.n1 + p.n2 + p.n3 + p.n4;
  }

  /* ==================================================================== */
  /* 5 · ZUSAMMENBAU                                                       */
  /* ==================================================================== */

  /**
   * Kodiert Text (oder ein Byte-Array) als QR-Code.
   * opts: { ecl: "L"|"M"|"Q"|"H" (Standard M), minVersion, maxVersion,
   *         mask: 0–7 erzwingen (sonst die mit den wenigsten Strafpunkten) }
   * → { version, ecl, mask, size, modules: Boolean[size][size] (Zeilen) }
   */
  function encode(input, opts) {
    opts = opts || {};
    var ecl = String(opts.ecl || "M").toUpperCase();
    level(ecl);
    var bytes = typeof input === "string" ? utf8(input) : Array.prototype.slice.call(input || []);
    var minV = opts.minVersion || 1, maxV = opts.maxVersion || 40;
    checkVersion(minV);
    checkVersion(maxV);
    var version = 0;
    for (var v = minV; v <= maxV; v++) {
      if (bytes.length <= capacity(v, ecl)) { version = v; break; }
    }
    if (!version) throw new RangeError("QR: " + bytes.length + " Bytes sind zu lang für Version " + maxV + "-" + ecl);
    var mask = opts.mask;
    if (mask !== undefined && mask !== null && mask !== -1 && !(mask >= 0 && mask <= 7 && Math.floor(mask) === mask)) {
      throw new RangeError("QR: Maske " + mask + " gibt es nicht");
    }

    var sym = skeleton(version);
    placeCodewords(sym, interleave(dataStream(bytes, version, ecl), version, ecl));

    if (mask === undefined || mask === null || mask === -1) {
      var best = Infinity;
      for (var k = 0; k < 8; k++) {
        applyMask(sym, k);
        drawFormat(sym.set, sym.size, formatBits(ecl, k));
        var score = penalty(sym.modules);
        if (score < best) { best = score; mask = k; }
        applyMask(sym, k);  // rückgängig
      }
    }
    applyMask(sym, mask);
    drawFormat(sym.set, sym.size, formatBits(ecl, mask));
    return { version: version, ecl: ecl, mask: mask, size: sym.size, modules: sym.modules };
  }

  /**
   * SVG-Pfad für alle dunklen Module, je Zeile zu Streifen zusammengefasst
   * (ein Rechteck pro Lauf statt pro Modul). margin = Ruhezone in Modulen.
   */
  function toPath(modules, margin) {
    margin = margin === undefined ? 4 : margin;
    var d = [];
    for (var y = 0; y < modules.length; y++) {
      var row = modules[y], x = 0;
      while (x < row.length) {
        if (!row[x]) { x++; continue; }
        var start = x;
        while (x < row.length && row[x]) x++;
        d.push("M" + (start + margin) + " " + (y + margin) + "h" + (x - start) + "v1h-" + (x - start) + "z");
      }
    }
    return d.join("");
  }

  return {
    encode: encode,
    toPath: toPath,
    utf8: utf8,
    capacity: capacity,
    dataCodewords: dataCodewords,
    alignmentPositions: alignmentPositions,
    formatBits: formatBits,
    versionBits: versionBits,
    penalty: penalty,
    penaltyParts: penaltyParts,
    // für die Tests
    _rsDivisor: rsDivisor,
    _rsRemainder: rsRemainder,
    _dataStream: dataStream,
    _interleave: interleave,
    _gfMul: gfMul,
    LEVELS: ["L", "M", "Q", "H"]
  };
});
