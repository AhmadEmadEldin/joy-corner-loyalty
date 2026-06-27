require("tsx/cjs");

const { app } = require("../server/googleSheetsBackend.ts");

module.exports = (request, response) => {
  request.url = "/health";
  return app(request, response);
};
