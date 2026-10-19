# Road Trip Planner: Code Review

> **This design is in progress.** It changes as we learn how the review agent behaves. Each review we handle by hand adds to section 5, and what it teaches us goes into sections 3 and 4. Last updated 2026-10-18.

This document covers how a pull request's code is reviewed: the review that runs in CI on each PR, how its findings are handled, and the fix loop we plan to build on top of it. Unlike the other design docs, it's about how the app is built, not what it does.

The evidence behind it is in `research/code-review-evaluation.md`. That doc records how Opus at `high` was picked (section 8), and the first CI runs (section 10). This doc holds the decisions.

---

## 1. Status

| Part | Status |
|---|---|
| The review in CI | Running since 2026-10-16 (section 2) |
| Rules for which findings get fixed | Agreed 2026-10-16 and 2026-10-18. Applied by hand for now (section 3) |
| The fix loop | Not built. The rules for it are in section 4, and its open questions in section 4.5 |
| The CI reviewer can read the Claude token | Open item 21 |

---

## 2. The review in CI

**The "Code review" workflow runs the stock `/code-review` with Opus at `high`,** and posts its findings as inline comments on the PR. Opus at `high` found the key bugs in testing, and was wrong less often than Sonnet (research doc, section 8.5). The workflow is `.github/workflows/code-review.yml`.

- **It runs when a PR is opened or gets a new commit,** if the PR changes `src/` or `web/`. Drafts and PRs from forks aren't reviewed. A new commit cancels the review of the one before it.
- **It pins the Claude Code version,** 2.1.301, since the review's recipe changes between versions.
- **The reviewer starts from the PR description,** which holds the task and the "Done when" results. It doesn't read the PR's conversation comments, where the implementer's reasons are, since those would color its review (DEVELOPMENT.md section 7, and CLAUDE.md).
- **It reads the earlier inline comments first,** and doesn't post a finding twice. When a fix didn't cover a finding, it posts it again and says so.
- **It can read code and post comments, but not change anything.** Its tools are read-only, plus `gh`. The Claude token is kept out of the commands it runs. The job's GitHub token can't push or merge.
- **Each run saves its transcript** for 30 days, so we can check what the reviewer read.
- **The review doesn't block a merge.**

---

## 3. Handling findings

These rules apply now, when findings are handled by hand, and later to the fix loop. Each rule has an example from a real review, so the fixer can tell how it applies. "The fixer" here means whoever handles the findings: Claude Code by hand for now, and the fix loop later.

### 3.1 What gets fixed

**A finding is fixed when it causes wrong behavior, lost data, or a security hole.** That's "the bar." Everything else is below it: cleanups, missing tests, wording, and advice about code that isn't written yet.

**Tool descriptions, input schemas, what tools return, and error messages count as behavior.** The agent reads them and acts on them, so text that's wrong there leads to wrong actions. Examples from PR #44:

- The tool description said the error names the refused item, and the error didn't.
- The schema showed a maximum trip length of 9,007,199,254,740,991.
- After the user lowered their driving hours, the reply left out a day's warning whose text now gave the new limit. The coordinator kept the old text.

All three were fixed.

**A finding counts only if it can happen in normal use.** One that needs an unlikely input is below the bar. Example: on PR #44, a text item holding a line break, followed by another item's name, would make `read_trip_brief` show a fake item. Only the coordinator writes those items, so it's unlikely. It wasn't fixed.

**Missing tests and cleaner code are below the bar.** This is a learning project. The fixes are there to make the code do what it should, not to tidy it. The exception is the test that comes with a fix (section 3.4). Examples from PR #44, none of them fixed:

- `strictTool()` took no annotations, so the one read tool added them afterwards.
- A branch handled a missing check comparison, which a coordinator write never has, so the branch can never run.
- Constants were defined in two files.

**Text the agent reads that says something twice, but says nothing wrong, is below the bar.** Example: on PR #44, a reply line put "may be too early" in front of a result whose text already ends by saying so. It wasn't fixed.

**When a finding is about a project rule that a tool could check, add the check.** Then the next PR can't break the rule, and no review has to catch it. Example: on PR #44, a tool's input schema wasn't in a `*.schema.ts` file, as DEVELOPMENT.md section 4 asks. A lint rule will check that ([#72](https://github.com/nimbusscale/road-trip-agent/issues/72)).

### 3.2 Findings that come along

**A finding below the bar is fixed only when it's on lines the round already changes.** Once those lines are being changed, the fix costs almost nothing, and the next review will look at them anyway. A finding below the bar anywhere else waits. Each fix gives the next review new lines to find things in. That's how PR #39 went seven rounds (research doc, section 10).

Example: on PR #44, the schema's false maximum was in the same schema that the fix for unknown keys rewrote.

### 3.3 Findings below the bar

**The fixer reads each one, and takes no action on it.** It lists it for Joe in the PR comment, quoting the finding, with a short reason. Joe can still ask for it to be fixed.

### 3.4 A fix comes with a test

**A fix for a bug comes with a test that fails without the fix, and passes with it.** The test goes through the path where the bug was, not only the part the fix changed. This applies to the coding agent's own fixes too (DEVELOPMENT.md section 5). It doesn't have to be written before the fix, but it has to be checked against the code without the fix.

**This is written down because the usual practice wasn't followed.** Example: on PR #44, a misnamed input was dropped by the SDK on its way to the tool. The fix made the schema strict. Its tests checked the schema on its own, so they'd still pass if the SDK dropped the input again. The next review caught it, and a test that calls the real server was added.

