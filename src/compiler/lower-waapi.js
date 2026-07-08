"use strict";
/*
 * lower-waapi.js — Phase B1, FULL non-GSAP lowering (was: 1-primitive PoC).
 * ----------------------------------------------------------------------
 * A SECOND lowering of a Trust-Boundary-validated MotionSpec, emitting native
 * Web Animations API + IntersectionObserver + CSS, with ZERO GSAP dependency.
 * This is the strategic GSAP-decoupling hedge (legal risk B1: GSAP's license
 * forbids use in no-code tools that compete with Webflow). The validated spec
 * is the portable IR — if GSAP ever becomes a liability, the catalog and the
 * specs do not change, only this lowering does.
 *
 * SCOPE (this file): ALL 8 catalog primitives —
 *   CSS-emitters (output:"css")  : cssTransition, marquee
 *   viewport reveal (IO+animate) : scrollReveal, staggerReveal
 *   viewport one-shot (IO+rAF)   : counterUp
 *   scroll-scrubbed (scroll+rAF) : parallaxLayer, scaleOnScroll
 *   pinning (sticky, see ADR)    : pinnedSection
 *
 * SAME TRUST BOUNDARY. We call validateSpec() (fail-closed) before emitting a
 * single character; a spec the boundary rejects yields NO output, exactly like
 * the GSAP compiler (compile.js). We NEVER weaken validation here.
 *
 * DETERMINISM. Same spec ⇒ byte-identical output (golden-file tested). No model,
 * no randomness, no Date. Selectors/strings are already validated by the Trust
 * Boundary; we additionally re-escape every interpolation (JSON.stringify for JS
 * string literals; an allow-list for CSS rawtext) so nothing can break out of
 * its context — same defense-in-depth posture as compile.js.
 *
 * ACCESSIBILITY. JS artifacts: the FIRST action is the prefers-reduced-motion
 * guard (and a feature-detect for IntersectionObserver / Element.animate); under
 * reduced motion (or missing APIs) the script returns immediately and never
 * touches the DOM, so content stays at its natural, fully-visible CSS state.
 * CSS artifacts: the animated rules are wrapped in
 * `@media (prefers-reduced-motion: no-preference)`, exactly like compile.js — so
 * reduced-motion users get the static layout. Both guards are dropped only when
 * the spec explicitly sets globals.respectReducedMotion=false (parity with GSAP).
 */
const { validateSpec } = require("./validate.js");
/* CSS raw-text screening (cssRaw -> CSS_SAFE_RE + UNSAFE_TOKENS) and the default
 * filling (withDefaults) come from the ONE shared source (safety.js) —
 * used byte-identically by the GSAP compiler (compile.js). They used to live here
 * as a second copy; a change on one side would have drifted silently. */
const { cssRaw, withDefaults, pauseBlocks } = require("./safety.js");

/* All catalog primitives are now supported. Kept as an explicit allow-list so a
 * NEW primitive added to the catalog fails closed here (MS-WAAPI-UNSUPPORTED)
 * until a lowering is written for it — never silently mis-emitted. */
const SUPPORTED = [
  "scrollReveal",
  "staggerReveal",
  "counterUp",
  "cssTransition",
  "marquee",
  "floatLoop",
  "parallaxLayer",
  "scaleOnScroll",
  "pinnedSection",
  "pulseLoop",
  "spinLoop",
  "swayLoop",
  "rotateOnScroll",
  "fadeOnScroll",
  "revealScale",
  "parallaxX",
  "breatheLoop",
  "marqueeVertical",
  "flipReveal",
  "pressShrink",
  "kenBurns",
  "skewOnScroll",
  "swingLoop",
  "jelloLoop",
  "stretchLoop",
  "hoverGrow",
  "hoverLift",
  "hoverRotate",
  "hoverSink",
  "hoverSkew",
  "wobbleLoop",
  "squashLoop",
  "tiltLoop",
  "flipLoop",
  "teeterLoop",
  "glideLoop",
  "bounceLoop",
  "hoverFlip",
  "hoverExpand",
  "hoverSpin",
];

/* GSAP-style ease names -> CSS/WAAPI easing. Allow-listed + deterministic; an
 * unknown ease falls back to a safe default rather than passing arbitrary text
 * into the emitted code. (Scrubbed primitives use 'linear' by design — GSAP uses
 * ease:'none' there — so scrubbing tracks the scrollbar 1:1.) */
const EASE_MAP = {
  "power1.out": "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
  "power2.out": "cubic-bezier(0.22, 0.61, 0.36, 1)",
  "power3.out": "cubic-bezier(0.16, 1, 0.3, 1)",
  "power4.out": "cubic-bezier(0.16, 1, 0.3, 1)",
  "sine.out": "cubic-bezier(0.39, 0.575, 0.565, 1)",
  "none": "linear",
  "linear": "linear",
};
const DEFAULT_EASE = "cubic-bezier(0.16, 1, 0.3, 1)"; /* ~power3.out */

function easing(name) {
  return Object.prototype.hasOwnProperty.call(EASE_MAP, name) ? EASE_MAP[name] : DEFAULT_EASE;
}

/* Build the "from" CSS transform string from a validated transform object. The
 * keys are already Trust-Boundary-checked (TRANSFORM_KEYS, numbers only), so this
 * only formats them — no escaping concerns (all numeric). */
function fromTransform(from) {
  const parts = [];
  if (typeof from.x === "number") parts.push("translateX(" + from.x + "px)");
  if (typeof from.y === "number") parts.push("translateY(" + from.y + "px)");
  if (typeof from.xPercent === "number") parts.push("translateX(" + from.xPercent + "%)");
  if (typeof from.yPercent === "number") parts.push("translateY(" + from.yPercent + "%)");
  if (typeof from.scale === "number") parts.push("scale(" + from.scale + ")");
  if (typeof from.rotation === "number") parts.push("rotate(" + from.rotation + "deg)");
  return parts.length ? parts.join(" ") : "none";
}

/* trigger.start like "top 80%" -> IntersectionObserver rootMargin. "top X%"
 * means "reveal when the element's top crosses X% down the viewport", i.e. shrink
 * the observer's bottom edge by (100 - X)%. Anything we don't recognise falls
 * back to a safe default margin. Deterministic. */
function rootMargin(start) {
  const m = /^top\s+(\d{1,3})%$/.exec(String(start || "").trim());
  if (!m) return "0px 0px -10% 0px";
  const pct = Math.max(0, Math.min(100, parseInt(m[1], 10)));
  return "0px 0px -" + (100 - pct) + "% 0px";
}

/* JS string literal for a value the Trust Boundary already validated.
 * JSON.stringify gives a correctly-escaped double-quoted literal — nothing can
 * leave the string context. Used for selectors, eases, locales, transforms. */
function jsStr(s) {
  return JSON.stringify(String(s));
}

/* ----------------------------------------------------------------------------
 * CSS rawtext guard — for the CSS-emitting primitives (cssTransition, marquee).
 * cssRaw (imported from safety.js) re-applies the SAME allow-list + unsafe-token
 * screen the GSAP path uses, so the WAAPI CSS path has identical defense-in-depth
 * and can never emit a value compile.js would have rejected. Throwing here maps to
 * a fail-closed [MS-WAAPI-CSS] compile abort (no output).
 *
 * ----------------------------------------------------------------------------
 * Numeric formatter — deterministic, locale-independent. The Trust Boundary has
 * already range-checked these (min/max), so this only formats; we strip a
 * trailing ".0"-style artifact via Number() round-trip for stable goldens. */
