import { Hono } from "hono";

import type { HealthResponse } from "../shared/health.schema.js";

export interface ApiDependencies {
  isDatabaseReachable: () => Promise<boolean>;
}

export function createApi(dependencies: ApiDependencies) {
  const api = new Hono().basePath("/api");

  api.get("/health", async (context) => {
    const reachable = await dependencies.isDatabaseReachable();
    const body: HealthResponse = {
      database: reachable ? "reachable" : "unreachable",
    };
    return context.json(body, reachable ? 200 : 503);
  });

  return api;
}
