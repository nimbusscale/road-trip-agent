import { type Context, Hono } from "hono";

import type { Trip } from "../domain/trip.js";
import type {
  TripListResponse,
  TripPageResponse,
  TripSummary,
} from "../shared/trip.schema.js";
import type { ChatDependencies } from "./chat-dependencies.js";
import { messageBody } from "./message-body.js";
import { ownedTrip, refuseIfChatClosed } from "./owned.js";
import { streamTurn } from "./turn-stream.js";

// The home screen and the trip page (functional spec 3 and 10.1), and starting a trip
// or a session. Each start sends the first message, and streams the reply.
export function tripRoutes(chat: ChatDependencies): Hono {
  const routes = new Hono();

  routes.get("/trips", async (context) => {
    const owner = { id: context.get("user").userId };
    const trips = await chat.trips.reader.listForOwner(owner);
    const body: TripListResponse = { trips: trips.map(tripSummaryOf) };
    return context.json(body);
  });

  // The "New trip" form. Starting a trip takes two steps, each saved on its own
  // (persistence design, section 8.2).
  routes.post("/trips", messageBody, async (context) => {
    const { text } = context.req.valid("json");
    const userId = context.get("user").userId;
    const trip = await chat.trips.writer.startTrip({ id: userId });
    return startSession(context, chat, { tripId: trip.id, userId, text });
  });

  routes.get("/trips/:tripId", async (context) => {
    const user = context.get("user");
    const trip = await ownedTrip(
      chat.trips.reader,
      context.req.param("tripId"),
      user,
    );
    return context.json(await tripPageOf(chat, trip));
  });

  // "Start a new session": the coordinator gets no earlier transcripts (functional
  // spec 10.1).
  routes.post("/trips/:tripId/sessions", messageBody, async (context) => {
    const { text } = context.req.valid("json");
    const user = context.get("user");
    const trip = await ownedTrip(
      chat.trips.reader,
      context.req.param("tripId"),
      user,
    );
    refuseIfChatClosed(trip, chat.now());
    const session = await chat.sessions.writer.start(trip.id, text);
    const turn = await chat.turns.begin({ session, userId: user.userId }, text);
    return streamTurn(context, turn, {
      name: "session",
      data: { tripId: trip.id, sessionId: session.id },
    });
  });

  return routes;
}

async function tripPageOf(
  chat: ChatDependencies,
  trip: Trip,
): Promise<TripPageResponse> {
  const sessions = await chat.sessions.reader.listForTrip(trip.id);
  return {
    trip: tripSummaryOf(trip),
    chatClosed: trip.hasStarted(chat.now()),
    sessions: sessions.map((session) => ({
      id: session.id,
      title: session.title,
      createdDateTime: session.createdDateTime.toISOString(),
    })),
  };
}

// Starts a session with the user's first message, which gives its title, and streams
// the reply. The reply opens with the trip and session, so the browser can show the
// session's own page.
async function startSession(
  context: Context,
  chat: ChatDependencies,
  start: { tripId: string; userId: string; text: string },
): Promise<Response> {
  const { tripId, userId, text } = start;
  const session = await chat.sessions.writer.start(tripId, text);
  const turn = await chat.turns.begin({ session, userId }, text);
  return streamTurn(context, turn, {
    name: "session",
    data: { tripId, sessionId: session.id },
  });
}

function tripSummaryOf(trip: Trip): TripSummary {
  const { startDate, endDate } = trip.itinerary;
  return {
    id: trip.id,
    name: trip.name,
    startDate: startDate?.toText() ?? null,
    endDate: endDate?.toText() ?? null,
    lastUpdatedDateTime: trip.lastUpdatedDateTime.toISOString(),
  };
}