function num(n) {
  return String(Number(n));
}

/* ============================================================================
 * EMITTERS — one per primitive. Each returns a JS block string (for output:"js")
 * or throws on a CSS-safety violation (output:"css"). CSS emitters return their
 * rules to a separate sink (see lowerWaapi). Every JS emitter is wrapped in its
 * own IIFE and is independent of the others.
 * ==========================================================================*/

/* scrollReveal + staggerReveal share one reveal engine: hide -> IO -> animate.
 * staggerReveal adds a per-index delay (params.stagger seconds) so children
 * cascade; scrollReveal's stagger defaults to 0 (single element or simultaneous).
 * This is the WAAPI analogue of gsap.from(..., { stagger }). */
function emitReveal(m, prim, label) {
  const params = withDefaults(prim.paramSchema || {}, m.params);
  const trigger = Object.assign({}, prim.triggerDefaults || {}, m.trigger || {});
  const from = params.from || {};
  const fromOpacity = typeof from.opacity === "number" ? from.opacity : 0;
  const durMs = Math.round(params.duration * 1000);
  const staggerMs = Math.round(params.stagger * 1000);
  const ease = easing(params.ease);
  const once = trigger.once !== false; /* default true */
  const margin = rootMargin(trigger.start);
  const fromT = fromTransform(from);

  const lines = [
    "  /* " + m.id + " (" + label + " -> Web Animations API) */",
    "  (function () {",
    "    var els = document.querySelectorAll(" + jsStr(m.target) + ");",
    "    if (!els.length) return;",
    "    var index = 0;",
    "    for (var i = 0; i < els.length; i++) {",
    "      els[i].style.opacity = " + jsStr(String(fromOpacity)) + ";",
    "      els[i].style.transform = " + jsStr(fromT) + ";",
    "    }",
    "    var io = new IntersectionObserver(function (entries) {",
    "      entries.forEach(function (entry) {",
    "        if (!entry.isIntersecting) return;",
    "        var el = entry.target;",
    (once ? "        io.unobserve(el);" : "        // re-observe: once=false"),
    "        var delay = (index++) * " + staggerMs + ";",
    "        var anim = el.animate(",
    "          [",
    "            { opacity: " + fromOpacity + ", transform: " + jsStr(fromT) + " },",
    "            { opacity: 1, transform: 'none' }",
    "          ],",
    "          { duration: " + durMs + ", delay: delay, easing: " + jsStr(ease) + ", fill: 'both' }",
    "        );",
    "        anim.onfinish = function () { el.style.opacity = ''; el.style.transform = ''; };",
    "      });",
    "    }, { rootMargin: " + jsStr(margin) + ", threshold: 0 });",
    "    for (var j = 0; j < els.length; j++) { io.observe(els[j]); }",
    "  })();",
  ];
  return lines.join("\n");
}

/* counterUp: IO trigger, then a requestAnimationFrame count from 0 -> data-count
 * (or textContent). Replaces GSAP's gsap.to(obj,{snap}) tween. `step` snaps the
 * displayed value; `locale` formats via toLocaleString (locale already
 * pattern-validated by the Trust Boundary, emitted as a JS string literal). The
 * easing curve is sampled deterministically from the same cubic-bezier the
 * GSAP-path ease maps to, so the visual matches without GSAP. */
function emitCounterUp(m, prim) {
  const params = withDefaults(prim.paramSchema || {}, m.params);
  const trigger = Object.assign({}, prim.triggerDefaults || {}, m.trigger || {});
  const durMs = Math.round(params.duration * 1000);
  const step = params.step;
  const locale = params.locale;
  const once = trigger.once !== false;
  const margin = rootMargin(trigger.start);

  const lines = [
    "  /* " + m.id + " (counterUp -> requestAnimationFrame, no GSAP) */",
    "  (function () {",
    "    var els = document.querySelectorAll(" + jsStr(m.target) + ");",
    "    if (!els.length) return;",
    "    var locale = " + jsStr(locale) + ";",
    "    var step = " + num(step) + ";",
    "    function run(el) {",
    "      var end = parseFloat(el.getAttribute('data-count') || el.textContent);",
    "      if (!isFinite(end)) end = 0;",
    "      var t0 = null;",
    "      function frame(t) {",
    "        if (t0 === null) t0 = t;",
    "        var p = Math.min(1, (t - t0) / " + durMs + ");",
    "        var eased = 1 - Math.pow(1 - p, 3);", /* ~power-out; matches default ease family */
    "        var v = Math.round((end * eased) / step) * step;",
    "        el.textContent = v.toLocaleString(locale);",
    "        if (p < 1) requestAnimationFrame(frame);",
    "        else el.textContent = (Math.round(end / step) * step).toLocaleString(locale);",
    "      }",
    "      requestAnimationFrame(frame);",
    "    }",
    "    var io = new IntersectionObserver(function (entries) {",
    "      entries.forEach(function (entry) {",
    "        if (!entry.isIntersecting) return;",
    (once ? "        io.unobserve(entry.target);" : "        // re-observe: once=false"),
    "        run(entry.target);",
    "      });",
    "    }, { rootMargin: " + jsStr(margin) + ", threshold: 0 });",
    "    for (var j = 0; j < els.length; j++) { io.observe(els[j]); }",
    "  })();",
  ];
  return lines.join("\n");
}

/* Shared scroll-scrub engine (parallaxLayer, scaleOnScroll). GSAP's ScrollTrigger
 * scrub maps scroll progress over [start,end] to a tween; WAAPI has no scrub, so
 * we hand-roll it: a single passive scroll/resize listener, rAF-throttled, that
 * computes each element's progress from its viewport position and writes the
 * interpolated transform. `scrub` (GSAP's smoothing seconds) becomes an
 * exponential-smoothing factor toward the target progress, so larger scrub =
 * laggier/smoother, matching GSAP's feel without GSAP. Determinism: the emitted
 * code is byte-stable; runtime values depend on scroll (as they must).
 *
 * progressFn(elVar) returns a JS expression in [0,1]; applyFn(pVar, elVar)
 * returns the statement that writes the transform from the smoothed progress. */
