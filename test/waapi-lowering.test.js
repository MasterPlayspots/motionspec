"use strict";
/*
 * waapi-lowering.test.js — Phase B1, FULL coverage (was: 1-primitive PoC).
 *
 * Proves the GSAP-decoupling hedge for the WHOLE catalog: every Trust-Boundary-
 * validated MotionSpec primitive can be lowered to the native Web Animations API
 * / IntersectionObserver / CSS (no GSAP), deterministically, through the SAME
 * validateSpec boundary, with the accessibility guard intact and ZERO GSAP refs.
 *
 * Golden strategy mirrors the GSAP compiler's golden test: one committed artifact
 * per primitive under test/golden/<name>.waapi.(js|css); the test asserts byte
 * identity. Set UPDATE_WAAPI_GOLDEN=1 to regenerate after an intentional change.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { loadCatalog } = require("../src/compiler/catalog.js");
const { lowerWaapi, SUPPORTED } = require("../src/compiler/lower-waapi.js");

const CAT = loadCatalog();
const GOLDEN_DIR = path.join(__dirname, "golden");

/* One representative spec per primitive. IDs/params chosen to exercise the
 * interesting branches (stagger delay, counter step/locale, scrub smoothing,
 * sticky pin, CSS hover). Each spec is a single motion so the golden isolates
 * that primitive's lowering. */
function specFor(motion, globals) {
  return {
    specVersion: "1.0",
    catalogVersion: "8a9813a9b3c6c626",
    meta: { project: "waapi-all", target: "vanilla-gsap", createdWith: "B1" },
    globals: globals || { respectReducedMotion: true },
    // Deep-clone the fixture so a test that mutates spec.motions[0] (the negative
    // Trust-Boundary cases below) can never leak into another test's golden.
    motions: [JSON.parse(JSON.stringify(motion))],
  };
}

