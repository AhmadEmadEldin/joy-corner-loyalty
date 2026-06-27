require("tsx/cjs");

const { app } = require("../server/googleSheetsBackend.ts");

module.exports = (request, response) => {
  const fail = (error) => {
    if (response.headersSent) return;
    response.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? String(error.stack).split("\n").slice(0, 6) : [],
    });
  };

  process.once("uncaughtException", fail);
  process.once("unhandledRejection", fail);

  try {
    request.url = "/health";
    return app(request, response);
  } catch (error) {
    return fail(error);
  }
};
