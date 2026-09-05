# Changelog

## 0.1.1

### Fixed

- **Card rendered blank in normal dashboard view** (visible only as an empty placeholder while
  editing the dashboard), with the browser console repeatedly logging
  `ReferenceError: _k is not defined` from the built bundle.

  Root cause: the Rollup build ran the bundled output through Babel (`@rollup/plugin-babel`'s
  `getBabelOutputPlugin`) with `@babel/preset-env` and no explicit `targets`. With no targets,
  preset-env fell back to its old default and downleveled native classes (and other modern
  syntax Lit relies on) into ES5 function-based class helpers. Running Terser's minifier over
  that downleveled output then corrupted a self-reference inside one of Lit's internal classes,
  leaving a reference to a minified name (`_k`) that was never declared - so every render threw.

  Fixed by targeting `esmodules: true` in the `@babel/preset-env` config, since Home Assistant's
  frontend only ever runs in evergreen, ES-module-capable browsers - there is nothing that
  actually needs downleveling, so Babel now passes modern syntax through untouched.

- Added `scripts/smoke-render.mjs`, a jsdom-based smoke test that mounts the *built* bundle and
  forces every render branch (including the array-mapped tool tiles and advanced-info rows,
  which is exactly the code path that broke) to catch this class of bug in CI going forward -
  neither `npm run build:strict` (a TypeScript source check) nor `npm run verify` (an
  entity-resolver logic check) executes the actual minified bundle a browser receives, so this
  regression slipped past both. It now runs via `npm run smoke` in both CI workflows.

## 0.1.0

Initial release.
