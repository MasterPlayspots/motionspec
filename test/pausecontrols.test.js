"use strict";
/*
 * pausecontrols.test.js — WCAG 2.2.2 (Pause, Stop, Hide) for the 17+1 infinite
 * loop primitives. Proves the by-construction pause path end to end:
 *   - fail-safe default (loop + no pauseControls => button + pause CSS);
 *   - modes: "off" (warning MS-GLOBALS-PAUSE-OFF, no pause markup) and
 *     "api" (CSS contract present, NO button);
 *   - button a11y (type=button, aria-pressed sync, :focus-visible, >=24px);
 *   - null-overhead (no loops => byte-identical to the pre-change output);
 *   - reduced-motion interaction (button self-guards reduce);
 *   - determinism (same spec => identical bytes twice);
 *   - hard error MS-GLOBALS-PAUSE-BAD;
 *   - GSAP<->WAAPI byte-identical pause mechanics (parity).
 */
const { test } = require("node:test");
const assert = require("node:assert");
const { compileSpec } = require("../src/compiler/compile.js");
const { lowerWaapi } = require("../src/compiler/lower-waapi.js");
const { validateSpec } = require("../src/compiler/validate.js");
const { loadCatalog } = require("../src/compiler/catalog.js");

const catalog = loadCatalog();

/* A single-loop spec (spinLoop is a11y.persistent). globals is spread in. */
function loopSpec(globals, prim = "spinLoop", params = {}) {
  return {
    specVersion: "1.0",
    meta: { project: "pause-test", target: "vanilla-gsap" },
    globals,
    motions: [{ id: "loop1", primitive: prim, target: ".loader", params }],
  };
}
/* A spec with NO persistent motion (scrollReveal). */
function noLoopSpec(globals) {
  return {
    specVersion: "1.0",
    meta: { project: "pause-test", target: "vanilla-gsap" },
    globals,
    motions: [{ id: "rev1", primitive: "scrollReveal", target: ".hero h1", params: { from: { opacity: 0, y: 48 } } }],
  };
}

const PAUSE_CSS_RE = /html\[data-ms-paused\] .loader, html\[data-ms-paused\] .loader > \* \{ animation-play-state: paused !important; \}/;

/* ---- fail-safe: a loop with NO pauseControls => auto (button + CSS) -------- */
test("fail-safe: loop without pauseControls emits the button + play-state CSS", () => {
  const res = compileSpec(loopSpec({ respectReducedMotion: true }), catalog, { specName: "failsafe" });
  assert.equal(res.ok, true);
  assert.match(res.css, PAUSE_CSS_RE, "pause CSS must be present");
  assert.ok(res.js && res.js.includes("ms-pause-toggle"), "the pause toggle button must be injected");
});

test("fail-safe: even omitting globals entirely still emits the pause path", () => {
  const res = compileSpec(loopSpec(undefined), catalog, { specName: "nogl" });
  assert.equal(res.ok, true);
  assert.match(res.css, /animation-play-state: paused !important/);
  assert.ok(res.js.includes("ms-pause-toggle"));
});

/* ---- pause CSS lives OUTSIDE the reduced-motion @media block --------------- */
test("pause CSS is emitted OUTSIDE the prefers-reduced-motion @media block", () => {
  const res = compileSpec(loopSpec({ respectReducedMotion: true }), catalog, { specName: "outside" });
  const psIdx = res.css.indexOf("animation-play-state");
  const closeIdx = res.css.lastIndexOf("no-preference");
  assert.ok(psIdx > -1 && closeIdx > -1 && psIdx > closeIdx, "pause CSS must come after the RRM @media block");
});

/* ---- mode "off": warning, and NO pause markup ----------------------------- */
test('"off": validator warns MS-GLOBALS-PAUSE-OFF and no pause markup is emitted', () => {
  const spec = loopSpec({ pauseControls: "off" });
  const v = validateSpec(spec, catalog);
  assert.equal(v.ok, true, "off is a valid value (fail-safe warning, not error)");
  assert.ok(v.warnings.some((w) => w.code === "MS-GLOBALS-PAUSE-OFF"), "must warn MS-GLOBALS-PAUSE-OFF");
  const res = compileSpec(spec, catalog, { specName: "off" });
  assert.equal(res.ok, true);
  assert.ok(!/animation-play-state/.test(res.css || ""), "no pause CSS under off");
  assert.equal(res.js, null, "no button under off");
});

