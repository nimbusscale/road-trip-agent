import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import {
  OpenInferenceSpanKind,
  SemanticConventions,
} from "@arizeai/openinference-semantic-conventions";
import {
  type Context,
  context,
  type Span,
  SpanStatusCode,
  trace,
} from "@opentelemetry/api";

import {
  callBlocksOf,
  endModelCall,
  endToolSpan,
  type ModelCall,
  startToolSpan,
  textInput,
  textOutput,
  tracer,
} from "./trace-spans.js";
import { toolResultsOf, toolResultText } from "./turn-event.js";
import {
  endWorker,
  type ReadWorkerTranscript,
  startWorker,
  type Worker,
} from "./worker-trace.js";
import type { CallTokens } from "./worker-transcript.schema.js";

type AssistantMessage = Extract<SDKMessage, { type: "assistant" }>;
type UserContent = Extract<SDKMessage, { type: "user" }>["message"]["content"];
type ResultMessage = Extract<SDKMessage, { type: "result" }>;
type TaskStartedMessage = Extract<SDKMessage, { subtype: "task_started" }>;
type StreamEvent = Extract<SDKMessage, { type: "stream_event" }>["event"];
type Usage = AssistantMessage["message"]["usage"];

export interface TurnTraceGiven {
  // The message the model got, with the app's lines added.
  message: string;
  agentSessionId: string;
  userId: string;
  readWorkerTranscript: ReadWorkerTranscript;
}

interface ToolCall {
  span: Span;
  startedAt: Date;
}

// The trace of one coordinator turn, made from the SDK's messages (systems design
// section 10). The turn's span holds the message the model got and the reply. Under
// it, in order, is a span for each model call, with its thinking, text, tool calls, and
// tokens, and a span for each tool call. A worker's spans go under the Agent tool call
// that started it.
//
// A model call's span runs from its message_start event to its last block or event,
// so the coordinator's options turn on the SDK's stream events. A block's tokens are
// those from the call's start, so the output count is only right once the call's
// message_delta event has come. A tool's span runs from when its call arrives to when
// its result does.
export class TurnTrace {
  readonly #given: TurnTraceGiven;
  readonly #turn: Span;
  readonly #context: Context;
  readonly #tools = new Map<string, ToolCall>();
  // By the ID of the coordinator's Agent call that started each one.
  readonly #workers = new Map<string, Worker>();
  #call: ModelCall | undefined;
  #stepEndedAt: Date;
  #hasResult = false;

