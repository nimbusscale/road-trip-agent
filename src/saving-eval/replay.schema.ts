import { z } from "zod";

import {
  savingAnswerSchema,
  savingCheckSchema,
} from "./saving-answer.schema.js";

// The saving replays (#209): each case is a saving-golden turn that fails a check, run
// again on today's code with run-turn, and judged by the saving judge.

// A case's input, as the saving-replays dataset holds it, and as Phoenix hands it to
// the experiment's task. The turn is the recorded session's turn number from 1, as its
// trip version counts it. The context is the golden turn's judge input up to its turn,
// <before> and <earlier_turns>, since a run starts from the same trip and conversation.
export const replayInputSchema = z.object({
  goldenSpanId: z.string(),
  agentSessionId: z.string(),
  turn: z.int().positive(),
  judgeContext: z.string(),
});

export type ReplayInput = z.infer<typeof replayInputSchema>;

// A case's reference output: the checks the golden turn's saves fail, on any save.
export const replayExpectedSchema = z.object({
  originalChecks: z.array(savingCheckSchema),
});

// Where a case is in the turns file, for the report.
export const replayMetadataSchema = z.looseObject({
  set: z.number(),
  item: z.number(),
});

// What one run of a case returns to the experiment. The turn input is the run's <turn>,
// which follows the case's context in the judge input, so the run can be judged again
// later without running the turn again. Each save is named by its tool, in the order
// numbered in the turn input.
export const replayOutputSchema = z.object({
  spanId: z.string(),
  tripId: z.string(),
  userId: z.string(),
  saveTools: z.array(z.string()),
  turnInput: z.string(),
  answer: savingAnswerSchema,
});

export type ReplayOutput = z.infer<typeof replayOutputSchema>;

// The experiment's metadata, as the report reads it back.
export const replayExperimentMetadataSchema = z.looseObject({
  commit: z.string(),
  description: z.string(),
  rubric: z.string(),
  split: z.string(),
  runsPerCase: z.number(),
});
