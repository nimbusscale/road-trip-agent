import type { createDataset } from "@arizeai/phoenix-client/datasets";
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

// Phoenix's list of datasets, for finding one by name.
export const datasetListSchema = z
  .object({ data: z.array(z.object({ id: z.string(), name: z.string() })) })
  .transform((page) => page.data);

// A golden set example as Phoenix saved it, for comparing with the annotations now.
export const savedExampleListSchema = z.array(
  z
    .object({
      id: z.string(),
      input: z.object({ spanId: z.string() }),
      output: z.unknown(),
      metadata: z.unknown(),
    })
    .transform((example) => ({
      id: example.id,
      spanId: example.input.spanId,
      output: example.output,
      metadata: example.metadata,
    })),
);

type Example = Parameters<typeof createDataset>[0]["examples"][number];

export interface ChangedExample {
  id: string;
  example: Example;
}

const PATCH_MUTATION = `mutation ($input: PatchDatasetExamplesInput!) {
  patchDatasetExamples(input: $input) { dataset { id } }
}`;

const graphqlResultSchema = z.object({
  errors: z.array(z.object({ message: z.string() })).optional(),
});

// Replaces the changed examples' label and metadata, as one new dataset version. The
// REST API can only add examples, so this uses the GraphQL API that Phoenix's own
// pages use.
export async function patchExamples(
  phoenixUrl: string,
  datasetId: string,
  changed: ChangedExample[],
): Promise<void> {
  const operations = changed.flatMap(({ id, example }) => [
    { replace: { exampleId: id, field: "OUTPUT", value: example.output } },
    { replace: { exampleId: id, field: "METADATA", value: example.metadata } },
  ]);
  const response = await fetch(`${phoenixUrl}/graphql`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query: PATCH_MUTATION,
      variables: {
        input: {
          datasetId,
          operations,
          versionDescription: `Updated ${String(changed.length)} turns from the grounded annotations.`,
        },
      },
    }),
  });
  const { errors } = graphqlResultSchema.parse(await response.json());
  if (!response.ok || errors !== undefined) {
    throw new Error(
      `Phoenix didn't update ${String(changed.length)} turns: ${errors?.map((e) => e.message).join("; ") ?? response.statusText}`,
    );
  }
}

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
