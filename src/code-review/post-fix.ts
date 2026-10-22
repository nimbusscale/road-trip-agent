// Posts the fixer's answer on the PR, as the fixer's app: pushes its commit, replies
// on each finding, resolves the threads that are fixed or not fixed, and updates the
// summary (code review design section 4.5). It checks the answer first, the way
// check-fix.ts does, and posts nothing when something's wrong. Run it in the checkout
// the fixer committed in.
//
// eval "$(npx tsx --env-file=.env src/code-review/app-token.ts fixer)"
// npx tsx src/code-review/post-fix.ts <pr-number> <answer.json>
import { readFileSync } from "node:fs";

import { checkAnswer } from "./fix-check.js";
import { postFix } from "./fix-post.js";
import { ghApi, git, localCommits } from "./fix-state.js";
import { pullNumberSchema } from "./post-env.schema.js";

const pullNumber = pullNumberSchema.parse(process.argv[2]);
const answerPath = process.argv[3];
if (answerPath === undefined) {
  throw new Error("Usage: post-fix.ts <pr-number> <answer.json>");
}

const checked = await checkAnswer(
  ghApi,
  pullNumber,
  readFileSync(answerPath, "utf8"),
  await localCommits(),
);
if (!checked.ok) {
  console.log(
    ["Nothing posted. The answer doesn't fit:", ...checked.problems].join(
      "\n- ",
    ),
  );
  process.exit(1);
}

const { answer, round, state } = checked;
if (answer.status === "stopped") {
  console.log(`The fixer stopped, so nothing is posted: ${answer.reason}`);
} else {
  const log = await postFix(
    ghApi,
    pullNumber,
    { answer, round, headRef: state.pull.headRef },
    async (headRef) => {
      await git(["push", "origin", `HEAD:refs/heads/${headRef}`]);
    },
  );
  console.log(log.join("\n"));
}
