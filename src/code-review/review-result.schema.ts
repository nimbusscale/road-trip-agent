import { z } from "zod";

// The labels in the review rubric, design/review-rubric.md, in the table's order.
export const LABELS = [
  "V1",
  "D1",
  "D2",
  "D3",
  "F1",
  "F2",
  "F3",
  "F4",
  "F5",
  "F6",
  "F7",
  "NF2",
  "NF3",
  "NF4",
  "NF5",
  "N1",
  "N2",
  "N3",
  "N4",
  "N5",
  "N6",
] as const;

export type Label = (typeof LABELS)[number];

// One finding, as the review-pr skill returns it (its Output section).
export const findingSchema = z.strictObject({
  file: z.string().min(1),
  line: z.int().positive(),
  label: z.enum(LABELS),
  finding: z.string().min(1),
  labelReason: z.string().min(1),
});

export type Finding = z.infer<typeof findingSchema>;

// The reviewer's whole answer. The workflow hands this to claude -p as --json-schema,
// so the answer is checked against it before the run ends.
export const findingsSchema = z.strictObject({
  findings: z.array(findingSchema),
});

// Draft 07, since claude -p refuses Zod's default, draft 2020-12, as "not a valid JSON
// Schema" (Claude Code 2.1.304, tried 2026-10-20).
export function findingsJsonSchema(): string {
  return JSON.stringify(z.toJSONSchema(findingsSchema, { target: "draft-07" }));
}

// The parts of claude -p --output-format json that the posting step reads. With
// --json-schema, the answer is in structured_output.
export const reviewResultSchema = z
  .object({
    is_error: z.literal(false),
    structured_output: findingsSchema,
  })
  .transform((result) => result.structured_output.findings);
