"use strict";
/* Conventional Commits (TASK-030, Audit-Befund #30). Erzwungen via husky
 * commit-msg-Hook. CJS (das Projekt hat kein "type":"module"). Die Zusatztypen
 * harden/deps spiegeln bestehende Commit-Typen der Projekt-Historie. */
module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [2, "always", [
      "feat", "fix", "docs", "chore", "refactor", "test",
      "ci", "build", "perf", "style", "revert", "harden", "deps",
    ]],
  },
};
