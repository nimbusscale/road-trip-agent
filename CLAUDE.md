# road-trip-agent

Before reading anything in `design/`, read [design/README.md](design/README.md). It says what each design doc covers and when to read it. Read only the docs your task needs.

Work is tracked in GitHub issues, ordered in the [project](https://github.com/users/nimbusscale/projects/1) (DEVELOPMENT.md section 9). When something is set aside, in chat or during a task, write it down right away. If an open issue will deal with it, add it to that issue's open questions. If not, open a new issue in Triage, and tell Joe.

Don't read `research/`, `reviews/`, or `plan/` unless the prompt tells you to, or you're looking up an old phase or open item. `plan/` is frozen. `research/` holds the evaluations behind design decisions, and `reviews/` holds records of past review sessions. The design docs already carry the decisions, so building or changing the app never needs any of the three.

## Writing code

- Read [DEVELOPMENT.md](DEVELOPMENT.md) before writing or changing code.
- Work is done only when `npm run check` passes.
- The config files listed in DEVELOPMENT.md section 6 change only with Joe's approval. If a change seems needed, stop, say why, and ask first. Never edit them, or add a disable comment or `@ts-expect-error`, just to make a check pass.
- Check outside data with Zod where it enters the program (DEVELOPMENT.md section 4).
- No barrel files. Import from the file that defines the thing.

## Pull requests

- A PR description holds only the task and the "Done when" results. Decisions, things set aside, and config changes you think are needed go in a PR comment, posted right after the PR is opened (DEVELOPMENT.md section 7).
- When reviewing a PR, start from the task in its description. Don't read the PR's conversation comments, such as with `gh pr view --comments`, or the comments on its issue. They hold the implementer's reasons, which would color the review. Inline review comments are fine to read. Before posting findings, read them, and don't post a finding that an earlier inline comment already makes. The exception is when the lines it points to have changed since, and the problem is still there. Then post it again, and say the change didn't fix it.
