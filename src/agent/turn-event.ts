import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

// What a coordinator turn hands the app, made from the Agent SDK's messages. The browser
// chat and the terminal chat show these, so neither reads the SDK's own shapes, and a
// test can fake a turn with them (DEVELOPMENT.md section 5).
export type TurnEvent =
  | { kind: "started"; model: string; tools: readonly string[] }
  // The message the model got, with the app's lines added (technical spec 5.2).
  | { kind: "message"; text: string }
  // A summary of the model's thinking (technical spec 5.4).
  | { kind: "thinking"; text: string }
  | { kind: "text"; text: string }
  | { kind: "toolCall"; name: string; input: unknown }
  | { kind: "toolReply"; text: string; isError: boolean }
  // Any other system message from the SDK, such as a retry. `data` is the rest of its
  // fields.
  | { kind: "system"; subtype: string; data: Record<string, unknown> }
  // `failure` says why the turn failed, or is null when it succeeded. `usage` is null
  // when the turn failed before the SDK's result.
  | {
      kind: "ended";
      failure: string | null;
      durationMs: number;
      usage: TurnUsage | null;
    };

// The whole turn's model calls and tokens. Input tokens include those read from, and
// written to, the prompt cache. `cachedInputTokens` is the part read from it.
export interface TurnUsage {
  modelCalls: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}

export function turnEventsOf(message: SDKMessage): TurnEvent[] {
  switch (message.type) {
    case "system":
      return systemEvents(message);
    case "assistant":
      return assistantEvents(message.message.content);
    case "user":
      return toolReplyEvents(message.message.content);
    case "result":
      return [
        {
          kind: "ended",
          failure: failureOf(message),
          durationMs: message.duration_ms,
          usage: usageOf(message),
        },
      ];
    default:
      return [];
  }
}

type SystemMessage = Extract<SDKMessage, { type: "system" }>;

// Thinking token counts come many times a second while the model thinks, so they're
// left out.
function systemEvents(message: SystemMessage): TurnEvent[] {
  if (message.subtype === "init") {
    return [{ kind: "started", model: message.model, tools: message.tools }];
  }
  if (message.subtype === "thinking_tokens") {
    return [];
  }
  const data = Object.fromEntries(
    Object.entries(message).filter(([key]) => !SYSTEM_MESSAGE_IDS.has(key)),
  );
  return [{ kind: "system", subtype: message.subtype, data }];
}

// The fields every system message has, which say nothing about this one.
const SYSTEM_MESSAGE_IDS = new Set(["type", "subtype", "uuid", "session_id"]);

type ResultMessage = Extract<SDKMessage, { type: "result" }>;

// Such as "error_during_execution: <the SDK's errors>". A "success" that's an error,
// such as when the Claude API fails, carries the error's text in `result`.
function failureOf(message: ResultMessage): string | null {
  if (message.subtype === "success") {
    return message.is_error ? `${message.subtype}: ${message.result}` : null;
  }
  return [message.subtype, ...message.errors].join(": ");
}

function usageOf(message: ResultMessage): TurnUsage {
  const { usage } = message;
  return {
    modelCalls: message.num_turns,
    inputTokens:
      usage.input_tokens +
      usage.cache_creation_input_tokens +
      usage.cache_read_input_tokens,
    cachedInputTokens: usage.cache_read_input_tokens,
    outputTokens: usage.output_tokens,
  };
}

type AssistantContent = Extract<
  SDKMessage,
  { type: "assistant" }
>["message"]["content"];

// A thinking block with no summary, such as one cut off by the model's output limit,
// has nothing to show.
function assistantEvents(content: AssistantContent): TurnEvent[] {
  return content.flatMap((block): TurnEvent[] => {
    switch (block.type) {
      case "thinking":
        return block.thinking === ""
          ? []
          : [{ kind: "thinking", text: block.thinking }];
      case "text":
        return [{ kind: "text", text: block.text }];
      case "tool_use":
        return [{ kind: "toolCall", name: block.name, input: block.input }];
      default:
        return [];
    }
  });
}

type UserContent = Extract<SDKMessage, { type: "user" }>["message"]["content"];

export type ToolResultBlock = Extract<
  Exclude<UserContent, string>[number],
  { type: "tool_result" }
>;

function toolReplyEvents(content: UserContent): TurnEvent[] {
  return toolResultsOf(content).map((block) => ({
    kind: "toolReply",
    text: toolResultText(block),
    isError: block.is_error === true,
  }));
}

export function toolResultsOf(content: UserContent): ToolResultBlock[] {
  if (typeof content === "string") {
    return [];
  }
  return content.filter(
    (block): block is ToolResultBlock => block.type === "tool_result",
  );
}

export function toolResultText(block: ToolResultBlock): string {
  const parts =
    typeof block.content === "string" ? [block.content] : (block.content ?? []);
  return parts
    .map((part) =>
      typeof part === "string" ? part : part.type === "text" ? part.text : "",
    )
    .join("\n");
}
