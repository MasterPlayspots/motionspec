// audit-precision.test.mjs — W1.1 (2026-09-11): precision rules of the shared
// checker engine. src/audit/audit.js is a byte-identical copy of the site's
// checker; this file is the site's test/audit-precision.test.mjs with only the
// require path changed —
// keep BOTH files in sync when the engine changes. Fixtures pin the four
// construction faults: cascade-blind guards, colour transitions counted as
// motion, loading spinners as Level-A candidates, badges without evidence.
//   node --test test/audit-precision.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const engine = require('../src/audit/audit.js');

const page = (css, body = '<div class=x></div>', extraHead = '') =>
  `<html><head>${extraHead}<style>${css}</style></head><body>${body}</body></html>`;
const run = (css, body, extraHead) => engine.analyze({ url: 'https://example.test/', html: page(css, body, extraHead), styles: [], fetchErrors: [] });
const kinds = (r) => r.findings.map((f) => f.kind);

/* (a) Bootstrap pattern: the guard is a SEPARATE @media rule after the motion rule. */
test('(a) Bootstrap pattern — guard as separate @media rule → 0 unguarded, measurable, score 100', () => {
  const css = '.collapsing{height:0;overflow:hidden;transition:height .35s ease}' +
    '@media (prefers-reduced-motion:reduce){.collapsing{transition:none}}' +
    '.accordion-button::after{transition:transform .2s ease-in-out}' +
    '@media (prefers-reduced-motion:reduce){.accordion-button::after{transition:none}}' +
    '.form-control{transition:border-color .15s ease-in-out,box-shadow .15s ease-in-out}' +
    '@media (prefers-reduced-motion:reduce){.form-control{transition:none}}';
  const r = run(css);
  assert.equal(r.status, 'measured');
  assert.deepEqual(kinds(r).filter((k) => k === 'unguarded'), []);
  assert.deepEqual(kinds(r).filter((k) => k === 'risky-props'), [], 'guarded height transition is not a risky-props finding');
  assert.equal(r.findings.length, 0);
  const v2 = engine.groupAndScoreV2(r);
  assert.equal(v2.score, 100);
  assert.equal(r.coverage.guarded_rules, 2);
  assert.equal(r.coverage.non_motion_transition_rules, 1);
});

/* (b) Universal guard with !important (modern CSS reset) covers everything. */
test('(b) universal guard `*, *::before, *::after { … !important }` → 0 unguarded', () => {
  const css = '.hero{animation:slide 3s ease-in-out}.card:hover{transition:transform .3s}.x::before{transition:top .2s}' +
    '@media (prefers-reduced-motion: reduce){*,*::before,*::after{animation-duration:0.01ms!important;animation-iteration-count:1!important;transition-duration:0.01ms!important;scroll-behavior:auto!important}}';
  const r = run(css);
  assert.deepEqual(kinds(r).filter((k) => k === 'unguarded'), []);
  assert.equal(r.coverage.universal_guard.animation, true);
  assert.equal(r.coverage.universal_guard.transition, true);
  assert.equal(engine.groupAndScoreV2(r).score, 100);
});

test('(b2) universal guard WITHOUT !important is overridden by any class rule → still unguarded, disclosed', () => {
  const css = '.card{transition:transform .3s}@media (prefers-reduced-motion: reduce){*{transition:none}}';
  const r = run(css);
  assert.deepEqual(kinds(r), ['unguarded']);
  assert.ok(r.disclosures.some((d) => /universal prefers-reduced-motion reset .*without !important/.test(d)));
});

/* (c) .fa-spin infinite → preload-candidate, NOT a Level-A candidate. */
test('(c) `.fa-spin` infinite → preload-candidate (review, 0 points), no 2.2.2 in wcag, no Level A', () => {
  const css = '@keyframes fa-spin{0%{transform:rotate(0)}to{transform:rotate(1turn)}}.fa-spin{animation:fa-spin 2s infinite linear}';
  const r = run(css);
  assert.deepEqual(kinds(r).filter((k) => k === 'infinite-no-pause'), []);
  const p = r.findings.find((f) => f.kind === 'preload-candidate');
  assert.ok(p, 'preload-candidate present');
  assert.equal(p.severity, 'review');
  assert.equal(p.weight, 0);
  assert.ok(!/\d+\.\d+\.\d+/.test(p.wcag), 'wcag ref carries no x.y.z number (report-worker mandatoryAAus must not count it)');
  assert.match(p.rule, /Loading indicator — exempt under 2\.2\.2 if interaction is blocked while it shows; verify it is not persistent decoration\./);
  const v2 = engine.groupAndScoreV2(r);
  const g = v2.groups.find((x) => x.kind === 'preload-candidate');
  assert.equal(g.deduction, 0);
  assert.equal(r.badge, null, 'a review item is not a clean result');
});

