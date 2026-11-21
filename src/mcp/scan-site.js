"use strict";
/*
 * scan-site — MCP-Tool `scan_site`: der Gratis-Check auf Barrieren (axe-core nach
 * WCAG 2.2 A/AA plus Motion-Modul) über die Scan-API von MotionSpec.
 *
 * Vertrag: Scan-API Version 1.2.0. Dieses Modul hängt nicht vom Vertragsquelltext ab:
 * die nötigen Wertelisten stehen unten als Kopie, test/scan-site.test.mjs hält sie fest.
 *
 * Laufzeitneutral wie register-tools.js: kein fetch, kein env, kein Node-Modul. Den Weg
 * zum Scanner bringt der Aufrufer mit (deps.scanSite):
 *   - gehosteter Endpunkt: { client, bremse } — client spricht mit dem Scanner, bremse
 *     ist die Ratenbremse je Nutzer/Schlüssel des Endpunkts;
 *   - Endpunkt ohne Verbindung zum Scanner: { client: null, grund: "unconfigured" } —
 *     klare Fehlermeldung statt Absturz;
 *   - lokaler stdio-Server (npm): { client: null, grund: "local" } — Hinweis auf den
 *     gehosteten Endpunkt. Begründung: einen Gratis-Scan gibt es nur über einen nicht
 *     öffentlichen Kanal des Scanners; eine öffentliche Route für Programme gibt es
 *     nicht, und ein Schlüssel im npm-Paket wäre öffentlich.
 *
 * Ausgabe: nur das Kurzergebnis (Zählung je Schwere, Top 3), der Hinweis auf
 * Teilabdeckung WÖRTLICH und der Link zum Website-Bericht (ANGEBOT). Kein voller Bericht.
 * „nicht messbar“ wird nie als sauber dargestellt: keine Zahlen, Status und Grund stehen da.
 */
const { z } = require("zod");

/* ── Wertelisten aus dem Vertrag der Scan-API 1.2.0 (Kopie, siehe Kopf) ───────── */
const SCHWEREGRADE = Object.freeze(["kritisch", "ernst", "mittel", "gering"]);
const SCAN_STATUS = Object.freeze(["wartend", "laeuft", "fertig", "nicht_messbar", "fehler"]);
const NICHT_MESSBAR_GRUENDE = Object.freeze(["bot_schutz", "zeitlimit", "http_fehler", "nicht_erreichbar", "anmeldung_noetig"]);
const BEFUND_QUELLEN = Object.freeze(["axe", "motion"]);
const API_FEHLER = Object.freeze(["ungueltige_anfrage", "ungueltige_url", "url_nicht_erlaubt", "nicht_angemeldet", "kein_zugriff",
  "limit_erreicht", "kostenbremse", "nicht_gefunden", "intern"]);
const SPRACHEN = Object.freeze(["de", "en"]);
/* ABDECKUNGS_HINWEIS — nur Ersatz, falls der Scanner keinen Hinweis mitschickt. */
const ABDECKUNGS_HINWEIS = Object.freeze({
  de: "Automatisierte Prüfung: Sie erkennt nur einen Teil der möglichen Barrieren nach WCAG 2.2 A/AA. "
    + "Viele Kriterien kann nur ein Mensch beurteilen. Das Ergebnis bestätigt keine Barrierefreiheit "
    + "und ist keine Rechtsberatung.",
  en: "Automated testing detects only part of the possible barriers under WCAG 2.2 A/AA. "
    + "Many criteria can only be judged by a person. The result does not confirm accessibility "
    + "and is not legal advice.",
});

const SCAN_ID_MUSTER = /^scn_[0-9A-HJKMNP-TV-Z]{26}$/;
const MAX_URL = 2048;
const TOOL = "scan_site";
const HOSTED_MCP_URL = "https://api.motionspec.dev/mcp";
const HOSTED_ADD_CMD = "claude mcp add --transport http motionspec " + HOSTED_MCP_URL;
/* Kauf-Link nur auf die eigene Website, nie direkt auf Stripe. */
const KAUF_HERKUNFT = "https://motionspec.dev";
/* Zuordnung im Funnel wie bei den übrigen Tools (reportUrlFor: src=mcp-<tool>). */
const KAUF_SRC = "mcp-" + TOOL;
/* Das Angebot zum vollen Bericht — die EINE Stelle für Name, Umfang, Preis und Bedingung
 * (Anzeige „13 € zzgl. USt.“ / „EUR 13 excl. VAT“; erst nachweisen, dann kaufen: ohne
 * bestätigten Domain-Nachweis kein Kauf). „verwalten/control“ statt „gehört Ihnen“.
 * Texte und Tool-Beschreibung setzen sich nur hieraus zusammen. */
