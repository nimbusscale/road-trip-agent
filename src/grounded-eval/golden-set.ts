import { createClient } from "@arizeai/phoenix-client";
import { createDataset } from "@arizeai/phoenix-client/datasets";
import { getSpanAnnotations } from "@arizeai/phoenix-client/spans";

import { CORPUS_PROJECT } from "./corpus-reader.js";
import {
  datasetListSchema,
  type GroundedAnnotation,
  groundedAnnotationListSchema,
} from "./golden-set.schema.js";
import type { GroundedLabel } from "./label-answer.schema.js";

export const GOLDEN_DATASET = "grounded-golden";

type PhoenixClient = ReturnType<typeof createClient>;
type Example = Parameters<typeof createDataset>[0]["examples"][number];

// The two labelers whose agreement settles a turn's label (#282, step 7).
const LABELERS = ["sonnet-5.5", "gpt-sol-6.1"] as const;

// One sampled turn, with the judge input the labelers read.
export interface GoldenTurn {
  set: number;
  sessionId: string;
  spanId: string;
  judgeInput: string;
}

// Builds the golden set from the turns' `grounded` annotations, and saves it as a
// Phoenix dataset. It stops if the dataset is already there, so a golden set that
// experiments ran on is never replaced.
export async function createGoldenSet(
  phoenixUrl: string,
  turns: GoldenTurn[],
): Promise<number> {
  const client = createClient({ options: { baseUrl: phoenixUrl } });
  if (await datasetExists(client)) {
    throw new Error(
      `${GOLDEN_DATASET} is already in Phoenix. Nothing was changed.`,
    );
  }
  const annotations = await readAnnotations(
    client,
    turns.map((turn) => turn.spanId),
  );
  const examples = turns.map((turn) => exampleOf(turn, annotations));
  await createDataset({
    client,
    name: GOLDEN_DATASET,
    description:
      "The grounded evaluator's golden set (#282): each sampled turn's judge input, with its settled label.",
    examples,
  });
  return examples.length;
}

async function datasetExists(client: PhoenixClient): Promise<boolean> {
  const response = await client.GET("/v1/datasets", {
    params: { query: { name: GOLDEN_DATASET } },
  });
  return datasetListSchema.parse(response.data).length > 0;
}

async function readAnnotations(
  client: PhoenixClient,
  spanIds: string[],
): Promise<GroundedAnnotation[]> {
  const found: GroundedAnnotation[] = [];
  let cursor: string | null = null;
  do {
    const page = await getSpanAnnotations({
      client,
      project: { projectName: CORPUS_PROJECT },
      spanIds,
      includeAnnotationNames: ["grounded"],
      cursor,
      limit: 1000,
    });
    found.push(
      ...groundedAnnotationListSchema
        .parse(page.annotations)
        .filter((a) => ["joe", ...LABELERS].includes(a.identifier)),
    );
    cursor = page.nextCursor;
  } while (cursor !== null);
  return found;
}

// The settled label is Joe's call where he made one, and otherwise the label both
// labelers agree on. Joe's call names the facts he found ungrounded. The labelers'
// lists go in the metadata, since they rarely flag exactly the same facts.
function exampleOf(
  turn: GoldenTurn,
  annotations: GroundedAnnotation[],
): Example {
  const on = (identifier: string): GroundedAnnotation | undefined =>
    annotations.find(
      (a) => a.spanId === turn.spanId && a.identifier === identifier,
    );
  const joe = on("joe");
  const [sonnet, sol] = LABELERS.map(on);
  if (sonnet === undefined || sol === undefined) {
    throw new Error(`Turn ${turn.spanId} is missing a labeler's label.`);
  }
  if (joe === undefined && sonnet.label !== sol.label) {
    throw new Error(
      `The labelers split on ${turn.spanId}, and Joe hasn't called it.`,
    );
  }
  const label: GroundedLabel = joe?.label ?? sonnet.label;
  return {
    spanId: turn.spanId,
    input: { spanId: turn.spanId, judgeInput: turn.judgeInput },
    output: { label, joeUngroundedFacts: joe ? ungroundedOf(joe) : null },
    metadata: {
      set: turn.set,
      sessionId: turn.sessionId,
      labelFrom: joe ? "joe" : "labelers",
      sonnetUngroundedFacts: ungroundedOf(sonnet),
      solUngroundedFacts: ungroundedOf(sol),
    },
  };
}

function ungroundedOf(
  annotation: GroundedAnnotation,
): { quote: string; why: string }[] {
  return annotation.facts
    .filter((fact) => !fact.grounded)
    .map(({ quote, why }) => ({ quote, why }));
}
