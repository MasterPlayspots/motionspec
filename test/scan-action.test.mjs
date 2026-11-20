/* GitHub Action actions/scan-action: threshold, exit code, outputs, job summary and the
 * optional pull request comment — against a local mock of the scan API (node:http), no
 * external network. The action itself runs on node24; these tests run on the CI matrix. */
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as lib from "../actions/scan-action/lib.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ID = "scn_01JD0000000000000000000000";
const KEY = "ms_live_test_key_0123456789abcdef";
const HINWEIS_EN = "Automated testing detects only part of the possible barriers under WCAG 2.2 A/AA. Many criteria can only be judged by a person. The result does not confirm accessibility and is not legal advice.";
const VERBOTEN = ["konform", "conform", "compliant", "compliance", "garantiert barrierefrei", "guaranteed accessib",
  "fully accessible", "100% barrierefrei", "100% accessible", "siegel", "seal of", "gütesiegel", "zertifiziert", "certified"];

function kurz(over = {}) {
  return Object.assign({
    scanId: ID, url: "https://example.com/", status: "fertig", nichtMessbarGrund: null,
    verstoesseJeSchwere: { kritisch: 1, ernst: 2, mittel: 3, gering: 4 }, zuPruefen: 5,
    top3: [{ regelId: "image-alt", quelle: "axe", wcag: ["1.1.1"], schwere: "kritisch", titel: "Images must have alternative text", anzahl: 1 }],
    hinweis: HINWEIS_EN,
    vollerBericht: { paket: "check", kaufUrl: "https://motionspec.dev/pricing?scan=" + ID },
  }, over);
}
const antwort = (status, k, scanOver = {}) => ({ scan: Object.assign({ id: ID, status, sprache: "en" }, scanOver), kurzergebnis: k });

/* Fake-io: fetch aus einer Routentabelle, Dateien im Speicher. */
function fakeIo(routes) {
  const calls = [];
  const dateien = {};
  const logs = [];
  let t = 0;
  return {
    calls, dateien, logs,
    io: {
      async fetch(url, init = {}) {
        calls.push({ url, method: init.method || "GET", headers: init.headers || {}, body: init.body ? JSON.parse(init.body) : null });
        const key = (init.method || "GET") + " " + url;
        const r = typeof routes === "function" ? routes(key, init) : routes[key];
        if (r instanceof Error) throw r;
        if (!r) return new Response(JSON.stringify({ fehler: "nicht_gefunden", nachricht: "x" }), { status: 404 });
        return new Response(JSON.stringify(r.body), { status: r.status || 200, headers: r.headers || {} });
      },
      jetzt: () => t,
      schlafen: async (ms) => { t += ms; },
      intervallMs: 5000,
      log: (s) => logs.push(s),
      anhaengen: (p, s) => { dateien[p] = (dateien[p] || "") + s; },
      lies: (p) => { if (!(p in dateien)) throw new Error("ENOENT"); return dateien[p]; },
    },
  };
}
const API = "https://scan.example";
function env(over = {}) {
  return Object.assign({ "INPUT_URL": "https://example.com/", "INPUT_API-KEY": KEY, "INPUT_API-URL": API + "/",
    GITHUB_OUTPUT: "/out", GITHUB_STEP_SUMMARY: "/summary" }, over);
}
const okRoutes = (lesen) => ({
  ["POST " + API + "/v1/scans"]: { status: 202, body: { id: ID, status: "wartend", links: { self: "/v1/scans/" + ID } } },
  ["GET " + API + "/v1/scans/" + ID]: { status: 200, body: lesen || antwort("fertig", kurz()) },
});
const outputs = (f) => Object.fromEntries((f.dateien["/out"] || "").trim().split("\n").filter(Boolean).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));

