import Anthropic from "@anthropic-ai/sdk";
import type { MessageCreateParams } from "@anthropic-ai/sdk/resources/messages/messages";
import { createClient } from "@arizeai/phoenix-client";
import {
  asExperimentEvaluator,
  runExperiment,
} from "@arizeai/phoenix-client/experiments";
import { toSDK } from "@arizeai/phoenix-client/prompts";

import { GOLDEN_DATASET } from "./golden-set.js";
import {
  goldenExpectedSchema,
  goldenInputSchema,
  judgeApiKeyOf,
} from "./golden-set.schema.js";
import {
  CONVERSATION_SLOT,
  JUDGE_MODEL,
  readJudgePrompt,
} from "./judge-prompt.js";
import { judgeAnswerOf, judgeRequestOf } from "./judge.schema.js";
import type { LabelAnswer } from "./label-answer.schema.js";

// Five turns at a time keeps a run of the golden set to a few minutes, well inside
// the API account's rate limits.
export const CONCURRENCY = 5;

// Each turn is judged 3 times, so a rubric change can be told apart from the judge's
// run-to-run differences.
const REPETITIONS = 3;

// Runs the judge on the golden set as a Phoenix experiment, with the prompt version
// pushed for the rubric commit (#282). The description says what that rubric
// version changed. Phoenix keeps each turn's answers, and scores
// whether each label matches the settled one.
export async function runJudgeExperiment(
  phoenixUrl: string,
  rubricVersion: string,
  description: string,
): Promise<void> {
  const { judge, promptVersionId } = await judgeFor(phoenixUrl, rubricVersion);
  await runExperiment({
    client: createClient({ options: { baseUrl: phoenixUrl } }),
    experimentName: `rubric ${rubricVersion}`,
    experimentDescription: description,
    experimentMetadata: {
      rubric: rubricVersion,
      model: JUDGE_MODEL,
      promptVersionId,
    },
    dataset: { datasetName: GOLDEN_DATASET },
    task: async (example) =>
      judge(goldenInputSchema.parse(example.input).judgeInput),
    evaluators: [labelMatches],
    concurrency: CONCURRENCY,
    repetitions: REPETITIONS,
  });
}

export type Judge = (judgeInput: string) => Promise<LabelAnswer>;

// The judge with the prompt version pushed for the rubric commit. It answers for one
// turn's judge input, with every fact it found.
export async function judgeFor(
  phoenixUrl: string,
  rubricVersion: string,
): Promise<{ judge: Judge; promptVersionId: string }> {
  const prompt = await readJudgePrompt(phoenixUrl, rubricVersion);
  const request = toSDK({ sdk: "anthropic", prompt });
  if (request === null) {
    throw new Error("The judge's prompt isn't a chat prompt.");
  }
  const anthropic = new Anthropic({
    apiKey: judgeApiKeyOf(process.env),
    authToken: null,
  });
  return {
    judge: (judgeInput) => judgeTurn(anthropic, request, judgeInput),
    promptVersionId: prompt.id,
  };
}

async function judgeTurn(
  anthropic: Anthropic,
  prompt: MessageCreateParams,
  judgeInput: string,
): Promise<LabelAnswer> {
  const message = await anthropic.messages
    .stream(judgeRequestOf(prompt, CONVERSATION_SLOT, judgeInput))
    .finalMessage();
  return judgeAnswerOf(message);
}

const labelMatches = asExperimentEvaluator({
  name: "label matches",
  kind: "CODE",
  evaluate: ({ output, expected }) => {
    const expectedLabel = goldenExpectedSchema.parse(expected).label;
    const label = goldenExpectedSchema.parse(output).label;
    return {
      score: label === expectedLabel ? 1 : 0,
      label: `${label}, expected ${expectedLabel}`,
    };
  },
});
