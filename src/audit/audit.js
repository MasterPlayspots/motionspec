"use strict";
/*
 * audit.js — MotionSpec a11y-Checker (Motion), static MVP.
 * ----------------------------------------------------------------------
 * Fetches a URL's HTML + its linked stylesheets and scans the CSS TEXT for
 * motion-accessibility problems. NO headless browser, NO new runtime dependency
 * (hand-rolled tokenizer/regex over CSS text — deliberately NOT css-tree, to keep
 * the 2-dep guardrail + SBOM/Socket clean). Runtime motion (WAAPI/GSAP/JS
 * .animate/requestAnimationFrame) is honestly disclosed as "not audited (V2)".
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
 * Output: { score, findings:[{selector, rule, wcag, fix}],
 *           summary, badge, disclosures }  +  a Markdown report string.
 * A clean site earns the literal badge string "reduced-motion-safe".
 *
 * DETERMINISM: the ANALYSIS is a pure function of the fetched text (no Date /
 * random / entropy). Only the network layer touches the outside world, and it is
 * defensive: per-request timeout, response size cap, bounded stylesheet count,
 * and it records NO PII (no cookies, no auth, no full request/response logging).
 */

const WCAG_2_2_2 = "WCAG 2.2.2 (Pause, Stop, Hide)";
const WCAG_2_3_3 = "WCAG 2.3.3 (Animation from Interactions)";

/* Badge string is API — must stay exactly this. */
const BADGE_SAFE = "reduced-motion-safe";

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

