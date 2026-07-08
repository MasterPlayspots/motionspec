#!/usr/bin/env node
/*
 * motionspec-mcp-server — stdio entrypoint for the MotionSpec toolbox.
 *
 * Architecture: the host LLM (Claude, Cursor, ...) is itself the spec
 * author here (stage A). The server provides the guardrails (catalog + rules)
 * and enforces the trust boundary: motion_compile/motion_validate reject
 * every invalid spec fail-closed.
 *
 * Phase C / C2: the tool logic lives in register-tools.js (runtime-agnostic)
 * and is used in exactly the same way by the worker entrypoint.  This file only
 * takes care of what is stdio-/Node-specific: loading the catalog from disk,
 * SIGHUP reload, stdio transport.
 *
 * Start:  node src/mcp/server.mjs   (stdio)
 * Claude Code:  claude mcp add motionspec -- node <repo>/src/mcp/server.mjs
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { loadCatalog, catalogVersion } = require("../compiler/catalog.js");
const { registerMotionspecTools } = require("./register-tools.js");
const pkg = require("../../package.json");

/* Audit finding #10 (2026-06-12): the catalog is reloadable. SIGHUP reloads
 * the primitives without terminating the server process. */
let catalog = loadCatalog();
let catVer = catalogVersion(catalog);
process.on("SIGHUP", () => {
  try {
    catalog = loadCatalog();
    catVer = catalogVersion(catalog);
    console.error("[motionspec-mcp] catalog reloaded — " + catVer + " (" + Object.keys(catalog).length + " primitives)");
  } catch (e) {
    console.error("[motionspec-mcp] catalog reload rejected (previous state stays active): " + e.message);
  }
});

const server = new McpServer({ name: "motionspec-mcp-server", version: pkg.version });
registerMotionspecTools(server, { getCatalog: () => catalog, getCatVer: () => catVer });

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[motionspec-mcp] ready — catalog " + catVer + " (" + Object.keys(catalog).length + " primitives)");
