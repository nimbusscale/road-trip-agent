# Road Trip Planner: Code Review

> **This design is in progress.** It changes as we learn how the review agent behaves. Each review we handle by hand adds to section 5, and what it teaches us goes into sections 3 and 4, and the review rubric. Last updated 2026-10-22.

This document covers how a pull request's code is reviewed: the review that runs in CI on each PR, how its findings are handled, and the fix loop we plan to build on top of it. Unlike the other design docs, it's about how the app is built, not what it does.

The evidence behind it is in `research/code-review/code-review-evaluation.md`. That doc records how Opus at `high` was picked (section 8), and the first CI runs (section 10). What others have published about review and fix loops is in `research/code-review/agent-review-fix-loop.md`. This doc holds the decisions.

---

## 1. Status

| Part | Status |
|---|---|
| The review in CI | Running since 2026-10-16. The stock `/code-review` ran until #75, and our own reviewer runs since (section 2) |
| Rules for which findings get fixed | Agreed 2026-10-16 and 2026-10-18. Rewritten as a rubric with labels 2026-10-19. Revised 2026-10-20 after four labeling runs, and then called done. It's tuned as it's used. Applied by hand for now (section 3) |
| Our own review prompt | Written 2026-10-20, as the `review-pr` skill (section 4.1). It replaced the stock one in CI in the PR that added it (#75), and is judged on new PRs (section 4.8) |
| The fix loop | Not built. Planned 2026-10-19 (section 4). The fixer is written as the `fix-pr` skill, with the code around it in `src/code-review/`, and tested by hand in #76 (section 4.5). The fix job is #77 |
| The CI reviewer can read the Claude token | Open item 21 |

---

## 2. The review in CI

**The "Code review" workflow runs our own reviewer, the `review-pr` skill, with Opus,** and posts its findings as inline comments on the PR. Each is marked "fix", "note", or "check" (section 4.2). The skill is `.claude/skills/review-pr/SKILL.md`, and section 4.1 says what it does. It replaced the stock `/code-review`, which ran here from 2026-10-16 until #75. Opus at `high` found the key bugs in testing, and was wrong less often than Sonnet (research doc, section 8.5). The workflow is `.github/workflows/code-review.yml`.

- **It runs when a PR is opened or gets a new commit,** if the PR changes `src/` or `web/`. Drafts and PRs from forks aren't reviewed. A new commit cancels the review of the one before it.
- **It pins the Claude Code version,** 2.1.301, since Claude Code's behavior changes between versions.
- **The reviewer starts from the PR description,** which holds the task and the "Done when" results. It doesn't read the PR's conversation comments, where the implementer's reasons are, since those would color its review (DEVELOPMENT.md section 7, and CLAUDE.md).
- **It reads a list of its earlier findings first,** and doesn't post a finding twice. Code builds the list from the PR's threads, without the replies (section 4.3). When a fix didn't cover a finding, it posts it again and says so.
- **It can read code and run `node`, and it can't post.** Its tools are read-only, plus `node`, `npx tsx`, and the `gh` commands that read the PR and its issues. It doesn't get `gh api`, since the list of earlier findings replaces its only use (#93). The job's GitHub token can only read the PR, so nothing the reviewer runs can comment on, edit, or close it. `node` could still read the PR's threads with that token. The prompt forbids it, and the saved transcript shows it. Its commands run in Claude Code's sandbox, which lets them reach only GitHub (section 4.6). The Claude token is kept out of the commands it runs.
- **The workflow posts the findings, not the reviewer.** The reviewer returns them as JSON, which `claude -p` checks against a schema. The next step posts each one on its line, as the reviewer's app (section 4.6). When the line isn't in the diff, it goes on the file, and when the file isn't in the diff either, into one review body. The code for this is in `src/code-review/`.
- **A review that couldn't run fails its step,** so it doesn't look like a clean one (section 4.7).
- **Each run saves its transcript, the reviewer's answer, and `not-posted.md`** for 30 days, so we can check what the reviewer read, and the D labels (section 4.2).
- **The review doesn't block a merge.**

---

## 3. Handling findings

These rules apply now, when findings are handled by hand, and later to the fix loop. Section 3.1 points to the rubric, which gives no real cases. The other sections each have an example from a real review, so the fixer can tell how they apply. "The fixer" here means whoever handles the findings: Claude Code by hand for now, and the fix loop later. The reviewer applies the rubric when it marks each finding (section 4.2), and the fixer applies the rest.

### 3.1 What gets fixed

**The rubric is its own doc, [the review rubric](review-rubric.md).** Each finding gets one label from it. A finding is fixed when its label is F1 to F7. That's "the bar." It's kept apart from this doc so the reviewer can read it without the real cases in the rest of this doc (section 4.1).

### 3.2 Notes aren't fixed

**A finding below the bar isn't fixed, even when it's on lines the round already changes.** Each fix gives the next review new lines to find things in. That's how PR #39 went seven rounds (research doc, section 10). "Lines the round already changes" is also too loose a rule for an agent to apply the same way twice. The notes stay on the PR, and Joe decides on them when the PR comes to him. Decided 2026-10-21 in #76.

Example: on PR #44 round 1, the schema's false maximum, an N3, was fixed by hand, since it was in the same schema that the fix for unknown keys rewrote. Under this rule, it would have stayed a note.

### 3.3 Findings below the bar

**The fixer reads each one, and takes no action on it.** By hand, it replies on the finding's thread with the marker, from Joe's account (section 3.6). Joe can still ask for it to be fixed.

In the fix loop, the reviewer marks most of these as notes, and Joe reads them on the PR (section 4.2). The fixer never sees the notes. A finding marked "fix" that the fixer finds below the bar gets the reply "Not fixed" on its thread (section 3.6), and code resolves the thread (section 4.4). In the loop, Joe can ask for a fix only on a finding that needs attention (section 4.5). For one that wasn't fixed, he fixes it himself, or asks for it in chat.

### 3.4 A fix comes with a test

**A fix for a bug comes with a test that fails without the fix, and passes with it.** The test goes through the path where the bug was, not only the part the fix changed. This applies to the coding agent's own fixes too (DEVELOPMENT.md section 5). It doesn't have to be written before the fix, but it has to be checked against the code without the fix.

**This is written down because the usual practice wasn't followed.** Example: on PR #44, a misnamed input was dropped by the SDK on its way to the tool. The fix made the schema strict. Its tests checked the schema on its own, so they'd still pass if the SDK dropped the input again. The next review caught it, and a test that calls the real server was added.

### 3.5 Check a finding before fixing it

- **Confirm the finding against the code first.** Example: on PR #44, the dropped item was confirmed by calling the real server before it was fixed.
- **Don't apply a suggested fix as written.** Check that it solves the problem. Example: on PR #44, the review suggested `.min(1)` for the false maximum. That would have set the lower bound, but Zod adds the maximum to every integer, so it would have stayed.
- **Don't fill in an outside fact from memory.** An outside fact is one the repo doesn't show, such as how an API answers or what one of its fields means. When the fix can be made correct without it, it's made that way, and the reply says what was left out. When it can't, the finding needs attention, and the reply says what to check and how, as a V1 finding does. Joe has it checked, and the result is saved in the repo, such as a real response under `saved-responses/`, so the next round fixes from real data. Example: on #90 round 2's replay, the fixer took what Open-Meteo's `precipitation_sum` counts from memory, and its reply said "Open-Meteo documents" it. Decided 2026-10-22 in #76.

### 3.6 Where replies go

**Each finding the fixer handles gets a reply on its own thread.** Code posts it from the fixer's answer (section 4.5). The reply's first line is a marker that says what was done with the finding:

- `**Fixed** in <commit>.`
- `**Deferred:** #<issue>.` The fix belongs in later work that's already planned, in that issue (section 3.8).
- `**Not fixed:** below the bar.` or `**Not fixed:** wrong.`
- `**Needs attention.**` Joe has to decide. This is for a fix that would undo a decision in the decisions comment, or change a config file. It's also for a fix too big for the PR, when no open issue plans it, and for a security hole the fixer can't fix in the PR, since that can't go in a public issue. It's also for a fix that rests on an outside fact the repo doesn't show (section 3.5).

The fixer's reason follows on the next lines. A finding in a review body has no thread, so its reply is a conversation comment of its own. It starts with the marker, and quotes the finding with a link to it. It also shows the finding's ID, such as `review-5615011373-1`, since Joe replies to it in a comment that names the ID.

**The reviewer never reads the replies.** Code reads the threads, and gives the reviewer only what each marker means for the review (section 4.3). `src/code-review/review-input.ts` builds that list. Code also reads the markers to resolve threads and keep the summary (section 4.4).

**A finding handled by hand gets a reply too, from Joe's account.** It starts with the marker, and a line on why is enough. Joe posts it in the UI, or Claude Code posts it with Joe's `gh` login. Without it, the next review sees no reply, and posts the finding again when its lines change. Decided 2026-10-22 in chat, for #93. It replaced the rule that a finding handled in chat gets no reply.

**Code reads a marker only from the fixer's app or Joe's account, `nimbusscale`.** The repo is public, so anyone with a GitHub account could reply on a thread. A marker from anyone else is ignored, so a stranger can't make the reviewer drop a finding. The reviewer still gets only what the marker means, so a marker from Joe shows it nothing more than one from the fixer. Decided 2026-10-22 in chat, for #93.

### 3.7 When a tool could check the rule

**When a finding is about a project rule that a tool could check, add the check.** Then the next PR can't break the rule, and no review has to catch it. This says how to fix a finding, not whether it's above the bar. Example: on PR #44, a tool's input schema wasn't in a `*.schema.ts` file, as DEVELOPMENT.md section 4 asks. A lint rule will check that ([#72](https://github.com/nimbusscale/road-trip-agent/issues/72)).

### 3.8 Deferring a finding

**A finding is deferred when its fix belongs in later work that's already planned.**

**The label is settled first.** When the code does what a design doc asks, the finding is wrong, even when an open issue plans to change that design later. When the label rests on harm in normal use, as F2, F3, F4, and F6 for a design choice do, the finding can't wait. The part that goes wrong is fixed now, and only the rest is deferred. When nothing goes wrong in normal use after all, the label doesn't hold, so the finding is below the bar or wrong. The findings that can wait are ones like these: a part of the task that waits on a caller a later issue adds (F1), a design doc gap that a planned rewrite covers (F6), or a fix to tests or checks that planned work replaces (F5, F7). Decided 2026-10-22 in #76, after #44 round 2's replay deferred an F6 that the design accepts.

A deferred finding meets all three of these:

- **The finding holds up, and is above the bar.**
- **An open issue already plans work on the same code, and the fix fits that work better.** It isn't the PR's own issue. For example, the issue will rewrite the code the finding is in, or adds the caller or the feature the fix depends on, or plans a general change that covers the finding.
- **Nothing breaks in normal use while it waits.** When something does, the part that breaks is fixed now, and only the rest is deferred.

**The work is added to that issue's open questions,** so it isn't lost. The fixer never opens an issue to defer a finding to. When no open issue fits, the finding is fixed in the PR. When the fix is too big for the PR, the finding needs attention, and Joe decides whether it gets an issue (section 3.6).

Example of a finding that isn't deferred: on #44 round 2, a check result whose text changed was left out of the reply to a brief change. Technical spec section 8 accepts that for the MVP, so the finding is wrong, even though #55 plans a general change to replies.

"Deferred" is the fix loop's word. The "set aside" in CLAUDE.md is wider: work Joe and Claude Code put off in chat, which may get a new issue. Decided 2026-10-21 in #76.

---

## 4. The fix loop

Not built yet. Planned on 2026-10-19. The work to build it is #75, #76, and #77.

**Each push to a PR starts one round: a review, then a fix if the review found anything above the bar.** The fixer's push starts the next round. After three fix rounds, a fourth review runs, and the PR goes to Joe. Every agent in the loop starts fresh, and none runs longer than its own job.

### 4.1 Our own review prompt

**The reviewer is our own prompt, the `review-pr` skill, not the stock `/code-review`.** The stock prompt aims for at least 5 findings, and most of its angles look for cleanups, not bugs. Every review of PRs #39 and #44 found 5 or more, even when none was above the bar (research doc, section 4.1). Ours was built from the stock prompt at `high`, copied in `research/code-review/code-review-prompt-high.md`, so its results can be compared with the evaluation's runs (research doc, section 8).

The prompt:

- **Reads the review rubric first,** since it labels each finding with it. The rubric is its own doc, so the reviewer doesn't also read the real cases in this doc, such as the past reviews in section 5. The rubric leaves real cases out on purpose.
- **Reads the design docs that cover the changed files, as a step of its own.** Without that step, the model may not open them. In the evaluation, Opus at `medium` opened no design doc in any of its 4 runs.
- **Looks from four angles:** a line-by-line read of each changed function, what removed code used to do, callers and callees, and the task, the docs, and the tests. The first three read code. The fourth is what looks for F1, F3, F6, and F7, such as a design doc that doesn't match the code, or a test that would pass with the bug. The stock review rarely found a design doc that didn't match the code (research doc, section 8.3).
- **Doesn't look for cleanups, reuse, speed, or style.** Those are notes at best.
- **Checks each finding against the code, then labels it** with the rubric. A finding whose claim is false is still returned, labeled D1, so Joe can check it.
- **Gives each finding a file, a line, what goes wrong, and a case where it goes wrong.** A finding that can only say the code is harder to maintain isn't a bug.
- **Has no cap on the number of findings.** A finding cut by a cap isn't posted or listed anywhere, so we'd never know it existed. Decided 2026-10-21 in #83. Look at it again after a few PRs.
- **Writes its findings as JSON,** so the workflow can read them. `claude -p` checks the answer against a schema, and the workflow posts it (section 2). The reviewer gives only the label. The code works out the kind from it, such as "fix" for F2.
- **Runs with Opus** at the model's default effort, as the stock review did (section 2).
- **Can run `node`, to test a claim that needs no outside access,** such as a timeout or a rounding case. Its commands can reach only GitHub (section 4.6), so `npx` can't download a package. A claim that only an outside service can settle gets V1 (review rubric). It runs the repo's TypeScript with `node --import tsx`. `npx tsx` fails in the sandbox, since it opens a socket the sandbox refuses (#93). It doesn't run the tests, since the "Check and deploy" workflow already does.
- **Can't start subagents.** The workflow blocks the Agent tool, since the reviewer has no use for one.

It gets its own name, `review-pr`. A project skill named `code-review` would replace the stock one, and the stock one stays available to compare against. Joe can run ours locally with `/review-pr <number>`. It returns the findings, and posts nothing.

### 4.2 Findings to fix, and notes

**The reviewer marks each finding as one of three kinds:**

- **Fix:** it's above the bar. The finding gives its label from the review rubric, such as F2.
- **Note:** it's below the bar. The finding gives its label, such as NF2 or N1.
- **Check:** its label is V1. It says what to check and how. The fix loop leaves it alone, and Joe has it checked and relabeled.

All three kinds are posted as inline comments. Each starts with its kind, its label, and the label's rule from the review rubric's table, such as "Fix (F2 - The app does the wrong thing, crashes, or hangs, in normal use)", so Joe doesn't have to look the label up. It ends with the reviewer's reason for the label. Joe sees the notes there. The next review sees them too, so it doesn't post them again. A finding on a line outside the diff goes on its file, and one on a file outside the diff goes in a review body (section 2). The next review reads those too.

**A finding labeled D1, D2, or D3 isn't posted.** The reviewer ends its run with a list of them instead: where each one is, its D label, and a sentence on why, such as which issue a D3 hands the work to. The workflow adds the list to the job summary, and saves it as `not-posted.md` in the run's artifact, so Joe can check the D labels. Under each one, the list quotes the finding, so Joe can tell what was dropped. Example:

> - `src/tools/trip-brief-tools.ts:157`, D3: phase 22 takes out `touchedBy()`.
>   - The finding: `touchedBy()` counts every day as touched when the usual start time changes.

**The next review doesn't see the D labels, on purpose.** It reads only what's posted on the PR, so it labels a dropped finding again on its own, if it finds it again. A D label is a reason not to report something. That's the same kind of text the reviewer is kept from (section 4.3), and a reviewer that read it would likely agree without checking again. Joe is the only other one who sees a D label, so a later review that reaches its own label is the second check.

The cost is small:

- **D2 and D3 depend on facts that don't change between rounds:** what the design says, and which issue names the work. A later review will likely give the same label, and nothing is posted.
- **D1 depends on the reviewer's own check of the code.** That's where a second look helps most. If a later review finds the claim is true after all, the finding is posted.
- **A finding could flip between a D label and a fix from one round to the next.** Then the loop spends a fix round on it. The cap on rounds limits that (section 4.6), and each flip is a labeling disagreement worth counting (#86).

**The fixer gets only the findings marked "fix".** It still checks each one against the code first (section 3.5), and it can find that one is below the bar after all. It never fixes a note, even on lines it's already changing (section 3.2). The notes stay on the PR for Joe.

**The reviewer marks them, so a fix agent doesn't start just to turn findings down.** Example: PR #44 round 4 had 5 findings, and none was above the bar. If the fixer judged the bar, a fix agent would have read all 5, replied to each, and pushed nothing. With the reviewer marking them, the loop stops after the review.

### 4.3 What the reviewer reads

| It reads | It never reads |
|---|---|
| The code | The fixer's replies (section 3.6) |
| The PR description: the task and the "Done when" results | The PR's conversation comments: the decisions comment, and the summary (section 4.4) |
| Its own earlier findings, each with what its reply's marker means for the review. Code builds this list (#93) | The comments on the PR's issue |

What it never reads holds the reasons the code was written the way it was. Those would color its review (section 2).

**The reviewer gets the list by running a script, `node --import tsx src/code-review/review-input.ts <number>`,** as the fixer gets its input from `fix-input.ts` (section 4.5). The script reads the threads in its own process, and prints only the list, so the transcript never shows a reply. Since it's a command in the skill, `/review-pr <number>` still works on Joe's machine. Each finding on the list gives its text, its place, the commit it was posted on, and what the last marker means for the review:

- **Fixed:** check whether the fix worked, and post it again if it didn't.
- **Deferred:** don't post it again. The list gives the issue, since that's scope (section 4.4).
- **Not fixed, or needs attention:** don't post it again. The list doesn't say which, or why.
- **No reply,** such as a note: don't post it again, unless its lines changed and the problem is still there.

Decided 2026-10-22 in chat, for #93.

**Each review reads the whole PR,** not only the commits since the last review. Example: on PR #44, round 2's one finding above the bar was in code that round 1 had read, and that round 1's fixes hadn't touched. A review of only the new commits would have missed it. This may change once we've seen some loops run.

### 4.4 Deferred findings, and the summary

**A finding is deferred only under the rules in section 3.8.** A finding the fixer won't fix at all is "not fixed", not deferred (section 3.6).

**The reviewer doesn't post a finding again once it's deferred, not fixed, or needs attention.** Code gives it that, without the reasons (section 4.3). For a finding deferred, it also gives the issue, since that's about scope: "leg changes are handled in #80" says what the PR covers, not why the code was written the way it was. Without this, the reviewer posts a finding again whenever the lines it points to change and the problem is still there. Example: on PR #44, the finding that write replies leave out leg changes came back in round 3, after round 1 had left it for phase 22. The loop is meant to run without Joe, so it can't keep raising what's already been decided.

**A summary comment lists what Joe has to look at:** the findings deferred, and the ones that need attention. Fixed and not-fixed findings stay only in their threads. Code keeps the summary, as one conversation comment on the PR, and updates it after each fix round. Each line names the finding in a few words, and links the finding and the fixer's reply. A line for a finding deferred also gives the issue. Example:

> - Write replies leave out leg changes: [finding](…), [reply](…), #80

**An item leaves the summary when its thread is resolved.** After each fix round, code resolves the threads whose reply is "Fixed" or "Not fixed". Threads deferred or needing attention stay open until Joe resolves them. Code never resolves a note's or a check's thread. A finding in a review body has no thread, so its line in the summary has a checkbox, which Joe ticks. Code keeps the ticks when it updates the summary. A ticked line stays, ticked, since the tick is the only record that Joe handled it.

**The risk is that the fixer drops a real bug, and the reviewer never raises it again.** That's accepted for this project. Joe can reopen a resolved thread. The number of findings per PR that weren't fixed is also measured (section 4.8), so a fixer that drops too much shows up.

Decided 2026-10-21 in #76. It replaced a "Set aside" list in the PR description.

### 4.5 The fixer

- **It runs with Opus 5.5 at `high`,** the same as Joe's coding sessions.
- **It's the `fix-pr` skill,** in `.claude/skills/fix-pr/SKILL.md`. It takes the PR number.
- **It reads the bar, the PR description, the decisions comment, the findings marked "fix", and the earlier rounds' replies.** Code prints them for it, with an ID for each finding. The decisions comment is the first conversation comment by the PR's author. It reads the design docs the findings touch, and it can search the issues.
- **It reads the decisions comment, unlike the reviewer** (section 4.3). The fixer is doing the implementer's job, so the implementer's reasons help it. They keep it from undoing a decision, such as renaming a tool back. Decided 2026-10-21 in #76.
- **It follows section 3:** it checks each finding first, and a fix comes with a test.
- **It defers a finding only under the rules in section 3.8.** It never opens an issue. When a fix is too big for the PR, and no open issue plans it, the finding needs attention.
- **It returns JSON, and code does the writes on the PR,** as with the reviewer (section 2). The fixer checks and fixes the findings, and commits. Then code pushes the commit, posts each reply with its marker (section 3.6), resolves the threads, and updates the summary (section 4.4). The fixer's only writes to GitHub are to issues' open questions, for findings it defers. Decided 2026-10-21 in #76.
- **Its answer is one flat object, with three keys that are always filled in,** so the model doesn't have to work out which keys go with which status. `status` is "done" or "stopped". `reason` is always a sentence: why it stopped, or a summary of the round, which the job prints. `replies` is always a list, and it's empty when the fixer stopped. Each reply gives the finding's ID, its outcome, `deferredTo`, and the reply's text. `deferredTo` is the issue a deferred finding goes to, and `null` for the other outcomes. The answer has no commit. Code reads the checked-out commit from git, and pushes it when it's a new commit on the PR's head. Decided 2026-10-22 in chat, for #77, since `--json-schema` refuses a schema that's a choice between two shapes.
- **Its answer is checked before anything is posted.** In CI, `claude -p --json-schema` refuses an answer that doesn't fit the schema, such as an outcome that isn't on the list. Then code checks what the schema can't: a "done" answer has at least one reply, and a "stopped" one has none. It also checks that the answer fits the round: each finding marked "fix" gets exactly one entry, no ID is made up, "fixed" comes with a new commit, and "deferred" comes with an open issue. When anything fails, nothing is posted. A run by hand has no `--json-schema`, so the fixer runs the same check on its own answer before it returns it. Code can't catch an answer that fits but is wrong, such as "fixed" for a change that doesn't fix the finding. The next review catches that, when it checks whether the fix worked.
- **It can't change a config file, or turn off a check in code.** DEVELOPMENT.md section 6 lists the config files. The job turns the ask rules for them in `.claude/settings.json` into deny rules for the fixer (section 4.6). The sandbox then makes those files read-only for the fixer's commands, so `sed` can't change them either. A comment that turns off a lint rule or a type error, such as `eslint-disable` or `@ts-expect-error`, goes in an ordinary code file, so no file rule can block it. ESLint bans every such comment instead, so `npm run check` fails on one. A fix that needs either gets "needs attention" (section 3.6). Decided 2026-10-22 in chat, for #77.
- **Code reads the PR's threads by who posted them.** A finding is a comment by the reviewer's app in the format its posting step writes. A reply is the fixer's when its app posted it and it starts with a marker. A reply is Joe's only when Joe's account, `nimbusscale`, posted it. Code ignores a reply from anyone else, so the fixer never reads it, and it can't ask for a fix (section 3.6). A finding in a review body has no thread, so the fixer's reply to it is tagged with the finding's ID, on a hidden line, and Joe's reply is a conversation comment that names the ID. The scripts are `fix-input.ts`, which prints the fixer's input, `check-fix.ts`, which checks its answer, and `post-fix.ts`, which does the writes as the fixer's app. Checked by hand on a replay draft of #90, #96, on 2026-10-22.
- **When it stops early, its answer says so, with the reason.** It stops when the checked-out commit isn't the PR's head, when there's no finding marked "fix", or when `npm run check` already failed on the code the review saw. The job reads that from the answer too.
- **It reads Joe's replies too.** When Joe replies on a thread that needs attention, and says to fix it, the next fixer fixes it. That holds for a finding from the review of the PR's head too, when the fixer pushed nothing after it and runs again.
- **It runs `npm run check` before it commits.**
- **It makes one commit per round,** with the app's bot as the author (section 4.6). Code pushes it. When it fixed nothing, nothing is pushed.
- **It doesn't need the project board.** It reads issues, and edits one only to add a deferred finding's work to its open questions (section 3.8).

### 4.6 The workflow

**Each push to a PR starts one workflow run, with two jobs:**

1. **The review job** runs our reviewer, and posts its findings. It outputs how many are marked "fix", and how many findings that need attention have a reply from Joe after the fixer's (section 4.5).
2. **The fix job** runs when either number is above zero, and the branch has fewer than 3 commits by the fixer. The fixer pushes, and the push starts the next run.

**Joe starts a run by hand after he replies "fix it"** on a finding that needs attention. A reply isn't a push, so nothing else starts one. He re-runs the PR's latest "Code review" run, from the Actions tab or with `gh run rerun <run-id>`, and Claude Code can do it for him. The run reviews the PR again first. To leave such a finding alone, Joe resolves its thread instead of replying, so it doesn't start the fixer. Decided 2026-10-22 in chat, for #77. A trigger on the reply itself was turned down as more to build.

**Neither the reviewer nor the fixer gets WebFetch or WebSearch.** They work from the repo. A finding whose label hangs on an outside fact gets V1, not a guess from the web.

**Each agent's commands run in Claude Code's sandbox, which lets them reach only GitHub.** Taking the web tools away doesn't stop a program, such as `node` or `git`, from reaching the web, so the limit is on the network. The job passes the sandbox settings with `--settings`, since Claude Code ignores `.claude/settings.json` in CI:

```json
{"sandbox": {"enabled": true, "failIfUnavailable": true, "allowUnsandboxedCommands": false,
  "network": {"allowedDomains": ["github.com", "api.github.com"], "strictAllowlist": true}}}
```

- `git` and `gh` reach GitHub through the sandbox's proxy. Any other site is refused, and so is a command that tries to go around the proxy.
- The token scrub alone doesn't limit the network. It only keeps secrets out of the commands' environment.
- `npm run check` needs no network, since the job installs the packages before the agent starts.
- Claude Code's own calls to the model aren't sandboxed, so the limit doesn't touch them.
- `allowUnsandboxedCommands: false` keeps the model from running a command outside the sandbox. That's from Claude Code's docs, and wasn't tested.

Checked in CI on 2026-10-20 (#82), with `gh api`. `gh pr view` and `gh issue view` worked too, in our reviewer's first run, on #83. If another `gh` command needs more GitHub domains, add them then.

**The fixer's settings also deny edits to the config files** (DEVELOPMENT.md section 6). Claude Code ignores `.claude/settings.json` in CI, so its ask rules for those files don't apply, and there's no one to ask anyway. Before the fixer starts, the job turns those ask rules into deny rules, and adds them to the `--settings` above. That keeps one list of the files. The sandbox mounts each denied file read-only for the fixer's commands, so `sed -i` and `echo >>` fail on it too, not only the Edit tool. Tested with Claude Code 2.1.308 on 2026-10-22. The test found two things the job has to do:

- **Drop each rule's leading `/`.** In `.claude/settings.json`, `/eslint.config.mjs` means the repo root. In an inline `--settings` string, it matches nothing, and even the Edit tool gets through.
- **Expand a wildcard in a file name into the exact files,** such as `tsconfig*.json` into `tsconfig.json` and the others. The sandbox skips a rule with a wildcard in a file name, so shell commands can still write to the file. A rule for a whole folder, such as `.claude/hooks/**`, works as it is.

**The sandbox makes empty files in the checkout while a command runs,** for paths it protects that don't exist yet, such as `.npmrc`, `yarn.lock`, and `.bashrc`. It can only make a file read-only once the file exists. In our repo, with Claude Code 2.1.308, there are 25, and they're gone when the run ends. `.gitignore` lists them, so the fixer's `git add -A` skips them, and they don't count as uncommitted changes. The list depends on what's in the repo, and maybe on the version, so #77 checks it in CI. One of them is `scripts`, so a `scripts/` folder would need another name. Found in #76's first replay, and decided 2026-10-22 in chat, for #77.

| Run | Review job | Fix job |
|---|---|---|
| 1, when the PR is opened | Review 1 | Fix 1, pushes |
| 2 | Review 2 | Fix 2, pushes |
| 3 | Review 3 | Fix 3, pushes |
| 4 | Review 4 | Skipped, since the branch has 3 fixer commits |

**The loop goes on only because the fixer pushes.** No push means no new run. So it stops in one of three ways:

- The review marks nothing "fix", so the fix job is skipped.
- The fixer pushes nothing, since it fixed none of the findings.
- The branch already has 3 fixer commits, so the fix job is skipped.

Then the workflow adds a "ready for Joe" label to the PR.

**A push by Joe doesn't reset the count.** Only the fixer's commits count, so the cap holds however many times Joe pushes. When the loop stops at the cap, the last thing that ran is a review of the code Joe is about to read.

**The fixer pushes as a GitHub App, so it has its own identity.** A push made with the workflow's own token doesn't start another run, so that token can't be used. The reviewer gets an app of its own too, so code can tell the reviewer's findings, the fixer's replies, and Joe's replies apart by who posted them (#92).

| App | Posts as | Can |
|---|---|---|
| `nimbusscale-review-pr` | `nimbusscale-review-pr[bot]` | Read code and issues, and write pull requests |
| `nimbusscale-fix-pr` | `nimbusscale-fix-pr[bot]` | Write code, pull requests, and issues |

- Each app is installed on this repo only. Neither can change workflow files.
- Each run makes a token from the app's ID and private key, with `actions/create-github-app-token`. The token lasts an hour, and works only on this repo. On Joe's machine, `src/code-review/app-token.ts` makes one the same way ([systems design](systems.md) section 8).
- The fixer's commits use its bot as the author. The cap counts those commits.
- The review job's posting step uses the reviewer's app token. The step that runs the reviewer keeps the job's own token, which can only read the PR, so the reviewer can't post (section 2).

Checked 2026-10-22 on a throwaway draft PR, #94. A comment posted with each app's token showed under that app. A commit pushed with the fixer's token showed its bot as the author and the pusher, and its push started a workflow run.

A personal token was the other choice. It would push as Joe, and a classic one would cover every repo he owns.

### 4.7 A check that the review ran

**A review that couldn't run must not look like a clean one.** On PR #39, two rounds looked like they passed. One failed to start, and the other had every command blocked. In the loop, a review with nothing marked "fix" ends the loop, and the PR gets the "ready for Joe" label, so a blocked review would hand Joe a PR nobody read. The review step fails in three cases:

- **The run itself fails,** such as with a bad token or a usage limit.
- **The reviewer says it stopped.** Its answer takes the fixer's shape: `status`, "done" or "stopped", `reason`, always a sentence, and `findings`, empty when it stopped. The skill tells it to stop when it can't do a step it needs, such as reading the description, the list of earlier findings, or the diff. The step shows the reason in the job summary.
- **The reviewer says "done" with no findings, but a command was refused.** `claude -p` lists each refused command in `permission_denials`. This is a backstop, for a reviewer that didn't notice it was stuck. Refused commands are common, such as a `for` loop that isn't on the allowed list. In the six reviews before 2026-10-22, three had one, but each of those also had findings, so none would have failed. A false alarm costs a re-run.

The first case is built. The other two were decided 2026-10-22 in chat, for #77.

### 4.8 Testing the reviewer

**Our reviewer is judged on new PRs, not on the old corpus.** It replaces the stock review in the PR that adds it (#75). The batch 4 commit ranges (research doc, section 6) and PR #44's four reviews were labeled to tune the review rubric. They aren't used to test the reviewer.

**Each finding's outcome is recorded,** from the first PR our reviewer reviews: fixed, not fixed (below the bar after all, or wrong), deferred to an issue, or needs attention. Each PR records its rounds, how many findings weren't fixed, and its cost. These records are the new corpus (section 4.9).

### 4.9 The corpus

**Each review is also a test case** for judging the reviewer, and later the fixer. The corpus starts with the first PR our reviewer reviews, and each review after it adds to it. Section 5 lists each one. The reviews before that were used to tune the rubric, and aren't part of it.

**PRs are merged with merge commits, never squashed or rebased,** and `main`'s history is never rewritten. Otherwise the commit ranges break.

---

## 5. What reviews have found

One row per review. "Above the bar" uses the rubric's rule, as it stood on 2026-10-18.

| PR | Round | Findings | Above the bar | What it taught us |
|---|---|---|---|---|
| #39 | 1 to 7 | 36 | About 10 | With no bar and no cap on rounds, almost every finding was fixed, and each fix gave the next review new lines. Sections 3.2 and 4.6 come from this (research doc, section 10) |
| #40 | 1 | 7 | Not judged | Fixes were stopped before any were pushed |
| #44 | 1 | 6 | 3 | Every finding was accurate. Section 3.5 comes from this round |
| #44 | 2 | 5 | 1 | Every finding was accurate again. Sections 3.1 (normal use, missing tests), 3.4, and 3.7 come from this round |
| #44 | 3 | 5 | 2 | Every finding was accurate. Three were about round 2's fixes. Sections 3.1 (text said twice) and 4.4 come from this round |
| #44 | 4 | 5 | 0 | The first review the bar counted as clean. Every finding was accurate. With our own reviewer marking findings, none would be marked "fix", so no fix agent would run (section 4.2) |

**PR #44, round 1,** the trip MCP server (phase 13a):

- **Fixed, above the bar:** a misnamed input was dropped without a word, and the tool still said "Saved." The tool description promised errors that name the item, and the limit errors didn't. The schema showed a false maximum for trip length.
- **Not fixed:** advice about write replies that phase 22 will build, a missing test for wiring code that a hand check had run, and constants repeated in two files.
- **The implementer's tests shared its blind spot.** They parsed input with the same lenient schema as the tool, so they couldn't catch the dropped input. A reviewer without the implementer's reasoning did.
- **The reviewer can't see a hand check unless the description names what it ran.** The missing-test finding was about code the hand check had run.

**PR #44, round 2,** after the fixes for round 1:

- **Fixed, above the bar:** changing the comfortable driving hours or the usual start time left out the day warnings whose text changed. The code followed tool design 2.1, so the design was fixed too.
- **Fixed, as the test for a fix (section 3.4):** the test for round 1's dropped input didn't go through the server.
- **Done in its own PR:** a lint rule for schemas outside `*.schema.ts` files ([#72](https://github.com/nimbusscale/road-trip-agent/issues/72)).
- **Not fixed:** the line break that could show a fake item, which isn't normal use, and `strictTool()` taking no annotations, a cleanup.
- **Most of round 2 was about lines round 1 changed or added.** Three of its five findings were, as on PR #39.
- **Two findings were about code round 1 had already seen.** The reviewer finds different things on each run, so one review doesn't mean the rest of the code is fine.

**PR #44, round 3,** after the fixes for round 2:

- **Fixed:** the MCP SDK was listed as a dev dependency, though the app needs it when it runs. A test now checks that every peer of a production dependency is listed as one (section 3.7).
- **Moved to phase 22, above the bar:** a check result whose text changes, but is still there, should come back in the reply. Round 2's fix counted every day as touched when the usual start time changed, and no day check uses it, so the reply repeated a warning that hadn't changed. Its test checked for that repeat. The start time half was taken out, and phase 22 makes the general change.
- **Not fixed:** a branch that can never run, "may be too early" said twice, and the leg changes again.
- **The tests' fake data hid two problems.** Round 1's dropped input got past tests that used the same lenient schema as the tool. In this round, a reply's made-up check result text left out a sentence the real text has, so the test couldn't show it said "may be too early" twice.
- **This was the third round.** Under the cap agreed on 2026-10-18, two fix rounds, the loop would have stopped here. The cap is now three fix rounds (section 4.6).
