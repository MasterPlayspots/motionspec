"use strict";
/* S2-01 discovery tool: covers what the catalog can do; the rest = a named gap. */
const { test } = require("node:test");
const assert = require("node:assert");
const { discover, toMarkdown, mapIntent } = require("../src/discover/discover.js");
const { KEYWORD_MAP } = require("../src/compiler/keyword-map.js");

test("known intents are mapped to primitives", () => {
  assert.equal(mapIntent("Headline gleitet herein").primitive, "scrollReveal");
  assert.equal(mapIntent("Karten gestaffelt").primitive, "staggerReveal");
  assert.equal(mapIntent("Zahlen zaehlen hoch").primitive, "counterUp");
  assert.equal(mapIntent("Logo-Band laeuft endlos").primitive, "marquee");
});

test("unknown intent produces a gap, not an error", () => {
  const r = discover({ project: "t", intents: [{ what: "WebGL-Partikelsturm mit Physik", target: ".bg" }] });
  assert.equal(r.covered.length, 0);
  assert.equal(r.gaps.length, 1);
  assert.ok(r.gaps[0].reason.includes("no catalog primitive"));
});

test("mixed brief: partly covered, partly a gap; Markdown names both", () => {
  const r = discover({ project: "mix", intents: [
    { what: "Headline einblenden", target: ".h" },
    { what: "WebGL Shader-Hintergrund mit Rauschen", target: ".bg" },
  ] });
  assert.equal(r.covered.length, 1);
  assert.equal(r.gaps.length, 1);
  const md = toMarkdown(r);
  assert.ok(md.includes("Gap report"));
  assert.ok(md.includes("GAPS"));
  assert.ok(md.includes("scrollReveal"));
});

test("discovery patches nothing silently — gaps stay gaps", () => {
  const r = discover({ intents: [{ what: "etwas voellig Neues xyz", target: ".x" }] });
  assert.equal(r.gaps.length, 1);
});

/* TASK-025 (Finding #22): the shared keyword source covers all 9 catalog
 * primitives (previously counterUp/marquee/scaleOnScroll were missing in the mock). */
test("KEYWORD_MAP covers all 40 catalog primitives", () => {
  const got = KEYWORD_MAP.map((k) => k.primitive).sort();
  assert.deepEqual(got, [
    "bounceLoop", "breatheLoop", "counterUp", "cssTransition", "fadeOnScroll",
    "flipLoop", "flipReveal", "floatLoop", "glideLoop", "hoverExpand",
    "hoverFlip", "hoverGrow", "hoverLift", "hoverRotate", "hoverSink",
    "hoverSkew", "hoverSpin", "jelloLoop", "kenBurns", "marquee",
    "marqueeVertical", "parallaxLayer", "parallaxX", "pinnedSection", "pressShrink",
    "pulseLoop", "revealScale", "rotateOnScroll", "scaleOnScroll", "scrollReveal",
    "skewOnScroll", "spinLoop", "squashLoop", "staggerReveal", "stretchLoop",
    "swayLoop", "swingLoop", "teeterLoop", "tiltLoop", "wobbleLoop",
  ]);
  // every entry has re/primitive/target/params (a complete source)
  for (const k of KEYWORD_MAP) {
    assert.ok(k.re instanceof RegExp && k.primitive && k.target && k.params);
  }
});