test('(c2) other loading-indicator names are review-only, pulse/bounce/blink/ticker stay real candidates', () => {
  const css = '.w-lightbox-spinner{animation:spin 1s infinite}.sqs-spin{animation:sqs-spin 2s infinite}.progress-bar-animated{animation:1s linear infinite progress-bar-stripes}' +
    '.swiper-lazy-preloader{animation:swiper-preloader-spin 1s infinite linear}.sk-circle{animation:sk 1.2s infinite}.lds-ring div{animation:lds-ring 1.2s infinite}' +
    '.animate-pulse{animation:pulse 2s cubic-bezier(.4,0,.6,1) infinite}.bounce{animation:bounce 1s infinite}.ticker{animation:ticker 20s linear infinite}.blink{animation:blink 1s step-end infinite}';
  const r = run(css);
  const preload = r.findings.filter((f) => f.kind === 'preload-candidate').map((f) => f.selector);
  const hard = r.findings.filter((f) => f.kind === 'infinite-no-pause').map((f) => f.selector);
  assert.deepEqual(preload, ['.w-lightbox-spinner', '.sqs-spin', '.progress-bar-animated', '.swiper-lazy-preloader', '.sk-circle', '.lds-ring div']);
  assert.deepEqual(hard, ['.animate-pulse', '.bounce', '.ticker', '.blink']);
});

test('(c3) `\\bsk-` and `\\blds-` are word-bounded: .task-list / .worlds-fair are not loaders', () => {
  assert.equal(engine.isPreloadLike('.task-list', ['pulse']), false);
  assert.equal(engine.isPreloadLike('.worlds-fair', ['pulse']), false);
  assert.equal(engine.isPreloadLike('.sk-circle', []), true);
  assert.equal(engine.isPreloadLike('.x', ['nprogress-spinner']), true);
  assert.equal(engine.isPreloadLike('.mejs-time-buffering', ['b']), true, 'media buffering indicator');
  assert.equal(engine.isPreloadLike('.woocommerce .processing::before', ['spin']), true);
});

/* (c4) Patch B (Review 11.09.): the weak tokens spin/shimmer/progress only mark a loading
 * indicator when the cycle is short (≤ 2 s); a 20 s `.logo-spin` is decoration → 2.2.2 candidate. */
test('(c4) `.logo-spin` 20 s → infinite-no-pause + unguarded; `.fa-spin` 2 s → preload review; `.file-uploader` is no loader', () => {
  const deco = run('@keyframes rot{to{transform:rotate(360deg)}}.logo-spin{animation:rot 20s linear infinite}');
  assert.ok(kinds(deco).includes('infinite-no-pause'), 'decorative 20 s spin is a 2.2.2 candidate');
  assert.ok(kinds(deco).includes('unguarded'), 'decorative spin without guard is a 2.3.3 finding');
  assert.ok(!kinds(deco).includes('preload-candidate'));
  const spinner = run('@keyframes fa-spin{to{transform:rotate(360deg)}}.fa-spin{animation:fa-spin 2s linear infinite}');
  assert.deepEqual(kinds(spinner), ['preload-candidate']);
  assert.equal(engine.isPreloadLike('.file-uploader', ['rot'], 1), false, '"uploader" is not "loader"');
  assert.equal(engine.isPreloadLike('.btn-shimmer', ['shine'], 3), false, 'shimmer > 2 s is decoration');
  assert.equal(engine.isPreloadLike('.progress-bar-striped', ['progress-bar-stripes'], 1), true, 'Bootstrap 1 s stripes stay a loader');
});

/* (d) colour transition is not motion (SC 2.3.3 definition). */
test('(d) `transition: color .15s` alone → no finding, not measurable, no badge', () => {
  /* Patch C (Review 11.09.): a colour-only transition is no evidence of motion hygiene —
   * status is not-measurable, the badge is withheld, the disclosure names the reason. */
  const r = run('.btn{transition:color .15s ease-in-out,background-color .15s ease-in-out,border-color .15s ease-in-out,box-shadow .15s ease-in-out}');
  assert.equal(r.findings.length, 0);
  assert.equal(r.status, 'not-measurable');
  assert.equal(r.badge, null);
  assert.equal(r.coverage.non_motion_transition_rules, 1);
  assert.ok(r.disclosures.some((d) => /not a motion animation under WCAG 2\.3\.3/.test(d)));
  assert.ok(r.disclosures.some((d) => /only colour\/opacity transitions/.test(d)));
});

