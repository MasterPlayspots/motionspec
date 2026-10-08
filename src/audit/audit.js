"use strict";
/*
 * audit.js — MotionSpec a11y-Checker (Motion), static engine.
 * ----------------------------------------------------------------------
 * Fetches a URL's HTML + its linked stylesheets and scans the CSS TEXT for
 * motion-accessibility problems. NO headless browser, NO new runtime dependency
 * (hand-rolled tokenizer/regex over CSS text — deliberately NOT css-tree, to keep
 * the 2-dep guardrail + SBOM/Socket clean). Runtime motion (WAAPI/GSAP/JS
 * .animate/requestAnimationFrame, WebGL libraries) is honestly disclosed as
 * "not audited (V2)".
 *
 * Four checks (scope = MotionSpec's lane; deliberately NOT perf/MotionScore):
 *   1. animation/transition rules NOT covered by a prefers-reduced-motion query
 *      -> WCAG 2.3.3 (Animation from Interactions, AAA) — our RRM-guard signal.
 *   2. animated properties other than transform/opacity (layout-thrash +
 *      vestibular risk).
 *   3. `infinite` animations with no pause path (no animation-play-state rule,
 *      no data-* pause hook) -> WCAG 2.2.2 (Pause, Stop, Hide).
 *   4. a <marquee> element, or an autoplaying animation running > 5s
 *      -> WCAG 2.2.2.
 *
 * W1.1 (2026-09-11) — precision rules, so the result survives a review by an
 * accessibility-literate buyer:
 *   (a) CASCADE-AWARE guards. A `@media (prefers-reduced-motion: reduce)` rule
 *       that disables motion for a selector (animation: none, tiny durations,
 *       paused, iteration-count 1, transition: none, scroll-behavior: auto)
 *       guards every motion rule with a matching selector ANYWHERE in the loaded
 *       CSS — the Bootstrap / Tailwind "override at the end" architecture. The
 *       guard must actually win the cascade: same selector later in source
 *       order, or `!important`. A universal guard (`*`, `html *` …) needs
 *       `!important` (specificity 0 loses to every class rule otherwise).
 *       Rules inside `prefers-reduced-motion: no-preference` are guarded by
 *       construction. A `matchMedia('(prefers-reduced-motion')` check in the
 *       page JS (or Tailwind motion-reduce:/motion-safe: utilities in the HTML)
 *       is a guard HINT: it halves the weight of "unguarded" findings and is
 *       disclosed — it cannot be verified statically.
 *   (b) COLOUR / OPACITY TRANSITIONS ARE NOT MOTION. WCAG 2.3.3 defines
 *       "motion animation" as excluding changes of colour, blurring or opacity.
 *       A transition whose property list is only colour/opacity/shadow-type
 *       properties produces no finding (counted in `coverage`, disclosed); the
 *       same holds for an animation whose @keyframes (known from the loaded
 *       CSS) change only such properties. `transition: all` stays a candidate
 *       at half weight ("check what moves").
 *   (c) LOADING INDICATORS ARE NOT LEVEL-A CANDIDATES. Understanding 2.2.2
 *       names the preload phase as an essential exception. Selectors/keyframes
 *       that look like spinners, loaders, progress bars, skeletons or shimmers
 *       become kind `preload-candidate` (severity "review", score impact 0) and
 *       stay visible in the report for manual verification — and get no 2.3.3
 *       guard finding on top (essential). pulse/bounce/blink/marquee/ticker/
 *       float/wiggle remain real candidates.
 *   (d) BADGE ONLY WITH EVIDENCE. No CSS animation/transition in the loaded CSS
 *       -> status `not-measurable`: score null, no badge, explicit disclosure.
 *       Runtime motion libraries are detected from <script src> as well as the
 *       HTML text (GSAP, three.js, PixiJS, Lottie, Framer Motion, …) and the
 *       badge is withheld while any runtime motion signal is present.
 *
 * Output: { status, score, findings:[{selector, rule, wcag, fix, kind, root,
 *           weight?, severity?, note?}], summary, badge, disclosures, coverage }
 *         + a Markdown report string. A clean, measurable site earns the literal
 *         badge string "reduced-motion-safe".
 *
 * DETERMINISM: the ANALYSIS is a pure function of the fetched text (no Date /
 * random / entropy). Only the network layer touches the outside world, and it is
 * defensive: per-request timeout, response size cap, bounded stylesheet count,
 * and it records NO PII (no cookies, no auth, no full request/response logging).
 */

const WCAG_2_2_2 = "WCAG 2.2.2 (Pause, Stop, Hide)";
const WCAG_2_3_3 = "WCAG 2.3.3 (Animation from Interactions)";
/* W1.1: the reference for loading indicators deliberately carries NO "x.y.z"
 * number. Downstream counters (report-worker `mandatoryAAus`: first \d+.\d+.\d+
 * in `wcag`) would otherwise count a preload spinner as a Level-A candidate. */
const REVIEW_PRELOAD = "Manual review (Pause, Stop, Hide — preload exception)";

/* Badge string is API — must stay exactly this. */
const BADGE_SAFE = "reduced-motion-safe";

/* Result status (API, additive since W1.1). */
const STATUS_MEASURED = "measured";
const STATUS_NOT_MEASURABLE = "not-measurable";

/* Network defaults (defensive). Overridable via opts for tests. */
const DEFAULTS = {
  timeoutMs: 8000,
  maxBytes: 2 * 1024 * 1024, /* 2 MB per document */
  maxStylesheets: 20,
  userAgent: "MotionSpecAudit/1.0 (+https://motionspec.dev)",
};

/* ---- fetch layer (defensive, PII-free) ----------------------------------- */

/* Fetch text with a hard timeout and a size cap. Returns { ok, text, status,
 * error }. Never throws to the caller; never logs the URL or any headers. */
async function fetchText(url, opts) {
  const o = Object.assign({}, DEFAULTS, opts);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), o.timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "user-agent": o.userAgent, accept: "text/html,text/css,*/*" },
    });
    if (!res.ok) return { ok: false, status: res.status, error: "HTTP " + res.status };
    /* Size cap: read the stream and stop past maxBytes. */
    const reader = res.body && res.body.getReader ? res.body.getReader() : null;
    if (!reader) {
      const text = await res.text();
      return { ok: true, status: res.status, text: text.slice(0, o.maxBytes) };
    }
    const chunks = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      chunks.push(value);
      if (total > o.maxBytes) { try { await reader.cancel(); } catch (e) { /* ignore */ } break; }
    }
    const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    return { ok: true, status: res.status, text: buf.toString("utf8").slice(0, o.maxBytes) };
  } catch (e) {
    /* Do NOT leak the URL into the message; keep it generic + PII-free. */
    return { ok: false, error: e && e.name === "AbortError" ? "timeout" : "fetch failed" };
  } finally {
    clearTimeout(timer);
  }
}

/* ---- HTML helpers (regex, no DOM) ---------------------------------------- */

/* Strip HTML comments so commented-out markup does not create false positives. */
function stripHtmlComments(html) {
  return String(html).replace(/<!--[\s\S]*?-->/g, "");
}

/* Resolve a possibly-relative stylesheet href against the page URL. Returns null
 * for data: URIs and anything that does not resolve. */