function emitScrub(m, label, comment, smoothSeconds, progressExpr, applyStmt) {
  /* scrub seconds -> per-frame smoothing alpha. 0 => snap (alpha 1). We map
   * deterministically: alpha = 1 / (1 + scrub * 6), rounded to 4 decimals so the
   * emitted literal is short and byte-stable across JS engines (no 17-digit float
   * in the golden). Pure formatting of a range-checked number; no runtime input. */
  const s = smoothSeconds;
  const alpha = s <= 0 ? 1 : Math.round((1 / (1 + s * 6)) * 1e4) / 1e4;
  const lines = [
    "  /* " + m.id + " (" + label + " -> scroll + requestAnimationFrame, no GSAP) */",
    "  /* " + comment + " */",
    "  (function () {",
    "    var els = document.querySelectorAll(" + jsStr(m.target) + ");",
    "    if (!els.length) return;",
    "    var ALPHA = " + num(alpha) + ";",
    "    var states = [];",
    "    for (var i = 0; i < els.length; i++) states.push({ cur: 0 });",
    "    function progressOf(el) {",
    "      var r = el.getBoundingClientRect();",
    "      var vh = window.innerHeight || document.documentElement.clientHeight;",
    "      /* 0 when element top hits viewport bottom, 1 when it reaches center */",
    "      var p = " + progressExpr + ";",
    "      return Math.max(0, Math.min(1, p));",
    "    }",
    "    var ticking = false;",
    "    function update() {",
    "      ticking = false;",
    "      var moving = false;",
    "      for (var k = 0; k < els.length; k++) {",
    "        var target = progressOf(els[k]);",
    "        var st = states[k];",
    "        st.cur += (target - st.cur) * ALPHA;",
    "        if (Math.abs(target - st.cur) > 0.001) moving = true;",
    "        var p = st.cur;",
    "        " + applyStmt,
    "      }",
    "      if (moving) requestAnimationFrame(update);",
    "    }",
    "    function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }",
    "    window.addEventListener('scroll', onScroll, { passive: true });",
    "    window.addEventListener('resize', onScroll, { passive: true });",
    "    update();",
    "  })();",
  ];
  return lines.join("\n");
}

/* parallaxLayer: translateY by yPercent across the scroll range. GSAP animates
 * yPercent 0 -> params.yPercent over [top bottom, bottom top] with scrub. We map
 * the same: at progress 0 -> 0%, at progress 1 -> yPercent%. */
function emitParallaxLayer(m, prim) {
  const params = withDefaults(prim.paramSchema || {}, m.params);
  const yPercent = params.yPercent;
  /* progress across the full transit: top entering bottom (0) to leaving top (1) */
  const progressExpr = "1 - (r.top + r.height) / (vh + r.height)";
  const applyStmt = "els[k].style.transform = 'translateY(' + (p * " + num(yPercent) + ") + '%)';";
  return emitScrub(
    m, "parallaxLayer",
    "depth offset: translateY 0% -> " + num(yPercent) + "% across the scroll transit",
    params.scrub, progressExpr, applyStmt
  );
}

/* scaleOnScroll: scale fromScale -> toScale across [top bottom, center center].
 * GSAP fromTo(scale) with scrub; transformOrigin is a CSS value (pattern-checked
 * by the Trust Boundary) — re-screened through cssRaw and emitted into a CSS
 * context via the style string. */
function emitScaleOnScroll(m, prim) {
  const params = withDefaults(prim.paramSchema || {}, m.params);
  const fromScale = params.fromScale;
  const toScale = params.toScale;
  const origin = cssRaw(params.transformOrigin, "scaleOnScroll.transformOrigin");
  /* 0 when element top at viewport bottom, 1 when element center reaches viewport center */
  const progressExpr = "(vh - r.top) / (vh - vh / 2 + r.height / 2)";
  const applyStmt =
    "var sc = " + num(fromScale) + " + p * (" + num(toScale) + " - " + num(fromScale) + ");" +
    " els[k].style.transformOrigin = " + jsStr(origin) + ";" +
    " els[k].style.transform = 'scale(' + sc + ')';";
  return emitScrub(
    m, "scaleOnScroll",
    "scale " + num(fromScale) + " -> " + num(toScale) + " across the scroll progress",
    params.scrub, progressExpr, applyStmt
  );
}

/* ----------------------------------------------------------------------------
 * CSS emitters. These primitives are output:"css" in the catalog and NEVER used
 * GSAP — their GSAP-path "template" is already pure CSS. The WAAPI lowering emits
 * byte-identical CSS (same allow-list screening). They go to the CSS sink, which
 * the reduced-motion @media wrapper guards exactly like compile.js.
 * ==========================================================================*/

/* cssTransition: hover micro-interaction. Mirrors compile.js fill() of the
 * catalog template, with the same cssRaw screening on every interpolated value. */
function emitCssTransition(m, prim) {
  const p = withDefaults(prim.paramSchema || {}, m.params);
  const target = cssRaw(m.target, "cssTransition.target");
  const property = cssRaw(p.property, "cssTransition.property");
  const hoverValue = cssRaw(p.hoverValue, "cssTransition.hoverValue");
  const duration = cssRaw(num(p.duration), "cssTransition.duration");
  const ease = cssRaw(p.easing, "cssTransition.easing");
  const rule =
    target + " { transition: " + property + " " + duration + "s " + ease + "; }\n" +
    target + ":hover { " + property + ": " + hoverValue + "; }";
  return { id: m.id, primitive: "cssTransition", css: rule };
}

/* marquee: endless horizontal ticker. Mirrors compile.js fill() of the catalog
 * template (two identical content groups expected upstream); same screening. The
 * id is part of the @keyframes name — id is already [A-Za-z0-9_-]{1,64} from the
 * Trust Boundary, re-screened here. */
function emitMarquee(m, prim) {
  const p = withDefaults(prim.paramSchema || {}, m.params);
  const target = cssRaw(m.target, "marquee.target");
  const gap = cssRaw(p.gap, "marquee.gap");
  const duration = cssRaw(num(p.duration), "marquee.duration");
  const direction = cssRaw(p.direction, "marquee.direction");
  const id = cssRaw(m.id, "marquee.id");
  const rule =
    target + " { display: flex; gap: " + gap + "; overflow: hidden; }\n" +
    target + " > * { flex-shrink: 0; animation: motion-marquee-" + id + " " + duration + "s linear infinite " + direction + "; }\n" +
    "@keyframes motion-marquee-" + id + " { from { transform: translateX(0) } to { transform: translateX(-100%) } }";
  return { id: m.id, primitive: "marquee", css: rule };
}

/* floatLoop: gentle endless ambient bob via CSS @keyframes (Family C — auto/infinite
 * motion). Mirrors compile.js fill() of the catalog template: a single transform
 * keyframe on one axis, ease-in-out, infinite, alternate (so it floats back and
 * forth). Pure compositor (transform only). The id is part of the @keyframes name
 * (already [A-Za-z0-9_-]{1,64} from the Trust Boundary, re-screened here). `axis`
 * is "x"|"y" (pattern-checked); CSS function names are ASCII case-insensitive, so
 * translate + axis ("translatex"/"translatey") is valid. As an auto-playing
 * infinite animation, it is gated by the reduced-motion @media wrapper -> RM users
 * get the static, un-animated layout (a11y.reducedMotionFallback: "static"). */
function emitFloatLoop(m, prim) {
  const p = withDefaults(prim.paramSchema || {}, m.params);
  const target = cssRaw(m.target, "floatLoop.target");
  const distance = cssRaw(p.distance, "floatLoop.distance");
  const duration = cssRaw(num(p.duration), "floatLoop.duration");
  const axis = cssRaw(p.axis, "floatLoop.axis");
  const id = cssRaw(m.id, "floatLoop.id");
  const rule =
    target + " { animation: motion-floatLoop-" + id + " " + duration + "s ease-in-out infinite alternate; }\n" +
    "@keyframes motion-floatLoop-" + id + " { from { transform: translate" + axis + "(0) } to { transform: translate" + axis + "(-" + distance + ") } }";
  return { id: m.id, primitive: "floatLoop", css: rule };
}

