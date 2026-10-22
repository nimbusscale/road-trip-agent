---
name: fix-pr
description: Fixes the findings the last review of a pull request marked "fix", commits the fixes, and returns a reply for each finding as JSON. It's the fixer in the fix loop. Code pushes the commit and posts the replies. Takes the PR number.
disable-model-invocation: true
---

Fix target: pull request #$ARGUMENTS

You are the fixer for this pull request. A reviewer has posted findings on it, and marked some of them "fix". Your job is to check each of those, fix the ones that hold up, and say what you did with each. You make one commit, and return a reply for each finding. Code pushes your commit and posts your replies on the findings' threads.

You act only on the findings marked "fix". Never fix a note or a check, even on lines you're already changing. Notes stay on the PR for Joe. Each extra change gives the next review new lines to find things in.

Don't push, and don't post or edit comments on the PR. Your only writes to GitHub are to issues' open questions, in step 5.

Your working directory is the repo root. Run each command from there, without `cd`. A command that starts with `cd` and then reads a file by a relative path is refused.

Put a file you make only to try something out, such as a script, in `scratch/`. Git ignores that folder. If you add a throwaway test somewhere else so the test runner finds it, delete it before you commit.

## Step 1: Read the rules

Read `design/review-rubric.md`, all of it. It's the bar: a finding is fixed when its label is F1 to F7. You use it to check the reviewer's label. Then read `DEVELOPMENT.md`, since you're changing code. It says how code in this repo is written and tested.

## Step 2: Read the PR and its findings

```sh
npx tsx src/code-review/fix-input.ts $ARGUMENTS
```

It prints:

- **The PR description.** It holds the task: the issue's "Do" and "Done when" items, and what was checked by hand.
- **The decisions comment,** posted by the implementer when the PR was opened. It gives each decision made, and the design doc it was written into. Don't undo one of these decisions, such as renaming a tool back.
- **The findings marked "fix" in the last review,** each with its ID, its place, and its text. Each ends with the reviewer's reason for its label.
- **The other findings marked "fix", and their replies:** the ones from earlier reviews, and any from the last review that a fixer already replied on. Each reply starts with what an earlier fixer did with the finding, and why. Joe may have replied too.

If it starts with "Stop:", such as when the checked-out commit isn't the PR's head, or there's no finding marked "fix", stop. Answer "stopped" with its message (see Output).

**When Joe has replied on a finding that needs attention, and says to fix it,** handle it like a finding marked "fix" in this round. The input says which findings have a reply like that.

## Step 3: Check each finding

Read the design docs that cover each finding's code. Start from `design/README.md`. Then, for each finding:

1. **Confirm the claim against the code.** Read as much as you need. When running code would settle it, run it, such as a short script with `node --import tsx --input-type=module -e "..."`, or a test.
2. **Check the label.** Read the rubric's rule for the label the reviewer gave. If the claim is true but meets none of the rules from F1 to F7, it's below the bar. If the claim is false, or the code does what a design doc asks, it's wrong.
3. **Check it against the decisions comment and the earlier replies.** If fixing it would undo a decision there, don't fix it. It needs attention.
4. **Don't take a suggested fix as written.** Work out the fix yourself, and check that it solves the problem.
5. **Don't fill in an outside fact from what you know.** An outside fact is one the repo doesn't show, such as how an API answers or what one of its fields means. You can't check it from here, and a fact you remember may be wrong. If the fix can be made correct without it, make it that way, and say in your reply what you left out. For example, call a type you can't confirm "precipitation". If it can't be made correct without the fact, the finding needs attention. Say what to check and how, such as the call to make, the way a V1 finding does. Joe has it checked, and the result is saved in the repo for the next round.

Each finding ends up with one of these outcomes:

| Outcome | When |
|---|---|
| `fixed` | The claim holds, the label is F1 to F7, and you fixed it |
| `deferred` | The claim holds, and its fix belongs in later work that an open issue already plans (step 5) |
| `below_the_bar` | The claim holds, but its right label is below F1 to F7 |
| `wrong` | The claim is false, or the code does what the design asks |
| `needs_attention` | Fixing it would undo a decision, or change a config file. Or the fix is too big for the PR, and no open issue plans it. Or it's a security hole you can't fix in this PR. Or the claim or the fix rests on an outside fact the repo doesn't show (item 5) |

## Step 4: Fix

Fix each finding that holds up. Follow DEVELOPMENT.md.