  constructor(given: TurnTraceGiven) {
    this.#given = given;
    this.#stepEndedAt = new Date();
    this.#turn = tracer().startSpan("coordinator.turn", {
      startTime: this.#stepEndedAt,
      attributes: {
        [SemanticConventions.OPENINFERENCE_SPAN_KIND]:
          OpenInferenceSpanKind.AGENT,
        [SemanticConventions.AGENT_NAME]: "coordinator",
        [SemanticConventions.SESSION_ID]: given.agentSessionId,
        [SemanticConventions.USER_ID]: given.userId,
        ...textInput(given.message),
      },
    });
    this.#context = trace.setSpan(context.active(), this.#turn);
  }

  // A worker's messages carry the ID of the Agent call that started it.
  record(message: SDKMessage): void {
    if (
      "parent_tool_use_id" in message &&
      typeof message.parent_tool_use_id === "string"
    ) {
      this.#recordWorkerMessage(message.parent_tool_use_id, message);
      return;
    }
    switch (message.type) {
      case "assistant":
        this.#recordBlocks(message);
        break;
      case "user":
        this.#recordToolResults(message.message.content, true);
        break;
      case "result":
        this.#recordResult(message);
        break;
      case "stream_event":
        this.#recordStreamEvent(message.event);
        break;
      case "system":
        if (message.subtype === "task_started") {
          this.#startWorker(message);
        }
        break;
      default:
        break;
    }
  }

  // Ends every span still open, such as when the turn failed before its result. Each
  // worker's model calls are read from its transcript first.
  async end(): Promise<void> {
    this.#endCall();
    for (const worker of this.#workers.values()) {
      await endWorker(
        worker,
        this.#given.agentSessionId,
        this.#given.readWorkerTranscript,
      );
    }
    this.#workers.clear();
    for (const { span } of this.#tools.values()) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: "The turn ended before the tool's result.",
      });
      span.end();
    }
    this.#tools.clear();
    if (!this.#hasResult) {
      this.#turn.setStatus({
        code: SpanStatusCode.ERROR,
        message: "The turn ended with no result.",
      });
    }
    this.#turn.end();
  }

  #recordStreamEvent(event: StreamEvent): void {
    const now = new Date();
    if (event.type === "message_start") {
      const { id, model, usage } = event.message;
      this.#startCall(id, model, tokensOf(usage), now);
      return;
    }
    const call = this.#call;
    if (call === undefined) {
      return;
    }
    if (event.type === "message_delta") {
      const { usage } = event;
      call.tokens = {
        input: usage.input_tokens ?? call.tokens.input,
        cacheRead: usage.cache_read_input_tokens ?? call.tokens.cacheRead,
        cacheWrite: usage.cache_creation_input_tokens ?? call.tokens.cacheWrite,
        output: usage.output_tokens,
      };
      call.endedAt = now;
    } else if (event.type === "message_stop") {
      call.endedAt = now;
    }
  }

  #recordBlocks(message: AssistantMessage): void {
    const now = new Date();
    const { id, model, usage, content } = message.message;
    if (this.#call?.id !== id) {
      this.#startCall(id, model, tokensOf(usage), this.#stepEndedAt);
    }
    const call = this.#call;
    if (call === undefined) {
      return;
    }
    if (now > call.endedAt) {
      call.endedAt = now;
    }
    for (const block of callBlocksOf(content)) {
      call.blocks.push(block);
      if (block.type === "toolUse") {
        this.#startTool(block, now, this.#context);
      }
    }
  }

  #startCall(id: string, model: string, tokens: CallTokens, at: Date): void {
    this.#endCall();
    this.#call = {
      id,
      span: tracer().startSpan(
        "coordinator.model_call",
        { startTime: at },
        this.#context,
      ),
      model,
      tokens,
      blocks: [],
      endedAt: at,
    };
  }

  #endCall(): void {
    if (this.#call !== undefined) {
      endModelCall(this.#call);
      this.#call = undefined;
    }
  }

  #startTool(
    block: Parameters<typeof startToolSpan>[0],
    at: Date,
    parent: Context,
  ): void {
    this.#tools.set(block.id, {
      span: startToolSpan(block, at, parent),
      startedAt: at,
    });
  }

  // The coordinator's next model call starts when its last tool result arrives. A
  // worker's tool results don't move it.
  #recordToolResults(content: UserContent, isCoordinator: boolean): void {
    for (const block of toolResultsOf(content)) {
      const tool = this.#tools.get(block.tool_use_id);
      if (tool === undefined) {
        continue;
      }
      const now = new Date();
      const worker = this.#workers.get(block.tool_use_id);
      if (worker !== undefined) {
        worker.endedAt = now;
        worker.span.setAttributes(textOutput(toolResultText(block)));
      }
      endToolSpan(tool.span, block, now);
      if (isCoordinator) {
        this.#stepEndedAt = now;
      }
      this.#tools.delete(block.tool_use_id);
    }
  }

  #recordResult(result: ResultMessage): void {
    this.#hasResult = true;
    if (result.subtype === "success") {
      this.#turn.setAttributes(textOutput(result.result));
    }
    this.#turn.setStatus(
      result.subtype === "success" && !result.is_error
        ? { code: SpanStatusCode.OK }
        : { code: SpanStatusCode.ERROR, message: result.subtype },
    );
  }

  #startWorker(message: TaskStartedMessage): void {
    const toolUseId = message.tool_use_id;
    if (toolUseId !== undefined) {
      this.#workerFor(toolUseId, message.subagent_type, message.prompt);
    }
  }

  // A worker's span starts when the coordinator's call for it arrived, since its prompt
  // is written to its transcript before the SDK sends task_started.
  #workerFor(toolUseId: string, name = "worker", prompt?: string): Worker {
    const known = this.#workers.get(toolUseId);
    if (known !== undefined) {
      return known;
    }
    const tool = this.#tools.get(toolUseId);
    const worker = startWorker({
      name,
      prompt,
      agentSessionId: this.#given.agentSessionId,
      startedAt: tool?.startedAt ?? new Date(),
      parent:
        tool === undefined
          ? this.#context
          : trace.setSpan(this.#context, tool.span),
    });
    this.#workers.set(toolUseId, worker);
    return worker;
  }

  // A worker's tool calls and results. Its model calls come from its transcript when
  // the turn ends.
  #recordWorkerMessage(toolUseId: string, message: SDKMessage): void {
    if (message.type === "assistant") {
      const worker = this.#workerFor(toolUseId);
      worker.agentId ??= message.agent_id;
      const now = new Date();
      for (const block of callBlocksOf(message.message.content)) {
        if (block.type === "toolUse") {
          this.#startTool(block, now, worker.context);
        }
      }
    } else if (message.type === "user") {
      this.#recordToolResults(message.message.content, false);
    }
  }
}

function tokensOf(usage: Usage): CallTokens {
  return {
    input: usage.input_tokens,
    cacheRead: usage.cache_read_input_tokens ?? 0,
    cacheWrite: usage.cache_creation_input_tokens ?? 0,
    output: usage.output_tokens,
  };
}