/* pinnedSection: the hard one. GSAP's ScrollTrigger pin works by re-parenting the
 * element into a pin-spacer and fixing it for a scroll distance — a runtime DOM
 * surgery WAAPI/CSS cannot replicate generically. The closest standards-native
 * equivalent is `position: sticky`, which differs in MECHANISM and SEMANTICS:
 *   - sticky pins the element WITHIN its containing block's scroll, not for an
 *     arbitrary "+=100%" distance; the unpin point is the parent's bottom, not a
 *     computed end. params.distance therefore CANNOT be honored faithfully.
 *   - pinSpacing (GSAP reserves layout so following content doesn't jump) has no
 *     direct sticky analogue; sticky keeps the element in flow by nature.
 * We emit a CSS sticky rule as the documented best-effort fallback and surface a
 * TODO so an integrator can opt into a JS pin runtime later. This is a SEMANTIC
 * DIVERGENCE from the GSAP path — see docs/adr/0002-non-gsap-targets.md §Pinning.
 *
 * TODO(claude-code): faithful pin needs a real DOM/runtime decision (spacer +
 * position:fixed over a measured range, or content-visibility tricks). Deferred:
 * sticky covers the common "stick to top while content scrolls past" case for a
 * single-section page; arbitrary distance / nested pins are NOT equivalent.
 */
function emitPinnedSection(m, _prim) {
  const target = cssRaw(m.target, "pinnedSection.target");
  /* pinSpacing true (default) keeps the element in flow (sticky's natural mode).
   * If pinSpacing is false the GSAP path overlaps following content; sticky cannot
   * express that, so we keep the in-flow sticky and note the divergence. */
  const rule =
    "/* pinnedSection via position:sticky (best-effort; see ADR-0002 — NOT a faithful GSAP pin) */\n" +
    target + " { position: -webkit-sticky; position: sticky; top: 0; }";
  return { id: m.id, primitive: "pinnedSection", css: rule };
}

/* --- Welle A (2026-07-04): 3 CSS-Loops (Familie floatLoop) + 2 Scroll-Scrub
 * (reuse emitScrub) + 1 Reveal (mirror emitReveal). Alle transform/opacity-only. */
function emitPulseLoop(m, prim) {
  const p = withDefaults(prim.paramSchema || {}, m.params);
  const target = cssRaw(m.target, "pulseLoop.target");
  const scale = cssRaw(num(p.scale), "pulseLoop.scale");
  const duration = cssRaw(num(p.duration), "pulseLoop.duration");
  const id = cssRaw(m.id, "pulseLoop.id");
  const rule =
    target + " { animation: motion-pulseLoop-" + id + " " + duration + "s ease-in-out infinite alternate; }\n" +
    "@keyframes motion-pulseLoop-" + id + " { from { transform: scale(1) } to { transform: scale(" + scale + ") } }";
  return { id: m.id, primitive: "pulseLoop", css: rule };
}

function emitSpinLoop(m, prim) {
  const p = withDefaults(prim.paramSchema || {}, m.params);
  const target = cssRaw(m.target, "spinLoop.target");
  const duration = cssRaw(num(p.duration), "spinLoop.duration");
  const direction = cssRaw(p.direction, "spinLoop.direction");
  const id = cssRaw(m.id, "spinLoop.id");
  const rule =
    target + " { animation: motion-spinLoop-" + id + " " + duration + "s linear infinite " + direction + "; }\n" +
    "@keyframes motion-spinLoop-" + id + " { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }";
  return { id: m.id, primitive: "spinLoop", css: rule };
}

function emitSwayLoop(m, prim) {
  const p = withDefaults(prim.paramSchema || {}, m.params);
  const target = cssRaw(m.target, "swayLoop.target");
  const angle = cssRaw(num(p.angle), "swayLoop.angle");
  const duration = cssRaw(num(p.duration), "swayLoop.duration");
  const id = cssRaw(m.id, "swayLoop.id");
  const rule =
    target + " { animation: motion-swayLoop-" + id + " " + duration + "s ease-in-out infinite alternate; }\n" +
    "@keyframes motion-swayLoop-" + id + " { from { transform: rotate(-" + angle + "deg) } to { transform: rotate(" + angle + "deg) } }";
  return { id: m.id, primitive: "swayLoop", css: rule };
}

function emitRotateOnScroll(m, prim) {
  const params = withDefaults(prim.paramSchema || {}, m.params);
  const degrees = params.degrees;
  const progressExpr = "1 - (r.top + r.height) / (vh + r.height)";
  const applyStmt = "els[k].style.transform = 'rotate(' + (p * " + num(degrees) + ") + 'deg)';";
  return emitScrub(
    m, "rotateOnScroll",
    "rotate 0deg -> " + num(degrees) + "deg across the scroll transit",
    params.scrub, progressExpr, applyStmt
  );
}

function emitFadeOnScroll(m, prim) {
  const params = withDefaults(prim.paramSchema || {}, m.params);
  const fromO = params.fromOpacity;
  const toO = params.toOpacity;
  const progressExpr = "1 - (r.top + r.height) / (vh + r.height)";
  const applyStmt = "els[k].style.opacity = (" + num(fromO) + " + p * (" + num(toO) + " - " + num(fromO) + "));";
  return emitScrub(
    m, "fadeOnScroll",
    "opacity " + num(fromO) + " -> " + num(toO) + " across the scroll transit",
    params.scrub, progressExpr, applyStmt
  );
}

function emitRevealScale(m, prim) {
  const params = withDefaults(prim.paramSchema || {}, m.params);
  const fromScale = params.fromScale;
  const durMs = Math.round(params.duration * 1000);
  const ease = easing(params.ease);
  const trigger = Object.assign({}, prim.triggerDefaults || {}, m.trigger || {});
  const once = trigger.once !== false;
  const margin = rootMargin(trigger.start);
  const fromT = fromTransform({ scale: fromScale });
  const lines = [
    "  /* " + m.id + " (revealScale -> Web Animations API) */",
    "  (function () {",
    "    var els = document.querySelectorAll(" + jsStr(m.target) + ");",
    "    if (!els.length) return;",
    "    for (var i = 0; i < els.length; i++) {",
    "      els[i].style.opacity = '0';",
    "      els[i].style.transform = " + jsStr(fromT) + ";",
    "    }",
    "    var io = new IntersectionObserver(function (entries) {",
    "      entries.forEach(function (entry) {",
    "        if (!entry.isIntersecting) return;",
    "        var el = entry.target;",
    (once ? "        io.unobserve(el);" : "        // re-observe: once=false"),
    "        var anim = el.animate(",
    "          [",
    "            { opacity: 0, transform: " + jsStr(fromT) + " },",
    "            { opacity: 1, transform: 'none' }",
    "          ],",
    "          { duration: " + durMs + ", easing: " + jsStr(ease) + ", fill: 'both' }",
    "        );",
    "        anim.onfinish = function () { el.style.opacity = ''; el.style.transform = ''; };",
    "      });",
    "    }, { rootMargin: " + jsStr(margin) + ", threshold: 0 });",
    "    for (var j = 0; j < els.length; j++) { io.observe(els[j]); }",
    "  })();",
  ];
  return lines.join("\n");
}

/* --- Welle B (2026-07-04): parallaxX (scrub), breatheLoop/marqueeVertical/
 * pressShrink/kenBurns (CSS), flipReveal (3D-Reveal). Alle transform/opacity. */
