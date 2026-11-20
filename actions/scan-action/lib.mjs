/*
 * lib.mjs — Logik der GitHub Action „MotionSpec accessibility scan“ (ohne Abhängigkeiten).
 *
 * Ablauf: POST /v1/scans mit dem API-Schlüssel des Kunden (Bearer), art 'gratis',
 * quelle 'action' → GET /v1/scans/:id abfragen, bis der Scan nicht mehr wartet/läuft →
 * Kurzergebnis gegen den Schwellwert prüfen → Ausgaben, Job-Zusammenfassung, optional
 * ein PR-Kommentar → Exit-Code (0 bestanden, 1 sonst).
 *
 * Regeln: „nicht messbar“ ist nie bestanden-weil-sauber (Standard: Fehlschlag); der
 * Hinweis auf Teilabdeckung steht wörtlich in Zusammenfassung und Kommentar; der
 * API-Schlüssel erscheint nie in einer Ausgabe; der Kauf-Link nur auf motionspec.dev.
 * Alles, was nach außen geht (fetch, Dateien, Warten, Uhr), kommt über `io` — testbar.
 */

export const SCHWEREGRADE = ["kritisch", "ernst", "mittel", "gering"];
const SCHWERE_EN = { kritisch: "critical", ernst: "serious", mittel: "moderate", gering: "minor" };
const EN_ZU_SCHWERE = { critical: "kritisch", serious: "ernst", moderate: "mittel", minor: "gering" };
const SCHWERE_DE = { kritisch: "kritisch", ernst: "ernst", mittel: "mittel", gering: "gering" };
const ID_MUSTER = /^scn_[0-9A-HJKMNP-TV-Z]{26}$/;
const SCAN_STATUS = ["wartend", "laeuft", "fertig", "nicht_messbar", "fehler"];
export const KOMMENTAR_MARKE = "<!-- motionspec-scan-action -->";
const KAUF_HERKUNFT = "https://motionspec.dev";
/* Ersatz, falls die API keinen Hinweis mitschickt (Vertrag der Scan-API 1.1.0). */
export const ABDECKUNGS_HINWEIS = {
  de: "Automatisierte Prüfung: Sie erkennt nur einen Teil der möglichen Barrieren nach WCAG 2.2 A/AA. Viele Kriterien kann nur ein Mensch beurteilen. Das Ergebnis bestätigt keine Barrierefreiheit und ist keine Rechtsberatung.",
  en: "Automated testing detects only part of the possible barriers under WCAG 2.2 A/AA. Many criteria can only be judged by a person. The result does not confirm accessibility and is not legal advice.",
};

export class AktionFehler extends Error {}

/* ── Log-Sicherheit ───────────────────────────────────────────────────────── */
/* Der Runner liest jede stdout-Zeile, die mit "::" beginnt, als Workflow-Kommando
 * (::warning::, ::add-mask::, ::stop-commands:: …). Texte aus der API dürfen deshalb
 * weder eine neue Zeile beginnen noch eine Zeile mit "::" eröffnen. */
const ZWJ = "\u200d";
/** Text aus der API: eine Zeile, kein "::"-Anfang, gekappt. */
export function apiText(s, max = 300) {
  return String(s == null ? "" : s).slice(0, max).replace(/[\r\n\u2028\u2029]+/g, " ").replace(/::/g, ":" + ZWJ + ":");
}
/** Daten in einem eigenen Kommando (wie escapeData in @actions/core). */
export function kommandoDaten(s) {
  return String(s).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}
/** Freitext fürs Log: keine Zeile darf mit "::" beginnen. */
export function logText(s) {
  return String(s).split(/\r\n|\r|\n/).map((z) => (/^\s*::/.test(z) ? z.replace("::", ":" + ZWJ + ":") : z)).join("\n");
}
const kommando = (art, text) => "::" + art + "::" + kommandoDaten(text);

/* ── Eingaben ─────────────────────────────────────────────────────────────── */
/** Liest INPUT_* wie @actions/core (Name groß, Leerzeichen → _, Bindestrich bleibt). */
export function eingabe(env, name) {
  const v = env["INPUT_" + name.replace(/ /g, "_").toUpperCase()];
  return typeof v === "string" ? v.trim() : "";
}

function wahr(s, name) {
  if (s === "true") return true;
  if (s === "false") return false;
  throw new AktionFehler(`Input ${name} must be true or false.`);
}

