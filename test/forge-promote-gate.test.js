"use strict";
/*
 * forge-promote-gate.test.js (building block 2)
 * ----------------------------------------------------------------------
 * Proves the gauntlet: a good NEW candidate passes without gaps; every
 * breakage variant is caught fail-closed by exactly its stage. --prepare
 * writes ONLY into the working tree (and only into the passed primitivesDir);
 * verify-only never touches primitives/.
 *
 * Fixtures are created in a tmp candidatesDir (the real candidates/ stays
 * untouched); catalog overlay + lock check run against the real repo.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { gate, appendKeywordRule } = require("../bin/promote-gate.js");
const { loadCatalog } = require("../src/compiler/catalog.js");

const ROOT = path.join(__dirname, "..");
const CAT = loadCatalog();

/* A faithful clone of a real primitive under a new name — guaranteed
 * compilable, with a11y fallback, and a NEW catalog name (-> added/minor). */
function clonePrimitive(srcName, newName, mutate) {
  const p = JSON.parse(JSON.stringify(CAT[srcName]));
  p.name = newName;
  if (mutate) mutate(p);
  return p;
}

function exampleFor(primName, params, globals) {
  return {
    specVersion: "1.0",
    meta: { project: primName + "-test", target: "vanilla-gsap", createdWith: "test" },
    globals: globals || { respectReducedMotion: true },
    motions: [{ id: "m1", primitive: primName, target: ".x", params: params || {} }],
  };
}

const REVEAL_PARAMS = { from: { opacity: 0, y: 24 } };

function mkCandidate(candidatesDir, name, prim, example, extraFiles) {
  const dir = path.join(candidatesDir, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name + ".json"), JSON.stringify(prim, null, 2));
  fs.writeFileSync(path.join(dir, "example.motionspec.json"), JSON.stringify(example, null, 2));
  if (extraFiles) for (const [f, body] of Object.entries(extraFiles)) {
    fs.writeFileSync(path.join(dir, f), typeof body === "string" ? body : JSON.stringify(body, null, 2));
  }
  return dir;
}

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "forge-gate-"));
}

const findCheck = (r, needle) => r.checks.find((c) => c.label.includes(needle));

test("good NEW candidate passes the gauntlet without gaps (PASS)", () => {
  const candidatesDir = tmpDir();
  const prim = clonePrimitive("scrollReveal", "fadeInUp");
  mkCandidate(candidatesDir, "fadeInUp", prim, exampleFor("fadeInUp", REVEAL_PARAMS));

  const r = gate("fadeInUp", { candidatesDir, write: true });
  assert.equal(r.pass, true, "good candidate must PASS: " + JSON.stringify(r.checks.filter((c) => !c.info && !c.ok)));
  // GATE_REPORT.md was written
  assert.ok(fs.existsSync(path.join(candidatesDir, "fadeInUp", "GATE_REPORT.md")));
  // additive minor correctly classified (new name -> added)
  // (stage renumbered 7 -> 8 when the pauseControls stage 6 was inserted)
  assert.equal(findCheck(r, "8 catalog-lock: additive minor").ok, true);
});

test("break: missing reducedMotionFallback -> stage 1 FAIL", () => {
  const candidatesDir = tmpDir();
  const prim = clonePrimitive("scrollReveal", "noFallback", (p) => { delete p.a11y; });
  mkCandidate(candidatesDir, "noFallback", prim, exampleFor("noFallback", REVEAL_PARAMS));

  const r = gate("noFallback", { candidatesDir, write: false });
  assert.equal(r.pass, false);
  assert.equal(findCheck(r, "reducedMotionFallback").ok, false);
});

test("break: budget blown (cost 99) -> stage 4 FAIL", () => {
  const candidatesDir = tmpDir();
  const prim = clonePrimitive("scrollReveal", "budgetBlow", (p) => { p.performance.cost = 99; });
  mkCandidate(candidatesDir, "budgetBlow", prim, exampleFor("budgetBlow", REVEAL_PARAMS));

  const r = gate("budgetBlow", { candidatesDir, write: false });
  assert.equal(r.pass, false);
  assert.equal(findCheck(r, "budgetOk").ok, false);
});

test("break: non-deterministic token in output -> stage 7 FAIL (anti-goal A6)", () => {
  const candidatesDir = tmpDir();
  // Template that stays compilable but writes Date.now() into the output.
  const prim = clonePrimitive("scrollReveal", "nondet", (p) => {
    p.template = "console.log({{target}}, Date.now());";
  });
  mkCandidate(candidatesDir, "nondet", prim, exampleFor("nondet", REVEAL_PARAMS));

  const r = gate("nondet", { candidatesDir, write: false });
  assert.equal(r.pass, false);
  assert.equal(findCheck(r, "no non-det").ok, false);
});