function emitParallaxX(m, prim) {
  const params = withDefaults(prim.paramSchema || {}, m.params);
  const xPercent = params.xPercent;
  const progressExpr = "1 - (r.top + r.height) / (vh + r.height)";
  const applyStmt = "els[k].style.transform = 'translateX(' + (p * " + num(xPercent) + ") + '%)';";
  return emitScrub(
    m, "parallaxX",
    "depth offset: translateX 0% -> " + num(xPercent) + "% across the scroll transit",
    params.scrub, progressExpr, applyStmt
  );
}

function emitBreatheLoop(m, prim) {
  const p = withDefaults(prim.paramSchema || {}, m.params);
  const target = cssRaw(m.target, "breatheLoop.target");
  const minOpacity = cssRaw(num(p.minOpacity), "breatheLoop.minOpacity");
  const duration = cssRaw(num(p.duration), "breatheLoop.duration");
  const id = cssRaw(m.id, "breatheLoop.id");
  const rule =
    target + " { animation: motion-breatheLoop-" + id + " " + duration + "s ease-in-out infinite alternate; }\n" +
    "@keyframes motion-breatheLoop-" + id + " { from { opacity: " + minOpacity + " } to { opacity: 1 } }";
  return { id: m.id, primitive: "breatheLoop", css: rule };
}

function emitMarqueeVertical(m, prim) {
  const p = withDefaults(prim.paramSchema || {}, m.params);
  const target = cssRaw(m.target, "marqueeVertical.target");
  const gap = cssRaw(p.gap, "marqueeVertical.gap");
  const duration = cssRaw(num(p.duration), "marqueeVertical.duration");
  const direction = cssRaw(p.direction, "marqueeVertical.direction");
  const id = cssRaw(m.id, "marqueeVertical.id");
  const rule =
    target + " { display: flex; flex-direction: column; gap: " + gap + "; overflow: hidden; }\n" +
    target + " > * { flex-shrink: 0; animation: motion-marqueeVertical-" + id + " " + duration + "s linear infinite " + direction + "; }\n" +
    "@keyframes motion-marqueeVertical-" + id + " { from { transform: translateY(0) } to { transform: translateY(-100%) } }";
  return { id: m.id, primitive: "marqueeVertical", css: rule };
}

function emitPressShrink(m, prim) {
  const p = withDefaults(prim.paramSchema || {}, m.params);
  const target = cssRaw(m.target, "pressShrink.target");
  const scale = cssRaw(num(p.scale), "pressShrink.scale");
  const duration = cssRaw(num(p.duration), "pressShrink.duration");
  const rule =
    target + " { transition: transform " + duration + "s cubic-bezier(0.22, 0.61, 0.36, 1); }\n" +
    target + ":active { transform: scale(" + scale + "); }";
  return { id: m.id, primitive: "pressShrink", css: rule };
}

function emitKenBurns(m, prim) {
  const p = withDefaults(prim.paramSchema || {}, m.params);
  const target = cssRaw(m.target, "kenBurns.target");
  const scale = cssRaw(num(p.scale), "kenBurns.scale");
  const duration = cssRaw(num(p.duration), "kenBurns.duration");
  const id = cssRaw(m.id, "kenBurns.id");
  const rule =
    target + " { animation: motion-kenBurns-" + id + " " + duration + "s ease-in-out infinite alternate; }\n" +
    "@keyframes motion-kenBurns-" + id + " { from { transform: scale(1) translate(0, 0) } to { transform: scale(" + scale + ") translate(-2%, -2%) } }";
  return { id: m.id, primitive: "kenBurns", css: rule };
}

function emitFlipReveal(m, prim) {
  const params = withDefaults(prim.paramSchema || {}, m.params);
  const degrees = params.degrees;
  const durMs = Math.round(params.duration * 1000);
  const ease = easing(params.ease);
  const trigger = Object.assign({}, prim.triggerDefaults || {}, m.trigger || {});
  const once = trigger.once !== false;
  const margin = rootMargin(trigger.start);
  const fromT = "perspective(800px) rotateX(" + num(degrees) + "deg)";
  const lines = [
    "  /* " + m.id + " (flipReveal -> Web Animations API) */",
    "  (function () {",
    "    var els = document.querySelectorAll(" + jsStr(m.target) + ");",
    "    if (!els.length) return;",
    "    for (var i = 0; i < els.length; i++) {",
    "      els[i].style.opacity = '0';",
    "      els[i].style.transformOrigin = 'center top';",
    "      els[i].style.transform = " + jsStr(fromT) + ";",
    "    }",
    "    var io = new IntersectionObserver(function (entries) {",
    "      entries.forEach(function (entry) {",
    "        if (!entry.isIntersecting) return;",
    "        var el = entry.target;",
    (once ? "        io.unobserve(el);" : "        // re-observe: once=false"),
    "        var anim = el.animate(",
    "          [",
    "            { opacity: 0, transform: " + jsStr(fromT) + " },",
    "            { opacity: 1, transform: 'perspective(800px) rotateX(0deg)' }",
    "          ],",
    "          { duration: " + durMs + ", easing: " + jsStr(ease) + ", fill: 'both' }",
    "        );",
    "        anim.onfinish = function () { el.style.opacity = ''; el.style.transform = ''; el.style.transformOrigin = ''; };",
    "      });",
    "    }, { rootMargin: " + jsStr(margin) + ", threshold: 0 });",
    "    for (var j = 0; j < els.length; j++) { io.observe(els[j]); }",
    "  })();",
  ];
  return lines.join("\n");
}

/* --- Welle C (2026-07-04): skewOnScroll (scrub), swingLoop/jelloLoop/
 * stretchLoop (CSS-Loops), hoverGrow/hoverLift (CSS-Hover). Emitter ohne
 * redundante Fallbacks — withDefaults garantiert die Werte. */
function emitSkewOnScroll(m, prim) {
  const params = withDefaults(prim.paramSchema || {}, m.params);
  const deg = params.skewDegrees;
  const progressExpr = "1 - (r.top + r.height) / (vh + r.height)";
  const applyStmt = "els[k].style.transform = 'skewY(' + (p * " + num(deg) + ") + 'deg)';";
  return emitScrub(
    m, "skewOnScroll",
    "skewY 0 -> " + num(deg) + "deg across the scroll transit",
    params.scrub, progressExpr, applyStmt
  );
}

function emitSwingLoop(m, prim) {
  const p = withDefaults(prim.paramSchema || {}, m.params);
  const target = cssRaw(m.target, "swingLoop.target");
  const angle = cssRaw(num(p.angle), "swingLoop.angle");
  const duration = cssRaw(num(p.duration), "swingLoop.duration");
  const id = cssRaw(m.id, "swingLoop.id");
  const rule =
    target + " { transform-origin: top center; animation: motion-swingLoop-" + id + " " + duration + "s ease-in-out infinite alternate; }\n" +
    "@keyframes motion-swingLoop-" + id + " { from { transform: rotate(-" + angle + "deg) } to { transform: rotate(" + angle + "deg) } }";
  return { id: m.id, primitive: "swingLoop", css: rule };
}

