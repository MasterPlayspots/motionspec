import { test } from "node:test";
import assert from "node:assert/strict";
import * as audit from "../src/audit/audit.js";

const { hasMarqueeElement } = audit.default ?? audit;

test("real <marquee> element is still detected", () => {
  assert.equal(hasMarqueeElement("<body><marquee>news</marquee></body>"), true);
  assert.equal(hasMarqueeElement('<body><MARQUEE behavior="scroll">x</MARQUEE></body>'), true);
});

test("the word <marquee> inside JSON-LD is not an element (regression 2026-11-02)", () => {
  const html = '<head><script type="application/ld+json">{"text":"and the deprecated <marquee> element."}</script></head><body><p>&lt;marquee&gt; is deprecated</p></body>';
  assert.equal(hasMarqueeElement(html), false);
});

test("<marquee> in comments, style, template, textarea, noscript is ignored", () => {
  for (const html of [
    "<!-- <marquee>old</marquee> -->",
    "<style>/* <marquee> */</style>",
    "<template><marquee>x</marquee></template>",
    "<textarea><marquee>x</marquee></textarea>",
    "<noscript><marquee>x</marquee></noscript>",
    "<script>const s = '<marquee>';</script>",
  ]) assert.equal(hasMarqueeElement(html), false, html);
});

test("a real element next to a script mention is still detected", () => {
  assert.equal(hasMarqueeElement("<script>'<marquee>'</script><marquee>x</marquee>"), true);
});
