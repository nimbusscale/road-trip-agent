import { randomUUID } from "node:crypto";

import { SESSION_ID } from "./fake-sdk-messages.schema.js";

// A worker's transcript lines, for tests of code that reads them (DEVELOPMENT.md section
// 5). It's a schema file only so it can use the SDK's snake_case names, as
// fake-sdk-messages.schema.ts does.

// A line of a worker's transcript, as getSubagentMessages() gives it, written at the
// given second past noon.
export function transcriptLine(
  type: string,
  second: number,
  message: unknown,
): unknown {
  return {
    type,
    uuid: randomUUID(),
    session_id: SESSION_ID,
    parent_tool_use_id: null,
    parent_agent_id: null,
    timestamp: new Date(Date.UTC(2026, 9, 25, 12, 0, second)).toISOString(),
    message,
  };
}

// The message on a transcript line from the model: one block of one call.
export function transcriptCall(
  id: string,
  output: number,
  content: readonly unknown[],
): unknown {
  return {
    id,
    model: "claude-fake-2",
    usage: {
      input_tokens: 2000,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
      output_tokens: output,
    },
    content,
  };
}
