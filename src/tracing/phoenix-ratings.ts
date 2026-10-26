import type { RatingRequest } from "../shared/rating.schema.js";
import {
  type AnnotationsBody,
  type Rating,
  sessionAnnotationsBody,
  sessionRatingQuery,
  sessionRatingReplySchema,
  spanAnnotationsBody,
} from "./phoenix-annotation.schema.js";

// Phoenix queues an annotation and answers at once, so this only bounds a Phoenix that
// can't be reached, such as when the tunnel is down.
const TIMEOUT_MILLISECONDS = 5000;

export class RatingNotSavedError extends Error {
  override name = "RatingNotSavedError";

  constructor() {
    super("The rating wasn't saved, since the app can't reach Phoenix.");
  }
}

// Saves a turn's or a session's rating in Phoenix, and reads back a session's
// (systems design section 10).
export interface Ratings {
  rateTurn: (spanId: string, rating: Rating) => Promise<void>;
  rateSession: (agentSessionId: string, rating: Rating) => Promise<void>;
  // The user's rating of the session, or null when there's none, or Phoenix can't
  // say.
  sessionRating: (
    agentSessionId: string,
    userId: string,
  ) => Promise<RatingRequest | null>;
}

// Posted without ?sync=true. Phoenix then keeps trying a rating for a span or session
// it doesn't have yet, every 10 seconds for about 10 minutes, so a turn rated before
// its spans are sent still gets it. A span that never arrives drops the rating, with
// no error.
export function phoenixRatings(
  phoenixUrl: string,
  phoenixProject: string,
): Ratings {
  return {
    rateTurn: (spanId, rating) =>
      postAnnotations(
        `${phoenixUrl}/v1/span_annotations`,
        spanAnnotationsBody(spanId, rating),
      ),
    rateSession: (agentSessionId, rating) =>
      postAnnotations(
        `${phoenixUrl}/v1/session_annotations`,
        sessionAnnotationsBody(agentSessionId, rating),
      ),
    sessionRating: (agentSessionId, userId) =>
      readSessionRating(
        `${phoenixUrl}/v1/projects/${encodeURIComponent(phoenixProject)}/session_annotations?${sessionRatingQuery(agentSessionId, userId)}`,
      ),
  };
}

// A Phoenix that can't be reached gives no rating, so the chat still opens. One that
// refuses the request, or replies with something else, is logged. A project with no
// traces yet is a 404.
async function readSessionRating(
  address: string,
): Promise<RatingRequest | null> {
  let response: Response;
  try {
    response = await fetch(address, {
      signal: AbortSignal.timeout(TIMEOUT_MILLISECONDS),
    });
  } catch {
    return null;
  }
  if (response.status === 404) {
    return null;
  }
  const result = sessionRatingReplySchema.safeParse(
    response.ok ? await response.json().catch(() => null) : null,
  );
  if (!result.success) {
    console.error(
      `Phoenix's reply to reading a session's rating wasn't usable, with ${String(response.status)}.`,
    );
    return null;
  }
  return result.data;
}

// A Phoenix that can't be reached is a refusal the user sees. One that refuses the
// body is a bug, and its reply goes in the log.
async function postAnnotations(
  address: string,
  body: AnnotationsBody,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(address, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MILLISECONDS),
    });
  } catch {
    throw new RatingNotSavedError();
  }
  if (!response.ok) {
    throw new Error(
      `Phoenix refused the rating with ${String(response.status)}: ${await response.text()}`,
    );
  }
}
