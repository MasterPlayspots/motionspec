"use strict";
/*
 * Demo page generator (MS-01 / T01) — device verification of the primitives.
 *
 *   node bin/motion.js demo   ->  out/demo/index.html
 *
 * A scrollable page with one section per primitive. The motion code is
 * REAL compiler output (compileSpec) — so what gets verified is exactly
 * what customers receive, not a re-creation.
 *
 * Reduced-motion simulation: ?rm=1 overrides window.matchMedia BEFORE the
 * motion script — this tests the real gate path in the compiled code.
 *
 * Demo blocks: every primitive MAY carry a "demo" field
 *   { html, params, trigger? }  — otherwise the generic block applies.
 */
const fs = require("fs");
const path = require("path");
const { loadCatalog, catalogVersion } = require("../compiler/catalog.js");
const { compileSpec } = require("../compiler/compile.js");

/* Fallback demos for the existing set (catalog definitions without a demo field) */
const BUILTIN_DEMOS = {
  scrollReveal: {
    html: '<h2 class="d-scrollReveal">scrollReveal — slides in on entry</h2>',
    params: { from: { opacity: 0, y: 48 }, duration: 0.8 },
  },
  staggerReveal: {
    html: '<div class="grid"><div class="card d-staggerReveal">Card 1</div><div class="card d-staggerReveal">Card 2</div><div class="card d-staggerReveal">Card 3</div></div>',
    params: { from: { opacity: 0, y: 32 }, stagger: 0.15 },
  },
  parallaxLayer: {
    html: '<div class="parallax-frame"><div class="bg d-parallaxLayer">PARALLAX</div><p>Foreground scrolls normally, background is offset.</p></div>',
    params: { yPercent: -25, scrub: 1 },
  },
  pinnedSection: {
    html: '<div class="pin-stage d-pinnedSection"><h2>pinnedSection</h2><p>This section stays pinned while you keep scrolling.</p></div>',
    params: { distance: "+=80%" },
  },
  cssTransition: {
    html: '<button class="cta d-cssTransition">Hover me — cssTransition</button>',
    params: { hoverValue: "translateY(-4px) scale(1.04)", duration: 0.25 },
  },
};

const CHECKLIST = [
  "Does the motion run smoothly (no jank) when scrolling slowly AND fast?",
  "Mobile: same check on a real phone (not just DevTools).",
  "Append ?rm=1: content must be visible immediately, no motion.",
  "Layout shift? Elements must not cause a jump before the animation.",
  "After the check passes: set performance.verifiedAt in the primitive.",
];

/* Page generation adopts the ORIGINAL brand palette (see :root tokens below).
 * A primitive's demo HTML may still carry a stray placeholder color; map those
 * known non-brand values onto the brand tokens so the generated page stays
 * on-palette. The primitive JSON is NOT touched (catalog hash stays stable). */
