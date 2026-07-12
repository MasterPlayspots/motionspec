"use strict";
// npm version lifecycle hook: keep server.json version(s) in lockstep with package.json.
const fs = require("node:fs");
const v = JSON.parse(fs.readFileSync("package.json", "utf8")).version;
const s = JSON.parse(fs.readFileSync("server.json", "utf8"));
s.version = v;
if (Array.isArray(s.packages)) for (const p of s.packages) if (p && p.version !== undefined) p.version = v;
fs.writeFileSync("server.json", JSON.stringify(s, null, 2) + "\n");
console.log("[version hook] server.json synced to " + v);
