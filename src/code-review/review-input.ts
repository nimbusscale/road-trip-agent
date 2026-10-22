// Prints the list of earlier findings that the reviewer reads in place of the PR's
// threads (the review-pr skill's step 2). It reads the threads in its own process, and
// prints only what each reply's marker means, so the reviewer's transcript never shows
// a reply (code review design section 4.3).
//
// node --import tsx src/code-review/review-input.ts <pr-number>
import { postedFindings } from "./fix-round.js";
import { ghApi, loadPrState } from "./fix-state.js";
import { pullNumberSchema } from "./post-env.schema.js";
import { reviewInputText } from "./review-input-text.js";

const pullNumber = pullNumberSchema.parse(process.argv[2]);
const state = await loadPrState(ghApi, pullNumber);

console.log(reviewInputText(pullNumber, postedFindings(state)));
