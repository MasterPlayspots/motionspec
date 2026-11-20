/* scan_site — the shared tool logic, without network: the scanner is an
 * in-memory fake client. Holds the output contract: short result only (counts per
 * severity, top 3), the coverage notice verbatim, the Website report link only for a finished
 * scan and only on motionspec.dev, "not measurable" never shown as clean, the brake runs
 * before the scanner, and the npm (stdio) path only points to the hosted endpoint. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const require = createRequire(import.meta.url);
const scan = require("../src/mcp/scan-site.js");
const { registerMotionspecTools } = require("../src/mcp/register-tools.js");
const { loadCatalog, catalogVersion } = require("../src/compiler/catalog.js");

const ID = "scn_01JD0000000000000000000000";
const ID2 = "scn_01JD0000000000000000000001";

/* Kopie aus dem Vertrag der Scan-API 1.2.0 (ABDECKUNGS_HINWEIS, VERBOTENE_AUSSAGEN). */
const HINWEIS = {
  de: "Automatisierte Prüfung: Sie erkennt nur einen Teil der möglichen Barrieren nach WCAG 2.2 A/AA. Viele Kriterien kann nur ein Mensch beurteilen. Das Ergebnis bestätigt keine Barrierefreiheit und ist keine Rechtsberatung.",
  en: "Automated testing detects only part of the possible barriers under WCAG 2.2 A/AA. Many criteria can only be judged by a person. The result does not confirm accessibility and is not legal advice.",
};
const VERBOTEN = ["konform", "conform", "compliant", "compliance", "garantiert barrierefrei", "guaranteed accessib",
  "fully accessible", "100% barrierefrei", "100% accessible", "siegel", "seal of", "gütesiegel", "zertifiziert", "certified"];

function kurz(over = {}) {
  return Object.assign({
    scanId: ID,
    url: "https://example.com/",
    status: "fertig",
    nichtMessbarGrund: null,
    verstoesseJeSchwere: { kritisch: 2, ernst: 5, mittel: 1, gering: 0 },
    zuPruefen: 3,
    top3: [
      { regelId: "image-alt", quelle: "axe", wcag: ["1.1.1"], schwere: "kritisch", titel: "Images must have alternative text", anzahl: 2 },
      { regelId: "color-contrast", quelle: "axe", wcag: ["1.4.3"], schwere: "ernst", titel: "Elements must meet minimum color contrast ratio thresholds", anzahl: 4 },
      { regelId: "motion-pause", quelle: "motion", wcag: ["2.2.2"], schwere: "ernst", titel: "Moving content needs a pause control", anzahl: 1 },
    ],
    hinweis: HINWEIS.en,
    vollerBericht: { paket: "check", kaufUrl: "https://motionspec.dev/pricing?scan=" + ID + "&url=https%3A%2F%2Fexample.com%2F&lang=en" },
  }, over);
}
function antwort(status, kurzergebnis, scanOver = {}) {
  return { scan: Object.assign({ id: ID, art: "gratis", quelle: "mcp", status, sprache: "en", zielUrl: "https://example.com/",
    nichtMessbarGrund: null, fehlerCode: null, kontoId: null, kaufId: null, browserMs: 1234 }, scanOver), kurzergebnis };
}

/* Fake-Scanner: anlegen/lesen werden protokolliert, Antworten kommen aus Listen. */
function fakeClient({ anlegen, lesen } = {}) {
  const calls = { anlegen: [], lesen: [] };
  const lesenListe = Array.isArray(lesen) ? lesen.slice() : null;
  return {
    calls,
    client: {
      async anlegen(body) {
        calls.anlegen.push(body);
        if (typeof anlegen === "function") return anlegen(body);
        return anlegen || { status: 202, daten: { id: ID, status: "wartend", links: { self: "/v1/scans/" + ID } }, retryAfter: null };
      },
      async lesen(id) {
        calls.lesen.push(id);
        if (typeof lesen === "function") return lesen(id);
        const next = lesenListe && lesenListe.length > 1 ? lesenListe.shift() : (lesenListe ? lesenListe[0] : null);
        return next || { status: 200, daten: antwort("fertig", kurz()), retryAfter: null };
      },
    },
  };
}

