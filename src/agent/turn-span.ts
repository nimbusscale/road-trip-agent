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

const TRACER_NAME = "road-trip-agent";

type ResultMessage = Extract<SDKMessage, { type: "result" }>;

// Spike (#132): one span for each coordinator turn, with the message the model got, and
// under it one LLM span with the whole turn's tokens. The instrumentation's own span
// shows the message as {}, since it can't read a streamed prompt, and leaves cache
// tokens out of its counts. Its spans go under the turn's. With no tracer provider set
// up, the spans go nowhere.
export interface TurnSpan {
  span: Span;
  // Run query() under this, with iterateUnder(), so the instrumentation's span is a
  // child of the turn's.
  context: Context;
  startTime: Date;
  model: string;
}

// The tracer is looked up each turn, since Phoenix's register() and runExperiment()
// replace the global provider.
export function startTurnSpan(
  message: string,
  agentSessionId: string,
  model: string,
): TurnSpan {
  const startTime = new Date();
  const span = trace.getTracer(TRACER_NAME).startSpan("coordinator.turn", {
    startTime,
    attributes: {
      [SemanticConventions.OPENINFERENCE_SPAN_KIND]:
        OpenInferenceSpanKind.AGENT,
      [SemanticConventions.INPUT_VALUE]: message,
      [SemanticConventions.INPUT_MIME_TYPE]: "text/plain",
      [SemanticConventions.SESSION_ID]: agentSessionId,
    },
  });
  return {
    span,
    context: trace.setSpan(context.active(), span),
    startTime,
    model,
  };
}

// `result` is undefined when the turn ended before the SDK's result, such as when the
// process failed.
export function endTurnSpan(
  turnSpan: TurnSpan,
  result: ResultMessage | undefined,
): void {
  const { span } = turnSpan;
  if (result === undefined) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: "The turn ended with no result.",
    });
  } else {
    if (result.subtype === "success") {
      span.setAttributes({
        [SemanticConventions.OUTPUT_VALUE]: result.result,
        [SemanticConventions.OUTPUT_MIME_TYPE]: "text/plain",
      });
    }
    span.setStatus(
      result.subtype === "success" && !result.is_error
        ? { code: SpanStatusCode.OK }
        : { code: SpanStatusCode.ERROR, message: result.subtype },
    );
    recordModelCalls(turnSpan, result);
  }
  span.end();
}

// Phoenix counts tokens, in its totals and its sessions view, only on LLM spans. The
// turn's model calls go in one, from the turn's start to its end, since the SDK gives
// only their sum. The SDK's cost isn't used: on a resumed session it's the total so far.
function recordModelCalls(turnSpan: TurnSpan, result: ResultMessage): void {
  const { usage } = result;
  const cacheRead = usage.cache_read_input_tokens;
  const cacheWrite = usage.cache_creation_input_tokens;
  // OpenInference counts the cache's tokens as part of the prompt.
  const prompt = usage.input_tokens + cacheRead + cacheWrite;
  trace
    .getTracer(TRACER_NAME)
    .startSpan(
      "coordinator.model_calls",
      {
        startTime: turnSpan.startTime,
        attributes: {
          [SemanticConventions.OPENINFERENCE_SPAN_KIND]:
            OpenInferenceSpanKind.LLM,
          [SemanticConventions.LLM_PROVIDER]: "anthropic",
          [SemanticConventions.LLM_SYSTEM]: "anthropic",
          [SemanticConventions.LLM_MODEL_NAME]: turnSpan.model,
          "road_trip.model_calls": result.num_turns,
          [SemanticConventions.LLM_TOKEN_COUNT_PROMPT]: prompt,
          [SemanticConventions.LLM_TOKEN_COUNT_PROMPT_DETAILS_CACHE_READ]:
            cacheRead,
          [SemanticConventions.LLM_TOKEN_COUNT_PROMPT_DETAILS_CACHE_WRITE]:
            cacheWrite,
          [SemanticConventions.LLM_TOKEN_COUNT_COMPLETION]: usage.output_tokens,
          [SemanticConventions.LLM_TOKEN_COUNT_TOTAL]:
            prompt + usage.output_tokens,
        },
      },
      turnSpan.context,
    )
    .end();
}

// The instrumentation starts its span when iterating begins, under the context active
// then. A generator's context isn't kept across its yields, so the iterator is made here.
export function iterateUnder<T>(
  spanContext: Context,
  start: () => AsyncIterable<T>,
): AsyncIterable<T> {
  const iterator = context.with(spanContext, () =>
    start()[Symbol.asyncIterator](),
  );
  return { [Symbol.asyncIterator]: () => iterator };
}
