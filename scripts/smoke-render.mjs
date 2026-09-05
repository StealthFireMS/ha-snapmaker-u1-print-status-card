// Runtime smoke test for the *built* bundle (dist/snapmaker-u1-print-status-card.js).
//
// npm run build:strict / npm run verify only prove the TypeScript source is correct and that
// the entity-resolution logic works - neither of them actually executes the minified bundle a
// browser receives. A real regression (see CHANGELOG - "ReferenceError: _k is not defined")
// slipped through both of those checks because it was introduced by the Babel/Terser
// minification step itself, not by anything in the source. This script mounts the built card
// in a jsdom document, feeds it a realistic set of entities (via the same fixture the resolver
// regression test uses), and forces every render branch that maps arrays of Lit TemplateResults
// (the 4 tool tiles, plus the advanced-info rows) - which is exactly the code path that threw.
//
// Run with: node scripts/smoke-render.mjs   (after `npm run build` / `build:strict`)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { JSDOM } from "jsdom";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, "..", "dist", "snapmaker-u1-print-status-card.js");
const fixturePath = path.join(__dirname, "fixtures", "u1-entities.txt");

if (!fs.existsSync(distPath)) {
  console.error(`Build output not found at ${distPath}. Run "npm run build" first.`);
  process.exit(1);
}

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});

for (const key of [
  "window",
  "document",
  "customElements",
  "HTMLElement",
  "CustomEvent",
  "Event",
  "Node",
  "ShadowRoot",
  "MutationObserver",
  "Document",
  "CSSStyleSheet",
  "DocumentFragment",
  "Text",
  "Comment",
  "Element",
]) {
  global[key] = dom.window[key];
}
global.getComputedStyle = dom.window.getComputedStyle;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.cancelAnimationFrame = (id) => clearTimeout(id);
global.trustedTypes = undefined;

const deviceId = "u1-device";
const entityIds = fs
  .readFileSync(fixturePath, "utf-8")
  .split("\n")
  .map((l) => l.trim())
  .filter(Boolean);

const entities = {};
const states = {};
for (const id of entityIds) {
  entities[id] = { device_id: deviceId, platform: "moonraker" };
  states[id] = { entity_id: id, state: "0", attributes: {} };
}

const hass = {
  entities,
  states,
  localize: (k) => k,
  language: "en",
  callWS: async () => ({}),
  callService: async () => ({}),
};

async function main() {
  await import(distPath.startsWith("/") ? `file://${distPath}` : distPath);

  const el = document.createElement("snapmaker-u1-print-status-card");
  document.body.appendChild(el);
  el.setConfig({
    type: "custom:snapmaker-u1-print-status-card",
    printer: deviceId,
    show_camera: true,
    // Force the advanced section open too, since it renders another array of rows.
    show_advanced_default: true,
  });
  el.hass = hass;

  // Let Lit's async render cycle flush.
  if (el.updateComplete) await el.updateComplete;
  await new Promise((resolve) => setTimeout(resolve, 200));

  const shadow = el.shadowRoot;
  if (!shadow || shadow.innerHTML.length < 500) {
    throw new Error(
      `Card rendered suspiciously little content (${shadow ? shadow.innerHTML.length : 0} chars) - it likely failed silently.`
    );
  }
  if (!shadow.innerHTML.toLowerCase().includes("tool")) {
    throw new Error("Rendered output doesn't contain the expected tool-tile content.");
  }
  if (!shadow.querySelector(".body") || !shadow.querySelector(".info")) {
    throw new Error("Expected .body/.info wrapper elements (responsive layout) are missing.");
  }

  const expectedGridOptions = {
    columns: 12,
    rows: 5,
    min_columns: 6,
    max_columns: 12,
    min_rows: 3,
    max_rows: 10,
  };
  if (typeof el.getGridOptions !== "function") {
    throw new Error(
      "getGridOptions() is missing - the card won't get its default 12x5 size in the sections view."
    );
  }
  const gridOptions = el.getGridOptions();
  for (const [key, value] of Object.entries(expectedGridOptions)) {
    if (gridOptions[key] !== value) {
      throw new Error(
        `getGridOptions().${key} was ${JSON.stringify(gridOptions[key])}, expected ${JSON.stringify(value)}.`
      );
    }
  }

  console.log(`Smoke test passed: rendered ${shadow.innerHTML.length} chars with no errors.`);
}

main().catch((err) => {
  console.error("\nSmoke test FAILED - the built bundle threw or rendered incorrectly:\n");
  console.error(err);
  process.exit(1);
});