function httpUrl(s, name, { nurHttpsAusserLokal } = {}) {
  let u;
  try { u = new URL(s); } catch { throw new AktionFehler(`Input ${name} must be a full http(s) URL.`); }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new AktionFehler(`Input ${name} must be a full http(s) URL.`);
  if (u.username || u.password) throw new AktionFehler(`Input ${name} must not contain credentials.`);
  if (nurHttpsAusserLokal && u.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)) {
    throw new AktionFehler(`Input ${name} must use https (http only for localhost).`);
  }
  return u;
}

export function leseEingaben(env) {
  const url = eingabe(env, "url");
  const apiKey = eingabe(env, "api-key");
  const apiUrl = eingabe(env, "api-url");
  if (!url) throw new AktionFehler("Input url is required.");
  if (!apiKey) throw new AktionFehler("Input api-key is required (MotionSpec API key; store it as a secret).");
  if (!apiUrl) throw new AktionFehler("Input api-url is required (base URL of the MotionSpec scan API).");
  const ziel = httpUrl(url, "url").href;
  /* Basis ohne /v1: wer ".../v1" einträgt, bekäme sonst Anfragen an /v1/v1/scans. */
  const basis = httpUrl(apiUrl, "api-url", { nurHttpsAusserLokal: true }).href.replace(/\/+$/, "").replace(/\/v1$/i, "");
  const sprache = eingabe(env, "language") || "en";
  if (sprache !== "en" && sprache !== "de") throw new AktionFehler("Input language must be en or de.");
  const failOn = (eingabe(env, "fail-on") || "serious").toLowerCase();
  if (failOn !== "none" && !EN_ZU_SCHWERE[failOn]) throw new AktionFehler("Input fail-on must be critical, serious, moderate, minor or none.");
  const maxRoh = eingabe(env, "max-violations") || "0";
  if (!/^\d{1,6}$/.test(maxRoh)) throw new AktionFehler("Input max-violations must be a whole number >= 0.");
  const tRoh = eingabe(env, "timeout-seconds") || "300";
  if (!/^\d{1,5}$/.test(tRoh) || Number(tRoh) < 10) throw new AktionFehler("Input timeout-seconds must be a whole number >= 10.");
  return {
    url: ziel,
    apiKey,
    apiUrl: basis,
    sprache,
    failOn,
    maxViolations: Number(maxRoh),
    failOnNotMeasurable: wahr(eingabe(env, "fail-on-not-measurable") || "true", "fail-on-not-measurable"),
    timeoutMs: Number(tRoh) * 1000,
    comment: wahr(eingabe(env, "comment") || "false", "comment"),
    githubToken: eingabe(env, "github-token"),
  };
}

/* ── Bewertung ────────────────────────────────────────────────────────────── */
/** Verstöße ab der Schwelle (einschließlich). failOn 'none' → 0. */
export function zaehleAbSchwelle(je, failOn) {
  if (failOn === "none") return 0;
  const grenze = SCHWEREGRADE.indexOf(EN_ZU_SCHWERE[failOn]);
  return SCHWEREGRADE.slice(0, grenze + 1).reduce((n, s) => n + (Number(je && je[s]) || 0), 0);
}

export function kaufLink(roh) {
  if (typeof roh !== "string") return null;
  let u;
  try { u = new URL(roh); } catch { return null; }
  if (u.origin !== KAUF_HERKUNFT) return null;
  u.searchParams.set("src", "scan-action");
  return u.toString();
}

/** Bewertet die ScanAntwort. result: passed | failed | not-measurable | error. */
export function bewerte(antwort, e) {
  const scan = (antwort && antwort.scan) || {};
  const k = (antwort && antwort.kurzergebnis) || null;
  const roh = typeof scan.status === "string" ? scan.status : (k && k.status);
  const status = SCAN_STATUS.includes(roh) ? roh : "fehler";
  const je = {};
  for (const s of SCHWEREGRADE) je[s] = k && k.verstoesseJeSchwere ? Math.max(0, Math.floor(Number(k.verstoesseJeSchwere[s]) || 0)) : 0;
  const basis = { status, je, zuPruefen: k ? Math.max(0, Math.floor(Number(k.zuPruefen) || 0)) : 0,
    top3: k && Array.isArray(k.top3) ? k.top3.slice(0, 3) : [],
    hinweis: (k && typeof k.hinweis === "string" && k.hinweis) || ABDECKUNGS_HINWEIS[e.sprache],
    kaufUrl: k && k.vollerBericht ? kaufLink(k.vollerBericht.kaufUrl) : null,
    nichtMessbarGrund: (k && k.nichtMessbarGrund) || scan.nichtMessbarGrund || null };
  if (status === "nicht_messbar") return { ...basis, result: "not-measurable", ueber: 0, kaufUrl: null, bestanden: !e.failOnNotMeasurable };
  if (status !== "fertig" || !k) return { ...basis, result: "error", ueber: 0, kaufUrl: null, bestanden: false };
  const ueber = zaehleAbSchwelle(je, e.failOn);
  const bestanden = ueber <= e.maxViolations;
  return { ...basis, result: bestanden ? "passed" : "failed", ueber, bestanden };
}

