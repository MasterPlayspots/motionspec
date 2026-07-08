// Phase B — real-browser e2e config. CI-only: the sandbox is ARM and cannot
// run Chromium; this is verified on GitHub Actions x86 runners (roadmap Phase B,
// anti-goal #4: the runner is the source of truth, local ARM failure is expected).
const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./test/e2e",
  timeout: 30000,
  fullyParallel: false,
  reporter: [["list"]],
  use: { headless: true, browserName: "chromium" },
});
