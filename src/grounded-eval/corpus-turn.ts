import { agentInputSchema, type PhoenixSpan } from "./phoenix-span.schema.js";

// What the coordinator got back from one of its own tool calls. A worker's result is
// the Agent call's output, as the coordinator got it. The worker's own calls aren't
// here, since the coordinator never saw them (#282).
export interface ToolResult {
  tool: string;
  worker: string | null;
  refused: boolean;
  text: string;
}

// One coordinator.turn span, with what the judge reads from the spans under it.
export interface CorpusTurn {
  spanId: string;
  traceId: string;
  // The message the model got, with the app's lines, such as the date line.
  userMessage: string;
  toolResults: ToolResult[];
  reply: string;
}

export interface CorpusSession {
  sessionId: string;
  // In the order they ran.
  turns: CorpusTurn[];
}

const MCP_PREFIX = /^mcp__[a-z]+__/;

// Builds a session's turns from its spans: its coordinator.turn spans, and every span
// in their traces.
export function corpusSessionOf(
  sessionId: string,
  spans: PhoenixSpan[],
): CorpusSession {
  const byStart = [...spans].sort((a, b) =>
    a.startTime.localeCompare(b.startTime),
  );
  const turns = byStart
    .filter((span) => span.name === "coordinator.turn")
    .map((turn) => ({
      spanId: turn.spanId,
      traceId: turn.traceId,
      userMessage: turn.input,
      toolResults: byStart
        .filter((span) => span.parentId === turn.spanId && span.kind === "TOOL")
        .map(toolResultOf),
      reply: turn.output,
    }));
  return { sessionId, turns };
}

function toolResultOf(span: PhoenixSpan): ToolResult {
  return {
    tool: span.name.replace(MCP_PREFIX, ""),
    worker: span.name === "Agent" ? workerOf(span.input) : null,
    refused: span.failed,
    text: span.output,
  };
}

function workerOf(input: string): string {
  try {
    const parsed = agentInputSchema.safeParse(JSON.parse(input));
    return parsed.success ? parsed.data : "unknown";
  } catch {
    return "unknown";
  }
}