function emitJelloLoop(m, prim) {
  const p = withDefaults(prim.paramSchema || {}, m.params);
  const target = cssRaw(m.target, "jelloLoop.target");
  const skew = cssRaw(num(p.skew), "jelloLoop.skew");
  const duration = cssRaw(num(p.duration), "jelloLoop.duration");
  const id = cssRaw(m.id, "jelloLoop.id");
  const rule =
    target + " { animation: motion-jelloLoop-" + id + " " + duration + "s ease-in-out infinite alternate; }\n" +
    "@keyframes motion-jelloLoop-" + id + " { from { transform: skewX(-" + skew + "deg) skewY(-" + skew + "deg) } to { transform: skewX(" + skew + "deg) skewY(" + skew + "deg) } }";
  return { id: m.id, primitive: "jelloLoop", css: rule };
}

function emitStretchLoop(m, prim) {
  const p = withDefaults(prim.paramSchema || {}, m.params);
  const target = cssRaw(m.target, "stretchLoop.target");
  const scaleX = cssRaw(num(p.scaleX), "stretchLoop.scaleX");
  const duration = cssRaw(num(p.duration), "stretchLoop.duration");
  const id = cssRaw(m.id, "stretchLoop.id");
  const rule =
    target + " { animation: motion-stretchLoop-" + id + " " + duration + "s ease-in-out infinite alternate; }\n" +
    "@keyframes motion-stretchLoop-" + id + " { from { transform: scaleX(1) } to { transform: scaleX(" + scaleX + ") } }";
  return { id: m.id, primitive: "stretchLoop", css: rule };
}

function emitHoverGrow(m, prim) {
  const p = withDefaults(prim.paramSchema || {}, m.params);
  const target = cssRaw(m.target, "hoverGrow.target");
  const scale = cssRaw(num(p.scale), "hoverGrow.scale");
  const duration = cssRaw(num(p.duration), "hoverGrow.duration");
  const rule =
    target + " { transition: transform " + duration + "s cubic-bezier(0.22, 0.61, 0.36, 1); }\n" +
    target + ":hover { transform: scale(" + scale + "); }";
  return { id: m.id, primitive: "hoverGrow", css: rule };
}

function emitHoverLift(m, prim) {
  const p = withDefaults(prim.paramSchema || {}, m.params);
  const target = cssRaw(m.target, "hoverLift.target");
  const distance = cssRaw(p.distance, "hoverLift.distance");
  const duration = cssRaw(num(p.duration), "hoverLift.duration");
  const rule =
    target + " { transition: transform " + duration + "s cubic-bezier(0.22, 0.61, 0.36, 1); }\n" +
    target + ":hover { transform: translateY(-" + distance + "); }";
  return { id: m.id, primitive: "hoverLift", css: rule };
}

/* --- Welle D (2026-07-04): hoverRotate/hoverSink/hoverSkew (CSS-Hover),
 * wobbleLoop/squashLoop/tiltLoop (CSS-Loops). Alle CSS, transform-only. */
function emitHoverRotate(m, prim) {
  const p = withDefaults(prim.paramSchema || {}, m.params);
  const target = cssRaw(m.target, "hoverRotate.target");
  const degrees = cssRaw(num(p.degrees), "hoverRotate.degrees");
  const duration = cssRaw(num(p.duration), "hoverRotate.duration");
  const rule =
    target + " { transition: transform " + duration + "s cubic-bezier(0.22, 0.61, 0.36, 1); }\n" +
    target + ":hover { transform: rotate(" + degrees + "deg); }";
  return { id: m.id, primitive: "hoverRotate", css: rule };
}

function emitHoverSink(m, prim) {
  const p = withDefaults(prim.paramSchema || {}, m.params);
  const target = cssRaw(m.target, "hoverSink.target");
  const distance = cssRaw(p.distance, "hoverSink.distance");
  const duration = cssRaw(num(p.duration), "hoverSink.duration");
  const rule =
    target + " { transition: transform " + duration + "s cubic-bezier(0.22, 0.61, 0.36, 1); }\n" +
    target + ":hover { transform: translateY(" + distance + "); }";
  return { id: m.id, primitive: "hoverSink", css: rule };
}

function emitHoverSkew(m, prim) {
  const p = withDefaults(prim.paramSchema || {}, m.params);
  const target = cssRaw(m.target, "hoverSkew.target");
  const skew = cssRaw(num(p.skew), "hoverSkew.skew");
  const duration = cssRaw(num(p.duration), "hoverSkew.duration");
  const rule =
    target + " { transition: transform " + duration + "s cubic-bezier(0.22, 0.61, 0.36, 1); }\n" +
    target + ":hover { transform: skewX(" + skew + "deg); }";
  return { id: m.id, primitive: "hoverSkew", css: rule };
}

function emitWobbleLoop(m, prim) {
  const p = withDefaults(prim.paramSchema || {}, m.params);
  const target = cssRaw(m.target, "wobbleLoop.target");
  const distance = cssRaw(p.distance, "wobbleLoop.distance");
  const angle = cssRaw(num(p.angle), "wobbleLoop.angle");
  const duration = cssRaw(num(p.duration), "wobbleLoop.duration");
  const id = cssRaw(m.id, "wobbleLoop.id");
  const rule =
    target + " { animation: motion-wobbleLoop-" + id + " " + duration + "s ease-in-out infinite alternate; }\n" +
    "@keyframes motion-wobbleLoop-" + id + " { from { transform: translateX(-" + distance + ") rotate(-" + angle + "deg) } to { transform: translateX(" + distance + ") rotate(" + angle + "deg) } }";
  return { id: m.id, primitive: "wobbleLoop", css: rule };
}

function emitSquashLoop(m, prim) {
  const p = withDefaults(prim.paramSchema || {}, m.params);
  const target = cssRaw(m.target, "squashLoop.target");
  const scaleX = cssRaw(num(p.scaleX), "squashLoop.scaleX");
  const scaleY = cssRaw(num(p.scaleY), "squashLoop.scaleY");
  const duration = cssRaw(num(p.duration), "squashLoop.duration");
  const id = cssRaw(m.id, "squashLoop.id");
  const rule =
    target + " { animation: motion-squashLoop-" + id + " " + duration + "s ease-in-out infinite alternate; }\n" +
    "@keyframes motion-squashLoop-" + id + " { from { transform: scaleX(1) scaleY(1) } to { transform: scaleX(" + scaleX + ") scaleY(" + scaleY + ") } }";
  return { id: m.id, primitive: "squashLoop", css: rule };
}

function emitTiltLoop(m, prim) {
  const p = withDefaults(prim.paramSchema || {}, m.params);
  const target = cssRaw(m.target, "tiltLoop.target");
  const angle = cssRaw(num(p.angle), "tiltLoop.angle");
  const scale = cssRaw(num(p.scale), "tiltLoop.scale");
  const duration = cssRaw(num(p.duration), "tiltLoop.duration");
  const id = cssRaw(m.id, "tiltLoop.id");
  const rule =
    target + " { animation: motion-tiltLoop-" + id + " " + duration + "s ease-in-out infinite alternate; }\n" +
    "@keyframes motion-tiltLoop-" + id + " { from { transform: rotate(-" + angle + "deg) scale(1) } to { transform: rotate(" + angle + "deg) scale(" + scale + ") } }";
  return { id: m.id, primitive: "tiltLoop", css: rule };
}

/* --- Welle E final (2026-07-04): flipLoop/teeterLoop/glideLoop/bounceLoop
 * (CSS-Loops), hoverFlip/hoverExpand/hoverSpin (CSS-Hover). Alle CSS. */
