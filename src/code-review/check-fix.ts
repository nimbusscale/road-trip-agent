// Checks the fixer's answer, read from stdin, before it's returned (the fix-pr skill's
// Output section). It prints what's wrong, or "The answer fits.", and exits with 1
// when something's wrong.
//
// npx tsx src/code-review/check-fix.ts <pr-number> <<'EOF'
// <the answer>
// EOF
import { readFileSync } from "node:fs";

import { checkAnswer } from "./fix-check.js";
import { ghApi, localCommits } from "./fix-state.js";
import { pullNumberSchema } from "./post-env.schema.js";

const pullNumber = pullNumberSchema.parse(process.argv[2]);
const checked = await checkAnswer(
  ghApi,
  pullNumber,
  readFileSync(0, "utf8"),
  await localCommits(),
);

if (checked.ok) {
  console.log("The answer fits.");
} else {
  console.log(checked.problems.map((problem) => `- ${problem}`).join("\n"));
  process.exitCode = 1;
}
