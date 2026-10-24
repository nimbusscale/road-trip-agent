import { refuseIfChatClosed } from "../agent/coordinator-turns.js";
import type { SignedInUser } from "../auth/signed-in-user.schema.js";
import type { Trip } from "../domain/trip.js";
import type { SessionReader } from "../persistence/session-reader.js";
import type { Session } from "../persistence/session.js";
import { TripNotFoundError } from "../persistence/trip-errors.js";
import type { TripReader } from "../persistence/trip-reader.js";
import type { ChatDependencies } from "./chat-dependencies.js";

export class SessionNotFoundError extends Error {
  override name = "SessionNotFoundError";

  constructor(sessionId: string) {
    super(`There's no session ${sessionId}.`);
  }
}

// The signed-in user's trip. Another user's trip is refused just as one that doesn't
// exist is, so the reply doesn't say it's there (functional spec 10.4). Every route
// that takes a trip or session ID checks this before anything else, and before the
// session's tools are made (tool design, section 4).
export async function ownedTrip(
  reader: TripReader,
  tripId: string,
  user: SignedInUser,
): Promise<Trip> {
  const trip = await reader.read(tripId);
  if (trip.owner.id !== user.userId) {
    throw new TripNotFoundError(tripId);
  }
  return trip;
}

export interface OwnedSession {
  session: Session;
  trip: Trip;
}

export async function ownedSession(
  readers: { trips: TripReader; sessions: SessionReader },
  sessionId: string,
  user: SignedInUser,
): Promise<OwnedSession> {
  const session = await readers.sessions.get(sessionId);
  if (session === undefined) {
    throw new SessionNotFoundError(sessionId);
  }
  try {
    return {
      session,
      trip: await ownedTrip(readers.trips, session.tripId, user),
    };
  } catch (error) {
    if (error instanceof TripNotFoundError) {
      throw new SessionNotFoundError(sessionId);
    }
    throw error;
  }
}

// The user's session, on a trip that hasn't started, so the chat view can open it
// (functional spec 2).
export async function openableSession(
  chat: ChatDependencies,
  sessionId: string,
  user: SignedInUser,
): Promise<OwnedSession> {
  const owned = await ownedSession(
    { trips: chat.trips.reader, sessions: chat.sessions.reader },
    sessionId,
    user,
  );
  refuseIfChatClosed(owned.trip, chat.now());
  return owned;
}