/* ── Markdown ─────────────────────────────────────────────────────────────── */
/* Text aus der API: HTML-Zeichen als Entitäten, Markdown-Zeichen mit Backslash, eine Zeile. */
/* @user und #123 bekommen einen Zero-Width-Joiner: keine Benachrichtigung, kein Verweis
 * im PR-Kommentar. */
const esc = (s) => apiText(s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/[|`[\]\\*_]/g, (c) => "\\" + c)
  .replace(/@(?=[A-Za-z0-9])/g, "@" + ZWJ).replace(/#(?=\d)/g, "#" + ZWJ);
/* Für Code-Spannen: dort wirkt kein Backslash, also nur Backticks, Zeilen und HTML weg. */
const code = (s) => apiText(s, 100).replace(/[`|]/g, "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const GRUND = {
  de: { bot_schutz: "Bot-Schutz", zeitlimit: "Zeitlimit", http_fehler: "HTTP-Fehler", nicht_erreichbar: "nicht erreichbar", anmeldung_noetig: "Anmeldung nötig" },
  en: { bot_schutz: "bot protection", zeitlimit: "timeout", http_fehler: "HTTP error", nicht_erreichbar: "not reachable", anmeldung_noetig: "login required" },
};

export function markdown(b, e, scanId) {
  const de = e.sprache === "de";
  const name = (s) => (de ? SCHWERE_DE[s] : SCHWERE_EN[s]);
  const z = [KOMMENTAR_MARKE, de ? "### MotionSpec Barrierefreiheits-Check" : "### MotionSpec accessibility scan", ""];
  z.push((de ? "Seite: " : "Page: ") + esc(e.url) + (scanId ? " · Scan `" + code(scanId) + "`" : ""));
  z.push("");
  if (b.result === "not-measurable") {
    z.push(de
      ? "**Nicht messbar** (Grund: " + (GRUND.de[b.nichtMessbarGrund] || "unbekannt") + "). Die Seite ließ sich nicht prüfen. Das ist kein sauberes Ergebnis."
      : "**Not measurable** (reason: " + (GRUND.en[b.nichtMessbarGrund] || "unknown") + "). The page could not be checked. This is not a clean result.");
  } else if (b.result === "error") {
    z.push(de ? "**Fehler:** Der Scan ist fehlgeschlagen." : "**Error:** the scan failed.");
  } else {
    z.push("| " + SCHWEREGRADE.map(name).join(" | ") + " | " + (de ? "von Hand prüfen" : "review by hand") + " |");
    z.push("|---|---|---|---|---|");
    z.push("| " + SCHWEREGRADE.map((s) => b.je[s]).join(" | ") + " | " + b.zuPruefen + " |");
    z.push("");
    const schwelle = e.failOn === "none" ? (de ? "keine" : "none") : name(EN_ZU_SCHWERE[e.failOn]);
    z.push((b.bestanden ? "✅ " : "❌ ") + (de
      ? `${b.ueber} Verstöße ab „${schwelle}“, erlaubt: ${e.maxViolations}.`
      : `${b.ueber} violations at or above "${schwelle}", allowed: ${e.maxViolations}.`));
    if (b.top3.length) {
      z.push("");
      z.push(de ? "**Top 3**" : "**Top 3**");
      b.top3.forEach((t, i) => {
        const wcag = Array.isArray(t.wcag) && t.wcag.length ? ", WCAG " + t.wcag.map(esc).join(", ") : "";
        z.push(`${i + 1}. [${name(SCHWEREGRADE.includes(t.schwere) ? t.schwere : "mittel")}] ${esc(t.titel || t.regelId)} (\`${code(t.regelId)}\`${wcag}) — ${Math.max(0, Math.floor(Number(t.anzahl) || 0))}×`);
      });
    }
  }
  z.push("");
  z.push("> " + esc(b.hinweis));
  if (b.kaufUrl) {
    /* Klammern im Link kodieren, damit ein Markdown-Link nicht aufgebrochen werden kann. */
    b = { ...b, kaufUrl: b.kaufUrl.replace(/[()[\]]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase()) };
    z.push("");
    z.push(de
      ? `Voller Bericht mit allen Befunden und Korrekturvorschlägen: [49-€-Check](${b.kaufUrl}) (49 € zzgl. USt., B2B).`
      : `Full report with every finding and fix suggestions: [49-€ Check](${b.kaufUrl}) (EUR 49 / USD 49 excl. VAT, B2B).`);
  }
  return z.join("\n");
}

