import {
  type AnnotationsBody,
  type Rating,
  sessionAnnotationsBody,
  spanAnnotationsBody,
} from "./phoenix-annotation.schema.js";

// Phoenix queues an annotation and answers at once, so this only bounds a Phoenix that
// can't be reached, such as when the tunnel is down.
const SAVE_TIMEOUT_MILLISECONDS = 5000;

export class RatingNotSavedError extends Error {
  override name = "RatingNotSavedError";

  constructor() {
    super("The rating wasn't saved, since the app can't reach Phoenix.");
  }
}

// Saves a turn's or a session's rating in Phoenix (systems design section 10).
export interface Ratings {
  rateTurn: (spanId: string, rating: Rating) => Promise<void>;
  rateSession: (agentSessionId: string, rating: Rating) => Promise<void>;
}

// Posted without ?sync=true. Phoenix then keeps trying a rating for a span or session
// it doesn't have yet, every 10 seconds for about 10 minutes, so a turn rated before
// its spans are sent still gets it. A span that never arrives drops the rating, with
// no error.
export function phoenixRatings(phoenixUrl: string): Ratings {
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
  };
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
      signal: AbortSignal.timeout(SAVE_TIMEOUT_MILLISECONDS),
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
