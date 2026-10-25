import {
  getSubagentMessages,
  type SDKMessage,
  type SessionStore,
} from "@anthropic-ai/claude-agent-sdk";
import {
  OpenInferenceSpanKind,
  SemanticConventions,
} from "@arizeai/openinference-semantic-conventions";
import {
  type Attributes,
  type Context,
  context,
  type Span,
  SpanStatusCode,
  trace,
} from "@opentelemetry/api";

import { z } from "zod";

import { toolResultsOf, toolResultText } from "./turn-event.js";

const TRACER_NAME = "road-trip-agent";

type AssistantMessage = Extract<SDKMessage, { type: "assistant" }>;
type ResultMessage = Extract<SDKMessage, { type: "result" }>;
type TaskStartedMessage = Extract<SDKMessage, { subtype: "task_started" }>;
type StreamEvent = Extract<SDKMessage, { type: "stream_event" }>["event"];
type ContentBlock = AssistantMessage["message"]["content"][number];
type Usage = AssistantMessage["message"]["usage"];

// One model call: the blocks of one Claude API message, which the SDK sends one at a
// time, each with the call's ID. A block's tokens are those from the call's start, so
// the output count is only right once the call's message_delta event has come.
interface CallTokens {
  input: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
}

interface ModelCall {
  id: string;
  span: Span;
  model: string;
  tokens: CallTokens;
  blocks: ContentBlock[];
  endedAt: Date;
}

// Spike (#136): one worker, started by one of the coordinator's Agent tool calls. Its
// span is under that tool's span. Its tool spans are made from the stream as they come.
// Its model call spans are made when the turn ends, from its transcript, since the SDK
// sends none of a worker's stream events, and its text and thinking only with
// forwardSubagentText on. The transcript is read when the turn ends, since when the
// worker's result arrives, its last model call isn't in the session store yet.
interface Worker {
  name: string;
  agentId: string | undefined;
  span: Span;
  context: Context;
  startedAt: Date;
  endedAt: Date | undefined;
}

// Spike (#132, #136): the trace of one coordinator turn, made from the SDK's messages. The
// turn's span holds the message the model got and the reply. Under it, in order, is a
// span for each model call, with its thinking, text, tool calls, and tokens, and a span
// for each tool call. With no tracer provider set up, the spans go nowhere.
//
// A model call's span runs from its message_start event to its last block or event, so
// the coordinator's options turn on the SDK's stream events. Without them, a call's
// span would start when the step before it ended, and its output tokens would be wrong.
// A tool's span runs from when its call arrives to when its result does.
export class TurnTrace {
  readonly #turn: Span;
  readonly #context: Context;
  readonly #tools = new Map<string, Span>();
  readonly #toolStarts = new Map<string, Date>();
  // By the tool_use_id of the coordinator's Agent call that started each one.
  readonly #workers = new Map<string, Worker>();
  readonly #agentSessionId: string;
  readonly #sessionStore: SessionStore | undefined;
  #call: ModelCall | undefined;
  #stepEndedAt: Date;
  #hasResult = false;

