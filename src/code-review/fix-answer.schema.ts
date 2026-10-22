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
  issue: z.int().positive().nullable(),
  reply: z.string().min(1),
});

export type FixReply = z.infer<typeof fixReplySchema>;

// The fixer's whole answer, as the fix-pr skill's Output section gives it.
export const fixAnswerSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("done"),
    commit: z
      .string()
      .regex(/^[0-9a-f]{40}$/)
      .nullable(),
    replies: z.array(fixReplySchema).min(1),
  }),
  z.strictObject({
    status: z.literal("stopped"),
    reason: z.string().min(1),
  }),
]);

export type FixAnswer = z.infer<typeof fixAnswerSchema>;
