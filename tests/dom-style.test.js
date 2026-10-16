"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

/* dom.js ist reiner Browser-Code. Für den Test genügt ein kleines Schein-DOM:
   ein Element mit style (inkl. setProperty), classList und Attributen. */
function fakeElement(tag) {
  const props = {};
  const style = {
    setProperty(name, value) { props[name] = String(value); },
    getPropertyValue(name) { return props[name] || ""; }
  };
  const classes = new Set();
  return {
    tagName: String(tag).toUpperCase(),
    style,
    _props: props,
    classList: { add(c) { classes.add(c); }, contains(c) { return classes.has(c); } },
    className: "",
    dataset: {},
    attributes: {},
    children: [],
    setAttribute(k, v) { this.attributes[k] = String(v); },
    appendChild(c) { this.children.push(c); return c; },
    addEventListener() {}
  };
}

function loadDom() {
  const sandbox = {
    document: {
      createElement: fakeElement,
      createTextNode: (t) => ({ text: t }),
      querySelector: () => null,
      querySelectorAll: () => []
    }
  };
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  const src = fs.readFileSync(path.join(__dirname, "../assets/js/ui/dom.js"), "utf8");
  vm.runInContext(src, sandbox);
  return sandbox.ZK.Dom;
}

const D = loadDom();

test("el(): eigene CSS-Variablen kommen über setProperty an", () => {
  const node = D.el("span.type-strip", { style: { "--c": "var(--type-holiday)", "--p": 0.25 } });
  assert.equal(node.style.getPropertyValue("--c"), "var(--type-holiday)");
  assert.equal(node.style.getPropertyValue("--p"), "0.25");
});

test("el(): normale Stil-Eigenschaften bleiben direkte Zuweisungen", () => {
  const node = D.el("i", { style: { width: "42%", background: "var(--chart-plus)", "--c": "red" } });
  assert.equal(node.style.width, "42%");
  assert.equal(node.style.background, "var(--chart-plus)");
  assert.equal(node.style.getPropertyValue("--c"), "red");
  assert.equal(node.style["--c"], undefined, "Variable nicht als Eigenschaft abgelegt");
});

test("el(): leere Stilwerte werden übersprungen", () => {
  const node = D.el("div", { style: { width: null, "--c": undefined, height: "4px" } });
  assert.equal(node.style.width, undefined);
  assert.equal(node.style.getPropertyValue("--c"), "");
  assert.equal(node.style.height, "4px");
});
