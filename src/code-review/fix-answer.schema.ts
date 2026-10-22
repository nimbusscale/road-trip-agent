import { z } from "zod";

// What the fixer can do with a finding (code review design section 3.6, and the
// fix-pr skill's step 3).
export const OUTCOMES = [
  "fixed",
  "deferred",
  "below_the_bar",
  "wrong",
  "needs_attention",
] as const;

export type Outcome = (typeof OUTCOMES)[number];

const fixReplySchema = z.strictObject({
  findingId: z.string().min(1),
  outcome: z.enum(OUTCOMES),
  // The issue a deferred finding goes to, and null for the other outcomes.
  deferredTo: z.int().positive().nullable(),
  reply: z.string().min(1),
});

export type FixReply = z.infer<typeof fixReplySchema>;

// The fixer's whole answer, as the fix-pr skill's Output section gives it. It's one flat
// object, since claude -p --json-schema refuses a choice between two shapes (code review
// design section 4.5). fix-answer.ts checks which replies go with which status. There's
// no commit: code reads the checked-out one from git.
export const fixAnswerSchema = z.strictObject({
  status: z.enum(["done", "stopped"]),
  // Why the fixer stopped, or for "done", a summary of the round.
  reason: z.string().min(1),
  replies: z.array(fixReplySchema),
});

export type FixAnswer = z.infer<typeof fixAnswerSchema>;

// Draft 07, since claude -p refuses Zod's default (review-result.schema.ts).
export function fixAnswerJsonSchema(): string {
  return JSON.stringify(
    z.toJSONSchema(fixAnswerSchema, { target: "draft-07" }),
  );
}
