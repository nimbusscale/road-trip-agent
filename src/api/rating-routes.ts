import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";

import {
  ratingRequestSchema,
  type SessionRatingResponse,
  turnRatingParamsSchema,
} from "../shared/rating.schema.js";
import type { Ratings } from "../tracing/phoenix-ratings.js";
import type { ChatDependencies } from "./chat-dependencies.js";
import { refused } from "./message-body.js";
import { ownedSession } from "./owned.js";

const ratingBody = zValidator("json", ratingRequestSchema, refused);
const turnParams = zValidator("param", turnRatingParamsSchema, refused);

// Rating a chat turn, or the whole session, with a thumbs up or down and a note
// (functional spec 10.1). The rating goes to Phoenix, where the turn's trace is
// (systems design section 10). Each replaces the user's earlier rating of the same
// turn or session. The session's can be read back, so the page starts with it.
export function ratingRoutes(chat: ChatDependencies, ratings: Ratings): Hono {
  const routes = new Hono();
  const readers = { trips: chat.trips.reader, sessions: chat.sessions.reader };

  // Phoenix knows the session by its agent session ID, which the server looks up.
  routes.get("/sessions/:sessionId/rating", async (context) => {
    const { session } = await sessionOf(context);
    const body: SessionRatingResponse = {
      rating: await ratings.sessionRating(
        session.agentSessionId,
        context.get("user").userId,
      ),
    };
    return context.json(body);
  });

  routes.put("/sessions/:sessionId/rating", ratingBody, async (context) => {
    const { session } = await sessionOf(context);
    await ratings.rateSession(session.agentSessionId, {
      ...context.req.valid("json"),
      userId: context.get("user").userId,
    });
    return context.body(null, 204);
  });

  routes.put(
    "/sessions/:sessionId/turns/:spanId/rating",
    turnParams,
    ratingBody,
    async (context) => {
      await sessionOf(context);
      await ratings.rateTurn(context.req.valid("param").spanId, {
        ...context.req.valid("json"),
        userId: context.get("user").userId,
      });
      return context.body(null, 204);
    },
  );

  function sessionOf(context: Context) {
    return ownedSession(
      readers,
      context.req.param("sessionId") ?? "",
      context.get("user"),
    );
  }

  return routes;
}
