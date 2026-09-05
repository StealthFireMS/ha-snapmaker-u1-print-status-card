import { getBabelInputPlugin, getBabelOutputPlugin } from "@rollup/plugin-babel";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import nodeResolve from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";
import serve from "rollup-plugin-serve";

const dev = process.env.ROLLUP_WATCH;
const ignoreErrors = dev || process.env.IGNORE_TS_ERRORS === "true";

const serveOptions = {
  contentBase: ["./dist"],
  host: "0.0.0.0",
  port: 4000,
  allowCrossOrigin: true,
  headers: {
    "Access-Control-Allow-Origin": "*",
  },
};

const plugins = [
  typescript({
    declaration: false,
    noEmitOnError: !ignoreErrors,
  }),
  nodeResolve(),
  json(),
  commonjs(),
  getBabelInputPlugin({
    babelHelpers: "bundled",
  }),
  getBabelOutputPlugin({
    presets: [
      [
        "@babel/preset-env",
        {
          // HA's frontend only runs in evergreen, ES-module-capable browsers. Without an
          // explicit target, preset-env falls back to a very old default and downlevels
          // native classes/async/decorators to ES5 function-based helpers. That transform,
          // combined with Terser's mangling afterwards, was corrupting a class self-reference
          // in Lit's internals and produced "ReferenceError: _k is not defined" at runtime
          // (the card would register but throw on every render). Targeting esmodules support
          // tells Babel there's nothing left to downlevel, so it passes modern syntax through
          // untouched and only Terser (a syntax-aware minifier) renames things.
          targets: { esmodules: true },
          modules: false,
        },
      ],
    ],
    compact: true,
  }),
  ...(dev ? [serve(serveOptions)] : [terser()]),
];

export default [
  {
    input: "src/snapmaker-u1-print-status-card.ts",
    output: {
      dir: "dist",
      format: "es",
      inlineDynamicImports: true,
    },
    plugins,
  },
];