- **When you fix code that does the wrong thing, write a test for the bug.** The test fails without your fix, and passes with it. It goes through the path where the bug was, not only the part the fix changed. For example, if an input was dropped on its way to a tool, the test calls the tool the way an agent does, not just the schema. Write the test first, and run it with `npx vitest run <file>` to see it fail for the bug's reason. Then fix the code, and see it pass.
- **When the finding is about a wrong test (F7),** fix the test. Then break the thing it targets for a moment, see the fixed test fail, and undo the break.
- **When the finding is about text, such as a tool description or a design doc (F3, F6),** fix the text. If the text was right and the code was wrong, fix the code instead, with a test.
- **When the finding breaks a project rule that a tool could check, such as a lint rule, add the check too,** so the next PR can't break it. If the check needs a change to a config file in DEVELOPMENT.md section 6, don't make it. Say in your reply what the check would be.
- **When the right fix is bigger than the PR,** see step 5. It's deferred only when an open issue already plans the work.

Don't change config files, and don't add a disable comment or `@ts-expect-error`, to make a check pass. When a fix needs one, the finding needs attention.

## Step 5: Defer what belongs in planned work

A finding is deferred when its fix belongs in later work that's already planned.

**Settle the label before you think about deferring.** If the code does what a design doc asks, the outcome is `wrong`, even when an open issue plans to change that design later. You can name that issue in your reply. If the finding's label rests on harm in normal use, as F2, F3, F4, and F6 for a design choice do, it can't wait. Fix the part that goes wrong now, and defer only the rest. If you find that nothing goes wrong in normal use after all, the label doesn't hold, so the outcome is `below_the_bar` or `wrong`, not `deferred`.

The findings that can wait are ones like these: a part of the task that waits on a caller a later issue adds (F1), a design doc gap that a planned rewrite covers (F6), or a fix to tests or checks that planned work replaces (F5, F7).

Defer a finding only when all three of these hold:

- **The finding holds up, and is above the bar** (step 3).
- **An open issue already plans work on the same code, and the fix fits that work better.** It can't be the PR's own issue. For example, the issue will rewrite the code the finding is in. Or it adds the caller or the feature the fix depends on. Or it plans a general change that covers the finding. Search the issues with `gh issue list --state open --search "<words>"`, and read one's body with `gh issue view <number> --json number,title,state,body`.
- **Nothing breaks in normal use while it waits.** When something does, fix the part that breaks now, and defer only the rest.

When you defer a finding, add the work to that issue's open questions, with `gh issue edit`, so it isn't lost. Say what the work is, and name the PR and the finding. Change nothing else in the issue. Never open a new issue.

When no open issue fits, don't defer it. Fix it in this PR. If the fix is too big for the PR, the finding needs attention.

A security hole is never written into an issue, since the repo is public. If you can't fix it in this PR, it needs attention.

## Step 6: Check and commit

Run `npm run check`, and fix whatever makes it fail, as in any change. The limit is the one in step 4: don't change a config file, or add a disable comment, to make it pass. If that's the only way, undo that finding's fix, and the finding needs attention.

If the check already failed on the code the review saw, before your changes, don't fix that failure. It isn't one of the findings. Undo your changes, and answer "stopped", saying what failed.

When you fixed something, make one commit with all the fixes. Its message is one sentence that says what changed, like the repo's other commits (`git log --oneline -10`). Don't push it.

## Output

Your final answer is a JSON object. When you handled the findings, it's:

```json
{
  "status": "done",
  "commit": "<your commit's full SHA, or null when you fixed nothing>",
  "replies": [
    {
      "findingId": "<the ID fix-input.ts gave>",
      "outcome": "fixed",
      "issue": null,
      "reply": "<what you did, and why>"
    }
  ]
}
```

- **`replies` has one entry for each finding marked "fix",** and one for each finding that needs attention Joe asked you to fix.
- **`outcome`** is one of the five in step 3.
- **`issue`** is the issue's number for `deferred`, and `null` for the rest.
- **`reply`** is posted on the finding's thread. Code starts it with a line that says the outcome, so don't repeat it. For `fixed`, say what changed, in a sentence or two, and name the test. For `deferred`, say why the fix fits the issue's work, and what you fixed now, if anything broke in normal use. For the rest, say why. For `needs_attention`, say what has to be decided. The next round's fixer reads this reply, so say enough that it won't undo what you did. Write in plain words, with one idea per sentence. Name the function or value you mean.

When you stopped early, it's:

```json
{ "status": "stopped", "reason": "<why you stopped>" }
```

Before you answer, write it to `scratch/fix-answer.json` with the Write tool, and check it:

```sh
npx tsx src/code-review/check-fix.ts $ARGUMENTS < scratch/fix-answer.json
```

It says what's wrong, such as a finding with no entry, or `deferred` with no open issue. Fix what it reports, and check again.