const ANGEBOT = Object.freeze({
  name: Object.freeze({ de: "Website-Bericht", en: "Website report" }),
  umfang: Object.freeze({ de: "eine Website, bis 100 Seiten", en: "one website, up to 100 pages" }),
  preis: Object.freeze({ de: "13 € zzgl. USt., B2B", en: "EUR 13 / USD 13 excl. VAT, B2B" }),
  nachweis: Object.freeze({
    de: "Vor dem Kauf weisen Sie nach, dass Sie die Domain verwalten (DNS-TXT-Eintrag oder Datei). Den Website-Bericht gibt es nur für nachgewiesene Domains.",
    en: "Before purchase, you verify that you control the domain (DNS TXT record or file); the Website report is sold only for verified domains.",
  }),
});
/** „Website-Bericht (eine Website, bis 100 Seiten; 13 € zzgl. USt., B2B)“ */
function angebot(s) {
  return ANGEBOT.name[s] + " (" + ANGEBOT.umfang[s] + "; " + ANGEBOT.preis[s] + ")";
}

/* Warten im Aufruf: der Scanner prüft eine Seite meist in Sekunden; länger als
 * WARTEN_MS hält ein Tool-Aufruf nicht offen — dann kommt die scanId zum Nachfragen. */
const WARTEN_MS = 25000;
const INTERVALL_MS = 3000;

const SCHWERE_TEXT = Object.freeze({
  de: { kritisch: "kritisch", ernst: "ernst", mittel: "mittel", gering: "gering" },
  en: { kritisch: "critical", ernst: "serious", mittel: "moderate", gering: "minor" },
});
const GRUND_TEXT = Object.freeze({
  de: { bot_schutz: "Bot-Schutz", zeitlimit: "Zeitlimit", http_fehler: "HTTP-Fehler", nicht_erreichbar: "nicht erreichbar", anmeldung_noetig: "Anmeldung nötig" },
  en: { bot_schutz: "bot protection", zeitlimit: "timeout", http_fehler: "HTTP error", nicht_erreichbar: "not reachable", anmeldung_noetig: "login required" },
});

/* ── kleine Helfer ────────────────────────────────────────────────────────────── */
const zahl = (x) => (Number.isFinite(Number(x)) && Number(x) >= 0 ? Math.floor(Number(x)) : 0);
const text = (x, max) => (typeof x === "string" ? x.slice(0, max || 300) : "");
const sprachAus = (x, ersatz) => (SPRACHEN.includes(x) ? x : (ersatz || "en"));

/** Vorprüfung der Ziel-URL — die eigentliche Prüfung (DNS, private Adressen) macht der Scanner. */
function pruefeZielUrl(roh) {
  const s = typeof roh === "string" ? roh.trim() : "";
  if (!s || s.length > MAX_URL) return null;
  let u;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (u.username || u.password) return null;
  if (!u.hostname || !u.hostname.includes(".")) return null;
  return u.href;
}

/** Kauf-Link: nur https://motionspec.dev, mit Herkunft src=mcp-scan_site. */
function kaufLink(roh) {
  if (typeof roh !== "string" || roh.length > MAX_URL + 400) return null;
  let u;
  try { u = new URL(roh); } catch { return null; }
  if (u.origin !== KAUF_HERKUNFT) return null;
  u.searchParams.set("src", KAUF_SRC);
  return u.toString();
}

/**
 * Kürzt das Kurzergebnis des Scanners auf die Felder des Vertrags (Kurzergebnis).
 * Alles, was der Scanner sonst schickt, fällt weg; Texte sind gedeckelt.
 */
