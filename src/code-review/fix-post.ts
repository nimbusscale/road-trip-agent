import type { FixAnswer, FixReply } from "./fix-answer.schema.js";
import { findingTag, markerLine } from "./fix-markers.js";
import {
  type FixRound,
  type PostedFinding,
  postedFindings,
  whereOf,
} from "./fix-round.js";
import { type GhApi, loadPrState, loadThreads } from "./fix-state.js";
import { summaryBody, summaryComment, tickedIds } from "./fix-summary.js";
import { postedCommentSchema } from "./github-pr.schema.js";

// After a reply that says the finding is fixed or not fixed, its thread is resolved.
// Deferred ones and ones that need attention stay open for Joe (code review design
// section 4.4).
const RESOLVED_OUTCOMES: ReadonlySet<string> = new Set([
  "fixed",
  "below_the_bar",
  "wrong",
]);

// Does every write on the PR for a checked answer: posts each reply with its marker,
// resolves the threads, updates the summary, and pushes the commit (code review design
// section 4.5). The push comes last, since it starts the next review, which reads the
// replies' markers. It returns what it did, a line each.
export async function postFix(
  gh: GhApi,
  pullNumber: number,
  checked: {
    answer: FixAnswer;
    round: FixRound;
    headRef: string;
    commit: string | null;
  },
  push: (headRef: string) => Promise<void>,
): Promise<string[]> {
  const { answer, round, headRef, commit } = checked;
  const log: string[] = [];
  const findings = new Map(
    [...round.pending, ...round.askable].map((f) => [f.id, f]),
  );
  for (const reply of answer.replies) {
    const finding = findings.get(reply.findingId);
    if (finding !== undefined) {
      const url = await postReply(gh, pullNumber, finding, { reply, commit });
      log.push(`Replied on ${finding.id}: ${url}`);
    }
  }
  log.push(...(await resolveThreads(gh, pullNumber, answer.replies, findings)));
  log.push(await updateSummary(gh, pullNumber));
  if (commit !== null) {
    await push(headRef);
    log.push(`Pushed ${commit} to ${headRef}.`);
  }
  return log;
}

async function postReply(
  gh: GhApi,
  pullNumber: number,
  finding: PostedFinding,
  { reply, commit }: { reply: FixReply; commit: string | null },
): Promise<string> {
  const marker = markerLine(reply.outcome, commit, reply.deferredTo);
  const posted =
    finding.threadCommentId === null
      ? await gh([
          "-X",
          "POST",
          `repos/{owner}/{repo}/issues/${String(pullNumber)}/comments`,
          "-f",
          `body=${reviewBodyReply(finding, marker, reply.reply)}`,
        ])
      : await gh([
          "-X",
          "POST",
          `repos/{owner}/{repo}/pulls/${String(pullNumber)}/comments/${String(finding.threadCommentId)}/replies`,
          "-f",
          `body=${marker}\n\n${reply.reply}`,
        ]);
  return postedCommentSchema.parse(posted).url;
}

// A finding in a review body has no thread, so its reply is a conversation comment
// that quotes it, and is tagged with its ID (code review design section 3.6). The ID
// is shown too, since Joe replies to it by naming it.
export function reviewBodyReply(
  finding: PostedFinding,
  marker: string,
  reply: string,
): string {
  const where = whereOf(finding);
  const quoted = finding.text
    .split("\n")
    .map((line) => (line === "" ? ">" : `> ${line}`))
    .join("\n");
  return [
    marker,
    `> On \`${where}\`, in [the review](${finding.url}):\n>\n${quoted}`,
    reply,
    `To reply, post a comment that names \`${finding.id}\`.`,
    findingTag(finding.id),
  ].join("\n\n");
}

async function resolveThreads(
  gh: GhApi,
  pullNumber: number,
  replies: readonly FixReply[],
  findings: ReadonlyMap<string, PostedFinding>,
): Promise<string[]> {
  const toResolve = new Set(
    replies
      .filter((r) => RESOLVED_OUTCOMES.has(r.outcome))
      .map((r) => findings.get(r.findingId)?.threadCommentId ?? null)
      .filter((id) => id !== null),
  );
  const threads = (await loadThreads(gh, pullNumber)).filter(
    (t) => toResolve.has(t.firstCommentId) && !t.isResolved,
  );
  for (const thread of threads) {
    await gh([
      "graphql",
      "-f",
      "query=mutation($id: ID!) { resolveReviewThread(input: {threadId: $id}) { thread { id } } }",
      "-f",
      `id=${thread.threadId}`,
    ]);
  }
  return [`Resolved ${String(threads.length)} threads.`];
}

// Built again from the PR as it stands after the replies, so it covers every round.
async function updateSummary(gh: GhApi, pullNumber: number): Promise<string> {
  const [state, threads] = await Promise.all([
    loadPrState(gh, pullNumber),
    loadThreads(gh, pullNumber),
  ]);
  const existing = summaryComment(state.issueComments);
  const body = summaryBody(
    postedFindings(state).filter((f) => f.kind === "Fix"),
    threads,
    tickedIds(existing?.body ?? ""),
  );
  if (existing === null) {
    const posted = postedCommentSchema.parse(
      await gh([
        "-X",
        "POST",
        `repos/{owner}/{repo}/issues/${String(pullNumber)}/comments`,
        "-f",
        `body=${body}`,
      ]),
    );
    return `Posted the summary: ${posted.url}`;
  }
  await gh([
    "-X",
    "PATCH",
    `repos/{owner}/{repo}/issues/comments/${String(existing.id)}`,
    "-f",
    `body=${body}`,
  ]);
  return `Updated the summary: ${existing.url}`;
}
