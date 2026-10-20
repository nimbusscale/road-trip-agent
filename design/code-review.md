# Road Trip Planner: Code Review

> **This design is in progress.** It changes as we learn how the review agent behaves. Each review we handle by hand adds to section 5, and what it teaches us goes into sections 3 and 4. Last updated 2026-10-20.

This document covers how a pull request's code is reviewed: the review that runs in CI on each PR, how its findings are handled, and the fix loop we plan to build on top of it. Unlike the other design docs, it's about how the app is built, not what it does.

The evidence behind it is in `research/code-review-evaluation.md`. That doc records how Opus at `high` was picked (section 8), and the first CI runs (section 10). What others have published about review and fix loops is in `research/agent-review-fix-loop.md`. This doc holds the decisions.

---

## 1. Status

| Part | Status |
|---|---|
| The review in CI | Running since 2026-10-16, with the stock `/code-review` (section 2) |
| Rules for which findings get fixed | Agreed 2026-10-16 and 2026-10-18. Rewritten as a rubric with labels 2026-10-19, and revised 2026-10-20 after the first labeling run. Applied by hand for now (section 3) |
| Our own review prompt | Not written. It replaces the stock one once it passes the test in section 4.8 |
| The fix loop | Not built. Planned 2026-10-19 (section 4). The work to build it is #75, #76, and #77 |
| The CI reviewer can read the Claude token | Open item 21 |

---

## 2. The review in CI

**The "Code review" workflow runs the stock `/code-review` with Opus at `high`,** and posts its findings as inline comments on the PR. Opus at `high` found the key bugs in testing, and was wrong less often than Sonnet (research doc, section 8.5). The workflow is `.github/workflows/code-review.yml`. The fix loop will replace the stock `/code-review` with a prompt of our own (section 4.1).

- **It runs when a PR is opened or gets a new commit,** if the PR changes `src/` or `web/`. Drafts and PRs from forks aren't reviewed. A new commit cancels the review of the one before it.
- **It pins the Claude Code version,** 2.1.301, since the review's recipe changes between versions.
- **The reviewer starts from the PR description,** which holds the task and the "Done when" results. It doesn't read the PR's conversation comments, where the implementer's reasons are, since those would color its review (DEVELOPMENT.md section 7, and CLAUDE.md).
- **It reads the earlier inline comments first,** and doesn't post a finding twice. When a fix didn't cover a finding, it posts it again and says so.
- **It can read code and post comments, but not change anything.** Its tools are read-only, plus `gh`. The Claude token is kept out of the commands it runs. The job's GitHub token can't push or merge.
- **Each run saves its transcript** for 30 days, so we can check what the reviewer read.
- **The review doesn't block a merge.**

---

## 3. Handling findings

These rules apply now, when findings are handled by hand, and later to the fix loop. Section 3.1 is the rubric, and gives no real cases, so findings can be labeled with it without pointing to them. The other sections each have an example from a real review, so the fixer can tell how they apply. "The fixer" here means whoever handles the findings: Claude Code by hand for now, and the fix loop later. In the fix loop, the reviewer applies section 3.1 when it marks each finding (section 4.2), and the fixer applies the rest.

### 3.1 What gets fixed

**This section is the rubric.** The reviewer uses it to label each finding (section 4.2), and the labelers use it to build the answer key for testing the reviewer (section 4.8). It describes kinds of findings, not real cases.

**Each finding gets one label: the first one in the table that fits.** A finding whose label hangs on a fact no one can check from the repo gets V1, and waits for that check. A finding whose claim is false, that only disagrees with the design, or whose work is handed to another issue gets a D label, and isn't posted. A D label fits only when it clearly fits, since no one sees the finding again. When you're unsure, treat it as not fitting, and keep going down the table. A finding is fixed when its label is F1 to F7. That's "the bar." A finding that would meet a fix rule, but doesn't meet its condition, gets the matching NF label, and is a note. Other findings below the bar get an N label, and are notes too.