function resolveHref(href, base) {
  try {
    const u = new URL(href, base);
    if (u.protocol === "data:") return null;
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch (e) { return null; }
}

/* Value of an href/src attribute inside one tag: quoted or unquoted. */
function attrValue(tag, name) {
  const m = new RegExp(name + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s\"'>]+))", "i").exec(tag);
  if (!m) return null;
  return m[1] || m[2] || m[3] || null;
}

/* Extract linked stylesheet URLs (<link rel="stylesheet" href=...>). */
function linkedStylesheets(html, base) {
  const out = [];
  const linkRe = /<link\b[^>]*>/gi;
  let m;
  while ((m = linkRe.exec(html)) !== null) {
    const tag = m[0];
    if (!/rel\s*=\s*["']?[^"'>]*stylesheet/i.test(tag)) continue;
    const val = attrValue(tag, "href");
    if (!val) continue;
    const resolved = resolveHref(val, base);
    if (resolved && out.indexOf(resolved) === -1) out.push(resolved);
  }
  return out;
}

/* Extract inline <style>…</style> blocks (their CSS text). */
function inlineStyleBlocks(html) {
  const out = [];
  const re = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let m;
  while ((m = re.exec(html)) !== null) out.push(m[1]);
  return out;
}

/* Put inline <style> blocks and fetched stylesheets into DOCUMENT order — that
 * is the cascade order a cascade-aware guard check has to respect. Sheets that
 * are not referenced by the HTML (tests, callers passing CSS directly) are
 * appended in the order given. Pure. */
function orderedStyleSources(html, styles, base) {
  const inline = inlineStyleBlocks(html);
  const byHref = new Map();
  (styles || []).forEach((s) => { if (s && s.href != null && !byHref.has(s.href)) byHref.set(s.href, s); });
  const used = new Set();
  const out = [];
  let inlineIdx = 0;
  const re = /<(link|style)\b[^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[1].toLowerCase() === "style") {
      const t = inline[inlineIdx++];
      if (t != null) out.push({ label: "<style> #" + inlineIdx, text: t });
      continue;
    }
    const tag = m[0];
    if (!/rel\s*=\s*["']?[^"'>]*stylesheet/i.test(tag)) continue;
    const val = attrValue(tag, "href");
    if (!val) continue;
    const resolved = base ? resolveHref(val, base) : val;
    const key = resolved && byHref.has(resolved) ? resolved : (byHref.has(val) ? val : null);
    if (key == null || used.has(key)) continue;
    used.add(key);
    out.push({ label: key, text: byHref.get(key).text });
  }
  (styles || []).forEach((s) => {
    if (!s || s.href == null || used.has(s.href)) return;
    used.add(s.href);
    out.push({ label: s.href, text: s.text });
  });
  return out;
}

/* Does the HTML use a <marquee> element (deprecated autoplaying motion)? */
function hasMarqueeElement(html) {
  return /<marquee\b/i.test(html);
}

/* Runtime motion signals in the HTML/inline JS we honestly do NOT statically
 * evaluate (disclosed as "not audited (V2)"). */
function runtimeMotionSignals(html) {
  const sigs = [];
  if (/\.animate\s*\(/.test(html)) sigs.push("Element.animate() (Web Animations API)");
  if (/\bgsap\b|ScrollTrigger/.test(html)) sigs.push("GSAP");
  if (/requestAnimationFrame\s*\(/.test(html)) sigs.push("requestAnimationFrame-Loop");
  if (/\bTHREE\./.test(html)) sigs.push("three.js");
  if (/\bPIXI\./.test(html)) sigs.push("PixiJS");
  if (/\blottie\.loadAnimation\s*\(/.test(html)) sigs.push("Lottie");
  if (/\bnew\s+Swiper\s*\(/.test(html)) sigs.push("Swiper");
  if (/\bnew\s+Splide\s*\(/.test(html)) sigs.push("Splide");
  if (/\bnew\s+Lenis\s*\(/.test(html)) sigs.push("Lenis");
  if (/\bLocomotiveScroll\b/.test(html)) sigs.push("Locomotive Scroll");
  return sigs;
}

/* W1.1: motion/WebGL libraries loaded via <script src>. External bundles are
 * never fetched, so the file name is the only evidence — token-bounded so that
 * "promotion.js" is not "motion" and "motionspec" is not "motion". */
const RUNTIME_LIBS = [
  ["gsap", "GSAP"], ["scrolltrigger", "ScrollTrigger"], ["three", "three.js"], ["pixi", "PixiJS"],
  ["framer", "Framer Motion"], ["lottie", "Lottie"], ["motion", "Motion"], ["anime", "anime.js"],
  ["animejs", "anime.js"], ["scrollmagic", "ScrollMagic"], ["swiper", "Swiper"], ["splide", "Splide"],
  ["locomotive", "Locomotive Scroll"], ["lenis", "Lenis"], ["barba", "Barba.js"], ["webgl", "WebGL"],
];
function scriptSources(html) {
  const out = [];
  const re = /<script\b[^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const src = attrValue(m[0], "src");
    if (src) out.push(src);
  }
  return out;
}
function runtimeMotionLibraries(html) {
  const found = [];
  for (const src of scriptSources(html)) {
    let path = String(src).toLowerCase();
    const q = path.search(/[?#]/);
    if (q >= 0) path = path.slice(0, q);
    for (const [token, name] of RUNTIME_LIBS) {
      if (found.indexOf(name) !== -1) continue;
      if (new RegExp("(^|[/._@-])" + token + "([/._@-]|$)").test(path)) found.push(name);
    }
  }
  return found;
}

/* W1.1: a JavaScript prefers-reduced-motion check on the page (matchMedia). It is
 * a guard HINT — the static scan cannot tell which motion it gates. */
function hasJsReducedMotionGuard(html) {
  return /matchMedia\s*\(\s*["'`]\s*\(?\s*prefers-reduced-motion/i.test(html);
}
/* Other guard hints visible in the HTML (framework utilities that toggle motion
 * per element; verified only as "in use", not per rule). */
function guardHints(html) {
  const hints = [];
  if (/\bmotion-(reduce|safe):/.test(html)) hints.push("Tailwind motion-reduce:/motion-safe: utilities");
  return hints;
}

/* ---- CSS scanning (hand-rolled, deterministic) --------------------------- */

/* Remove CSS comments (so tokens inside comments do not trigger findings). */
function stripCssComments(css) {
  return String(css).replace(/\/\*[\s\S]*?\*\//g, "");
}

/* W1.7 (2026-09-11): a backslash-escaped quote (\' or \" — Tailwind arbitrary selectors such as
 * `[&_svg:not([class*='size-'])]:size-4` from the shadcn/ui Button) is NOT the start of a CSS string.
 * Treating it as one opened a "string" that ran to the end of minified CSS and swallowed every rule after it. */
function isEscapedAt(s, i) { let k = i - 1, b = 0; while (k >= 0 && s[k] === "\\") { b++; k--; } return b % 2 === 1; }

/* Index just past the string literal that starts at i (quote char at css[i]).
 * A raw newline ends a CSS string, which bounds the damage of a stray quote. */
function skipString(css, i) {
  const q = css[i];
  let j = i + 1;
  while (j < css.length) {
    const c = css[j];
    if (c === "\\") { j += 2; continue; }
    if (c === q) return j + 1;
    if (c === "\n") return j;
    j++;
  }
  return css.length;
}

/* prefers-reduced-motion context of an at-rule prelude (lower-cased):
 * "reduce" | "no-preference" | null. `@media not (…: reduce)` inverts. */
function rmContextOf(lowerHead) {
  if (!/^@media\b/.test(lowerHead) || lowerHead.indexOf("prefers-reduced-motion") === -1) return null;
  const negated = /^@media\s+not\b/.test(lowerHead);
  const noPref = /prefers-reduced-motion\s*:\s*no-preference/.test(lowerHead);
  const v = noPref ? "no-preference" : "reduce";
  if (!negated) return v;
  return v === "reduce" ? "no-preference" : "reduce";
}

/* Split CSS into style rules, tracking the `@media (prefers-reduced-motion: …)`
 * context each rule sits in. Returns a flat list of
 * { selector, body, rmContext, inReducedMotionQuery } for style rules, plus the
 * set of @keyframes names seen at any nesting. Brace-matching scanner that is
 * string-aware and skips statement at-rules (@import/@charset/@layer x;) —
 * good enough for the static engine; malformed CSS degrades gracefully. */
function scanCss(cssRaw) {
  const css = stripCssComments(cssRaw);
  const rules = [];
  const keyframes = new Set();
  /* W1.1: name -> Set of properties the keyframes animate (so an opacity-only
   * fade is not reported as "motion" — WCAG 2.3.3 excludes colour/opacity). */
  const keyframeProps = new Map();
  /* Stack of at-rule contexts; each entry carries the reduced-motion context. */
  const stack = [{ rm: null }];
  let i = 0;
  const n = css.length;
  let prelude = "";
  while (i < n) {
    const ch = css[i];
    if ((ch === "\"" || ch === "'") && !isEscapedAt(css, i)) {
      const j = skipString(css, i);
      prelude += css.slice(i, j);
      i = j;
      continue;
    }
    if (ch === "{") {
      const head = prelude.trim();
      prelude = "";
      if (head[0] === "@") {
        const lower = head.toLowerCase();
        if (/^@(-webkit-|-moz-|-o-)?keyframes\b/.test(lower)) {
          /* capture the keyframes name + the properties it animates; skip its body */
          const nameM = /@(?:-webkit-|-moz-|-o-)?keyframes\s+([A-Za-z0-9_-]+)/i.exec(head);
          const end = matchBrace(css, i);
          if (nameM) {
            keyframes.add(nameM[1]);
            keyframeProps.set(nameM[1], keyframeProperties(css.slice(i + 1, end)));
          }
          i = end + 1;
          continue;
        }
        const own = rmContextOf(lower);
        const rm = own || stack[stack.length - 1].rm;
        stack.push({ rm });
        i++;
        continue;
      }
      /* style rule: capture its declaration body */
      const end = matchBrace(css, i);
      const body = css.slice(i + 1, end);
      const rm = stack[stack.length - 1].rm;
      rules.push({ selector: head, body, rmContext: rm, inReducedMotionQuery: rm !== null });
      i = end + 1;
      continue;
    }
    if (ch === "}") { if (stack.length > 1) stack.pop(); prelude = ""; i++; continue; }
    /* A top-level `;` ends a statement at-rule (@import url(x); @charset "…";
     * @layer a, b;). Without this reset the next selector inherited the prelude. */
    if (ch === ";") { prelude = ""; i++; continue; }
    prelude += ch;
    i++;
  }
  return { rules, keyframes, keyframeProps };
}

/* Property names declared anywhere inside a @keyframes body (`from{}`, `50%{}` …).
 * Timing/composition longhands are not visual properties and are ignored. */
const KEYFRAME_META_PROPS = ["animation-timing-function", "animation-composition"];
function keyframeProperties(body) {
  const props = new Set();
  const re = /(^|[{;\s])(-{0,2}[a-zA-Z][-a-zA-Z0-9]*)\s*:/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    const p = m[2].toLowerCase();
    if (KEYFRAME_META_PROPS.indexOf(p) === -1) props.add(p);
  }
  return props;
}

/* Return index of the matching closing brace for the '{' at openIdx. */
function matchBrace(css, openIdx) {
  let depth = 0;
  for (let j = openIdx; j < css.length; j++) {
    const c = css[j];
    if ((c === "\"" || c === "'") && !isEscapedAt(css, j)) { j = skipString(css, j) - 1; continue; }
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return j; }
  }
  return css.length - 1;
}
/* Skip a whole `{…}` block starting at the '{' at openIdx; returns the index
 * just past the closing brace. */
function skipBlock(css, openIdx) {
  return matchBrace(css, openIdx) + 1;
}

/* CSS properties whose animation/transition is compositor-safe (no layout
 * thrash, low vestibular risk). Everything else in check 2 is flagged. */
const SAFE_ANIMATED_PROPS = ["transform", "opacity", "filter", "-webkit-transform", "color", "background-color", "box-shadow", "text-shadow", "outline-color", "border-color"];
/* The conservative "definitely fine" set for the vestibular check. */
const COMPOSITOR_SAFE = ["transform", "opacity", "-webkit-transform", "translate", "scale", "rotate"];

/* W1.1: transition properties that are NOT "motion animation" under WCAG 2.3.3
 * (the SC excludes changes of colour, blurring and opacity). Vendor prefixes are
 * stripped before lookup; custom properties (--x) cannot be resolved statically
 * and are treated as non-motion rather than invented as motion. */
const NON_MOTION_PROPS = [
  "color", "background-color", "background", "border-color", "border-top-color", "border-right-color",
  "border-bottom-color", "border-left-color", "border-block-color", "border-inline-color", "border",
  "outline-color", "outline", "opacity", "box-shadow", "text-shadow", "text-decoration-color",
  "text-decoration", "fill", "stroke", "stop-color", "flood-color", "lighting-color", "visibility",
  "filter", "backdrop-filter", "caret-color", "accent-color", "column-rule-color", "text-emphasis-color",
  "text-fill-color", "text-stroke-color", "font-weight", "font-variation-settings", "color-scheme",
  /* Patch B (Review 11.09.): nicht-visuelle / diskrete Eigenschaften in @keyframes
   * (huge.com `disappear`: opacity + pointer-events) sind keine Bewegung. */
  "pointer-events", "z-index", "display", "content", "cursor", "user-select", "will-change", "overflow",
];
function stripVendor(prop) { return String(prop || "").toLowerCase().replace(/^-(webkit|moz|ms|o)-/, ""); }
function isNonMotionProp(prop) {
  const p = stripVendor(prop);
  if (p.indexOf("--") === 0) return true;
  return NON_MOTION_PROPS.indexOf(p) !== -1;
}
/* Motion-suspect subset of a transition property list (`all` included). */
function transitionMotionProps(props) {
  return (props || []).filter((p) => !isNonMotionProp(p));
}

/* W1.1: loading-indicator heuristics (WCAG 2.2.2 preload exception). Matched
 * against the selector list AND the keyframes names of a rule. pulse/bounce/
 * blink/marquee/ticker/float/wiggle are deliberately NOT in this list. */
/* Patch B (Review 11.09.): "spinner/loader/loading/preload/skeleton/…" sind
 * Ladeanzeigen. Die bloßen Wortteile spin / shimmer / progress benennen ebenso
 * oft Dekoration (.logo-spin 20 s, .spinning-globe, .btn-shimmer, .progress-ring)
 * — sie zählen nur, wenn der Zyklus kurz ist (≤ 2 s: fa-spin 2 s, sqs-spin,
 * eicon-spin, Bootstrap progress-bar-stripes 1 s). "uploader" ist kein loader. */
const PRELOAD_STRONG_RE = /((^|[^a-z])loader|loading|spinner|preload|preloader|skeleton|placeholder-glow|placeholder-wave|\bsk-|busy|\blds-|buffering|throbber|processing)/i;
const PRELOAD_WEAK_RE = /(spin|shimmer|progress)/i;
const PRELOAD_MAX_SECONDS = 2;
function isPreloadLike(selector, keyframeNames, maxSeconds) {
  const hay = [String(selector || "")].concat((keyframeNames || []).map(String));
  if (hay.some((h) => PRELOAD_STRONG_RE.test(h))) return true;
  if (maxSeconds != null && maxSeconds > PRELOAD_MAX_SECONDS) return false;
  return hay.some((h) => PRELOAD_WEAK_RE.test(h));
}

/* Parse the transition property list of a declaration body -> [propNames]. */
/* FIX-3: split a CSS list on TOP-LEVEL commas only, so commas inside
   cubic-bezier(), steps(), etc. are not mistaken for property separators. */
function splitTopLevelCommas(s) {
  const out = []; let depth = 0, cur = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "(") { depth++; cur += ch; }
    else if (ch === ")") { depth = depth > 0 ? depth - 1 : 0; cur += ch; }
    else if (ch === "," && depth === 0) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  if (cur.trim() !== "") out.push(cur);
  return out;
}
function transitionProps(body) {
  const props = [];
  const re = /transition(?:-property)?\s*:\s*([^;}]+)/gi;
  let m;
  while ((m = re.exec(body)) !== null) {
    const val = m[1];
    /* transition shorthand: first token of each comma group is the property */
    splitTopLevelCommas(val.replace(/!important/gi, " ")).forEach((seg) => {
      /* FIX-4 bleibt: var()/Funktionen sind statisch nicht auflösbar — sie werden
       * als Zeit/Easing-Platzhalter entfernt; bleibt kein Token, ist die Property unbekannt. */
      const hadVar = /\bvar\(/i.test(seg);
      const toks = seg.replace(/\b(cubic-bezier|steps|linear|var|env|calc)\([^)]*\)/gi, " ").trim().split(/\s+/).filter(Boolean).map((t) => t.toLowerCase());
      if (!toks.length) return;
      /* Nachzügler (Review 11.09.): im Shorthand ist die Reihenfolge frei — die
       * Property ist das Token, das weder Zeit noch Easing ist; fehlt es
       * (`transition: .3s`), gilt `all`. Vorher wurde ".3s"/"ease" als Property gemeldet. */
      const isTime = (t) => /^-?(\d*\.?\d+)(ms|s)$/.test(t);
      const isEasing = (t) => /^(ease|ease-in|ease-out|ease-in-out|linear|step-start|step-end)$/.test(t);
      const rest = toks.filter((t) => !isTime(t) && !isEasing(t));
      if (!rest.length && hadVar) return; /* `transition: var(--x)` — Property unbekannt, nicht erfinden */
      const first = rest.length ? rest[0] : "all";
      /* css-wide keywords + `none` are motion-DISABLING values, never properties */
      if (first === "none" || first === "initial" || first === "inherit" || first === "unset" || first === "revert" || first === "revert-layer") return;
      /* FIX-4: var()/function tokens can't be statically resolved to a property name */
      if (first.includes("(")) return;
      props.push(first);
    });
  }
  return props;
}

/* Split a declaration body into { prop, value (lower-cased, !important
 * stripped), important } — top-level `;` only, string- and paren-aware. */
function parseDeclarations(body) {
  const out = [];
  let depth = 0, cur = "";
  const flush = () => {
    const idx = cur.indexOf(":");
    if (idx > 0) {
      const prop = cur.slice(0, idx).trim().toLowerCase();
      let value = cur.slice(idx + 1).trim();
      const important = /!\s*important\s*$/i.test(value);
      value = value.replace(/!\s*important\s*$/i, "").trim().toLowerCase();
      if (prop) out.push({ prop, value, important });
    }
    cur = "";
  };
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if ((c === "\"" || c === "'") && !isEscapedAt(body, i)) { const j = skipString(body, i); cur += body.slice(i, j); i = j - 1; continue; }
    if (c === "(") depth++;
    else if (c === ")") depth = depth > 0 ? depth - 1 : 0;
    if (c === ";" && depth === 0) { flush(); continue; }
    cur += c;
  }
  flush();
  return out;
}

/* Extract @keyframes names referenced by animation/animation-name declarations.
 * Used as the root-cause identity for grouping (v2) — pure, deterministic. */
const ANIM_KEYWORDS = ["none", "initial", "inherit", "unset", "revert", "revert-layer", "infinite", "linear", "ease", "ease-in", "ease-out", "ease-in-out", "step-start", "step-end", "alternate", "alternate-reverse", "normal", "reverse", "forwards", "backwards", "both", "running", "paused"];
function animationNames(body) {
  const names = [];
  const re = /(^|[;{\s])animation(-name)?\s*:\s*([^;}]+)/gi;
  let m;
  while ((m = re.exec(body)) !== null) {
    const isNameProp = !!m[2];
    splitTopLevelCommas(m[3].replace(/!important/gi, " ")).forEach((seg) => {
      const toks = seg.trim().split(/\s+/);
      if (isNameProp) {
        const t = toks[0];
        if (t && ANIM_KEYWORDS.indexOf(t.toLowerCase()) === -1) names.push(t);
        return;
      }
      /* shorthand: the name is the first token that isn't a keyword, a time/count, or a timing fn */
      for (const t of toks) {
        const lt = t.toLowerCase();
        if (ANIM_KEYWORDS.indexOf(lt) !== -1) continue;
        if (/^[\d.-]/.test(lt)) continue;
        /* FIX-4 (us-uk 2026-08-05): any token containing parens is a function fragment
           (cubic-bezier/steps/linear pieces, var(), env(), …) — a CSS custom-ident
           keyframes name can never contain parens. The old prefix test missed var(),
           so `animation: var(--dur) ease spin` reported "var(--dur)" as the name. */
        if (lt.includes("(") || lt.includes(")")) continue;
        names.push(t);
        break;
      }
    });
  }
  return names;
}
/* First simple selector token — grouping fallback when no keyframes/props identify the cause. */
function selectorFamily(selector) {
  return String(selector || "").trim().split(/[\s>+~,]/)[0].slice(0, 60) || "(unknown)";
}
/* Root-cause identity of a motion rule body: the @keyframes it runs, else the
 * transitioned properties, else the selector family. */
function motionRoot(body, selector) {
  const names = animationNames(body);
  if (names.length) return "keyframes:" + Array.from(new Set(names)).sort().join(",");
  const tp = Array.from(new Set(transitionProps(body))).sort();
  if (tp.length) return "transition:" + tp.join(",");
  return "selector:" + selectorFamily(selector);
}

/* Does a declaration body contain an animation/transition at all? */
function hasAnimation(body) { return /(^|[;{\s])animation(-name)?\s*:/i.test(body); }
function hasTransition(body) { return /(^|[;{\s])transition(-property|-duration)?\s*:/i.test(body); }

/* Extract animation shorthand/duration to detect `infinite` + duration>5s.
 * W1.1: in the shorthand only the FIRST time of each comma group is the
 * duration (the second is the delay) — `animation: fade 1s 6s` is not a 6 s
 * animation. `animation-iteration-count: infinite` (longhand) counts too. */
function animationInfo(body) {
  const info = { infinite: false, maxSeconds: 0, hasPlayState: /animation-play-state\s*:/i.test(body) };
  if (/animation-iteration-count\s*:\s*[^;}]*\binfinite\b/i.test(body)) info.infinite = true;
  const re = /animation(-duration)?\s*:\s*([^;}]+)/gi;
  let m;
  while ((m = re.exec(body)) !== null) {
    const isDuration = !!m[1];
    const val = m[2].toLowerCase();
    if (!isDuration && /\binfinite\b/.test(val)) info.infinite = true;
    splitTopLevelCommas(val).forEach((seg) => {
      let dm; const dre = /(^|\s)(\d*\.?\d+)\s*(ms|s)\b/g;
      let first = true;
      const hay = " " + seg; /* Patch A (Review 11.09.): einmal bauen — im Schleifenkopf war es O(n²) */
      while ((dm = dre.exec(hay)) !== null) {
        const secs = dm[3] === "ms" ? parseFloat(dm[2]) / 1000 : parseFloat(dm[2]);
        if (isDuration || first) { if (secs > info.maxSeconds) info.maxSeconds = secs; }
        first = false;
      }
    });
  }
  return info;
}

/* animated non-transform/opacity properties in a declaration body (check 2). */
function riskyAnimatedProps(body) {
  const risky = [];
  /* animation targets @keyframes; we cannot know the animated props from the
   * shorthand alone, so check 2 focuses on TRANSITION property lists, which name
   * the property explicitly. */
  const tProps = transitionProps(body);
  for (const p of tProps) {
    if (p === "all") { risky.push("all"); continue; }
    if (COMPOSITOR_SAFE.indexOf(p) === -1 && SAFE_ANIMATED_PROPS.indexOf(p) === -1 && !isNonMotionProp(p)) risky.push(p);
  }
  return risky;
}

/* ---- W1.1 cascade-aware guard model ---------------------------------------- */

/* Normalise one selector for exact matching: collapse whitespace, tighten
 * combinators, legacy `:before` -> `::before` (pseudo-element suffixes stay
 * part of the identity — `.x` and `.x::before` are different targets). */
function normalizeSelector(s) {
  return String(s || "").trim()
    .replace(/\s+/g, " ")
    .replace(/\s*([>+~])\s*/g, "$1")
    .replace(/(?<!:):(before|after|first-line|first-letter)\b/gi, "::$1");
}
function splitSelectorList(selector) {
  return splitTopLevelCommas(String(selector || "")).map(normalizeSelector).filter(Boolean);
}
/* `*`, `html *`, `:root *`, `body *` (and the child-combinator forms). */
function isUniversalSelector(norm) {
  return /^(\*|(html|:root|body)( |>)\*)$/.test(norm);
}
function timeSeconds(tok) {
  const m = /^(\d*\.?\d+)(ms|s)$/i.exec(String(tok || "").trim());
  if (!m) return null;
  return m[2].toLowerCase() === "ms" ? parseFloat(m[1]) / 1000 : parseFloat(m[1]);
}
const TINY_SECONDS = 0.05;
function allTimesTiny(value) {
  const segs = splitTopLevelCommas(value).map((s) => s.trim()).filter(Boolean);
  if (!segs.length) return false;
  return segs.every((s) => { const t = timeSeconds(s); return t != null && t <= TINY_SECONDS; });
}
/* One comma group of an animation shorthand that disables motion: `none`,
 * `paused`, a tiny duration (first time token) or iteration count 1. */
function animationShorthandDisables(seg) {
  const toks = seg.trim().split(/\s+/).filter(Boolean);
  if (!toks.length) return false;
  if (toks.indexOf("none") !== -1 || toks.indexOf("paused") !== -1) return true;
  let firstTime = null;
  for (const t of toks) {
    const secs = timeSeconds(t);
    if (secs != null) { if (firstTime == null) firstTime = secs; continue; }
    if (/^1$/.test(t)) return true; /* iteration-count 1 */
  }
  return firstTime != null && firstTime <= TINY_SECONDS;
}
/* Which motion layers a declaration body switches OFF (for rules inside a
 * `prefers-reduced-motion: reduce` block). Returns { anim, trans } with
 * { important } per layer, or null when the layer is not disabled. */
function guardDeclarations(body) {
  const g = { anim: null, trans: null, scroll: null };
  const mark = (layer, important) => {
    if (!g[layer]) g[layer] = { important: false };
    if (important) g[layer].important = true;
  };
  for (const d of parseDeclarations(body)) {
    const p = stripVendor(d.prop);
    const v = d.value;
    if (p === "animation") {
      const segs = splitTopLevelCommas(v).map((s) => s.trim()).filter(Boolean);
      if (segs.length && segs.every(animationShorthandDisables)) mark("anim", d.important);
    } else if (p === "animation-name") {
      const segs = splitTopLevelCommas(v).map((s) => s.trim()).filter(Boolean);
      if (segs.length && segs.every((s) => s === "none")) mark("anim", d.important);
    } else if (p === "animation-duration") {
      if (allTimesTiny(v)) mark("anim", d.important);
    } else if (p === "animation-play-state") {
      if (/\bpaused\b/.test(v)) mark("anim", d.important);
    } else if (p === "animation-iteration-count") {
      if (/^\s*1(\s*,\s*1)*\s*$/.test(v)) mark("anim", d.important);
    } else if (p === "transition") {
      const segs = splitTopLevelCommas(v).map((s) => s.trim()).filter(Boolean);
      if (segs.length && segs.every((s) => s === "none" || allTimesTiny(s.split(/\s+/).filter((t) => timeSeconds(t) != null)[0] || "x"))) mark("trans", d.important);
    } else if (p === "transition-property") {
      if (/^none$/.test(v.trim())) mark("trans", d.important);
    } else if (p === "transition-duration") {
      if (allTimesTiny(v)) mark("trans", d.important);
    } else if (p === "scroll-behavior") {
      if (/^auto$/.test(v.trim())) mark("scroll", d.important);
    }
  }
  return g;
}
/* Does the motion rule itself use !important on its animation / transition? */
function declImportance(body) {
  const imp = { anim: false, trans: false };
  for (const d of parseDeclarations(body)) {
    if (!d.important) continue;
    const p = stripVendor(d.prop);
    if (p === "animation" || p === "animation-name" || p === "animation-duration" || p === "animation-iteration-count") imp.anim = true;
    if (p === "transition" || p === "transition-property" || p === "transition-duration") imp.trans = true;
  }
  return imp;
}
/* Is the motion rule (order + importance per layer) covered by a guard for any
 * selector of its list, or by an effective universal guard? Same selector means
 * same specificity, so the guard wins only later in source order or with
 * !important. Returns { covered, how, overridden }. */
function coveredBy(guards, universal, selList, layer, rule) {
  if (universal[layer] && universal[layer].important && !rule.important) return { covered: true, how: "universal" };
  /* Patch A (Review 11.09.): `.a, .b { transition }` trifft .a UND .b — ein Guard
   * nur für .b lässt .a ungeschützt. Gedeckt ist die Regel erst, wenn JEDER
   * Selektor der Liste gedeckt ist; ein überstimmter Guard wird gemeldet. */
  let overridden = false, hits = 0;
  for (const s of selList) {
    const e = guards.get(s);
    const g = e && e[layer];
    if (!g) continue;
    if (rule.important) { if (g.impOrder > rule.order) hits++; else overridden = true; continue; }
    if (g.impOrder >= 0 || g.anyOrder > rule.order) hits++; else overridden = true;
  }
  if (selList.length && hits === selList.length) return { covered: true, how: "selector" };
  return { covered: false, overridden, partial: hits > 0 };
}

/* ---- analysis (pure) ------------------------------------------------------ */

/* FIX-4: true only when a rule actually CREATES motion. A reduced-motion reset
   (animation: none / transition: none / *: none !important) is motion-DISABLING
   and must not be flagged as unguarded motion. */
function createsAnimation(body) {
  const re = /(^|[;{\s])animation(-name)?\s*:\s*([^;}]+)/gi;
  let m;
  while ((m = re.exec(body)) !== null) {
    const v = m[3].trim().toLowerCase().replace(/!important/g, "").trim();
    if (v && v !== "none" && v !== "initial" && v !== "inherit" && v !== "unset") return true;
  }
  return false;
}
function createsMotion(body) {
  if (createsAnimation(body)) return true;
  return transitionProps(body).length > 0;
}
function uniqSorted(list) { return Array.from(new Set(list)).sort(); }

const PRELOAD_RULE = "Loading indicator — exempt under 2.2.2 if interaction is blocked while it shows; verify it is not persistent decoration.";
function preloadFix(selector) {
  return "No change needed while it only shows during loading/busy states (WCAG 2.2.2 preload exception). If it stays visible as decoration: html[data-ms-paused] " + selector +
    " { animation-play-state: paused !important; } + a pause control; and slow it for reduced-motion users: @media (prefers-reduced-motion: reduce) { " + selector + " { animation-duration: 1.5s; } }";
}

/**
 * Analyze already-fetched HTML + CSS texts. Pure + deterministic.
 * @param {{url:string, html:string, styles:Array<{href:string,text:string}>,
 *          fetchErrors?:string[]}} input
 * @returns {{status:string, score:number|null, findings:Array, summary:string,
 *            badge:string|null, disclosures:string[], coverage:object}}
 */
function analyze(input) {
  const html = stripHtmlComments(input.html || "");
  const findings = [];
  const add = (selector, rule, ref, fix, kind, root, extra) => {
    const f = { selector, rule, wcag: ref, fix, kind: kind || "other", root: root || "selector:" + selectorFamily(selector) };
    if (extra) {
      if (typeof extra.weight === "number" && extra.weight !== 1) f.weight = extra.weight;
      if (extra.severity) f.severity = extra.severity;
      if (extra.note) f.note = extra.note;
    }
    findings.push(f);
  };

  /* Aggregate CSS from inline <style> + linked sheets in DOCUMENT (cascade)
   * order. Each source keeps its own label for the finding's selector context. */
  const sources = orderedStyleSources(html, input.styles || [], input.url);
  /* @keyframes name -> animated properties, across all sources (later wins, as in CSS). */
  const kfProps = new Map();
  const scanned = sources.map((src, si) => {
    const { rules, keyframeProps } = scanCss(src.text);
    rules.forEach((r, ri) => { r.order = si * 1000000 + ri; });
    keyframeProps.forEach((props, name) => kfProps.set(name, props));
    return { src, rules };
  });

  /* Pass 1 — guard set: selectors switched off inside `prefers-reduced-motion:
   * reduce` blocks, anywhere in the loaded CSS (cascade-aware). */
  const guards = new Map();
  const universal = { anim: null, trans: null };
  let weakUniversal = false;
  let guardRules = 0;
  for (const s of scanned) {
    for (const r of s.rules) {
      if (r.rmContext !== "reduce") continue;
      const g = guardDeclarations(r.body);
      if (!g.anim && !g.trans) continue;
      guardRules++;
      for (const sel of splitSelectorList(r.selector)) {
        if (isUniversalSelector(sel)) {
          for (const layer of ["anim", "trans"]) {
            if (!g[layer]) continue;
            if (g[layer].important) universal[layer] = { important: true };
            else weakUniversal = true;
          }
          continue;
        }
        /* Patch A (Review 11.09.): je Selektor nur das Beste je Ebene merken —
         * spätester Guard (anyOrder) und spätester !important-Guard (impOrder).
         * O(1) je Lookup statt O(Guards × Motion-Regeln). */
        let e = guards.get(sel);
        if (!e) { e = { anim: null, trans: null }; guards.set(sel, e); }
        for (const layer of ["anim", "trans"]) {
          if (!g[layer]) continue;
          if (!e[layer]) e[layer] = { anyOrder: -1, impOrder: -1 };
          if (r.order > e[layer].anyOrder) e[layer].anyOrder = r.order;
          if (g[layer].important && r.order > e[layer].impOrder) e[layer].impOrder = r.order;
        }
      }
    }
  }
  const jsGuard = hasJsReducedMotionGuard(html);
  const hints = guardHints(html);
  const hintFactor = (jsGuard || hints.length) ? 0.5 : 1;
  const hintNote = jsGuard
    ? "A JavaScript prefers-reduced-motion check (matchMedia) exists on this page — verify it covers this rule; weighted as a hint."
    : (hints.length ? hints[0] + " are in use on this page — verify they cover this rule; weighted as a hint." : null);

  /* Pass 2 — findings. */
  let motionEvidence = 0;
  let rulesScanned = 0, motionRules = 0, guardedRules = 0, nonMotionTransitions = 0, nonMotionAnimations = 0, preloadRules = 0, preloadCount = 0, overriddenGuards = 0;
  for (const s of scanned) {
    const src = s.src;
    const sheetPausePath = /data-(ms-)?paus/i.test(src.text) || /animation-play-state/i.test(src.text);
    for (const r of s.rules) {
      rulesScanned++;
      const anim = hasAnimation(r.body);
      const trans = hasTransition(r.body);
      if (!anim && !trans) continue;
      const animMotion = anim && createsAnimation(r.body);
      const tProps = trans ? transitionProps(r.body) : [];
      if (!animMotion && !tProps.length) continue; /* resets only (animation: none / transition: none) */
      motionRules++;
      const names = animMotion ? uniqSorted(animationNames(r.body)) : [];
      const kfRoot = names.length ? "keyframes:" + names.join(",") : motionRoot(r.body, r.selector);
      const tMotion = uniqSorted(transitionMotionProps(tProps));
      if (tProps.length && !tMotion.length) nonMotionTransitions++;
      /* An animation whose keyframes (all of them known from the loaded CSS) change
       * only opacity/colour/shadow-type properties is not "motion animation" under
       * WCAG 2.3.3 — same rule as for transitions. Unknown keyframes stay motion. */
      const animNonMotion = animMotion && names.length > 0 &&
        names.every((n) => kfProps.has(n) && Array.from(kfProps.get(n)).every(isNonMotionProp));
      if (animNonMotion) nonMotionAnimations++;
      /* Loading indicators are essential (2.2.2 preload exception); they get a
       * review entry below, not a 2.3.3 guard finding on top. */
      const preload = animMotion && isPreloadLike(r.selector, names, animationInfo(r.body).maxSeconds);
      if (preload) preloadRules++;

      const inReduce = r.rmContext === "reduce";
      const inNoPref = r.rmContext === "no-preference";
      const selList = splitSelectorList(r.selector);
      const imp = declImportance(r.body);
      const mediaCov = { covered: true, how: "media" };
      const animCov = animMotion ? ((inReduce || inNoPref) ? mediaCov : coveredBy(guards, universal, selList, "anim", { order: r.order, important: imp.anim })) : null;
      const transCov = tMotion.length ? ((inReduce || inNoPref) ? mediaCov : coveredBy(guards, universal, selList, "trans", { order: r.order, important: imp.trans })) : null;
      const unguardedAnim = !!(animCov && !animCov.covered) && !animNonMotion && !preload;
      const unguardedTrans = !!(transCov && !transCov.covered);
      const hasMotion = (animMotion && !animNonMotion) || tMotion.length > 0;
      if (hasMotion && !unguardedAnim && !unguardedTrans && !preload) guardedRules++;
      if (animMotion || tMotion.length > 0) motionEvidence++;

      /* Check 1: motion not covered by a prefers-reduced-motion guard (cascade-aware). */
      if (unguardedAnim || unguardedTrans) {
        const allOnly = !unguardedAnim && tMotion.length > 0 && tMotion.every((p) => p === "all");
        let weight = hintFactor;
        const notes = [];
        if (allOnly) { weight *= 0.5; notes.push("transition: all — check what moves; only properties that move need the guard."); }
        if ((animCov && animCov.overridden) || (transCov && transCov.overridden)) {
          overriddenGuards++;
          notes.push("A prefers-reduced-motion rule for this selector exists but is overridden (earlier in the cascade or without !important) — move it after the motion rule or add !important.");
        }
        if ((animCov && animCov.partial) || (transCov && transCov.partial))
          notes.push("A prefers-reduced-motion rule covers only some selectors of this list — the others still move; add them to the guard.");
        if (hintNote) notes.push(hintNote);
        const root = unguardedAnim ? kfRoot : "transition:" + tMotion.join(",");
        const off = unguardedAnim && unguardedTrans ? "animation: none; transition: none;" : (unguardedAnim ? "animation: none;" : "transition: none;");
        add(r.selector, "Motion without prefers-reduced-motion guard", WCAG_2_3_3,
          "@media (prefers-reduced-motion: reduce) { " + r.selector + " { " + off + " } }",
          "unguarded", root, { weight, severity: "medium", note: notes.length ? notes.join(" ") : null });
      }

      /* Check 2: animated non-transform/opacity properties (transition list) —
       * only where the transition is not guarded; a guarded rule already
       * satisfies C39 for reduced-motion users. */
      if (unguardedTrans) {
        const risky = tMotion.filter((p) => p === "all" || (COMPOSITOR_SAFE.indexOf(stripVendor(p)) === -1 && SAFE_ANIMATED_PROPS.indexOf(p) === -1));
        if (risky.length) {
          /* `all` alone: we cannot see what moves — half weight, like the guard finding. */
          const allOnlyRisky = risky.every((p) => p === "all");
          add(r.selector, "Animated non-transform/opacity propert(ies): " + risky.join(", "), WCAG_2_3_3,
            "Animate only transform/opacity (compositor-safe), e.g. transform instead of " + risky[0] + ".",
            "risky-props", "props:" + risky.join(","), { weight: hintFactor * (allOnlyRisky ? 0.5 : 1), severity: "low", note: allOnlyRisky ? "transition: all — check what moves." : null });
        }
      }

      /* Check 3 + 4: infinite / autoplay > 5s without a pause path. */
      if (animMotion) {
        const info = animationInfo(r.body);
        const pausePath = info.hasPlayState || sheetPausePath;
        const guarded = !!(animCov && animCov.covered) && !inReduce;
        const guardNote = guarded ? "A prefers-reduced-motion guard covers this selector; visitors without the OS setting still get no pause control (2.2.2)." : null;
        const preloadNote = guarded ? "A prefers-reduced-motion rule covers this selector." : "No prefers-reduced-motion rule covers this selector — if the indicator can stay visible for long, slow or stop it under reduce.";
        const root = kfRoot;
        if (info.infinite && !pausePath) {
          if (preload) {
            preloadCount++;
            add(r.selector, PRELOAD_RULE, REVIEW_PRELOAD, preloadFix(r.selector), "preload-candidate", root, { weight: 0, severity: "review", note: preloadNote });
          } else {
            add(r.selector, "Infinite animation without pause path (no animation-play-state / data-* toggle)", WCAG_2_2_2,
              "Make it pausable: html[data-ms-paused] " + r.selector + " { animation-play-state: paused !important; } + pause button.",
              "infinite-no-pause", root, { weight: guarded ? 0.5 : 1, severity: "high", note: guardNote });
          }
        } else if (!info.infinite && info.maxSeconds > 5 && !pausePath) {
          if (preload) {
            preloadCount++;
            add(r.selector, PRELOAD_RULE, REVIEW_PRELOAD, preloadFix(r.selector), "preload-candidate", root, { weight: 0, severity: "review", note: preloadNote });
          } else {
            add(r.selector, "Autoplay animation > 5s (" + info.maxSeconds + "s) without pause path", WCAG_2_2_2,
              "Make motion > 5s pausable/stoppable (WCAG 2.2.2).",
              "autoplay-long", root, { weight: guarded ? 0.5 : 1, severity: "high", note: guardNote });
          }
        }
      }
    }
  }

  /* Check 4 (element): a <marquee> is autoplaying motion by definition. */
  const marquee = hasMarqueeElement(html);
  if (marquee) {
    add("<marquee>", "Deprecated <marquee> element (autoplay motion, not pausable)", WCAG_2_2_2,
      "Remove <marquee>; if a ticker is needed, use a pausable CSS/JS solution with a pause control.",
      "marquee", "element:marquee", { severity: "high" });
  }

  /* Runtime motion we do NOT statically verify -> honest disclosure. */
  const disclosures = [];
  const sigs = runtimeMotionSignals(html);
  const libs = runtimeMotionLibraries(html);
  if (sigs.length) disclosures.push("Runtime motion detected (" + sigs.join(", ") + "): not audited (V2).");
  if (libs.length) disclosures.push("Runtime motion library detected (" + libs.join(", ") + ") — not audited (V2).");
  if (jsGuard) disclosures.push("A JavaScript prefers-reduced-motion check (matchMedia) is present — runtime motion may be guarded; not verified. CSS candidates without a CSS guard are weighted as hints.");
  for (const h of hints) disclosures.push(h + " are in use — treated as a guard hint, not verified per element.");
  if (input.fetchErrors && input.fetchErrors.length)
    disclosures.push(input.fetchErrors.length + " resource(s) could not be loaded — partially unaudited.");
  if (guardedRules)
    disclosures.push(guardedRules + " motion rule(s) are covered by a prefers-reduced-motion guard elsewhere in the CSS (cascade-aware match" +
      (universal.anim || universal.trans ? ", universal guard present" : "") + ", " + guards.size + " guarded selector(s)).");
  if (weakUniversal && !(universal.anim && universal.trans))
    disclosures.push("A universal prefers-reduced-motion reset (`*`) exists without !important — it is overridden by any more specific motion rule and is not counted as a guard.");
  if (overriddenGuards)
    disclosures.push(overriddenGuards + " selector(s) have a prefers-reduced-motion rule that is overridden by the cascade (order / !important) — see the notes.");
  if (nonMotionTransitions)
    disclosures.push(nonMotionTransitions + " transition rule(s) change only colour/opacity/shadow-type properties — not a motion animation under WCAG 2.3.3; not counted.");
  if (nonMotionAnimations)
    disclosures.push(nonMotionAnimations + " animation rule(s) run keyframes that change only opacity/colour — not a motion animation under WCAG 2.3.3; no guard finding (pause/blink checks still apply).");
  if (preloadRules)
    disclosures.push(preloadRules + " loading-indicator rule(s) (spinner/loader/progress/skeleton) are treated as essential (WCAG 2.2.2 preload exception) — no guard finding" +
      (preloadCount ? "; " + preloadCount + " listed for manual review, no score impact." : "."));

  /* Patch C (Review 11.09.): Farb-/Opacity-Transitions allein sind kein Beleg
   * für Motion-Hygiene — sonst bekäme jede Framer-Motion/GSAP-Seite mit einem
   * `a { transition: color }` den Badge. Messbar = mindestens eine echte
   * Motion-Regel (geschützt oder nicht) oder eine Ladeanzeige oder <marquee>. */
  const measurable = motionEvidence > 0 || marquee;
  const status = measurable ? STATUS_MEASURED : STATUS_NOT_MEASURABLE;
  if (!measurable)
    disclosures.push("No CSS motion found in the loaded CSS" + (motionRules ? " (only colour/opacity transitions)" : "") + "; runtime motion (JS/WebGL/WAAPI) is not audited.");
  /* A bare requestAnimationFrame call is scheduling, not motion evidence (analytics
   * and web-vitals snippets use it); every other signal withholds the badge. */
  const runtimeSignals = libs.length > 0 || sigs.some((s) => s !== "requestAnimationFrame-Loop");
  if (measurable && findings.length === 0 && runtimeSignals)
    disclosures.push("Badge withheld: runtime motion signals are present and not audited.");

  /* Score (v1, per finding): start at 100, subtract per finding weighted by
   * kind and by the finding's weight factor (capped at 0). Deterministic.
   * Not measurable -> null (no number is honest). */
  const WEIGHT = { [WCAG_2_2_2]: 25, [WCAG_2_3_3]: 10, [REVIEW_PRELOAD]: 0 };
  let score = null;
  if (measurable) {
    score = 100;
    for (const f of findings) {
      const base = WEIGHT[f.wcag] != null ? WEIGHT[f.wcag] : 10;
      const w = typeof f.weight === "number" ? f.weight : 1;
      score -= base * w;
    }
    score = Math.round(score);
    if (score < 0) score = 0;
  }

  const badge = (measurable && findings.length === 0 && !runtimeSignals) ? BADGE_SAFE : null;
  const summary = !measurable
    ? "Not measurable: no CSS motion found in the loaded CSS (static scan)."
    : (findings.length === 0
      ? "No motion-a11y violations found in the static scan."
      : findings.length + " motion-a11y finding(s) in the static scan" + (preloadCount ? " (" + preloadCount + " loading indicator(s) for manual review)" : "") + ".");

  const coverage = {
    stylesheets: sources.length,
    rules_scanned: rulesScanned,
    motion_rules: motionRules,
    motion_evidence_rules: motionEvidence,
    guarded_rules: guardedRules,
    non_motion_transition_rules: nonMotionTransitions,
    non_motion_animation_rules: nonMotionAnimations,
    preload_rules: preloadRules,
    keyframes_known: kfProps.size,
    guard_rules: guardRules,
    guard_selectors: guards.size,
    universal_guard: { animation: !!universal.anim, transition: !!universal.trans },
    js_guard: jsGuard,
    guard_hints: hints,
    runtime_libraries: libs,
    preload_candidates: preloadCount,
  };

  return { status, score, findings, summary, badge, disclosures, coverage };
}

/* ---- scoring v2: root-cause groups + log-dampened curve ------------------- */
/* One CSS root cause (a @keyframes animation, a transition property set) applied
 * to N selectors is ONE problem with N occurrences — not N problems. v2 groups
 * findings by (kind, root) and scores per GROUP: severity weight × a log-dampened
 * occurrence multiplier, with a per-category cap so no single issue class can
 * zero the score alone. Floor 0 remains reachable only for pages failing hard
 * across several categories. Pure + deterministic; findings[] stays untouched.
 * W1.1: a finding's `weight` (0.5 for `transition: all`-only, JS-guard hints and
 * guarded infinite animations; 0 for preload candidates) scales its group. */
const V2_WEIGHTS = { "infinite-no-pause": 20, "marquee": 20, "autoplay-long": 10, "unguarded": 8, "risky-props": 4, "preload-candidate": 0, "other": 8 };
const V2_KIND_CAPS = { "infinite-no-pause": 40, "marquee": 40, "autoplay-long": 25, "unguarded": 30, "risky-props": 15, "preload-candidate": 0, "other": 30 };
const V2_DOC = "scoring v2 (rules rev. 2026-09-11): 100 minus, per root-cause group (same kind + same keyframes/transition-props/selector-family), severity-weight x finding-weight x min(3, 1 + 0.4*log2(occurrences)); per-category caps (infinite/marquee 40, autoplay 25, unguarded 30, risky-props 15) so one issue class cannot zero the score alone; floor 0. Cascade-aware prefers-reduced-motion guards; colour/opacity transitions are not motion; loading indicators are review-only (0); no CSS motion -> not measurable (score null).";
function groupAndScoreV2(result) {
  const findings = (result && result.findings) || [];
  const status = result && result.status === STATUS_NOT_MEASURABLE ? STATUS_NOT_MEASURABLE : STATUS_MEASURED;
  const map = new Map();
  for (const f of findings) {
    const kind = f.kind || "other";
    /* Unguarded TRANSITIONS collapse to one group regardless of property set:
     * they share one root cause (the transition layer ships without a guard)
     * and one fix (a targeted prefers-reduced-motion reset for exactly those
     * selectors). `transition: all`-only rules form their own half-weight group
     * ("check what moves"). Keyframes animations stay grouped per animation name
     * — genuinely distinct causes. */
    let root = f.root || f.rule;
    let rule = f.rule;
    let fix = f.fix;
    const w = typeof f.weight === "number" ? f.weight : 1;
    if (kind === "unguarded" && String(root).indexOf("transition:") === 0) {
      if (root === "transition:all") {
        rule = "Transitions on `all` without prefers-reduced-motion guard — check what moves";
      } else {
        root = "transition:(unguarded)";
        rule = "Transitions without prefers-reduced-motion guard";
      }
      fix = null; /* built from the group's selectors below */
    }
    const key = kind + "|" + root;
    let g = map.get(key);
    if (!g) {
      g = { kind, root, rule, wcag: f.wcag, fix, count: 0, selectors: [], weight: w };
      if (f.severity) g.severity = f.severity;
      map.set(key, g);
    }
    g.count++;
    if (w < g.weight) g.weight = w;
    if (g.selectors.length < 10 && g.selectors.indexOf(f.selector) === -1) g.selectors.push(f.selector);
  }
  const groups = Array.from(map.values());
  const perKind = {};
  for (const g of groups) {
    if (g.fix == null) {
      const more = Math.max(0, g.count - g.selectors.length);
      g.fix = "@media (prefers-reduced-motion: reduce) { " + g.selectors.join(", ") + " { transition: none; } }" +
        (more > 0 ? " /* + " + more + " more occurrence(s): list every selector that transitions a moving property */" : "");
    }
    const base = V2_WEIGHTS[g.kind] != null ? V2_WEIGHTS[g.kind] : 8;
    const mult = Math.min(3, 1 + 0.4 * (Math.log(Math.max(1, g.count)) / Math.LN2));
    g.deduction = Math.round(base * g.weight * mult * 10) / 10;
    if (g.weight === 1) delete g.weight;
    perKind[g.kind] = (perKind[g.kind] || 0) + g.deduction;
  }
  let total = 0;
  for (const k in perKind) {
    const cap = V2_KIND_CAPS[k] != null ? V2_KIND_CAPS[k] : 30;
    total += Math.min(perKind[k], cap);
  }
  let score = status === STATUS_NOT_MEASURABLE ? null : Math.round(100 - total);
  if (score != null && score < 0) score = 0;
  groups.sort((a, b) => b.deduction - a.deduction || b.count - a.count);
  const review = groups.filter((g) => g.kind === "preload-candidate").reduce((n, g) => n + g.count, 0);
  const summary = status === STATUS_NOT_MEASURABLE
    ? "Not measurable: no CSS motion found in the loaded CSS (static scan)."
    : (groups.length === 0
      ? "No motion-a11y violations found in the static scan."
      : groups.length + " distinct motion-a11y root cause(s), " + findings.length + " occurrence(s), in the static scan" + (review ? " (" + review + " loading indicator(s) for manual review, no score impact)" : "") + ".");
  return { score, groups, scoring: "v2", scoring_doc: V2_DOC, summary, status };
}

/* ---- Markdown report ------------------------------------------------------ */

function toMarkdown(result, url) {
  const lines = [];
  lines.push("# MotionSpec Motion-a11y Audit");
  lines.push("");
  lines.push("**URL:** " + (url || "(unknown)"));
  lines.push("");
  const scoreText = result.score == null ? "not measurable" : result.score + "/100";
  lines.push("**Score:** " + scoreText + "  ·  **Findings:** " + result.findings.length);
  if (result.status === STATUS_NOT_MEASURABLE) { lines.push(""); lines.push("**Status:** not measurable — no CSS motion in the loaded CSS."); }
  if (result.badge) lines.push("");
  if (result.badge) lines.push("**Badge:** `" + result.badge + "`");
  lines.push("");
  lines.push("_" + result.summary + "_");
  lines.push("");
  if (result.findings.length) {
    lines.push("## Findings");
    lines.push("");
    lines.push("| Selector | Rule | WCAG | Fix |");
    lines.push("| --- | --- | --- | --- |");
    for (const f of result.findings) {
      const cell = (s) => String(s == null ? "" : s).replace(/\|/g, "\\|").replace(/\n/g, " ");
      lines.push("| " + cell(f.selector) + " | " + cell(f.rule) + (f.note ? " — " + cell(f.note) : "") + " | " + cell(f.wcag) + " | " + cell(f.fix) + " |");
    }
    lines.push("");
  }
  if (result.disclosures && result.disclosures.length) {
    lines.push("## Not audited / notes");
    lines.push("");
    for (const d of result.disclosures) lines.push("- " + d);
    lines.push("");
  }
  lines.push("---");
  lines.push("Static scan (HTML + linked stylesheets, cascade-aware prefers-reduced-motion guards). Runtime motion (WAAPI/GSAP/JS/WebGL) is disclosed as _not audited (V2)_.");
  lines.push("");
  return lines.join("\n");
}

/* ---- orchestration (network) --------------------------------------------- */

/**
 * Audit a live URL: fetch its HTML + linked stylesheets, then analyze.
 * Returns { ok, url, ...analyze(), markdown } or { ok:false, error } on a hard
 * fetch failure of the page itself.
 * @param {string} url
 * @param {object} [opts] - { timeoutMs, maxBytes, maxStylesheets, fetchImpl }
 */
async function audit(url, opts) {
  const o = Object.assign({}, DEFAULTS, opts);
  const doFetch = o.fetchImpl || fetchText;
  const page = await doFetch(url, o);
  if (!page.ok) {
    return { ok: false, url, error: page.error || "fetch failed" };
  }
  const html = page.text;
  const hrefs = linkedStylesheets(html, url).slice(0, o.maxStylesheets);
  const styles = [];
  const fetchErrors = [];
  for (const href of hrefs) {
    const r = await doFetch(href, o);
    if (r.ok) styles.push({ href, text: r.text });
    else fetchErrors.push(href);
  }
  const result = analyze({ url, html, styles, fetchErrors });
  return Object.assign({ ok: true, url }, result, { markdown: toMarkdown(result, url) });
}

module.exports = {
  audit, analyze, toMarkdown, groupAndScoreV2,
  /* exported for tests + reuse (all pure) */
  scanCss, animationInfo, riskyAnimatedProps, transitionProps, linkedStylesheets,
  inlineStyleBlocks, hasMarqueeElement, runtimeMotionSignals, runtimeMotionLibraries, resolveHref,
  animationNames, motionRoot, orderedStyleSources,
  /* W1.1 helpers */
  normalizeSelector, splitSelectorList, rmContextOf, guardDeclarations, transitionMotionProps,
  isNonMotionProp, isPreloadLike, hasJsReducedMotionGuard, parseDeclarations, keyframeProperties,
  BADGE_SAFE, WCAG_2_2_2, WCAG_2_3_3, REVIEW_PRELOAD, STATUS_MEASURED, STATUS_NOT_MEASURABLE, DEFAULTS,
};