async function withScan(scanSite, run, extra = {}) {
  const server = new McpServer({ name: "scan-site-test", version: "1.0.0" });
  const client = new Client({ name: "scan-site-client", version: "1.0.0" });
  const events = [];
  scan.registerScanSite(server, Object.assign({ scanSite, log: (e) => events.push(e) }, extra));
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st);
  await client.connect(ct);
  try { await run(client, events); } finally { await client.close(); await server.close(); }
}
const call = (c, args) => c.callTool({ name: "scan_site", arguments: args });
const fast = (o) => Object.assign({ schlafen: async () => {}, wartenMs: 0, intervallMs: 0 }, o);

function assertNoForbidden(s, where) {
  const low = String(s).toLowerCase();
  for (const w of VERBOTEN) assert.equal(low.includes(w), false, where + " contains forbidden wording: " + w);
}

test("scan_site: not registered without deps.scanSite, or when `only` leaves it out", async () => {
  const catalog = loadCatalog();
  for (const deps of [{}, { only: ["motion_catalog"], scanSite: { client: null, grund: "local" } }]) {
    const server = new McpServer({ name: "t", version: "1" });
    const client = new Client({ name: "c", version: "1" });
    registerMotionspecTools(server, Object.assign({ getCatalog: () => catalog, getCatVer: () => catalogVersion(catalog) }, deps));
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st); await client.connect(ct);
    const { tools } = await client.listTools();
    assert.equal(tools.some((t) => t.name === "scan_site"), false);
    await client.close(); await server.close();
  }
  assert.equal(scan.registerScanSite(new McpServer({ name: "t", version: "1" }), {}), false);
});

test("scan_site: registered through registerMotionspecTools when `only` lists it", async () => {
  const catalog = loadCatalog();
  const server = new McpServer({ name: "t", version: "1" });
  const client = new Client({ name: "c", version: "1" });
  const { client: fake } = fakeClient();
  registerMotionspecTools(server, { getCatalog: () => catalog, getCatVer: () => catalogVersion(catalog),
    only: ["motion_catalog", "scan_site"], scanSite: fast({ client: fake }) });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st); await client.connect(ct);
  const { tools } = await client.listTools();
  const tool = tools.find((t) => t.name === "scan_site");
  assert.ok(tool);
  assert.equal(tool.annotations.openWorldHint, true);
  assert.equal(tool.annotations.readOnlyHint, false);
  assert.deepEqual(tool.inputSchema.required || [], []);
  const r = await call(client, { url: "https://example.com/" });
  assert.equal(r.structuredContent.ok, true);
  await client.close(); await server.close();
});

test("scan_site local (npm/stdio): HOSTED_ONLY notice, no work, describes itself as access information", async () => {
  await withScan({ client: null, grund: "local" }, async (c, events) => {
    const { tools } = await c.listTools();
    const tool = tools[0];
    assert.match(tool.description, /hosted MotionSpec endpoint only/);
    assert.match(tool.description, /does not fetch URLs or run a scan/);
    assert.equal(tool.annotations.openWorldHint, false);
    for (const args of [{}, { url: "https://example.com/" }, { scanId: ID }]) {
      const r = await call(c, args);
      assert.equal(r.isError, true);
      assert.equal(r.structuredContent.error, "HOSTED_ONLY");
      assert.equal(r.structuredContent.hostedEndpoint, scan.HOSTED_MCP_URL);
      assert.match(r.content[0].text, /claude mcp add --transport http motionspec https:\/\/api\.motionspec\.dev\/mcp/);
      assert.match(r.content[0].text, /motion_audit runs locally/);
    }
    assert.equal(events[0].outcome, "mcp-scan-unavailable");
    assert.equal(events[0].reason, "local");
  });
});

test("scan_site unconfigured (endpoint not connected): SCAN_UNAVAILABLE, telemetry names the missing parts only", async () => {
  await withScan({ client: null, grund: "unconfigured", fehlt: ["SCAN", "SCAN_KANAL_SCHLUESSEL", "bad value!"] }, async (c, events) => {
    const r = await call(c, { url: "https://example.com/" });
    assert.equal(r.isError, true);
    assert.equal(r.structuredContent.error, "SCAN_UNAVAILABLE");
    assert.match(r.content[0].text, /not connected to the MotionSpec scanner/);
    assert.doesNotMatch(JSON.stringify(r), /SCAN_KANAL_SCHLUESSEL/, "the caller never learns secret names");
    assert.equal(events[0].reason, "unconfigured:SCAN,SCAN_KANAL_SCHLUESSEL");
  });
});

