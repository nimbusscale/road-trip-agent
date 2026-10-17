# Road Trip Planner: Code Review Evaluation

> **This is a research document, not a design document.** It records what we learned about having Claude review code, and how we test which model and effort to use. It does not change how the app is built.

During the overnight run in [batch 4](../plan/batch-4.md), a separate Opus agent reviewed each phase's PR before it was merged. It found real problems in every PR, though the same model wrote the code. That made automated review look worth adding to how this project works. Before building it into CI, we want to know which model and effort level give useful reviews.

Sections 2 to 5 record what we found out and decided on 2026-10-16. Section 6 is the set of past PRs we test against, and section 7 is how the first round runs. Results go in section 8 after the runs.

---

## 1. Status

**Last updated 2026-10-16.**

| Round | What it tests | Status |
|---|---|---|
| 1, stage 1 | Stock `/code-review` on PRs #30 and #32, with four model and level settings, two runs each | Done 2026-10-16. Results in section 8.1 |
| 1, stage 2 | The `medium` and `xhigh` levels, with Opus and Sonnet, on the same PRs (section 7.4) | Done 2026-10-16. Results in section 8.2 |
| 1, stage 3 | Opus at `high` and `xhigh` on PRs #31, #33, #34 and #35 (section 7.5) | Done 2026-10-16. Results in section 8.3 |
| 1, the choice | Opus at `high` (section 8.5) | Decided 2026-10-16 |
| CI | `/code-review high --comment` with Opus on each PR (section 9) | Built 2026-10-16, PR #39 |
| The first CI runs | Seven reviews of PR #39, fixed by hand each time, and one of PR #40 (section 10) | Done 2026-10-16 |
| 2 | Stock `/code-review` on older PRs that were never reviewed (#2 to #29) | Not planned yet. Depends on round 1 |

**Still open:**
- **The fix loop.** Section 9. When a CI review has findings, another run fixes them. Open item 14. Section 10 is what happened when it was done by hand, with no limits.
- **Our own review prompt.** Left for later. Round 1 tests only the stock `/code-review`.
- **Model effort on its own.** The `/code-review` level sets the review's model effort, and `--effort` doesn't change it (section 4.1). So the stock command can't run the high recipe at low model effort, or the reverse. Only our own review prompt could test that.

---

## 2. Why a second Opus found problems

Each phase in batch 4 had a worker and a reviewer, both Opus. The reviewer was given the phase, its design sections, and DEVELOPMENT.md. It was not given the worker's conversation. Every PR needed a second round, and the reviews found three real bugs:

- **PR #30, the business name.** Code dropped Google's name for any place with the type `premise`. The design says a card shows Google's name whenever Google has one, and Google tags named buildings, such as hotels, `premise`. The worker had added `premise` without any lookup showing it was needed.
- **PR #32, the schedule order.** A day's schedule could list a 12:00 lunch after a drive that ended at 7:00 p.m. The code's own comment said it kept the entries in time order.
- **PR #35, the driving count.** The driving warning and the schedule worked out a day's driving in two different ways. With a 4-hour limit, the warning counted 240 minutes for a day and stayed quiet, while the schedule showed 242. The worker had seen the gap and written "the warning says 'about,' so I accepted that."

The model and effort were the same for worker and reviewer. What was different was the context. The reviewer couldn't see the worker's reasons for its shortcuts. In two of the three bugs, #30 and #35, the worker had chosen the code on purpose and had a reason for it. A reviewer without that reason judged the code against the design instead.

---

## 3. What context the reviewer should get

The implementer's context has two kinds of material, and they help a reviewer in opposite ways:

- **What the change is meant to do.** The task, the plan, the design docs. The reviewer needs this. Without it, the reviewer can only find code that is wrong on its face, not code that works but does the wrong thing.
- **Why the implementer did it this way.** Its reasoning, the shortcuts it decided were fine, the dead ends. This colors a review. A reviewer that has read the excuse tends to accept it.

The three bugs in section 2 show why the first kind matters:

| Bug | Kind | Could a reviewer find it from the code alone? |
|---|---|---|
| PR #30, business name | The code works, but does the wrong thing | No. It needs the design's rule about names |
| PR #32, schedule order | A plain code bug | Yes. The code breaks its own comment. The reviewer has to think up the right case |
| PR #35, driving count | In between | Partly. Two ways to count the same thing looks odd. Knowing it's a bug needs the design's rule that the warning matches the schedule |

The doc and plan findings in section 6 can't be found from the code alone at all.

---

## 4. Ways to get a review from Claude

These are the options Anthropic documents, as of 2026-10-16 and Claude Code 2.1.301.

| Option | Where it runs | Who controls the model and prompt |
|---|---|---|
| **Code Review**, the managed service | Anthropic's servers, started by PR activity or an `@claude review` comment. Team and Enterprise plans only | Anthropic. The only setting is the level: Quick, Standard, or Deep |
| **`/code-review`**, the bundled command | Your own Claude Code session, on any plan. Can run with `-p` | You choose the model and effort. The prompt is built into Claude Code |
| **Ultrareview**, `/code-review ultra` | A cloud sandbox | Anthropic |
| **Your own prompt**, in a subagent, a skill, or a `-p` run | Wherever you run Claude Code | You |

The managed service is a packaged product, like CodeRabbit. It teaches little, and it doesn't allow a model choice. So the choice is between the bundled `/code-review` and a prompt of our own.

### 4.1 The bundled `/code-review`

From the [local review docs](https://code.claude.com/docs/en/code-review-local):

- **It looks for correctness bugs.** Depending on the model and effort, it also suggests cleanups: reuse, simplification, and efficiency.
- **Its level sets both the recipe and the model's effort.** The level is `low` to `max`, the word after `/code-review`. The review runs in a subagent, and the subagent's model effort always matches the level. Passing `--effort` to `claude -p` doesn't change it, because the main session makes no model calls of its own. Round 1 read the recipes from the run transcripts:
  - At `xhigh`, the recipe adds two angles, one for language pitfalls and one for code that wraps other code. It adds a last pass that looks only for gaps, and reports up to 15 findings. No level up to `xhigh` checks its findings again before reporting them.
  - At `high` and `medium`, the recipe is the same, word for word. The reviewer checks eight angles. It reads each changed function whole, searches for callers, checks CLAUDE.md, and reports up to 10 findings. Only the model's effort differs.
  - At `low`, it reads the diff once and opens no files. It skips test files, flags only what the changed lines show by themselves, and reports up to 4 findings.
- **It takes a target:** a PR number, a branch, a path, or a commit range such as `abc1234^..def5678`.
- **Its flags:** `--comment` posts inline comments on the PR. `--fix` applies the fixes. `--max-findings` changes how many findings it reports.
- **It follows CLAUDE.md, even in a `-p` run.** It doesn't read `REVIEW.md`, which only the managed service uses.
- **In a `-p` run it waits for the review,** and prints the findings as text or JSON.
- **Its prompt has no file on disk.** It's a bundled skill. The recipe for a run can still be read in its transcript, as the first message of the review's subagent. A project skill named `code-review` replaces it, and `/review` still runs the bundled one.
- **It runs as a forked skill.** A forked skill gets the skill's own prompt, not the caller's conversation. So nothing can be passed to it except the target text. Whatever the reviewer knows about the task, it has to find in the repo: CLAUDE.md, the docs, the commit messages, and the PR description if the target is a PR.
- **Its behavior changes with Claude Code versions.** The docs list changes at 2.1.218, 2.1.223, and 2.1.246. A comparison has to pin one version.

### 4.2 Running it with the Max subscription

`claude setup-token` makes a long-lived token for the Max subscription. A GitHub Action can use it in place of an API key, so reviews count against Max limits instead of billing per token. The token is the whole account, so a workflow using it should only run on `pull_request`, never `pull_request_target`, so that a PR from a fork never gets it.

---

## 5. Giving the reviewer the task

### 5.1 The problem

The implementer is told where its requirements are. Here, a worker was told "do phase 19," and phase 19 lists its design sections. A reviewer gets a pile of docs, and has to work out which parts relate to the change. Not every future change will be a phase, so "the PR names its phase" isn't enough on its own.

### 5.2 How other tools handle it

- **The task is a ticket, and the PR links to it.** This is the most common pattern. CodeRabbit reads the issues a PR links with "Closes #123," checks whether the change meets each one, and flags what's missing ([CodeRabbit docs](https://docs.coderabbit.ai/guides/linked-issues)). Qodo's reviewer rates a PR as fully, partly, or not compliant with its ticket ([SD Times](https://sdtimes.com/qodo-launches-automated-compliance-checks-in-its-code-review-agent)). GitHub's Copilot coding agent is assigned an issue, so the issue is its prompt.
- **Spec-driven development.** GitHub's [Spec Kit](https://github.github.com/spec-kit/) has the agent write a spec, a plan, and a task list as files before any code. The reviewer can check against those files. This project's plan and design docs work much the same way.
- **Saving the agent's session.** Some tools save the implementer's chat into the repo. That carries the implementer's reasoning along with the task, which is what section 3 says to keep out.

We decided on 2026-10-15 to stay with the markdown plan rather than a tracker, so tickets are left for a later project.

### 5.3 The proposal

- **The PR description holds the task and the "Done when" results.** The task is the implementer's prompt, word for word. For a phase that's "do phase 19," which points to the design sections. For any other change, it's what Joe or the coordinator asked for.
- **The implementer's decisions go in a PR comment.** `gh pr view` doesn't show comments unless asked, so a reviewer reading the description won't come across them by accident.

This works with the stock `/code-review`, because it can read the whole description safely. A line in CLAUDE.md telling it to start from the task is an option, but it isn't needed for it to work.

---

## 6. The corpus

The six batch 4 PRs, as they were when the reviewer first saw them. Each case is a commit range, from the commit the PR branched from to the commit before any fix.

| PR | Phase | Range to review | Fix commit | Size |
|---|---|---|---|---|
| #30 | 15, Places | `2682d24..d1107ab` | `3f416a6` | 33 files, +1,830 |
| #31 | 16, The itinerary's objects | `9ad7428..2f6724c` | `e436af7` | 51 files, +3,872 |
| #32 | 17, The calendar and the day's schedule | `96305ff..2be1432` | `7c609fc` | 16 files, +1,828 |
| #33 | 18, The services | `66a8031..4b99253` | `e7f4ecb` | 39 files, +2,205 |
| #34 | 19, Legs | `21dfc6b..ada62b2` | `9a1303b` | 36 files, +1,728 |
| #35 | 20, Feasibility checks | `520127f..94e8306` | `f579f24` | 17 files, +1,320 |

### 6.1 The answer key

These are the findings the batch 4 reviewers said must be fixed. Each was fixed, and the fix passed a second review.

| PR | Finding | Kind |
|---|---|---|
| #30 | `isAddress()` in `src/google/places-text-search.schema.ts` drops Google's name for a `premise` place, such as a named hotel | Code works, wrong behavior |
| #30 | `TripRepository.load()` doesn't load places, as persistence design 8.7 says. The deferral to phase 16 is only in a code comment, not in the plan | Plan gap |
| #31 | Domain model 3.7 and the section 2 diagram describe approvals as subclasses of one base class. The code has three separate classes | Doc doesn't match code |
| #31 | A comment in `src/domain/day.ts` names `itineraryFromRecord()`. The function is `itineraryFromStored()` | Wrong comment |
| #32 | `scheduleOf()` can return entries out of time order, when a stop with no selected place has a set time earlier than the drive | Code bug |
| #33 | Persistence design 8.7 says repositories hold the started-trip lock at save. Eight lines later it says `save()` doesn't check the lock | Doc contradicts itself |
| #34 | Phase 13 doesn't cover making the `RoutesClient` and passing it to `TripWriter` | Plan gap |
| #35 | The driving warning and the schedule count a day's driving two different ways, so the warning can stay quiet over the limit | In between |
| #35 | Persistence design 8.2 doesn't say where the feasibility checker is made | Doc gap |

### 6.2 Limits of the key

- **It's small.** Nine findings, three of them real code bugs. It can tell a reviewer that catches those three from one that doesn't. It can't rank two close settings.
- **Opus wrote the key.** A setting that finds different real problems will look worse than it is. Its extra findings have to be checked by hand.
- **The coordinator steered three reviews.** For PRs #33, #34 and #35, the coordinator told the reviewer what to look at closely. Three findings came from that: the #33 doc contradiction, the #34 phase 13 gap, and the #35 driving count. Count them, but note that the stock reviewer gets no such hint.
- **Two fixes aren't findings.** The coordinator asked for the started-trip lock to go back inside `save()` in PR #33, and for rest days to refuse waypoints in PR #34. Leave both out of the key.
- **The repo is public.** Later models may be trained on these fixes.

### 6.3 Keeping the answers out of reach

The fix commits sit right after each range, and their messages name the bug, such as "Keep the schedule in time order around a stop with no place." This doc is also on `main`. A reviewer that reads `git log --all` in a normal checkout could find the answer. So each run uses a clone that holds history only up to the end of its range.

---

## 7. Round 1 plan

Round 1 runs on Joe's machine with `claude -p`, not in CI. It uses the Max subscription.

| Setting | Model | `/code-review` level | Why |
|---|---|---|---|
| A | Opus 5.5 | high | The baseline, and closest to batch 4 |
| B | Sonnet 5.5 | high | Is a cheaper model enough? |
| C | Opus 5.5 | low | Do fewer, surer findings miss the bugs? |
| D | Sonnet 5.5 | low | The cheapest. Does the low level hurt Sonnet more than Opus? |
| E | Opus 5.5 | medium | Stage 2. Section 7.4 |
| F | Sonnet 5.5 | medium | Stage 2. Section 7.4 |
| G | Opus 5.5 | xhigh | Stage 2. Section 7.4 |
| H | Sonnet 5.5 | xhigh | Stage 2. Section 7.4 |

The level also sets the model's effort for the review (section 4.1).

Each review runs twice. Two runs show whether a setting finds the same things each time. With one run, a better setting can't be told from a lucky run.

### 7.1 Stage 1

All four settings, on two PRs, two runs each: 16 reviews.

- **PR #32 has a plain code bug,** the schedule out of time order. A reviewer can find it from the code alone. A setting that misses it is weak at the basics.
- **PR #30 has a bug that needs the design,** the hotel losing its name. It tests whether the reviewer finds and reads the design docs on its own.

PR #35 is smaller, but its main finding came from a review the coordinator steered (section 6.2), so it's weaker evidence for a first look.

### 7.2 The checkpoint

Stage 1 is a checkpoint, not a pass-or-fail test. Joe reads the actual reviews, and then decides on stage 2. That could mean dropping a setting, trying medium effort, running the other four PRs, or changing the approach. A setting that misses both bugs in all four of its runs is probably not worth going on with, but that's a guide, not a rule.

This is a first look, to get a feel for how the settings differ. It isn't meant to be a full study.

### 7.3 Each run

For each run:

- Make a clone that holds history only up to the end of the range (section 6.3).
- Run `claude -p --model <model> --output-format json "/code-review <level> <range>"` in it, with one pinned Claude Code version and auto-update off. Record the version.
- Keep the clone outside the repo. Inside it, Claude Code would also load today's CLAUDE.md from the folders above, and the reviewer could read this doc.
- Allow `git`, `node`, and read-only shell commands such as `cat` and `grep`, so the reviewer isn't blocked partway through. Block edits, the web, and `gh`, so it can't open the real PR and see the fix.
- Save the findings and the time taken.
- Save the tokens used, by model and by kind: input, output, cache writes, and cache reads. The JSON result reports them. On the first run, check that its totals include the review's own subagent. If they don't, add the subagent's tokens from its transcript.

Score each run on:

- **The code bugs.** Did it find the code bugs in the PRs it reviewed: #30's business name, #32's schedule order, and #35's driving count? These count most.
- **The other findings.** Did it find the doc and plan findings?
- **Extra findings.** How many, and how many are real? An agent checks each one against the code, and Joe spot-checks (section 8.4).
- **Cost.** What the review would cost at Anthropic's API prices, worked out from its tokens. The runs use the Max subscription, so nothing is billed. The API price is just a common scale for comparing settings. Record the price list used and the date it was read.

### 7.4 Stage 2

At the checkpoint on 2026-10-16, Joe decided the low level isn't worth using. It found neither bug in any run (section 8.1). Stage 2 tries the `medium` level instead, with Opus and Sonnet, on the same two PRs, two runs each: 8 reviews. Joe then added the `xhigh` level the same way, for 8 more.

### 7.5 Stage 3, and the fix cost

Stages 1 and 2 were meant to narrow the settings down, and they did. On 2026-10-16, Joe picked two to run on the other four PRs: Opus at `high` and Opus at `xhigh`, two runs each, 16 reviews. Sonnet was right less often than Opus at the same level, and medium and low found less (section 8).

The cost of a review is only part of the picture. Each finding also has to be read and fixed, or turned down. A wrong finding wastes that work, and a fixer might change code that was correct. A fourth stage was planned, to give the reviews to an agent that fixes what they find and measure what that costs. After stage 3, Joe dropped it (section 8.5).

---

## 8. Round 1 results

All runs were on 2026-10-16 with Claude Code 2.1.301, as section 7.3 says. The reviews themselves, word for word, are in `scratch/code-review-eval/round-1-reviews.md` on Joe's machine, with the run transcripts next to them. `scratch/` isn't committed.

Cost is at Anthropic's API prices, from the pricing page read on 2026-10-16. Per million tokens, Opus 5.5 is $4 input, $5 cache write, $0.20 cache read, and $20 output. Sonnet 5.5 is $2, $2.50, $0.10, and $10. Every cache write was a 5-minute write. The JSON result's totals include the review's subagent, and Claude Code's own cost figure matched these prices.

| Setting | #32 schedule order | #30 business name | #30 plan gap | Findings per review | Time per review | Cost per review |
|---|---|---|---|---|---|---|
| A, Opus, high | 2 of 2 | 2 of 2 | 0 of 2 | 9 to 10 | 2 to 3.5 min | $0.60 to $0.94 |
| B, Sonnet, high | 1 of 2 | 2 of 2 | 0 of 2 | 8 to 9 | 1 to 2.5 min | $0.20 to $0.36 |
| E, Opus, medium | 1 of 2 | 1 of 2 | 0 of 2 | 7 to 9 | 1 to 2 min | $0.44 to $0.55 |
| F, Sonnet, medium | 0 of 2 | 2 of 2 | 0 of 2 | 6 to 8 | under 1 min | $0.13 to $0.16 |
| G, Opus, xhigh | 2 of 2 | 2 of 2 | 0 of 2 | 14 to 15 | 6.5 to 10 min | $1.74 to $2.93 |
| H, Sonnet, xhigh | 1 of 2 | 2 of 2 | 0 of 2 | 11 to 14 | 5 to 10 min | $0.70 to $1.56 |
| C, Opus, low | 0 of 4 | 0 of 4 | 0 of 4 | 0 to 2 | under 30 s | $0.19 to $0.22 |
| D, Sonnet, low | 0 of 4 | 0 of 4 | 0 of 4 | 0 to 3 | under 20 s | $0.09 to $0.13 |

C and D ran four times each. The second pair was meant to run at high model effort, but `--effort` turned out to have no effect (section 4.1). So all four ran the same way.

One more run isn't in the table. A trial of setting A on #32 ran first, with fewer allowed commands. Two of its commands were blocked, and it still found the schedule order.

### 8.1 Stage 1

- **The low level can't find either bug.** It reads only the diff, and both bugs need more than the changed lines. Most low reviews reported no findings at all.
- **At high, Opus found both bugs every time.** Sonnet found the business name both times, but missed the schedule order in one of its two runs. That run flagged other problems in the calendar code instead.
- **No run found the #30 plan gap.** It needs the plan and persistence design 8.7 read side by side.
- **PR #30 tests less than section 7.1 hoped.** The PR edited the domain model right next to the rule "Cards show Google's name whenever Google has one," so the rule is in the diff. Sonnet found the bug without opening any design doc.
- **Sonnet at high costs about a third of Opus at high.** It also took about half the time.
- **Some extra findings came up in every high run of a PR.** On #30: the closing tag in `place-content.ts` is removed in only one pass; a `RuleError` from Google's data escapes as the wrong error type; and a timeout while reading the body is swallowed. On #32: the leg check ignores a change to the leg's start or end. Section 8.4 says which extras are real.

### 8.2 Stage 2

- **Medium found less than high, with the same recipe.** Opus at medium found the schedule order in one run. Its other run flagged the same lines, but only for a drive whose time is unknown, so it doesn't count. It also missed the business name once. Sonnet at medium missed the schedule order in both runs.
- **Medium saves less than it loses.** Opus at medium cost about a third less than Opus at high. Sonnet at medium cost about half as much as Sonnet at high. Sonnet at high found more than Opus at medium, for about half the price.
- **The extra findings partly repeat.** The #30 closing tag, wrong error type, and swallowed timeout came up again, but not in every run. The #32 leg check came up in one Opus run.
- **xhigh found the same key bugs as high.** Opus found both every time, and Sonnet still missed the schedule order once. It cost about 3 times as much as high, and took about 3 times as long.
- **Opus at xhigh found one problem no other setting did.** Saving places from a search can wait on a write's row lock, which the persistence design says can't happen (open item 18). Both models found it in every xhigh run.

### 8.3 Stage 3

| Finding from the answer key | Opus, high | Opus, xhigh |
|---|---|---|
| #31: the domain model shows approvals as subclasses, but the code has three separate classes | 0 of 2 | 0 of 2 |
| #31: a comment names the wrong function | 0 of 2 | 2 of 2 |
| #33: the started-trip lock is no longer checked at save | 2 of 2 | 2 of 2 |
| #34: phase 13 leaves out the `RoutesClient` | 0 of 2 | 0 of 2 |
| #35: the warning and the schedule count a day's driving differently | 1 of 2 | 0 of 2 |
| #35: persistence 8.2 doesn't say where the checker is made | 0 of 2 | 0 of 2 |

Opus at high cost $0.89 to $1.29 per review, and took about 3 minutes. Opus at xhigh cost $2.55 to $3.35, and took 8 to 10 minutes.

- **#33 counts as found, framed differently.** All four runs said `save()` no longer checks the lock while the design still says it does. They saw it as a code problem, not as the design contradicting itself. The fix put the check back in `save()`.
- **Only one run found #35's driving count.** Opus at high worked out that the two ways of rounding already give different numbers. The other three runs saw that the formula is copied, and said only that the copies could drift apart.
- **The stock `/code-review` doesn't catch plan or doc gaps.** Over all six PRs, no setting found a gap in the plan or a doc that doesn't match the code. Batch 4's reviewer was given the phase and its design sections, and the stock command isn't.
- **One xhigh review returned JSON that doesn't parse.** A CI job that reads the JSON has to allow for that.

### 8.4 Are the extra findings real?

An agent checked every finding that isn't in the answer key against the code, one PR at a time. It grouped findings that describe the same issue, and gave each group one verdict. "Real" means a real bug or an accurate cleanup. "Design choice" means the code does what the design asks for. "Wrong" means the claim about the code is false. Shares are of findings, counting a repeated issue once per run.

| Setting | PRs | Real | Design choice | Wrong |
|---|---|---|---|---|
| Opus, high | #30, #32 | 65% | 20% | 10% |
| Opus, xhigh | #30, #32 | 75% | 14% | 8% |
| Sonnet, high | #30, #32 | 49% | 26% | 20% |
| Sonnet, xhigh | #30, #32 | 64% | 20% | 12% |
| Opus, medium | #30, #32 | 50% | 24% | 24% |
| Sonnet, medium | #30, #32 | 38% | 31% | 24% |
| Opus, high | #31, #33, #34, #35 | 65% | 23% | 10% |
| Opus, xhigh | #31, #33, #34, #35 | 71% | 20% | 7% |

- **Opus is right more often than Sonnet at every level.** At high, a fifth of Sonnet's findings were wrong, twice the share for Opus.
- **Most real bugs outside the answer key are minor.** Examples are "1 hours" in a warning, and a drive buffer that rounds one minute too far with an unusual buffer. The ones Joe wanted kept are open items 15 to 20.
- **On #31 to #35, high and xhigh found the same number of real bugs.** Each found 8, and each found 4 the other missed. xhigh found 44 accurate cleanups against 26 for high.
- **The wrong findings mostly come from not knowing rules elsewhere in the code.** For example, "the weekday getter falls back to Sunday" can never happen, because `CalendarDate` refuses a date that isn't real.

### 8.5 The choice: Opus at high

Joe chose Opus at `high` on 2026-10-16.

- **Low and medium miss bugs that high finds.** Low found neither key bug in any run.
- **Sonnet misses more and is wrong more often.** It's cheaper per review, but a wrong finding costs work to turn down.
- **xhigh mostly adds cleanups, for about 3 times the cost.** Cleanups would matter more on a real product. For this project, high finds enough.
- **No fix-run test.** The fourth stage in section 7.5 would have measured what fixing each setting's findings costs. With high chosen on review quality alone, it isn't needed.

---

## 9. Later: CI and the fix loop

Round 1 picked Opus at `high` (section 8.5). Since 2026-10-16, the "Code review" workflow (`.github/workflows/code-review.yml`) runs `/code-review high --comment` with Opus on each PR, using the Max subscription token.

- **It runs when a PR is opened or gets a new commit,** if the PR changes `src/` or `web/`. Other files aren't reviewed. The stock review found no gaps in plans and docs (section 8), and the seven reviews of the workflow's own PR, #39, found mostly minor things. A push to a branch with no PR doesn't run it, and neither does a draft.
- **The PR description holds the task, and the implementer's decisions go in a comment** (section 5.3, now in DEVELOPMENT.md section 7). A line in CLAUDE.md tells the reviewer to start from the description and not read the PR's conversation comments.
- **It uses Claude Code 2.1.301,** the version round 1 tested, installed fresh in each run. A fresh install took under 3 seconds, so a prebuilt container wouldn't be faster.
- **Each run saves its transcript** as a workflow artifact, so we can check what the reviewer read.

After that, the review needs a clear result. Either the PR is ready for Joe, or it has findings to fix. Findings would start another Claude Code run in CI, which reads the review, makes the fixes, and pushes. That loop stops after two or three rounds, so it can't run forever. A label or a check result on the PR could be the "ready for Joe" signal.

---

## 10. The first CI runs: a fix loop with no limits

The workflow's own PR, #39, was reviewed by the new workflow. Claude Code fixed each review's findings and pushed, and each push started the next review. That was the fix loop of section 9, done by hand before it was designed. It went seven rounds before Joe stopped it.

| Round | What the review did | Findings | Cost |
|---|---|---|---|
| 1 | Normal review | 9 posted | $0.41 |
| 2 | Skipped all 9 earlier findings | 5 posted | $0.66 |
| 3 | Failed to start: the token scrub needs bubblewrap | none | none |
| 4 | Ran no commands: the sandbox also needs socat | 5, not posted | $0.38 |
| 5 | Posted one earlier finding again, saying its fix hadn't worked | 6 posted | $0.58 |
| 6 | Normal review | 6 posted | $0.64 |
| 7 | Normal review | 5 posted | $1.09 |

PR #40, the fixes for open items 15 to 20, had one review blind for want of socat, then one real review with 7 findings, for $1.30 and $1.09. Its findings were about the app's code, such as review text that can still close the `place_content` label with `</place_content >`. Joe stopped the fixes before any were pushed.

**What went wrong:**

- **The review never says "done."** Its recipe says "Target at least 5 findings," though it also says not to invent findings to reach that number. Every round found 5 or more. So "no findings left" can't be the signal to stop.
- **Each fix gave the next review new lines to look at.** Most later findings were about lines the last fix had changed. Fixes to the token protection led to findings about the token protection.
- **Nearly every finding was fixed, and most were minor.** Of the 36 findings, about 10 affected whether the review worked or how well the token was kept safe. Examples: comments posted again on every push, and the reviewer unable to post when `jq` was blocked. The rest were wording, a file name, or 8 seconds of setup time.
- **The scope was wider than it needed to be.** PR #39 changed only the workflow and docs. It was reviewed because the workflow's folder was in the list of reviewed paths. With only `src/` and `web/`, it wouldn't have been reviewed at all. The list is now `src/` and `web/`.

**What the fix loop needs** (open item 14):

- **A rule for what to fix.** Fix only findings that cause wrong behavior, lost data, or a security hole. List the rest in the PR comment for Joe.
- **A cap of two fix rounds,** then the PR goes to Joe, whatever the last review found.
- **A check that the review ran.** Rounds 3 and 4 looked like they passed. The workflow now fails the step when the run itself fails, but a review whose commands are all blocked still passes.

**What worked:**

- **The reviewer kept to the description.** The transcripts show it read the PR description and the inline comments, and never the decisions comment.
- **It didn't repeat findings.** From round 2 on, it read the earlier inline comments first and left those findings out, as CLAUDE.md asks. In round 5 it posted one again, because the fix hadn't covered it, and it said so. That one was right: an earlier reply had said `jq` worked, and inside the sandbox it didn't.
- **The worker on PR #40 followed the new format** from CLAUDE.md and DEVELOPMENT.md alone. Its description held the task word for word and the "Done when" results, and its decisions went in a comment.

**Setup problems, for the next workflow:**

- **The token scrub needs a sandbox.** `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1` runs each command in a bubblewrap sandbox, which also needs socat. Ubuntu 24.04 blocks that sandbox until `kernel.apparmor_restrict_unprivileged_userns` is set to 0.
- **The sandbox changes which commands need approval.** Before the scrub, `jq` and `echo` ran without being on the allowed list. Inside the sandbox they were blocked until added.
- **The checked-in `.claude/settings.json` applies in CI too.** Its allow rules add to the workflow's, and that includes the ssh and merge rules. They fail in CI only because the runner has no SSH key and the token can't write.
- **The scrub doesn't cover the Read tool,** which runs inside Claude Code's own process. Open item 21.

---

## 11. Sources

- [Code Review](https://code.claude.com/docs/en/code-review), Claude Code docs, read 2026-10-16
- [Review locally with /code-review](https://code.claude.com/docs/en/code-review-local), Claude Code docs, read 2026-10-16
- [CodeRabbit linked issues](https://docs.coderabbit.ai/guides/linked-issues)
- [Qodo compliance checks](https://sdtimes.com/qodo-launches-automated-compliance-checks-in-its-code-review-agent), SD Times
- [GitHub Spec Kit](https://github.github.com/spec-kit/)
- Batch 4 reviewer transcripts: `~/.claude/projects/-home-jjk3-PycharmProjects-personal-road-trip-agent/f2bdf502-36d9-4ac9-8d49-673783e84196/subagents/`, on Joe's machine
