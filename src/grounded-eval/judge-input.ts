import type { CorpusSession, CorpusTurn, ToolResult } from "./corpus-turn.js";

// The judge input for one turn (#282): every turn in the session up to it, each with
// the user's message, the coordinator's tool results, and its reply, ending with the
// reply to judge. So a labeler can't see anything that came later in the session.
// Left out: the system prompt, the tool calls' inputs, the coordinator's thinking, and
// the workers' own calls.
export function judgeInputOf(session: CorpusSession, spanId: string): string {
  const turns = turnsUpTo(session, spanId);
  return turns
    .map((turn, index) => turnText(turn, index + 1, index === turns.length - 1))
    .join("\n\n");
}

// The session's turns, up to and including the one judged.
export function turnsUpTo(
  session: CorpusSession,
  spanId: string,
): CorpusTurn[] {
  const index = session.turns.findIndex((turn) => turn.spanId === spanId);
  if (index === -1) {
    throw new Error(`Session ${session.sessionId} has no turn ${spanId}.`);
  }
  return session.turns.slice(0, index + 1);
}

function turnText(turn: CorpusTurn, number: number, judged: boolean): string {
  const replyTag = judged ? "reply_to_judge" : "coordinator_reply";
  return [
    `<turn number="${String(number)}">`,
    tagged("user_message", "", turn.userMessage),
    ...turn.toolResults.map(toolResultText),
    tagged(replyTag, "", turn.reply),
    "</turn>",
  ].join("\n");
}

function toolResultText(result: ToolResult): string {
  const refused = result.refused ? ' refused="true"' : "";
  if (result.worker !== null) {
    return tagged("worker_result", ` worker="${result.worker}"`, result.text);
  }
  return tagged("tool_result", ` tool="${result.tool}"${refused}`, result.text);
}

function tagged(tag: string, attributes: string, text: string): string {
  return `<${tag}${attributes}>\n${text.trim()}\n</${tag}>`;
}
