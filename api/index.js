require("tsx/cjs");

const { app } = require("../server/googleSheetsBackend.ts");

module.exports = (request, response) => {
  request.url = "/api";
  return app(request, response);
};