function kuerzeKurzergebnis(k, sprache) {
  if (!k || typeof k !== "object") return null;
  const je = {};
  for (const s of SCHWEREGRADE) je[s] = zahl(k.verstoesseJeSchwere && k.verstoesseJeSchwere[s]);
  const status = SCAN_STATUS.includes(k.status) ? k.status : "fehler";
  const hinweis = text(k.hinweis, 600) || ABDECKUNGS_HINWEIS[sprachAus(sprache)];
  const link = k.vollerBericht && typeof k.vollerBericht === "object" ? kaufLink(k.vollerBericht.kaufUrl) : null;
  return {
    scanId: text(k.scanId, 64),
    url: text(k.url, MAX_URL),
    status,
    nichtMessbarGrund: NICHT_MESSBAR_GRUENDE.includes(k.nichtMessbarGrund) ? k.nichtMessbarGrund : null,
    verstoesseJeSchwere: je,
    zuPruefen: zahl(k.zuPruefen),
    top3: (Array.isArray(k.top3) ? k.top3 : []).slice(0, 3).map((e) => ({
      regelId: text(e && e.regelId, 100),
      quelle: BEFUND_QUELLEN.includes(e && e.quelle) ? e.quelle : "axe",
      wcag: Array.isArray(e && e.wcag) ? e.wcag.slice(0, 5).map((w) => text(w, 12)) : [],
      schwere: SCHWEREGRADE.includes(e && e.schwere) ? e.schwere : "mittel",
      titel: text(e && e.titel, 200),
      anzahl: zahl(e && e.anzahl),
    })),
    hinweis,
    /* Ein Kaufangebot nur für einen fertigen Scan — der Scanner hält das genauso. */
    vollerBericht: status === "fertig" && link ? { paket: "check", kaufUrl: link } : null,
  };
}

/** Status und Sprache aus GET /v1/scans/:id (ScanAntwort) — sonst nichts vom Scan-Objekt. */
function kuerzeAntwort(a, spracheErsatz) {
  const scan = a && a.scan && typeof a.scan === "object" ? a.scan : {};
  const sprache = sprachAus(scan.sprache, spracheErsatz);
  const kurz = kuerzeKurzergebnis(a && a.kurzergebnis, sprache);
  const status = SCAN_STATUS.includes(scan.status) ? scan.status : (kurz ? kurz.status : "fehler");
  return {
    id: text(scan.id, 64),
    status,
    sprache,
    url: text(scan.zielUrl, MAX_URL) || (kurz ? kurz.url : ""),
    nichtMessbarGrund: NICHT_MESSBAR_GRUENDE.includes(scan.nichtMessbarGrund) ? scan.nichtMessbarGrund : (kurz ? kurz.nichtMessbarGrund : null),
    fehlerCode: /^[a-z0-9_]{1,40}$/.test(scan.fehlerCode || "") ? scan.fehlerCode : null,
    kurzergebnis: kurz,
  };
}

/* ── Texte ────────────────────────────────────────────────────────────────────── */
const FOR_AGENTS = {
  de: "Für Agenten: Den Link an einen Menschen weitergeben. Nicht selbst öffnen und keinen Kauf versuchen.",
  en: "For agents: relay this link to a human. Do not open it yourself or attempt checkout.",
};