test("inputs: required, validated, defaults (fail-on serious, max 0, fail on not measurable, en)", () => {
  const e = lib.leseEingaben(env());
  assert.equal(e.apiUrl, API, "trailing slash removed");
  assert.equal(e.failOn, "serious");
  assert.equal(e.maxViolations, 0);
  assert.equal(e.failOnNotMeasurable, true);
  assert.equal(e.sprache, "en");
  assert.equal(e.timeoutMs, 300000);
  assert.equal(e.comment, false);
  const bad = [
    [{ INPUT_URL: "" }, /url is required/], [{ "INPUT_API-KEY": "" }, /api-key is required/], [{ "INPUT_API-URL": "" }, /api-url is required/],
    [{ INPUT_URL: "ftp://x.example" }, /full http\(s\) URL/], [{ INPUT_URL: "nope" }, /full http\(s\) URL/],
    [{ "INPUT_API-URL": "http://scan.example" }, /must use https/], [{ "INPUT_API-URL": "https://u:p@scan.example" }, /credentials/],
    [{ INPUT_LANGUAGE: "fr" }, /en or de/], [{ "INPUT_FAIL-ON": "huge" }, /fail-on must be/],
    [{ "INPUT_MAX-VIOLATIONS": "-1" }, /whole number/], [{ "INPUT_TIMEOUT-SECONDS": "5" }, />= 10/],
    [{ "INPUT_FAIL-ON-NOT-MEASURABLE": "yes" }, /true or false/], [{ INPUT_COMMENT: "1" }, /true or false/],
  ];
  for (const [over, re] of bad) assert.throws(() => lib.leseEingaben(env(over)), re, JSON.stringify(over));
  assert.equal(lib.leseEingaben(env({ "INPUT_API-URL": "http://127.0.0.1:8787" })).apiUrl, "http://127.0.0.1:8787");
});

test("threshold: counts violations at or above fail-on; none never fails", () => {
  const je = { kritisch: 1, ernst: 2, mittel: 3, gering: 4 };
  assert.equal(lib.zaehleAbSchwelle(je, "critical"), 1);
  assert.equal(lib.zaehleAbSchwelle(je, "serious"), 3);
  assert.equal(lib.zaehleAbSchwelle(je, "moderate"), 6);
  assert.equal(lib.zaehleAbSchwelle(je, "minor"), 10);
  assert.equal(lib.zaehleAbSchwelle(je, "none"), 0);
});

test("run: violations above the threshold → exit 1, outputs, summary with the notice verbatim; request per contract", async () => {
  const f = fakeIo(okRoutes());
  const code = await lib.run(env(), f.io);
  assert.equal(code, 1);
  const post = f.calls[0];
  assert.equal(post.url, API + "/v1/scans");
  assert.deepEqual(post.body, { url: "https://example.com/", art: "gratis", sprache: "en", quelle: "action" });
  assert.equal(post.headers.authorization, "Bearer " + KEY);
  assert.equal(f.calls[1].headers.authorization, "Bearer " + KEY, "the account reads its own scan");
  const o = outputs(f);
  assert.deepEqual(o, { result: "failed", "scan-id": ID, status: "fertig", critical: "1", serious: "2", moderate: "3", minor: "4", review: "5", violations: "3",
    "report-url": "https://motionspec.dev/pricing?scan=" + ID + "&src=scan-action" });
  const s = f.dateien["/summary"];
  assert.ok(s.startsWith(lib.KOMMENTAR_MARKE));
  assert.ok(s.includes("> " + HINWEIS_EN), "notice verbatim");
  assert.match(s, /\| 1 \| 2 \| 3 \| 4 \| 5 \|/);
  assert.match(s, /❌ 3 violations at or above "serious", allowed: 0\./);
  assert.match(s, /1\. \[critical\] Images must have alternative text \(`image-alt`, WCAG 1\.1\.1\) — 1×/);
  assert.match(s, /\[49-€ Check\]\(https:\/\/motionspec\.dev\/pricing\?scan=scn_\w+&src=scan-action\) \(EUR 49 \/ USD 49 excl\. VAT, B2B\)/);
  assert.ok(f.logs.some((l) => l.startsWith("::error::3 violations at or above serious")));
  const alles = JSON.stringify(f.dateien) + f.logs.join("\n");
  assert.equal(alles.includes(KEY), false, "the API key never appears in outputs, summary or logs");
  for (const w of VERBOTEN) assert.equal(alles.toLowerCase().includes(w), false, w);
});

test("run: within the threshold → exit 0 (fail-on critical, max-violations 1; fail-on none)", async () => {
  for (const over of [{ "INPUT_FAIL-ON": "critical", "INPUT_MAX-VIOLATIONS": "1" }, { "INPUT_FAIL-ON": "none" }]) {
    const f = fakeIo(okRoutes());
    assert.equal(await lib.run(env(over), f.io), 0);
    assert.equal(outputs(f).result, "passed");
    assert.match(f.dateien["/summary"], /✅/);
  }
});

