import {
  checkCountsOf,
  type ExpectedSave,
  type JudgeDiff,
} from "./judge-score.js";
import type { SavingAnswer, SavingCheck } from "./saving-answer.schema.js";
import type { GoldenTurn } from "./saving-files.schema.js";

// One run of the saving judge on one golden turn (#209).
export interface JudgedTurn {
  turn: GoldenTurn;
  answer: SavingAnswer;
  diffs: JudgeDiff[];
}

// Each check's misses and false alarms, over all runs, then each save the judge got
// wrong on some run, with how many of the runs it got it wrong on.
export function reportOf(
  title: string,
  judged: readonly JudgedTurn[],
  runsAsked: number,
): string {
  const runsPerTurn = new Map<string, number>();
  for (const { turn } of judged) {
    runsPerTurn.set(turn.spanId, (runsPerTurn.get(turn.spanId) ?? 0) + 1);
  }
  const counts = checkCountsOf(
    judged.map(({ turn, diffs }) => ({ expected: turn.expected, diffs })),
  );
  const lines = [
    `# ${title}`,
    "",
    `${String(judged.length)} of ${String(runsAsked)} runs answered. ${String(judged.filter((j) => j.diffs.length === 0).length)} matched every save's label.`,
    "",
    "| Check | Saves the label fails, all runs | Misses | False alarms |",
    "|---|---|---|---|",
    ...counts.map(
      (c) =>
        `| ${c.check} | ${String(c.labeled)} | ${String(c.misses)} | ${String(c.falseAlarms)} |`,
    ),
    "",
    "## Saves the judge got wrong",
    "",
  ];
  for (const group of diffGroupsOf(judged)) {
    lines.push(
      `- ${whereOf(group.turn)} save ${String(group.n)} (${group.tool}): ${group.check} ${group.kind}, ${String(group.times)} of ${String(runsPerTurn.get(group.turn.spanId) ?? 0)} runs. Label: ${labelOf(group.turn.expected, group.n)}.`,
    );
    for (const { quote, why } of group.alarms) {
      lines.push(`  - "${quote}": ${why}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

interface DiffGroup {
  turn: GoldenTurn;
  n: number;
  tool: string;
  check: SavingCheck;
  kind: JudgeDiff["kind"];
  times: number;
  alarms: { quote: string; why: string }[];
}

function diffGroupsOf(judged: readonly JudgedTurn[]): DiffGroup[] {
  const groups = new Map<string, DiffGroup>();
  for (const { turn, diffs } of judged) {
    for (const diff of diffs) {
      const key = `${turn.spanId} ${String(diff.n)} ${diff.check} ${diff.kind}`;
      const group = groups.get(key) ?? {
        turn,
        n: diff.n,
        tool: diff.tool,
        check: diff.check,
        kind: diff.kind,
        times: 0,
        alarms: [],
      };
      group.times += 1;
      if (diff.kind === "false alarm") {
        group.alarms.push({ quote: diff.quote, why: diff.why });
      }
      groups.set(key, group);
    }
  }
  return [...groups.values()].sort(
    (a, b) =>
      a.check.localeCompare(b.check) ||
      a.turn.set - b.turn.set ||
      a.turn.item - b.turn.item ||
      a.n - b.n,
  );
}

function labelOf(expected: readonly ExpectedSave[], n: number): string {
  const checks = expected.find((save) => save.n === n)?.checks ?? [];
  return checks.length === 0 ? "passes" : checks.join(", ");
}

export function whereOf(turn: GoldenTurn): string {
  return `set ${String(turn.set)} item ${String(turn.item)}`;
}
