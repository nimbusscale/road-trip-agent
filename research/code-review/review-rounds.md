# Code review: what each review round found

This is the record of each review round handled by hand, from PR #39 to PR #109. It was section 5 of the [code review design](../../design/code-review.md) until 2026-10-22. The rules in that doc's sections 3 and 4 came from these rounds. It's kept here as the history behind them, and isn't added to anymore. Each finding's outcome is now in its thread's marker (code review design 4.8).

A section number below, such as "section 3.5", is a section of the code review design. "The research doc" is `code-review-evaluation.md`, in this folder.

One row per review. "Above the bar" uses the rubric's rule, as it stood on 2026-10-18.

| PR | Round | Findings | Above the bar | What it taught us |
|---|---|---|---|---|
| #39 | 1 to 7 | 36 | About 10 | With no bar and no cap on rounds, almost every finding was fixed, and each fix gave the next review new lines. Sections 3.2 and 4.6 come from this (research doc, section 10) |
| #40 | 1 | 7 | Not judged | Fixes were stopped before any were pushed |
| #44 | 1 | 6 | 3 | Every finding was accurate. Section 3.5 comes from this round |
| #44 | 2 | 5 | 1 | Every finding was accurate again. Sections 3.1 (normal use, missing tests), 3.4, and 3.7 come from this round |
| #44 | 3 | 5 | 2 | Every finding was accurate. Three were about round 2's fixes. Sections 3.1 (text said twice) and 4.4 come from this round |
| #44 | 4 | 5 | 0 | The first review the bar counted as clean. Every finding was accurate. With our own reviewer marking findings, none would be marked "fix", so no fix agent would run (section 4.2) |
| #109 | 1 | 1 | 1 | The first round of the fixer run by hand, as the fix loop will run it. The fixer couldn't fix its one finding, since `claude -p` can't edit files under `.claude/`. The reviewer runs TypeScript with `node --import tsx` since this round (section 4.1) |
| #109 | 2 | 2 | 1 | The first review whose threads had fixer replies. It didn't post round 1's fixed finding again |
| #109 | 3 | 2 | 1 | Found that a "Fixed" marker from Joe still asked the fixer for a fix. The fixer was asked to handle that finding again, saw why, and left it alone |
| #109 | 4 | 1 | 0 | Nothing marked "fix" after three fix rounds. One V1, which code can't settle: whether #87 got the results |
| #109 | 5 | 0 | 0 | After a commit that only recorded rounds 3 and 4. No findings |
| #109 | 6 | 1 | 1 | The first review to read `DEVELOPMENT.md` and `design/README.md` in full, after the skill's step 1 named them. Its F6 was deferred to #77 |

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

**PR #109, round 1,** the reviewer's list of earlier findings (#93), reviewed at 07d3309:

- **Marked "fix", F2:** `npx tsx` fails in the CI reviewer's sandbox, so the reviewer couldn't run `review-input.ts` to get its list. The tsx CLI opens a socket, and the sandbox refuses it. `node --import tsx` opens none, and works.
- **The fixer answered "needs attention".** The fix was in the `review-pr` skill, and a permission rule blocked the fixer's edit to it. Claude Code fixed it by hand in 419ffcd, and replied "Fixed" on the thread from Joe's account. Whether the fix job should be able to edit skill files is a question for #77.

**PR #109, round 2,** reviewed at 419ffcd:

- **The review didn't post round 1's finding again.** Its list gave the finding as fixed in 419ffcd, without the replies.
- **Marked "fix", F1:** this PR hadn't recorded its rounds here, as its task asks. The fixer added the rows and these notes.
- **Note, N6:** section 2 and the workflow still list `npx tsx` among the reviewer's tools, though it can't run in the sandbox.

**PR #109, round 3,** reviewed at 6952c84:

- **The review didn't post rounds 1 and 2's findings again.**
- **Marked "fix", F2:** a "Fixed" marker from Joe, after the fixer's "Needs attention", still made the finding count as asked for. So the fixer would start on a finding Joe had already handled. The reviewer showed it with a short `node` script, on round 1's own thread. The fixer fixed it in eec3b5c: only Joe's reply without a marker asks for a fix.
- **The fixer met the bug in its own input.** Its input asked it to handle round 1's finding again. It worked out that this was the bug it was fixing, and gave that finding no entry.
- **Note, N5:** `review-input.ts`'s header comment still gives the `npx tsx` command.

**PR #109, round 4,** reviewed at eec3b5c:

- **Nothing marked "fix",** so under the loop the PR would get the "ready for Joe" label.
- **Check, V1:** whether #87 had the results of which files each review read. Only the issue's comments show it, and the reviewer doesn't read those. Claude Code posted them after this review.
- **No review read a reply.** None of the replies' text is in the transcripts of reviews 2 to 4. Review 1 ran before any reply.
- **The four reviews cost $0.66 to $0.86 each, at API prices. The three fixer runs cost $0.60 to $0.78 each.** Round 1's fixer ran twice. The second run added an allow rule for `.claude/skills/**`, which didn't help, since `claude -p` refuses an edit under `.claude/` unless permissions are bypassed. Both answered "needs attention", and only the second answer was posted.

**PR #109, rounds 5 and 6,** after the cap, on commits Claude Code made by hand. No fixer ran:

- **Round 5,** at c489e0b, which only recorded rounds 3 and 4, found nothing.
- **Round 6,** at 92cbf09, ran after the skill's step 1 changed to name `DEVELOPMENT.md` and `design/README.md`, and to say a `grep` doesn't count. It read both in full with the Read tool, for the first time in six reviews (#87).
- **Marked "fix", F6, deferred to #77:** a "Fixed" marker tells every later review to check the fix again. If a later finding says the fix didn't work, and that finding gets "Not fixed: wrong", the list still tells the reviewer to check the first finding's fix. So it could post the same problem a third time. Joe left it unfixed, since it needs a disputed fix and then a "wrong" on the dispute.
- **Round 1 could have found it,** since the rule was in `review-input-text.ts` from the first commit. With round 3's F2, that's two misses in this PR in code round 1 read (#110).
