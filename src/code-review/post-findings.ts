// Posts the reviewer's findings on the PR, and writes the list of findings that weren't
// posted. The "Code review" workflow runs it after the review (code review design
// section 4.2). It prints a summary in Markdown, for the job summary.
//
// tsx src/code-review/post-findings.ts <review.json> <not-posted.md>
import { readFileSync, writeFileSync } from "node:fs";

import { countLine, notPostedList } from "./findings.js";
import { postEnvSchema } from "./post-env.schema.js";
import { gitHubPost, postFindings } from "./post-to-github.js";
import { reviewResultSchema } from "./review-result.schema.js";

const [reviewPath, notPostedPath] = process.argv.slice(2);
if (reviewPath === undefined || notPostedPath === undefined) {
  throw new Error("Usage: post-findings.ts <review.json> <not-posted.md>");
}

const env = postEnvSchema.parse({
  repository: process.env.GITHUB_REPOSITORY,
  pullNumber: process.env.PR_NUMBER,
  commitId: process.env.HEAD_SHA,
  token: process.env.GH_TOKEN,
});
const findings = reviewResultSchema.parse(
  JSON.parse(readFileSync(reviewPath, "utf8")),
);

const notPosted = notPostedList(findings);
writeFileSync(notPostedPath, notPosted);
const counts = await postFindings(findings, env, gitHubPost(env.token));

console.log(
  [
    "## Findings",
    countLine(findings),
    `Posted ${String(counts.inline)} on their line, ${String(counts.fileLevel)} on their file, and ${String(counts.outsideDiff)} in a review body, for files outside the diff.`,
    "## Not posted",
    notPosted,
  ].join("\n\n"),
);
