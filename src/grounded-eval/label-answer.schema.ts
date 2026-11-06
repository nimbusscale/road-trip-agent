import { z } from "zod";

// A labeler's or the judge's answer for one turn, in the rubric's own field names
// (evals/grounded/rubric.md, "What to return"). Strict, so the JSON Schema made from it
// is one both Claude Code and Codex accept for structured output.
const answerSchema = z.strictObject({
  label: z.enum(["grounded", "not_grounded", "no_facts"]),
  ungrounded_facts: z.array(
    z.strictObject({ quote: z.string(), why: z.string() }),
  ),
});

export const labelAnswerSchema = answerSchema
  .refine(
    (answer) =>
      (answer.label === "not_grounded") === answer.ungrounded_facts.length > 0,
    {
      error:
        "ungrounded_facts must list facts when, and only when, the label is not_grounded",
    },
  )
  .transform((answer) => ({
    label: answer.label,
    ungroundedFacts: answer.ungrounded_facts,
  }));

export type LabelAnswer = z.infer<typeof labelAnswerSchema>;

// The JSON Schema the harnesses check the answer against. Draft 7, since Claude Code
// refuses the 2020-12 version Zod writes by default.
export function labelAnswerJsonSchema(): string {
  return JSON.stringify(
    z.toJSONSchema(answerSchema, { target: "draft-07" }),
    null,
    2,
  );
}

// Claude Code's --output-format json result, with only the fields read. With
// --json-schema, the answer is in structured_output.
export const claudeResultSchema = z
  .object({ structured_output: z.unknown() })
  .transform((result) => result.structured_output);
