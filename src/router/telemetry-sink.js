"use strict";
/*
 * Telemetry sink — storage abstraction for the telemetry (phase C, C1).
 * Separates HOW things are stored from WHAT is measured: telemetry.js does
 * clamping + aggregation, the sink only I/O.  That way the same telemetry
 * logic runs locally (FileSink, JSONL) as it later does on a Cloudflare
 * Worker (AnalyticsEngineSink) — one source, two backends.
 * Sink contract:  append(record) -> void ;  readAll() -> record[].
 */
const fs = require("fs");
const path = require("path");

class FileSink {
  constructor(file) {
    this.file = file;
    this._dirReady = false;
  }

  _ensureDir() {
    if (this._dirReady) return;
    const dir = path.dirname(this.file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    this._dirReady = true;
  }

  /* Append-only JSONL — one record per line. */
  append(record) {
    this._ensureDir();
    fs.appendFileSync(this.file, JSON.stringify(record) + "\n");
  }

  /* All records; missing file -> []; broken lines are skipped. */
  readAll() {
    if (!fs.existsSync(this.file)) return [];
    const lines = fs.readFileSync(this.file, "utf8").trim().split("\n").filter(Boolean);
    const out = [];
    for (const l of lines) {
      try { out.push(JSON.parse(l)); } catch { /* ignore broken line */ }
    }
    return out;
  }
}

/* MemorySink — volatile in-memory sink without fs (phase C / C3).  The worker
 * uses it as the default so telemetry.log does not touch the (read-only) fs
 * on workerd; C4 replaces it with the AnalyticsEngineSink (durable). */
class MemorySink {
  constructor() { this._records = []; }
  append(record) { this._records.push(record); }
  readAll() { return this._records.slice(); }
}

module.exports = { FileSink, MemorySink };