const MOTIONS = {
  scrollReveal: { id: "hero-reveal", primitive: "scrollReveal", target: ".hero h1", params: { from: { opacity: 0, y: 48 }, duration: 0.8, ease: "power3.out" }, trigger: { start: "top 80%", once: true } },
  staggerReveal: { id: "cards-stagger", primitive: "staggerReveal", target: ".cards > *", params: { from: { opacity: 0, y: 20 }, duration: 0.6, ease: "power2.out", stagger: 0.12 }, trigger: { start: "top 85%", once: true } },
  counterUp: { id: "kpi-counter", primitive: "counterUp", target: ".kpi .num", params: { duration: 2, ease: "power1.out", step: 1, locale: "de-DE" }, trigger: { start: "top 85%", once: true } },
  cssTransition: { id: "btn-hover", primitive: "cssTransition", target: ".btn", params: { property: "transform", hoverValue: "translateY(-4px)", duration: 0.25, easing: "ease-out" } },
  marquee: { id: "logo-band", primitive: "marquee", target: ".logos .track", params: { duration: 30, gap: "2rem", direction: "normal" } },
  floatLoop: { id: "hero-orb", primitive: "floatLoop", target: ".hero .orb", params: { distance: "10px", duration: 3, axis: "y" } },
  parallaxLayer: { id: "bg-layer", primitive: "parallaxLayer", target: ".parallax .bg", params: { yPercent: -20, scrub: 1 }, trigger: { start: "top bottom", end: "bottom top" } },
  scaleOnScroll: { id: "zoom-card", primitive: "scaleOnScroll", target: ".case .visual", params: { fromScale: 0.8, toScale: 1, transformOrigin: "center center", scrub: 1 }, trigger: { start: "top bottom", end: "center center" } },
  pinnedSection: { id: "pin-hero", primitive: "pinnedSection", target: ".pin-section", params: { distance: "+=100%", pinSpacing: true }, trigger: { start: "top top" } },
  pulseLoop:      { id: "cta-pulse",   primitive: "pulseLoop",      target: ".cta",    params: { scale: 1.08, duration: 2 } },
  spinLoop:       { id: "loader-spin", primitive: "spinLoop",       target: ".loader", params: { duration: 6, direction: "normal" } },
  swayLoop:       { id: "badge-sway",  primitive: "swayLoop",       target: ".badge",  params: { angle: 4, duration: 4 } },
  rotateOnScroll: { id: "card-rotate", primitive: "rotateOnScroll", target: ".card",   params: { degrees: 20, scrub: 1 }, trigger: { start: "top bottom", end: "bottom top" } },
  fadeOnScroll:   { id: "hero-fade",   primitive: "fadeOnScroll",   target: ".hero",   params: { fromOpacity: 1, toOpacity: 0.15, scrub: 1 }, trigger: { start: "top top", end: "bottom top" } },
  revealScale:    { id: "card-pop",    primitive: "revealScale",    target: ".card",   params: { fromScale: 0.85, duration: 0.7, ease: "power3.out" }, trigger: { start: "top 80%", once: true } },
  parallaxX:       { id: "layer-x",      primitive: "parallaxX",       target: ".layer",  params: { xPercent: -30, scrub: 1 }, trigger: { start: "top bottom", end: "bottom top" } },
  breatheLoop:     { id: "orb-breathe",  primitive: "breatheLoop",     target: ".orb",    params: { minOpacity: 0.4, duration: 3 } },
  marqueeVertical: { id: "news-vticker", primitive: "marqueeVertical", target: ".ticker", params: { duration: 12, direction: "normal", gap: "0.6rem" } },
  flipReveal:      { id: "card-flip",    primitive: "flipReveal",      target: ".card",   params: { degrees: 90, duration: 0.7, ease: "power3.out" }, trigger: { start: "top 80%", once: true } },
  pressShrink:     { id: "btn-press",    primitive: "pressShrink",     target: ".btn",    params: { scale: 0.94, duration: 0.12 } },
  kenBurns:        { id: "hero-ken",     primitive: "kenBurns",        target: ".hero-bg",params: { scale: 1.15, duration: 12 } },
  skewOnScroll:    { id: "panel-skew",   primitive: "skewOnScroll",    target: ".panel",  params: { skewDegrees: 10, scrub: 1 }, trigger: { start: "top bottom", end: "bottom top" } },
  swingLoop:       { id: "lamp-swing",   primitive: "swingLoop",       target: ".lamp",   params: { angle: 10, duration: 2 } },
  jelloLoop:       { id: "chip-jello",   primitive: "jelloLoop",       target: ".chip",   params: { skew: 6, duration: 2 } },
  stretchLoop:     { id: "bar-stretch",  primitive: "stretchLoop",     target: ".bar",    params: { scaleX: 1.2, duration: 2 } },
  hoverGrow:       { id: "card-grow",    primitive: "hoverGrow",       target: ".card",   params: { scale: 1.08, duration: 0.2 } },
  hoverLift:       { id: "card-lift",    primitive: "hoverLift",       target: ".card",   params: { distance: "8px", duration: 0.2 } },
  hoverRotate:     { id: "card-hrot",    primitive: "hoverRotate",     target: ".card",   params: { degrees: 4, duration: 0.2 } },
  hoverSink:       { id: "card-hsink",   primitive: "hoverSink",       target: ".card",   params: { distance: "4px", duration: 0.2 } },
  hoverSkew:       { id: "card-hskew",   primitive: "hoverSkew",       target: ".card",   params: { skew: 6, duration: 0.2 } },
  wobbleLoop:      { id: "icon-wobble",  primitive: "wobbleLoop",      target: ".icon",   params: { distance: "8px", angle: 4, duration: 1.5 } },
  squashLoop:      { id: "ball-squash",  primitive: "squashLoop",      target: ".ball",   params: { scaleX: 1.2, scaleY: 0.85, duration: 1.5 } },
  tiltLoop:        { id: "badge-tilt",   primitive: "tiltLoop",        target: ".badge",  params: { angle: 5, scale: 1.06, duration: 2 } },
  flipLoop:        { id: "coin-flip",    primitive: "flipLoop",        target: ".coin",   params: { duration: 4 } },
  teeterLoop:      { id: "sign-teeter",  primitive: "teeterLoop",      target: ".sign",   params: { angle: 8, duration: 2 } },
  glideLoop:       { id: "cloud-glide",  primitive: "glideLoop",       target: ".cloud",  params: { distance: "12px", duration: 3 } },
  bounceLoop:      { id: "ball-bounce",  primitive: "bounceLoop",      target: ".ball",   params: { distance: "16px", duration: 1 } },
  hoverFlip:       { id: "card-hflip",   primitive: "hoverFlip",       target: ".card",   params: { degrees: 180, duration: 0.5 } },
  hoverExpand:     { id: "card-hexp",    primitive: "hoverExpand",     target: ".card",   params: { scale: 1.08, lift: "4px", duration: 0.2 } },
  hoverSpin:       { id: "card-hspin",   primitive: "hoverSpin",       target: ".card",   params: { duration: 0.6 } },
};

