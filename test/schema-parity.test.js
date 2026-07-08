"use strict";
/* Phase B item 2 — Schema <-> validator parity.
 * The static JSON schema (the PUBLISHED contract) and the runtime validator
 * (the ENFORCED contract) are two sources of truth. The re-audit flagged that
 * the schema is dead code that can drift from the validator forever. This test
 * ties them together: the schema's allow-lists must equal the validator's
 * exported constants, and both surfaces must reject unknown keys at every level.
 *
 * Zero-dependency by design: we do NOT pull in ajv (the project ships 0 runtime
 * deps and treats every dependency as attack surface). Comparing the schema's
 * declared enums/keys against the validator constants kills drift directly. */
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const {
  validateSpec, SPEC_VERSIONS, TARGETS, TOP_KEYS, META_KEYS, GLOBALS_KEYS, MOTION_KEYS, ID_RE,
} = require("../src/compiler/validate.js");
const { loadCatalog } = require("../src/compiler/catalog.js");

const schema = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "schema", "motionspec.schema.json"), "utf8"));
const catalog = loadCatalog();
const set = (a) => [...a].sort();

test("top-level: schema properties == validator TOP_KEYS, additionalProperties false", () => {
  assert.deepEqual(set(Object.keys(schema.properties)), set(TOP_KEYS));
  assert.equal(schema.additionalProperties, false);
});

test("specVersion enum matches validator SPEC_VERSIONS", () => {
  assert.deepEqual(set(schema.properties.specVersion.enum), set(SPEC_VERSIONS));
});

test("meta: schema keys == META_KEYS, target enum == TARGETS, additionalProperties false", () => {
  const meta = schema.properties.meta;
  assert.deepEqual(set(Object.keys(meta.properties)), set(META_KEYS));
  assert.deepEqual(set(meta.properties.target.enum), set(TARGETS));
  assert.equal(meta.additionalProperties, false);
});

test("globals: schema keys == GLOBALS_KEYS, additionalProperties false", () => {
  const g = schema.properties.globals;
  assert.deepEqual(set(Object.keys(g.properties)), set(GLOBALS_KEYS));
  assert.equal(g.additionalProperties, false);
});

test("motion: schema item keys == MOTION_KEYS, additionalProperties false", () => {
  const item = schema.properties.motions.items;
  assert.deepEqual(set(Object.keys(item.properties)), set(MOTION_KEYS));
  assert.equal(item.additionalProperties, false);
});

/* Format parity (TASK-012 / Finding #11): before, the schema declared id/target
 * only as minLength:1 while the validator enforces ID_RE and a 200-char selector
 * cap — so an external JSON-Schema validator passed specs the runtime rejects.
 * Tie the schema's id format to the validator's exported ID_RE so they can't drift. */
test("motion.id: schema pattern/maxLength mirror validator ID_RE", () => {
  const id = schema.properties.motions.items.properties.id;
  assert.equal(id.pattern, ID_RE.source);
  assert.equal(id.maxLength, 64);
  assert.equal(id.minLength, 1);
});

test("motion.target: schema caps length at 200, pattern deliberately omitted", () => {
  const target = schema.properties.motions.items.properties.target;
  assert.equal(target.maxLength, 200);
  assert.equal(target.minLength, 1);
  // No pattern by design: CSS selectors carry special chars; the validator's
  // SELECTOR_RE + safeSelector() screen them at runtime instead.
  assert.equal(target.pattern, undefined);
});

test("trigger: schema additionalProperties false and keys match validator's", () => {
  const trig = schema.properties.motions.items.properties.trigger;
  assert.equal(trig.additionalProperties, false);
  assert.deepEqual(set(Object.keys(trig.properties)), set(["start", "end", "once"]));
});

/* Behavioural parity: the validator must REJECT an unknown key at every object
 * level the schema marks additionalProperties:false. This proves the two
 * contracts agree on rejection, not just on declared shape. */
const base = (over) => Object.assign({
  specVersion: "1.0",
  meta: { project: "t", target: "vanilla-gsap" },
  globals: { respectReducedMotion: true },
  motions: [{ id: "m", primitive: "scrollReveal", target: ".h", params: { from: { opacity: 0 } } }],
}, over);

test("validator rejects unknown keys at top / meta / globals / motion / trigger", () => {
  const cases = [
    [{ bogusTop: 1 }, "MS-SPEC-KEY"],
    [{ meta: { project: "t", target: "vanilla-gsap", bogusMeta: 1 } }, "MS-META-KEY"],
    [{ globals: { respectReducedMotion: true, bogusGlobal: 1 } }, "MS-GLOBALS-KEY"],
    [{ motions: [{ id: "m", primitive: "scrollReveal", target: ".h", params: {}, bogusMotion: 1 }] }, "MS-MOTION-KEY"],
    [{ motions: [{ id: "m", primitive: "scrollReveal", target: ".h", params: {}, trigger: { scrub: true } }] }, "MS-TRIGGER-KEY"],
  ];
  for (const [over, code] of cases) {
    const v = validateSpec(base(over), catalog);
    assert.ok(v.errorCodes.includes(code), "expected " + code + " for " + JSON.stringify(over) + " — got " + v.errorCodes.join(","));
  }
});

test("documented divergence: schema lists `responsive` but validator defers it (rejects at runtime)", () => {
  // This is intentional and documented in the schema description. Lock it so the
  // divergence stays a KNOWN one (validator must reject until specVersion 0.2).
  assert.ok("responsive" in schema.properties.motions.items.properties);
  const v = validateSpec(base({ motions: [{ id: "m", primitive: "scrollReveal", target: ".h", params: {}, responsive: { mobile: {} } }] }), catalog);
  assert.ok(v.errorCodes.includes("MS-RESP-UNSUPPORTED"));
});