| Label | Kind | Rule |
|---|---|---|
| V1 | Check | The label depends on a fact the reviewer can't check from the repo, and that fact decides whether it's a fix |
| D1 | Not posted | The claim about the code is false |
| D2 | Not posted | The code does what the design asks, and the finding would have it done another way |
| D3 | Not posted | The PR puts off work, and hands it to another issue that names the work |
| F1 | Fix | The PR doesn't do what its task says |
| F2 | Fix | The app does the wrong thing, crashes, or hangs, in normal use |
| F3 | Fix | Text a road trip agent reads says something false, in normal use |
| F4 | Fix | Data is lost or corrupted, in normal use |
| F5 | Fix | A security hole within the project's threat model |
| F6 | Fix | A design doc is wrong, so an agent building from it would build the wrong thing |
| F7 | Fix | A test is wrong |
| NF2 | Note | Like F2, but not in normal use |
| NF3 | Note | Like F3, but not in normal use |
| NF4 | Note | Like F4, but not in normal use |
| NF5 | Note | A security hole outside the threat model |
| N1 | Note | Cleaner code |
| N2 | Note | A missing test |
| N3 | Note | Text a road trip agent reads is unclear, or says something twice, or is an error message with the wrong reason for a failure |
| N4 | Note | Advice about code that isn't written yet |
| N5 | Note | A code comment is wrong |
| N6 | Note | A design doc is unclear, or doesn't match the code, in a way no builder would act on |

F1, F6, and F7 have no NF label. Normal use doesn't apply to them.

#### Check first

**V1: the label depends on a fact the reviewer can't check from the repo, and that fact decides whether the finding is a fix.** For example, how an outside service answers a request the code hasn't sent before. The finding says what to check and how, such as the call to make. It's posted, and the fix loop leaves it alone until Joe has it checked and relabeled (section 4.2). V1 applies only when all of these hold:

- The fact is outside the repo, and nothing in the repo shows it.
- Settling it takes a real call or run that the reviewer can't make. If running code locally would settle it, the reviewer runs it.
- The answer decides whether it's a fix. A finding that's a note either way gets its note label.

#### Not posted

- **D1: the claim about the code is false.** For example, the finding describes a failure that the code's own checks make impossible. The failure has to be impossible with the code as it stands. A claim that's true only for an unlikely input, such as a setting no one would choose, isn't false, and gets an NF label. Neither is one that only code not yet written would prevent.
- **D2: the code does what the design asks, and the finding would have it done another way.** The design was agreed when the doc was written, so the finding is about the design, not the PR. Two things rule D2 out:
  - **The design has to be settled on the point.** When another issue covers it, such as with an open question, D2 doesn't fit, and the finding gets the next label that fits.
  - **The design's choice has to work for the user.** Before labeling a finding D2, say what the user would see if the code ran as designed. If that's wrong behavior in normal use, the label is F6 instead.
  - **The design has to speak to the point itself.** A general rule, such as a coding rule for all outside data, doesn't settle the specific case the finding raises. When the design does speak to the point, D2 comes before the NF labels, even when the harm is outside normal use.
- **D3: the PR puts off work, and hands it to another issue that names the work.** A code comment where the work belongs names the issue, such as "#123". The issue is open, and isn't the PR's own issue. Its description names this work, not just work near it. Nothing that works now breaks without the work. The reviewer reads that issue to check. D3 applies whether or not the task asked for the work, since the issue tracks it either way.

  **When no issue tracks the work,** task work is F1, since the PR doesn't do what its task asks. A test the task's "Done when" asks for is task work. Other work, such as a cleanup, gets its usual label. A code comment that puts it off doesn't change that.

#### Normal use

**Normal use is a trip a real user could plan, or a failure the code is meant to handle.** An outside service that doesn't answer in time is a failure the code is meant to handle. So is a plausible mistake by a road trip agent: a slip models make in practice, such as a wrong input name or the same ID twice. Normal use doesn't cover an unlikely input, such as one the model has no reason to produce, a setting no one would choose, or timing so narrow that two things running at once have to line up in a particular order.

**Code that's written but not called yet is judged as if it were called** the way the design says it will be.

#### Fix rules

**F1: the PR doesn't do what its task says.** The task is the issue's "Do" and "Done when" items, which the PR description copies (DEVELOPMENT.md section 7). When a "Do" item points to a design section, what that section asks for is part of the task. Something the task asks for that's missing, or done another way, meets F1, even when nothing breaks yet. Work handed to another issue is D3 instead.

