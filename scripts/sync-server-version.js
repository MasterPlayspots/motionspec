"use strict";
// npm version lifecycle hook: keep every published version surface in lockstep with
// package.json — server.json (MCP registry), .claude-plugin/plugin.json (plugin
// directory), and the Version row of the README status table.
//
// Each surface is announced separately, because a listing that quietly keeps an old
// version is exactly the drift this hook exists to prevent: a reviewer comparing the
// directory entry against npm sees two different products.
const fs = require("node:fs");

const v = JSON.parse(fs.readFileSync("package.json", "utf8")).version;

// --- server.json (MCP registry manifest) ---------------------------------------
const s = JSON.parse(fs.readFileSync("server.json", "utf8"));
s.version = v;
if (Array.isArray(s.packages)) for (const p of s.packages) if (p && p.version !== undefined) p.version = v;
fs.writeFileSync("server.json", JSON.stringify(s, null, 2) + "\n");
console.log("[version hook] server.json synced to " + v);

// --- .claude-plugin/plugin.json (Claude Code plugin directory) -----------------
const PLUGIN = ".claude-plugin/plugin.json";
if (fs.existsSync(PLUGIN)) {
  const p = JSON.parse(fs.readFileSync(PLUGIN, "utf8"));
  p.version = v;
  fs.writeFileSync(PLUGIN, JSON.stringify(p, null, 2) + "\n");
  console.log("[version hook] " + PLUGIN + " synced to " + v);
} else {
  console.warn("[version hook] " + PLUGIN + " not found — skipped");
}

// --- README status table -------------------------------------------------------
// ONLY the "| Version | **vX.Y.Z** ... |" row. Every other version string in the
// README — CHANGELOG quotes, install examples, historical notes — is deliberately
// left alone; rewriting those would silently falsify the document's history.
const README = "README.md";
if (fs.existsSync(README)) {
  const before = fs.readFileSync(README, "utf8");
  let hits = 0;
  const after = before.replace(
    /^(\|\s*Version\s*\|[^|\n]*?\*\*v)\d+\.\d+\.\d+(\*\*)/gm,
    (_m, head, tail) => { hits++; return head + v + tail; },
  );
  if (hits === 0) {
    // Loud, not fatal: npm version has already bumped package.json by this point, so
    // aborting would leave the tree half-synced. A visible warning is the safer failure.
    console.warn("[version hook] " + README + ": no status-table Version row matched — check by hand");
  } else {
    if (hits > 1) console.warn("[version hook] " + README + ": " + hits + " Version rows matched (expected 1)");
    fs.writeFileSync(README, after);
    console.log("[version hook] " + README + " status table synced to " + v);
  }
} else {
  console.warn("[version hook] " + README + " not found — skipped");
}
