import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { asExperimentEvaluator } from "@arizeai/phoenix-client/experiments";
import type { EvaluationResult } from "@arizeai/phoenix-client/types/experiments";

import type { MemoryItem } from "../persistence/memory-item.js";
import type { MemoryReader } from "../persistence/memory-reader.js";
import {
  conversationSchema,
  expectedSchema,
  inputSchema,
  verdictSchema,
} from "./memory-eval.schema.js";

// Spike (#132): two ways to score the "user or trip memory" case (#48).

// The case: each statement, the memory it belongs in, and a pattern that finds it in a
// saved item.
export interface ExpectedItem {
  statement: string;
  memory: "user" | "trip";
  pattern: string;
}

export const JUDGE_MODEL = "claude-haiku-5-5";

interface SavedMemory {
  user: MemoryItem[];
  trip: MemoryItem[];
}

// Memory saved during the conversation. The user memory added before it is left out.
async function savedMemory(
  reader: MemoryReader,
  output: unknown,
  input: unknown,
): Promise<SavedMemory> {
  const { userId, tripId } = conversationSchema.parse(output);
  const before = new Set(inputSchema.parse(input).userMemory);
  const items = (await reader.read(userId, tripId)).filter(
    (item) => !before.has(item.text),
  );
  return {
    user: items.filter((item) => item.tripId === null),
    trip: items.filter((item) => item.tripId !== null),
  };
}

// Code: reads what was saved from the database. For each statement, one check that it's
// in the memory it belongs in, and one that it isn't in the other.
export function savedScopeScorer(reader: MemoryReader) {
  return asExperimentEvaluator({
    name: "saved-scope",
    kind: "CODE",
    evaluate: async ({ input, output, expected }) => {
      const saved = await savedMemory(reader, output, input);
      const checks = expectedSchema
        .parse(expected)
        .items.flatMap((item) => scopeChecks(item, saved));
      const failed = checks.filter((check) => !check.passed);
      return {
        score: (checks.length - failed.length) / checks.length,
        label: failed.length === 0 ? "pass" : "fail",
        explanation:
          failed.length === 0
            ? "Each statement was saved to the memory it belongs in, and only there."
            : failed.map((check) => check.text).join(" "),
        metadata: {
          userMemory: saved.user.map((item) => item.text),
          tripMemory: saved.trip.map((item) => item.text),
        },
      } satisfies EvaluationResult;
    },
  });
}

function scopeChecks(
  item: ExpectedItem,
  saved: SavedMemory,
): { passed: boolean; text: string }[] {
  const pattern = new RegExp(item.pattern, "i");
  const other = item.memory === "user" ? "trip" : "user";
  const inRight = saved[item.memory].some((saved) => pattern.test(saved.text));
  const inWrong = saved[other].some((saved) => pattern.test(saved.text));
  return [
    {
      passed: inRight,
      text: `"${item.statement}" isn't in ${item.memory} memory.`,
    },
    {
      passed: !inWrong,
      text: `"${item.statement}" is also in ${other} memory.`,
    },
  ];
}

const JUDGE_SYSTEM = `You grade one conversation between a user and a road trip planning assistant. You grade only how the assistant handled the user's memory.

The assistant keeps two memories:
- User memory holds standing preferences that apply to every trip the user plans, such as usual driving hours, meal habits, or budget rules. A statement with "never", "always", or "we usually" is a standing preference.
- Trip memory holds what applies to this trip only, such as "this time" requests, places to avoid on this trip, and open items.
The trip's dates, start and end places, length, and other trip details go in the trip's plan, not in memory.

You get the conversation, the memory items the assistant saved during it, and the statements the case expects it to save. Code has already checked which memory each statement landed in. Don't grade that. Grade these three criteria, each passed or failed:

1. faithful: each saved item keeps the user's meaning. It doesn't make it wider or narrower, and it doesn't add rules the user didn't state. Rewording is fine.
2. told: in its replies, the assistant told the user where it saved each expected statement, for all trips or for this trip only, in plain words.
3. nothing-extra: the assistant saved nothing to memory that belongs in the trip's plan, or that the user didn't say.

For each criterion, give a reason of one or two sentences that quotes the item or reply it's about.`;

export interface JudgeUsage {
  inputTokens: number;
  outputTokens: number;
}

// A model judge on Haiku, paid for with the API credits on JUDGE_API_KEY. The name
// doesn't start with ANTHROPIC_, so the coordinator never sees it as its key (src/agent/
// claude-env.ts). When the key is missing, or a call fails, the run gets no score and the
// error says why.
export function judgeScorer(reader: MemoryReader, apiKey: string | undefined) {
  const client = apiKey === undefined ? null : new Anthropic({ apiKey });
  return asExperimentEvaluator({
    name: "judge",
    kind: "LLM",
    evaluate: async ({ input, output, expected }) => {
      if (client === null) {
        return {
          score: null,
          label: "no key",
          explanation: "JUDGE_API_KEY isn't set.",
        };
      }
      const saved = await savedMemory(reader, output, input);
      try {
        return await judge(client, judgePrompt(output, expected, saved));
      } catch (error) {
        if (error instanceof Anthropic.APIError) {
          return {
            score: null,
            label: `error ${String(error.status)}`,
            explanation: error.message,
          };
        }
        throw error;
      }
    },
  });
}

function judgePrompt(
  output: unknown,
  expected: unknown,
  saved: SavedMemory,
): string {
  const { turns } = conversationSchema.parse(output);
  const conversation = turns
    .map(
      (turn) =>
        `<user>\n${turn.user}\n</user>\n<assistant>\n${turn.reply}\n</assistant>`,
    )
    .join("\n");
  const list = (items: MemoryItem[]): string =>
    items.length === 0
      ? "(none)"
      : items.map((item) => `- ${item.text}`).join("\n");
  const statements = expectedSchema
    .parse(expected)
    .items.map((item) => `- "${item.statement}": ${item.memory} memory`)
    .join("\n");
  return `<conversation>\n${conversation}\n</conversation>

<saved_user_memory>
${list(saved.user)}
</saved_user_memory>

<saved_trip_memory>
${list(saved.trip)}
</saved_trip_memory>

<expected_statements>
${statements}
</expected_statements>`;
}

// The score is the share of criteria passed, worked out here from the judge's answers.
async function judge(
  client: Anthropic,
  prompt: string,
): Promise<EvaluationResult> {
  const response = await client.messages.parse({
    model: JUDGE_MODEL,
    max_tokens: 16000,
    system: JUDGE_SYSTEM,
    messages: [{ role: "user", content: prompt }],
    output_config: { format: zodOutputFormat(verdictSchema) },
  });
  const verdict = response.parsed_output;
  const usage: JudgeUsage = {
    inputTokens:
      response.usage.input_tokens +
      (response.usage.cache_creation_input_tokens ?? 0) +
      (response.usage.cache_read_input_tokens ?? 0),
    outputTokens: response.usage.output_tokens,
  };
  if (verdict === null) {
    return {
      score: null,
      label: "unparsed",
      explanation: response.stop_reason ?? "",
      metadata: { usage },
    };
  }
  const passed = verdict.criteria.filter((criterion) => criterion.passed);
  return {
    score: passed.length / verdict.criteria.length,
    label: passed.length === verdict.criteria.length ? "pass" : "fail",
    explanation: verdict.criteria
      .map((c) => `${c.name}: ${c.passed ? "passed" : "failed"}. ${c.reason}`)
      .join("\n"),
    metadata: { usage, criteria: verdict.criteria },
  };
}
