#!/usr/bin/env node
const { spawnSync } = require("node:child_process");

const only = process.argv[2];
const args = ["deploy"];

if (only) {
  args.push("--only", only);
}

const result = spawnSync("firebase", args, {
  env: {
    ...process.env,
    FUNCTIONS_DISCOVERY_TIMEOUT: process.env.FUNCTIONS_DISCOVERY_TIMEOUT || "180",
  },
  shell: process.platform === "win32",
  stdio: "inherit",
});

process.exit(result.status ?? 1);
