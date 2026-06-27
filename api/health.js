require("tsx/cjs");

const { app } = require("../server/googleSheetsBackend.ts");

module.exports = (request, response) => {
  try {
    request.url = "/health";
    return app(request, response);
  } catch (error) {
    response.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
