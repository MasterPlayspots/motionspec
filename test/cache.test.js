"use strict";
/* Cache hygiene (Audit #11) + configurable budget (Audit #16).
 * 2026-06-15 (prod-readiness fix): the TTL/sweep tests now call the REAL
 * cache functions against CACHE_DIR (previously the logic was re-modeled —
 * the real get/set/sweep ran untested). */
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const os = require("os");
/* Environment robustness (360°-FB-8): tests run against a fresh tmpdir instead
 * of .cache/ in the repo — on FUSE/sync mounts (Cowork, iCloud) unlink/mtime
 * is not reliably synchronous, which made TTL/sweep/evict break
 * non-deterministically. Must be set BEFORE requiring cache.js. */
process.env.MOTION_CACHE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "motionspec-cache-test-"));

const cache = require("../src/router/cache.js");
const { compileSpec } = require("../src/compiler/compile.js");
const { loadCatalog } = require("../src/compiler/catalog.js");
const catalog = loadCatalog();

const rid = () => crypto.randomBytes(5).toString("hex");
const ensureDir = () => { if (!fs.existsSync(cache.CACHE_DIR)) fs.mkdirSync(cache.CACHE_DIR, { recursive: true }); };
const rm = (f) => { try { fs.unlinkSync(f); } catch { /* ignore */ } };

test("cache key is deterministic and normalized", () => {
  const a = cache.key("  Hero Reveal  ", "v1", "vanilla-gsap");
  const b = cache.key("hero reveal", "v1", "vanilla-gsap");
  assert.equal(a, b, "trim + lowercase must yield the same key");
  assert.notEqual(a, cache.key("hero reveal", "v2", "vanilla-gsap"), "catalog version invalidates");
});

test("set() -> get(): real write/read roundtrip", () => {
  const k = "test-rt-" + rid();
  const spec = { specVersion: "1.0", meta: { target: "vanilla-gsap" }, motions: [{ id: "x", primitive: "scrollReveal", target: ".h" }] };
  try {
    cache.set(k, spec);
    assert.deepEqual(cache.get(k), spec);
  } finally { rm(path.join(cache.CACHE_DIR, k + ".json")); }
});

test("get() deletes expired entries (real TTL check on the file)", () => {
  ensureDir();
  const k = "test-exp-" + rid();
  const f = path.join(cache.CACHE_DIR, k + ".json");
  fs.writeFileSync(f, JSON.stringify({ spec: { a: 1 }, savedAt: Date.now() - (cache.TTL_MS + 1000) }));
  assert.equal(cache.get(k), null, "expired -> null");
  assert.equal(fs.existsSync(f), false, "expired file is deleted on get");
});

test("sweep() deletes expired ones, keeps fresh ones (real function)", () => {
  ensureDir();
  const ke = "test-sw-old-" + rid(), kf = "test-sw-new-" + rid();
  const fe = path.join(cache.CACHE_DIR, ke + ".json"), ff = path.join(cache.CACHE_DIR, kf + ".json");
  fs.writeFileSync(fe, JSON.stringify({ spec: {}, savedAt: Date.now() - (cache.TTL_MS + 1000) }));
  fs.writeFileSync(ff, JSON.stringify({ spec: {}, savedAt: Date.now() }));
  try {
    cache.sweep(); /* Do not assert the count: a parallel sweepOnce() could have
                      already removed the old entry — we check the effect. */
    assert.equal(fs.existsSync(fe), false, "old deleted");
    assert.equal(fs.existsSync(ff), true, "fresh kept");
  } finally { rm(fe); rm(ff); }
});

test("evict() runs without errors and keeps entries under the limit", () => {
  const k = "test-ev-" + rid();
  const f = path.join(cache.CACHE_DIR, k + ".json");
  try {
    cache.set(k, { specVersion: "1.0", meta: { target: "vanilla-gsap" }, motions: [{ id: "a", primitive: "scrollReveal", target: ".h" }] });
    assert.doesNotThrow(() => cache.evict());
    assert.ok(fs.existsSync(f), "under MAX_ENTRIES the entry is kept");
  } finally { rm(f); }
});

test("Audit #16: budget is configurable per call", () => {
  const spec = {
    specVersion: "1.0",
    meta: { project: "t", target: "vanilla-gsap" },
    globals: { respectReducedMotion: true },
    motions: [
      { id: "a", primitive: "parallaxLayer", target: ".a", params: {} },
      { id: "b", primitive: "parallaxLayer", target: ".b", params: {} },
    ],
  };
  const def = compileSpec(spec, catalog);
  assert.equal(def.report.budgetOk, true);
  const tight = compileSpec(spec, catalog, { budget: 3 });
  assert.equal(tight.report.budget, 3);
  assert.equal(tight.report.budgetOk, false);
});

test("evict() removes surplus entries (>MAX_ENTRIES)", () => {
  if (!fs.existsSync(cache.CACHE_DIR)) fs.mkdirSync(cache.CACHE_DIR, { recursive: true });
  const created = [];
  try {
    for (let i = 0; i < 501; i++) {
      const name = "test-bulk-" + String(i).padStart(5, "0") + ".json";
      const f = path.join(cache.CACHE_DIR, name);
      fs.writeFileSync(f, JSON.stringify({ spec: {}, savedAt: i }));
      created.push(f);
    }
    cache.evict();
    const remaining = fs.readdirSync(cache.CACHE_DIR)
      .filter(f => f.startsWith("test-bulk-") && f.endsWith(".json"));
    assert.ok(
      remaining.length <= cache.MAX_ENTRIES,
      `after evict() at most ${cache.MAX_ENTRIES} test-bulk entries may remain, found: ${remaining.length}`
    );
  } finally {
    for (const f of created) {
      try { fs.unlinkSync(f); } catch { /* ignore */ }
    }
  }
});

test("evict() does not throw on stat error (internal catch)", () => {
  if (process.getuid && process.getuid() === 0) {
    assert.ok(true, "running as root — test skipped (chmod has no effect)");
    return;
  }
  if (!fs.existsSync(cache.CACHE_DIR)) fs.mkdirSync(cache.CACHE_DIR, { recursive: true });
  const name = "test-stat-err-" + (rid ? rid() : Date.now()) + ".json";
  const f = path.join(cache.CACHE_DIR, name);
  fs.writeFileSync(f, JSON.stringify({ spec: {}, savedAt: Date.now() }));
  fs.chmodSync(f, 0o000);
  try {
    assert.doesNotThrow(() => cache.evict());
  } finally {
    try { fs.chmodSync(f, 0o644); } catch { /* ignore */ }
    try { fs.unlinkSync(f); } catch { /* ignore */ }
  }
});
