import type {
  Message,
  MessageCreateParams,
  MessageCreateParamsNonStreaming,
} from "@anthropic-ai/sdk/resources/messages/messages";
import type { AnthropicInvocationParameters } from "@arizeai/phoenix-client/types/prompts";
import { z } from "zod";

// The judge's model settings, as the Phoenix prompt stores them (#282, #209). Haiku
// takes only adaptive thinking. High effort matched the Claude Code runs on the grounded
// golden set.
export function judgeInvocationParameters(
  maxTokens: number,
): AnthropicInvocationParameters {
  return {
    max_tokens: maxTokens,
    thinking: { type: "adaptive" },
    output_config: { effort: "high" },
  };
}

// The path of Phoenix's endpoint for one tag of a prompt.
export function promptTagPathOf(
  promptName: string,
  tagName: string,
): { prompt_identifier: string; tag_name: string } {
  return { prompt_identifier: promptName, tag_name: tagName };
}

// The request for one turn: the Phoenix prompt with the turn's judge input in its
// slot, and the answer's JSON Schema, as the labelers get it, as the structured
// output. The slot is filled with a function, so a "$$" in the input stays as it is.
export function judgeRequestOf(
  prompt: MessageCreateParams,
  slot: string,
  judgeInput: string,
  answerJsonSchema: string,
): MessageCreateParamsNonStreaming {
  return {
    ...prompt,
    stream: false,
    messages: prompt.messages.map((message) => ({
      ...message,
      content:
        typeof message.content === "string"
          ? message.content.replace(slot, () => judgeInput)
          : message.content.map((part) =>
              part.type === "text"
                ? { ...part, text: part.text.replace(slot, () => judgeInput) }
                : part,
            ),
    })),
    output_config: {
      ...prompt.output_config,
      format: {
        type: "json_schema",
        schema: apiSchemaOf(answerJsonSchema),
      },
    },
  };
}

// The answer's schema without its "$schema" line, which the API doesn't need.
function apiSchemaOf(answerJsonSchema: string): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(jsonSchemaSchema.parse(JSON.parse(answerJsonSchema))).filter(
      ([key]) => key !== "$schema",
    ),
  );
}

const jsonSchemaSchema = z.record(z.string(), z.unknown());

// The judge's answer, parsed with the evaluator's answer schema, or an error that
// says why there's none.
export function judgeAnswerOf<Answer>(
  message: Message,
  parseAnswer: (answer: unknown) => Answer,
): Answer {
  if (message.stop_reason !== "end_turn") {
    throw new Error(`The judge stopped with ${String(message.stop_reason)}.`);
  }
  const text = message.content.find((block) => block.type === "text");
  if (text === undefined) {
    throw new Error("The judge's reply has no text.");
  }
  return parseAnswer(JSON.parse(text.text));
}
