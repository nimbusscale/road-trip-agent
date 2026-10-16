# Road Trip Planner: Batch 4, Phases 15 to 20 Overnight

This doc says how phases 15 to 20 are built in one run, while Joe is asleep. They come before phase 13, so that work on the agents can start with the domain finished. Joe reviews the result in the morning, as one PR into `main`. What each phase builds is in the [development plan](development-plan.md). This doc only says how the run works.

Read this whole doc before starting. Nobody can answer a question during the run, so this doc answers them ahead of time.

---

## 1. Who does what

- **The coordinator** is the session that runs this doc. It starts each worker and each reviewer, merges PRs into `development`, and keeps the log in section 7. It doesn't write or review code itself, so its context stays small across six phases.
- **A worker** is a new agent that does one phase on its own branch, and opens a PR into `development`.
- **A reviewer** is a new agent that reviews one PR. It didn't write the code, so it reads the PR without the worker's reasons for any shortcut.
- **Joe** reviews the final PR, from `development` into `main`, in the morning. He merges it, or asks Claude Code to.

## 2. The branches

- **`development`** is made from `main` at the start of the run. A merge into it doesn't deploy, since the deploy only runs on a push to `main`. Each PR into it still runs `npm run check` in GitHub.
- **Each worker branches off the latest `development`,** as `phase-<number>-<short name>`, such as `phase-15-places`.
- **The coordinator merges each phase's PR into `development`** once it passes its review and its check in GitHub. DEVELOPMENT.md section 7 says Claude Code never merges a PR without being asked. Joe asked on 2026-10-15, for PRs into `development` during this run only. Nothing is merged into `main`.

## 3. Rules for the run

Joe agreed to these on 2026-10-15, for this run only. They replace any step in a phase that would ask Joe.

- **The coordinator settles open questions.** Phase 15 asks whether Google gives a street address a name, and its real lookup answers it. Phase 17 asks which time-zone library to use. The worker proposes an answer in its PR, and writes it into the design doc it belongs to. The reviewer checks it, and the coordinator accepts it by merging. The same goes for a design change a phase finds it needs. The final PR lists each one, so Joe can push back.
- **No config file changes.** The config files in DEVELOPMENT.md section 6 change only with Joe's approval. If a worker thinks one needs to change, it writes down why in its PR, and works around it without loosening any check. It never adds a disable comment or `@ts-expect-error`. If the phase truly can't be done without the change, the run stops there.
- **Real Google calls are fine.** Phases 15 and 19 each make a few real calls with the server key in `.env`, as their "Done when" lists. Make only those. Phase 19 makes at most 100 real Google calls in all, counting retries and debugging. Joe set this limit on 2026-10-15. If the worker needs more, it stops calling Google, writes down why in its PR, and leaves that check open. Phase 15 made 4 calls.
- **A blocked step stops the run.** If a permission prompt or anything else blocks a step, and these rules give no way around it, stop. Write in the log where the run stopped and why, then end.
- **No attribution.** No `Claude-Session` lines, "Generated with" lines, or co-author lines in commits, PRs, or worker prompts.

## 4. Before starting

1. Check that the local Postgres is running (`docker compose ps`), that `.env` has `GOOGLE_MAPS_SERVER_KEY`, and that `npm run check` passes on `main`.
2. Make `development` from `main`, and push it.

## 5. Each phase

Do phases 15, 16, 17, 18, 19, and 20, in that order, one at a time. For each one:

1. Start a worker with the worker prompt in section 6, and wait for it to finish.
2. Start a reviewer with the reviewer prompt in section 6.
3. If the reviewer lists findings, send them to the worker with `SendMessage`, or to a new worker on the same branch if that one can't be reached. Then review again. After two rounds of fixes, merge anyway and log what's still open. But if a later phase would build on the problem, stop instead.
4. Wait for the check in GitHub (`gh pr checks <number> --watch`). Once it passes, merge the PR with `gh pr merge <number> --merge --delete-branch`.
5. On `development`, fill in the phase's row of the table in the development plan, with the date and the PR. Add the phase to the log in section 7. Commit and push both to `development` directly.

After phase 20, open the final PR from `development` into `main`. Its description has:

- each phase, with its PR into `development`
- each decision Joe should look at: open questions answered, and design changes
- what's still open: review findings left after two rounds, config changes a worker wanted, and items set aside
- the results of the real Google calls

Don't merge it. Joe reviews it in the morning.

**If the run stopped partway,** a new coordinator reads this doc and the log. It finds the last phase merged, checks for an open PR into `development` for the next one, and goes on from there.

## 6. The prompts

**The worker prompt.** Fill in the phase number and branch name.

> You're doing phase N of `plan/development-plan.md` in this repo, as part of the overnight run in `plan/batch-4.md`. Read that doc's section 3, "Rules for the run," first. Nobody can answer questions tonight, and those rules replace any step that would ask Joe.
>
> Make the branch `<branch>` from `origin/development`. Follow `CLAUDE.md` and `DEVELOPMENT.md`. Read the design sections the phase lists.
>
> Run each "Done when" check yourself. The work is done when `npm run check` passes. Then open a PR into `development` (`--base development`). Its description lists each "Done when" item with its result, each decision you made, what you set aside and where you wrote it down, and any config change you think is needed. Don't mark the phase done in the plan's table. The coordinator does that.
>
> Reply with the PR number, the decisions you made, and anything that didn't pass. Keep the reply short.

**The reviewer prompt.** Fill in the PR and phase numbers.

> Review PR #<number>. It's phase N of `plan/development-plan.md`, going into the `development` branch, as part of the overnight run in `plan/batch-4.md`. Don't change any code.
>
> Read the phase, its design sections, and `DEVELOPMENT.md`. Then check:
>
> - The code does what the design says, with no bugs, and nothing beyond the phase.
> - Each "Done when" item is covered by a test, or by a check reported in the PR.
> - It follows `DEVELOPMENT.md`, such as the pattern in section 8, and Zod checks where outside data comes in. It changes no config file, and adds no disable comment or `@ts-expect-error`.
> - Each decision in the PR description makes sense, and is written into the design doc it belongs to.
>
> Reply with "pass", or with the findings that must be fixed. Give each one's file, line, and what's wrong. Leave out small style points.

## 7. Log

The coordinator adds a row after each phase is merged.

| Phase | PR | Decisions for Joe to look at | Still open |
|---|---|---|---|
