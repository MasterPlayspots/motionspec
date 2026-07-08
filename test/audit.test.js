"use strict";
/*
 * audit.test.js — the static motion-a11y checker.
 * ----------------------------------------------------------------------
 * Three fixture pages carry the four checks between them, and a fourth clean
 * page earns the badge. The ANALYSIS is tested through the pure analyze()
 * (no network); the fetch orchestration (linked stylesheets, error handling)
 * is tested through audit() with an INJECTED fetchImpl so the suite never
 * touches the real network. A CLI test drives bin/motion.js against a local
 * server (skips gracefully if the sandbox blocks loopback).
 */
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { execFileSync } = require("node:child_process");
const { audit, analyze, toMarkdown, BADGE_SAFE } = require("../src/audit/audit.js");

const FX = path.join(__dirname, "fixtures", "audit");
const read = (f) => fs.readFileSync(path.join(FX, f), "utf8");
const analyzeHtml = (f) => analyze({ url: "https://fixture/" + f, html: read(f), styles: [] });
const rules = (r) => r.findings.map((x) => x.rule).join(" || ");

/* ---- fixture 1: unguarded animation + infinite without pause -------------- */
test("fixture violations-1: unguarded animation (2.3.3) + infinite no-pause (2.2.2)", () => {
  const r = analyzeHtml("violations-1.html");
  assert.ok(/prefers-reduced-motion guard/.test(rules(r)), "check 1 (unguarded) must fire");
  assert.ok(/Infinite animation/.test(rules(r)), "check 3 (infinite no-pause) must fire");
  assert.ok(r.findings.some((f) => f.wcag.includes("2.2.2")), "a 2.2.2 finding present");
  assert.ok(r.findings.some((f) => f.wcag.includes("2.3.3")), "a 2.3.3 finding present");
  assert.equal(r.badge, null, "a page with violations must NOT earn the badge");
});

/* ---- fixture 2: non-transform/opacity property + autoplay > 5s ------------ */
test("fixture violations-2: animated non-transform prop (2.3.3) + autoplay >5s (2.2.2)", () => {
  const r = analyzeHtml("violations-2.html");
  assert.ok(/non-transform\/opacity/.test(rules(r)), "check 2 (risky property) must fire");
  assert.ok(/> 5s/.test(rules(r)), "check 4 (autoplay >5s) must fire");
  assert.equal(r.badge, null);
});

/* ---- fixture 3: <marquee> element + runtime-motion disclosure ------------- */
test("fixture violations-3: <marquee> (2.2.2) + runtime motion disclosed as V2", () => {
  const r = analyzeHtml("violations-3.html");
  assert.ok(/<marquee>/.test(rules(r)) || /marquee/i.test(rules(r)), "check 4 (marquee element) must fire");
  assert.ok(r.disclosures.some((d) => /not audited \(V2\)/.test(d)), "runtime motion disclosed");
  assert.equal(r.badge, null);
});

/* ---- all four checks are represented across the fixtures ------------------ */
test("all four checks are represented across the three violation fixtures", () => {
  const all = ["violations-1.html", "violations-2.html", "violations-3.html"].map(analyzeHtml);
  const joined = all.map(rules).join(" || ");
  assert.ok(/prefers-reduced-motion guard/.test(joined), "check 1 present somewhere");
  assert.ok(/non-transform\/opacity/.test(joined), "check 2 present somewhere");
  assert.ok(/Infinite animation/.test(joined), "check 3 present somewhere");
  assert.ok(/marquee|> 5s/.test(joined), "check 4 present somewhere");
});

/* ---- clean page earns the literal badge ---------------------------------- */
test("clean fixture earns the badge 'reduced-motion-safe' with zero findings", () => {
  const r = analyzeHtml("clean.html");
  assert.deepEqual(r.findings, [], "clean page must have no findings: " + rules(r));
  assert.equal(r.badge, BADGE_SAFE);
  assert.equal(r.badge, "reduced-motion-safe");
  assert.equal(r.score, 100);
  const md = toMarkdown(r, "https://fixture/clean.html");
  assert.ok(md.includes("`reduced-motion-safe`"), "the badge string appears in the Markdown report");
});