test('(d2) opacity / visibility / fill / filter / --custom are non-motion; transform / top / height / letter-spacing are motion', () => {
  for (const p of ['opacity', 'visibility', 'fill', 'stroke', 'filter', '-webkit-filter', 'backdrop-filter', 'text-decoration-color', 'box-shadow', 'color', '--angle'])
    assert.equal(engine.isNonMotionProp(p), true, p);
  for (const p of ['transform', '-webkit-transform', 'top', 'left', 'height', 'width', 'margin-left', 'padding', 'letter-spacing', 'background-position', 'translate', 'inset', 'all'])
    assert.equal(engine.isNonMotionProp(p), false, p);
});

test('(d3) `transition: all` stays a candidate at half weight with the "check what moves" hint', () => {
  const r = run('.a{transition:all .3s}.b{transition:all .2s ease}');
  const u = r.findings.filter((f) => f.kind === 'unguarded');
  assert.equal(u.length, 2);
  assert.equal(u[0].weight, 0.5);
  assert.match(u[0].note, /check what moves/);
  const v2 = engine.groupAndScoreV2(r);
  const g = v2.groups.find((x) => x.kind === 'unguarded');
  assert.equal(g.root, 'transition:all');
  assert.match(g.rule, /check what moves/);
  assert.equal(g.deduction, Math.round(8 * 0.5 * (1 + 0.4) * 10) / 10);
});

/* (e) empty CSS → not measurable, no badge, no score 100. */
test('(e) empty CSS → status not-measurable, score null, no badge, explicit disclosure', () => {
  const r = engine.analyze({ url: 'https://example.test/', html: '<html><head></head><body><canvas></canvas></body></html>', styles: [], fetchErrors: [] });
  assert.equal(r.status, 'not-measurable');
  assert.equal(r.score, null);
  assert.equal(r.badge, null);
  assert.equal(r.findings.length, 0);
  assert.ok(r.disclosures.some((d) => d === 'No CSS motion found in the loaded CSS; runtime motion (JS/WebGL/WAAPI) is not audited.'));
  const v2 = engine.groupAndScoreV2(r);
  assert.equal(v2.score, null);
  assert.equal(v2.status, 'not-measurable');
  assert.match(v2.summary, /Not measurable/);
  const md = engine.toMarkdown(r, 'https://example.test/');
  assert.match(md, /\*\*Score:\*\* not measurable/);
});

test('(e2) only resets (`animation: none`) and a failed stylesheet → still not measurable', () => {
  const r = engine.analyze({ url: 'https://example.test/', html: page('@media (prefers-reduced-motion: reduce){.x{animation:none;transition:none}}'), styles: [], fetchErrors: ['https://example.test/a.css'] });
  assert.equal(r.status, 'not-measurable');
  assert.equal(r.score, null);
  assert.ok(r.disclosures.some((d) => /1 resource\(s\) could not be loaded/.test(d)));
});

/* (f) real endless animation without guard stays a Level-A candidate. */
test('(f) `.hero-bg` infinite without guard → infinite-no-pause (WCAG 2.2.2), full weight', () => {
  const r = run('@keyframes drift{to{background-position:100% 0}}.hero-bg{animation:drift 12s linear infinite}');
  const f = r.findings.find((x) => x.kind === 'infinite-no-pause');
  assert.ok(f);
  assert.equal(f.wcag, engine.WCAG_2_2_2);
  assert.equal(f.weight, undefined, 'weight 1 is the default and not serialised');
  assert.equal(r.findings.some((x) => x.kind === 'unguarded'), true, 'and it is unguarded as well');
  const v2 = engine.groupAndScoreV2(r);
  assert.equal(v2.groups.find((g) => g.kind === 'infinite-no-pause').deduction, 20);
});

test('(f2) guarded infinite animation stays a 2.2.2 candidate at half weight with a note', () => {
  const r = run('.hero-bg{animation:drift 12s linear infinite}@media (prefers-reduced-motion: reduce){.hero-bg{animation:none}}');
  assert.deepEqual(kinds(r), ['infinite-no-pause']);
  assert.equal(r.findings[0].weight, 0.5);
  assert.match(r.findings[0].note, /no pause control/);
});