**F2: the app does the wrong thing, crashes, or hangs, in normal use.** "Wrong" means different from what the design docs and the task say. Where they say nothing, it means different from what a user would plainly expect.

**F3: text a road trip agent reads says something false, in normal use.** The road trip agents are the app's own agents, such as the coordinator and its workers, not the agents that build or review the code. The text is tool descriptions, input schemas, what tools return, and error messages. An agent acts on them, so false text leads to wrong actions. The test is whether an agent that believes the text would do the wrong thing. For example, a tool description promises something the tool doesn't do. False text is a specific claim an agent could act on as a real answer. That covers a wrong time, day, or place. An error message that gives the wrong reason for a failure is N3, not F3. For example, "access denied" when the input was the problem, or "a response the app doesn't understand" when the service timed out. The agent knows the call failed, so it judges what to do next, such as trying again or asking the user.

**F4: data is lost or corrupted, in normal use.** Data the app saves, such as a trip or a memory, is lost, changed when it shouldn't be, or saved in a form that can't be loaded again. Lost means the information is gone, such as deleted, overwritten, or dropped on save. Corrupted means what's saved is wrong, such as a link to a stop that no longer exists, so the app can't use it until the stored data is repaired. A load that fails on stored data that's fine is F2, not F4.

**F5: a security hole within the project's threat model.** CLAUDE.md sets it: scanning bots and worms, not a targeted attack. It also covers the real secrets, such as the Claude token and the Google keys.

**F6: a design doc is wrong, so an agent building from it would build the wrong thing.** The doc contradicts itself, doesn't match the code, or leaves a gap a builder would have to guess at. Agents build later work from the design docs, so a wrong doc leads to wrong code later. A design choice that causes wrong behavior in normal use meets F6 too. A doc problem that no builder would act on is N6.

**F7: a test is wrong.** It can't catch a break in the very thing it targets. For example, it checks only that a list isn't empty, so a list with the wrong items passes. Or it fails when the code is right, such as a test that reads the real clock and breaks on a set date. A test that checks the real thing but misses a case or a path is N2, a missing test. So is one that checks the result but leaves one piece of it out, such as a check that compares every field of a loaded object except its name. It still fails when any other field is wrong. A wrong test gives false confidence, which is worse than having no test.

#### Notes

**Notes are below the bar.** This is a learning project. The fixes are there to make the code do what it should, not to tidy it.

- **NF2 to NF4: like F2 to F4, but not in normal use.**
- **NF5: a security hole outside the threat model.** It's a note, so Joe sees it and decides (CLAUDE.md).
- **N1: cleaner code.** That covers duplication, structure, speed, and code that can never run.
- **N2: a missing test.** The exception is the test that comes with a fix (section 3.4). A test that exists but is wrong is F7.
- **N3: text a road trip agent reads is unclear, or says something twice, or is an error message with the wrong reason for a failure.**
- **N4: advice about code that isn't written yet.**
- **N5: a code comment is wrong.** The code is right next to it, so it misleads less than a wrong design doc does.
- **N6: a design doc is unclear, or doesn't match the code, in a way no builder would act on.** For example, another doc, or the task, already says how to build it.

### 3.2 Findings that come along

**A finding below the bar is fixed only when it's on lines the round already changes.** Once those lines are being changed, the fix costs almost nothing, and the next review will look at them anyway. A finding below the bar anywhere else waits. Each fix gives the next review new lines to find things in. That's how PR #39 went seven rounds (research doc, section 10).

Example: on PR #44, the schema's false maximum was in the same schema that the fix for unknown keys rewrote.

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

**The loop uses a review prompt of our own, not the stock `/code-review`.** The stock prompt is built to always find something. It aims for at least 5 findings, and only 3 of its 8 angles look for bugs. The other 5 look for reuse, simplification, efficiency, project rules, and fixes that treat a symptom instead of the cause. Every review of PRs #39 and #44 found 5 or more, including PR #44 round 4, where none was above the bar. The stock prompt has no file we could edit (research doc, section 4.1).

**Our prompt starts from the stock prompt, and trims it.** The stock prompt at `high`, as Claude Code 2.1.301 gave it, is copied in `research/code-review-prompt-high.md`. With Opus at `high`, it found the code bugs in PRs #30 and #32 in every run, and the one in PR #35 in one run of two (research doc, section 8). Starting from it keeps our results comparable with those runs.

