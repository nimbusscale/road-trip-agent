import type { MessageCreateParams } from "@anthropic-ai/sdk/resources/messages/messages";
import { createClient } from "@arizeai/phoenix-client";
import {
  createPrompt,
  getPrompt,
  promptVersion,
  upsertPromptVersionTag,
} from "@arizeai/phoenix-client/prompts";

import { judgeInvocationParameters, promptTagPathOf } from "./judge.schema.js";
import { labelPromptOf, type LabelingTask, type Rubric } from "./labeling.js";

// A judge's prompt in Phoenix, for the grounded (#282) and saving (#209) evaluators.
// The repo's rubric stays the source, and each committed version is pushed here, tagged
// with its commit, so each experiment links to the prompt version it ran. The judge
// reads the same prompt as the evaluator's labelers.
export interface JudgeSpec<Answer> {
  promptName: string;
  description: string;
  rubricPath: string;
  // Where the judge code puts the turn's input. It fills it in itself, since Phoenix's
  // own filling treats a "$$" price level in the input as a single "$".
  slot: string;
  labeling: LabelingTask<Answer>;
}

export const JUDGE_MODEL = "claude-haiku-5-5";

// Room for the thinking and the answer on the longest turns, which ran to about
// 20,000 output tokens in the grounded evaluator's Claude Code runs.
const MAX_TOKENS = 32000;

type PhoenixClient = ReturnType<typeof createClient>;

export type JudgePrompt = NonNullable<Awaited<ReturnType<typeof getPrompt>>>;

// Phoenix tag names can't start with a digit, as a commit can.
export function tagOf(rubricVersion: string): string {
  return `rubric-${rubricVersion}`;
}

// Pushes the rubric as a new version of the judge's prompt, unless that commit is
// already there. Returns whether it pushed.
export async function pushJudgePrompt(
  phoenixUrl: string,
  spec: JudgeSpec<unknown>,
  rubric: Rubric,
): Promise<boolean> {
  const client = createClient({ options: { baseUrl: phoenixUrl } });
  if (await tagExists(client, spec.promptName, rubric.version)) {
    return false;
  }
  const version = await createPrompt({
    client,
    name: spec.promptName,
    description: spec.description,
    version: promptVersion({
      modelProvider: "ANTHROPIC",
      modelName: JUDGE_MODEL,
      description: `${spec.rubricPath} at ${rubric.version}`,
      metadata: { rubric: rubric.version },
      template: [
        {
          role: "user",
          content: labelPromptOf(spec.labeling, rubric.text, spec.slot),
        },
      ],
      invocationParameters: judgeInvocationParameters(MAX_TOKENS),
    }),
  });
  await upsertPromptVersionTag({
    client,
    prompt: { versionId: version.id },
    name: tagOf(rubric.version),
  });
  return true;
}

// The request the pushed prompt gives, built from a rubric's text without Phoenix, to
// try a rubric change on a few turns before it's committed and pushed.
export function localJudgePrompt(
  spec: JudgeSpec<unknown>,
  rubricText: string,
): MessageCreateParams {
  return {
    model: JUDGE_MODEL,
    ...judgeInvocationParameters(MAX_TOKENS),
    messages: [
      {
        role: "user",
        content: labelPromptOf(spec.labeling, rubricText, spec.slot),
      },
    ],
  };
}

// The judge's prompt for a rubric commit, which must already be pushed.
export async function readJudgePrompt(
  phoenixUrl: string,
  spec: JudgeSpec<unknown>,
  rubricVersion: string,
): Promise<JudgePrompt> {
  const client = createClient({ options: { baseUrl: phoenixUrl } });
  const prompt = await getPrompt({
    client,
    prompt: { name: spec.promptName, tag: tagOf(rubricVersion) },
  });
  if (prompt === null) {
    throw new Error(
      `${spec.promptName} has no version for rubric ${rubricVersion}. Run push-prompt first.`,
    );
  }
  return prompt;
}

// Asked directly, since getPrompt logs the 404 for a tag that isn't there yet.
async function tagExists(
  client: PhoenixClient,
  promptName: string,
  rubricVersion: string,
): Promise<boolean> {
  try {
    await client.GET("/v1/prompts/{prompt_identifier}/tags/{tag_name}", {
      params: { path: promptTagPathOf(promptName, tagOf(rubricVersion)) },
    });
    return true;
  } catch (error) {
    if (error instanceof Error && "status" in error && error.status === 404) {
      return false;
    }
    throw error;
  }
}
