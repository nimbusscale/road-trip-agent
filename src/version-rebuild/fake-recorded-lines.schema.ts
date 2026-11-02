// Made-up transcript lines, in the shapes the Agent SDK writes, for the rebuild's tests
// (DEVELOPMENT.md section 5). It's a schema file only so it can use the SDK's snake_case
// names, as src/agent/fake-sdk-messages.schema.ts does.

export function userMessage(at: string, text: string): unknown {
  return { type: "user", timestamp: at, message: { content: text } };
}

export function toolUse(
  at: string,
  id: string,
  name: string,
  input = {},
): unknown {
  return {
    type: "assistant",
    timestamp: at,
    message: { content: [{ type: "tool_use", id, name, input }] },
  };
}

export function toolResult(
  at: string,
  id: string,
  text: string,
  isError = false,
): unknown {
  return {
    type: "user",
    timestamp: at,
    message: {
      content: [
        {
          type: "tool_result",
          tool_use_id: id,
          content: [{ type: "text", text }],
          is_error: isError,
        },
      ],
    },
  };
}