  constructor(
    message: string,
    agentSessionId: string,
    sessionStore: SessionStore | undefined,
  ) {
    this.#agentSessionId = agentSessionId;
    this.#sessionStore = sessionStore;
    this.#stepEndedAt = new Date();
    this.#turn = tracer().startSpan("coordinator.turn", {
      startTime: this.#stepEndedAt,
      attributes: {
        [SemanticConventions.OPENINFERENCE_SPAN_KIND]:
          OpenInferenceSpanKind.AGENT,
        [SemanticConventions.INPUT_VALUE]: message,
        [SemanticConventions.INPUT_MIME_TYPE]: "text/plain",
        [SemanticConventions.SESSION_ID]: agentSessionId,
      },
    });
    this.#context = trace.setSpan(context.active(), this.#turn);
  }

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
        this.#recordToolResults(message.message.content);
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
      await this.#endWorker(worker);
    }
    this.#workers.clear();
    for (const span of this.#tools.values()) {
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
      this.#startCall(id, model, usage, now);
    } else if (event.type === "message_delta" && this.#call !== undefined) {
      const { usage } = event;
      const { tokens } = this.#call;
      this.#call.tokens = {
        input: usage.input_tokens ?? tokens.input,
        cacheRead: usage.cache_read_input_tokens ?? tokens.cacheRead,
        cacheWrite: usage.cache_creation_input_tokens ?? tokens.cacheWrite,
        output: usage.output_tokens,
      };
      this.#call.endedAt = now;
    } else if (event.type === "message_stop" && this.#call !== undefined) {
      this.#call.endedAt = now;
    }
  }

  #recordBlocks(message: AssistantMessage): void {
    const now = new Date();
    const { id, model, usage, content } = message.message;
    if (this.#call?.id !== id) {
      this.#startCall(id, model, usage, this.#stepEndedAt);
    }
    const call = this.#call;
    if (call === undefined) {
      return;
    }
    if (now > call.endedAt) {
      call.endedAt = now;
    }
    for (const block of content) {
      call.blocks.push(block);
      if (block.type === "tool_use") {
        this.#startTool(block.id, block.name, block.input, now);
      }
    }
  }

  #startCall(id: string, model: string, usage: Usage, at: Date): void {
    this.#endCall();
    this.#call = {
      id,
      span: tracer().startSpan(
        "coordinator.model_call",
        { startTime: at },
        this.#context,
      ),
      model,
      tokens: {
        input: usage.input_tokens,
        cacheRead: usage.cache_read_input_tokens ?? 0,
        cacheWrite: usage.cache_creation_input_tokens ?? 0,
        output: usage.output_tokens,
      },
      blocks: [],
      endedAt: at,
    };
  }

  #startTool(
    id: string,
    name: string,
    input: unknown,
    at: Date,
    parent: Context = this.#context,
  ): void {
    const span = tracer().startSpan(
      name,
      {
        startTime: at,
        attributes: {
          [SemanticConventions.OPENINFERENCE_SPAN_KIND]:
            OpenInferenceSpanKind.TOOL,
          [SemanticConventions.TOOL_NAME]: name,
          [SemanticConventions.TOOL_CALL_ID]: id,
          [SemanticConventions.INPUT_VALUE]: JSON.stringify(input),
          [SemanticConventions.INPUT_MIME_TYPE]: "application/json",
        },
      },
      parent,
    );
    this.#tools.set(id, span);
    this.#toolStarts.set(id, at);
  }

  #recordToolResults(
    content: Extract<SDKMessage, { type: "user" }>["message"]["content"],
    isCoordinator = true,
  ): void {
    for (const block of toolResultsOf(content)) {
      const span = this.#tools.get(block.tool_use_id);
      if (span === undefined) {
        continue;
      }
      const worker = this.#workers.get(block.tool_use_id);
      if (worker !== undefined) {
        worker.endedAt = new Date();
        worker.span.setAttributes({
          [SemanticConventions.OUTPUT_VALUE]: toolResultText(block),
          [SemanticConventions.OUTPUT_MIME_TYPE]: "text/plain",
        });
      }
      const text = toolResultText(block);
      span.setAttributes({
        [SemanticConventions.OUTPUT_VALUE]: text,
        [SemanticConventions.OUTPUT_MIME_TYPE]: "text/plain",
      });
      span.setStatus(
        block.is_error === true
          ? { code: SpanStatusCode.ERROR, message: text }
          : { code: SpanStatusCode.OK },
      );
      const now = new Date();
      if (isCoordinator) {
        this.#stepEndedAt = now;
      }
      span.end(now);
      this.#tools.delete(block.tool_use_id);
    }
  }

  #recordResult(result: ResultMessage): void {
    this.#hasResult = true;
    if (result.subtype === "success") {
      this.#turn.setAttributes({
        [SemanticConventions.OUTPUT_VALUE]: result.result,
        [SemanticConventions.OUTPUT_MIME_TYPE]: "text/plain",
      });
    }
    this.#turn.setStatus(
      result.subtype === "success" && !result.is_error
        ? { code: SpanStatusCode.OK }
        : { code: SpanStatusCode.ERROR, message: result.subtype },
    );
  }

  #endCall(): void {
    const call = this.#call;
    if (call === undefined) {
      return;
    }
    endModelCall(call);
    this.#call = undefined;
  }

  // The worker's span goes under the Agent tool span that started it.
  #startWorker(message: TaskStartedMessage): void {
    const toolUseId = message.tool_use_id;
    if (toolUseId === undefined || this.#workers.has(toolUseId)) {
      return;
    }
    this.#workerFor(toolUseId, message.subagent_type, message.prompt);
  }

  #workerFor(
    toolUseId: string,
    name = "worker",
    prompt: string | undefined = undefined,
  ): Worker {
    const known = this.#workers.get(toolUseId);
    if (known !== undefined) {
      return known;
    }
    const toolSpan = this.#tools.get(toolUseId);
    const parent =
      toolSpan === undefined
        ? this.#context
        : trace.setSpan(this.#context, toolSpan);
    // From when the coordinator's call for it arrived. The worker's prompt is written to
    // its transcript before the SDK sends task_started.
    const startedAt = this.#toolStarts.get(toolUseId) ?? new Date();
    const span = tracer().startSpan(
      `${name}.turn`,
      {
        startTime: startedAt,
        attributes: {
          [SemanticConventions.OPENINFERENCE_SPAN_KIND]:
            OpenInferenceSpanKind.AGENT,
          [SemanticConventions.AGENT_NAME]: name,
          [SemanticConventions.SESSION_ID]: this.#agentSessionId,
          ...(prompt === undefined
            ? {}
            : {
                [SemanticConventions.INPUT_VALUE]: prompt,
                [SemanticConventions.INPUT_MIME_TYPE]: "text/plain",
              }),
        },
      },
      parent,
    );
    const worker: Worker = {
      name,
      agentId: undefined,
      span,
      context: trace.setSpan(parent, span),
      startedAt,
      endedAt: undefined,
    };
    this.#workers.set(toolUseId, worker);
    return worker;
  }

  // A worker's tool calls and results. Its stream events, text, and thinking are left
  // out, since its model calls come from its transcript (#endWorker).
  #recordWorkerMessage(toolUseId: string, message: SDKMessage): void {
    if (message.type === "assistant") {
      const worker = this.#workerFor(toolUseId);
      worker.agentId ??= message.agent_id;
      const now = new Date();
      for (const block of message.message.content) {
        if (block.type === "tool_use") {
          this.#startTool(
            block.id,
            block.name,
            block.input,
            now,
            worker.context,
          );
        }
      }
    } else if (message.type === "user") {
      this.#recordToolResults(message.message.content, false);
    }
  }

  async #endWorker(worker: Worker): Promise<void> {
    const endedAt = worker.endedAt ?? new Date();
    if (worker.agentId === undefined || this.#sessionStore === undefined) {
      worker.span.setStatus({
        code: SpanStatusCode.ERROR,
        message: "No agent ID or session store, so no model calls.",
      });
    } else {
      try {
        const messages = await getSubagentMessages(
          this.#agentSessionId,
          worker.agentId,
          { sessionStore: this.#sessionStore },
        );
        for (const call of workerCalls(messages, worker)) {
          endModelCall(call);
        }
        worker.span.setStatus(
          worker.endedAt === undefined
            ? { code: SpanStatusCode.ERROR, message: "The worker didn't end." }
            : { code: SpanStatusCode.OK },
        );
      } catch (error) {
        worker.span.setStatus({
          code: SpanStatusCode.ERROR,
          message: `Couldn't read the worker's transcript: ${String(error)}`,
        });
      }
    }
    worker.span.end(endedAt);
  }
}

