# road-trip-agent

Before reading anything in `design/`, read [design/README.md](design/README.md). It says what each design doc covers and when to read it. Read only the docs your task needs.

When something is set aside, in chat or during a phase, write it down right away. If a phase will deal with it, add it to that phase's open questions in the development plan. If not, add it to [plan/open-items.md](plan/open-items.md).

Don't read `research/` or `reviews/` unless the prompt tells you to. `research/` holds the evaluations behind design decisions, and `reviews/` holds records of past review sessions. The design docs already carry the decisions, so building or changing the app never needs either folder.

## Writing code

- Read [DEVELOPMENT.md](DEVELOPMENT.md) before writing or changing code.
- The development work is done in the phases in [plan/development-plan.md](plan/development-plan.md).
- Work is done only when `npm run check` passes.
- The config files listed in DEVELOPMENT.md section 6 change only with Joe's approval. If a change seems needed, stop, say why, and ask first. Never edit them, or add a disable comment or `@ts-expect-error`, just to make a check pass.
- Check outside data with Zod where it enters the program (DEVELOPMENT.md section 4).
- No barrel files. Import from the file that defines the thing.

## Pull requests

- A PR description holds only the task and the "Done when" results. Decisions, things set aside, and config changes you think are needed go in a PR comment, posted right after the PR is opened (DEVELOPMENT.md section 7).
- When reviewing a PR, start from the task in its description. Don't read the PR's conversation comments, such as with `gh pr view --comments`. They hold the implementer's reasons, which would color the review. Inline review comments are fine to read. Before posting findings, read them, and don't post a finding that an earlier inline comment already makes. The exception is when the code it points to has changed since, and the problem is still there. Then post it again, and say the change didn't fix it.