const DEMO_COLOR_MAP = { "#6366f1": "var(--teal)", "#6366F1": "var(--teal)" };
function brandColors(html) {
  return String(html).replace(/#[0-9a-fA-F]{6}/g, (h) => DEMO_COLOR_MAP[h] || h);
}

function buildDemo(outDir, catalog) {
  catalog = catalog || loadCatalog();
  const names = Object.keys(catalog).sort();
  const motions = [];
  const sections = [];

  names.forEach((name) => {
    const prim = catalog[name];
    const demo = prim.demo || BUILTIN_DEMOS[name];
    if (!demo) {
      sections.push('<section class="prim"><h2>' + name + "</h2><p class='miss'>NO DEMO BLOCK — primitive must not be verified.</p></section>");
      return;
    }
    const target = "." + "d-" + name;
    motions.push(Object.assign(
      { id: "demo-" + name, primitive: name, target, params: demo.params || {} },
      demo.trigger ? { trigger: demo.trigger } : {}
    ));
    sections.push(
      '<section class="prim" id="' + name + '">' +
      "<h3>" + name + ' <span class="v">' + (prim.performance && prim.performance.verifiedAt ? "verified " + prim.performance.verifiedAt : "UNVERIFIED") + "</span></h3>" +
      '<p class="purpose">' + (prim.purpose || "") + "</p>" +
      '<div class="stage">' + brandColors(demo.html) + "</div>" +
      "</section>"
    );
  });

  const spec = {
    specVersion: "1.0",
    meta: { project: "demo", target: "vanilla-gsap", createdWith: "demo-generator" },
    globals: { respectReducedMotion: true },
    motions,
  };
  const res = compileSpec(spec, catalog, { specName: "demo" });
  if (!res.ok) throw new Error("Demo spec rejected:\n  " + res.errors.join("\n  "));

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MotionSpec — verification demo (catalog ${catalogVersion(catalog)})</title>
<style>
  :root {
    color-scheme: dark;
    /* MotionSpec brand palette — the ORIGINAL colors adopted at page generation
     * (source: internal design handoff). */
    --bg: #0B1224; --surface: #1B2340; --surface-2: #17224D;
    --text: #E7EDF6; --bright: #FFFFFF; --muted: #8A94A6; --muted-2: #586074;
    --teal: #12B5A5; --teal-hover: #0E9384; --violet: #6D5AE6; --orange: #E2683F;
    --on-teal: #06231F; --line: rgba(88,96,116,.35);
  }
  body { font-family: Inter, system-ui, sans-serif; margin: 0; line-height: 1.5; background: var(--bg); color: var(--text); }
  a { color: var(--teal); }
  h1, h2, h3 { color: var(--bright); }
  code { font-family: "JetBrains Mono", ui-monospace, monospace; color: var(--teal); }
  header, footer { padding: 3rem 1.5rem; max-width: 52rem; margin: 0 auto; }
  footer { color: var(--muted-2); }
  .prim { min-height: 90vh; padding: 4rem 1.5rem; max-width: 52rem; margin: 0 auto; border-top: 1px solid var(--line); }
  .stage { margin-top: 2rem; }
  .grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 1rem; }
  .card { padding: 2rem 1rem; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; text-align: center; }
  .parallax-frame { position: relative; overflow: hidden; border-radius: 14px; padding: 4rem 1rem; background: var(--surface-2); border: 1px solid var(--line); }
  .parallax-frame .bg { position: absolute; inset: -30% 0; display: flex; align-items: center; justify-content: center; font-size: 4rem; opacity: .12; pointer-events: none; color: var(--teal); }
  .pin-stage { padding: 3rem 1rem; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; }
  .cta { font-size: 1rem; padding: .8rem 1.6rem; border-radius: 10px; border: none; cursor: pointer; background: var(--teal); color: var(--on-teal); font-weight: 600; }
  .counter { font-size: 3rem; font-weight: 700; color: var(--bright); }
  .v { font-size: .65rem; padding: .15rem .5rem; border: 1px solid var(--teal); color: var(--teal); border-radius: 99px; vertical-align: middle; }
  .miss { color: var(--orange); font-weight: 600; }
  .purpose { color: var(--muted); }
  .rm-note { padding: .6rem 1rem; border: 1px dashed var(--muted-2); border-radius: 8px; font-size: .85rem; color: var(--muted); }
  ol li { margin-bottom: .4rem; }
  .marquee-track { overflow: hidden; white-space: nowrap; border: 1px solid var(--line); border-radius: 14px; padding: 1rem 0; }
</style>
${res.css ? "<style>\n" + res.css + "</style>" : ""}
</head>
<body>
<header>
  <h1>MotionSpec — verification demo</h1>
  <p>Catalog <code>${catalogVersion(catalog)}</code> · ${names.length} primitives · compiler output 1:1 as in production.</p>
  <p class="rm-note">Test the reduced-motion path: <a href="?rm=1">append ?rm=1</a> — everything must be visible immediately, without motion.</p>
  <details><summary><strong>Device checklist (MS-02)</strong></summary><ol>${CHECKLIST.map((c) => "<li>" + c + "</li>").join("")}</ol></details>
</header>
${sections.join("\n")}
<footer><p>The end. If everything above ran smoothly: set verifiedAt, promote the candidate.</p></footer>
<script>
  if (new URLSearchParams(location.search).get("rm") === "1") {
    const orig = window.matchMedia.bind(window);
    window.matchMedia = (q) => q.includes("prefers-reduced-motion")
      ? { matches: true, media: q, addEventListener(){}, removeEventListener(){} }
      : orig(q);
    document.title += " [reduced-motion simulated]";
  }
</script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js"></script>
<script>
${res.js || ""}
</script>
</body>
</html>`;

  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, "index.html");
  fs.writeFileSync(file, html);
  return { file, primitives: names.length, motions: motions.length, report: res.report };
}

module.exports = { buildDemo, BUILTIN_DEMOS };
