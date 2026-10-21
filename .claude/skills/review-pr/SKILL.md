---
name: review-pr
description: Reviews a pull request against the project's bar, labels each finding with the rubric in code review design section 3.1, and returns the findings as JSON. The "Code review" workflow runs it, and posts what it returns. Takes the PR number.
disable-model-invocation: true
---

Review target: pull request #$ARGUMENTS

You are reviewing this pull request for the bugs a careful reviewer would catch in one sitting. You then label each finding with the project's rubric, so the fix loop knows which ones to fix. Catching real bugs matters more than avoiding a wrong guess, since every finding is checked and labeled before it's returned.

You only read and report. Don't post or edit comments, and don't change any file in the repo. The workflow posts the findings you return.

Your working directory is the repo root. Run each command from there, without `cd`. A command that starts with `cd` and then reads a file by a relative path is refused.

## Step 1: Read the rubric

Read `design/code-review.md` section 3.1, all of it. It's the only rule for choosing a label. It also defines "normal use" and each label's limits. F5 points to the threat model in `CLAUDE.md`, under "What this project is".

## Step 2: Read the task and the earlier findings

Read the PR description:

```sh
gh pr view $ARGUMENTS --json title,body,baseRefName,headRefOid
```

The description holds the task: the issue's "Do" and "Done when" items, and what was checked by hand. It may also have a "Set aside" list (code review design section 4.4).

Then read the findings earlier reviews posted. These are inline comments, plus the body of any review that has one:

```sh
gh api "repos/{owner}/{repo}/pulls/$ARGUMENTS/comments" --paginate
gh api "repos/{owner}/{repo}/pulls/$ARGUMENTS/reviews" --paginate
```

**Never read the PR's conversation comments, or the comments on any issue.** They hold the implementer's reasons for writing the code the way they did, and those would color your review. So don't run `gh pr view --comments`, `gh issue view --comments`, or `gh api` on an `issues/.../comments` path. You may read an issue's own body, with `gh issue view <number> --json number,title,state,body`.

## Step 3: Gather the diff

The PR's base branch is `baseRefName` from step 2. It exists as a local branch, and `HEAD` is the PR's own commit.

```sh
git log --oneline <base>..HEAD
git diff <base>...HEAD
```

Treat this diff as the review scope. Review the whole PR, not only the commits since the last review.

## Step 4: Read the design docs

Read `design/README.md`. Then read the design docs that cover the changed files, and the sections the task points to. Read `DEVELOPMENT.md` when the PR changes code. The design docs say what the code should do, so you can't tell a wrong result from a right one without them. Read only what the PR touches.

## Step 5: Find candidates

Look at the PR from each of these four angles, one after another. For each candidate, note its file and line, what goes wrong, and a concrete case where it goes wrong.

### Angle A: line by line

Read every hunk in the diff, line by line. Then read the whole function around each hunk. A bug in an unchanged line of a changed function is in scope, since the PR exposes it again or fails to fix it. For every line, ask what input, state, timing, or platform makes it wrong. Look for wrong or inverted conditions, off-by-one errors, null or undefined reads, a missing `await`, checks that treat 0 or "" as missing, a copied line with the wrong variable, an error swallowed in a catch, and regex characters that aren't escaped.

### Angle B: removed behavior

For every line the diff deletes or replaces, name the rule or behavior it enforced. Then search the new code for where that rule is enforced again. If you can't find it, that's a candidate: a removed guard, a dropped error path, a narrower check, or a deleted test that covered a real case.

### Angle C: callers and callees

For each function the diff changes, find its callers with Grep. Check whether the change breaks any of them: a new precondition, a changed return shape, a new exception, or a new dependency on timing or order. Also check the functions it calls. Does another change in the same PR make one of those calls unsafe?

### Angle D: the task, the docs, and the tests

- **The task.** For each "Do" and "Done when" item, check that the PR does it, as the item and the design sections it points to say.
- **Text a road trip agent reads.** For each tool description, input schema, tool reply, and error message the PR adds or changes, check that it's true. Tool design (`design/tools.md`) says what each tool takes and returns.
- **The design docs.** For each design doc the PR changes, and each one that covers the changed code, check that it matches the code and doesn't contradict itself.
- **The tests.** For each test the PR adds or changes, ask whether it would fail if the thing it targets broke.

Don't look for cleanups, reuse, speed, or style. Those are notes at best.

Keep every candidate that has a concrete case where it goes wrong. Step 6 checks them. Dropping a half-believed candidate here is the most common way a real bug is missed.

## Step 6: Check each candidate, then label it

First, merge candidates that are the same problem at the same place.

Then, for each candidate:

1. **Check the claim against the code.** Read as much as you need. When running code locally would settle it, run it with `node`, such as a rounding case, a timeout, or how a Zod schema handles an input. `node -e` runs a short script. To import the repo's TypeScript, use `node --import tsx --input-type=module -e "..."`, or run a TypeScript file with `npx tsx <file>`. Don't run the tests. CI already runs them in a separate job. Run each check inline, with `-e`, and don't write files. A command with a variable in braces, such as `${PIPESTATUS[0]}`, is refused. Your commands can reach only GitHub, so a check that needs any other service can't run. That's what V1 is for.
2. **Drop it if it's already handled.** Drop a finding that's on the description's "Set aside" list. Drop one that an earlier finding already makes. The exception is when the lines it points to have changed since, and the problem is still there. Then keep it, and say in the finding that the change didn't fix it.
3. **Label it.** Go down the rubric's table, and give it the first label that fits. A D label fits only when it clearly fits. When you're unsure, keep going down the table. When a code comment hands the work to an issue, read that issue's body before you choose D3, as the rubric says.

A finding whose claim turns out to be false still gets returned, labeled D1. Don't drop it. Joe checks the D labels.

## Output

Your final answer is a JSON object with one key, `findings`, holding an array. Return `{"findings": []}` when there's nothing to report. Each finding has these keys, and all of them are required:

- `file`: the file's path from the repo root, such as `src/tools/trip-brief-tools.ts`.
- `line`: a line number in the PR's version of the file. Take it from the file itself, with Read or `grep -n`. Don't take it from the diff. When the diff is long, Claude Code saves it to a file, and a line number in that file is a line of the diff, not of the source file. When the finding is about a removed line, use the nearest line that's still there.
- `label`: its label from the rubric, such as `F2`, `N1`, `V1`, or `D3`.
- `finding`: what goes wrong, and a concrete case where it does. For V1, also say what to check and how, such as the call to make. This is posted as the comment, so it has to make sense on its own.
- `labelReason`: one or two sentences on why the label fits, and why the labels above it in the table don't. For a D label, this is the reason it isn't posted, such as which issue a D3 hands the work to.

Write `finding` and `labelReason` in plain words, with one idea per sentence. Name the function or value you mean. Give the concrete case, such as "a trip of 15 days saves without an error", instead of a general statement such as "edge cases aren't handled."