test("run: German summary when language is de", async () => {
  const f = fakeIo(okRoutes(antwort("fertig", kurz({ hinweis: "Automatisierte Prüfung: …" }))));
  await lib.run(env({ INPUT_LANGUAGE: "de" }), f.io);
  assert.equal(f.calls[0].body.sprache, "de");
  const s = f.dateien["/summary"];
  assert.match(s, /MotionSpec Barrierefreiheits-Check/);
  assert.match(s, /\| kritisch \| ernst \| mittel \| gering \| von Hand prüfen \|/);
  assert.match(s, /49-€-Check\]\(.*\) \(49 € zzgl\. USt\., B2B\)/);
  assert.match(s, /❌ 3 Verstöße ab „ernst“, erlaubt: 0\./);
});

test("run: not measurable is never a clean pass — fails by default, warning only when allowed; no purchase link", async () => {
  const k = kurz({ status: "nicht_messbar", nichtMessbarGrund: "bot_schutz", verstoesseJeSchwere: { kritisch: 0, ernst: 0, mittel: 0, gering: 0 }, top3: [] });
  for (const [over, exit] of [[{}, 1], [{ "INPUT_FAIL-ON-NOT-MEASURABLE": "false" }, 0]]) {
    const f = fakeIo(okRoutes(antwort("nicht_messbar", k)));
    assert.equal(await lib.run(env(over), f.io), exit);
    const o = outputs(f);
    assert.equal(o.result, "not-measurable");
    assert.equal(o["report-url"], "");
    const s = f.dateien["/summary"];
    assert.match(s, /\*\*Not measurable\*\* \(reason: bot protection\)\. The page could not be checked\. This is not a clean result\./);
    assert.doesNotMatch(s, /✅|\| 0 \| 0/);
    assert.ok(s.includes(HINWEIS_EN));
    assert.ok(f.logs.some((l) => l.includes("not a clean result")));
  }
});

test("run: polls until finished, honours the timeout, survives short API outages", async () => {
  let n = 0;
  const f = fakeIo((key) => {
    if (key.startsWith("POST")) return { status: 202, body: { id: ID, status: "wartend" } };
    n++;
    if (n === 1) return { status: 200, body: antwort("wartend", null) };
    if (n === 2) return new Error("ECONNRESET");
    if (n === 3) return { status: 502, body: {} };
    return { status: 200, body: antwort("fertig", kurz({ verstoesseJeSchwere: { kritisch: 0, ernst: 0, mittel: 0, gering: 0 }, top3: [] })) };
  });
  assert.equal(await lib.run(env(), f.io), 0);
  assert.equal(n, 4);
  const lange = fakeIo((key) => key.startsWith("POST") ? { status: 202, body: { id: ID } } : { status: 200, body: antwort("laeuft", null) });
  assert.equal(await lib.run(env({ "INPUT_TIMEOUT-SECONDS": "20" }), lange.io), 1);
  assert.ok(lange.logs.some((l) => /did not finish within 20 s/.test(l)));
  assert.equal(outputs(lange).result, "error");
});

test("run: API errors fail with a clear message (status, code, Retry-After) and never echo the key", async () => {
  const cases = [
    [{ status: 401, body: { fehler: "nicht_angemeldet", nachricht: "API-Schlüssel ungültig oder widerrufen." } }, /API key was not accepted \(invalid or revoked\) \(HTTP 401, nicht_angemeldet\)/],
    [{ status: 429, body: { fehler: "limit_erreicht", nachricht: "x" }, headers: { "retry-after": "3600" } }, /scan limit is reached .*Retry-After: 3600\./],
    [{ status: 503, body: { fehler: "kostenbremse", nachricht: "x" } }, /No scans are available today/],
    [{ status: 400, body: { fehler: "url_nicht_erlaubt", nachricht: "Die Domain zeigt auf eine private Adresse." } }, /private Adresse/],
    [{ status: 418, body: "teapot" }, /unexpected answer \(HTTP 418\)/],
    [{ status: 202, body: { id: "falsch" } }, /unexpected answer \(HTTP 202\)/],
    [new Error("offline"), /not reachable/],
  ];
  for (const [r, re] of cases) {
    const f = fakeIo({ ["POST " + API + "/v1/scans"]: r });
    assert.equal(await lib.run(env(), f.io), 1);
    assert.ok(f.logs.some((l) => l.startsWith("::error::") && re.test(l)), JSON.stringify(f.logs));
    assert.equal(outputs(f).result, "error");
    assert.equal(f.logs.join("").includes(KEY), false);
  }
  const fehler = fakeIo(okRoutes(antwort("fehler", null, { fehlerCode: "browser" })));
  assert.equal(await lib.run(env(), fehler.io), 1);
  assert.equal(outputs(fehler).result, "error");
  const weg = fakeIo({ ["POST " + API + "/v1/scans"]: { status: 202, body: { id: ID } } });
  assert.equal(await lib.run(env(), weg.io), 1, "a 404 on the read fails");
  const kaputt = fakeIo({});
  assert.equal(await lib.run(env({ INPUT_URL: "" }), kaputt.io), 1);
  assert.equal(outputs(kaputt).result, "error");
});

