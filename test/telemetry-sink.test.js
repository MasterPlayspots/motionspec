"use strict";
/* Phase C / C1: telemetry sink abstraction.  Checks the FileSink contract
 * (append/readAll) and that telemetry.log/summary aggregate identically via
 * an injected sink — incl. field clamping (MAX_FIELD) and
 * the #17 exclusion of NOISE_OUTCOMES from the escalation view. */
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const { FileSink } = require("../src/router/telemetry-sink.js");
const telemetry = require("../src/router/telemetry.js");

const tmp = () => path.join(os.tmpdir(), "ms-tel-" + crypto.randomBytes(6).toString("hex") + ".jsonl");
const rm = (f) => { try { fs.unlinkSync(f); } catch { /* ignore */ } };

test("FileSink: append -> readAll Roundtrip", () => {
  const f = tmp();
  try {
    const s = new FileSink(f);
    s.append({ outcome: "a", n: 1 });
    s.append({ outcome: "b", n: 2 });
    const recs = s.readAll();
    assert.equal(recs.length, 2);
    assert.equal(recs[0].outcome, "a");
    assert.equal(recs[1].n, 2);
  } finally { rm(f); }
});

test("FileSink: readAll on a missing file -> []", () => {
  assert.deepEqual(new FileSink(tmp()).readAll(), []);
});

test("FileSink: broken line is skipped", () => {
  const f = tmp();
  try {
    fs.writeFileSync(f, '{"outcome":"ok"}\nNICHT-JSON\n{"outcome":"ok2"}\n');
    const recs = new FileSink(f).readAll();
    assert.equal(recs.length, 2);
    assert.equal(recs[1].outcome, "ok2");
  } finally { rm(f); }
});

test("telemetry via injected sink: clamping + aggregation + #17", async () => {
  const orig = telemetry.getSink();
  const f = tmp();
  try {
    telemetry.setSink(new FileSink(f));
    telemetry.log({ outcome: "escalate-no-primitive", request: "x".repeat(900) });
    telemetry.log({ outcome: "escalate-no-primitive" });
    telemetry.log({ outcome: "cache-hit" });
    telemetry.log({ outcome: "vanilla-gsap" });

    const s = await telemetry.summary();
    assert.equal(s.total, 4);
    assert.equal(s.byOutcome["escalate-no-primitive"], 2);
    assert.equal(s.byOutcome["cache-hit"], 1);
    assert.equal(s.escalations["escalate-no-primitive"], 2);
    assert.ok(!("cache-hit" in s.escalations), "NOISE/non-escalation does not count");

    const recs = new FileSink(f).readAll();
    assert.equal(recs[0].request.length, 500, "field clamped to MAX_FIELD");
    assert.ok(recs[0].ts, "ts set");
  } finally {
    telemetry.setSink(orig);
    rm(f);
  }
});

const { MemorySink } = require("../src/router/telemetry-sink.js");

test("summary() with an async sink returns resolved values", async () => {
  const orig = telemetry.getSink();
  try {
    telemetry.setSink(new MemorySink());
    telemetry.log({ outcome: "ok" });
    telemetry.log({ outcome: "escalate-test" });
    const s = await telemetry.summary();
    assert.equal(typeof s.total, "number");
    assert.equal(typeof s.byOutcome, "object");
    assert.equal(s.total, 2);
  } finally {
    telemetry.setSink(orig);
  }
});

test("telemetry.log(): sink error does not crash", () => {
  const orig = telemetry.getSink();
  try {
    telemetry.setSink({ append() { throw new Error("ENOSPC"); }, readAll() { return []; } });
    assert.doesNotThrow(() => telemetry.log({ outcome: "test-no-crash" }));
  } finally {
    telemetry.setSink(orig);
  }
});