test("break: broken meta schema (version not SemVer) -> stage 1 FAIL", () => {
  const candidatesDir = tmpDir();
  const prim = clonePrimitive("scrollReveal", "badMeta", (p) => { p.version = "1.0"; });
  mkCandidate(candidatesDir, "badMeta", prim, exampleFor("badMeta", REVEAL_PARAMS));

  const r = gate("badMeta", { candidatesDir, write: false });
  assert.equal(r.pass, false);
  assert.equal(findCheck(r, "meta schema (checkPrimitive)").ok, false);
});

test("break: tightened bounds without major bump -> stage 8 SemVer violation FAIL", () => {
  const candidatesDir = tmpDir();
  // Name collides with existing scrollReveal; max lowered (3 -> 1), version NOT major-bumped.
  // Version explicitly set to a patch bump above the lock baseline (1.1.0) so the
  // test stays independent of the current catalog version of the existing primitive: a
  // tightened bound (major) shipped as a patch MUST be caught fail-closed by the SemVer stage.
  const prim = clonePrimitive("scrollReveal", "scrollReveal", (p) => {
    p.version = "1.1.1"; // patch bump, but tightening demands major -> violation
    p.paramSchema.duration.max = 1; // was 3 -> tightening = major, but version stays 1.x
  });
  mkCandidate(candidatesDir, "scrollReveal", prim, exampleFor("scrollReveal", REVEAL_PARAMS));

  const r = gate("scrollReveal", { candidatesDir, write: false });
  assert.equal(r.pass, false);
  assert.equal(findCheck(r, "no SemVer violations").ok, false);
});

test("missing input files -> FAIL, no crash", () => {
  const candidatesDir = tmpDir();
  fs.mkdirSync(path.join(candidatesDir, "ghost"), { recursive: true });
  const r = gate("ghost", { candidatesDir, write: false });
  assert.equal(r.pass, false);
});

test("--prepare writes ONLY into the passed primitivesDir; verify-only touches nothing", () => {
  const candidatesDir = tmpDir();
  const prim = clonePrimitive("scrollReveal", "preparedPrim");
  mkCandidate(candidatesDir, "preparedPrim", prim, exampleFor("preparedPrim", REVEAL_PARAMS));

  // tmp copy of primitives/ as write target — the real repo stays untouched.
  const tmpPrimitives = tmpDir();
  for (const f of fs.readdirSync(path.join(ROOT, "primitives"))) {
    fs.copyFileSync(path.join(ROOT, "primitives", f), path.join(tmpPrimitives, f));
  }
  const dest = path.join(tmpPrimitives, "preparedPrim.json");

  // verify-only: does NOT create the primitive
  gate("preparedPrim", { candidatesDir, primitivesDir: tmpPrimitives, write: false, prepare: false });
  assert.equal(fs.existsSync(dest), false, "verify-only must not write primitives/");

  // --prepare: creates it (in the tmp target), the real primitives/ stays untouched
  const before = fs.existsSync(path.join(ROOT, "primitives", "preparedPrim.json"));
  const r = gate("preparedPrim", { candidatesDir, primitivesDir: tmpPrimitives, write: false, prepare: true });
  assert.equal(r.pass, true);
  assert.equal(fs.existsSync(dest), true, "--prepare must copy the primitive into the working tree");
  assert.equal(fs.existsSync(path.join(ROOT, "primitives", "preparedPrim.json")), before,
    "the real primitives/ must never be touched");
});

test("--prepare with keyword-rule.json appends a rule to a tmp keyword map", () => {
  const candidatesDir = tmpDir();
  const prim = clonePrimitive("scrollReveal", "kwPrim");
  mkCandidate(candidatesDir, "kwPrim", prim, exampleFor("kwPrim", REVEAL_PARAMS), {
    "keyword-rule.json": { source: "(kwprim|wischblende)", flags: "i", target: ".kw", params: { from: { opacity: 0 } } },
  });

  // tmp src/compiler/keyword-map.js + tmp primitives, so the real repo stays untouched.
  const tmpRoot = tmpDir();
  fs.mkdirSync(path.join(tmpRoot, "primitives"), { recursive: true });
  fs.mkdirSync(path.join(tmpRoot, "src", "compiler"), { recursive: true });
  for (const f of fs.readdirSync(path.join(ROOT, "primitives"))) {
    fs.copyFileSync(path.join(ROOT, "primitives", f), path.join(tmpRoot, "primitives", f));
  }
  const kmDest = path.join(tmpRoot, "src", "compiler", "keyword-map.js");
  fs.copyFileSync(path.join(ROOT, "src", "compiler", "keyword-map.js"), kmDest);

  const r = gate("kwPrim", {
    candidatesDir,
    primitivesDir: path.join(tmpRoot, "primitives"),
    write: false,
    prepare: true,
  });
  assert.equal(r.pass, true);
  const km = fs.readFileSync(kmDest, "utf8");
  assert.ok(km.includes('primitive: "kwPrim"'), "keyword rule must be appended");
  // the modified file must still be valid JS and remain loadable
  delete require.cache[require.resolve(kmDest)];
  const mod = require(kmDest);
  assert.ok(mod.KEYWORD_MAP.some((e) => e.primitive === "kwPrim"));
  assert.ok(mod.KEYWORD_MAP.find((e) => e.primitive === "kwPrim").re.test("wischblende hero"));
});

