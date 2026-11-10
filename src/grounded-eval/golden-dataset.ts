import { isDeepStrictEqual } from "node:util";

import { createClient } from "@arizeai/phoenix-client";
import {
  createDataset,
  getDatasetExamples,
} from "@arizeai/phoenix-client/datasets";

import {
  type ChangedExample,
  datasetListSchema,
  patchExamples,
  savedExampleListSchema,
} from "./golden-set.schema.js";

// One turn in a golden set. Its input holds the turn's span ID, which is how a saved
// example is matched with the example built now.
export type GoldenExample = ChangedExample["example"];

export interface GoldenDataset {
  name: string;
  description: string;
}

type PhoenixClient = ReturnType<typeof createClient>;

// Saves a golden set as a Phoenix dataset, for the grounded (#282) and saving (#209)
// evaluators. If the dataset is already there, it updates only the turns whose label or
// metadata changed, as a new version of the dataset. Replacing the dataset would delete
// the experiments run on it.
export async function saveGoldenDataset(
  phoenixUrl: string,
  dataset: GoldenDataset,
  examples: GoldenExample[],
): Promise<string> {
  const client = createClient({ options: { baseUrl: phoenixUrl } });
  const datasetId = await datasetIdOf(client, dataset.name);
  if (datasetId === null) {
    await createDataset({
      client,
      name: dataset.name,
      description: dataset.description,
      examples,
    });
    return `Saved ${String(examples.length)} turns as ${dataset.name}.`;
  }
  const changed = await changedExamples(
    client,
    dataset.name,
    datasetId,
    examples,
  );
  if (changed.length > 0) {
    await patchExamples(phoenixUrl, datasetId, changed);
  }
  return `Updated ${String(changed.length)} turns in ${dataset.name}.`;
}

async function datasetIdOf(
  client: PhoenixClient,
  name: string,
): Promise<string | null> {
  const response = await client.GET("/v1/datasets", {
    params: { query: { name } },
  });
  return datasetListSchema.parse(response.data)[0]?.id ?? null;
}

// The saved examples whose label, or whose metadata, differ from the examples now.
async function changedExamples(
  client: PhoenixClient,
  name: string,
  datasetId: string,
  examples: GoldenExample[],
): Promise<ChangedExample[]> {
  const saved = savedExampleListSchema.parse(
    (await getDatasetExamples({ client, dataset: { datasetId } })).examples,
  );
  return examples.flatMap((example) => {
    const match = saved.find((s) => s.spanId === example.spanId);
    if (match === undefined) {
      throw new Error(`${name} has no turn ${String(example.spanId)}.`);
    }
    const same =
      isDeepStrictEqual(match.output, example.output) &&
      isDeepStrictEqual(match.metadata, example.metadata);
    return same ? [] : [{ id: match.id, example }];
  });
}