/* ---- determinism: analysis is a pure function of the input --------------- */
test("determinism: analyzing the same page twice yields identical findings", () => {
  const a = analyzeHtml("violations-2.html");
  const b = analyzeHtml("violations-2.html");
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

/* ---- audit() orchestration with an INJECTED fetch (no real network) ------ */
test("audit(): fetches + scans a linked stylesheet (no real network)", async () => {
  const pages = {
    "https://site/": { ok: true, text: '<html><head><link rel="stylesheet" href="/style.css"></head><body></body></html>' },
    "https://site/style.css": { ok: true, text: ".spin { animation: sp 6s linear infinite; }" },
  };
  const fetchImpl = async (u) => pages[u] || { ok: false, error: "404" };
  const r = await audit("https://site/", { fetchImpl });
  assert.equal(r.ok, true);
  assert.ok(r.findings.some((f) => /Infinite animation/.test(f.rule)), "the linked stylesheet must be scanned");
  assert.ok(typeof r.markdown === "string" && r.markdown.length > 0, "a Markdown report is produced");
});

test("audit(): a page fetch failure returns ok:false without throwing", async () => {
  const fetchImpl = async () => ({ ok: false, error: "timeout" });
  const r = await audit("https://unreachable/", { fetchImpl });
  assert.equal(r.ok, false);
  assert.equal(r.error, "timeout");
});

test("audit(): an unreachable linked stylesheet is recorded but does not fail the page", async () => {
  const pages = {
    "https://site/": { ok: true, text: '<html><head><link rel="stylesheet" href="/missing.css"></head></html>' },
  };
  const fetchImpl = async (u) => pages[u] || { ok: false, error: "404" };
  const r = await audit("https://site/", { fetchImpl });
  assert.equal(r.ok, true, "the page audit still succeeds");
  assert.ok(r.disclosures.some((d) => /could not be loaded|unaudited/.test(d)), "the failed resource is disclosed");
});

/* ---- CLI: motion audit <url> against a local server (sandbox-tolerant) ---- */
test("CLI: motion audit <url> prints a Markdown report (skips if loopback blocked)", async () => {
  const bin = path.join(__dirname, "..", "bin", "motion.js");
  const html = read("violations-1.html");
  const srv = http.createServer((req, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end(html); });
  await new Promise((resolve) => srv.listen(0, "127.0.0.1", resolve));
  const url = "http://127.0.0.1:" + srv.address().port + "/";
  try {
    let out;
    try {
      out = execFileSync(process.execPath, [bin, "audit", url], { encoding: "utf8", timeout: 15000 });
    } catch (e) {
      /* Loopback fetch blocked by the sandbox -> the CLI reports a fetch failure
       * and exits non-zero. Assert THAT path so the test is meaningful either way. */
      const stderr = String(e.stderr || "");
      assert.ok(/Audit failed/.test(stderr), "expected a clean 'Audit failed' path, got: " + stderr.slice(0, 200));
      return;
    }
    assert.ok(out.includes("MotionSpec Motion-a11y Audit"), "the CLI prints the report title");
    assert.ok(/Infinite animation/.test(out), "the CLI report contains the infinite-loop finding");

    const jsonOut = execFileSync(process.execPath, [bin, "audit", url, "--json"], { encoding: "utf8", timeout: 15000 });
    const j = JSON.parse(jsonOut);
    assert.equal(j.ok, true);
    assert.ok(Array.isArray(j.findings) && j.findings.length > 0);
    assert.ok(!("markdown" in j), "the --json payload omits the Markdown view");
  } finally {
    srv.close();
  }
});

/* ---- CLI: no url -> usage + non-zero exit -------------------------------- */
test("CLI: motion audit without a url prints usage and exits 2", () => {
  const bin = path.join(__dirname, "..", "bin", "motion.js");
  let code = 0, stderr = "";
  try { execFileSync(process.execPath, [bin, "audit"], { encoding: "utf8" }); }
  catch (e) { code = e.status; stderr = String(e.stderr || ""); }
  assert.equal(code, 2);
  assert.ok(/Usage: motion audit/.test(stderr));
});
