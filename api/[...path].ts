import { app } from "../server/googleSheetsBackend";

export default function handler(request: any, response: any) {
  if (request.url && !String(request.url).startsWith("/api")) {
    request.url = `/api${String(request.url).startsWith("/") ? "" : "/"}${request.url}`;
  }

  return app(request, response);
}
