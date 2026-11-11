import type {
  CorpusSession,
  CorpusTurn,
  ToolResult,
} from "../grounded-eval/corpus-turn.js";
import { turnsUpTo } from "../grounded-eval/judge-input.js";
import { SAVE_TOOLS } from "./save-turns.js";
import type { TurnBefore } from "./turn-before.js";

// The input a labeler or the judge reads for one turn, after the rubric
// (evals/saving/rubric.md, "What you're given"): the trip as it stood when the turn
// started, the earlier turns' words, and the turn itself. Earlier turns' tool calls are
// left out, since <before> already shows what they did. Refused calls are left out of
// the turn, since none of them changed anything (evals/saving/decisions.md, decision 8).
export function labelerInputOf(
  session: CorpusSession,
  spanId: string,
  before: TurnBefore,
): string {
  const current = turnsUpTo(session, spanId).at(-1);
  if (current === undefined) {
    throw new Error(`Session ${session.sessionId} has no turn ${spanId}.`);
  }
  return `${labelerContextOf(session, spanId, before)}\n\n${turnInputOf(current)}`;
}

// The input up to the turn: <before> and <earlier_turns>. A replay of the turn (#209)
// starts from the same trip and conversation, so its input is this with its own turn.
export function labelerContextOf(
  session: CorpusSession,
  spanId: string,
  before: TurnBefore,
): string {
  const earlier = turnsUpTo(session, spanId).slice(0, -1);
  return [beforeText(before), earlierText(earlier)].join("\n\n");
}

// The turn's saves that went through, which the labeler judges one by one.
export function savesIn(turn: CorpusTurn): ToolResult[] {
  return turn.toolResults.filter((result) => !result.refused && isSave(result));
}

function isSave(result: ToolResult): boolean {
  return result.worker === null && SAVE_TOOLS.has(result.tool);
}

function beforeText(before: TurnBefore): string {
  const memoryOf = (kind: "user" | "trip") =>
    listed(
      before.memory
        .filter((item) => item.kind === kind)
        .map((item) => `<item id="${item.id}">${item.text}</item>`),
    );
  return tagged(
    "before",
    "",
    [
      tagged("trip_brief", "", before.briefLines.join("\n")),
      tagged("trip_memory", "", memoryOf("trip")),
      tagged("user_memory", "", memoryOf("user")),
      tagged("itinerary", "", before.itineraryLines.join("\n")),
    ].join("\n"),
  );
}

function earlierText(turns: readonly CorpusTurn[]): string {
  const shown = turns.map((turn, index) =>
    tagged(
      "earlier_turn",
      ` number="${String(index + 1)}"`,
      [
        tagged("user_message", "", turn.userMessage),
        tagged("coordinator_reply", "", turn.reply),
      ].join("\n"),
    ),
  );
  return tagged("earlier_turns", "", listed(shown));
}

// The turn itself, <turn>, which follows the input up to it. Its saves are numbered
// from 1, as savesIn() lists them.
export function turnInputOf(turn: CorpusTurn): string {
  let saves = 0;
  const calls = turn.toolResults
    .filter((result) => !result.refused)
    .map((result) => {
      if (isSave(result)) {
        saves += 1;
        return callText("save", ` n="${String(saves)}"`, result);
      }
      return callText("tool_call", "", result);
    });
  return tagged(
    "turn",
    "",
    [
      tagged("user_message", "", turn.userMessage),
      ...calls,
      tagged("coordinator_reply", "", turn.reply),
    ].join("\n"),
  );
}

function callText(tag: string, number: string, result: ToolResult): string {
  const worker = result.worker === null ? "" : ` worker="${result.worker}"`;
  const input =
    result.input === null ? "" : `${tagged("input", "", result.input)}\n`;
  return tagged(
    tag,
    `${number} tool="${result.tool}"${worker}`,
    `${input}${tagged("result", "", result.text)}`,
  );
}

function listed(lines: readonly string[]): string {
  return lines.length === 0 ? "(none)" : lines.join("\n");
}

function tagged(tag: string, attributes: string, text: string): string {
  return `<${tag}${attributes}>\n${text.trim()}\n</${tag}>`;
}
