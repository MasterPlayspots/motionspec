"use strict";
/* Flat-Config (ESLint v9). Reines JS-Projekt, gemischt CJS (.js) + ESM (.mjs).
 * Ziel: ein sinnvoller, gruener Lint-Gate auf dem Bestandscode (Re-Audit QW #4). */
const js = require("@eslint/js");
const globals = require("globals");

const baseRules = {
  "no-empty": ["error", { allowEmptyCatch: true }],
  "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrors: "none" }],
  /* Steuerzeichen in den Validator-/CSS-Regexen sind ABSICHT (Injection-Screening). */
  "no-control-regex": "off",
};

module.exports = [
  { ignores: ["node_modules/", "out/", "candidates/", "telemetry/", ".cache/", "coverage/", "dist-worker/", "sbom.cdx.json", "test/golden/"] },
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: { ecmaVersion: "latest", sourceType: "commonjs", globals: globals.node },
    rules: baseRules,
  },
  {
    /* src/audit/audit.js is kept byte-identical to the engine behind the free
     * site check, so one engine produces one score everywhere. That file carries
     * two unused helpers (skipBlock, createsMotion); removing them would break
     * the identity. Only these two names are exempt — any NEW dead code still fails. */
    files: ["src/audit/audit.js"],
    rules: { "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrors: "none", varsIgnorePattern: "^(skipBlock|createsMotion)$" }] },
  },
  {
    files: ["**/*.mjs"],
    languageOptions: { ecmaVersion: "latest", sourceType: "module", globals: { ...globals.node, ...globals.browser } },
    rules: baseRules,
  },
  {
    files: ["test/e2e/**"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
];
