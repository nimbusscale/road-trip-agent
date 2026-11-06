import { z } from "zod";

// A labeler's or the judge's answer for one turn: every fact in the reply, with its
// source (evals/grounded/rubric.md, "What to return"). Strict, so the JSON Schema made
// from it is one both Claude Code and Codex accept for structured output.
const answerSchema = z.strictObject({
  facts: z.array(
    z.strictObject({
      quote: z.string(),
      source: z.string(),
      grounded: z.boolean(),
      why: z.string(),
    }),
  ),
});

export type Fact = z.infer<typeof answerSchema>["facts"][number];

export const groundedLabelSchema = z.enum([
  "grounded",
  "not_grounded",
  "no_facts",
]);

export type GroundedLabel = z.infer<typeof groundedLabelSchema>;

// Code works out the label from the facts, so it can't disagree with them (#282).
export const labelAnswerSchema = answerSchema.transform(({ facts }) => ({
  label: labelOf(facts),
  facts,
}));

export type LabelAnswer = z.infer<typeof labelAnswerSchema>;

function labelOf(facts: Fact[]): GroundedLabel {
  if (facts.length === 0) {
    return "no_facts";
  }
  return facts.every((fact) => fact.grounded) ? "grounded" : "not_grounded";
}

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