Compared with the stock prompt, ours:

- **Reads the bar in section 3 before it reviews.**
- **Reads the design docs that cover the changed files, as a step of its own.** The stock prompt leaves that to the model. In round 1 of the evaluation, Opus at `medium` opened no design doc in any of its 4 runs. At `high`, it opened one or two in 10 of its 12 runs.
- **Keeps the stock prompt's 3 bug angles:** a line-by-line read of each changed function, what removed code used to do, and tracing callers and callees.
- **Gives each finding a file, a line, what goes wrong, and a case where it goes wrong.** A finding that can only say the code is harder to maintain isn't a bug.
- **Has no minimum.** A review with no findings is a normal result.
- **Writes its findings as JSON,** so the workflow can read them.
- **Runs with Opus at `high`,** as the stock review does (section 2).
- **Can run node, to test a claim that needs no outside access,** such as a timeout or a rounding case. Its commands can reach only GitHub (section 4.6). A claim that only an outside service can settle gets V1 (section 3.1).

It gets its own name. A project skill named `code-review` would replace the stock one, and the stock one stays available to compare against.

### 4.2 Findings to fix, and notes

**The reviewer marks each finding as one of three kinds:**

- **Fix:** it's above the bar. The finding gives its label from section 3.1, such as F2.
- **Note:** it's below the bar. The finding gives its label, such as NF2 or N1.
- **Check:** its label is V1. It says what to check and how. The fix loop leaves it alone, and Joe has it checked and relabeled.

All three kinds are posted as inline comments. Joe sees the notes there. The next review sees them too, so it doesn't post them again.

**A finding labeled D1, D2, or D3 isn't posted.** The reviewer ends its run with a list of them instead: where each one is, its D label, and a sentence on why, such as which issue a D3 hands the work to. The workflow adds the list to the job summary, and saves it as `not-posted.md` in the run's artifact, so Joe can check the D labels. Example:

> - `src/tools/trip-brief-tools.ts:157`, D3: phase 22 takes out `touchedBy()`.

**The fixer gets only the findings marked "fix".** It still checks each one against the code first (section 3.5), and it can find that one is below the bar after all. It can also fix a note on lines it's already changing (section 3.2).

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

The list changes the rule in CLAUDE.md and DEVELOPMENT.md section 7 that a PR description holds only the task and the "Done when" results. Those change when the loop is built.

### 4.5 The fixer

- **It runs with Opus 5.5 at `high`,** the same as Joe's coding sessions.
- **It reads the bar, the PR description, the findings marked "fix", and the earlier rounds' replies.** It reads the design docs the findings touch, and it can search the issues.
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

Checked in CI on 2026-10-20 (#82). Only `gh api` was tested. If another `gh` command needs more GitHub domains, add them then.

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

**Our reviewer is tested on the corpus before it replaces the stock one.** That's the six batch 4 commit ranges and their answer key (research doc, section 6), and the four reviews of PR #44, where each finding is marked above or below the bar (section 5). It runs with Opus at `high`, twice on each. Its results are compared with the stock review's Opus-at-`high` results in research doc section 8, so the stock review doesn't need to run again.

- **Does it still find the code bugs in the answer key?** Dropping the cleanup angles mustn't cost real bugs.
- **On PR #44, does it mark the findings above the bar as "fix", and the rest as notes?**
- **Does it find any of the doc and plan gaps?** The stock review found none of them. Batch 4's reviewer found them when it was given the phase's design sections.

**Once the loop runs, each finding's outcome is recorded:** fixed, below the bar after all, wrong, or moved to an issue. Each PR records its rounds, how many findings were set aside, and its cost.

### 4.9 The corpus

**Each review is also a test case** for judging the reviewer, and later the fixer. The round 1 corpus is six commit ranges from the phase 15 to 20 PRs (research doc, section 6). Reviews since then add to it: section 5 lists each one.

**PRs are merged with merge commits, never squashed or rebased,** and `main`'s history is never rewritten. Otherwise the commit ranges break.

---

## 5. What reviews have found

One row per review. "Above the bar" uses the rule in section 3.1, as it stood on 2026-10-18.

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
