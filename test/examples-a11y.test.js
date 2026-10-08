"use strict";
/*
 * examples-a11y.test.js — pins what examples/a11y/README.md says about the three
 * motion-accessibility examples, so the documentation cannot drift from the code.
 * No network: the audit example is served to the engine through fetchImpl.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { compileSpec } = require("../src/compiler/compile.js");
const { validateSpec } = require("../src/compiler/validate.js");
const { loadCatalog } = require("../src/compiler/catalog.js");
const engine = require("../src/audit/audit.js");
const { AUDIT_OPTS, auditResult } = require("../src/mcp/register-tools.js");

const DIR = path.join(__dirname, "..", "examples", "a11y");
const readSpec = (f) => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
const catalog = loadCatalog();

test("01 loop: compiles without warnings, guarded, with the 2.2.2 pause path", () => {
  const spec = readSpec("01-loop-with-pause.motionspec.json");
  const v = validateSpec(spec, catalog);
  assert.equal(v.ok, true);
  assert.deepEqual(v.warnings, []);
  const r = compileSpec(spec, catalog, { specName: "example-01" });
  assert.equal(r.ok, true);
  assert.match(r.css, /@media \(prefers-reduced-motion: no-preference\)/);
  assert.match(r.css, /html\[data-ms-paused\][^{]*\{ animation-play-state: paused !important; \}/);
  assert.match(r.js, /aria-pressed/);
  assert.match(r.js, /matchMedia\('\(prefers-reduced-motion: reduce\)'\)/);
});

test("01 loop: pauseControls \"off\" stays valid but warns MS-GLOBALS-PAUSE-OFF", () => {
  const spec = readSpec("01-loop-with-pause.motionspec.json");
  spec.globals.pauseControls = "off";
  const v = validateSpec(spec, catalog);
  assert.equal(v.ok, true);
  assert.deepEqual(v.warnings.map((w) => w.code), ["MS-GLOBALS-PAUSE-OFF"]);
});

test("02 interaction: CSS only, every motion inside the reduced-motion guard, transform only", () => {
  const spec = readSpec("02-interaction-reduced-motion.motionspec.json");
  const r = compileSpec(spec, catalog, { specName: "example-02" });
  assert.equal(r.ok, true);
  assert.deepEqual(r.warnings || [], []);
  assert.equal(r.js, null, "no JavaScript needed");
  const open = r.css.indexOf("@media (prefers-reduced-motion: no-preference) {");
  assert.ok(open > -1);
  const outside = r.css.slice(0, open);
  assert.equal(/transition|transform/.test(outside), false, "nothing animates outside the guard");
  for (const m of r.css.matchAll(/transition:\s*([a-z-]+)/g)) assert.equal(m[1], "transform");
});

test("03 audit: the five cases, the runtime disclosure and the withheld badge", async () => {
  const base = "https://example.test/";
  const pages = {
    [base]: { ok: true, text: fs.readFileSync(path.join(DIR, "03-audit-page", "index.html"), "utf8") },
    [base + "styles.css"]: { ok: true, text: fs.readFileSync(path.join(DIR, "03-audit-page", "styles.css"), "utf8") },
  };
  const fetchImpl = async (u) => pages[u] || { ok: false, error: "HTTP 404" };
  const res = await engine.audit(base, Object.assign({}, AUDIT_OPTS, { fetchImpl }));
  const out = auditResult(res, engine);

  assert.equal(out.status, "measured");
  assert.equal(out.scoring, "v2");
  assert.equal(out.score, 64);
  assert.equal(out.badge, null);

  const found = out.findings.map((f) => f.kind + " " + f.selector).sort();
  assert.deepEqual(found, [
    "infinite-no-pause .ticker span",
    "preload-candidate .spinner",
    "unguarded .cta",
    "unguarded .ticker span",
  ]);
  const selectors = out.findings.map((f) => f.selector);
  assert.equal(selectors.includes(".link"), false, "colour-only transition is not motion");
  assert.equal(selectors.includes(".card"), false, "guarded by the later reduced-motion rule");
  const spinner = out.findings.find((f) => f.selector === ".spinner");
  assert.equal(spinner.severity, "review");
  assert.ok(out.disclosures.some((d) => /Runtime motion library detected \(GSAP\)/.test(d)));
});
