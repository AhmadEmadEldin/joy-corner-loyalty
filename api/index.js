require("tsx/cjs");

module.exports = async (request, response) => {
  try {
    const { handleAction } = require("../server/googleSheetsBackend.ts");
    const body = typeof request.body === "string"
      ? JSON.parse(request.body || "{}")
      : request.body || {};
    const payload = request.method === "GET"
      ? { ...(request.query || {}) }
      : body;
    payload.authorization = request.headers.authorization || "";
    const action = String(payload.action || "appData").trim();

    response.status(200).json(await handleAction(action, payload));
  } catch (error) {
    console.error("API action failed", error instanceof Error ? error.message : String(error));
    response.status(error?.statusCode || 400).json({
      ...(error?.details || {}),
      success: false,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
