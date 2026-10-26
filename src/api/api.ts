import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import {
  ChatClosedError,
  TurnRunningError,
} from "../agent/coordinator-turns.js";
import type { VerifyToken } from "../auth/token-verifier.js";
import { RuleError } from "../domain/rule-error.js";
import {
  TripBusyError,
  TripNotFoundError,
} from "../persistence/trip-errors.js";
import type { ErrorResponse } from "../shared/error.schema.js";
import type { HealthResponse } from "../shared/health.schema.js";
import type { MeResponse } from "../shared/me.schema.js";
import {
  RatingNotSavedError,
  type Ratings,
} from "../tracing/phoenix-ratings.js";
import type { ChatDependencies } from "./chat-dependencies.js";
import { memoryRoutes } from "./memory-routes.js";
import { SessionNotFoundError } from "./owned.js";
import { planDownloadRoutes } from "./plan-download-routes.js";
import { ratingRoutes } from "./rating-routes.js";
import { requireSignIn } from "./require-sign-in.js";
import { sessionRoutes } from "./session-routes.js";
import { tripRoutes } from "./trip-routes.js";

export interface ApiDependencies {
  isDatabaseReachable: () => Promise<boolean>;
  isPhoenixReachable: () => Promise<boolean>;
  verifyToken: VerifyToken;
  chat: ChatDependencies;
  ratings: Ratings;
}

export function createApi(dependencies: ApiDependencies) {
  const api = new Hono().basePath("/api");

  // Open to everyone: the deploy calls it to check the live site (systems design
  // section 7), and the page shows it. Only the database decides the status, so the
  // deploy doesn't fail when Phoenix is down (systems design section 10).
  api.get("/health", async (context) => {
    const [database, phoenix] = await Promise.all([
      dependencies.isDatabaseReachable(),
      dependencies.isPhoenixReachable(),
    ]);
    const body: HealthResponse = {
      database: database ? "reachable" : "unreachable",
      phoenix: phoenix ? "reachable" : "unreachable",
    };
    return context.json(body, database ? 200 : 503);
  });

  // Every route after this one needs a signed-in user (systems design section 3).
  api.use(requireSignIn(dependencies.verifyToken));

  api.get("/me", (context) => {
    const body: MeResponse = { userId: context.get("user").userId };
    return context.json(body);
  });

  api.route("/", tripRoutes(dependencies.chat));
  api.route("/", sessionRoutes(dependencies.chat));
  api.route("/", memoryRoutes(dependencies.chat));
  api.route("/", planDownloadRoutes(dependencies.chat));
  api.route("/", ratingRoutes(dependencies.chat, dependencies.ratings));

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
  if (
    error instanceof ChatClosedError ||
    error instanceof TurnRunningError ||
    error instanceof TripBusyError
  ) {
    return 409;
  }
  if (error instanceof RuleError) {
    return 400;
  }
  if (error instanceof RatingNotSavedError) {
    return 503;
  }
  return 500;
}
