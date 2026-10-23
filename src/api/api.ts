import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import {
  ChatClosedError,
  TurnRunningError,
} from "../agent/coordinator-turns.js";
import type { VerifyToken } from "../auth/token-verifier.js";
import { RuleError } from "../domain/rule-error.js";
import { TripNotFoundError } from "../persistence/trip-errors.js";
import type { ErrorResponse } from "../shared/error.schema.js";
import type { HealthResponse } from "../shared/health.schema.js";
import type { MeResponse } from "../shared/me.schema.js";
import type { ChatDependencies } from "./chat-dependencies.js";
import { SessionNotFoundError } from "./owned.js";
import { requireSignIn } from "./require-sign-in.js";
import { sessionRoutes } from "./session-routes.js";
import { tripRoutes } from "./trip-routes.js";

export interface ApiDependencies {
  isDatabaseReachable: () => Promise<boolean>;
  verifyToken: VerifyToken;
  chat: ChatDependencies;
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

  api.route("/", tripRoutes(dependencies.chat));
  api.route("/", sessionRoutes(dependencies.chat));

  api.onError((error, context) => {
    const status = statusOf(error);
    if (status === 500) {
      console.error(error);
    }
    const body: ErrorResponse = {
      error: status === 500 ? "Something went wrong." : error.message,
    };
    return context.json(body, status);
  });

  return api;
}

// Each refusal's message is written for the user. Anything else is a bug, and its
// message stays in the log.
function statusOf(error: Error): ContentfulStatusCode {
  if (
    error instanceof TripNotFoundError ||
    error instanceof SessionNotFoundError
  ) {
    return 404;
  }
  if (error instanceof ChatClosedError || error instanceof TurnRunningError) {
    return 409;
  }
  if (error instanceof RuleError) {
    return 400;
  }
  return 500;
}
