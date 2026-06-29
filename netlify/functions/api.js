process.env.NETLIFY_FUNCTIONS = "1";

require("tsx/cjs");

const { handleAction } = require("../../server/googleSheetsBackend.ts");

const corsHeaders = {
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Origin": process.env.CORS_ORIGIN || "*",
  "Content-Type": "application/json",
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      body: "",
      headers: corsHeaders,
      statusCode: 204,
    };
  }

  try {
    const path = event.path || "";
    const headers = event.headers || {};

    if (path.endsWith("/api/health") || path.endsWith("/.netlify/functions/api/health")) {
      return {
        body: JSON.stringify({
          success: true,
          service: "Joy Corner Netlify API",
        }),
        headers: corsHeaders,
        statusCode: 200,
      };
    }

    const body = event.body ? JSON.parse(event.body) : {};
    const payload =
      event.httpMethod === "GET"
        ? { ...(event.queryStringParameters || {}) }
        : body;
    payload.authorization = headers.authorization || headers.Authorization || "";

    const action = String(payload.action || "appData").trim();
    const result = await handleAction(action, payload);

    return {
      body: JSON.stringify(result),
      headers: corsHeaders,
      statusCode: 200,
    };
  } catch (error) {
    console.error("Netlify API action failed", error instanceof Error ? error.message : String(error));

    return {
      body: JSON.stringify({
        ...(error?.details || {}),
        success: false,
        message: error instanceof Error ? error.message : String(error),
      }),
      headers: corsHeaders,
      statusCode: error?.statusCode || 400,
    };
  }
};