function textFertig(r, s) {
  const k = r.kurzergebnis;
  const t = SCHWERE_TEXT[s];
  const zeilen = [];
  zeilen.push(s === "de" ? "MotionSpec Barrierefreiheits-Check (Gratis) — " + k.url : "MotionSpec accessibility scan (free) — " + k.url);
  zeilen.push(s === "de" ? "Status: fertig" : "Status: finished");
  const je = SCHWEREGRADE.map((g) => t[g] + " " + k.verstoesseJeSchwere[g]).join(" · ");
  zeilen.push((s === "de" ? "Verstöße je Schwere: " : "Violations by severity: ") + je);
  zeilen.push((s === "de" ? "Von Hand zu prüfen: " : "To review by hand: ") + k.zuPruefen);
  if (k.top3.length) {
    zeilen.push(s === "de" ? "Top 3:" : "Top 3:");
    k.top3.forEach((e, i) => {
      const wcag = e.wcag.length ? ", WCAG " + e.wcag.join(", ") : "";
      zeilen.push((i + 1) + ". [" + t[e.schwere] + "] " + (e.titel || e.regelId) + " (" + e.regelId + wcag + ") — " + e.anzahl + "×");
    });
  } else {
    zeilen.push(s === "de"
      ? "In den automatisch prüfbaren Regeln wurde kein Verstoß gefunden."
      : "No violation was found in the rules that can be checked automatically.");
  }
  zeilen.push("");
  zeilen.push(k.hinweis);
  if (k.vollerBericht) {
    zeilen.push("");
    zeilen.push(s === "de"
      ? "Voller Bericht mit allen Befunden und Korrekturvorschlägen: " + angebot(s) + ": " + k.vollerBericht.kaufUrl
      : "Full report with every finding and fix suggestions: " + angebot(s) + ": " + k.vollerBericht.kaufUrl);
    zeilen.push(ANGEBOT.nachweis[s]);
    zeilen.push(FOR_AGENTS[s]);
  }
  return zeilen.join("\n");
}

function textNichtMessbar(r, s) {
  const grund = r.nichtMessbarGrund ? GRUND_TEXT[s][r.nichtMessbarGrund] : (s === "de" ? "unbekannt" : "unknown");
  const k = r.kurzergebnis;
  return [
    (s === "de" ? "MotionSpec Barrierefreiheits-Check (Gratis) — " : "MotionSpec accessibility scan (free) — ") + r.url,
    s === "de"
      ? "Status: nicht messbar (Grund: " + grund + "). Die Seite ließ sich nicht prüfen. Das ist KEIN sauberes Ergebnis; es wurden keine Verstöße gezählt."
      : "Status: not measurable (reason: " + grund + "). The page could not be checked. This is NOT a clean result; no violations were counted.",
    "",
    k ? k.hinweis : ABDECKUNGS_HINWEIS[s],
  ].join("\n");
}

function textLaeuft(r, s) {
  const naechster = JSON.stringify({ scanId: r.id });
  return s === "de"
    ? "Der Scan läuft noch (Status: " + r.status + "). Rufe scan_site in etwa 15 Sekunden erneut mit " + naechster + " auf, um das Ergebnis zu holen. Dabei startet kein neuer Scan."
    : "The scan is still running (status: " + r.status + "). Call scan_site again in about 15 seconds with " + naechster + " to get the result. That does not start a new scan.";
}

const FEHLER_TEXT = {
  de: {
    ungueltige_url: "Bitte eine vollständige öffentliche http(s)-Adresse angeben, z. B. https://www.beispiel.de.",
    limit_erreicht: "Die Gratis-Scans sind für jetzt aufgebraucht. Bitte später erneut versuchen.",
    kostenbremse: "Heute sind keine Gratis-Scans mehr frei. Bitte morgen erneut versuchen.",
    nicht_gefunden: "Dieser Scan wurde nicht gefunden.",
    intern: "Der Prüfdienst ist gerade nicht erreichbar. Bitte später erneut versuchen.",
    eingabe: "Genau eines von beiden angeben: url (neuer Scan) oder scanId (Ergebnis eines früheren Scans).",
    fehler: "Der Scan ist fehlgeschlagen. Bitte später erneut versuchen.",
  },
  en: {
    ungueltige_url: "Please pass a full public http(s) address, e.g. https://www.example.com.",
    limit_erreicht: "The free scans are used up for now. Please try again later.",
    kostenbremse: "No free scans are left today. Please try again tomorrow.",
    nicht_gefunden: "This scan was not found.",
    intern: "The scanning service is not reachable right now. Please try again later.",
    eingabe: "Pass exactly one of: url (starts a new scan) or scanId (result of an earlier scan).",
    fehler: "The scan failed. Please try again later.",
  },
};

/* Was der Aufrufer vom Scanner erfahren darf. nicht_angemeldet/kein_zugriff/intern sind
 * ein Konfigurationsfehler des Endpunkts → „intern“; ebenso ungueltige_anfrage (Vertrag
 * 1.2.0): den Körper baut dieses Modul, nicht der Aufrufer. */