test("scan_site: start → finished — short result, notice verbatim, Website report link on motionspec.dev with src=mcp-scan_site", async () => {
  const f = fakeClient();
  let gebremst = 0;
  await withScan(fast({ client: f.client, bremse: async () => { gebremst++; return { ok: true }; } }), async (c, events) => {
    const r = await call(c, { url: " https://example.com/ " });
    assert.equal(r.isError, false);
    assert.deepEqual(f.calls.anlegen, [{ url: "https://example.com/", art: "gratis", sprache: "en", quelle: "mcp" }]);
    assert.equal(gebremst, 1);
    const sc = r.structuredContent;
    assert.equal(sc.ok, true);
    assert.equal(sc.done, true);
    assert.equal(sc.scanId, ID);
    assert.equal(sc.status, "fertig");
    assert.deepEqual(sc.kurzergebnis.verstoesseJeSchwere, { kritisch: 2, ernst: 5, mittel: 1, gering: 0 });
    assert.equal(sc.kurzergebnis.zuPruefen, 3);
    assert.equal(sc.kurzergebnis.top3.length, 3);
    assert.equal(sc.kurzergebnis.hinweis, HINWEIS.en);
    assert.deepEqual(Object.keys(sc.kurzergebnis).sort(), ["hinweis", "nichtMessbarGrund", "scanId", "status", "top3", "url", "verstoesseJeSchwere", "vollerBericht", "zuPruefen"]);
    const kauf = new URL(sc.kurzergebnis.vollerBericht.kaufUrl);
    assert.equal(kauf.origin, "https://motionspec.dev");
    assert.equal(kauf.searchParams.get("src"), "mcp-scan_site");
    assert.equal(kauf.searchParams.get("scan"), ID);
    assert.equal(sc.befunde, undefined, "never the full report");
    const t = r.content[0].text;
    assert.ok(t.includes(HINWEIS.en), "notice verbatim in the text");
    assert.match(t, /Violations by severity: critical 2 · serious 5 · moderate 1 · minor 0/);
    assert.match(t, /To review by hand: 3/);
    assert.match(t, /1\. \[critical\] Images must have alternative text \(image-alt, WCAG 1\.1\.1\) — 2×/);
    assert.match(t, /Full report with every finding and fix suggestions: Website report \(one website, up to 100 pages; EUR 13 \/ USD 13 excl\. VAT, B2B\): https:\/\/motionspec\.dev\//);
    assert.match(t, /The full report is released only after you verify the domain \(DNS TXT record or file\)\./);
    assert.ok(t.includes(sc.kurzergebnis.vollerBericht.kaufUrl));
    assert.match(t, /Do not open it yourself or attempt checkout/);
    assertNoForbidden(t, "result text");
    const outcomes = events.map((e) => e.outcome);
    assert.deepEqual(outcomes, ["mcp-scan-start", "mcp-scan-done"]);
    assert.doesNotMatch(JSON.stringify(events), /example\.com/, "no URL in telemetry");
  });
});

test("scan_site: German output when language is de; scanId reads use the scan's language", async () => {
  const f = fakeClient({ lesen: [{ status: 200, daten: antwort("fertig", kurz({ hinweis: HINWEIS.de }), { sprache: "de" }) }] });
  await withScan(fast({ client: f.client }), async (c) => {
    const r = await call(c, { url: "https://example.com/", language: "de" });
    assert.equal(f.calls.anlegen[0].sprache, "de");
    const t = r.content[0].text;
    assert.match(t, /Verstöße je Schwere: kritisch 2 · ernst 5 · mittel 1 · gering 0/);
    assert.match(t, /Voller Bericht mit allen Befunden und Korrekturvorschlägen: Website-Bericht \(eine Website, bis 100 Seiten; 13 € zzgl\. USt\., B2B\): https:\/\/motionspec\.dev\//);
    assert.match(t, /Den vollen Bericht gibt es erst nach dem Nachweis, dass die Domain Ihnen gehört \(DNS-TXT-Eintrag oder Datei\)\./);
    assert.ok(t.includes(HINWEIS.de));
    const r2 = await call(c, { scanId: ID, language: "en" });
    assert.match(r2.content[0].text, /Von Hand zu prüfen: 3/, "a read renders in the scan's own language");
    assertNoForbidden(t, "German text");
  });
});

test("scan_site: polls until finished (laeuft → laeuft → fertig) with the injected sleep", async () => {
  const f = fakeClient({ lesen: [
    { status: 200, daten: antwort("wartend", null) },
    { status: 200, daten: antwort("laeuft", null) },
    { status: 200, daten: antwort("fertig", kurz()) },
  ] });
  let geschlafen = 0;
  let t = 0;
  await withScan({ client: f.client, wartenMs: 25000, intervallMs: 3000, jetzt: () => t, schlafen: async (ms) => { geschlafen++; t += ms; } }, async (c) => {
    const r = await call(c, { url: "https://example.com/" });
    assert.equal(r.structuredContent.done, true);
    assert.equal(f.calls.lesen.length, 3);
    assert.equal(geschlafen, 2);
  });
});

test("scan_site: still running after the wait → done:false with the scanId to ask again; a read starts no new scan", async () => {
  const f = fakeClient({ lesen: () => ({ status: 200, daten: antwort("laeuft", null) }) });
  let t = 0;
  await withScan({ client: f.client, wartenMs: 9000, intervallMs: 3000, jetzt: () => t, schlafen: async (ms) => { t += ms; } }, async (c) => {
    const r = await call(c, { url: "https://example.com/" });
    assert.equal(r.isError, false);
    assert.equal(r.structuredContent.done, false);
    assert.equal(r.structuredContent.status, "laeuft");
    assert.deepEqual(r.structuredContent.next, { tool: "scan_site", arguments: { scanId: ID } });
    assert.ok(r.content[0].text.includes(JSON.stringify({ scanId: ID })));
    assert.equal(r.structuredContent.kurzergebnis, undefined, "no numbers while running");
    assert.equal(f.calls.lesen.length, 4);
    t = 0;
    const r2 = await call(c, { scanId: ID });
    assert.equal(r2.structuredContent.done, false);
    assert.equal(f.calls.anlegen.length, 1, "scanId never starts a scan");
  });
});

test("scan_site: input rules — exactly one of url/scanId; bad url and bad scanId never reach the brake or the scanner", async () => {
  const f = fakeClient();
  let gebremst = 0;
  await withScan(fast({ client: f.client, bremse: async () => { gebremst++; return { ok: true }; } }), async (c) => {
    for (const args of [{}, { url: "https://a.example/", scanId: ID }, { url: "  " }]) {
      const r = await call(c, args);
      assert.equal(r.isError, true);
      assert.equal(r.structuredContent.error, "eingabe");
    }
    for (const url of ["ftp://example.com/", "https://localhost/", "https://user:pw@example.com/", "notaurl", "https://" + "a".repeat(2040) + ".com/"]) {
      const r = await call(c, { url: url.slice(0, 2048) });
      assert.equal(r.structuredContent.error, "ungueltige_url", url.slice(0, 40));
    }
    const r = await call(c, { scanId: "scn_lower0000000000000000000000" });
    assert.equal(r.structuredContent.error, "nicht_gefunden");
    assert.equal(gebremst, 0);
    assert.equal(f.calls.anlegen.length + f.calls.lesen.length, 0);
  });
});

test("scan_site: brake says no (or throws) → limit_erreicht with Retry-After, the scanner is never called", async () => {
  for (const bremse of [async () => ({ ok: false, grund: "tag", retryAfter: "3600" }), async () => { throw new Error("x"); }]) {
    const f = fakeClient();
    await withScan(fast({ client: f.client, bremse }), async (c, events) => {
      const r = await call(c, { url: "https://example.com/" });
      assert.equal(r.isError, true);
      assert.equal(r.structuredContent.error, "limit_erreicht");
      assert.equal(f.calls.anlegen.length, 0);
      assert.equal(events[0].outcome, "mcp-scan-limited");
    });
  }
  const f = fakeClient();
  await withScan(fast({ client: f.client, bremse: async () => ({ ok: false, grund: "tag", retryAfter: "3600" }) }), async (c) => {
    const r = await call(c, { url: "https://example.com/" });
    assert.equal(r.structuredContent.retryAfter, "3600");
    assert.match(r.content[0].text, /Retry-After: 3600/);
  });
});

test("scan_site: scanner errors map to safe codes; own configuration errors never leak", async () => {
  const cases = [
    [{ status: 400, daten: { fehler: "ungueltige_url", nachricht: "Die Domain wurde nicht gefunden." } }, "ungueltige_url", /Die Domain wurde nicht gefunden/],
    [{ status: 400, daten: { fehler: "url_nicht_erlaubt", nachricht: "Die Domain zeigt auf eine private Adresse." } }, "url_nicht_erlaubt", /private Adresse/],
    [{ status: 429, daten: { fehler: "limit_erreicht", nachricht: "x" }, retryAfter: "120" }, "limit_erreicht", /Retry-After: 120/],
    [{ status: 503, daten: { fehler: "kostenbremse", nachricht: "x" }, retryAfter: "999" }, "kostenbremse", /No free scans are left today/],
    [{ status: 401, daten: { fehler: "nicht_angemeldet", nachricht: "API-Schlüssel ungültig oder widerrufen." } }, "intern", /not reachable/],
    [{ status: 403, daten: { fehler: "kein_zugriff", nachricht: "Über den Kanal gibt es nur den Gratis-Check." } }, "intern", /not reachable/],
    [{ status: 500, daten: { fehler: "erfunden" } }, "intern", /not reachable/],
    [{ status: 400, daten: { fehler: "ungueltige_anfrage", nachricht: "Feld fehlt." } }, "intern", /not reachable/],
    [{ status: 202, daten: { id: "nope" } }, "intern", /not reachable/],
    [() => { throw new Error("network"); }, "intern", /not reachable/],
    [null, "intern", /not reachable/],
  ];
  for (const [anlegen, code, re] of cases) {
    const f = fakeClient({ anlegen: typeof anlegen === "function" ? anlegen : () => anlegen });
    await withScan(fast({ client: f.client }), async (c) => {
      const r = await call(c, { url: "https://example.com/" });
      assert.equal(r.isError, true);
      assert.equal(r.structuredContent.error, code);
      assert.match(r.content[0].text, re);
      assert.doesNotMatch(JSON.stringify(r), /Schlüssel|Kanal/, "no internal detail");
      assert.equal(f.calls.lesen.length, 0);
    });
  }
  const f = fakeClient({ lesen: () => ({ status: 404, daten: { fehler: "nicht_gefunden", nachricht: "Scan nicht gefunden." } }) });
  await withScan(fast({ client: f.client }), async (c) => {
    const r = await call(c, { scanId: ID2 });
    assert.equal(r.structuredContent.error, "nicht_gefunden");
    assert.deepEqual(f.calls.lesen, [ID2]);
  });
});

test("scan_site: 'nicht messbar' is never shown as clean — no counts, no offer, reason and notice shown", async () => {
  const k = kurz({ status: "nicht_messbar", nichtMessbarGrund: "bot_schutz", verstoesseJeSchwere: { kritisch: 0, ernst: 0, mittel: 0, gering: 0 }, top3: [] });
  const f = fakeClient({ lesen: [{ status: 200, daten: antwort("nicht_messbar", k, { nichtMessbarGrund: "bot_schutz" }) }] });
  await withScan(fast({ client: f.client }), async (c) => {
    const r = await call(c, { url: "https://example.com/" });
    assert.equal(r.isError, false);
    const sc = r.structuredContent;
    assert.equal(sc.status, "nicht_messbar");
    assert.equal(sc.nichtMessbarGrund, "bot_schutz");
    assert.equal(sc.kurzergebnis, null, "no short result: zero counts could be read as clean");
    assert.doesNotMatch(JSON.stringify(sc), /verstoesseJeSchwere|zuPruefen|kaufUrl|vollerBericht/, "no counts, no purchase offer");
    assert.equal(sc.hinweis, HINWEIS.en);
    const t = r.content[0].text;
    assert.match(t, /not measurable \(reason: bot protection\)/);
    assert.match(t, /NOT a clean result/);
    assert.doesNotMatch(t, /Violations by severity|critical 0|No violation/);
    assert.ok(t.includes(HINWEIS.en));
  });
});

test("scan_site: 'nicht messbar' in German says 'KEIN sauberes Ergebnis', no counts", async () => {
  const k = kurz({ status: "nicht_messbar", nichtMessbarGrund: "anmeldung_noetig", verstoesseJeSchwere: { kritisch: 0, ernst: 0, mittel: 0, gering: 0 }, top3: [], hinweis: HINWEIS.de });
  const f = fakeClient({ lesen: [{ status: 200, daten: antwort("nicht_messbar", k, { nichtMessbarGrund: "anmeldung_noetig", sprache: "de" }) }] });
  await withScan(fast({ client: f.client }), async (c) => {
    const r = await call(c, { url: "https://example.com/", language: "de" });
    const t = r.content[0].text;
    assert.match(t, /Status: nicht messbar \(Grund: Anmeldung nötig\)\. Die Seite ließ sich nicht prüfen\. Das ist KEIN sauberes Ergebnis; es wurden keine Verstöße gezählt\./);
    assert.doesNotMatch(t, /Verstöße je Schwere|kritisch 0/);
    assert.ok(t.includes(HINWEIS.de));
    assert.equal(r.structuredContent.kurzergebnis, null);
  });
});

test("scan_site: status fehler, or 'fertig' without a short result, is an error — never a clean result", async () => {
  for (const daten of [antwort("fehler", null, { fehlerCode: "browser_absturz" }), antwort("fertig", null), antwort("unbekannt", null)]) {
    const f = fakeClient({ lesen: [{ status: 200, daten }] });
    await withScan(fast({ client: f.client }), async (c) => {
      const r = await call(c, { url: "https://example.com/" });
      assert.equal(r.isError, true);
      assert.equal(r.structuredContent.status, "fehler");
      assert.equal(r.structuredContent.error, "scan_fehler");
      assert.doesNotMatch(r.content[0].text, /Violations by severity/);
    });
  }
});

test("kuerzeKurzergebnis: contract fields only, capped texts, foreign purchase links dropped, notice fallback", () => {
  const roh = kurz({
    extra: "secret", befunde: [{}],
    top3: [{ regelId: "x".repeat(500), quelle: "evil", wcag: ["1.1.1", "x".repeat(50), 3, "a", "b", "c"], schwere: "katastrophal", titel: "t".repeat(900), anzahl: -4 },
      null, { regelId: "b" }, { regelId: "c" }],
    verstoesseJeSchwere: { kritisch: "7", ernst: -1, mittel: 2.9, gering: "x" },
    hinweis: "",
    vollerBericht: { paket: "check", kaufUrl: "https://buy.stripe.com/abc" },
  });
  const k = scan.kuerzeKurzergebnis(roh, "de");
  assert.equal(k.extra, undefined);
  assert.equal(k.befunde, undefined);
  assert.equal(k.top3.length, 3);
  assert.equal(k.top3[0].regelId.length, 100);
  assert.equal(k.top3[0].titel.length, 200);
  assert.equal(k.top3[0].quelle, "axe");
  assert.equal(k.top3[0].schwere, "mittel");
  assert.equal(k.top3[0].anzahl, 0);
  assert.equal(k.top3[0].wcag.length, 5);
  assert.equal(k.top3[1].regelId, "");
  assert.deepEqual(k.verstoesseJeSchwere, { kritisch: 7, ernst: 0, mittel: 2, gering: 0 });
  assert.equal(k.hinweis, HINWEIS.de, "fallback = contract text");
  assert.equal(k.vollerBericht, null, "Stripe or foreign links are never relayed");
  assert.equal(scan.kuerzeKurzergebnis(null), null);
  assert.equal(scan.kuerzeKurzergebnis(kurz({ hinweis: undefined }), "en").hinweis, HINWEIS.en);
  assert.equal(scan.kaufLink("http://motionspec.dev/pricing"), null);
  assert.equal(scan.kaufLink("https://motionspec.dev.evil.example/pricing"), null);
  assert.equal(scan.kaufLink("not a url"), null);
  assert.equal(scan.kaufLink(42), null);
  assert.equal(scan.kaufLink("https://motionspec.dev/pricing?src=other"), "https://motionspec.dev/pricing?src=mcp-scan_site");
  const a = scan.kuerzeAntwort({ scan: { id: ID, status: "kaputt", sprache: "xx", fehlerCode: "DROP TABLE" }, kurzergebnis: kurz() }, "de");
  assert.equal(a.status, "fertig", "unknown scan status falls back to the short result's status");
  assert.equal(a.sprache, "de");
  assert.equal(a.fehlerCode, null);
  assert.equal(scan.kuerzeAntwort(null).status, "fehler");
});

test("contract copies: lists and notice match the scan API contract 1.2.0", () => {
  assert.deepEqual(scan.SCHWEREGRADE, ["kritisch", "ernst", "mittel", "gering"]);
  assert.deepEqual(scan.SCAN_STATUS, ["wartend", "laeuft", "fertig", "nicht_messbar", "fehler"]);
  assert.deepEqual(scan.NICHT_MESSBAR_GRUENDE, ["bot_schutz", "zeitlimit", "http_fehler", "nicht_erreichbar", "anmeldung_noetig"]);
  assert.deepEqual(scan.API_FEHLER, ["ungueltige_anfrage", "ungueltige_url", "url_nicht_erlaubt", "nicht_angemeldet", "kein_zugriff", "limit_erreicht", "kostenbremse", "nicht_gefunden", "intern"]);
  assert.deepEqual({ ...scan.ABDECKUNGS_HINWEIS }, HINWEIS);
  assert.ok(scan.SCAN_ID_MUSTER.test(ID));
});

test("scan_site texts: no forbidden wording (contract VERBOTENE_AUSSAGEN) in descriptions or notices", async () => {
  for (const scanSite of [{ client: null, grund: "local" }, { client: null, grund: "unconfigured" }, fast({ client: fakeClient().client })]) {
    await withScan(scanSite, async (c) => {
      const { tools } = await c.listTools();
      assertNoForbidden(tools[0].description + tools[0].title + JSON.stringify(tools[0].inputSchema), "description");
      const r = await call(c, { url: "https://example.com/" });
      assertNoForbidden(r.content[0].text, "result");
    });
  }
});

test("scan_site: finished without violations says so — only for the rules checked automatically, notice still shown", async () => {
  const leer = kurz({ verstoesseJeSchwere: { kritisch: 0, ernst: 0, mittel: 0, gering: 0 }, zuPruefen: 0, top3: [] });
  const f = fakeClient({ lesen: [{ status: 200, daten: antwort("fertig", leer) }] });
  await withScan(fast({ client: f.client }), async (c) => {
    const r = await call(c, { url: "https://example.com/" });
    const t = r.content[0].text;
    assert.match(t, /No violation was found in the rules that can be checked automatically\./);
    assert.ok(t.includes(HINWEIS.en));
    const r2 = await call(c, { url: "https://example.com/", language: "de" });
    assert.match(r2.content[0].text, /In den automatisch prüfbaren Regeln wurde kein Verstoß gefunden\./);
  });
});

/* Website-Bericht: 13 €/13 USD, bis 100 Seiten, voller Bericht nach Domain-Nachweis. */
test("ANGEBOT: one place for name, scope, price and condition; no old price anywhere in texts or descriptions", async () => {
  assert.deepEqual(JSON.parse(JSON.stringify(scan.ANGEBOT)), {
    name: { de: "Website-Bericht", en: "Website report" },
    umfang: { de: "eine Website, bis 100 Seiten", en: "one website, up to 100 pages" },
    preis: { de: "13 € zzgl. USt., B2B", en: "EUR 13 / USD 13 excl. VAT, B2B" },
    nachweis: {
      de: "Den vollen Bericht gibt es erst nach dem Nachweis, dass die Domain Ihnen gehört (DNS-TXT-Eintrag oder Datei).",
      en: "The full report is released only after you verify the domain (DNS TXT record or file).",
    },
  });
  assert.ok(Object.isFrozen(scan.ANGEBOT) && Object.isFrozen(scan.ANGEBOT.preis));
  const texte = [];
  for (const scanSite of [{ client: null, grund: "local" }, { client: null, grund: "unconfigured" }, fast({ client: fakeClient().client })]) {
    await withScan(scanSite, async (c) => {
      const { tools } = await c.listTools();
      texte.push(tools[0].title, tools[0].description);
      for (const language of ["en", "de"]) texte.push((await call(c, { url: "https://example.com/", language })).content[0].text);
    });
  }
  const alles = texte.join("\n");
  assert.doesNotMatch(alles, /\b49\b|49-€|Check \(one URL\)|one public web page/, "no old price, no single-page claim");
  assert.match(alles, /EUR 13 \/ USD 13 excl\. VAT, B2B/);
  assert.match(alles, /the free scan covers a limited number of pages/, "free limit stated without a page count");
});
