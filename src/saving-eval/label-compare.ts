import {
  type SavingAnswer,
  type SavingCheck,
  savingCheckSchema,
} from "./saving-answer.schema.js";
import type { CalibrationFile } from "./saving-files.schema.js";

const CHECKS: readonly SavingCheck[] = savingCheckSchema.options;

// The rubric's "The checks": a trip brief save gets check 5, and a memory save gets
// the rest.
function checksThatFit(tool: string): readonly SavingCheck[] {
  return tool === "update_trip_brief"
    ? ["F5"]
    : CHECKS.filter((check) => check !== "F5");
}

// One save, as the set's reading page shows it: the turn's item number in its set, and
// the save's number in the labeler input.
export interface SaveRef {
  set: number;
  item: number;
  spanId: string;
  n: number;
  tool: string;
}

export interface Flag {
  check: SavingCheck;
  quote: string;
}

// One save, with each source's failing checks, by the source's name, such as
// "opus-5.5" or "joe".
export interface LabeledSave {
  save: SaveRef;
  flags: Record<string, readonly Flag[]>;
}

// Each source's flags for every save, from the labelers' answers and Joe's labels.
// A source with no answer for a turn isn't in that turn's saves' flags.
export function labeledSavesOf(
  saves: readonly SaveRef[],
  answers: Readonly<Record<string, ReadonlyMap<string, SavingAnswer>>>,
  calibration: CalibrationFile,
): LabeledSave[] {
  const joe = new Map(calibration.turns.map((turn) => [turn.spanId, turn]));
  return saves.map((save) => {
    const flags: Record<string, readonly Flag[]> = {};
    for (const [source, bySpan] of Object.entries(answers)) {
      const found = bySpan.get(save.spanId)?.saves.find((s) => s.n === save.n);
      if (found !== undefined) {
        flags[source] = found.failures;
      }
    }
    const joeSave = joe.get(save.spanId)?.saves.find((s) => s.n === save.n);
    if (joeSave !== undefined) {
      flags.joe = joeSave.checks.map((check) => ({ check, quote: "" }));
    }
    return { save, flags };
  });
}

// One check on one save where two sources disagree: the one that fails it, and its
// quote.
export interface Split {
  save: SaveRef;
  check: SavingCheck;
  failsFor: string;
  quote: string;
}

export interface CheckTally {
  check: SavingCheck;
  both: number;
  onlyFirst: number;
  onlySecond: number;
  neither: number;
}

export interface Comparison {
  first: string;
  second: string;
  saves: number;
  savesAgreed: number;
  tallies: CheckTally[];
  splits: Split[];
}

// Compares two sources on every save both labeled, and every check that fits it, or
// that either source flagged.
export function comparisonOf(
  labeled: readonly LabeledSave[],
  first: string,
  second: string,
): Comparison {
  const tallies = new Map(
    CHECKS.map((check) => [
      check,
      { check, both: 0, onlyFirst: 0, onlySecond: 0, neither: 0 },
    ]),
  );
  const splits: Split[] = [];
  const both = labeled.filter(
    ({ flags }) => flags[first] !== undefined && flags[second] !== undefined,
  );
  let savesAgreed = 0;
  for (const { save, flags } of both) {
    const a = flags[first] ?? [];
    const b = flags[second] ?? [];
    const saveSplits = splitsOn(save, [first, a], [second, b]);
    savesAgreed += saveSplits.length === 0 ? 1 : 0;
    splits.push(...saveSplits);
    for (const check of checksOn(save.tool, a, b)) {
      const tally = tallies.get(check);
      if (tally !== undefined) {
        countIn(tally, hasCheck(a, check), hasCheck(b, check));
      }
    }
  }
  return {
    first,
    second,
    saves: both.length,
    savesAgreed,
    tallies: [...tallies.values()],
    splits,
  };
}

function checksOn(
  tool: string,
  a: readonly Flag[],
  b: readonly Flag[],
): SavingCheck[] {
  const flagged = [...a, ...b].map((flag) => flag.check);
  return CHECKS.filter(
    (check) => checksThatFit(tool).includes(check) || flagged.includes(check),
  );
}

function hasCheck(flags: readonly Flag[], check: SavingCheck): boolean {
  return flags.some((flag) => flag.check === check);
}

function countIn(tally: CheckTally, a: boolean, b: boolean): void {
  if (a && b) {
    tally.both += 1;
  } else if (a) {
    tally.onlyFirst += 1;
  } else if (b) {
    tally.onlySecond += 1;
  } else {
    tally.neither += 1;
  }
}

function splitsOn(
  save: SaveRef,
  [firstName, a]: [string, readonly Flag[]],
  [secondName, b]: [string, readonly Flag[]],
): Split[] {
  const onlyIn = (
    name: string,
    mine: readonly Flag[],
    theirs: readonly Flag[],
  ) =>
    CHECKS.filter(
      (check) => hasCheck(mine, check) && !hasCheck(theirs, check),
    ).map((check) => ({
      save,
      check,
      failsFor: name,
      quote: mine
        .filter((flag) => flag.check === check)
        .map((flag) => flag.quote)
        .join(" | "),
    }));
  return [...onlyIn(firstName, a, b), ...onlyIn(secondName, b, a)];
}

// The comparison as text: the saves both agree on, a line for each check, then each
// split.
export function comparisonReportOf(comparison: Comparison): string {
  const { first, second } = comparison;
  const lines = [
    `## ${first} vs ${second}`,
    "",
    `Saves where every check agrees: ${String(comparison.savesAgreed)} of ${String(comparison.saves)}.`,
    "",
    `| Check | Both fail | Only ${first} | Only ${second} | Both pass |`,
    "|---|---|---|---|---|",
    ...comparison.tallies.map(
      (t) =>
        `| ${t.check} | ${String(t.both)} | ${String(t.onlyFirst)} | ${String(t.onlySecond)} | ${String(t.neither)} |`,
    ),
    "",
    `Splits (${String(comparison.splits.length)}):`,
    ...comparison.splits.map(({ save, check, failsFor, quote }) => {
      const where = `set ${String(save.set)} item ${String(save.item)} save ${String(save.n)} (${save.tool})`;
      const quoted = quote === "" ? "" : `: "${quote}"`;
      return `- ${where}, ${check}, only ${failsFor} fails it${quoted}`;
    }),
  ];
  return `${lines.join("\n")}\n`;
}
