import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { trace } from "@opentelemetry/api";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  type ReadableSpan,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { afterAll, afterEach, beforeAll, beforeEach, vi } from "vitest";

import { SESSION_ID } from "./fake-sdk-messages.schema.js";
import { TurnTrace } from "./turn-trace.js";
import type { ReadWorkerTranscript } from "./worker-trace.js";

// Runs a turn's SDK messages through a TurnTrace, and keeps its spans in memory, in
// place of Phoenix (DEVELOPMENT.md section 5).

export const USER_ID = "00000000-0000-4000-8000-000000000001";
export const MESSAGE =
  "Today is Sunday, October 25, 2026.\n\nPlan a trip to Boston.";

const NO_WORKERS: ReadWorkerTranscript = () =>
  Promise.reject(new Error("No worker ran."));

const exporter = new InMemorySpanExporter();

// Call once at the top of a test file. Time is faked, so each message can come a
// second after the one before it, and the spans' order is clear.
export function useTestTracer(): void {
  beforeAll(() => {
    trace.setGlobalTracerProvider(
      new BasicTracerProvider({
        spanProcessors: [new SimpleSpanProcessor(exporter)],
      }),
    );
  });
  afterAll(() => {
    trace.disable();
  });
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
  });
  afterEach(() => {
    vi.useRealTimers();
    exporter.reset();
  });
}

// The first message comes at second 1 past noon, the next at second 2, and so on.
export async function runTrace(
  messages: readonly SDKMessage[],
  readWorkerTranscript: ReadWorkerTranscript = NO_WORKERS,
): Promise<void> {
  await recordAll(messages, readWorkerTranscript).end();
}

// The turn's messages, and then the SDK throws the error.
export async function runThrowingTrace(
  messages: readonly SDKMessage[],
  error: Error,
): Promise<void> {
  const turnTrace = recordAll(messages, NO_WORKERS);
  turnTrace.recordThrown(error);
  await turnTrace.end();
}

function recordAll(
  messages: readonly SDKMessage[],
  readWorkerTranscript: ReadWorkerTranscript,
): TurnTrace {
  vi.setSystemTime(atSecond(0));
  const turnTrace = new TurnTrace({
    message: MESSAGE,
    agentSessionId: SESSION_ID,
    userId: USER_ID,
    readWorkerTranscript,
  });
  for (const [index, message] of messages.entries()) {
    vi.setSystemTime(atSecond(index + 1));
    turnTrace.record(message);
  }
  return turnTrace;
}

function atSecond(second: number): Date {
  return new Date(Date.UTC(2026, 9, 25, 12, 0, second));
}

export function spans(): ReadableSpan[] {
  return exporter.getFinishedSpans();
}

export function spanNamed(name: string, index = 0): ReadableSpan {
  const span = spans().filter((each) => each.name === name)[index];
  if (span === undefined) {
    throw new Error(`There's no span ${name} at ${String(index)}.`);
  }
  return span;
}

// Each span's name, indented under its parent, with children in the order they
// started.
export function spanTree(): string {
  const all = spans();
  const lines: string[] = [];
  const add = (parentId: string | undefined, depth: number): void => {
    all
      .filter((span) => span.parentSpanContext?.spanId === parentId)
      .sort((a, b) => secondsOf(a.startTime) - secondsOf(b.startTime))
      .forEach((span) => {
        lines.push(`${"  ".repeat(depth)}${span.name}`);
        add(span.spanContext().spanId, depth + 1);
      });
  };
  add(undefined, 0);
  return lines.join("\n");
}

// Seconds past noon.
export function secondsOf([whole, nanos]: readonly [number, number]): number {
  return whole + nanos / 1e9 - atSecond(0).getTime() / 1000;
}
