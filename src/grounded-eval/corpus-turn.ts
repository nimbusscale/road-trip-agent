import { agentInputSchema, type PhoenixSpan } from "./phoenix-span.schema.js";

// One of the coordinator's own tool calls: what it got back, and for a tool whose
// result doesn't say what it changed, what it sent (#282). A worker's result is the
// Agent call's output, as the coordinator got it. The worker's own calls aren't here,
// since the coordinator never saw them.
export interface ToolResult {
  tool: string;
  worker: string | null;
  refused: boolean;
  // Null for every other tool, whose result already says what it did.
  input: string | null;
  text: string;
}

// The tools whose result doesn't say what changed, such as "Added mem_x to user
// memory." or "Changed Day 5 (day_x).".
const INPUT_SHOWN_FOR = new Set([
  "add_memory_item",
  "update_memory_item",
  "forget_memory_item",
  "update_trip_brief",
  "update_itinerary",
  "update_day",
  "update_stop",
  "update_stay",
]);

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
  const tool = span.name.replace(MCP_PREFIX, "");
  return {
    tool,
    worker: span.name === "Agent" ? workerOf(span.input) : null,
    refused: span.failed,
    input: INPUT_SHOWN_FOR.has(tool) ? span.input : null,
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