### 3.5 Check a finding before fixing it

- **Confirm the finding against the code first.** Example: on PR #44, the dropped item was confirmed by calling the real server before it was fixed.
- **Don't apply a suggested fix as written.** Check that it solves the problem. Example: on PR #44, the review suggested `.min(1)` for the false maximum. That would have set the lower bound, but Zod adds the maximum to every integer, so it would have stayed.

### 3.6 Where replies go

**Replies go in one conversation comment on the PR, which quotes each finding.** It says what was fixed, and why the rest weren't. Never reply on a finding's inline thread. The next review reads inline threads so it doesn't repeat a finding, so it would read the reasons too (DEVELOPMENT.md section 7). When findings are handled by hand in chat, the comment is skipped, since Joe has already heard each one. In the fix loop it's required, since it's how the next round knows what was decided (section 4.2).

---

## 4. The fix loop

Not built yet. When a review has findings, another Claude Code run in CI reads them, fixes the ones above the bar (section 3), and pushes. The push starts the next review.

### 4.1 When it stops

The loop stops at whichever comes first:

- **A clean review:** one whose findings are all below the bar. The review never says "done" on its own. Its recipe aims for at least 5 findings, and every round of PR #39 found 5 or more. So "no findings left" can't be the signal to stop, and "nothing above the bar" is used instead.
- **Two fix rounds,** whatever the last review found.

Then the PR goes to Joe, with the findings below the bar listed in its comment.

### 4.2 Findings decided in an earlier round

**The fixer reads the earlier rounds' replies before it starts.** When a finding it already turned down comes back, it skips it, and says so in its reply. It acts on one only when the finding says something new, such as that the earlier fix didn't work.

**The reviewer never reads those replies,** so its review isn't colored by the fixer's reasons (section 2). So the reviewer posts a finding again whenever the lines it points to change and the problem is still there, as CLAUDE.md tells it to. That costs a finding each time, and it's accepted. The decision lives with the fixer, not in a code comment for the reviewer. Example: on PR #44, the finding that write replies leave out leg changes came back in round 3, after round 1 had left it for phase 22.

### 4.3 A check that the review ran

**A review that couldn't run must not look like a clean one.** On PR #39, two rounds looked like they passed. One failed to start, and the other had every command blocked. The workflow now fails the step when the run itself fails. A review whose commands are all blocked still passes.

### 4.4 The corpus

**Each review is also a test case** for judging the reviewer, and later the fixer. The round 1 corpus is six commit ranges from the phase 15 to 20 PRs (research doc, section 6). Reviews since then add to it: section 5 lists each one.

**PRs are merged with merge commits, never squashed or rebased,** and `main`'s history is never rewritten. Otherwise the commit ranges break.

### 4.5 Open questions

- How does a PR show that it's ready for Joe: a label, or a check result?
- How can the workflow tell that a review ran, when all its commands were blocked?
- Is a design doc that doesn't match the code above the bar? Agents build from the design docs, so a wrong one leads to wrong code later. The stock review rarely finds these (research doc, section 8.3).
- Does the fixer decide whether a finding is above the bar, or does a separate step decide it?
- Does the fixer read the decisions comment? It's doing the implementer's job, so the implementer's reasons may help it, unlike the reviewer.
- Are the cleanups saved up for a separate pass now and then, so they're fixed without feeding the next review?

---

## 5. What reviews have found

One row per review. "Above the bar" uses the rule in section 3.1, as it stood on 2026-10-18.

| PR | Round | Findings | Above the bar | What it taught us |
|---|---|---|---|---|
| #39 | 1 to 7 | 36 | About 10 | With no bar and no cap on rounds, almost every finding was fixed, and each fix gave the next review new lines. Sections 3.2 and 4.1 come from this (research doc, section 10) |
| #40 | 1 | 7 | Not judged | Fixes were stopped before any were pushed |
| #44 | 1 | 6 | 3 | Every finding was accurate. Section 3.5 comes from this round |
| #44 | 2 | 5 | 1 | Every finding was accurate again. Sections 3.1 (normal use, missing tests, adding a check) and 3.4 come from this round |
| #44 | 3 | 5 | 2 | Every finding was accurate. Three were about round 2's fixes. Sections 3.1 (text said twice) and 4.2 come from this round |
| #44 | 4 | 5 | 0 | The first review the bar counted as clean, so the loop would stop here (section 4.1). Every finding was accurate. A fix agent should fix none, skip 2 as decided in round 3 (section 4.2), and list 3 |

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

- **Fixed:** the MCP SDK was listed as a dev dependency, though the app needs it when it runs. A test now checks that every peer of a production dependency is listed as one (section 3.1, adding a check).
- **Moved to phase 22, above the bar:** a check result whose text changes, but is still there, should come back in the reply. Round 2's fix counted every day as touched when the usual start time changed, and no day check uses it, so the reply repeated a warning that hadn't changed. Its test checked for that repeat. The start time half was taken out, and phase 22 makes the general change.
- **Not fixed:** a branch that can never run, "may be too early" said twice, and the leg changes again.
- **The tests' fake data hid two problems.** Round 1's dropped input got past tests that used the same lenient schema as the tool. In this round, a reply's made-up check result text left out a sentence the real text has, so the test couldn't show it said "may be too early" twice.
- **This was the third round.** With the cap of two fix rounds (section 4.1), the loop would have stopped here, and the PR would have gone to Joe.
