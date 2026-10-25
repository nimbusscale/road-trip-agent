import { randomUUID } from "node:crypto";

import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

// The Agent SDK's messages, for tests of code that reads them (DEVELOPMENT.md section
// 5). Each has only what such code reads. The rest are the SDK's required fields, set
// to empty values. It's a schema file only so it can use the SDK's snake_case names,
// as sdk-user-message.schema.ts does.

type AssistantMessage = Extract<SDKMessage, { type: "assistant" }>;
type Content = AssistantMessage["message"]["content"];
type Usage = AssistantMessage["message"]["usage"];

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

export function successResult(reply: string): SDKMessage {
  return {
    type: "result",
    subtype: "success",
    result: reply,
    is_error: false,
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
