import { z } from "zod";

import { factSchema, groundedLabelSchema } from "./label-answer.schema.js";

// A `grounded` span annotation as Phoenix returns it, with only the fields the golden
// set reads (#282). The metadata holds every fact the annotator listed, or, for Joe,
// the facts he found ungrounded.
export const groundedAnnotationSchema = z
  .object({
    span_id: z.string(),
    identifier: z.string(),
    result: z.object({ label: groundedLabelSchema }),
    metadata: z.object({ facts: z.array(factSchema) }),
  })
  .transform((annotation) => ({
    spanId: annotation.span_id,
    identifier: annotation.identifier,
    label: annotation.result.label,
    facts: annotation.metadata.facts,
  }));

export type GroundedAnnotation = z.output<typeof groundedAnnotationSchema>;

export const groundedAnnotationListSchema = z.array(groundedAnnotationSchema);

// Phoenix's list of datasets, for checking whether one is there.
export const datasetListSchema = z
  .object({ data: z.array(z.object({ name: z.string() })) })
  .transform((page) => page.data);

// The judge's API key, from JUDGE_API_KEY. It bills the API account, not Joe's plan.
export function judgeApiKeyOf(
  source: Readonly<Record<string, string | undefined>>,
): string {
  return z
    .string({ error: "JUDGE_API_KEY must be set" })
    .min(1, { error: "JUDGE_API_KEY must be set" })
    .parse(source.JUDGE_API_KEY);
}

// A golden set example's input and settled label, as the experiment reads them back.
export const goldenInputSchema = z.object({ judgeInput: z.string() });
export const goldenExpectedSchema = z.object({ label: groundedLabelSchema });