function emitFlipLoop(m, prim) {
  const p = withDefaults(prim.paramSchema || {}, m.params);
  const target = cssRaw(m.target, "flipLoop.target");
  const duration = cssRaw(num(p.duration), "flipLoop.duration");
  const id = cssRaw(m.id, "flipLoop.id");
  const rule =
    target + " { animation: motion-flipLoop-" + id + " " + duration + "s linear infinite; }\n" +
    "@keyframes motion-flipLoop-" + id + " { from { transform: perspective(600px) rotateY(0deg) } to { transform: perspective(600px) rotateY(360deg) } }";
  return { id: m.id, primitive: "flipLoop", css: rule };
}

function emitTeeterLoop(m, prim) {
  const p = withDefaults(prim.paramSchema || {}, m.params);
  const target = cssRaw(m.target, "teeterLoop.target");
  const angle = cssRaw(num(p.angle), "teeterLoop.angle");
  const duration = cssRaw(num(p.duration), "teeterLoop.duration");
  const id = cssRaw(m.id, "teeterLoop.id");
  const rule =
    target + " { transform-origin: bottom center; animation: motion-teeterLoop-" + id + " " + duration + "s ease-in-out infinite alternate; }\n" +
    "@keyframes motion-teeterLoop-" + id + " { from { transform: rotate(-" + angle + "deg) } to { transform: rotate(" + angle + "deg) } }";
  return { id: m.id, primitive: "teeterLoop", css: rule };
}

function emitGlideLoop(m, prim) {
  const p = withDefaults(prim.paramSchema || {}, m.params);
  const target = cssRaw(m.target, "glideLoop.target");
  const distance = cssRaw(p.distance, "glideLoop.distance");
  const duration = cssRaw(num(p.duration), "glideLoop.duration");
  const id = cssRaw(m.id, "glideLoop.id");
  const rule =
    target + " { animation: motion-glideLoop-" + id + " " + duration + "s ease-in-out infinite alternate; }\n" +
    "@keyframes motion-glideLoop-" + id + " { from { transform: translate(-" + distance + ", -" + distance + ") } to { transform: translate(" + distance + ", " + distance + ") } }";
  return { id: m.id, primitive: "glideLoop", css: rule };
}

function emitBounceLoop(m, prim) {
  const p = withDefaults(prim.paramSchema || {}, m.params);
  const target = cssRaw(m.target, "bounceLoop.target");
  const distance = cssRaw(p.distance, "bounceLoop.distance");
  const duration = cssRaw(num(p.duration), "bounceLoop.duration");
  const id = cssRaw(m.id, "bounceLoop.id");
  const rule =
    target + " { animation: motion-bounceLoop-" + id + " " + duration + "s cubic-bezier(0.28, 0.84, 0.42, 1) infinite; }\n" +
    "@keyframes motion-bounceLoop-" + id + " { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-" + distance + ") } }";
  return { id: m.id, primitive: "bounceLoop", css: rule };
}

function emitHoverFlip(m, prim) {
  const p = withDefaults(prim.paramSchema || {}, m.params);
  const target = cssRaw(m.target, "hoverFlip.target");
  const degrees = cssRaw(num(p.degrees), "hoverFlip.degrees");
  const duration = cssRaw(num(p.duration), "hoverFlip.duration");
  const rule =
    target + " { transition: transform " + duration + "s cubic-bezier(0.22, 0.61, 0.36, 1); }\n" +
    target + ":hover { transform: perspective(600px) rotateY(" + degrees + "deg); }";
  return { id: m.id, primitive: "hoverFlip", css: rule };
}

function emitHoverExpand(m, prim) {
  const p = withDefaults(prim.paramSchema || {}, m.params);
  const target = cssRaw(m.target, "hoverExpand.target");
  const scale = cssRaw(num(p.scale), "hoverExpand.scale");
  const lift = cssRaw(p.lift, "hoverExpand.lift");
  const duration = cssRaw(num(p.duration), "hoverExpand.duration");
  const rule =
    target + " { transition: transform " + duration + "s cubic-bezier(0.22, 0.61, 0.36, 1); }\n" +
    target + ":hover { transform: translateY(-" + lift + ") scale(" + scale + "); }";
  return { id: m.id, primitive: "hoverExpand", css: rule };
}

function emitHoverSpin(m, prim) {
  const p = withDefaults(prim.paramSchema || {}, m.params);
  const target = cssRaw(m.target, "hoverSpin.target");
  const duration = cssRaw(num(p.duration), "hoverSpin.duration");
  const rule =
    target + " { transition: transform " + duration + "s cubic-bezier(0.22, 0.61, 0.36, 1); }\n" +
    target + ":hover { transform: rotate(360deg); }";
  return { id: m.id, primitive: "hoverSpin", css: rule };
}

/* Dispatch: primitive -> emitter. JS emitters return a string (JS sink); CSS
 * emitters return { id, primitive, css } (CSS sink). Kept explicit so an
 * unmapped-but-"supported" primitive is impossible (would throw below). */
function emitMotion(m, prim) {
  switch (m.primitive) {
    case "scrollReveal":   return { kind: "js",  code: emitReveal(m, prim, "scrollReveal") };
    case "staggerReveal":  return { kind: "js",  code: emitReveal(m, prim, "staggerReveal") };
    case "counterUp":      return { kind: "js",  code: emitCounterUp(m, prim) };
    case "parallaxLayer":  return { kind: "js",  code: emitParallaxLayer(m, prim) };
    case "scaleOnScroll":  return { kind: "js",  code: emitScaleOnScroll(m, prim) };
    case "cssTransition":  return { kind: "css", emit: emitCssTransition(m, prim) };
    case "marquee":        return { kind: "css", emit: emitMarquee(m, prim) };
    case "floatLoop":      return { kind: "css", emit: emitFloatLoop(m, prim) };
    case "pinnedSection":  return { kind: "css", emit: emitPinnedSection(m, prim) };
    case "pulseLoop":      return { kind: "css", emit: emitPulseLoop(m, prim) };
    case "spinLoop":       return { kind: "css", emit: emitSpinLoop(m, prim) };
    case "swayLoop":       return { kind: "css", emit: emitSwayLoop(m, prim) };
    case "rotateOnScroll": return { kind: "js",  code: emitRotateOnScroll(m, prim) };
    case "fadeOnScroll":   return { kind: "js",  code: emitFadeOnScroll(m, prim) };
    case "revealScale":    return { kind: "js",  code: emitRevealScale(m, prim) };
    case "parallaxX":       return { kind: "js",  code: emitParallaxX(m, prim) };
    case "breatheLoop":     return { kind: "css", emit: emitBreatheLoop(m, prim) };
    case "marqueeVertical": return { kind: "css", emit: emitMarqueeVertical(m, prim) };
    case "flipReveal":      return { kind: "js",  code: emitFlipReveal(m, prim) };
    case "pressShrink":     return { kind: "css", emit: emitPressShrink(m, prim) };
    case "kenBurns":        return { kind: "css", emit: emitKenBurns(m, prim) };
    case "skewOnScroll":    return { kind: "js",  code: emitSkewOnScroll(m, prim) };
    case "swingLoop":       return { kind: "css", emit: emitSwingLoop(m, prim) };
    case "jelloLoop":       return { kind: "css", emit: emitJelloLoop(m, prim) };
    case "stretchLoop":     return { kind: "css", emit: emitStretchLoop(m, prim) };
    case "hoverGrow":       return { kind: "css", emit: emitHoverGrow(m, prim) };
    case "hoverLift":       return { kind: "css", emit: emitHoverLift(m, prim) };
    case "hoverRotate":     return { kind: "css", emit: emitHoverRotate(m, prim) };
    case "hoverSink":       return { kind: "css", emit: emitHoverSink(m, prim) };
    case "hoverSkew":       return { kind: "css", emit: emitHoverSkew(m, prim) };
    case "wobbleLoop":      return { kind: "css", emit: emitWobbleLoop(m, prim) };
    case "squashLoop":      return { kind: "css", emit: emitSquashLoop(m, prim) };
    case "tiltLoop":        return { kind: "css", emit: emitTiltLoop(m, prim) };
    case "flipLoop":        return { kind: "css", emit: emitFlipLoop(m, prim) };
    case "teeterLoop":      return { kind: "css", emit: emitTeeterLoop(m, prim) };
    case "glideLoop":       return { kind: "css", emit: emitGlideLoop(m, prim) };
    case "bounceLoop":      return { kind: "css", emit: emitBounceLoop(m, prim) };
    case "hoverFlip":       return { kind: "css", emit: emitHoverFlip(m, prim) };
    case "hoverExpand":     return { kind: "css", emit: emitHoverExpand(m, prim) };
    case "hoverSpin":       return { kind: "css", emit: emitHoverSpin(m, prim) };
    /* Unreachable while SUPPORTED and this switch agree; guarded for safety. */
    default:
      throw new Error("[MS-WAAPI-INTERNAL] no emitter for supported primitive '" + m.primitive + "'.");
  }
}

