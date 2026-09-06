/** @jest-environment node */
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

jest.mock("./neon", () => ({
  neonConfigured: jest.fn(() => true),
  neonHealth: jest.fn(async () => ({ configured: true, ok: true })),
}));

import { neonConfigured, neonHealth } from "./neon";

let server: Server;
let origin: string;
beforeAll(async () => {
  process.env.JWT_SECRET = "test-readiness-secret-at-least-32-characters";
  const { app } = await import("./api");
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
beforeEach(() => jest.clearAllMocks());

it("repeated hosting probes never query the database", async () => {
  for (const path of ["/health", "/ready", "/ready"]) {
    expect((await fetch(`${origin}${path}`)).status).toBe(200);
  }
  expect(neonHealth).not.toHaveBeenCalled();
});

it("fails readiness when the database URL is missing without querying", async () => {
  jest.mocked(neonConfigured).mockReturnValueOnce(false);
  expect((await fetch(`${origin}/ready`)).status).toBe(503);
  expect(neonHealth).not.toHaveBeenCalled();
});

it("runs an explicit database diagnostic and reports outages", async () => {
  expect((await fetch(`${origin}/ready/database`)).status).toBe(200);
  jest.mocked(neonHealth).mockRejectedValueOnce(new Error("Database unavailable"));
  const response = await fetch(`${origin}/ready/database`);
  expect(response.status).toBe(503);
  expect((await response.json()).checks.database.ok).toBe(false);
  expect(neonHealth).toHaveBeenCalledTimes(2);
});
