import { RuleError } from "../domain/rule-error.js";

// A place ID that isn't one of the trip's: made up, mistyped, or another trip's. The
// same error for each, so it doesn't say whether another trip's place exists. Tools
// reject bad IDs and never guess (technical spec 7.1).
export class NoSuchPlaceError extends RuleError {
  override name = "NoSuchPlaceError";

  constructor(placeId: string) {
    super(`This trip has no place ${placeId}.`);
  }
}
