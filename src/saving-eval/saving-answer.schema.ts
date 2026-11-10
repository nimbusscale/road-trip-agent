import { z } from "zod";

// A labeler's or the judge's answer for one turn: each save, by its number in the turn,
// with the checks it fails (evals/saving/rubric.md, "What to return"). Strict, so the
// JSON Schema made from it is one both Claude Code and Codex accept for structured
// output.
export const savingCheckSchema = z.enum(["F1", "F2", "F3", "F4", "F5", "F6"]);

const failureSchema = z.strictObject({
  check: savingCheckSchema,
  quote: z.string(),
  why: z.string(),
});

export const savingAnswerSchema = z.strictObject({
  saves: z.array(
    z.strictObject({
      n: z.int(),
      failures: z.array(failureSchema),
    }),
  ),
});

export type SavingAnswer = z.infer<typeof savingAnswerSchema>;

// The JSON Schema the harnesses check the answer against. Draft 7, since Claude Code
// refuses the 2020-12 version Zod writes by default.
export function savingAnswerJsonSchema(): string {
  return JSON.stringify(
    z.toJSONSchema(savingAnswerSchema, { target: "draft-07" }),
    null,
    2,
  );
}

// Whether the answer has one entry for each save, numbered 1 to saveCount in order, as
// the rubric asks. A labeler can return valid JSON that skips a save.
export function answerFitsSaves(
  answer: SavingAnswer,
  saveCount: number,
): boolean {
  return (
    answer.saves.length === saveCount &&
    answer.saves.every((save, index) => save.n === index + 1)
  );
}
