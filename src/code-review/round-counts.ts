// Prints what decides whether the fix job runs, as lines for $GITHUB_OUTPUT (code review
// design section 4.6): how many findings marked "fix" in the review of the PR's head have
// no reply from the fixer yet, and how many findings that need attention have a reply
// from Joe after the fixer's. The review job runs it after it posts its findings.
//
// node --import tsx src/code-review/round-counts.ts <pr-number>
import { fixRound } from "./fix-round.js";
import { ghApi, loadPrState } from "./fix-state.js";
import { pullNumberSchema } from "./post-env.schema.js";

const pullNumber = pullNumberSchema.parse(process.argv[2]);
const round = fixRound(await loadPrState(ghApi, pullNumber));

console.log(`fix=${String(round.pending.length)}`);
console.log(`asked=${String(round.askable.length)}`);
