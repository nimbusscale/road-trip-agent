# Road Trip Planner: Code Review

> **This design is in progress.** It changes as we learn how the review agent behaves. Each review we handle by hand adds to section 5, and what it teaches us goes into sections 3 and 4, and the review rubric. Last updated 2026-10-21.

This document covers how a pull request's code is reviewed: the review that runs in CI on each PR, how its findings are handled, and the fix loop we plan to build on top of it. Unlike the other design docs, it's about how the app is built, not what it does.

The evidence behind it is in `research/code-review-evaluation.md`. That doc records how Opus at `high` was picked (section 8), and the first CI runs (section 10). What others have published about review and fix loops is in `research/agent-review-fix-loop.md`. This doc holds the decisions.

---

## 1. Status

| Part | Status |
|---|---|
| The review in CI | Running since 2026-10-16. The stock `/code-review` ran until #75, and our own reviewer runs since (section 2) |
| Rules for which findings get fixed | Agreed 2026-10-16 and 2026-10-18. Rewritten as a rubric with labels 2026-10-19. Revised 2026-10-20 after four labeling runs, and then called done. It's tuned as it's used. Applied by hand for now (section 3) |
| Our own review prompt | Written 2026-10-20, as the `review-pr` skill (section 4.1). It replaced the stock one in CI in the PR that added it (#75), and is judged on new PRs (section 4.8) |
| The fix loop | Not built. Planned 2026-10-19 (section 4). The fixer is written as the `fix-pr` skill, and tested by hand in #76 (section 4.5). The fix job is #77 |
| The CI reviewer can read the Claude token | Open item 21 |

---

## 2. The review in CI

**The "Code review" workflow runs our own reviewer, the `review-pr` skill, with Opus,** and posts its findings as inline comments on the PR. Each is marked "fix", "note", or "check" (section 4.2). The skill is `.claude/skills/review-pr/SKILL.md`, and section 4.1 says what it does. It replaced the stock `/code-review`, which ran here from 2026-10-16 until #75. Opus at `high` found the key bugs in testing, and was wrong less often than Sonnet (research doc, section 8.5). The workflow is `.github/workflows/code-review.yml`.

- **It runs when a PR is opened or gets a new commit,** if the PR changes `src/` or `web/`. Drafts and PRs from forks aren't reviewed. A new commit cancels the review of the one before it.
- **It pins the Claude Code version,** 2.1.301, since Claude Code's behavior changes between versions.
- **The reviewer starts from the PR description,** which holds the task and the "Done when" results. It doesn't read the PR's conversation comments, where the implementer's reasons are, since those would color its review (DEVELOPMENT.md section 7, and CLAUDE.md).
- **It reads the earlier inline comments first,** and doesn't post a finding twice. When a fix didn't cover a finding, it posts it again and says so.
- **It can read code and run `node`, and the prompt tells it not to post.** Its tools are read-only, plus `node`, `npx tsx`, and the `gh` commands that read the PR and its issues. `gh api` and `node` could still post with the job's GitHub token, which can comment on, edit, or close the PR. That's accepted, since only this repo's own PRs are reviewed. Its commands run in Claude Code's sandbox, which lets them reach only GitHub (section 4.6). The Claude token is kept out of the commands it runs. The job's GitHub token can't push or merge.
- **The workflow posts the findings, not the reviewer.** The reviewer returns them as JSON, which `claude -p` checks against a schema. The next step posts each one on its line. When the line isn't in the diff, it goes on the file, and when the file isn't in the diff either, into one review body. The code for this is in `src/code-review/`.
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

**The fixer reads each one, and takes no action on it.** It lists it for Joe in the PR comment, quoting the finding, with a short reason. Joe can still ask for it to be fixed.

In the fix loop, the reviewer marks most of these as notes, and Joe reads them on the PR (section 4.2). The fixer doesn't list notes again. A finding marked "fix" that the fixer finds below the bar goes on the set-aside list (section 4.4).

### 3.4 A fix comes with a test

**A fix for a bug comes with a test that fails without the fix, and passes with it.** The test goes through the path where the bug was, not only the part the fix changed. This applies to the coding agent's own fixes too (DEVELOPMENT.md section 5). It doesn't have to be written before the fix, but it has to be checked against the code without the fix.

**This is written down because the usual practice wasn't followed.** Example: on PR #44, a misnamed input was dropped by the SDK on its way to the tool. The fix made the schema strict. Its tests checked the schema on its own, so they'd still pass if the SDK dropped the input again. The next review caught it, and a test that calls the real server was added.

### 3.5 Check a finding before fixing it

- **Confirm the finding against the code first.** Example: on PR #44, the dropped item was confirmed by calling the real server before it was fixed.
- **Don't apply a suggested fix as written.** Check that it solves the problem. Example: on PR #44, the review suggested `.min(1)` for the false maximum. That would have set the lower bound, but Zod adds the maximum to every integer, so it would have stayed.

### 3.6 Where replies go

**Replies go in one conversation comment on the PR, which quotes each finding.** It says what was fixed, and why the rest weren't. Never reply on a finding's inline thread. The next review reads inline threads so it doesn't repeat a finding, so it would read the reasons too (DEVELOPMENT.md section 7). When findings are handled by hand in chat, the comment is skipped, since Joe has already heard each one. In the fix loop it's required, since it's how the next round's fixer knows what was decided (section 4.5). The findings it sets aside also go on the list in the PR description (section 4.4).

### 3.7 When a tool could check the rule

**When a finding is about a project rule that a tool could check, add the check.** Then the next PR can't break the rule, and no review has to catch it. This says how to fix a finding, not whether it's above the bar. Example: on PR #44, a tool's input schema wasn't in a `*.schema.ts` file, as DEVELOPMENT.md section 4 asks. A lint rule will check that ([#72](https://github.com/nimbusscale/road-trip-agent/issues/72)).

---

## 4. The fix loop

Not built yet. Planned on 2026-10-19. The work to build it is #75, #76, and #77.

**Each push to a PR starts one round: a review, then a fix if the review found anything above the bar.** The fixer's push starts the next round. After three fix rounds, a fourth review runs, and the PR goes to Joe. Every agent in the loop starts fresh, and none runs longer than its own job.

### 4.1 Our own review prompt

**The reviewer is our own prompt, the `review-pr` skill, not the stock `/code-review`.** The stock prompt aims for at least 5 findings, and most of its angles look for cleanups, not bugs. Every review of PRs #39 and #44 found 5 or more, even when none was above the bar (research doc, section 4.1). Ours was built from the stock prompt at `high`, copied in `research/code-review-prompt-high.md`, so its results can be compared with the evaluation's runs (research doc, section 8).

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
- **Can run `node` and `npx tsx`, to test a claim that needs no outside access,** such as a timeout or a rounding case. Its commands can reach only GitHub (section 4.6), so `npx` can't download a package. A claim that only an outside service can settle gets V1 (review rubric). It doesn't run the tests, since the "Check and deploy" workflow already does.
- **Can't start subagents.** The workflow blocks the Agent tool, since the reviewer has no use for one.

It gets its own name, `review-pr`. A project skill named `code-review` would replace the stock one, and the stock one stays available to compare against. Joe can run ours locally with `/review-pr <number>`. It returns the findings, and posts nothing.

### 4.2 Findings to fix, and notes

**The reviewer marks each finding as one of three kinds:**

- **Fix:** it's above the bar. The finding gives its label from the review rubric, such as F2.
- **Note:** it's below the bar. The finding gives its label, such as NF2 or N1.
- **Check:** its label is V1. It says what to check and how. The fix loop leaves it alone, and Joe has it checked and relabeled.

All three kinds are posted as inline comments. Each starts with its kind and label, such as "Fix (F2)", and ends with the reviewer's reason for the label. Joe sees the notes there. The next review sees them too, so it doesn't post them again. A finding on a line outside the diff goes on its file, and one on a file outside the diff goes in a review body (section 2). The next review reads those too.

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
| The code | The PR's conversation comments: the fixer's replies and the implementer's decisions |
| The PR description: the task, the "Done when" results, and the set-aside list (section 4.4) | The comments on the PR's issue |
| The earlier inline comments. These are only the reviewer's own findings, since the fixer never replies on them (section 3.6) | |

What it never reads holds the reasons the code was written the way it was. Those would color its review (section 2).

**Each review reads the whole PR,** not only the commits since the last review. Example: on PR #44, round 2's one finding above the bar was in code that round 1 had read, and that round 1's fixes hadn't touched. A review of only the new commits would have missed it. This may change once we've seen some loops run.

### 4.4 Findings set aside

**The PR description gets a "Set aside" list.** The fixer adds a line for each finding marked "fix" that it doesn't fix. Each line names the finding in a few words, and where it went: below the bar, wrong, or an issue. It never gives a reason. Example:

> - Write replies leave out leg changes: #80
> - `strictTool()` takes no annotations: below the bar

**The reviewer doesn't report a finding that's on the list.** Without the list, the reviewer posts a finding again whenever the lines it points to change and the problem is still there. Example: on PR #44, the finding that write replies leave out leg changes came back in round 3, after round 1 had left it for phase 22. The loop is meant to run without Joe, so it can't keep raising what's already been decided.

**The list is about scope, so the reviewer may read it.** "Leg changes are handled in #80" says what the PR covers. It doesn't say why the code was written the way it was, which is what colors a review (research doc, section 3).

**The risk is that the fixer sets aside a real bug, and the reviewer never raises it again.** That's accepted for this project. Joe reads the list first when the PR comes to him. The number of set-aside findings per PR is also measured (section 4.8), so a fixer that sets aside too much shows up.

CLAUDE.md and DEVELOPMENT.md section 7 allow the list in the PR description, next to the task and the "Done when" results.

### 4.5 The fixer

- **It runs with Opus 5.5 at `high`,** the same as Joe's coding sessions.
- **It's the `fix-pr` skill,** in `.claude/skills/fix-pr/SKILL.md`. It takes the PR number.
- **It reads the bar, the PR description, the decisions comment, the findings marked "fix", and the earlier rounds' replies.** It reads the design docs the findings touch, and it can search the issues.
- **It reads the decisions comment, unlike the reviewer** (section 4.3). The fixer is doing the implementer's job, so the implementer's reasons help it. They keep it from undoing a decision, such as renaming a tool back. Decided 2026-10-21 in #76.
- **It follows section 3:** it checks each finding first, and a fix comes with a test.
- **When the right fix is bigger than the PR, it makes the smallest fix that works for now.** It writes the bigger change into an open issue's open questions, or opens a Triage issue, as CLAUDE.md says. Then it puts the finding on the set-aside list with that issue. Example: on PR #44 round 3, round 2's fix for the start time was taken out, and the general change to replies was left for phase 22.
- **It replies in one conversation comment, which quotes each finding** (section 3.6). It says what was fixed and in which commit, and what was set aside and why. The next round's fixer reads these replies.
- **It runs `npm run check` before it pushes.**
- **It makes one commit per round,** with the app's bot as the author (section 4.6). When it fixed nothing, it pushes nothing.
- **It doesn't need the project board.** It can read and open issues in this repo. The project's auto-add setting puts each new issue on the board, in Triage.

### 4.6 The workflow

**Each push to a PR starts one workflow run, with two jobs:**

1. **The review job** runs our reviewer, posts its findings, and outputs how many are marked "fix".
2. **The fix job** runs only when that number is above zero, and the branch has fewer than 3 commits by the fixer. The fixer pushes, and the push starts the next run.

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

| Run | Review job | Fix job |
|---|---|---|
| 1, when the PR is opened | Review 1 | Fix 1, pushes |
| 2 | Review 2 | Fix 2, pushes |
| 3 | Review 3 | Fix 3, pushes |
| 4 | Review 4 | Skipped, since the branch has 3 fixer commits |

**The loop goes on only because the fixer pushes.** No push means no new run. So it stops in one of three ways:

- The review marks nothing "fix", so the fix job is skipped.
- The fixer pushes nothing, since it set aside every finding.
- The branch already has 3 fixer commits, so the fix job is skipped.

Then the workflow adds a "ready for Joe" label to the PR.

**A push by Joe doesn't reset the count.** Only the fixer's commits count, so the cap holds however many times Joe pushes. When the loop stops at the cap, the last thing that ran is a review of the code Joe is about to read.

**The fixer pushes as a GitHub App, so it has its own identity.** A push made with the workflow's own token doesn't start another run, so that token can't be used.

- The app is installed on this repo only. It can write code, pull requests, and issues, but not workflow files.
- Each run makes a token from the app's ID and private key, with `actions/create-github-app-token`. The token lasts an hour, and works only on this repo.
- Its pushes and comments show as `<app-name>[bot]`, and its commits use the bot as the author. The cap counts those commits.

A personal token was the other choice. It would push as Joe, and a classic one would cover every repo he owns.

### 4.7 A check that the review ran

**A review that couldn't run must not look like a clean one.** On PR #39, two rounds looked like they passed. One failed to start, and the other had every command blocked. The workflow now fails the step when the run itself fails. A review whose commands are all blocked still passes.

### 4.8 Testing the reviewer

**Our reviewer is judged on new PRs, not on the old corpus.** It replaces the stock review in the PR that adds it (#75). The batch 4 commit ranges (research doc, section 6) and PR #44's four reviews were labeled to tune the review rubric. They aren't used to test the reviewer.

**Each finding's outcome is recorded,** from the first PR our reviewer reviews: fixed, below the bar after all, wrong, or moved to an issue. Each PR records its rounds, how many findings were set aside, and its cost. These records are the new corpus (section 4.9).

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