function endModelCall(call: ModelCall): void {
  call.span.setAttributes({
    ...modelCallAttributes(call),
    ...outputMessageAttributes(call.blocks),
  });
  call.span.setStatus({ code: SpanStatusCode.OK });
  call.span.end(call.endedAt);
}

// A transcript line's message from the model. The SDK types it as unknown.
const transcriptCall = z.object({
  id: z.string(),
  model: z.string(),
  usage: z.object({
    input_tokens: z.number(),
    cache_read_input_tokens: z.number().nullish(),
    cache_creation_input_tokens: z.number().nullish(),
    output_tokens: z.number(),
  }),
  content: z.array(z.looseObject({ type: z.string() })),
});

const timestamped = z.looseObject({ timestamp: z.string() });

// The worker's model calls, from its transcript. The transcript has a line for each of
// a call's blocks, each with the call's final tokens. A call starts when the line
// before it, its prompt or a tool result, was written, and ends with its last block.
function workerCalls(
  messages: ReadonlyArray<{ type: string; message: unknown }>,
  worker: Worker,
): ModelCall[] {
  const calls: ModelCall[] = [];
  let stepEndedAt = worker.startedAt;
  for (const line of messages) {
    const at = new Date(timestamped.parse(line).timestamp);
    if (line.type !== "assistant") {
      stepEndedAt = at;
      continue;
    }
    const { id, model, usage, content } = transcriptCall.parse(line.message);
    let call = calls.at(-1);
    if (call?.id !== id) {
      call = {
        id,
        span: tracer().startSpan(
          `${worker.name}.model_call`,
          { startTime: stepEndedAt },
          worker.context,
        ),
        model,
        tokens: { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 },
        blocks: [],
        endedAt: at,
      };
      calls.push(call);
    }
    call.tokens = {
      input: usage.input_tokens,
      cacheRead: usage.cache_read_input_tokens ?? 0,
      cacheWrite: usage.cache_creation_input_tokens ?? 0,
      output: usage.output_tokens,
    };
    call.blocks.push(...(content as unknown as ContentBlock[]));
    call.endedAt = at;
  }
  return calls;
}