/* Extract linked stylesheet URLs (<link rel="stylesheet" href=...>). */
function linkedStylesheets(html, base) {
  const out = [];
  const linkRe = /<link\b[^>]*>/gi;
  let m;
  while ((m = linkRe.exec(html)) !== null) {
    const tag = m[0];
    if (!/rel\s*=\s*["']?[^"'>]*stylesheet/i.test(tag)) continue;
    /* href value: quoted ("…"/'…') or unquoted (up to whitespace or >). */
    const href = /href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(tag);
    if (!href) continue;
    const val = href[1] || href[2] || href[3];
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
  return sigs;
}

/* ---- CSS scanning (hand-rolled, deterministic) --------------------------- */

/* Remove CSS comments (so tokens inside comments do not trigger findings). */
function stripCssComments(css) {
  return String(css).replace(/\/\*[\s\S]*?\*\//g, "");
}

/* Split CSS into top-level blocks, tracking whether each block sits inside a
 * `@media (prefers-reduced-motion: ...)` at-rule. Returns a flat list of
 * { selector, body, inReducedMotionQuery } for style rules, plus the set of
 * @keyframes names seen at any nesting. Brace-matching scanner — good enough for
 * the static MVP; malformed CSS degrades gracefully (never throws). */
function scanCss(cssRaw) {
  const css = stripCssComments(cssRaw);
  const rules = [];
  const keyframes = new Set();
  /* Track a stack of at-rule contexts; each entry says whether we are inside a
   * reduced-motion media query. */
  const stack = [{ rm: false }];
  let i = 0;
  const n = css.length;
  let prelude = "";
  while (i < n) {
    const ch = css[i];
    if (ch === "{") {
      const head = prelude.trim();
      prelude = "";
      if (head[0] === "@") {
        const lower = head.toLowerCase();
        if (lower.startsWith("@keyframes") || lower.startsWith("@-webkit-keyframes")) {
          /* capture the keyframes name; skip its body wholesale */
          const nameM = /@(?:-webkit-)?keyframes\s+([A-Za-z0-9_-]+)/i.exec(head);
          if (nameM) keyframes.add(nameM[1]);
          i = skipBlock(css, i);
          continue;
        }
        const rm = stack[stack.length - 1].rm ||
          (lower.startsWith("@media") && /prefers-reduced-motion/.test(lower));
        stack.push({ rm });
        i++;
        continue;
      }
      /* style rule: capture its declaration body */
      const end = matchBrace(css, i);
      const body = css.slice(i + 1, end);
      rules.push({ selector: head, body, inReducedMotionQuery: stack[stack.length - 1].rm });
      i = end + 1;
      continue;
    }
    if (ch === "}") { if (stack.length > 1) stack.pop(); prelude = ""; i++; continue; }
    prelude += ch;
    i++;
  }
  return { rules, keyframes };
}

/* Return index of the matching closing brace for the '{' at openIdx. */
function matchBrace(css, openIdx) {
  let depth = 0;
  for (let j = openIdx; j < css.length; j++) {
    if (css[j] === "{") depth++;
    else if (css[j] === "}") { depth--; if (depth === 0) return j; }
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
const COMPOSITOR_SAFE = ["transform", "opacity", "-webkit-transform"];

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
    splitTopLevelCommas(val).forEach((seg) => {
      const first = seg.trim().split(/\s+/)[0];
      if (first && first !== "all" && first !== "none") props.push(first.toLowerCase());
      else if (first === "all") props.push("all");
    });
  }
  return props;
}

/* Does a declaration body contain an animation/transition at all? */
function hasAnimation(body) { return /(^|[;{\s])animation(-name)?\s*:/i.test(body); }
function hasTransition(body) { return /(^|[;{\s])transition(-property|-duration)?\s*:/i.test(body); }

/* Extract animation shorthand/duration to detect `infinite` + duration>5s. */
function animationInfo(body) {
  const info = { infinite: false, maxSeconds: 0, hasPlayState: /animation-play-state\s*:/i.test(body) };
  const re = /animation(?:-duration)?\s*:\s*([^;}]+)/gi;
  let m;
  while ((m = re.exec(body)) !== null) {
    const val = m[1].toLowerCase();
    if (/\binfinite\b/.test(val)) info.infinite = true;
    /* durations like 6s or 800ms anywhere in the shorthand */
    let dm; const dre = /(\d*\.?\d+)\s*(ms|s)\b/g;
    while ((dm = dre.exec(val)) !== null) {
      const secs = dm[2] === "ms" ? parseFloat(dm[1]) / 1000 : parseFloat(dm[1]);
      if (secs > info.maxSeconds) info.maxSeconds = secs;
    }
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
    if (COMPOSITOR_SAFE.indexOf(p) === -1 && SAFE_ANIMATED_PROPS.indexOf(p) === -1) risky.push(p);
  }
  return risky;
}

/* ---- analysis (pure) ------------------------------------------------------ */

/**
 * Analyze already-fetched HTML + CSS texts. Pure + deterministic.
 * @param {{url:string, html:string, styles:Array<{href:string,text:string}>,
 *          fetchErrors?:string[]}} input
 * @returns {{score:number, findings:Array, summary:string, badge:string|null,
 *            disclosures:string[]}}
 */
/* FIX-4: true only when a rule actually CREATES motion. A reduced-motion reset
   (animation: none / transition: none / *: none !important) is motion-DISABLING
   and must not be flagged as unguarded motion. */
function createsMotion(body) {
  const re = /(^|[;{\s])animation(-name)?\s*:\s*([^;}]+)/gi;
  let m;
  while ((m = re.exec(body)) !== null) {
    const v = m[3].trim().toLowerCase().replace(/!important/g, "").trim();
    if (v && v !== "none" && v !== "initial" && v !== "inherit" && v !== "unset") return true;
  }
  return transitionProps(body).length > 0;
}
function analyze(input) {
  const html = stripHtmlComments(input.html || "");
  const findings = [];
  const add = (selector, rule, ref, fix) =>
    findings.push({ selector, rule, wcag: ref, fix });

  /* Aggregate CSS from inline <style> + linked sheets. Each source keeps its own
   * label for the finding's selector context. */
  const sources = [];
  inlineStyleBlocks(html).forEach((text, i) => sources.push({ label: "<style> #" + (i + 1), text }));
  (input.styles || []).forEach((s) => sources.push({ label: s.href, text: s.text }));

  let anyAnimation = false;

  for (const src of sources) {
    const { rules } = scanCss(src.text);
    for (const r of rules) {
      const anim = hasAnimation(r.body);
      const trans = hasTransition(r.body);
      if (!anim && !trans) continue;
      anyAnimation = true;

      /* Check 1: motion not covered by a prefers-reduced-motion query. */
      if (!r.inReducedMotionQuery && createsMotion(r.body)) {
        add(r.selector, "Motion without prefers-reduced-motion guard", WCAG_2_3_3,
          "@media (prefers-reduced-motion: reduce) { " + r.selector + " { animation: none; transition: none; } }");
      }

      /* Check 2: animated non-transform/opacity properties (transition list). */
      const risky = riskyAnimatedProps(r.body);
      if (risky.length) {
        add(r.selector, "Animated non-transform/opacity propert(ies): " + risky.join(", "), WCAG_2_3_3,
          "Animate only transform/opacity (compositor-safe), e.g. transform instead of " + risky[0] + ".");
      }

      /* Check 3 + 4: infinite / autoplay > 5s without a pause path. */
      if (anim) {
        const info = animationInfo(r.body);
        const pausePath = info.hasPlayState || /data-(ms-)?paus/i.test(src.text) || /animation-play-state/i.test(src.text);
        if (info.infinite && !pausePath) {
          add(r.selector, "Infinite animation without pause path (no animation-play-state / data-* toggle)", WCAG_2_2_2,
            "Make it pausable: html[data-ms-paused] " + r.selector + " { animation-play-state: paused !important; } + pause button.");
        } else if (!info.infinite && info.maxSeconds > 5 && !pausePath) {
          add(r.selector, "Autoplay animation > 5s (" + info.maxSeconds + "s) without pause path", WCAG_2_2_2,
            "Make motion > 5s pausable/stoppable (WCAG 2.2.2).");
        }
      }
    }
  }

  /* Check 4 (element): a <marquee> is autoplaying motion by definition. */
  if (hasMarqueeElement(html)) {
    add("<marquee>", "Deprecated <marquee> element (autoplay motion, not pausable)", WCAG_2_2_2,
      "Remove <marquee>; if a ticker is needed, use a pausable CSS/JS solution with a pause control.");
  }

  /* Runtime motion we do NOT statically verify -> honest disclosure. */
  const disclosures = [];
  const sigs = runtimeMotionSignals(html);
  if (sigs.length) disclosures.push("Runtime motion detected (" + sigs.join(", ") + "): not audited (V2).");
  if (input.fetchErrors && input.fetchErrors.length)
    disclosures.push(input.fetchErrors.length + " resource(s) could not be loaded — partially unaudited.");
  if (!anyAnimation && !hasMarqueeElement(html))
    disclosures.push("No CSS animations/transitions found in the loaded CSS (static scan only).");

  /* Score: start at 100, subtract per finding (capped at 0). Deterministic. */
  const WEIGHT = { [WCAG_2_2_2]: 25, [WCAG_2_3_3]: 10 };
  let score = 100;
  for (const f of findings) score -= (WEIGHT[f.wcag] || 10);
  if (score < 0) score = 0;

  const badge = findings.length === 0 ? BADGE_SAFE : null;
  const summary = findings.length === 0
    ? "No motion-a11y violations found in the static scan."
    : findings.length + " motion-a11y finding(s) in the static scan.";

  return { score, findings, summary, badge, disclosures };
}

/* ---- Markdown report ------------------------------------------------------ */

function toMarkdown(result, url) {
  const lines = [];
  lines.push("# MotionSpec Motion-a11y Audit");
  lines.push("");
  lines.push("**URL:** " + (url || "(unknown)"));
  lines.push("");
  lines.push("**Score:** " + result.score + "/100  ·  **Findings:** " + result.findings.length);
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
      lines.push("| " + cell(f.selector) + " | " + cell(f.rule) + " | " + cell(f.wcag) + " | " + cell(f.fix) + " |");
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
  lines.push("Static MVP scan (HTML + linked stylesheets). Runtime motion (WAAPI/GSAP/JS) is disclosed as _not audited (V2)_.");
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
  audit, analyze, toMarkdown,
  /* exported for tests + reuse (all pure) */
  scanCss, animationInfo, riskyAnimatedProps, transitionProps, linkedStylesheets,
  inlineStyleBlocks, hasMarqueeElement, runtimeMotionSignals, resolveHref,
  BADGE_SAFE, WCAG_2_2_2, WCAG_2_3_3, DEFAULTS,
};
