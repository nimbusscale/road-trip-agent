# Road Trip Planner: Code Review Evaluation

> **This is a research document, not a design document.** It records what we learned about having Claude review code, and how we test which model and effort to use. It does not change how the app is built.

During the overnight run in [batch 4](../plan/batch-4.md), a separate Opus agent reviewed each phase's PR before it was merged. It found real problems in every PR, though the same model wrote the code. That made automated review look worth adding to how this project works. Before building it into CI, we want to know which model and effort level give useful reviews.

Sections 2 to 5 record what we found out and decided on 2026-10-16. Section 6 is the set of past PRs we test against, and section 7 is how the first round runs. Results go in section 8 after the runs.

---

## 1. Status

**Last updated 2026-10-16.**

| Round | What it tests | Status |
|---|---|---|
| 1 | Stock `/code-review` on the six batch 4 PRs, with four model and effort settings, two runs each | Not started. Plan in section 7 |
| 2 | Stock `/code-review` on older PRs that were never reviewed (#2 to #29) | Not planned yet. Depends on round 1 |

**Still open:**
- **A PR description format.** Section 5.3 proposes putting the task and the "Done when" results in the description, and the implementer's decisions in a PR comment. It isn't adopted yet. It would change the worker prompt and DEVELOPMENT.md.
- **CI and the fix loop.** Section 9. Comes after round 1 picks a setting.
- **Our own review prompt.** Left for later. Round 1 tests only the stock `/code-review`.

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
- **Effort is its main setting.** At `low`, it reports only the findings it's most sure of. From `medium` to `max`, it covers more ground.
- **It takes a target:** a PR number, a branch, a path, or a commit range such as `abc1234^..def5678`.
- **Its flags:** `--comment` posts inline comments on the PR. `--fix` applies the fixes. `--max-findings` changes how many findings it reports.
- **It follows CLAUDE.md, even in a `-p` run.** It doesn't read `REVIEW.md`, which only the managed service uses.
- **In a `-p` run it waits for the review,** and prints the findings as text or JSON.
- **Its prompt can't be read.** It's a bundled skill, with no file on disk. A project skill named `code-review` replaces it, and `/review` still runs the bundled one.
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

| Setting | Model | Effort | Why |
|---|---|---|---|
| A | Opus 5.5 | high | The baseline, and closest to batch 4 |
| B | Sonnet 5.5 | high | Is a cheaper model enough? |
| C | Opus 5.5 | low | Do fewer, surer findings miss the bugs? |
| D | Sonnet 5.5 | low | The cheapest. Does low effort hurt Sonnet more than Opus? |

Each setting runs twice on each of the six PRs, so 48 reviews in all. Two runs show whether a setting finds the same things each time. With one run, a better setting can't be told from a lucky run.

For each run:

- Make a clone that holds history only up to the end of the range (section 6.3).
- Run `claude -p --model <model> --output-format json "/code-review <effort> <range>"` in it, with one pinned Claude Code version. Record the version.
- Save the findings and the time taken.
- Save the tokens used, by model and by kind: input, output, cache writes, and cache reads. The JSON result reports them. On the first run, check that its totals include the review's own subagent. If they don't, add the subagent's tokens from its transcript.

Score each run on:

- **The code bugs.** Did it find #30's business name, #32's schedule order, and #35's driving count? These count most.
- **The other findings.** Did it find the doc and plan findings?
- **Extra findings.** How many, and how many are real? Joe checks these by hand.
- **Cost.** What the review would cost at Anthropic's API prices, worked out from its tokens. The runs use the Max subscription, so nothing is billed. The API price is just a common scale for comparing settings. Record the price list used and the date it was read.

---

## 8. Round 1 results

Not run yet.

---

## 9. Later: CI and the fix loop

Once round 1 picks a setting, a GitHub Actions job runs `/code-review --comment` on each PR, with the Max subscription token.

After that, the review needs a clear result. Either the PR is ready for Joe, or it has findings to fix. Findings would start another Claude Code run in CI, which reads the review, makes the fixes, and pushes. That loop stops after two or three rounds, so it can't run forever. A label or a check result on the PR could be the "ready for Joe" signal.

---

## 10. Sources

- [Code Review](https://code.claude.com/docs/en/code-review), Claude Code docs, read 2026-10-16
- [Review locally with /code-review](https://code.claude.com/docs/en/code-review-local), Claude Code docs, read 2026-10-16
- [CodeRabbit linked issues](https://docs.coderabbit.ai/guides/linked-issues)
- [Qodo compliance checks](https://sdtimes.com/qodo-launches-automated-compliance-checks-in-its-code-review-agent), SD Times
- [GitHub Spec Kit](https://github.github.com/spec-kit/)
- Batch 4 reviewer transcripts: `~/.claude/projects/-home-jjk3-PycharmProjects-personal-road-trip-agent/f2bdf502-36d9-4ac9-8d49-673783e84196/subagents/`, on Joe's machine
