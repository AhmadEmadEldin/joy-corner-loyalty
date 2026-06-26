import { app } from "../server/googleSheetsBackend";

export default function handler(request: any, response: any) {
  request.url = "/api";
  return app(request, response);
}
