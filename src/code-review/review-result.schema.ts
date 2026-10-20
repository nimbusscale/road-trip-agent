import { z } from "zod";

// The labels in the rubric, code review design section 3.1, in the table's order.
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

// The parts of claude -p --output-format json that the posting step reads. With
// --json-schema, the answer is in structured_output.
export const reviewResultSchema = z
  .object({
    is_error: z.literal(false),
    structured_output: findingsSchema,
  })
  .transform((result) => result.structured_output.findings);
