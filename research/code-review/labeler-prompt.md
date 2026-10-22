# Road Trip Planner: The Labeler Prompt

> **This is a research document, not a design document.** It's the prompt the labelers ran with in [#75](https://github.com/nimbusscale/road-trip-agent/issues/75), to test the rubric in [code review design](../../design/code-review.md) section 3.1.
>
> **How it was run.** Each labeler was a `claude -p` run with Opus at `--effort high`, in a fresh folder outside the repo. The folder held a clone cut at the reviewed commit, the rubric (section 3.1 only), a `task.md` naming the PR, its base commit, and its task, and an `items.json`. Each item had only an ID, the claim, and the file and line. The labeler got no earlier labels or reasons. Its tools were read-only, plus `git`, `jq`, and `node`, with no `gh` and no web tools. It answered with a JSON array, one object per item: `{"id", "label", "reasoning", "checked"}`, where `checked` lists the files and lines it read. Two labelers labeled the same items, each on its own, and a script compared them by group.
>
> One note is added below, marked "Not part of the prompt". Otherwise the text is as the labelers got it.

Everything below the line is the prompt.

---

You are labeling code review findings for an evaluation. The labels become an answer key for testing a code reviewer. Work carefully and on your own judgment.

Your working folder holds:

- `rubric.md`: the rubric. It is the only rule for choosing a label.
- `task.md`: which PR was reviewed, the commits, and where its task is written.
- `items.json`: the findings to label. Each has an `id`, a `claim`, and `where`, which lists places in the code that may help. `where` can be empty or incomplete.
- `repo/`: the repository as the reviewer saw it. Its history ends at the reviewed commit.

> **Not part of the prompt:** the next paragraph was only for the old corpus, which came from before work was tracked in GitHub issues. A labeler for a newer PR would use its GitHub issue instead.

This corpus comes from before the project tracked work in GitHub issues. Where the rubric says "issue", use `plan/development-plan.md` in `repo/`. The PR's own phase is its issue, and a later phase stands in for another issue. A phase's "Do" items and open questions are its description. A code comment that names a later phase counts as naming the issue.

For each item:

1. Read the claim. It is what a reviewer said, and it may be wrong.
2. Check it against the code, the design docs, and the plan in `repo/`. Read as much as you need. You may run `node` to test a claim. The PR's changes are `git diff <base>..HEAD` in `repo/`, with the base given in `task.md`.
3. Give it exactly one label from the rubric: the first label in the rubric's table that fits. Valid labels are V1, D1 to D3, F1 to F7, NF2 to NF5, and N1 to N6.
4. Write your reasoning in 2 to 4 plain sentences: what you found in the code or docs, and why that label fits and the ones before it in the table don't.

Rules:

- Stay inside your working folder. Don't use the web or `gh`. Don't change any file.
- Label every item, and give each one its own judgment, even when two items are about the same code.

When you're done, your final message must be only a JSON array, with no other text and no code fence. One object per item, in the order of `items.json`:

[{"id": "...", "label": "...", "reasoning": "...", "checked": ["path:line", "..."]}]

`checked` lists the files and lines you actually read to decide.
