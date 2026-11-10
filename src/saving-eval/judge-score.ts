import {
  answerFitsSaves,
  type SavingAnswer,
  type SavingCheck,
  savingCheckSchema,
} from "./saving-answer.schema.js";

// One save's settled checks, as the golden set holds them.
export interface ExpectedSave {
  n: number;
  tool: string;
  checks: SavingCheck[];
}

// Where the judge and the settled label differ on one save and one check. A miss is a
// check the label fails that the judge passed. A false alarm is a check the judge
// failed that the label passes, with the judge's quote and why.
export interface JudgeDiff {
  n: number;
  tool: string;
  check: SavingCheck;
  kind: "miss" | "false alarm";
  quote: string;
  why: string;
}

// Each place the judge's answer differs from the settled labels. It throws when the
// answer doesn't have one entry for each save, in order, since then it can't be
// compared save by save.
export function judgeDiffsOf(
  expected: readonly ExpectedSave[],
  answer: SavingAnswer,
): JudgeDiff[] {
  if (!answerFitsSaves(answer, expected.length)) {
    throw new Error(
      `The judge's answer doesn't have one entry for each of the ${String(expected.length)} saves, in order.`,
    );
  }
  return expected.flatMap((save, index) => {
    const failures = answer.saves[index]?.failures ?? [];
    return savingCheckSchema.options.flatMap((check): JudgeDiff[] => {
      const labeled = save.checks.includes(check);
      const judged = failures.filter((failure) => failure.check === check);
      if (labeled && judged.length === 0) {
        return [
          {
            n: save.n,
            tool: save.tool,
            check,
            kind: "miss",
            quote: "",
            why: "",
          },
        ];
      }
      if (!labeled && judged.length > 0) {
        return [
          {
            n: save.n,
            tool: save.tool,
            check,
            kind: "false alarm",
            quote: judged.map((failure) => failure.quote).join(" | "),
            why: judged.map((failure) => failure.why).join(" | "),
          },
        ];
      }
      return [];
    });
  });
}

// One check's count over many judged turns: how many saves the label fails on it, and
// how many of those the judge missed, and how many saves it failed that the label
// passes.
export interface CheckCount {
  check: SavingCheck;
  labeled: number;
  misses: number;
  falseAlarms: number;
}

export function checkCountsOf(
  judged: readonly {
    expected: readonly ExpectedSave[];
    diffs: readonly JudgeDiff[];
  }[],
): CheckCount[] {
  return savingCheckSchema.options.map((check) => ({
    check,
    labeled: judged.reduce(
      (sum, turn) =>
        sum +
        turn.expected.filter((save) => save.checks.includes(check)).length,
      0,
    ),
    misses: countOf(judged, check, "miss"),
    falseAlarms: countOf(judged, check, "false alarm"),
  }));
}

function countOf(
  judged: readonly { diffs: readonly JudgeDiff[] }[],
  check: SavingCheck,
  kind: JudgeDiff["kind"],
): number {
  return judged.reduce(
    (sum, turn) =>
      sum +
      turn.diffs.filter((d) => d.check === check && d.kind === kind).length,
    0,
  );
}
