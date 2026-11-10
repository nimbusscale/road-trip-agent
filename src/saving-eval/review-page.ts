import type { CorpusSession } from "../grounded-eval/corpus-turn.js";
import { turnsUpTo } from "../grounded-eval/judge-input.js";
import type { SavingAnswer } from "./saving-answer.schema.js";
import type { CalibrationTurn } from "./saving-files.schema.js";
import { SAVE_TOOLS, type SaveTurn } from "./save-turns.js";
import type { TurnBefore } from "./turn-before.js";

const DATA_PLACEHOLDER = "/*REVIEW_DATA*/";

// One turn on a set's page: the turn, its session's recorded turns, and what the trip
// held when it started.
export interface ReviewItem {
  turn: SaveTurn;
  session: CorpusSession;
  before: TurnBefore;
}

// What a set's page shows: its turns, each labeler's answers by span ID, and Joe's
// labels by span ID, for a calibration set. With no labelers, the page shows no
// labels, as for Joe's first reading.
export interface ReviewPage {
  items: readonly ReviewItem[];
  labels: Readonly<Record<string, ReadonlyMap<string, SavingAnswer>>>;
  joe: ReadonlyMap<string, CalibrationTurn>;
}

// The reading page for one set (#209, step 1): for each turn, the turn itself with its
// saves marked, what the trip held when it started, and the turns before it that
// Phoenix has. Each save that went through shows each labeler's failures for it, if
// there are labels. It only reads. The data goes in a JSON script tag, with each <
// written as \u003c so no text in it can close the tag.
export function reviewPageOf(
  template: string,
  set: number,
  { items, labels, joe }: ReviewPage,
): string {
  const data = {
    set,
    saveTools: [...SAVE_TOOLS],
    labelers: Object.keys(labels),
    items: items.map(({ turn, session, before }) => {
      const turns = turnsUpTo(session, turn.spanId);
      return {
        spanId: turn.spanId,
        before,
        current: turns.at(-1),
        earlier: turns.slice(0, -1),
        labels: Object.fromEntries(
          Object.entries(labels).map(([labeler, answers]) => [
            labeler,
            answers.get(turn.spanId)?.saves ?? [],
          ]),
        ),
        joe: joe.get(turn.spanId)?.saves ?? null,
      };
    }),
  };
  const json = JSON.stringify(data).replaceAll("<", "\\u003c");
  return template.replace(DATA_PLACEHOLDER, () => json);
}

// The notes file Joe writes in for a set, one heading for each turn, in the page's
// order. Each heading names the span, so a later step can match a note to its turn.
export function notesFileOf(set: number, items: readonly ReviewItem[]): string {
  const headings = items.map(
    ({ turn, before }, index) =>
      `## Item ${String(index + 1)} · span ${turn.spanId} · turn ${String(before.turn)} of "${before.sessionTitle}"\n\n`,
  );
  return [
    `# Set ${String(set)} notes\n`,
    'A free note on each turn: what, if anything, went to the wrong place, and why. A turn where everything went to the right place gets a note too, such as "fine".\n',
    ...headings,
  ].join("\n");
}
