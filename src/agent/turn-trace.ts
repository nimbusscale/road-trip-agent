import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
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

import { toolResultsOf, toolResultText } from "./turn-event.js";

const TRACER_NAME = "road-trip-agent";

type AssistantMessage = Extract<SDKMessage, { type: "assistant" }>;
type ResultMessage = Extract<SDKMessage, { type: "result" }>;
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

// Spike (#132): the trace of one coordinator turn, made from the SDK's messages. The
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
  #call: ModelCall | undefined;
  #stepEndedAt: Date;
  #hasResult = false;

  constructor(message: string, agentSessionId: string) {
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
      default:
        break;
    }
  }

  // Ends every span still open, such as when the turn failed before its result.
  end(): void {
    this.#endCall();
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

  #startTool(id: string, name: string, input: unknown, at: Date): void {
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
      this.#context,
    );
    this.#tools.set(id, span);
  }

  #recordToolResults(
    content: Extract<SDKMessage, { type: "user" }>["message"]["content"],
  ): void {
    for (const block of toolResultsOf(content)) {
      const span = this.#tools.get(block.tool_use_id);
      if (span === undefined) {
        continue;
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
      this.#stepEndedAt = new Date();
      span.end(this.#stepEndedAt);
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
    call.span.setAttributes({
      ...modelCallAttributes(call),
      ...outputMessageAttributes(call.blocks),
    });
    call.span.setStatus({ code: SpanStatusCode.OK });
    call.span.end(call.endedAt);
    this.#call = undefined;
  }
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