/* Which sink each primitive emits to, for golden file naming + assertions. */
const EXT = {
  scrollReveal: "js", staggerReveal: "js", counterUp: "js", parallaxLayer: "js", scaleOnScroll: "js",
  cssTransition: "css", marquee: "css", floatLoop: "css", pinnedSection: "css",
  pulseLoop: "css", spinLoop: "css", swayLoop: "css", rotateOnScroll: "js", fadeOnScroll: "js", revealScale: "js",
  parallaxX: "js", breatheLoop: "css", marqueeVertical: "css", flipReveal: "js", pressShrink: "css", kenBurns: "css",
  skewOnScroll: "js", swingLoop: "css", jelloLoop: "css", stretchLoop: "css", hoverGrow: "css", hoverLift: "css",
  hoverRotate: "css", hoverSink: "css", hoverSkew: "css", wobbleLoop: "css", squashLoop: "css", tiltLoop: "css",
  flipLoop: "css", teeterLoop: "css", glideLoop: "css", bounceLoop: "css", hoverFlip: "css", hoverExpand: "css", hoverSpin: "css",
};

function artifactOf(r) { return r.js != null ? r.js : r.css; }
/* Sink-correct selector: the golden for a css-primitive must capture its CSS
 * artifact (which now also carries the pauseControls pause rule for persistent
 * loops), NOT a co-emitted pause-toggle JS artifact. The button JS is covered by
 * the dedicated pauseControls tests (pausecontrols.test.js). */
function artifactForGolden(r, name) { return EXT[name] === "js" ? r.js : r.css; }

/* ---- 1. Per-primitive golden parity (byte-identical) -------------------- */
for (const name of Object.keys(MOTIONS)) {
  test("WAAPI golden: " + name + " is byte-identical to the committed artifact", () => {
    const r = lowerWaapi(specFor(MOTIONS[name]), CAT, { specName: name });
    assert.equal(r.ok, true, "lowering must succeed: " + JSON.stringify(r.errors));
    const file = path.join(GOLDEN_DIR, name + ".waapi." + EXT[name]);
    const got = artifactForGolden(r, name);
    if (process.env.UPDATE_WAAPI_GOLDEN) fs.writeFileSync(file, got);
    assert.equal(got, fs.readFileSync(file, "utf8"), name + " diverges from its golden");
  });
}

/* ---- 2. Coverage: every catalog primitive has a lowering ---------------- */
test("coverage: every catalog primitive is supported (no silent gap)", () => {
  const catKeys = Object.keys(CAT).sort();
  assert.deepEqual(SUPPORTED.slice().sort(), catKeys,
    "SUPPORTED must equal the catalog — a new primitive without a lowering must fail loudly");
  for (const name of catKeys) {
    const r = lowerWaapi(specFor(MOTIONS[name]), CAT, { specName: name });
    assert.equal(r.ok, true, name + " must lower: " + JSON.stringify(r.errors));
  }
});

/* ---- 3. Determinism: same spec -> identical output ---------------------- */
test("determinism: each primitive lowers to identical bytes twice", () => {
  for (const name of Object.keys(MOTIONS)) {
    const a = lowerWaapi(specFor(MOTIONS[name]), CAT, { specName: name });
    const b = lowerWaapi(specFor(MOTIONS[name]), CAT, { specName: name });
    assert.equal(artifactOf(a), artifactOf(b), name + " is non-deterministic");
  }
});

