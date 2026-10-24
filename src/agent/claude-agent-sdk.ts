import * as ClaudeAgentSdkModule from "@anthropic-ai/claude-agent-sdk";
import { ClaudeAgentSDKInstrumentation } from "@arizeai/openinference-instrumentation-claude-agent-sdk";
import {
  type Context,
  type Span,
  type SpanOptions,
  trace,
  type Tracer,
} from "@opentelemetry/api";

const TRACER_NAME = "road-trip-agent-claude-agent-sdk";

// The instrumentation keeps the one tracer it's given. Phoenix's register(), and
// runExperiment() while a task runs, each replace the global provider with a new object,
// so a tracer taken from it before then would send its spans nowhere. This one looks up
// the global provider each time a span starts.
class GlobalTracer implements Tracer {
  startSpan(name: string, options?: SpanOptions, context?: Context): Span {
    return trace.getTracer(TRACER_NAME).startSpan(name, options, context);
  }

  startActiveSpan<F extends (span: Span) => unknown>(
    name: string,
    fn: F,
  ): ReturnType<F>;
  startActiveSpan<F extends (span: Span) => unknown>(
    name: string,
    options: SpanOptions,
    fn: F,
  ): ReturnType<F>;
  startActiveSpan<F extends (span: Span) => unknown>(
    name: string,
    options: SpanOptions,
    context: Context,
    fn: F,
  ): ReturnType<F>;
  startActiveSpan(...args: unknown[]): unknown {
    const tracer = trace.getTracer(TRACER_NAME);
    const result: unknown = Reflect.apply(
      tracer.startActiveSpan.bind(tracer),
      undefined,
      args,
    );
    return result;
  }
}

// Spike (#132): the Agent SDK, through Phoenix's instrumentation. The SDK is ESM only, so
// its exports can't be patched in place. manuallyInstrument() returns a patched copy,
// and only calls through the copy make spans. With no tracer provider set up, the spans
// go nowhere, so the app runs the same as before.
//
// The patched query() returns a plain async iterable, not the SDK's Query, so methods
// such as accountInfo() aren't on it.
const GLOBAL_TRACER = new GlobalTracer();
export const claudeAgentSdk = new ClaudeAgentSDKInstrumentation({
  tracerProvider: { getTracer: () => GLOBAL_TRACER },
}).manuallyInstrument(ClaudeAgentSdkModule);
