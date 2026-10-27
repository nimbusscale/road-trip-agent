import { RuleError } from "./rule-error.js";
import type { NewStopFields } from "./stop.js";
import type { StopKind } from "./stop-kind.js";

// A stop's own rules that don't need the stop itself (domain model 3.7).

// Selecting a place for a check-in is a mistake for selecting the stay's lodging, so the
// error says where to go instead.
export const CHECK_IN_HAS_NO_CANDIDATES =
  "A check-in has no candidates. Its place is where the party sleeps that night. To pick the hotel, select it for the stay instead.";

// Such as "a check-in", for an error.
export const KIND_TEXT: Record<StopKind, string> = {
  meal: "a meal",
  attraction: "an attraction",
  checkIn: "a check-in",
};

export function refuseBrokenNewStop(fields: NewStopFields): void {
  if (fields.purpose.trim() === "") {
    throw new RuleError("A stop needs a purpose, such as dessert.");
  }
  if ((fields.searchArea === null) !== (fields.kind === "checkIn")) {
    throw new RuleError(
      "A check-in has no search area, and every other stop has one.",
    );
  }
  if ((fields.searchAreaStay !== null) !== (fields.searchArea === "nearStay")) {
    throw new RuleError(
      "A stop near a stay names the stay, and a stop with any other search area names none.",
    );
  }
  const hasTiering = fields.tier !== null || fields.tierRule !== null;
  const isMeal = fields.kind === "meal";
  if (
    hasTiering !== isMeal ||
    (isMeal && (fields.tier === null || !fields.tierRule?.trim()))
  ) {
    throw new RuleError(
      "A meal stop needs a tier and the rule that produced it. An attraction or a check-in has neither.",
    );
  }
}

export function checkedVisitTime(value: number | null): number {
  if (value === null || !Number.isInteger(value) || value <= 0) {
    throw new RuleError(
      `A stop with a selected place, or a check-in, has a visit time of more than 0 minutes. It was given ${String(value)}.`,
    );
  }
  return value;
}

export function noPlaceForVisitTime(): RuleError {
  return new RuleError(
    "A stop has a visit time only when it has a selected place.",
  );
}
