import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";

// A user message in the Agent SDK's own shape, which has snake_case names. It's built
// here, at the edge with the SDK, so the rest of the code sees only camelCase
// (DEVELOPMENT.md section 4).
export function sdkUserMessage(text: string): SDKUserMessage {
  return {
    type: "user",
    message: { role: "user", content: text },
    parent_tool_use_id: null,
    // Typed by a person. The SDK treats a message with no origin as unattributed.
    origin: { kind: "human" },
  };
}
