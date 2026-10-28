import { randomUUID } from "node:crypto";

import type {
  PostToolUseHookInput,
  PreToolUseHookInput,
  SubagentStopHookInput,
} from "@anthropic-ai/claude-agent-sdk";

import { SESSION_ID } from "./fake-sdk-messages.schema.js";

// The Agent SDK's hook inputs, for tests of the worker hooks (DEVELOPMENT.md section 5).
// Each has only what the hooks read, and the SDK's required fields, set to empty values.
// It's a schema file only so it can use the SDK's snake_case names.

const BASE = { session_id: SESSION_ID, transcript_path: "", cwd: "" };

// Who made a tool call: a worker, with its agent ID and type, or the coordinator, on the
// main thread, which has a type and no agent ID.
export type Caller =
  { agentId: string; agentType: string } | { agentType: string };

// A worker's tool call that succeeded, with the reply as the SDK gives an MCP tool's: its
// list of content blocks.
export function toolCall(
  caller: Caller,
  toolName: string,
  toolInput: unknown,
  reply = "",
): PostToolUseHookInput {
  return {
    ...BASE,
    hook_event_name: "PostToolUse",
    ...("agentId" in caller ? { agent_id: caller.agentId } : {}),
    agent_type: caller.agentType,
    tool_name: toolName,
    tool_input: toolInput,
    tool_response: [{ type: "text", text: reply }],
    tool_use_id: randomUUID(),
  };
}

// The coordinator's Agent call, once the worker is done. The output has the fields the
// SDK sends, with the worker's own last message as its content.
export function agentCallDone(
  agentType: string,
  agentId: string,
): PostToolUseHookInput {
  return agentCall(agentType, {
    status: "completed",
    prompt: "Fill the stops for the Moab stay.",
    agentId,
    agentType,
    content: [{ type: "text", text: "I added three places. All done!" }],
    totalToolUseCount: 4,
    totalDurationMs: 9421,
    totalTokens: 3844,
  });
}

export function agentCall(
  agentType: string,
  output: unknown,
): PostToolUseHookInput {
  return {
    ...BASE,
    hook_event_name: "PostToolUse",
    agent_type: "coordinator",
    tool_name: "Agent",
    tool_input: {
      description: "Fill the Moab stay",
      prompt: "Fill the stops for the Moab stay.",
      subagent_type: agentType,
    },
    tool_response: output,
    tool_use_id: randomUUID(),
  };
}

export function subagentStop(
  agentType: string,
  agentId: string,
): SubagentStopHookInput {
  return {
    ...BASE,
    hook_event_name: "SubagentStop",
    stop_hook_active: false,
    agent_id: agentId,
    agent_transcript_path: "",
    agent_type: agentType,
    last_assistant_message: "I added three places. All done!",
  };
}

// A WebSearch call, before it runs. With no domains, the search has no limit, and its
// input has no allowed_domains.
export function webSearchCall(
  caller: Caller,
  query: string,
  allowedDomains: string[] | undefined,
): PreToolUseHookInput {
  return {
    ...BASE,
    hook_event_name: "PreToolUse",
    ...("agentId" in caller ? { agent_id: caller.agentId } : {}),
    agent_type: caller.agentType,
    tool_name: "WebSearch",
    tool_input:
      allowedDomains === undefined
        ? { query }
        : { query, allowed_domains: allowedDomains },
    tool_use_id: randomUUID(),
  };
}
