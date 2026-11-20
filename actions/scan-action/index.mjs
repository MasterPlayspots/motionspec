/*
 * index.mjs — Einstieg der GitHub Action (runs.using: node24). Verdrahtet nur die echte
 * Umgebung (fetch, Dateien, Uhr, Warten) mit lib.mjs; die Logik ist dort testbar.
 */
import { appendFileSync, readFileSync } from "node:fs";
import { run } from "./lib.mjs";

const io = {
  fetch: (url, init) => fetch(url, init),
  jetzt: () => Date.now(),
  schlafen: (ms) => new Promise((r) => setTimeout(r, ms)),
  intervallMs: 5000,
  log: (s) => console.log(s),
  anhaengen: (pfad, text) => appendFileSync(pfad, text),
  lies: (pfad) => readFileSync(pfad, "utf8"),
};

process.exitCode = await run(process.env, io);