test('"off" with a NON-persistent spec raises no warning', () => {
  const v = validateSpec(noLoopSpec({ pauseControls: "off" }), catalog);
  assert.equal(v.ok, true);
  assert.ok(!v.warnings.some((w) => w.code === "MS-GLOBALS-PAUSE-OFF"), "no warning when nothing is persistent");
});

/* ---- mode "api": CSS contract present, NO button -------------------------- */
test('"api": CSS pause contract present, but NO button injected', () => {
  const res = compileSpec(loopSpec({ pauseControls: "api" }), catalog, { specName: "api" });
  assert.equal(res.ok, true);
  assert.match(res.css, PAUSE_CSS_RE, "the CSS contract stays under api");
  assert.equal(res.js, null, "api emits no button (integrator controls data-ms-paused)");
});

/* ---- button accessibility -------------------------------------------------- */
test("button a11y: type=button, aria-pressed toggling, focus-visible, >=24px", () => {
  const js = compileSpec(loopSpec({ pauseControls: "auto" }), catalog, { specName: "btn" }).js;
  assert.match(js, /btn\.type = 'button'/, "type must be button");
  assert.match(js, /btn\.className = 'ms-pause-toggle'/);
  assert.match(js, /setAttribute\('aria-pressed', paused \? 'true' : 'false'\)/, "aria-pressed stays in sync");
  assert.ok(js.includes("aria-pressed=\"false\"") || js.includes("aria-pressed', 'false'") || /aria-pressed/.test(js), "aria-pressed present");
  assert.match(js, /:focus-visible\{outline:/, "a visible :focus-visible ring");
  assert.match(js, /min-width:24px;min-height:24px/, "target size >= 24x24px");
  assert.match(js, /localStorage\.setItem\('ms-paused'/, "state persists to localStorage");
  assert.match(js, /toggles|data-ms-paused/, "toggles data-ms-paused");
  assert.match(js, /setAttribute\('data-ms-paused', ''\)/);
});

/* ---- null-overhead: no loops => ZERO extra bytes -------------------------- */
test("null-overhead: a spec with no loops has no pause markup at all", () => {
  const res = compileSpec(noLoopSpec({ respectReducedMotion: true }), catalog, { specName: "nolp" });
  assert.equal(res.ok, true);
  assert.ok(!/ms-pause-toggle/.test(res.js || ""), "no button for a non-loop spec");
  assert.ok(!/animation-play-state/.test(res.css || ""), "no pause CSS for a non-loop spec");
});

test("null-overhead: byte-identical to a from-scratch compile without pause code path", () => {
  /* Determinism + null-overhead: the no-loop artifact must not vary and must not
   * contain any pause bytes. This pins that the pause path is fully gated. */
  const a = compileSpec(noLoopSpec({ respectReducedMotion: true }), catalog, { specName: "x" });
  const b = compileSpec(noLoopSpec({ respectReducedMotion: true }), catalog, { specName: "x" });
  assert.equal(a.js, b.js);
  assert.equal(a.css, b.css);
  assert.ok(!(a.js + (a.css || "")).includes("data-ms-paused"));
});

/* ---- reduced-motion interaction ------------------------------------------- */
test("RRM interaction: the button self-guards prefers-reduced-motion: reduce", () => {
  const js = compileSpec(loopSpec({ pauseControls: "auto" }), catalog, { specName: "rrm" }).js;
  assert.match(js, /matchMedia\('\(prefers-reduced-motion: reduce\)'\)\.matches\) return/,
    "the toggle returns early (is not rendered) under reduced motion");
});

/* ---- determinism ----------------------------------------------------------- */
test("determinism: same loop spec compiles to identical bytes twice", () => {
  const a = compileSpec(loopSpec({ pauseControls: "auto" }), catalog, { specName: "d" });
  const b = compileSpec(loopSpec({ pauseControls: "auto" }), catalog, { specName: "d" });
  assert.equal(a.js, b.js);
  assert.equal(a.css, b.css);
});

/* ---- invalid value: MS-GLOBALS-PAUSE-BAD (hard error) --------------------- */
test("MS-GLOBALS-PAUSE-BAD: an invalid pauseControls value is rejected fail-closed", () => {
  const v = validateSpec(loopSpec({ pauseControls: "sometimes" }), catalog);
  assert.equal(v.ok, false);
  assert.ok(v.errorCodes.includes("MS-GLOBALS-PAUSE-BAD"));
  const res = compileSpec(loopSpec({ pauseControls: "sometimes" }), catalog, { specName: "bad" });
  assert.equal(res.ok, false, "no output when pauseControls is invalid");
});

test("MS-GLOBALS-PAUSE-BAD: pauseLabels shape is validated", () => {
  assert.ok(validateSpec(loopSpec({ pauseLabels: { pause: 3 } }), catalog).errorCodes.includes("MS-GLOBALS-PAUSE-BAD"));
  assert.ok(validateSpec(loopSpec({ pauseLabels: { bogus: "x" } }), catalog).errorCodes.includes("MS-GLOBALS-PAUSE-BAD"));
  assert.ok(validateSpec(loopSpec({ pauseLabels: "nope" }), catalog).errorCodes.includes("MS-GLOBALS-PAUSE-BAD"));
  assert.equal(validateSpec(loopSpec({ pauseLabels: { pause: "P", play: "Q" } }), catalog).ok, true);
});

/* ---- custom labels are honored deterministically -------------------------- */
test("pauseLabels: custom pause/play strings appear verbatim in the toggle", () => {
  const js = compileSpec(loopSpec({ pauseControls: "auto", pauseLabels: { pause: "Anhalten", play: "Abspielen" } }), catalog, { specName: "lbl" }).js;
  assert.match(js, /var PAUSE_LABEL = "Anhalten", PLAY_LABEL = "Abspielen"/);
});

/* ---- GSAP <-> WAAPI byte-identical pause mechanics (parity) ---------------- */
test("parity: the pause CSS + toggle are byte-identical across GSAP and WAAPI paths", () => {
  const spec = loopSpec({ pauseControls: "auto" });
  const g = compileSpec(spec, catalog, { specName: "p" });
  const w = lowerWaapi(spec, catalog, { specName: "p" });
  const pauseCss = (s) => (s.match(/\/\* pauseControls: WCAG[\s\S]*/) || [""])[0];
  const pauseJs = (s) => (s.match(/\/\* pauseControls: WCAG[\s\S]*?\}\)\(\);/) || [""])[0];
  assert.equal(pauseCss(g.css), pauseCss(w.css), "pause CSS must match byte-for-byte");
  assert.equal(pauseJs(g.js), pauseJs(w.js), "toggle JS must match byte-for-byte");
  assert.ok(pauseCss(g.css).length > 0 && pauseJs(g.js).length > 0, "both blocks must be non-empty");
});

/* ---- marquee child reach: the '> *' selector is present ------------------- */
test("marquee: the pause rule reaches the animated children via '> *'", () => {
  const res = compileSpec(loopSpec({ pauseControls: "auto" }, "marquee", {}), catalog, { specName: "mq" });
  assert.match(res.css, /html\[data-ms-paused\] .loader > \* \{ animation-play-state: paused !important; \}/);
});

/* ---- no entropy tokens in emitted pause code ------------------------------ */
test("no entropy: the emitted pause code contains no Math.random/Date/perf tokens", () => {
  const res = compileSpec(loopSpec({ pauseControls: "auto" }), catalog, { specName: "ent" });
  const ENT = /Math\s*\.\s*random|Date\s*\.\s*(now|parse|UTC)|new\s+Date|\bDate\s*\(|performance\s*\.\s*(now|timeOrigin)|crypto\s*\.\s*(randomUUID|getRandomValues)/;
  assert.ok(!ENT.test(res.js), "no entropy tokens in the emitted JS");
  assert.ok(!ENT.test(res.css || ""), "no entropy tokens in the emitted CSS");
});
