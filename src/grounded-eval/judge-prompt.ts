import { createClient } from "@arizeai/phoenix-client";
import {
  createPrompt,
  getPrompt,
  promptVersion,
  upsertPromptVersionTag,
} from "@arizeai/phoenix-client/prompts";

import { judgeInvocationParameters, promptTagPathOf } from "./judge.schema.js";
import { labelPromptOf, type Rubric } from "./labeling.js";

// The judge's prompt in Phoenix (#282). The repo's rubric stays the source, and each
// committed version is pushed here, tagged with its commit, so each experiment links
// to the prompt version it ran.
export const JUDGE_PROMPT = "grounded-judge";
export const JUDGE_MODEL = "claude-haiku-5-5";

// Where the judge code puts the turn's judge input. It fills it in itself, since
// Phoenix's own filling treats a "$$" price level in the input as a single "$".
export const CONVERSATION_SLOT = "{{conversation}}";

// Room for the thinking and the fact list on the longest turns, which ran to about
// 20,000 output tokens in the Claude Code runs.
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
  rubric: Rubric,
): Promise<boolean> {
  const client = createClient({ options: { baseUrl: phoenixUrl } });
  if (await tagExists(client, rubric.version)) {
    return false;
  }
  const version = await createPrompt({
    client,
    name: JUDGE_PROMPT,
    description:
      "The grounded evaluator's judge (#282). Pushed from evals/grounded/rubric.md.",
    version: promptVersion({
      modelProvider: "ANTHROPIC",
      modelName: JUDGE_MODEL,
      description: `evals/grounded/rubric.md at ${rubric.version}`,
      metadata: { rubric: rubric.version },
      template: [
        {
          role: "user",
          content: labelPromptOf(rubric.text, CONVERSATION_SLOT),
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

// The judge's prompt for a rubric commit, which must already be pushed.
export async function readJudgePrompt(
  phoenixUrl: string,
  rubricVersion: string,
): Promise<JudgePrompt> {
  const client = createClient({ options: { baseUrl: phoenixUrl } });
  const prompt = await getPrompt({
    client,
    prompt: { name: JUDGE_PROMPT, tag: tagOf(rubricVersion) },
  });
  if (prompt === null) {
    throw new Error(
      `${JUDGE_PROMPT} has no version for rubric ${rubricVersion}. Run push-prompt first.`,
    );
  }
  return prompt;
}

// Asked directly, since getPrompt logs the 404 for a tag that isn't there yet.
async function tagExists(
  client: PhoenixClient,
  rubricVersion: string,
): Promise<boolean> {
  try {
    await client.GET("/v1/prompts/{prompt_identifier}/tags/{tag_name}", {
      params: { path: promptTagPathOf(JUDGE_PROMPT, tagOf(rubricVersion)) },
    });
    return true;
  } catch (error) {
    if (error instanceof Error && "status" in error && error.status === 404) {
      return false;
    }
    throw error;
  }
}
