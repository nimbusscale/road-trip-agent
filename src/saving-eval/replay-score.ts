import {
  type SavingAnswer,
  type SavingCheck,
  savingCheckSchema,
} from "./saving-answer.schema.js";

// How a replay run is scored (#209, "What counts as a pass for a replay"). The judge
// checks every save on F1 to F6, and a run passes when no save fails any check. A run
// that saved nothing passes too, since the rubric never fails a missed save, so it's
// counted on its own. So is whether the run passed the checks the golden turn failed,
// since a fix can move a mistake to another check.

export interface ReplayScore {
  saves: number;
  // The checks any save fails, in check order.
  failing: SavingCheck[];
}

export function replayScoreOf(answer: SavingAnswer): ReplayScore {
  const failed = new Set(
    answer.saves.flatMap((save) => save.failures.map((f) => f.check)),
  );
  return {
    saves: answer.saves.length,
    failing: savingCheckSchema.options.filter((check) => failed.has(check)),
  };
}

export function passes(score: ReplayScore): boolean {
  return score.failing.length === 0;
}

export function passesChecks(
  score: ReplayScore,
  checks: readonly SavingCheck[],
): boolean {
  return checks.every((check) => !score.failing.includes(check));
}

export function savedNothing(score: ReplayScore): boolean {
  return score.saves === 0;
}

// One case in the report: where it is in the turns file, the checks the golden turn
// failed, and each of its runs, judged or failed.
export interface ReplayCaseRuns {
  set: number;
  item: number;
  originalChecks: SavingCheck[];
  runs: ({ score: ReplayScore } | { error: string })[];
}

// The report: a row for each case, then the totals, then how many runs failed each
// check. A failed run, such as one stopped by the Claude plan's limit, has no score,
// so it's counted apart from the others.
export function replayReportOf(
  title: string,
  cases: readonly ReplayCaseRuns[],
): string {
  const sorted = [...cases].sort((a, b) => a.set - b.set || a.item - b.item);
  const rows = sorted.map((c) => ({
    name: `${String(c.set)}.${String(c.item)}`,
    c,
  }));
  const totals = sumOf(sorted.map(countsOf));
  const runCount = sorted.reduce((sum, c) => sum + c.runs.length, 0);
  const scored = runCount - totals.failed;
  const lines = [
    `# ${title}`,
    "",
    `${String(sorted.length)} cases, ${String(runCount)} runs: ${String(scored)} judged, ${String(totals.failed)} failed. Of the judged runs, ${String(totals.passed)} passed, ${String(totals.passedOriginal)} passed the checks their golden turn failed, and ${String(totals.nothing)} saved nothing.`,
    "",
    "| Case | Golden turn failed | Judged | Failed runs | Passed | Passed its golden checks | Saved nothing | Checks failed, in how many runs |",
    "|---|---|---|---|---|---|---|---|",
    ...rows.map(({ name, c }) => {
      const n = countsOf(c);
      return `| ${name} | ${c.originalChecks.join(", ")} | ${String(c.runs.length - n.failed)} | ${String(n.failed)} | ${String(n.passed)} | ${String(n.passedOriginal)} | ${String(n.nothing)} | ${checksText(n.byCheck)} |`;
    }),
    "",
    "## Runs that failed each check",
    "",
    "| Check | Judged runs that fail it | Cases whose golden turn failed it | Their judged runs that fail it |",
    "|---|---|---|---|",
    ...savingCheckSchema.options.map((check) => checkRow(check, sorted)),
    "",
  ];
  const errors = sorted.flatMap((c) =>
    c.runs.flatMap((run) =>
      "error" in run
        ? [`- ${String(c.set)}.${String(c.item)}: ${run.error}`]
        : [],
    ),
  );
  if (errors.length > 0) {
    lines.push("## Failed runs", "", ...errors, "");
  }
  return lines.join("\n");
}

interface Counts {
  failed: number;
  passed: number;
  passedOriginal: number;
  nothing: number;
  byCheck: Map<SavingCheck, number>;
}

function countsOf(c: ReplayCaseRuns): Counts {
  const counts: Counts = {
    failed: 0,
    passed: 0,
    passedOriginal: 0,
    nothing: 0,
    byCheck: new Map(),
  };
  for (const run of c.runs) {
    if ("error" in run) {
      counts.failed += 1;
      continue;
    }
    const { score } = run;
    counts.passed += passes(score) ? 1 : 0;
    counts.passedOriginal += passesChecks(score, c.originalChecks) ? 1 : 0;
    counts.nothing += savedNothing(score) ? 1 : 0;
    for (const check of score.failing) {
      counts.byCheck.set(check, (counts.byCheck.get(check) ?? 0) + 1);
    }
  }
  return counts;
}

function sumOf(counts: readonly Counts[]): Omit<Counts, "byCheck"> {
  const sum = (key: "failed" | "passed" | "passedOriginal" | "nothing") =>
    counts.reduce((total, c) => total + c[key], 0);
  return {
    failed: sum("failed"),
    passed: sum("passed"),
    passedOriginal: sum("passedOriginal"),
    nothing: sum("nothing"),
  };
}

function checksText(byCheck: ReadonlyMap<SavingCheck, number>): string {
  const parts = savingCheckSchema.options.flatMap((check) => {
    const count = byCheck.get(check);
    return count === undefined ? [] : [`${check} ${String(count)}`];
  });
  return parts.length === 0 ? "none" : parts.join(", ");
}

function checkRow(
  check: SavingCheck,
  cases: readonly ReplayCaseRuns[],
): string {
  const judged = (c: ReplayCaseRuns) =>
    c.runs.flatMap((run) => ("error" in run ? [] : [run.score]));
  const failing = (c: ReplayCaseRuns) =>
    judged(c).filter((score) => score.failing.includes(check)).length;
  const own = cases.filter((c) => c.originalChecks.includes(check));
  const ownRuns = own.reduce((sum, c) => sum + judged(c).length, 0);
  const ownFailing = own.reduce((sum, c) => sum + failing(c), 0);
  const allFailing = cases.reduce((sum, c) => sum + failing(c), 0);
  return `| ${check} | ${String(allFailing)} | ${String(own.length)} | ${String(ownFailing)} of ${String(ownRuns)} |`;
}