/* ── API ──────────────────────────────────────────────────────────────────── */
async function api(io, e, methode, pfad, body) {
  const headers = { accept: "application/json", authorization: "Bearer " + e.apiKey, "user-agent": "motionspec-scan-action" };
  if (body) headers["content-type"] = "application/json";
  let r;
  try {
    r = await io.fetch(e.apiUrl + pfad, { method: methode, headers, body: body ? JSON.stringify(body) : undefined, redirect: "error" });
  } catch {
    return { status: 0, daten: null, retryAfter: null };
  }
  let daten;
  try { daten = await r.json(); } catch { daten = null; }
  const ra = r.headers && r.headers.get ? r.headers.get("retry-after") : null;
  return { status: r.status, daten, retryAfter: ra && /^[0-9A-Za-z ,:]{1,40}$/.test(ra) ? ra : null };
}

const API_TEXT = {
  ungueltige_url: "The scan API rejected the URL",
  url_nicht_erlaubt: "The scan API does not allow this URL (private or local address)",
  nicht_angemeldet: "The API key was not accepted (invalid or revoked)",
  kein_zugriff: "The API key has no access to this scan",
  nicht_gefunden: "The scan was not found",
  limit_erreicht: "The scan limit is reached",
  kostenbremse: "No scans are available today (daily budget)",
  intern: "The scan API reported an internal error",
};
function apiFehlerText(a, schritt) {
  if (!a || a.status === 0) return `${schritt}: the scan API is not reachable.`;
  const code = a.daten && typeof a.daten.fehler === "string" && API_TEXT[a.daten.fehler] ? a.daten.fehler : null;
  const nachricht = a.daten && typeof a.daten.nachricht === "string" ? " — " + apiText(a.daten.nachricht, 200) : "";
  return `${schritt}: ${code ? API_TEXT[code] : "unexpected answer"} (HTTP ${a.status}${code ? ", " + code : ""})${nachricht}` +
    (a.retryAfter ? ` Retry-After: ${a.retryAfter}.` : "");
}

/** Startet den Scan und wartet auf das Ergebnis. */
export async function scanne(io, e, intervallMs = 5000) {
  const a = await api(io, e, "POST", "/v1/scans", { url: e.url, art: "gratis", sprache: e.sprache, quelle: "action" });
  if (a.status !== 202 || !a.daten || !ID_MUSTER.test(a.daten.id || "")) throw new AktionFehler(apiFehlerText(a, "Starting the scan"));
  const id = a.daten.id;
  const ende = io.jetzt() + e.timeoutMs;
  let netzfehler = 0;
  for (;;) {
    const r = await api(io, e, "GET", "/v1/scans/" + id);
    if (r.status === 200 && r.daten && r.daten.scan) {
      netzfehler = 0;
      if (r.daten.scan.status !== "wartend" && r.daten.scan.status !== "laeuft") return { id, antwort: r.daten };
    } else if ((r.status === 0 || r.status >= 500) && ++netzfehler <= 3) {
      /* kurzer Aussetzer: weiter abfragen */
    } else {
      throw new AktionFehler(apiFehlerText(r, "Reading the result"));
    }
    if (io.jetzt() + intervallMs > ende) throw new AktionFehler(`The scan ${id} did not finish within ${Math.round(e.timeoutMs / 1000)} s.`);
    await io.schlafen(intervallMs);
  }
}

