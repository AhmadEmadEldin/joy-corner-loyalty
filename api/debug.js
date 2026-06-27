module.exports = async (_request, response) => {
  const checks = [];

  function check(name, loader) {
    try {
      loader();
      checks.push({ name, ok: true });
    } catch (error) {
      checks.push({
        name,
        ok: false,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? String(error.stack).split("\n").slice(0, 6) : [],
      });
    }
  }

  check("tsx/cjs", () => require("tsx/cjs"));
  check("express", () => require("express"));
  check("dotenv", () => require("dotenv"));
  check("googleapis", () => require("googleapis"));
  check("firebase-admin/app", () => require("firebase-admin/app"));
  check("firebase-admin/auth", () => require("firebase-admin/auth"));
  check("server backend", () => require("../server/googleSheetsBackend.ts"));

  response.status(200).json({
    checks,
    node: process.version,
    vercel: process.env.VERCEL,
  });
};
