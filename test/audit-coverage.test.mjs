/* Redirect resolution and incomplete CSS must not produce a false clean badge.
 * Offline fixtures: no external websites, credentials or paid services. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const engine = require("../src/audit/audit.js");
const guarded = "<style>@media(prefers-reduced-motion:no-preference){.x{transition:transform 1s}}</style>";

test("stylesheet collection deduplicates resolved URLs in first appearance order at bounded stress size", () => {
  const count = 15000;
  const links = Array.from({ length: count }, (_, i) => `<link rel="stylesheet" href="/s${i}.css">`).join("");
  const html = '<link rel="stylesheet" href="/first.css">' + links +
    '<link rel="stylesheet" href="https://example.com/first.css">' + links;
  assert.ok(Buffer.byteLength(html) < 2 * 1024 * 1024, "stress fixture stays inside one document budget");
  const urls = engine.linkedStylesheets(html, "https://example.com/page");
  assert.equal(urls.length, count + 1);
  assert.equal(urls[0], "https://example.com/first.css");
  assert.equal(urls[1], "https://example.com/s0.css");
  assert.equal(urls.at(-1), "https://example.com/s14999.css");
});

test("redirected page resolves relative CSS and preserves link/inline cascade order", async () => {
  const calls = [];
  const requested = "https://example.com/start";
  const finalUrl = "https://example.com/final/index.html";
  const result = await engine.audit(requested, { fetchImpl: async (url) => {
    calls.push(url);
    if (url === requested) return { ok: true, finalUrl,
      text: '<link rel="stylesheet" href="motion.css"><style>@media(prefers-reduced-motion:reduce){.x{transition:none}}</style>' };
    if (url === "https://example.com/final/motion.css") return { ok: true, text: ".x{transition:transform 1s}" };
    throw new Error("Wrong stylesheet address");
  } });
  assert.deepEqual(calls, [requested, "https://example.com/final/motion.css"]);
  assert.equal(result.url, requested, "original requested URL remains the public result identity");
  assert.equal(result.status, "measured");
  assert.equal(result.badge, "reduced-motion-safe");
  assert.deepEqual(result.findings, [], "later inline reduced-motion guard still wins");
  assert.equal(result.coverage.fetch_complete, true);
});

test("adapters without redirect metadata retain requested URL as relative CSS base", async () => {
  const calls = [];
  const result = await engine.audit("https://example.com/path/page", { fetchImpl: async (url) => {
    calls.push(url);
    return { ok: true, text: calls.length === 1 ? '<link rel="stylesheet" href="motion.css">' : ".x{transition:transform 1s}" };
  } });
  assert.deepEqual(calls, ["https://example.com/path/page", "https://example.com/path/motion.css"]);
  assert.equal(result.status, "measured");
});

test("failed linked CSS with otherwise clean motion retains partial score but withholds badge", async () => {
  const result = await engine.audit("https://example.com/", { fetchImpl: async (url) =>
    url.endsWith("hidden.css") ? { ok: false, error: "blocked" }
      : { ok: true, text: guarded + '<link rel="stylesheet" href="/hidden.css">' }
  });
  assert.equal(result.status, "measured");
  assert.equal(engine.groupAndScoreV2(result).score, 100);
  assert.equal(result.badge, null);
  assert.equal(result.coverage.failed_stylesheets, 1);
  assert.equal(result.coverage.omitted_stylesheets, 0);
  assert.equal(result.coverage.fetch_complete, false);
  assert.ok(result.disclosures.some((s) => /Badge withheld: linked CSS/.test(s)));
  assert.equal(JSON.stringify(result.disclosures).includes("hidden.css"), false);
});

test("stylesheet limit is explicit incomplete coverage and also withholds a clean badge", async () => {
  const calls = [];
  const result = await engine.audit("https://example.com/", { maxStylesheets: 12, fetchImpl: async (url) => {
    calls.push(url);
    return { ok: true, text: calls.length === 1 ? guarded + Array.from({ length: 13 }, (_, i) =>
      `<link rel="stylesheet" href="/s${i}.css">`).join("") : ".x{color:red}" };
  } });
  assert.equal(calls.length, 13, "HTML plus twelve stylesheets only");
  assert.equal(result.coverage.omitted_stylesheets, 1);
  assert.equal(result.coverage.failed_stylesheets, 0);
  assert.equal(result.coverage.fetch_complete, false);
  assert.equal(result.badge, null);
  assert.ok(result.disclosures.some((s) => /1 linked stylesheet.*exceeded/.test(s)));
});

test("partial fetch without any loaded CSS motion stays not-measurable with null score", async () => {
  const result = await engine.audit("https://example.com/", { fetchImpl: async (url) =>
    url.endsWith("hidden.css") ? { ok: false, error: "timeout" }
      : { ok: true, text: '<link rel="stylesheet" href="/hidden.css">' }
  });
  assert.equal(result.status, "not-measurable");
  assert.equal(result.score, null);
  assert.equal(engine.groupAndScoreV2(result).score, null);
  assert.equal(result.badge, null);
  assert.equal(result.coverage.fetch_complete, false);
});

test("default fetch rejects an oversized streamed document instead of silently scoring its prefix", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(guarded + "x".repeat(200));
  try {
    const result = await engine.audit("https://example.com/", { maxBytes: 32 });
    assert.equal(result.ok, false);
    assert.equal(result.error, "response too large");
  } finally { globalThis.fetch = original; }
});

test("default fetch byte cap counts UTF-8 bytes rather than characters for a nonstream response", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, status: 200, url: "https://example.com/", text: async () => "é".repeat(10) });
  try {
    const result = await engine.audit("https://example.com/", { maxBytes: 15 });
    assert.equal(result.ok, false);
    assert.equal(result.error, "response too large");
  } finally { globalThis.fetch = original; }
});
