import { app } from "../server/googleSheetsBackend";

export default function handler(request: any, response: any) {
  request.url = "/health";
  return app(request, response);
}