/* ── PR-Kommentar ─────────────────────────────────────────────────────────── */
export function prNummer(env, io) {
  if (!["pull_request", "pull_request_target"].includes(env.GITHUB_EVENT_NAME)) return null;
  try {
    const ev = JSON.parse(io.lies(env.GITHUB_EVENT_PATH));
    const n = ev && ev.pull_request && ev.pull_request.number;
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch { return null; }
}

export async function kommentiere(io, env, e, text) {
  const n = prNummer(env, io);
  if (!n) return "skipped: not a pull_request event";
  if (!e.githubToken) return "skipped: no github-token";
  const repo = env.GITHUB_REPOSITORY || "";
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return "skipped: GITHUB_REPOSITORY missing";
  const basis = (env.GITHUB_API_URL || "https://api.github.com").replace(/\/+$/, "");
  const headers = { accept: "application/vnd.github+json", authorization: "Bearer " + e.githubToken, "content-type": "application/json", "user-agent": "motionspec-scan-action", "x-github-api-version": "2022-11-28" };
  const liste = await io.fetch(`${basis}/repos/${repo}/issues/${n}/comments?per_page=100`, { headers });
  if (!liste.ok) return "failed: listing comments (HTTP " + liste.status + ")";
  const alt = (await liste.json()).find((c) => c && typeof c.body === "string" && c.body.startsWith(KOMMENTAR_MARKE));
  const ziel = alt ? `${basis}/repos/${repo}/issues/comments/${alt.id}` : `${basis}/repos/${repo}/issues/${n}/comments`;
  const r = await io.fetch(ziel, { method: alt ? "PATCH" : "POST", headers, body: JSON.stringify({ body: text }) });
  return r.ok ? (alt ? "updated" : "created") : "failed: HTTP " + r.status;
}

/* ── Ausgaben ─────────────────────────────────────────────────────────────── */
function setzeAusgaben(io, env, werte) {
  if (!env.GITHUB_OUTPUT) return;
  const zeilen = Object.entries(werte).map(([k, v]) => `${k}=${String(v == null ? "" : v).replace(/[\r\n]/g, " ")}`);
  io.anhaengen(env.GITHUB_OUTPUT, zeilen.join("\n") + "\n");
}

/** Gesamter Lauf. Gibt den Exit-Code zurück (0/1). */
export async function run(env, io) {
  /* Schlüssel sofort maskieren (Ersatz für core.setSecret): kommt er aus `vars` oder im
   * Klartext, maskiert GitHub ihn sonst nicht. Vor jeder anderen Ausgabe. */
  for (const geheim of [eingabe(env, "api-key"), eingabe(env, "github-token")]) {
    if (geheim) io.log(kommando("add-mask", geheim));
  }
  let e;
  try {
    e = leseEingaben(env);
  } catch (err) {
    io.log(kommando("error", err instanceof AktionFehler ? err.message : "Invalid inputs."));
    setzeAusgaben(io, env, { result: "error" });
    return 1;
  }
  let id = "";
  let b;
  try {
    const s = await scanne(io, e, io.intervallMs);
    id = s.id;
    b = bewerte(s.antwort, e);
  } catch (err) {
    const msg = err instanceof AktionFehler ? err.message : "Unexpected error.";
    io.log(kommando("error", msg.split(e.apiKey).join("***")));
    setzeAusgaben(io, env, { result: "error", "scan-id": id });
    return 1;
  }
  const md = markdown(b, e, id);
  setzeAusgaben(io, env, {
    result: b.result, "scan-id": id, status: b.status,
    critical: b.je.kritisch, serious: b.je.ernst, moderate: b.je.mittel, minor: b.je.gering,
    review: b.zuPruefen, violations: b.ueber, "report-url": b.kaufUrl || "",
  });
  if (env.GITHUB_STEP_SUMMARY) io.anhaengen(env.GITHUB_STEP_SUMMARY, md + "\n");
  io.log(logText(md.split("\n").slice(1).join("\n")));
  if (e.comment) {
    let ausgang;
    try { ausgang = await kommentiere(io, env, e, md); } catch { ausgang = "failed: network"; }
    io.log(ausgang.startsWith("failed") ? kommando("warning", "Pull request comment: " + ausgang) : logText("Pull request comment: " + ausgang));
  }
  if (b.result === "not-measurable") {
    io.log(kommando(b.bestanden ? "warning" : "error", "The page was not measurable — this is not a clean result."));
  } else if (b.result === "error") {
    io.log(kommando("error", "The scan ended with status " + apiText(b.status, 40) + "."));
  } else if (!b.bestanden) {
    io.log(kommando("error", `${b.ueber} violations at or above ${e.failOn} (allowed: ${e.maxViolations}).`));
  }
  return b.bestanden ? 0 : 1;
}
