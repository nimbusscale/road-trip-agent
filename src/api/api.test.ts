import { describe, expect, it } from "vitest";

import { healthResponseSchema } from "../shared/health.schema.js";
import { createApi } from "./api.js";

describe("GET /api/health", () => {
  it("reports a reachable database", async () => {
    const api = createApi({ isDatabaseReachable: () => Promise.resolve(true) });
    const response = await api.request("/api/health");
    expect(response.status).toBe(200);
    expect(healthResponseSchema.parse(await response.json())).toEqual({
      database: "reachable",
    });
  });

  it("reports a database it can't reach", async () => {
    const api = createApi({
      isDatabaseReachable: () => Promise.resolve(false),
    });
    const response = await api.request("/api/health");
    expect(response.status).toBe(503);
    expect(healthResponseSchema.parse(await response.json())).toEqual({
      database: "unreachable",
    });
  });
});
