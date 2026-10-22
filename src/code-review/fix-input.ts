// Prints what the fixer reads for a PR: its description, the decisions comment, the
// findings marked "fix" in the review of its head, and the earlier findings with their
// replies, each with an ID (the fix-pr skill's step 2). It starts with "Stop:" when the
// fixer has nothing to do, or is on the wrong commit.
//
// npx tsx src/code-review/fix-input.ts <pr-number>
import {
  decisionsComment,
  fixInputText,
  stopReason,
} from "./fix-input-text.js";
import { fixRound } from "./fix-round.js";
import { ghApi, git, loadPrState } from "./fix-state.js";
import { pullNumberSchema } from "./post-env.schema.js";

const pullNumber = pullNumberSchema.parse(process.argv[2]);
const [state, localHead] = await Promise.all([
  loadPrState(ghApi, pullNumber),
  git(["rev-parse", "HEAD"]),
]);
const round = fixRound(state);
const stop = stopReason(round, localHead);

console.log(
  stop === null
    ? fixInputText(
        state.pull,
        decisionsComment(state.pull, state.issueComments),
        round,
      )
    : `Stop: ${stop}`,
);