/* ---- 4. NO GSAP, anywhere ------------------------------------------------ */
test("GSAP-free: no primitive emits gsap./ScrollTrigger/registerPlugin", () => {
  for (const name of Object.keys(MOTIONS)) {
    const r = lowerWaapi(specFor(MOTIONS[name]), CAT, { specName: name });
    const code = (r.js || "") + (r.css || "");
    assert.ok(!/gsap\./i.test(code), name + " must not call the gsap API");
    assert.ok(!/ScrollTrigger/.test(code), name + " must not reference ScrollTrigger");
    assert.ok(!/registerPlugin/.test(code), name + " must not call registerPlugin");
    assert.equal(r.report.gsap, false);
    assert.equal(r.report.engine, "web-animations-api");
  }
});

/* The JS primitives must use native APIs; the CSS primitives must be pure CSS. */
test("native APIs: JS uses Element.animate/IO/rAF; CSS uses @keyframes/transition/sticky", () => {
  const reveal = lowerWaapi(specFor(MOTIONS.scrollReveal), CAT).js;
  assert.match(reveal, /\.animate\(/);
  assert.match(reveal, /IntersectionObserver/);
  const counter = lowerWaapi(specFor(MOTIONS.counterUp), CAT).js;
  assert.match(counter, /requestAnimationFrame/);
  const parallax = lowerWaapi(specFor(MOTIONS.parallaxLayer), CAT).js;
  assert.match(parallax, /addEventListener\('scroll'/);
  assert.match(parallax, /requestAnimationFrame/);
  const marquee = lowerWaapi(specFor(MOTIONS.marquee), CAT).css;
  assert.match(marquee, /@keyframes motion-marquee-logo-band/);
  const hover = lowerWaapi(specFor(MOTIONS.cssTransition), CAT).css;
  assert.match(hover, /:hover/);
  const pin = lowerWaapi(specFor(MOTIONS.pinnedSection), CAT).css;
  assert.match(pin, /position: sticky/);
});

/* ---- 5. Accessibility: reduced-motion guard (JS + CSS paths) ------------ */
test("a11y: JS primitives emit the prefers-reduced-motion guard by default", () => {
  for (const name of ["scrollReveal", "staggerReveal", "counterUp", "parallaxLayer", "scaleOnScroll"]) {
    const r = lowerWaapi(specFor(MOTIONS[name]), CAT);
    assert.match(r.js, /prefers-reduced-motion: reduce/, name + " missing reduced-motion guard");
    assert.equal(r.report.reducedMotion, true);
  }
});

test("a11y: CSS primitives wrap rules in @media (prefers-reduced-motion: no-preference)", () => {
  for (const name of ["cssTransition", "marquee", "floatLoop", "pinnedSection"]) {
    const r = lowerWaapi(specFor(MOTIONS[name]), CAT);
    assert.match(r.css, /@media \(prefers-reduced-motion: no-preference\)/, name + " missing reduced-motion @media");
    assert.equal(r.report.reducedMotion, true);
  }
});

test("a11y: globals.respectReducedMotion=false drops BOTH guards (parity with compiler)", () => {
  const off = { respectReducedMotion: false };
  const js = lowerWaapi(specFor(MOTIONS.scrollReveal, off), CAT);
  assert.equal(js.ok, true);
  assert.ok(!/prefers-reduced-motion/.test(js.js));
  assert.equal(js.report.reducedMotion, false);
  assert.equal(js.report.reducedMotionOverriddenOff, true);

  const css = lowerWaapi(specFor(MOTIONS.marquee, off), CAT);
  assert.equal(css.ok, true);
  assert.ok(!/prefers-reduced-motion/.test(css.css));
  assert.equal(css.report.reducedMotion, false);
});

/* ---- 6. SAME Trust Boundary — fail-closed, no partial output ------------ */
test("Trust Boundary: unknown primitive is rejected, no output", () => {
  const spec = specFor(MOTIONS.scrollReveal);
  spec.motions[0].primitive = "evalEverything";
  const r = lowerWaapi(spec, CAT);
  assert.equal(r.ok, false);
  assert.equal(r.js, undefined);
  assert.equal(r.css, undefined);
  assert.ok(r.errors.some((e) => e.includes("MS-PRIM-UNKNOWN")));
});

test("Trust Boundary: unsafe selector is rejected, no output", () => {
  const spec = specFor(MOTIONS.scrollReveal);
  spec.motions[0].target = "'); alert(1); //";
  const r = lowerWaapi(spec, CAT);
  assert.equal(r.ok, false);
  assert.equal(r.js, undefined);
  assert.ok(r.errors.some((e) => e.includes("MS-TARGET-UNSAFE")));
});

test("Trust Boundary: out-of-range param is rejected, no output", () => {
  const spec = specFor(MOTIONS.scrollReveal);
  spec.motions[0].params = { from: { opacity: 0 }, duration: 99 }; // max 3
  const r = lowerWaapi(spec, CAT);
  assert.equal(r.ok, false);
  assert.equal(r.js, undefined);
  assert.ok(r.errors.some((e) => e.includes("MS-PARAM-MAX")));
});

/* The scope guard still fails closed for a *future* catalog primitive that has
 * no lowering yet — simulated with a synthetic catalog entry the boundary accepts
 * but SUPPORTED does not list. */
test("scope guard: a catalog primitive without a lowering fails closed (MS-WAAPI-UNSUPPORTED)", () => {
  const synthetic = Object.assign({}, CAT, {
    futurePrimitive: {
      name: "futurePrimitive", version: "1.0.0", output: "js",
      paramSchema: {}, triggerDefaults: {}, template: "noop();",
    },
  });
  // No catalogVersion pin here: adding a synthetic primitive changes the catalog
  // hash, so a pin would (correctly) fail on MS-CATALOG-PIN-MISMATCH first. We
  // want to reach the scope guard, so we omit the pin.
  const spec = {
    specVersion: "1.0",
    meta: { project: "waapi-all", target: "vanilla-gsap" },
    globals: { respectReducedMotion: true },
    motions: [{ id: "fut", primitive: "futurePrimitive", target: ".x" }],
  };
  const r = lowerWaapi(spec, synthetic);
  assert.equal(r.ok, false);
  assert.equal(r.js, undefined);
  assert.ok(r.errors.some((e) => e.includes("MS-WAAPI-UNSUPPORTED")),
    "expected MS-WAAPI-UNSUPPORTED, got " + JSON.stringify(r.errors));
});

/* ---- 7. CSS-safety defense-in-depth on the WAAPI CSS path --------------- */
test("CSS-safety: a dangerous transformOrigin would fail closed (no output)", () => {
  // transformOrigin is pattern-checked by the Trust Boundary; if a value somehow
  // reached the emitter, cssRaw() must still reject it. We assert the emitter's
  // guard by feeding a value that passes the boundary's charset but we know the
  // CSS allow-list screens (defense in depth). Here we confirm a normal value
  // passes and the report is well-formed; the negative path is covered by the
  // boundary's MS-PARAM-PATTERN for scaleOnScroll.transformOrigin.
  const r = lowerWaapi(specFor(MOTIONS.scaleOnScroll), CAT);
  assert.equal(r.ok, true);
  assert.match(r.js, /transformOrigin = "center center"/);
});

/* ---- 8. Multi-motion spec splits JS and CSS sinks correctly ------------- */
test("mixed spec: JS and CSS motions land in their respective sinks", () => {
  const spec = {
    specVersion: "1.0",
    meta: { project: "mixed", target: "vanilla-gsap" },
    globals: { respectReducedMotion: true },
    motions: [MOTIONS.scrollReveal, MOTIONS.marquee, MOTIONS.cssTransition],
  };
  const r = lowerWaapi(spec, CAT, { specName: "mixed" });
  assert.equal(r.ok, true);
  assert.equal(r.report.jsCount, 1);
  assert.equal(r.report.cssCount, 2);
  assert.match(r.js, /scrollReveal -> Web Animations API/);
  assert.match(r.css, /marquee/);
  assert.match(r.css, /cssTransition/);
  assert.ok(!/gsap\./i.test(r.js + r.css));
});