/* (g) transform transition without guard stays unguarded. */
test('(g) `transition: transform .3s` without guard → unguarded (2.3.3), targeted fix snippet', () => {
  const r = run('.card{transition:transform .3s ease}');
  const u = r.findings.filter((f) => f.kind === 'unguarded');
  assert.equal(u.length, 1);
  assert.equal(u[0].wcag, engine.WCAG_2_3_3);
  assert.equal(u[0].fix, '@media (prefers-reduced-motion: reduce) { .card { transition: none; } }');
  const v2 = engine.groupAndScoreV2(r);
  const g = v2.groups.find((x) => x.kind === 'unguarded');
  assert.equal(g.fix, '@media (prefers-reduced-motion: reduce) { .card { transition: none; } }');
  assert.ok(!/\* \{ transition: none !important/.test(g.fix), 'no blanket * reset any more');
});

/* cascade order: a guard that comes BEFORE the motion rule (same specificity) loses. */
test('cascade: guard earlier than the motion rule without !important is overridden → unguarded with note', () => {
  const r = run('@media (prefers-reduced-motion: reduce){.card{transition:none}}.card{transition:transform .3s}');
  assert.deepEqual(kinds(r).filter((k) => k === 'unguarded').length, 1);
  assert.match(r.findings.find((f) => f.kind === 'unguarded').note, /overridden/);
  const r2 = run('@media (prefers-reduced-motion: reduce){.card{transition:none !important}}.card{transition:transform .3s}');
  assert.deepEqual(kinds(r2).filter((k) => k === 'unguarded'), []);
});

test('cascade: guard in a LATER linked stylesheet covers a rule from an earlier one (document order)', () => {
  const html = '<html><head><link rel="stylesheet" href="/a.css"><link rel="stylesheet" href="/b.css"></head><body></body></html>';
  const styles = [
    { href: 'https://example.test/a.css', text: '.card{transition:transform .3s}' },
    { href: 'https://example.test/b.css', text: '@media (prefers-reduced-motion: reduce){.card{transition:none}}' },
  ];
  const r = engine.analyze({ url: 'https://example.test/', html, styles, fetchErrors: [] });
  assert.equal(r.findings.length, 0);
  const swapped = engine.analyze({ url: 'https://example.test/', html: '<html><head><link rel="stylesheet" href="/b.css"><link rel="stylesheet" href="/a.css"></head><body></body></html>', styles, fetchErrors: [] });
  assert.deepEqual(kinds(swapped), ['unguarded']);
});

test('selector list: EVERY selector of the list needs a guard; pseudo-element suffix kept apart', () => {
  /* Patch A (Review 11.09.): `.a,.b{transition}` moves .a AND .b — a guard for .b alone leaves .a unguarded. */
  const r = run('.a,.b{transition:transform .3s}@media (prefers-reduced-motion: reduce){.b{transition:none}}');
  assert.deepEqual(kinds(r), ['unguarded']);
  assert.match(r.findings[0].note, /only some selectors/);
  const rAll = run('.a,.b{transition:transform .3s}@media (prefers-reduced-motion: reduce){.a,.b{transition:none}}');
  assert.equal(rAll.findings.length, 0, 'guard covering every selector of the list → no finding');
  const r2 = run('.a::before{transition:transform .3s}@media (prefers-reduced-motion: reduce){.a{transition:none}}');
  assert.deepEqual(kinds(r2), ['unguarded']);
  assert.equal(engine.normalizeSelector('  .a  >  .b:before '), '.a>.b::before');
});

test('`prefers-reduced-motion: no-preference` is guarded by construction; `not (…: reduce)` too', () => {
  const r = run('@media (prefers-reduced-motion: no-preference){.x{transition:transform .3s}}');
  assert.deepEqual(kinds(r).filter((k) => k === 'unguarded'), []);
  assert.equal(engine.rmContextOf('@media not all and (prefers-reduced-motion: reduce)'), 'no-preference');
  assert.equal(engine.rmContextOf('@media screen and (prefers-reduced-motion:reduce)'), 'reduce');
  assert.equal(engine.rmContextOf('@media (prefers-reduced-motion)'), 'reduce');
  assert.equal(engine.rmContextOf('@media (min-width: 600px)'), null);
});

test('JS guard hint: matchMedia(prefers-reduced-motion) halves unguarded weight and is disclosed', () => {
  const r = run('.card{transition:transform .3s}', '<div></div>', "<script>if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){document.documentElement.classList.add('rm')}</script>");
  assert.equal(r.coverage.js_guard, true);
  assert.equal(r.findings.find((f) => f.kind === 'unguarded').weight, 0.5);
  assert.ok(r.disclosures.some((d) => /matchMedia/.test(d)));
});

test('runtime libraries from <script src>: token-bounded (promotion.js / motionspec are not "motion")', () => {
  const html = '<html><head><script src="/js/promotion.js"></script><script src="https://cdn.x/gsap.min.js?v=3"></script><script src="/vendor/three.module.js"></script><script src="/motionspec.js"></script></head><body></body></html>';
  assert.deepEqual(engine.runtimeMotionLibraries(html), ['GSAP', 'three.js']);
  const r = engine.analyze({ url: 'https://example.test/', html, styles: [], fetchErrors: [] });
  assert.equal(r.status, 'not-measurable');
  assert.ok(r.disclosures.some((d) => d === 'Runtime motion library detected (GSAP, three.js) — not audited (V2).'));
});

test('badge withheld when CSS is clean but a runtime motion library is present', () => {
  const html = '<html><head><script src="/gsap.min.js"></script><style>.btn{transition:transform .2s}@media (prefers-reduced-motion: reduce){.btn{transition:none}}</style></head><body></body></html>';
  const r = engine.analyze({ url: 'https://example.test/', html, styles: [], fetchErrors: [] });
  assert.equal(r.status, 'measured');
  assert.equal(r.findings.length, 0);
  assert.equal(r.badge, null);
  assert.ok(r.disclosures.some((d) => /Badge withheld/.test(d)));
});

test('<marquee> alone is measurable evidence (Level A stays)', () => {
  const r = engine.analyze({ url: 'https://example.test/', html: '<html><body><marquee>hi</marquee></body></html>', styles: [], fetchErrors: [] });
  assert.equal(r.status, 'measured');
  assert.deepEqual(kinds(r), ['marquee']);
  assert.equal(engine.groupAndScoreV2(r).score, 80);
});

test('animation shorthand: the second time is the delay, not the duration (no false autoplay > 5s)', () => {
  const info = engine.animationInfo('animation: fade 1s 6s ease both;');
  assert.equal(info.maxSeconds, 1);
  assert.equal(engine.animationInfo('animation-iteration-count: infinite;').infinite, true);
});

test('scanner: `@import …;` statement does not swallow the following rule; strings with braces are safe', () => {
  const { rules } = engine.scanCss('@import url("x.css"); .a{transition:transform .3s} .b::after{content:"{"; transition: top .2s}');
  assert.deepEqual(rules.map((r) => r.selector), ['.a', '.b::after']);
});

test('guardDeclarations: which layers a reduce-block body disables', () => {
  assert.deepEqual(engine.guardDeclarations('animation:none;transition:none'), { anim: { important: false }, trans: { important: false }, scroll: null });
  assert.deepEqual(engine.guardDeclarations('animation-duration:0.01ms!important;transition-duration:0s !important;scroll-behavior:auto'), { anim: { important: true }, trans: { important: true }, scroll: { important: false } });
  assert.deepEqual(engine.guardDeclarations('animation-duration:1.5s'), { anim: null, trans: null, scroll: null });
  assert.deepEqual(engine.guardDeclarations('animation-play-state:paused;transition-property:none'), { anim: { important: false }, trans: { important: false }, scroll: null });
});

test('API shape stays compatible: {status, score, findings, summary, badge, disclosures, coverage}; v2 adds groups/scoring/status', () => {
  const r = run('.card{transition:transform .3s}');
  for (const k of ['status', 'score', 'findings', 'summary', 'badge', 'disclosures', 'coverage']) assert.ok(k in r, k);
  for (const f of r.findings) for (const k of ['selector', 'rule', 'wcag', 'fix', 'kind', 'root']) assert.ok(k in f, k);
  const v2 = engine.groupAndScoreV2(r);
  for (const k of ['score', 'groups', 'scoring', 'scoring_doc', 'summary', 'status']) assert.ok(k in v2, k);
  assert.equal(v2.scoring, 'v2');
  for (const g of v2.groups) for (const k of ['kind', 'root', 'rule', 'wcag', 'fix', 'count', 'selectors', 'deduction']) assert.ok(k in g, k);
});

test('a bare requestAnimationFrame in inline JS is disclosed but does not withhold the badge; .animate( does', () => {
  const clean = '<style>.btn{transition:transform .2s}@media (prefers-reduced-motion: reduce){.btn{transition:none}}</style>';
  const r1 = engine.analyze({ url: 'https://example.test/', html: '<html><head>' + clean + '<script>requestAnimationFrame(tick)</script></head><body></body></html>', styles: [], fetchErrors: [] });
  assert.equal(r1.badge, engine.BADGE_SAFE);
  assert.ok(r1.disclosures.some((d) => /requestAnimationFrame/.test(d)));
  const r2 = engine.analyze({ url: 'https://example.test/', html: '<html><head>' + clean + '<script>el.animate([{opacity:0},{opacity:1}],{duration:300})</script></head><body></body></html>', styles: [], fetchErrors: [] });
  assert.equal(r2.badge, null);
});

/* keyframes that only change opacity/colour are not "motion animation" (2.3.3) — but a
 * blinking/pulsing infinite one is still a 2.2.2 candidate. Real case: Algolia DocSearch
 * `.DocSearch-Reset{animation:fade-in .1s}` with `@keyframes fade-in{0%{opacity:0}to{opacity:1}}`. */
test('opacity-only keyframes → no unguarded finding; infinite opacity pulse stays a 2.2.2 candidate', () => {
  const r = run('@keyframes fade-in{0%{opacity:0}to{opacity:1}}.DocSearch-Reset{animation:fade-in .1s ease-in forwards}');
  assert.deepEqual(kinds(r), []);
  assert.equal(r.coverage.non_motion_animation_rules, 1);
  assert.equal(r.status, 'measured');
  const r2 = run('@keyframes pulse{50%{opacity:.5}}.animate-pulse{animation:pulse 2s cubic-bezier(.4,0,.6,1) infinite}');
  assert.deepEqual(kinds(r2), ['infinite-no-pause'], 'blinking is 2.2.2 even without motion');
  const r3 = run('.x{animation:unknown-kf 2s}');
  assert.deepEqual(kinds(r3), ['unguarded'], 'unknown keyframes stay motion (conservative)');
  assert.deepEqual([...engine.keyframeProperties('0%{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}')].sort(), ['opacity', 'transform']);
});

test('keyframes defined in another (later) stylesheet are still resolved', () => {
  const html = '<html><head><link rel="stylesheet" href="/a.css"><link rel="stylesheet" href="/b.css"></head><body></body></html>';
  const styles = [
    { href: 'https://example.test/a.css', text: '.x{animation:glow 2s ease-in-out}' },
    { href: 'https://example.test/b.css', text: '@keyframes glow{50%{opacity:.2}}' },
  ];
  const r = engine.analyze({ url: 'https://example.test/', html, styles, fetchErrors: [] });
  assert.deepEqual(kinds(r), []);
});

/* loading indicators: essential → no 2.3.3 guard finding on top of the review entry (Bootstrap
 * slows its spinner under reduce via a custom property, which no static scan can follow). */
test('a preload-like rule gets no unguarded/risky-props finding, only the review entry with a guard note', () => {
  const r = run('@keyframes spinner-border{to{transform:rotate(360deg)}}.spinner-border,.spinner-grow{animation:.75s linear infinite spinner-border}@media (prefers-reduced-motion:reduce){.spinner-border,.spinner-grow{--bs-spinner-animation-speed:1.5s}}');
  assert.deepEqual(kinds(r), ['preload-candidate']);
  assert.match(r.findings[0].note, /No prefers-reduced-motion rule covers this selector/);
  assert.equal(r.coverage.preload_rules, 1);
  const r2 = run('.loader{animation:spin 1s infinite}@media (prefers-reduced-motion: reduce){.loader{animation:none}}');
  assert.deepEqual(kinds(r2), ['preload-candidate']);
  assert.match(r2.findings[0].note, /covers this selector\.$/);
  assert.equal(engine.groupAndScoreV2(r2).score, 100);
});

test('risky-props on `all` alone is half weight, like the guard finding', () => {
  const r = run('.DocSearch-Hit--deleting{opacity:0;transition:all .25s linear}');
  const rp = r.findings.find((f) => f.kind === 'risky-props');
  assert.equal(rp.weight, 0.5);
  const v2 = engine.groupAndScoreV2(r);
  assert.equal(v2.score, 100 - 4 - 2);
});