test("pull request comment: created once, then updated in place (marker); skipped outside pull_request", async () => {
  const gh = "https://api.github.example";
  const comments = [];
  const routes = (key, init) => {
    if (key.startsWith("POST " + API) || key.startsWith("GET " + API)) return okRoutes()[key];
    if (key === `GET ${gh}/repos/acme/site/issues/7/comments?per_page=100`) return { status: 200, body: comments };
    if (key === `POST ${gh}/repos/acme/site/issues/7/comments`) { comments.push({ id: 99, body: JSON.parse(init.body).body }); return { status: 201, body: {} }; }
    if (key === `PATCH ${gh}/repos/acme/site/issues/comments/99`) { comments[0].body = JSON.parse(init.body).body; return { status: 200, body: {} }; }
    return null;
  };
  const prEnv = env({ INPUT_COMMENT: "true", "INPUT_GITHUB-TOKEN": "ghs_token", GITHUB_EVENT_NAME: "pull_request", GITHUB_EVENT_PATH: "/event.json", GITHUB_REPOSITORY: "acme/site", GITHUB_API_URL: gh });
  for (const erwartet of ["created", "updated"]) {
    const f = fakeIo(routes);
    f.dateien["/event.json"] = JSON.stringify({ pull_request: { number: 7 } });
    await lib.run(prEnv, f.io);
    assert.ok(f.logs.includes("Pull request comment: " + erwartet), f.logs.join("\n"));
    const c = f.calls.find((x) => x.url.startsWith(gh) && x.method !== "GET");
    assert.equal(c.headers.authorization, "Bearer ghs_token");
  }
  assert.equal(comments.length, 1);
  assert.ok(comments[0].body.startsWith(lib.KOMMENTAR_MARKE));
  assert.ok(comments[0].body.includes(HINWEIS_EN));

  const push = fakeIo(okRoutes());
  await lib.run(env({ INPUT_COMMENT: "true", GITHUB_EVENT_NAME: "push" }), push.io);
  assert.ok(push.logs.includes("Pull request comment: skipped: not a pull_request event"));
  const ohneToken = fakeIo(okRoutes());
  ohneToken.dateien["/event.json"] = JSON.stringify({ pull_request: { number: 7 } });
  await lib.run(Object.assign({}, prEnv, { "INPUT_GITHUB-TOKEN": "" }), ohneToken.io);
  assert.ok(ohneToken.logs.includes("Pull request comment: skipped: no github-token"));
  const kaputt = fakeIo((key) => key.includes(gh) ? { status: 403, body: {} } : okRoutes()[key]);
  kaputt.dateien["/event.json"] = JSON.stringify({ pull_request: { number: 7 } });
  const code = await lib.run(prEnv, kaputt.io);
  assert.equal(code, 1, "the comment never changes the exit code (violations still fail)");
  assert.ok(kaputt.logs.includes("::warning::Pull request comment: failed: listing comments (HTTP 403)"));
  assert.equal(lib.prNummer({ GITHUB_EVENT_NAME: "pull_request", GITHUB_EVENT_PATH: "/nope" }, kaputt.io), null);
  assert.equal(await lib.kommentiere(kaputt.io, { GITHUB_EVENT_NAME: "pull_request", GITHUB_EVENT_PATH: "/event.json", GITHUB_REPOSITORY: "bad repo" }, { githubToken: "t" }, "x"), "skipped: GITHUB_REPOSITORY missing");
});

