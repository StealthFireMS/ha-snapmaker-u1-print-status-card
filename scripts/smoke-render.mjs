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
    screen_url: "192.168.20.163",
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
  if (!shadow.querySelector(".top-row") || !shadow.querySelector(".stats-sidebar")) {
    throw new Error("Expected .top-row/.stats-sidebar layout elements are missing.");
  }
  const iconButtons = shadow.querySelectorAll(".controls .icon-btn");
  if (iconButtons.length < 3) {
    throw new Error(
      `Expected several .icon-btn controls in the toolbar, found ${iconButtons.length}.`
    );
  }

  // Locked to exactly 12x5 - min must equal max on both axes or the dashboard editor's resize
  // handles can drag it to some other size.
  const expectedGridOptions = {
    columns: 12,
    rows: 5,
    min_columns: 12,
    max_columns: 12,
    min_rows: 5,
    max_rows: 5,
  };
  if (typeof el.getGridOptions !== "function") {
    throw new Error(
      "getGridOptions() is missing - the card won't get its locked 12x5 size in the sections view."
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

  if (shadow.innerHTML.toLowerCase().includes("home all axes")) {
    throw new Error("The removed 'Home all axes' control is still being rendered.");
  }
  if (shadow.querySelector(".advanced-toggle") || shadow.querySelector(".advanced")) {
    throw new Error("The removed 'Show advanced details' section is still being rendered.");
  }

  // Emergency stop/cancel build their own <ha-dialog> confirmation and append it straight to
  // document.body, deliberately OUTSIDE the card's own shadow DOM - a dialog left inside the
  // card can get confined to the card's own small on-screen box by the same CSS container-query
  // containment that gives the card its responsive layout (see CHANGELOG). Confirm: (1) clicking
  // Emergency Stop appends a dialog to document.body and NOT inside the card's shadow root, and
  // (2) clicking that dialog's Confirm button actually calls the emergency-stop service, not
  // just that some dialog appeared.
  const estopButton = Array.from(shadow.querySelectorAll(".controls .icon-btn")).find((btn) =>
    (btn.getAttribute("title") || "").toLowerCase().includes("emergency stop")
  );
  if (!estopButton) {
    throw new Error("Emergency stop button not found in the toolbar.");
  }
  let calledService = null;
  hass.callService = async (domain, service, data) => {
    calledService = { domain, service, data };
  };
  estopButton.click();

  const dialog = document.body.querySelector("ha-dialog");
  if (!dialog) {
    throw new Error(
      "Clicking Emergency stop didn't append a confirmation <ha-dialog> to document.body."
    );
  }
  if (shadow.querySelector("ha-dialog")) {
    throw new Error(
      "The confirmation dialog was appended inside the card's own shadow DOM instead of " +
        "document.body - the card's own CSS containment can confine it there and make its " +
        "buttons unreachable (see CHANGELOG)."
    );
  }
  const confirmBtn = dialog.querySelector('mwc-button[slot="primaryAction"]');
  if (!confirmBtn) {
    throw new Error("Confirmation dialog has no primary (Confirm) action button.");
  }
  confirmBtn.click();
  if (!calledService || calledService.domain !== "button" || calledService.service !== "press") {
    throw new Error(
      "Clicking the confirmation dialog's Confirm button didn't call the emergency-stop service."
    );
  }
  dialog.remove();

  // Print speed is now a fixed dropdown (50/80/100/120/150%), not a free slider.
  const speedSelect = shadow.querySelector(".speed-select");
  if (!speedSelect) {
    throw new Error("Print speed dropdown (.speed-select) not found.");
  }
  const speedOptions = Array.from(speedSelect.querySelectorAll("option")).map((o) => o.value);
  for (const preset of ["50", "80", "100", "120", "150"]) {
    if (!speedOptions.includes(preset)) {
      throw new Error(`Print speed dropdown is missing the ${preset}% preset.`);
    }
  }

  // The printer-touchscreen button: configured with a bare IP ("192.168.20.163"), it should
  // open "http://192.168.20.163/screen/" (the "/screen/" suffix appended automatically) in a
  // new tab when clicked.
  const screenButton = Array.from(shadow.querySelectorAll(".controls .icon-btn")).find((btn) =>
    (btn.getAttribute("title") || "").toLowerCase().includes("touchscreen")
  );
  if (!screenButton) {
    throw new Error("Printer touchscreen button not found in the toolbar.");
  }
  let openedUrl = null;
  const originalOpen = window.open;
  window.open = (url) => {
    openedUrl = url;
    return null;
  };
  screenButton.click();
  window.open = originalOpen;
  if (openedUrl !== "http://192.168.20.163/screen/") {
    throw new Error(
      `Clicking the touchscreen button opened ${JSON.stringify(openedUrl)}, expected "http://192.168.20.163/screen/".`
    );
  }

  console.log(`Smoke test passed: rendered ${shadow.innerHTML.length} chars with no errors.`);
}

main().catch((err) => {
  console.error("\nSmoke test FAILED - the built bundle threw or rendered incorrectly:\n");
  console.error(err);
  process.exit(1);
});