const AN_AUFRUFER = ["ungueltige_url", "url_nicht_erlaubt", "limit_erreicht", "kostenbremse", "nicht_gefunden"];

function ergebnis(out, txt, isError) {
  return { content: [{ type: "text", text: txt }], structuredContent: out, isError: !!isError };
}

function fehlerErgebnis(code, s, nachricht, retryAfter) {
  const out = { ok: false, tool: TOOL, error: code, message: nachricht || FEHLER_TEXT[s][code] || FEHLER_TEXT[s].intern };
  if (retryAfter) out.retryAfter = retryAfter;
  const txt = out.message + (retryAfter ? " (Retry-After: " + retryAfter + ")" : "");
  return ergebnis(out, txt, true);
}

/** Antwort des Scanners (status, daten, retryAfter) → Fehlerergebnis. */
function apiFehler(antwort, s) {
  const d = antwort && antwort.daten;
  const roh = d && API_FEHLER.includes(d.fehler) ? d.fehler : "intern";
  const code = AN_AUFRUFER.includes(roh) ? roh : "intern";
  const ra = antwort && typeof antwort.retryAfter === "string" && /^[0-9A-Za-z ,:]{1,40}$/.test(antwort.retryAfter) ? antwort.retryAfter : null;
  /* Die Meldung des Scanners ist für Eingabefehler hilfreich (z. B. „Domain nicht gefunden“). */
  const nachricht = (code === "ungueltige_url" || code === "url_nicht_erlaubt") ? (text(d && d.nachricht, 300) || null) : null;
  return fehlerErgebnis(code, s, nachricht, (code === "limit_erreicht" || code === "kostenbremse") ? ra : null);
}

/** Endergebnis eines Scans (fertig, nicht messbar, fehler) oder Zwischenstand. */
function scanErgebnis(r, s) {
  if (r.status === "fertig" && r.kurzergebnis) {
    const out = { ok: true, tool: TOOL, done: true, scanId: r.id, status: r.status, kurzergebnis: r.kurzergebnis };
    return ergebnis(out, textFertig(r, s), false);
  }
  if (r.status === "nicht_messbar") {
    /* kurzergebnis: null — die Nullen in verstoesseJeSchwere könnte ein Agent als „sauber“
     * lesen. Es bleiben Status, Grund und der Hinweis. */
    const out = { ok: true, tool: TOOL, done: true, scanId: r.id, status: r.status, nichtMessbarGrund: r.nichtMessbarGrund,
      kurzergebnis: null, hinweis: r.kurzergebnis ? r.kurzergebnis.hinweis : ABDECKUNGS_HINWEIS[s] };
    return ergebnis(out, textNichtMessbar(r, s), false);
  }
  if (r.status === "wartend" || r.status === "laeuft") {
    const out = { ok: true, tool: TOOL, done: false, scanId: r.id, status: r.status, next: { tool: TOOL, arguments: { scanId: r.id } } };
    return ergebnis(out, textLaeuft(r, s), false);
  }
  /* fehler — oder „fertig“ ohne Kurzergebnis: nie als sauber zeigen. */
  const out = { ok: false, tool: TOOL, done: true, scanId: r.id, status: "fehler", error: "scan_fehler",
    fehlerCode: r.fehlerCode, message: FEHLER_TEXT[s].fehler };
  return ergebnis(out, FEHLER_TEXT[s].fehler + (r.fehlerCode ? " (" + r.fehlerCode + ")" : ""), true);
}

/* ── Beschreibungen ───────────────────────────────────────────────────────────── */
const DESCRIPTION =
  "Free accessibility scan starting from one public URL (the free scan covers a limited number of pages): the MotionSpec " +
  "scanner loads the pages in a real browser and checks them with axe-core against WCAG 2.2 A/AA plus a motion module " +
  "(WCAG 2.2.2). Returns the short result only: violations " +
  "counted by severity (critical, serious, moderate, minor), the number of findings to review by hand, the top 3 rules, " +
  "the coverage notice (relay it verbatim: automated testing finds only part of the possible barriers) and a link to " +
  "the full report for a human to open: the " + angebot("en") + ". " + ANGEBOT.nachweis.en + " Pass `url` to start a scan; " +
  "it usually finishes within the call. If it is still running, the result carries `done:false` and a `scanId` — call " +
  "scan_site again with that `scanId` (no new scan). Status 'nicht_messbar' (not measurable: bot protection, login, " +
  "timeout) is NOT a clean result. Free scans are rate-limited per caller and per day. Returns structuredContent " +
  "{ok, done, scanId, status, kurzergebnis} or {ok:false, error, message} with isError:true.";

