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
import { GROUNDED_JUDGE } from "./grounded-labeling.js";
import {
  JUDGE_MODEL,
  type JudgeSpec,
  readJudgePrompt,
} from "./judge-prompt.js";
import { judgeAnswerOf, judgeRequestOf } from "./judge.schema.js";

// Five turns at a time keeps a run of the golden set to a few minutes, well inside
// the API account's rate limits.
export const CONCURRENCY = 5;

// Each turn is judged 3 times, so a rubric change can be told apart from the judge's
// run-to-run differences.
export const REPETITIONS = 3;

// Runs the judge on the golden set as a Phoenix experiment, with the prompt version
// pushed for the rubric commit (#282). The description says what that rubric
// version changed. Phoenix keeps each turn's answers, and scores
// whether each label matches the settled one.
export async function runJudgeExperiment(
  phoenixUrl: string,
  rubricVersion: string,
  description: string,
): Promise<void> {
  const { judge, promptVersionId } = await judgeFor(
    phoenixUrl,
    GROUNDED_JUDGE,
    rubricVersion,
  );
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

export type Judge<Answer> = (judgeInput: string) => Promise<Answer>;

// The judge with the prompt version pushed for the rubric commit. It answers for one
// turn's judge input.
export async function judgeFor<Answer>(
  phoenixUrl: string,
  spec: JudgeSpec<Answer>,
  rubricVersion: string,
): Promise<{ judge: Judge<Answer>; promptVersionId: string }> {
  const prompt = await readJudgePrompt(phoenixUrl, spec, rubricVersion);
  const request = toSDK({ sdk: "anthropic", prompt });
  if (request === null) {
    throw new Error("The judge's prompt isn't a chat prompt.");
  }
  return { judge: judgeOf(spec, request), promptVersionId: prompt.id };
}

// The judge with a given prompt, such as one built from a rubric not yet pushed.
export function judgeOf<Answer>(
  spec: JudgeSpec<Answer>,
  prompt: MessageCreateParams,
): Judge<Answer> {
  const anthropic = new Anthropic({
    apiKey: judgeApiKeyOf(process.env),
    authToken: null,
  });
  return async (judgeInput) => {
    const message = await anthropic.messages
      .stream(
        judgeRequestOf(
          prompt,
          spec.slot,
          judgeInput,
          spec.labeling.answerJsonSchema,
        ),
      )
      .finalMessage();
    return judgeAnswerOf(message, spec.labeling.parseAnswer);
  };
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
