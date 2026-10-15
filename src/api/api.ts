import { Hono } from "hono";

import type { VerifyToken } from "../auth/token-verifier.js";
import type { HealthResponse } from "../shared/health.schema.js";
import type { MeResponse } from "../shared/me.schema.js";
import { requireSignIn } from "./require-sign-in.js";

export interface ApiDependencies {
  isDatabaseReachable: () => Promise<boolean>;
  verifyToken: VerifyToken;
}

export function createApi(dependencies: ApiDependencies) {
  const api = new Hono().basePath("/api");

  // Open to everyone: the deploy calls it to check the live site (systems design
  // section 7).
  api.get("/health", async (context) => {
    const reachable = await dependencies.isDatabaseReachable();
    const body: HealthResponse = {
      database: reachable ? "reachable" : "unreachable",
    };
    return context.json(body, reachable ? 200 : 503);
  });

  // Every route after this one needs a signed-in user (systems design section 3).
  api.use(requireSignIn(dependencies.verifyToken));

  api.get("/me", (context) => {
    const body: MeResponse = { userId: context.get("user").userId };
    return context.json(body);
  });

  return api;
}
