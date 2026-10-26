import { randomUUID } from "node:crypto";

import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

// The Agent SDK's messages, for tests of code that reads them (DEVELOPMENT.md section
// 5). Each has only what such code reads. The rest are the SDK's required fields, set
// to empty values. It's a schema file only so it can use the SDK's snake_case names,
// as sdk-user-message.schema.ts does.

type AssistantMessage = Extract<SDKMessage, { type: "assistant" }>;
type Content = AssistantMessage["message"]["content"];
type Usage = AssistantMessage["message"]["usage"];
type SuccessResult = Extract<SDKMessage, { subtype: "success" }>;
type ErrorResult = Exclude<
  Extract<SDKMessage, { type: "result" }>,
  SuccessResult
>;

export const SESSION_ID = "c0ffee00-0000-4000-8000-000000000001";

export interface FakeTokens {
  input: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
}

export const START_TOKENS: FakeTokens = {
  input: 10,
  cacheRead: 9000,
  cacheWrite: 1000,
  output: 8,
};

function usageOf(tokens: FakeTokens): Usage {
  return {
    input_tokens: tokens.input,
    cache_read_input_tokens: tokens.cacheRead,
    cache_creation_input_tokens: tokens.cacheWrite,
    output_tokens: tokens.output,
    cache_creation: null,
    fallback_credit: null,
    inference_geo: null,
    iterations: null,
    output_tokens_details: null,
    server_tool_use: null,
    service_tier: null,
    speed: null,
  };
}

function apiMessage(
  id: string,
  content: Content,
  tokens: FakeTokens,
): AssistantMessage["message"] {
  return {
    id,
    type: "message",
    role: "assistant",
    model: "claude-fake-1",
    content,
    usage: usageOf(tokens),
    container: null,
    context_management: null,
    diagnostics: null,
    stop_details: null,
    stop_reason: null,
    stop_sequence: null,
  };
}

export interface FromWorker {
  // The ID of the coordinator's Agent call that started the worker.
  parentToolUseId: string;
  agentId: string;
}

// One block of one model call, as the SDK sends it.
export function assistant(
  callId: string,
  content: Content,
  fromWorker?: FromWorker,
): SDKMessage {
  return {
    type: "assistant",
    message: apiMessage(callId, content, START_TOKENS),
    parent_tool_use_id: fromWorker?.parentToolUseId ?? null,
    ...(fromWorker === undefined ? {} : { agent_id: fromWorker.agentId }),
    uuid: randomUUID(),
    session_id: SESSION_ID,
  };
}

export function thinking(text: string): Content[number] {
  return { type: "thinking", thinking: text, signature: "" };
}

export function text(value: string): Content[number] {
  return { type: "text", text: value, citations: null };
}

export function toolUse(
  id: string,
  name: string,
  input: unknown,
): Content[number] {
  return { type: "tool_use", id, name, input };
}

export function toolResult(
  toolUseId: string,
  result: string,
  options: { isError?: boolean; fromWorker?: FromWorker } = {},
): SDKMessage {
  return {
    type: "user",
    message: {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: toolUseId,
          content: result,
          is_error: options.isError ?? false,
        },
      ],
    },
    parent_tool_use_id: options.fromWorker?.parentToolUseId ?? null,
    uuid: randomUUID(),
    session_id: SESSION_ID,
  };
}

function streamEvent(
  event: Extract<SDKMessage, { type: "stream_event" }>["event"],
): SDKMessage {
  return {
    type: "stream_event",
    event,
    parent_tool_use_id: null,
    uuid: randomUUID(),
    session_id: SESSION_ID,
  };
}

export function messageStart(callId: string): SDKMessage {
  return streamEvent({
    type: "message_start",
    message: apiMessage(callId, [], START_TOKENS),
  });
}

// The call's final output tokens.
export function messageDelta(output: number): SDKMessage {
  return streamEvent({
    type: "message_delta",
    delta: {
      stop_reason: "end_turn",
      stop_sequence: null,
      container: null,
      stop_details: null,
    },
    usage: {
      input_tokens: null,
      cache_read_input_tokens: null,
      cache_creation_input_tokens: null,
      output_tokens: output,
      fallback_credit: null,
      iterations: null,
      output_tokens_details: null,
      server_tool_use: null,
    },
    context_management: null,
  });
}

export function messageStop(): SDKMessage {
  return streamEvent({ type: "message_stop" });
}

export function taskStarted(
  toolUseId: string,
  name: string,
  prompt: string,
): SDKMessage {
  return {
    type: "system",
    subtype: "task_started",
    task_id: randomUUID(),
    tool_use_id: toolUseId,
    description: prompt,
    subagent_type: name,
    prompt,
    uuid: randomUUID(),
    session_id: SESSION_ID,
  };
}

export function init(model: string, tools: string[]): SDKMessage {
  return {
    type: "system",
    subtype: "init",
    apiKeySource: "none",
    claude_code_version: "",
    cwd: "",
    tools,
    mcp_servers: [],
    model,
    permissionMode: "dontAsk",
    slash_commands: [],
    output_style: "",
    skills: [],
    plugins: [],
    uuid: randomUUID(),
    session_id: SESSION_ID,
  };
}

// The fields of a retry that say what happened: the Claude API was overloaded, and the
// SDK waits half a second to try again.
export const API_RETRY_FIELDS = {
  attempt: 1,
  max_retries: 10,
  retry_delay_ms: 500,
  error_status: 529,
  error: "overloaded",
  no_response: { waited_ms: 30000, retry_wait_ms: 60000 },
} as const;

export function apiRetry(): SDKMessage {
  return {
    type: "system",
    subtype: "api_retry",
    ...API_RETRY_FIELDS,
    uuid: randomUUID(),
    session_id: SESSION_ID,
  };
}

export function thinkingTokens(estimated: number): SDKMessage {
  return {
    type: "system",
    subtype: "thinking_tokens",
    estimated_tokens: estimated,
    estimated_tokens_delta: estimated,
    uuid: randomUUID(),
    session_id: SESSION_ID,
  };
}

// What Claude Code is doing: about to call the model, or compacting the conversation.
export function status(value: "requesting" | "compacting"): SDKMessage {
  return {
    type: "system",
    subtype: "status",
    status: value,
    uuid: randomUUID(),
    session_id: SESSION_ID,
  };
}

export function successResult(reply: string): SDKMessage {
  return {
    ...resultFields(),
    subtype: "success",
    result: reply,
    is_error: false,
  } satisfies SuccessResult;
}

export function errorResult(errors: string[]): SDKMessage {
  return {
    ...resultFields(),
    subtype: "error_during_execution",
    is_error: true,
    errors,
  } satisfies ErrorResult;
}

// The fields a failed result has too.
function resultFields(): Omit<
  SuccessResult,
  "subtype" | "result" | "is_error"
> {
  return {
    type: "result",
    duration_ms: 1000,
    duration_api_ms: 900,
    num_turns: 1,
    stop_reason: "end_turn",
    total_cost_usd: 0,
    usage: {
      input_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
      output_tokens: 0,
      cache_creation: {
        ephemeral_1h_input_tokens: 0,
        ephemeral_5m_input_tokens: 0,
      },
      fallback_credit: null,
      inference_geo: "",
      iterations: [],
      output_tokens_details: { thinking_tokens: 0 },
      server_tool_use: { web_fetch_requests: 0, web_search_requests: 0 },
      service_tier: "standard",
      speed: "standard",
    },
    modelUsage: {},
    permission_denials: [],
    uuid: randomUUID(),
    session_id: SESSION_ID,
  };
}
