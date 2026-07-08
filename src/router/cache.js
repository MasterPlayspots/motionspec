"use strict";
/*
 * Request->spec cache.  Key: sha256(request + catalogVersion + target).
 * Recurring requests cost nothing the second time — neither tokens
 * nor waiting time. A catalog change invalidates automatically (version hash).
 * Storage: .cache/<key>.json in the repo (gitignored).
 *
 * Audit finding #11 (2026-06-12): hygiene. TTL + LRU cap + sweep().
 * Entries carry { spec, savedAt }; expired/surplus entries are removed.
 * (Cache hits are additionally re-validated in route.js — finding #2 —
 * so the cache is never a trust boundary.)
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

/* Override via MOTION_CACHE_DIR (tests/consumers, e.g. tmpdir); default remains .cache/ in the repo. */
const CACHE_DIR = process.env.MOTION_CACHE_DIR || path.join(__dirname, "..", "..", ".cache");
const TTL_MS = 30 * 24 * 60 * 60 * 1000; /* 30 days */
const MAX_ENTRIES = 500;

function key(request, catalogVer, target) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({ r: request.trim().toLowerCase(), v: catalogVer, t: target }))
    .digest("hex")
    .slice(0, 32);
}

function get(k) {
  const f = path.join(CACHE_DIR, k + ".json");
  if (!fs.existsSync(f)) return null;
  try {
    const entry = JSON.parse(fs.readFileSync(f, "utf8"));
    if (entry && entry.savedAt && Date.now() - entry.savedAt > TTL_MS) {
      try { fs.unlinkSync(f); } catch { /* ignore */ }
      return null;
    }
    return entry && entry.spec ? entry.spec : entry; /* backwards-compatible */
  } catch { return null; }
}

function set(k, spec) {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(path.join(CACHE_DIR, k + ".json"), JSON.stringify({ spec, savedAt: Date.now() }, null, 2));
  evict();
}

/* LRU by mtime: remove the oldest entries until MAX_ENTRIES is reached. */
function evict() {
  let files;
  try { files = fs.readdirSync(CACHE_DIR).filter((f) => f.endsWith(".json")); }
  catch { return; }
  if (files.length <= MAX_ENTRIES) return;
  const withTime = files.map((f) => {
    const full = path.join(CACHE_DIR, f);
    let t = 0;
    try { t = fs.statSync(full).mtimeMs; } catch { /* ignore */ }
    return { full, t };
  }).sort((a, b) => a.t - b.t);
  for (const e of withTime.slice(0, withTime.length - MAX_ENTRIES)) {
    try { fs.unlinkSync(e.full); } catch { /* ignore */ }
  }
}

/* Startup sweep: remove expired entries. */
function sweep() {
  let files;
  try { files = fs.readdirSync(CACHE_DIR).filter((f) => f.endsWith(".json")); }
  catch { return 0; }
  let removed = 0;
  for (const f of files) {
    const full = path.join(CACHE_DIR, f);
    try {
      const entry = JSON.parse(fs.readFileSync(full, "utf8"));
      if (entry && entry.savedAt && Date.now() - entry.savedAt > TTL_MS) { fs.unlinkSync(full); removed++; }
    } catch { /* ignore */ }
  }
  return removed;
}

module.exports = { key, get, set, sweep, evict, CACHE_DIR, TTL_MS, MAX_ENTRIES };
