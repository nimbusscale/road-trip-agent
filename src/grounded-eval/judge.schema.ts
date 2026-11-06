import type {
  Message,
  MessageCreateParams,
  MessageCreateParamsNonStreaming,
} from "@anthropic-ai/sdk/resources/messages/messages";
import type { AnthropicInvocationParameters } from "@arizeai/phoenix-client/types/prompts";

import {
  answerJsonSchema,
  type LabelAnswer,
  labelAnswerSchema,
} from "./label-answer.schema.js";

// The judge's model settings, as the Phoenix prompt stores them (#282). Haiku takes
// only adaptive thinking. High effort matched the Claude Code runs on the golden set.
export function judgeInvocationParameters(
  maxTokens: number,
): AnthropicInvocationParameters {
  return {
    max_tokens: maxTokens,
    thinking: { type: "adaptive" },
    output_config: { effort: "high" },
  };
}

// The request for one turn: the Phoenix prompt with the turn's judge input in its
// slot, and the answer's JSON schema as the structured output. The slot is filled
// with a function, so a "$$" in the input stays as it is.
export function judgeRequestOf(
  prompt: MessageCreateParams,
  slot: string,
  judgeInput: string,
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
      format: { type: "json_schema", schema: judgeAnswerSchema() },
    },
  };
}

// The answer's schema without its "$schema" line, which the API doesn't need.
function judgeAnswerSchema(): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(answerJsonSchema()).filter(([key]) => key !== "$schema"),
  );
}

// The judge's answer, or an error that says why there's none.
export function judgeAnswerOf(message: Message): LabelAnswer {
  if (message.stop_reason !== "end_turn") {
    throw new Error(`The judge stopped with ${String(message.stop_reason)}.`);
  }
  const text = message.content.find((block) => block.type === "text");
  if (text === undefined) {
    throw new Error("The judge's reply has no text.");
  }
  return labelAnswerSchema.parse(JSON.parse(text.text));
}
