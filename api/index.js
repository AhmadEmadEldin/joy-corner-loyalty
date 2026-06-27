require("tsx/cjs");

const { handleAction } = require("../server/googleSheetsBackend.ts");

module.exports = async (request, response) => {
  try {
    const payload = request.method === "GET"
      ? { ...(request.query || {}) }
      : request.body || {};
    const action = String(payload.action || "appData").trim();

    response.status(200).json(await handleAction(action, payload));
  } catch (error) {
    response.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