test("markdown: scanner text cannot inject markup; foreign purchase links are dropped", () => {
  const e = lib.leseEingaben(env());
  const b = lib.bewerte(antwort("fertig", kurz({ top3: [{ regelId: "x|y", titel: "<img src=x onerror=alert(1)>\n## heading", schwere: "ernst", wcag: ["1.1.1`"], anzahl: 2 }],
    vollerBericht: { paket: "check", kaufUrl: "https://buy.stripe.com/abc" } })), e);
  assert.equal(b.kaufUrl, null);
  const md = lib.markdown(b, e, ID);
  assert.doesNotMatch(md, /<img/);
  assert.doesNotMatch(md, /\n## heading/);
  assert.match(md, /\(`xy`, WCAG 1\.1\.1\\`\)/);
  assert.equal(lib.kaufLink("not a url"), null);
  assert.equal(lib.kaufLink(5), null);
  assert.equal(lib.bewerte(antwort("fertig", kurz({ hinweis: "" })), e).hinweis, lib.ABDECKUNGS_HINWEIS.en);
});

test("action.yml: node24, index.mjs, required inputs, defaults match the code", () => {
  const y = readFileSync(path.join(ROOT, "actions/scan-action/action.yml"), "utf8");
  assert.match(y, /runs:\n {2}using: node24\n {2}main: index\.mjs/);
  for (const name of ["url", "api-key", "api-url"]) assert.match(y, new RegExp(`\\n  ${name}:\\n    description: [^\\n]+\\n    required: true`));
  assert.match(y, /fail-on:\n[^]*?default: serious/);
  assert.match(y, /max-violations:\n[^]*?default: "0"/);
  assert.match(y, /fail-on-not-measurable:\n[^]*?default: "true"/);
  assert.match(y, /comment:\n[^]*?default: "false"/);
  const low = y.toLowerCase();
  for (const w of VERBOTEN) assert.equal(low.includes(w), false, w);
});

/* Ende-zu-Ende: der echte Einstieg als Prozess gegen einen lokalen Mock-Server. */
test("index.mjs end to end: real fetch against a local scan API mock, exit code and outputs", { skip: Number(process.versions.node.split(".")[0]) < 20 && "top-level await + fetch in a child process: Node >= 20 (the action runs on node24)" }, async () => {
  const seen = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      seen.push({ method: req.method, url: req.url, auth: req.headers.authorization, body });
      res.setHeader("content-type", "application/json");
      if (req.method === "POST" && req.url === "/v1/scans") { res.statusCode = 202; res.end(JSON.stringify({ id: ID, status: "wartend" })); return; }
      if (req.method === "GET" && req.url === "/v1/scans/" + ID) { res.end(JSON.stringify(antwort("fertig", kurz({ verstoesseJeSchwere: { kritisch: 0, ernst: 0, mittel: 1, gering: 0 }, top3: [] })))); return; }
      res.statusCode = 404; res.end("{}");
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const dir = mkdtempSync(path.join(tmpdir(), "scan-action-"));
  const out = path.join(dir, "out"); const sum = path.join(dir, "sum");
  writeFileSync(out, ""); writeFileSync(sum, "");
  try {
    const res = await new Promise((resolve) => {
      const p = spawn(process.execPath, [path.join(ROOT, "actions/scan-action/index.mjs")], {
        env: { PATH: process.env.PATH, "INPUT_URL": "https://example.com/", "INPUT_API-KEY": KEY, "INPUT_API-URL": `http://127.0.0.1:${port}`, GITHUB_OUTPUT: out, GITHUB_STEP_SUMMARY: sum },
      });
      let stdout = "";
      p.stdout.on("data", (d) => { stdout += d; });
      p.on("close", (status) => resolve({ status, stdout }));
    });
    assert.equal(res.status, 0, res.stdout);
    assert.match(readFileSync(out, "utf8"), /^result=passed$/m);
    assert.match(readFileSync(out, "utf8"), /^moderate=1$/m);
    assert.ok(readFileSync(sum, "utf8").includes(HINWEIS_EN));
    assert.equal(res.stdout.includes(KEY), false);
    assert.deepEqual(seen.map((s) => s.method + " " + s.url), ["POST /v1/scans", "GET /v1/scans/" + ID]);
    assert.equal(seen[0].auth, "Bearer " + KEY);
    assert.equal(JSON.parse(seen[0].body).quelle, "action");
  } finally {
    server.close();
  }
});
