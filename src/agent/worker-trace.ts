import {
  OpenInferenceSpanKind,
  SemanticConventions,
} from "@arizeai/openinference-semantic-conventions";
import {
  type Context,
  type Span,
  SpanStatusCode,
  trace,
} from "@opentelemetry/api";

import {
  endModelCall,
  type ModelCall,
  textInput,
  tracer,
} from "./trace-spans.js";
import {
  type WorkerCallLine,
  workerCallLineSchema,
  workerTranscriptLineSchema,
} from "./worker-transcript.schema.js";

// Reads a worker's transcript from the session store, as getSubagentMessages() gives
// it. Tests pass a fake.
export type ReadWorkerTranscript = (
  agentSessionId: string,
  agentId: string,
) => Promise<readonly unknown[]>;

// One worker, started by one of the coordinator's Agent tool calls (technical spec
// section 6). Its span is under that tool's span. Its tool spans are made from the
// stream as they come. Its model call spans are made when the turn ends, from its
// transcript, since the SDK sends none of a worker's stream events, and none of its
// text or thinking. When the worker's result arrives, its last model call isn't in the
// session store yet, so the transcript is read once the turn is over.
export interface Worker {
  name: string;
  agentId: string | undefined;
  span: Span;
  context: Context;
  startedAt: Date;
  endedAt: Date | undefined;
}

export interface WorkerStart {
  name: string;
  prompt: string | undefined;
  agentSessionId: string;
  startedAt: Date;
  parent: Context;
}

export function startWorker(start: WorkerStart): Worker {
  const { name, prompt, agentSessionId, startedAt, parent } = start;
  const span = tracer().startSpan(
    `${name}.turn`,
    {
      startTime: startedAt,
      attributes: {
        [SemanticConventions.OPENINFERENCE_SPAN_KIND]:
          OpenInferenceSpanKind.AGENT,
        [SemanticConventions.AGENT_NAME]: name,
        [SemanticConventions.SESSION_ID]: agentSessionId,
        ...(prompt === undefined ? {} : textInput(prompt)),
      },
    },
    parent,
  );
  return {
    name,
    agentId: undefined,
    span,
    context: trace.setSpan(parent, span),
    startedAt,
    endedAt: undefined,
  };
}

// Makes the worker's model call spans from its transcript, then ends its span.
export async function endWorker(
  worker: Worker,
  agentSessionId: string,
  read: ReadWorkerTranscript,
): Promise<void> {
  if (worker.agentId === undefined) {
    worker.span.setStatus({
      code: SpanStatusCode.ERROR,
      message:
        "No agent ID came for the worker, so its model calls are left out.",
    });
  } else {
    try {
      const lines = await read(agentSessionId, worker.agentId);
      for (const call of workerCalls(lines, worker)) {
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
  worker.span.end(worker.endedAt ?? new Date());
}

// The transcript has a line for each of a call's blocks. A call starts when the line
// before it, its prompt or a tool result, was written, and ends with its last block.
// Its tokens are those on its last line, which can be low (systems design section 10).
// Every line is parsed before any span starts, so a bad line leaves no span open.
function workerCalls(lines: readonly unknown[], worker: Worker): ModelCall[] {
  const calls: ModelCall[] = [];
  let stepEndedAt = worker.startedAt;
  for (const line of lines.map(parseLine)) {
    if (line.call === undefined) {
      stepEndedAt = line.at;
      continue;
    }
    const { id, model, tokens, blocks } = line.call;
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
        tokens,
        blocks: [],
        endedAt: line.at,
      };
      calls.push(call);
    }
    call.tokens = tokens;
    call.blocks.push(...blocks);
    call.endedAt = line.at;
  }
  return calls;
}

// A line from the model has one block of a call. Any other line is the worker's prompt
// or a tool result.
function parseLine(item: unknown): {
  at: Date;
  call: WorkerCallLine | undefined;
} {
  const line = workerTranscriptLineSchema.parse(item);
  return {
    at: new Date(line.timestamp),
    call:
      line.type === "assistant"
        ? workerCallLineSchema.parse(line.message)
        : undefined,
  };
}