// Phoenix and runExperiment() replace the global provider, so the tracer is looked up
// for each span.
function tracer(): ReturnType<typeof trace.getTracer> {
  return trace.getTracer(TRACER_NAME);
}

// Phoenix counts tokens, and works out a price, only on LLM spans. OpenInference counts
// the cache's tokens as part of the prompt. Thinking is part of the output tokens.
function modelCallAttributes(call: ModelCall): Attributes {
  const { input, cacheRead, cacheWrite, output } = call.tokens;
  const prompt = input + cacheRead + cacheWrite;
  return {
    [SemanticConventions.OPENINFERENCE_SPAN_KIND]: OpenInferenceSpanKind.LLM,
    [SemanticConventions.LLM_PROVIDER]: "anthropic",
    [SemanticConventions.LLM_SYSTEM]: "anthropic",
    [SemanticConventions.LLM_MODEL_NAME]: call.model,
    [SemanticConventions.LLM_TOKEN_COUNT_PROMPT]: prompt,
    [SemanticConventions.LLM_TOKEN_COUNT_PROMPT_DETAILS_CACHE_READ]: cacheRead,
    [SemanticConventions.LLM_TOKEN_COUNT_PROMPT_DETAILS_CACHE_WRITE]:
      cacheWrite,
    [SemanticConventions.LLM_TOKEN_COUNT_COMPLETION]: output,
    [SemanticConventions.LLM_TOKEN_COUNT_TOTAL]: prompt + output,
  };
}

// The call's output, both as OpenInference's message attributes and as plain JSON. The
// thinking is a "reasoning" content.
function outputMessageAttributes(blocks: readonly ContentBlock[]): Attributes {
  const message = `${SemanticConventions.LLM_OUTPUT_MESSAGES}.0.`;
  const attributes: Attributes = {
    [`${message}${SemanticConventions.MESSAGE_ROLE}`]: "assistant",
  };
  const output: unknown[] = [];
  let contents = 0;
  let toolCalls = 0;
  for (const block of blocks) {
    if (block.type === "thinking" || block.type === "text") {
      const content = `${message}${SemanticConventions.MESSAGE_CONTENTS}.${String(contents)}.`;
      const text = block.type === "thinking" ? block.thinking : block.text;
      attributes[`${content}${SemanticConventions.MESSAGE_CONTENT_TYPE}`] =
        block.type === "thinking" ? "reasoning" : "text";
      attributes[`${content}${SemanticConventions.MESSAGE_CONTENT_TEXT}`] =
        text;
      output.push({ type: block.type, text });
      contents += 1;
    } else if (block.type === "tool_use") {
      const toolCall = `${message}${SemanticConventions.MESSAGE_TOOL_CALLS}.${String(toolCalls)}.`;
      const input = JSON.stringify(block.input);
      attributes[`${toolCall}${SemanticConventions.TOOL_CALL_ID}`] = block.id;
      attributes[`${toolCall}${SemanticConventions.TOOL_CALL_FUNCTION_NAME}`] =
        block.name;
      attributes[
        `${toolCall}${SemanticConventions.TOOL_CALL_FUNCTION_ARGUMENTS_JSON}`
      ] = input;
      output.push({ type: "tool_use", name: block.name, input: block.input });
      toolCalls += 1;
    }
  }
  attributes[SemanticConventions.OUTPUT_VALUE] = JSON.stringify(output);
  attributes[SemanticConventions.OUTPUT_MIME_TYPE] = "application/json";
  return attributes;
}
