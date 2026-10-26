import type { RatingRequest } from "../shared/rating.schema.js";
import type { Rating } from "./phoenix-annotation.schema.js";
import { RatingNotSavedError, type Ratings } from "./phoenix-ratings.js";

export interface SavedRating {
  kind: "turn" | "session";
  // The span ID, or the agent session ID.
  id: string;
  rating: Rating;
}

// Keeps ratings in memory, in place of Phoenix (DEVELOPMENT.md section 5).
export class FakeRatings implements Ratings {
  readonly saved: SavedRating[] = [];
  // False to act as a Phoenix that can't be reached.
  reachable = true;

  readonly rateTurn = (spanId: string, rating: Rating): Promise<void> =>
    this.#save({ kind: "turn", id: spanId, rating });

  readonly rateSession = (
    agentSessionId: string,
    rating: Rating,
  ): Promise<void> =>
    this.#save({ kind: "session", id: agentSessionId, rating });

  // The user's last rating of the session, as Phoenix keeps only that one.
  readonly sessionRating = (
    agentSessionId: string,
    userId: string,
  ): Promise<RatingRequest | null> => {
    const last = this.saved.findLast(
      ({ kind, id, rating }) =>
        kind === "session" && id === agentSessionId && rating.userId === userId,
    );
    return Promise.resolve(
      last === undefined
        ? null
        : { rating: last.rating.rating, note: last.rating.note },
    );
  };

  #save(saved: SavedRating): Promise<void> {
    if (!this.reachable) {
      return Promise.reject(new RatingNotSavedError());
    }
    this.saved.push(saved);
    return Promise.resolve();
  }
}
