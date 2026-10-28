import { z } from "zod";

import { TIERS } from "../domain/tier.js";
import { placeId, visitTimeInMinutes } from "./stop-input.schema.js";

// The inputs of the workers' trip tools: reading a worker brief's facts, adding
// candidates, and saving a stay's weather text (tool design 2.1). Each input says only how to pass its value. What each
// item means goes in the workers' instructions (tool design, section 4).

// The ways a worker finds a place. A place the user names comes from the coordinator's
// select_user_place instead (domain model 3.9).
export const WORKER_HOW_FOUND = ["google", "webSearch"] as const;

// A set holds 1 to 3 candidates (domain model 3.9). The schema says so too, so the
// model sees the limit.
const MAXIMUM_SET_SIZE = 3;

// The card links to it, so only a web page's link is taken, never a script's.
const sourceLink = z
  .url({
    protocol: /^https?$/,
    error: "A link starting with https:// or http://.",
  })
  .describe(
    "The link the place was found at, starting with https:// or http://, such as its Google Maps link or the web page's.",
  );

// The fields every candidate takes. Each is required, even the name, so the worker
// never has to decide whether to pass it (tool design 2.1).
const candidateFields = {
  placeId,
  name: z
    .string()
    .describe(
      'What to call the place, such as "Gifford Homestead". Used only when Google has no name for it.',
    ),
  rationale: z.string().describe("One or two sentences."),
  howFound: z.enum(WORKER_HOW_FOUND),
  sourceLink,
  notes: z
    .string()
    .describe(
      'Notes about the place, such as "closed Mondays" or "reservations advised", or "" when there are none.',
    ),
};

const tier = z.enum(TIERS);

const tieredCandidate = z.strictObject({ ...candidateFields, tier });

const timedCandidate = z.strictObject({
  ...candidateFields,
  visitTimeInMinutes,
});

export const READ_WORKER_BRIEF_FACTS_INPUT = z.strictObject({
  stopOrStayIds: z
    .array(
      z
        .string()
        .describe("A stop or stay ID, such as stop_k7m2x9qa or stay_k7m2x9qa."),
    )
    .min(1),
});

export const ADD_LODGING_CANDIDATES_INPUT = z.strictObject({
  stayId: z.string().describe("A stay ID, such as stay_k7m2x9qa."),
  candidates: z.array(tieredCandidate).min(1).max(MAXIMUM_SET_SIZE),
});

// A meal's candidates take a tier, and an attraction's a visit time. The stop ID doesn't
// show its kind, so each candidate is one shape or the other, with every field
// required, and the tool refuses a shape that doesn't fit the stop (tool design 2.1).
export const ADD_STOP_CANDIDATES_INPUT = z.strictObject({
  stopId: z.string().describe("A stop ID, such as stop_k7m2x9qa."),
  candidates: z
    .array(z.union([tieredCandidate, timedCandidate]))
    .min(1)
    .max(MAXIMUM_SET_SIZE)
    .describe(
      "For a meal stop, each with a tier. For an attraction stop, each with visitTimeInMinutes.",
    ),
});

// The stay input is stayId, as in add_lodging_candidates. The Agent hook reads the stay
// it saved by that name (technical spec 6.5).
export const SET_STAY_WEATHER_INPUT = z.strictObject({
  stayId: z.string().describe("A stay ID, such as stay_k7m2x9qa."),
  guidance: z
    .string()
    .describe("Plain text, a few sentences, with no headings or lists."),
});

export type CandidateInput = z.infer<
  typeof timedCandidate | typeof tieredCandidate
>;
export type AddLodgingCandidatesInput = z.infer<
  typeof ADD_LODGING_CANDIDATES_INPUT
>;
export type AddStopCandidatesInput = z.infer<typeof ADD_STOP_CANDIDATES_INPUT>;
export type SetStayWeatherInput = z.infer<typeof SET_STAY_WEATHER_INPUT>;
