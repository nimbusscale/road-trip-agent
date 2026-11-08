import { readCorpus } from "./corpus-reader.js";
import { JUDGE_ANNOTATOR, saveAnnotations } from "./grounded-annotations.js";
import { CONCURRENCY, judgeFor } from "./judge.js";
import { judgeInputOf } from "./judge-input.js";
import type { GroundedLabel, LabelAnswer } from "./label-answer.schema.js";

export interface CorpusRun {
  labels: Map<GroundedLabel, number>;
  // Turns the judge gave no answer for, with why.
  failed: { spanId: string; error: string }[];
}

// Runs the judge once on every corpus turn, with the rubric commit's prompt, and saves
// its answers as `grounded-haiku` annotations (#282, step 9). Saving again replaces the
// judge's earlier annotations, so a rerun after a failure is safe.
export async function judgeCorpus(
  phoenixUrl: string,
  rubricVersion: string,
): Promise<CorpusRun> {
  const { judge } = await judgeFor(phoenixUrl, rubricVersion);
  const turns = (await readCorpus(phoenixUrl)).flatMap((session) =>
    session.turns.map((turn) => ({
      spanId: turn.spanId,
      judgeInput: judgeInputOf(session, turn.spanId),
    })),
  );
  console.log(`Judging ${String(turns.length)} turns.`);
  const answers = new Map<string, LabelAnswer>();
  const failed: CorpusRun["failed"] = [];
  await inPool(turns, async ({ spanId, judgeInput }) => {
    try {
      answers.set(spanId, await judge(judgeInput));
    } catch (error) {
      failed.push({ spanId, error: String(error) });
    }
    const done = answers.size + failed.length;
    if (done % 25 === 0) {
      console.log(`${String(done)} of ${String(turns.length)} done.`);
    }
  });
  await saveAnnotations(phoenixUrl, JUDGE_ANNOTATOR, answers, rubricVersion);
  const labels = new Map<GroundedLabel, number>();
  for (const { label } of answers.values()) {
    labels.set(label, (labels.get(label) ?? 0) + 1);
  }
  return { labels, failed };
}

// Runs the task on each item, a few at a time.
async function inPool<T>(
  items: T[],
  task: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items];
  const worker = async (): Promise<void> => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
      await task(item);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
}
