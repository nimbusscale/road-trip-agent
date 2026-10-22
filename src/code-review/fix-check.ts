import { answerProblems, closedIssues } from "./fix-answer.js";
import { type FixAnswer, fixAnswerSchema } from "./fix-answer.schema.js";
import { fixRound, type FixRound, type PrState } from "./fix-round.js";
import {
  type GhApi,
  type LocalCommits,
  loadPrState,
  openIssues,
} from "./fix-state.js";

export type CheckedAnswer =
  | {
      ok: true;
      answer: FixAnswer;
      state: PrState;
      round: FixRound;
    }
  | { ok: false; problems: string[] };

// Checks the fixer's answer against its schema, and then against the PR's round, as
// it stands on GitHub (code review design section 4.5). check-fix.ts and post-fix.ts
// both run it, so nothing is posted from an answer the fixer couldn't have checked.
export async function checkAnswer(
  gh: GhApi,
  pullNumber: number,
  answerText: string,
  local: LocalCommits,
): Promise<CheckedAnswer> {
  let json: unknown;
  try {
    json = JSON.parse(answerText);
  } catch (error) {
    return { ok: false, problems: [`The answer isn't JSON: ${String(error)}`] };
  }
  const parsed = fixAnswerSchema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      problems: parsed.error.issues.map(
        (issue) => `${issue.path.join(".") || "The answer"}: ${issue.message}`,
      ),
    };
  }
  const answer = parsed.data;
  const state = await loadPrState(gh, pullNumber);
  const round = fixRound(state);
  const deferredTo =
    answer.status === "done"
      ? answer.replies.flatMap((r) => (r.issue === null ? [] : [r.issue]))
      : [];
  const problems = answerProblems(answer, round, {
    local,
    openIssues: await openIssues(gh, deferredTo),
    ownIssues: closedIssues(state.pull.body),
  });
  return problems.length === 0
    ? { ok: true, answer, state, round }
    : { ok: false, problems };
}
