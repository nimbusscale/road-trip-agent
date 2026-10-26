import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import {
  OpenInferenceSpanKind,
  SemanticConventions,
} from "@arizeai/openinference-semantic-conventions";
import {
  type Attributes,
  type Context,
  type Span,
  SpanStatusCode,
  trace,
  type Tracer,
} from "@opentelemetry/api";

import {
  SYSTEM_MESSAGE_IDS,
  toolResultText,
  type ToolResultBlock,
} from "./turn-event.js";
import type { CallBlock, CallTokens } from "./worker-transcript.schema.js";

// The spans of a turn's trace, in OpenInference's names, which Phoenix reads (systems
// design section 10).

const TRACER_NAME = "road-trip-agent";

// Looked up for each span, since setting up tracing replaces the global provider. With
// none set up, as in tests that don't trace, the spans go nowhere.
export function tracer(): Tracer {
  return trace.getTracer(TRACER_NAME);
}

type SystemMessage = Extract<SDKMessage, { type: "system" }>;

// An event on the turn's span for one of the coordinator's system messages, at the time
// it arrived. init is the turn's start, with the model and the tools it was given. A
// worker's span shows its task_started, a status of "requesting" comes as each model
// call starts, which has its own span, and thinking token counts come many times a
// second while the model thinks, so none of them gets an event. An attribute can't hold
// a nested object, so each other message's fields go in one, as JSON.
export function addSystemEvent(
  span: Span,
  message: SystemMessage,
  at: Date,
): void {
  switch (message.subtype) {
    case "init":
      span.addEvent(
        "started",
        { model: message.model, tools: message.tools },
        at,
      );
      break;
    case "task_started":
    case "thinking_tokens":
      break;
    case "status":
      if (message.status !== "requesting") {
        addDataEvent(span, message, at);
      }
      break;
    default:
      addDataEvent(span, message, at);
  }
}

function addDataEvent(span: Span, message: SystemMessage, at: Date): void {
  const data = Object.fromEntries(
    Object.entries(message).filter(([key]) => !SYSTEM_MESSAGE_IDS.has(key)),
  );
  span.addEvent(message.subtype, { data: JSON.stringify(data) }, at);
}

// One model call: the blocks of one Claude API message, which the SDK sends one at a
// time, each with the call's ID.
export interface ModelCall {
  id: string;
  span: Span;
  model: string;
  tokens: CallTokens;
  blocks: CallBlock[];
  endedAt: Date;
}

type AssistantContent = Extract<
  SDKMessage,
  { type: "assistant" }
>["message"]["content"];

export function callBlocksOf(content: AssistantContent): CallBlock[] {
  return content.flatMap((block): CallBlock[] => {
    switch (block.type) {
      case "thinking":
        return [{ type: "thinking", text: block.thinking }];
      case "text":
        return [{ type: "text", text: block.text }];
      case "tool_use":
        return [
          {
            type: "toolUse",
            id: block.id,
            name: block.name,
            input: block.input,
          },
        ];
      default:
        return [];
    }
  });
}

export function endModelCall(call: ModelCall): void {
  call.span.setAttributes({
    ...modelCallAttributes(call),
    ...outputMessageAttributes(call.blocks),
  });
  call.span.setStatus({ code: SpanStatusCode.OK });
  call.span.end(call.endedAt);
}

// A tool the model asked for, from when its call arrives.
export function startToolSpan(
  block: Extract<CallBlock, { type: "toolUse" }>,
  at: Date,
  parent: Context,
): Span {
  return tracer().startSpan(
    block.name,
    {
      startTime: at,
      attributes: {
        [SemanticConventions.OPENINFERENCE_SPAN_KIND]:
          OpenInferenceSpanKind.TOOL,
        [SemanticConventions.TOOL_NAME]: block.name,
        [SemanticConventions.TOOL_CALL_ID]: block.id,
        [SemanticConventions.INPUT_VALUE]: JSON.stringify(block.input),
        [SemanticConventions.INPUT_MIME_TYPE]: "application/json",
      },
    },
    parent,
  );
}

// A refused call is marked as an error, with the tool's error text.
export function endToolSpan(
  span: Span,
  block: ToolResultBlock,
  at: Date,
): void {
  const text = toolResultText(block);
  span.setAttributes(textOutput(text));
  span.setStatus(
    block.is_error === true
      ? { code: SpanStatusCode.ERROR, message: text }
      : { code: SpanStatusCode.OK },
  );
  span.end(at);
}

export function textInput(text: string): Attributes {
  return {
    [SemanticConventions.INPUT_VALUE]: text,
    [SemanticConventions.INPUT_MIME_TYPE]: "text/plain",
  };
}

export function textOutput(text: string): Attributes {
  return {
    [SemanticConventions.OUTPUT_VALUE]: text,
    [SemanticConventions.OUTPUT_MIME_TYPE]: "text/plain",
  };
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

const OUTPUT_MESSAGE = `${SemanticConventions.LLM_OUTPUT_MESSAGES}.0.`;

// The call's output, both as OpenInference's message attributes and as plain JSON. The
// thinking is a "reasoning" content.
function outputMessageAttributes(blocks: readonly CallBlock[]): Attributes {
  const attributes: Attributes = {
    [`${OUTPUT_MESSAGE}${SemanticConventions.MESSAGE_ROLE}`]: "assistant",
  };
  let contents = 0;
  let toolCalls = 0;
  for (const block of blocks) {
    if (block.type === "toolUse") {
      Object.assign(attributes, toolCallAttributes(block, toolCalls));
      toolCalls += 1;
    } else {
      Object.assign(attributes, contentAttributes(block, contents));
      contents += 1;
    }
  }
  attributes[SemanticConventions.OUTPUT_VALUE] = JSON.stringify(
    blocks.map((block) =>
      block.type === "toolUse"
        ? { type: "tool_use", name: block.name, input: block.input }
        : block,
    ),
  );
  attributes[SemanticConventions.OUTPUT_MIME_TYPE] = "application/json";
  return attributes;
}

function contentAttributes(
  block: Exclude<CallBlock, { type: "toolUse" }>,
  index: number,
): Attributes {
  const content = `${OUTPUT_MESSAGE}${SemanticConventions.MESSAGE_CONTENTS}.${String(index)}.`;
  return {
    [`${content}${SemanticConventions.MESSAGE_CONTENT_TYPE}`]:
      block.type === "thinking" ? "reasoning" : "text",
    [`${content}${SemanticConventions.MESSAGE_CONTENT_TEXT}`]: block.text,
  };
}

function toolCallAttributes(
  block: Extract<CallBlock, { type: "toolUse" }>,
  index: number,
): Attributes {
  const toolCall = `${OUTPUT_MESSAGE}${SemanticConventions.MESSAGE_TOOL_CALLS}.${String(index)}.`;
  return {
    [`${toolCall}${SemanticConventions.TOOL_CALL_ID}`]: block.id,
    [`${toolCall}${SemanticConventions.TOOL_CALL_FUNCTION_NAME}`]: block.name,
    [`${toolCall}${SemanticConventions.TOOL_CALL_FUNCTION_ARGUMENTS_JSON}`]:
      JSON.stringify(block.input),
  };
}