/**
 * @typedef {Object} LowerResult
 * @property {boolean} ok
 * @property {string[]} [errors]      - fail-closed reasons (boundary, scope, or CSS-safety)
 * @property {string|null} [js]       - emitted GSAP-free WAAPI/IO script (null if no JS motions)
 * @property {string|null} [css]      - emitted GSAP-free CSS (null if no CSS motions)
 * @property {Object} [report]
 */
/**
 * Lower a MotionSpec to native Web Animations API + IntersectionObserver + CSS,
 * with ZERO GSAP. Validates through the SAME Trust Boundary first; never emits
 * partial output. Deterministic.
 * @param {Object} spec
 * @param {Object} catalog
 * @param {{specName?: string}} [opts]
 * @returns {LowerResult}
 */
function lowerWaapi(spec, catalog, opts) {
  const o = opts || {};
  /* SAME Trust Boundary — fail-closed, no partial output. */
  const v = validateSpec(spec, catalog);
  if (!v.ok) return { ok: false, errors: v.errors };

  /* Scope guard — fail closed for any primitive without a lowering (e.g. a NEW
   * catalog primitive). Keeps the "supported set" explicit and auditable. */
  for (const m of spec.motions) {
    if (SUPPORTED.indexOf(m.primitive) === -1) {
      return {
        ok: false,
        errors: [
          "[MS-WAAPI-UNSUPPORTED] non-GSAP lowering does not support primitive '" +
            m.primitive + "' (motion '" + m.id + "'). Supported: " + SUPPORTED.slice().sort().join(", ") + ".",
        ],
      };
    }
  }

  const respectRM = !(spec.globals && spec.globals.respectReducedMotion === false);

  const jsBlocks = [];
  const cssBlocks = [];
  let nJs = 0, nCss = 0; /* per-MOTION counts (cssBlocks holds 2 lines/motion) */
  try {
    for (const m of spec.motions) {
      const out = emitMotion(m, catalog[m.primitive]);
      if (out.kind === "js") { jsBlocks.push(out.code); nJs++; }
      else {
        cssBlocks.push("  /* " + out.emit.id + " (" + out.emit.primitive + ") */");
        cssBlocks.push("  " + out.emit.css.split("\n").join("\n  "));
        nCss++;
      }
    }
  } catch (e) {
    /* CSS-safety violation (or internal) -> fail closed, no output (parity with
     * compile.js MS-COMPILE-CSS). */
    return { ok: false, errors: ["[MS-WAAPI-CSS] lowering aborted: " + e.message] };
  }

  const safeName = String(o.specName || "spec").replace(/\*\/|\/\*/g, "_").slice(0, 80);

  /* pauseControls (WCAG 2.2.2): SAME source as compile.js (pauseBlocks in
   * safety.js) ⇒ the pause CSS rules and the toggle IIFE are byte-identical
   * across the GSAP and WAAPI paths. Zero persistent motions ⇒ zero bytes. */
  const pause = pauseBlocks(spec, catalog);

  let jsOut = null;
  if (jsBlocks.length > 0) {
    const head = [
      "/* MotionSpec WAAPI lowering (no GSAP) - generated artifact. Do NOT edit by hand. */",
      "/* Spec: " + safeName + "  Lowering: web-animations-api (no GSAP) */",
      "(function () {",
      "  if (!('IntersectionObserver' in window) || typeof Element === 'undefined' || !Element.prototype.animate) return; /* progressive enhancement: content stays visible */",
    ];
    if (respectRM) {
      head.push("  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;  /* a11y: respectReducedMotion */");
    }
    jsOut = head.concat(jsBlocks, ["})();", ""]).join("\n");
  }

  let cssOut = null;
  if (cssBlocks.length > 0) {
    let body = "/* MotionSpec WAAPI lowering (no GSAP) - generated CSS artifact. */\n";
    if (respectRM) body += "@media (prefers-reduced-motion: no-preference) {\n" + cssBlocks.join("\n") + "\n}\n";
    else body += cssBlocks.join("\n") + "\n";
    cssOut = body;
  }

  /* Append the pause path — CSS outside the RRM block; the toggle as a
   * self-contained IIFE (GSAP-independent, self-guards reduced motion). Both are
   * byte-identical to compile.js (shared pauseBlocks). */
  if (pause.css) cssOut = (cssOut || "/* MotionSpec WAAPI lowering (no GSAP) - generated CSS artifact. */\n") + pause.css;
  if (pause.js) {
    const block = "(function () {\n" + pause.js + "\n})();\n";
    if (jsOut === null) {
      jsOut = "/* MotionSpec WAAPI lowering (no GSAP) - generated artifact. Do NOT edit by hand. */\n" +
        "/* Spec: " + safeName + "  (pause controls only) */\n" + block;
    } else {
      jsOut = jsOut + block;
    }
  }

  return {
    ok: true,
    js: jsOut,
    css: cssOut,
    report: {
      motions: spec.motions.length,
      jsCount: nJs,
      cssCount: nCss,
      engine: "web-animations-api",
      gsap: false,
      reducedMotion: respectRM,
      reducedMotionOverriddenOff: !!(spec.globals && spec.globals.respectReducedMotion === false),
      specVersion: spec.specVersion,
    },
  };
}

/* cssRaw/withDefaults are re-exported from safety.js so the parity test can
 * check the reference identity of both passes against the ONE source. */
module.exports = { lowerWaapi, SUPPORTED, easing, rootMargin, fromTransform, cssRaw, withDefaults };