function stubDescription(grund) {
  return (grund === "local"
    ? "Runs on the hosted MotionSpec endpoint only (" + HOSTED_MCP_URL + "): the scan needs the MotionSpec scanner with a real browser, which this local server does not have. "
    : "Not connected to the MotionSpec scanner on this endpoint yet. ") +
    "This call returns access information only; it does not fetch URLs or run a scan. Arguments are optional and unused. " +
    "Returns isError:true with structuredContent {ok:false, error, tool, message}.";
}

function stubErgebnis(grund) {
  if (grund === "local") {
    const message = "scan_site runs on the hosted MotionSpec endpoint only: the scan needs the MotionSpec scanner with a real browser, " +
      "which the npm package does not ship. Add the hosted server with '" + HOSTED_ADD_CMD + "'. " +
      "For motion only, motion_audit runs locally for free (static CSS check, WCAG 2.2.2/2.3.3).";
    return ergebnis({ ok: false, tool: TOOL, error: "HOSTED_ONLY", hostedEndpoint: HOSTED_MCP_URL, message }, message, true);
  }
  const message = "scan_site is not connected to the MotionSpec scanner on this endpoint yet. Please try again later. " +
    "For motion only, motion_audit works now.";
  return ergebnis({ ok: false, tool: TOOL, error: "SCAN_UNAVAILABLE", message }, message, true);
}

const INPUT_SCHEMA = {
  url: z.string().max(MAX_URL).optional().describe("Public http(s) URL of the page to scan. Starts a new free scan."),
  scanId: z.string().max(64).optional().describe("ID (scn_…) from an earlier scan_site call: returns that scan's result instead of starting a new scan."),
  language: z.enum(["de", "en"]).optional().describe("Language of rule titles and the coverage notice: 'en' (default) or 'de'."),
};

/* ── Registrierung ────────────────────────────────────────────────────────────── */
/**
 * Registriert scan_site, wenn deps.scanSite gesetzt ist (sonst nichts — bestehende
 * Aufrufer bleiben unverändert). deps.scanSite:
 *   { client: { anlegen(body), lesen(id) } → Promise<{status, daten, retryAfter}>,
 *     bremse?: () => Promise<{ok:true} | {ok:false, retryAfter?:string}>,
 *     wartenMs?, intervallMs?, schlafen?(ms), jetzt?() }        — echter Scan
 *   { client: null, grund: "local" | "unconfigured" }            — Hinweis, keine Arbeit
 * deps.log(event) (optional): Telemetrie ohne URL, ohne IP, ohne Schlüssel.
 */
