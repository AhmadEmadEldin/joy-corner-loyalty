const { spawn } = require("node:child_process");

const webpackCli = require.resolve("webpack-cli/bin/cli.js");
const child = spawn(
  process.execPath,
  [
    "--max-old-space-size=4096",
    webpackCli,
    "serve",
    "--config",
    "webpack.config.ts",
    "--mode",
    "development",
  ],
  {
    env: { ...process.env, VITE_DATA_PROVIDER: "legacy" },
    stdio: "inherit",
  },
);

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exitCode = code ?? 1;
});
