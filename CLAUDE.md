# road-trip-agent

Before reading anything in `design/`, read [design/README.md](design/README.md). It says what each design doc covers and when to read it. Read only the docs your task needs.

Work is tracked in GitHub issues, ordered in the [project](https://github.com/users/nimbusscale/projects/1) (DEVELOPMENT.md section 9). When something is set aside, in chat or during a task, write it down right away. If an open issue will deal with it, add it to that issue's open questions. If not, open a new issue in Triage, and tell Joe. The exception is a security problem. Raise it with Joe in chat, and open an issue for it only once he approves.

Don't read `research/`, `reviews/`, or `plan/` unless the prompt tells you to, or you're looking up an old phase or open item. `plan/` is frozen. `research/` holds the evaluations behind design decisions, and `reviews/` holds records of past review sessions. The design docs already carry the decisions, so building or changing the app never needs any of the three.

## What this project is

This is a learning project. Joe built it to learn how to design and build a multi-agent system from the ground up. That covers agent tools, how agents work with each other, memory, and evaluations that show whether a change to a model, a system prompt, or a tool description made things better or worse. Joe has a long background in software development and DevOps, so the agent side is the point of the project. The road trip planner is a stand-in that gives the agents real work to do.

It is not a product. Joe is the main user, and a family member or friend may try it. It's not commercial, and there's no SLA. Once Joe has learned what he wants to learn, the system will be torn down. The code stays, but nothing will run.

### How much care the code needs

- **Agent-facing work gets full care.** That means tool descriptions, input schemas, return shapes, prompts, and agent evaluations.
- **The rest of the code should be as bug-free as is practical.** When an agent does something unexpected, Joe wants to trace it to a tool, a prompt, or the model, not to an app bug. Agents will still run into real bugs, and seeing how they handle them is useful. But don't leave bugs in on purpose.
- **Keep the code readable and easy to change from one session to the next.** Linting and style matter for that. Beyond that, weigh quality against time and tokens, and lean toward less.
- **Don't add production safeguards.** That means no staging, integration test databases, migration tests, more backups, monitoring, or alerts. Tests use fakes, plus checks by hand (DEVELOPMENT.md section 5). If you see a real risk, say it in one sentence and let Joe decide.
- **Versions are locked for the life of the project.** That covers the server, Claude Code, the Agent SDK, and the packages. The one exception is a serious security hole, such as an SSH zero-day, which gets patched.
- **Security gets a reasonable amount of care, and Joe decides what's reasonable.** Protect the real secrets, such as the Claude plan token and the Google keys. The threat to plan for is scanning bots and worms, not a targeted attack, so the aim is not to be easy prey for them. Some choices are accepted on purpose to save effort. For example, root can log in to the server. Raise security problems you find, and let Joe decide which ones to fix.
- **When a feature is mostly deterministic code and its rules get fiddly, offer to cut it.** Keep features that show agent behavior, even when they add rules.

### When reviewing

Report bugs, security problems, and anything that would make an agent's behavior hard to trace. Don't report missing production safeguards, version updates, or code-quality points that don't make the code harder to read or change.

## Writing code

- Read [DEVELOPMENT.md](DEVELOPMENT.md) before writing or changing code.
- Work is done only when `npm run check` passes.
- The config files listed in DEVELOPMENT.md section 6 change only with Joe's approval. If a change seems needed, stop, say why, and ask first. Never edit them, or add a disable comment or `@ts-expect-error`, just to make a check pass.
- Check outside data with Zod where it enters the program (DEVELOPMENT.md section 4).
- No barrel files. Import from the file that defines the thing.

## Pull requests

- A PR description holds only the task and the "Done when" results. Decisions, things set aside, and config changes you think are needed go in a PR comment, posted right after the PR is opened (DEVELOPMENT.md section 7).
- When reviewing a PR, start from the task in its description. Don't read the PR's conversation comments, such as with `gh pr view --comments`, or the comments on its issue. They hold the implementer's reasons, which would color the review. Inline review comments are fine to read. Before posting findings, read them, and don't post a finding that an earlier inline comment already makes. The exception is when the lines it points to have changed since, and the problem is still there. Then post it again, and say the change didn't fix it.
