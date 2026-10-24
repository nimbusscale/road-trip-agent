import { type Context, Hono } from "hono";

import { shownMessagesOf } from "../agent/shown-messages.js";
import type { SessionResponse } from "../shared/session.schema.js";
import type { ChatDependencies } from "./chat-dependencies.js";
import { messageBody } from "./message-body.js";
import { openableSession, type OwnedSession, ownedSession } from "./owned.js";
import { streamTurn } from "./turn-stream.js";

// Resuming a session, and sending it a message (functional spec 10.1).
export function sessionRoutes(chat: ChatDependencies): Hono {
  const routes = new Hono();
  const readers = { trips: chat.trips.reader, sessions: chat.sessions.reader };

  // The session's conversation so far, without the app's lines. Opening a session
  // counts as a resume, so the next message tells the coordinator to read the trip
  // again (technical spec 5.2).
  routes.post("/sessions/:sessionId/resume", async (context) => {
    const owned = await openSession(context);
    chat.turns.markResumed(owned.session.id);
    return context.json(await sessionResponseOf(owned));
  });

  // The same, without marking a resume. The browser asks again with it while a turn
  // it didn't see the end of is still running.
  routes.get("/sessions/:sessionId", async (context) => {
    return context.json(await sessionResponseOf(await openSession(context)));
  });

  // The turn checks again, before each message, that the trip hasn't started.
  routes.post("/sessions/:sessionId/messages", messageBody, async (context) => {
    const { text } = context.req.valid("json");
    const user = context.get("user");
    const { session } = await ownedSession(
      readers,
      context.req.param("sessionId"),
      user,
    );
    const turn = await chat.turns.begin({ session, userId: user.userId }, text);
    return streamTurn(context, turn);
  });

  function openSession(context: Context): Promise<OwnedSession> {
    return openableSession(
      chat,
      context.req.param("sessionId") ?? "",
      context.get("user"),
    );
  }

  async function sessionResponseOf({
    session,
  }: OwnedSession): Promise<SessionResponse> {
    // Read before the transcript. A turn that ends between the two then leaves the
    // browser to ask once more, rather than miss the end of the reply.
    const turnRunning = chat.turns.isRunning(session.id);
    const lines = await chat.transcripts.load({
      projectKey: "",
      sessionId: session.agentSessionId,
    });
    return {
      sessionId: session.id,
      tripId: session.tripId,
      messages: shownMessagesOf(lines ?? []),
      turnRunning,
    };
  }

  return routes;
}