function registerScanSite(server, deps) {
  const cfg = deps && deps.scanSite;
  if (!cfg) return false;
  const log = (event) => { try { if (deps.log) deps.log(event); } catch { /* Telemetrie bricht nie einen Aufruf */ } };

  if (!cfg.client) {
    const grund = cfg.grund === "local" ? "local" : "unconfigured";
    server.registerTool(TOOL, {
      title: "Free accessibility scan of a website (WCAG 2.2 A/AA)",
      description: stubDescription(grund),
      inputSchema: { url: INPUT_SCHEMA.url, scanId: INPUT_SCHEMA.scanId, language: INPUT_SCHEMA.language },
      annotations: { readOnlyHint: true, openWorldHint: false },
    }, async () => {
      /* Nur Namen der fehlenden Teile, nie Werte. */
      const fehlt = Array.isArray(cfg.fehlt) ? cfg.fehlt.filter((n) => /^[A-Z_]{1,40}$/.test(n)).join(",") : "";
      log({ outcome: "mcp-scan-unavailable", tool: TOOL, model: "mcp-host", reason: fehlt ? grund + ":" + fehlt : grund, attempts: 0 });
      return stubErgebnis(grund);
    });
    return true;
  }

  const client = cfg.client;
  const wartenMs = Number.isFinite(cfg.wartenMs) ? cfg.wartenMs : WARTEN_MS;
  const intervallMs = Number.isFinite(cfg.intervallMs) ? cfg.intervallMs : INTERVALL_MS;
  const schlafen = cfg.schlafen || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const jetzt = cfg.jetzt || (() => Date.now());

  server.registerTool(TOOL, {
    title: "Free accessibility scan of a website (WCAG 2.2 A/AA)",
    description: DESCRIPTION,
    inputSchema: INPUT_SCHEMA,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, async (args) => {
    const a = args || {};
    const s = sprachAus(a.language);
    const hatUrl = typeof a.url === "string" && a.url.trim() !== "";
    const hatId = typeof a.scanId === "string" && a.scanId.trim() !== "";
    if (hatUrl === hatId) return fehlerErgebnis("eingabe", s);

    let id;
    if (hatUrl) {
      const ziel = pruefeZielUrl(a.url);
      if (!ziel) return fehlerErgebnis("ungueltige_url", s);
      /* Bremse VOR dem Scanner: kein Scan ohne Kontingent. */
      let b;
      try { b = cfg.bremse ? await cfg.bremse() : { ok: true }; } catch { b = { ok: false }; }
      if (!b || b.ok !== true) {
        log({ outcome: "mcp-scan-limited", tool: TOOL, model: "mcp-host", reason: (b && b.grund) || "bremse", attempts: 0 });
        return fehlerErgebnis("limit_erreicht", s, null, b && typeof b.retryAfter === "string" ? b.retryAfter : null);
      }
      let antwort;
      try { antwort = await client.anlegen({ url: ziel, art: "gratis", sprache: s, quelle: "mcp" }); } catch { antwort = null; }
      const d = antwort && antwort.daten;
      if (!antwort || antwort.status !== 202 || !d || !SCAN_ID_MUSTER.test(d.id || "")) {
        log({ outcome: "mcp-scan-fail", tool: TOOL, model: "mcp-host", reason: "anlegen-" + ((antwort && antwort.status) || 0), attempts: 1 });
        return apiFehler(antwort, s);
      }
      id = d.id;
      log({ outcome: "mcp-scan-start", tool: TOOL, model: "mcp-host", attempts: 1 });
    } else {
      id = a.scanId.trim();
      if (!SCAN_ID_MUSTER.test(id)) return fehlerErgebnis("nicht_gefunden", s);
    }

    /* Abfragen, bis der Scan fertig ist oder die Wartezeit um ist. */
    const ende = jetzt() + wartenMs;
    for (;;) {
      let antwort;
      try { antwort = await client.lesen(id); } catch { antwort = null; }
      if (!antwort || antwort.status !== 200 || !antwort.daten) {
        log({ outcome: "mcp-scan-fail", tool: TOOL, model: "mcp-host", reason: "lesen-" + ((antwort && antwort.status) || 0), attempts: 1 });
        return apiFehler(antwort, s);
      }
      const r = kuerzeAntwort(antwort.daten, s);
      if (!r.id) r.id = id;
      if (r.status !== "wartend" && r.status !== "laeuft") {
        log({ outcome: "mcp-scan-done", tool: TOOL, model: "mcp-host", reason: r.status, attempts: 1 });
        return scanErgebnis(r, hatId ? r.sprache : s);
      }
      if (jetzt() + intervallMs > ende) return scanErgebnis(r, hatId ? r.sprache : s);
      await schlafen(intervallMs);
    }
  });
  return true;
}

module.exports = {
  registerScanSite,
  kuerzeKurzergebnis,
  kuerzeAntwort,
  kaufLink,
  pruefeZielUrl,
  SCAN_SITE_TOOL: TOOL,
  ANGEBOT,
  SCAN_ID_MUSTER,
  ABDECKUNGS_HINWEIS,
  SCHWEREGRADE,
  SCAN_STATUS,
  NICHT_MESSBAR_GRUENDE,
  API_FEHLER,
  HOSTED_MCP_URL,
  WARTEN_MS,
  INTERVALL_MS,
};