/* ---- Adversarial review hardenings (12 confirmed findings) ---- */

test("security: invalid/path-traversal name -> stage 0 FAIL, NO fs access", () => {
  const candidatesDir = tmpDir();
  for (const bad of ["../etc/passwd", "a/b", "../../package", "", "1startsWithDigit_butdot."]) {
    const r = gate(bad, { candidatesDir, write: true });
    assert.equal(r.pass, false, "name '" + bad + "' must FAIL");
    assert.equal(findCheck(r, "name format").ok, false);
    assert.equal(r.reportPath, null, "for an invalid name NO report (mkdir/write) may be created");
  }
});

test("A6: crypto.randomUUID in template -> stage 1 (template) + stage 7 (output) FAIL", () => {
  const candidatesDir = tmpDir();
  const prim = clonePrimitive("scrollReveal", "uuidPrim", (p) => {
    p.template = "el.dataset.run = crypto.randomUUID(); gsap.from({{target}}, {});";
  });
  mkCandidate(candidatesDir, "uuidPrim", prim, exampleFor("uuidPrim", REVEAL_PARAMS));

  const r = gate("uuidPrim", { candidatesDir, write: false });
  assert.equal(r.pass, false, "crypto.randomUUID is non-deterministic -> must FAIL");
  assert.equal(findCheck(r, "non-det. tokens in the template").ok, false);
});

test("A6: further entropy forms are caught (Math[, performance.timeOrigin, Date.parse)", () => {
  const candidatesDir = tmpDir();
  for (const tok of ["Math['random']()", "performance.timeOrigin", "Date.parse('x')"]) {
    const safe = tok.replace(/[^a-z]/gi, "");
    const prim = clonePrimitive("scrollReveal", "ent" + safe.slice(0, 8), (p) => {
      p.template = "var z = " + tok + "; gsap.from({{target}}, {});";
    });
    const nm = prim.name;
    mkCandidate(candidatesDir, nm, prim, exampleFor(nm, REVEAL_PARAMS));
    const r = gate(nm, { candidatesDir, write: false });
    assert.equal(r.pass, false, tok + " must FAIL as non-deterministic");
  }
});

test("stage 5: example with respectReducedMotion:false -> guard is verified ANYWAY (RRM enforced), PASS remains", () => {
  const candidatesDir = tmpDir();
  const prim = clonePrimitive("scrollReveal", "optOutEx");
  const example = exampleFor("optOutEx", REVEAL_PARAMS, { respectReducedMotion: false });
  mkCandidate(candidatesDir, "optOutEx", prim, example);

  const r = gate("optOutEx", { candidatesDir, write: false });
  // The example opt-out must NOT disable the a11y gate: stage 5 (RRM enforced) must check hard and be OK.
  const s5 = findCheck(r, "RRM enforced");
  assert.ok(s5 && s5.ok, "stage 5 must verify the guard independently of the example");
  assert.equal(r.pass, true, "an otherwise valid candidate remains PASS; the opt-out is only INFO");
});

test("security: appendKeywordRule screens ReDoS/lengths like the catalog (fail-closed)", () => {
  const tmpRoot = tmpDir();
  const km = path.join(tmpRoot, "keyword-map.js");
  fs.copyFileSync(path.join(ROOT, "src", "compiler", "keyword-map.js"), km);
  const before = fs.readFileSync(km, "utf8");

  // ReDoS (nested quantifiers) -> screenPattern throws -> file UNCHANGED.
  assert.throws(() => appendKeywordRule("evilPrim", { source: "(a+)+$", flags: "i", target: ".x", params: {} }, km));
  assert.equal(fs.readFileSync(km, "utf8"), before, "ReDoS pattern must NOT get into the source code");

  // Overlong pattern (>100) -> also rejected.
  assert.throws(() => appendKeywordRule("longPrim", { source: "a".repeat(101), flags: "i", target: ".x", params: {} }, km));
  assert.equal(fs.readFileSync(km, "utf8"), before);

  // Safe pattern -> is appended and stays loadable.
  appendKeywordRule("safePrim", { source: "(safe|sicher)", flags: "i", target: ".s", params: {} }, km);
  const after = fs.readFileSync(km, "utf8");
  assert.ok(after.includes('primitive: "safePrim"'));
  delete require.cache[require.resolve(km)];
  const mod = require(km);
  assert.ok(mod.KEYWORD_MAP.some((e) => e.primitive === "safePrim"));
});
