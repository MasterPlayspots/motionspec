// W1.7 (2026-09-11): an escaped quote in a selector (Tailwind arbitrary variant,
// shadcn/ui Button `[&_svg:not([class*='size-'])]:size-4`) must not open a CSS string
// and swallow the rest of the stylesheet. Copy of the site's
// test/w17-escaped-quote.test.mjs (only the require path differs) — keep in sync.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const engine = require('../src/audit/audit.js');
const page = (css) => `<html><head><style>${css}</style></head><body><div class=x></div></body></html>`;
const run = (css) => engine.analyze({ url: 'https://example.test/', html: page(css), styles: [], fetchErrors: [] });

test('(h) escaped quote in a selector does not truncate the stylesheet (shadcn/Tailwind v4)', () => {
  const css = ".\\[\\&_svg\\:not\\(\\[class\\*\\=\\'size-\\'\\]\\)\\]\\:size-4 svg:not([class*=size-]){width:1rem}" +
    ".\\[\\&_svg\\:not\\(\\[class\\*\\=\\'text-\\'\\]\\)\\]\\:text-muted-foreground svg{color:red}" +
    "@keyframes spin-slow{0%{transform:rotate(0)}to{transform:rotate(360deg)}}" +
    ".animate-spin-slow{animation:8s linear infinite spin-slow}.card{transition:transform .3s}";
  const scanned = engine.scanCss(css);
  assert.equal(scanned.rules.length, 4, 'all four style rules are scanned');
  assert.ok(scanned.keyframes.has('spin-slow'), 'keyframes after the escaped quote are known');
  const r = run(css);
  assert.equal(r.status, 'measured');
  const kinds = r.findings.map((f) => f.kind);
  assert.ok(kinds.includes('infinite-no-pause'), 'the 8 s infinite spin after the escaped quote is a 2.2.2 candidate');
  assert.ok(kinds.includes('unguarded'), 'the unguarded transform transition after the escaped quote is found');
  assert.equal(r.badge, null);
});

test('(h2) real strings still skip: apostrophe inside content:"…" and quoted attribute selectors', () => {
  const css = ".q:after{content:\"it's {not} a rule\"}a[href^='http']{color:red}.spin{animation:2s linear infinite spin}";
  const scanned = engine.scanCss(css);
  assert.deepEqual(scanned.rules.map((r) => r.selector), ['.q:after', "a[href^='http']", '.spin']);
});
