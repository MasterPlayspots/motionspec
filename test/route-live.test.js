"use strict";
/* Prod-readiness fix (2026-06-15): the LIVE model-client path (openAICompatClient's
 * fetch) and a hostile live model response were untested — only the mock path was
 * exercised. These tests inject a fake global.fetch so the real client code runs,
 * and prove the Trust Boundary rejects a malicious live response fail-closed. */
const { test } = require("node:test");
const assert = require("node:assert");
const { openAICompatClient } = require("../src/router/clients.js");
const { route } = require("../src/router/route.js");
const { loadCatalog } = require("../src/compiler/catalog.js");

const catalog = loadCatalog();

function withFakeFetch(responder, fn) {
  const realFetch = globalThis.fetch;
  const realKey = process.env.MOTION_API_KEY;
  process.env.MOTION_API_KEY = "test-key";
  globalThis.fetch = responder;
  return Promise.resolve(fn()).finally(() => {
    globalThis.fetch = realFetch;
    if (realKey === undefined) delete process.env.MOTION_API_KEY; else process.env.MOTION_API_KEY = realKey;
  });
}
const modelReply = (content) => ({
  ok: true, status: 200,
  async json() { return { choices: [{ message: { content } }] }; },
  async text() { return ""; },
});

test("openAICompatClient throws without an API key", () => {
  const saved = process.env.MOTION_API_KEY; delete process.env.MOTION_API_KEY;
  const savedOR = process.env.OPENROUTER_API_KEY; delete process.env.OPENROUTER_API_KEY;
  try { assert.throws(() => openAICompatClient({}), /API key/); }
  finally { if (saved !== undefined) process.env.MOTION_API_KEY = saved; if (savedOR !== undefined) process.env.OPENROUTER_API_KEY = savedOR; }
});

test("LIVE path: a hostile model response is rejected fail-closed (escalate, no spec)", async () => {
  const evil = JSON.stringify({
    specVersion: "1.0", meta: { target: "vanilla-gsap" }, globals: { respectReducedMotion: true },
    motions: [{ id: "m", primitive: "scrollReveal", target: "');alert(1);('", params: { from: { opacity: 0 } } }],
  });
  await withFakeFetch(async () => modelReply(evil), async () => {
    const client = openAICompatClient({ baseURL: "https://example.test/v1" });
    const r = await route("hero reveal", { client, catalog, noCache: true });
    assert.equal(r.ok, false, "malicious live spec must not pass");
    assert.equal(r.escalate, true);
    assert.equal(r.spec, undefined, "no spec leaks through the boundary");
  });
});

test("LIVE path: a valid model response routes ok", async () => {
  const good = JSON.stringify({
    specVersion: "1.0", meta: { project: "t", target: "vanilla-gsap" }, globals: { respectReducedMotion: true },
    motions: [{ id: "hero", primitive: "scrollReveal", target: ".hero h1", params: { from: { opacity: 0, y: 32 } } }],
  });
  await withFakeFetch(async () => modelReply(good), async () => {
    const client = openAICompatClient({});
    const r = await route("hero reveal", { client, catalog, noCache: true });
    assert.equal(r.ok, true, r.reason || "");
    assert.equal(r.spec.motions[0].primitive, "scrollReveal");
  });
});

test("LIVE path: a non-200 API response escalates as a transport error (no throw)", async () => {
  await withFakeFetch(async () => ({ ok: false, status: 503, async text() { return "upstream down"; }, async json() { return {}; } }), async () => {
    const client = openAICompatClient({});
    const r = await route("hero reveal", { client, catalog, noCache: true });
    assert.equal(r.ok, false);
    assert.equal(r.escalate, true);
    assert.match(r.reason, /transport error/);
  });
});
