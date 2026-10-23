import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

// What a coordinator turn hands the app, made from the Agent SDK's messages. The browser
// chat and the terminal chat show these, so neither reads the SDK's own shapes, and a
// test can fake a turn with them (DEVELOPMENT.md section 5).
export type TurnEvent =
  | { kind: "started"; model: string; tools: readonly string[] }
  | { kind: "text"; text: string }
  | { kind: "toolCall"; name: string; input: unknown }
  | { kind: "toolReply"; text: string; isError: boolean }
  | { kind: "ended"; succeeded: boolean; durationMs: number };

export function turnEventsOf(message: SDKMessage): TurnEvent[] {
  switch (message.type) {
    case "system":
      return message.subtype === "init"
        ? [{ kind: "started", model: message.model, tools: message.tools }]
        : [];
    case "assistant":
      return assistantEvents(message.message.content);
    case "user":
      return toolReplyEvents(message.message.content);
    case "result":
      return [
        {
          kind: "ended",
          succeeded: message.subtype === "success" && !message.is_error,
          durationMs: message.duration_ms,
        },
      ];
    default:
      return [];
  }
}

type AssistantContent = Extract<
  SDKMessage,
  { type: "assistant" }
>["message"]["content"];

function assistantEvents(content: AssistantContent): TurnEvent[] {
  return content.flatMap((block): TurnEvent[] => {
    if (block.type === "text") {
      return [{ kind: "text", text: block.text }];
    }
    if (block.type === "tool_use") {
      return [{ kind: "toolCall", name: block.name, input: block.input }];
    }
    return [];
  });
}

type UserContent = Extract<SDKMessage, { type: "user" }>["message"]["content"];

function toolReplyEvents(content: UserContent): TurnEvent[] {
  if (typeof content === "string") {
    return [];
  }
  return content.flatMap((block): TurnEvent[] => {
    if (block.type !== "tool_result") {
      return [];
    }
    const parts =
      typeof block.content === "string"
        ? [block.content]
        : (block.content ?? []);
    const text = parts
      .map((part) =>
        typeof part === "string" ? part : part.type === "text" ? part.text : "",
      )
      .join("\n");
    return [{ kind: "toolReply", text, isError: block.is_error === true }];
  });
}
