# Road Trip Planner: Development

This document covers how the code is written, checked, and tested. Read it before writing or changing code. What the app does and how it's built is in [design/](design/README.md). How to run it locally, and how it's deployed, is in the [systems design](design/systems.md). The development work is tracked in GitHub issues (section 9).

Claude Code writes the code, Joe reviews the code he cares about, and the tools enforce the baseline for all of it. The tools catch what they can. This document covers the rest.

---

## 1. The one check

**`npm run check` runs every check, in this order:** `format:check`, `typecheck`, `lint`, then `test`. It stops at the first failure.

**Work is done only when `npm run check` passes.** A pre-commit hook runs it too, so a failing change can't be committed. The hook skips a commit that changes no file the check reads, such as one that only changes docs. `lefthook.yml` lists the files it watches.

---

## 2. Commands

| Command | Does |
|---|---|
| `npm run dev` | Runs the app and the front end locally ([systems design](design/systems.md), section 6) |
| `npm run migrate` | Runs the database migrations that haven't run yet ([persistence design](design/persistence.md), section 1) |
| `npm run ask-claude` | Sends Claude one question through the Agent SDK, on the plan's token, and prints the reply. Dev only. A question can follow, as in `npm run ask-claude -- "your question"` |
| `npm run chat` | Chats with the coordinator in the terminal, against the local database, and prints each tool call and its reply. Dev only. With no options, it starts a new trip for a dev user. `-- --user <uuid>` starts one for another user, `-- --trip <trip ID>` starts a new session on a trip, and `-- --resume <session ID>` resumes a session. Ctrl-D ends it |
| `npm run live-chat` | Chats with a site through its API, as the browser does, one action per command, such as `-- start`, `-- send <session ID>`, `-- cards <session ID>`, or `-- select <session ID> <card ID> <option>`. It runs no agent, so the session is in that site's database and Phoenix project. A simulated user uses it (`simulated-users/README.md`). A message comes on standard input. It prints only what the page shows: the reply, each tool's name while the turn runs, and how many option cards are open. It signs in as `LIVE_CHAT_EMAIL` with `LIVE_CHAT_PASSWORD`, to `LIVE_CHAT_SITE`: `http://localhost:5173` with `npm run dev`, or the live site. With no action, it lists them all. The comment at the top of `src/live-chat/live-chat.ts` says what each does |
| `npm run sim-setup` | Sets up a run folder for a simulated user, outside the repo, as in `-- claude-code-sonnet san-francisco easygoing local`: a bot user, a trip, a persona, and the site, `local` or `live`. Dev only. `simulated-users/README.md` says how to set up a run and start a harness |
| `npm run rebuild-versions` | Rebuilds the trip versions of a session recorded before versions were saved (persistence design, section 8.9). One-time, dev only. It reads the live database through the SSH tunnel to the server's Postgres, and needs its login in `LIVE_POSTGRES_PORT`, `LIVE_POSTGRES_USER`, `LIVE_POSTGRES_PASSWORD`, and `LIVE_POSTGRES_DB`. The comment at the top of `src/version-rebuild/rebuild-versions.ts` gives its options |
| `npm run run-turn` | Starts a run from one turn of a recorded session, and runs that turn on today's code, for an agent evaluation (persistence design, section 8.9). Dev only. Section 5 says how to use it |
| `npm run run-worker` | Runs one recorded worker run on its own, on today's code, for an agent evaluation (#266). Dev only. Section 5 says how to use it |
| `npm run candidate-refusals` | The candidate refusals evaluation (#266), as `-- dataset` or `-- experiment`. Dev only. The comment at the top of `src/worker-run/candidate-refusals.ts` says what each does |
| `npm run saving` | The saving to the right place evaluation (#209), as `-- turns`, `-- review <set> [<labeler> ...]`, `-- inputs <set> ...`, `-- label <labeler> <set> ...`, `-- compare <labeler> <labeler> <set> ...`, `-- check-versions`, or `-- golden`. Dev only. Section 5 says how it's used, and the comment at the top of `src/saving-eval/saving.ts` says what each does |
| `npm run build` | Builds the app into `dist/app` and the front end into `dist/web`, as the images do |
| `npm run check` | Runs every check below, stopping at the first failure |
| `npm run format` | Formats the code in `src/` and `web/` with Prettier |
| `npm run format:check` | Fails if any file in `src/` or `web/` isn't formatted |
| `npm run typecheck` | Type-checks with `tsc --noEmit` |
| `npm run lint` | Runs ESLint, failing on any warning |
| `npm run test` | Runs the tests with Vitest. It never writes a snapshot, so a missing or stale one fails |
| `npm run agent-views` | Rewrites each agent's view file, such as `src/agent/coordinator.view.md` (section 5). It runs only the agent views test, so it never updates any other snapshot |

Postgres for local development runs in a container, with Docker Compose: `docker compose up -d postgres` ([systems design](design/systems.md), section 6). Copy `.env.example` to `.env` and fill it in first.

**Bring up the SSH tunnel to the server's Phoenix before `npm run dev` or `npm run chat`,** so each turn's trace is saved (systems design section 10):

```sh
ssh -N -L 6006:127.0.0.1:6006 root@projects.jjk3.com
```

Then open the Phoenix UI at `http://127.0.0.1:6006`. Local traces are in the `road-trip-agent-local` project, and the live site's are in `road-trip-agent`. Without the tunnel, the chat still works, the page shows a red X, and the turns' traces are lost.

---

## 3. Style

**Style comes from the tools and the rules below.** The rules follow the [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html), and cover what the tools can't check. There's no need to read the guide itself.

- **Prettier formats the code in `src/` and `web/`,** with its default options. Don't format by hand. Other files, such as the config files, workflows, and Markdown docs, are formatted by hand, and Prettier skips them.
- **ESLint runs typescript-eslint's strictest type-checked rules,** plus limits on function size, nesting, and parameters, and bans on escape hatches such as `any`. The config holds the exact rules and limits.
- **When a limit is hit, split the code.** Don't ask for a higher limit to fit one function. Example: a function with too many branches becomes two functions with clear names.
- **Names follow the Google guide.** Classes and types are `UpperCamelCase`. Variables, functions, and properties are `lowerCamelCase`. Constants at the top of a module are `CONSTANT_CASE`. Names in code match the design docs, such as `TripBrief` and `rejectPlaces()` ([domain model](design/domain-model.md), section 1).
- **Named exports only.** No default exports, except where a tool needs one, such as a config file.
- **No barrel files.** A barrel file is an `index.ts` that only re-exports other files. Import from the file that defines the thing.
- **Comments say why, not what.** The code says what it does. A comment explains a choice the code can't show, often by pointing to a design doc section.

---

## 4. Outside data is checked where it enters

**Zod is the one validation library.** Every place where data enters the program has a Zod schema and a parse call:

- **Tool inputs from the agents.** The Agent SDK defines custom tool inputs with Zod.
- **HTTP request bodies and query parameters,** from the browser.
- **Responses from Google and Open-Meteo.**
- **Rows read from Postgres,** including the plan document ([persistence design](design/persistence.md), section 2).
- **The Supabase sign-in token's contents,** after its signature is checked ([systems design](design/systems.md), section 3).
- **Environment variables,** parsed once when the app starts. A missing or bad value stops the app from starting.
- **The Agent SDK's hook inputs,** such as the tool inputs and replies the worker hooks record ([technical spec](design/technical-spec.md), 6.5).

**Types come from the schemas,** with `z.infer`, not declared a second time.

**Schemas for outside data go in files named `*.schema.ts`.** There, property names can be snake_case to match the outside data, such as Open-Meteo's `temperature_2m_max`. Each schema converts them to camelCase after parsing, so the rest of the code sees only camelCase. Other files allow camelCase only.

**A parse failure is an error the caller handles,** never a silent pass. Type assertions (`as SomeType`) aren't allowed on outside data. ESLint enforces this where it can.

A worker's result isn't on the list. Code builds it from the worker's recorded calls, as text the coordinator reads, and no free text from the worker is parsed (technical spec 6.5).

---

## 5. Tests

**Vitest runs the tests.** It shares Vite's setup with the front end, and runs TypeScript directly.

**Tests in `npm run check` make no outside calls.** Google, Open-Meteo, Supabase, Claude, and Postgres are replaced with fakes. So the check runs without the database, locally and in GitHub.

**Postgres is faked at the repositories,** the only code that sends SQL (section 8). Tests give the writers and readers fake repositories that keep rows in memory. What only the database can show, such as two writes waiting on the row lock, or a query's SQL, is checked by hand against the local Postgres. The PR says what was checked. This is a learning project with no staging server, so the risk that a later change breaks it unnoticed is accepted.

**When a check needs the deployed app, Claude Code signs in as its own user.** Its email and password are `SUPABASE_CLAUDE_EMAIL` and `SUPABASE_CLAUDE_PASSWORD` in the local `.env`. It signs in with Supabase's password sign-in, as the browser does, and sends the token it gets back with each `/api` request ([systems design](design/systems.md), section 3). Use it for what only the server can show, such as how the agents behave there. Checks that can run locally still run locally. The user's trips and memory are its own, so they don't mix with Joe's.

**A fix for a bug comes with a test that fails without the fix, and passes with it.** The test goes through the path where the bug was, not only the part the fix changed. Check it against the code without the fix. This applies to fixes for review findings too ([code review design](design/code-review.md), section 3.4).

**Each agent has a view file of what its model sees on every turn,** such as `src/agent/coordinator.view.md`. It holds the agent's model and effort, then its system prompt, built with the real `settings.json`, then each tool's name, description, and input JSON Schema, as an MCP client lists them. Those are the tools in the agent's definition (technical spec 6.5). A built-in tool, such as `Agent` or `WebSearch`, is listed by name only, since Claude Code writes its text. The coordinator's view also lists each worker type's description and tools, as the coordinator is told about them. So a PR's diff of the file is the change to what the model sees, with the numbers filled in. A note at its top says it leaves out the text Claude Code adds, such as the SDK's first line of every system prompt, and gives an example of each part ([research](research/agent-evaluations.md), section 2.9). It's a reminder for when an agent does something odd. Each turn's trace holds the commit of the code that ran, so the view files at that commit show what each agent was given ([systems design](design/systems.md), section 10). A test (`src/agent/agent-views.test.ts`) builds each view and fails, with the lines that differ, when it doesn't match the file. A change to anything an agent reads, or to a setting it shows, comes with its rewritten view file in the same commit. Run `npm run agent-views` to rewrite it. Each issue that adds an agent adds its view to the test.

**A run starts from any turn of a recorded session,** with `npm run run-turn` (persistence design, section 8.9). It gives the coordinator the conversation before that turn, as recorded, and the trip as it stood when the turn started. Then it runs that one turn on today's code, with the recorded message or a new one:

```sh
npm run run-turn -- <agent session ID> <turn> --recorded-message
npm run run-turn -- <agent session ID> <turn> --message "Can we add a night in Camden?"
```

- **It reads the session from the live database,** through an SSH tunnel to the server's Postgres. The local Postgres already has port 5432, so the tunnel uses another, such as `ssh -N -L 15432:127.0.0.1:5432 root@projects.jjk3.com`. The login is the server's `.env` values, in `LIVE_POSTGRES_PORT` (the tunnel's port), `LIVE_POSTGRES_USER`, `LIVE_POSTGRES_PASSWORD`, and `LIVE_POSTGRES_DB`. It writes nothing there.
- **The turn runs against the local database,** so the local Postgres needs to be up, and migrated. Bring up the Phoenix tunnel too (section 2), or the turn's trace is lost.
- **It prints the run's new user, trip, session, and agent session IDs,** each tool call, the turn's span ID, and the reply. A scorer reads what the turn saved from the local database by those IDs. Each run leaves its rows there.
- **The session needs a trip version for the turn,** with its user message. A session recorded before versions were saved needs `npm run rebuild-versions` first.

**A worker run starts the same way, with `npm run run-worker`** (#266). It runs one worker on its own, with no coordinator. The worker gets the worker brief the coordinator sent it, and the trip as the worker found it. That's the turn's trip version, with the turn's calls before the worker was sent replayed on it, since the coordinator often adds the very stops it sends the worker to fill. The calls are replayed as `npm run rebuild-versions` replays them. Then the worker runs on today's instructions and tools:

```sh
npm run run-worker -- <agent session ID> <Agent tool_use ID>
```

- **The tool_use ID is the coordinator's Agent call that started the worker.** In Phoenix, it's the `tool_call.id` on the Agent span above the worker's span.
- **It reads the live database and runs in the local one,** with the same tunnels and login as `npm run run-turn`.
- **The worker runs as the query's named agent,** as the coordinator does, so it gets its own definition's prompt, tools, and model. The worker hooks are left out. They build the result the coordinator reads, and send a worker back, up to 2 times, when it tries to end without `report_result`. So a worker run alone isn't sent back. The trace is a span named for the worker, such as `stay-researcher.turn`.
- **It prints each tool call and each refused call, then the run's test user, trip, and span ID,** the replay's counts, and how many candidate calls were refused. A call today's code replays differently shows in the replay's counts. When one does, the trip isn't quite what the worker found.
- **The candidate refusals evaluation runs it as a Phoenix experiment** (`npm run candidate-refusals`). Its cases are `evals/candidate-refusals/cases.json`, each recorded worker run that had a candidate call refused. Some cases are also in a Phoenix split, a label on the dataset's examples, so an experiment can run just those. `trial-1` is 3 cases, and `trial-2` is 12, the 3 in `trial-1` among them. A trial runs each of its cases once, to check the setup on a few runs before running them all: `npm run candidate-refusals -- experiment trial-1 1`. `visit-time` is the 25 cases that sent `visitTimeInMinutes` on a meal stop in at least one baseline run, and `no-route` is the one case where Google finds no driving route. A fix for one of those runs on its split, then on all. A new split goes in `cases.json`, and into the saved dataset with Phoenix's `POST /v1/datasets/candidate-refusals/splits`, which takes the split's name and its examples' IDs. The baseline runs every case 5 times, so a change can be told apart from the run-to-run differences: `-- experiment all 5`. Either way, 3 run at a time. Code scores the share of each run's candidate calls that were refused. A run that failed, such as on the Claude plan's limit, fails its task, and gets no score. The worker's spans go under each run's task span in the experiment's own trace, not in `road-trip-agent-local`.

**Tests that need the real agent run on their own,** outside `npm run check`. Examples: the acceptance scenarios (functional spec 11) and the memory tests (technical spec 3.1). They cost money and their results vary from run to run. How they run is settled when the first one is written.

**Agent evaluations run in Phoenix.** The first is the grounded evaluator (#282). It checks whether every fact in a coordinator reply came from a source the coordinator had. Its rubric is `evals/grounded/rubric.md`, and its code is in `src/grounded-eval/`, run with `npm run grounded -- <action>`. The header of `grounded.ts` lists the actions. The judge calls the Anthropic API with `JUDGE_API_KEY` from `.env`, which bills the API account, not the Claude plan. What it taught, for the evaluators that come after it:

- **To score new turns, run `npm run grounded -- judge-corpus`.** It judges every turn in the corpus once with the committed rubric, at about $0.007 a turn, and saves the labels as `grounded-haiku` annotations. The corpus is the sessions with a `corpus` session annotation. Phoenix's project page shows the grounded share by the day each turn ran.
- **A judge's prompt lives in the repo.** Each committed version is pushed to Phoenix as a prompt version, tagged with its commit (`push-prompt`). The code fills the prompt's slot itself, since Phoenix's own template filling turns a `$$` in the input into `$`.
- **A judge is tuned on a golden set,** a Phoenix dataset of turns with settled labels. Each prompt version gets an experiment (`experiment`). An experiment runs every example 3 times, since one run's score moves by about 2 turns in 60. Its description is the prompt commit's subject line, so write that subject to say what the version changed.
- **Change a dataset in place, never by deleting it.** Deleting a dataset deletes its experiments. The `golden` action updates only the changed examples, which makes a new dataset version. Each experiment is scored against the labels as they were when it ran, so after a label changes, score the versions again against today's labels to compare them.
- **Each judge's labels get their own annotation name.** Phoenix's project page sums up annotations by name only, not by who made them. The labelers and Joe share `grounded`, with an identifier each, and the judge has `grounded-haiku`.
- **Read the misses both ways, not just the score.** When one label is common, accuracy hides a lopsided judge. 42 of the 60 golden turns are not grounded, so a judge that flags every turn scores 70%. Count the false alarms and the misses apart. They also tell whether the judge's rate on the corpus runs high or low.

**The saving to the right place evaluation starts with Joe reading the turns** (#209). It asks whether what the coordinator saves goes to the right place: the trip brief, trip memory, or user memory. Before any rubric, Joe reads the corpus turns where the coordinator saved there, and writes a free note on each. `npm run saving -- turns` found them once, and wrote them to `evals/saving/turns.json` in sets of 10, mixed across sessions. `npm run saving -- review <set>` writes the set's reading page and notes file, in `~/tmp/road-trip-evals/saving/`. It needs both tunnels, to Phoenix and to the live database.

- **The page shows each turn as it happened,** with its saves marked, and the trip brief, memory, and whole itinerary as they stood when it started. Those come from the turn's trip version in the live database, shown as `read_trip_brief` and `read_itinerary` would show them on today's code.
- **A turn's version is found by the user's words, not by counting spans.** Phoenix can be missing a turn's trace, so its place among the session's spans can come before its version's turn. The page gives the version's turn number.
- **The notes file is never written over,** so a set's page can be rebuilt without losing Joe's notes.
- **A labeler reads each turn as the rubric's "What you're given" says,** built by `src/saving-eval/labeler-input.ts`: `<before>`, the trip as the reading page shows it; `<earlier_turns>`, with only each turn's user message and reply; and `<turn>`, with every call that went through and the saves numbered. Refused calls are left out, so a turn whose saves were all refused isn't labeled. `npm run saving -- inputs <set> ...` writes the inputs, to read what a labeler gets, in `~/tmp/road-trip-evals/saving/inputs/`.
- **`npm run saving -- label <labeler> <set> ...` writes the sets' inputs, then runs the labeler on them,** with the committed rubric, as the grounded evaluator's `label` does. `src/grounded-eval/labeling.ts` runs both evaluators' labelers. The answers stay in local JSON files, in `~/tmp/road-trip-evals/saving/labeling/<rubric commit>/`, through the pilot, since the batch may be relabeled. They go to Phoenix when the golden set is built. It says which answers don't have one entry for each save.
- **`npm run saving -- compare <labeler> <labeler> <set> ...` compares the two labelers' answers** on every save and every check that fits it, then each labeler with Joe's labels in `evals/saving/calibration.json`, on the sets that have them. It prints a count for each check, and each split. `calibration.json` holds the labels and notes in `evals/saving/calibration.md`, with each save numbered as the labeler input numbers it, so a change to one goes in the other too.
- **`npm run saving -- review <set> <labeler> ...` writes the set's page with each labeler's failures under each save,** as `set-03-labels.html`, for Joe to read every label on a set. On a calibration set, Joe's label and note are there too. A save where the labels don't agree on which checks fail is marked as a split, and so is its item's button. It writes no notes file.
- **`npm run saving -- check-versions` checks that each session's turns match trip versions that only go up.** A match can go wrong after a failed turn, or with two turns of the same words when a trace is missing.
- **`npm run saving -- golden` saves the golden set as the `saving-golden` dataset in Phoenix.** Each turn's input is its labeler input, which the judge reads too, and its output is each save's settled checks. A save's label is Joe's where he gave one: in `evals/saving/calibration.json` for sets 1 to 3, or in `evals/saving/split-calls.json` for the saves he called on the full labeling's splits. Otherwise it's the checks both labelers fail on the full labeling's rubric, `49b4a5c` (decision 19 in `evals/saving/decisions.md`). It stops if they split on a save Joe didn't call. The metadata says where each save's label came from. It updates the dataset in place, as the grounded evaluator's `golden` does. The labels aren't saved as span annotations, since the judge is checked against the dataset. The judge's own labels on the corpus can be annotations later.
- **The judge is Haiku through the API, tuned on `saving-golden`,** as the grounded evaluator's is. Its prompt is the rubric, pushed to Phoenix as `saving-judge` with `npm run saving -- push-prompt`. `npm run saving -- experiment` runs it on every golden turn 3 times. The judge code is shared with the grounded evaluator, in `src/grounded-eval/judge.ts` and `judge-prompt.ts`.
- **A run is scored save by save, on each check.** A miss is a check the label fails that the judge passed. A false alarm is a check the judge failed that the label passes. Phoenix scores each check on each run, and the action prints each check's misses and false alarms, and each save the judge got wrong, with how many of its runs. The report and the answers go in `~/tmp/road-trip-evals/saving/judge/`.
- **`npm run saving -- report [rubric commit]` writes the report again from Phoenix,** from the latest experiment on that commit, scored against the labels as they are now. Use it after a label changes, and when an experiment loses its Phoenix connection after its runs are saved, which happened at the end of every full run in #209.
- **`npm run saving -- try-judge <rubric file> <runs> <set.item> ...` tries a rubric change on a few turns,** from the file on disk, before it's committed. A change that fixes the turns it was aimed at can still move errors to other turns, so a full run decides.

---

## 6. Rules for Claude Code

- **The config files change only with Joe's approval.** That's `tsconfig*.json`, `eslint.config.*`, the Prettier config and ignore file, `.claude/settings.json`, and the hook scripts. Claude Code writes them during first setup. After that, if a change seems needed, stop, say why, and ask first. Never edit them, or add a disable comment or `@ts-expect-error`, just to make a check pass. Permission ask rules make Claude Code prompt Joe before each edit to these files.
- **After each edit to a `.ts` file, a hook runs Prettier and ESLint on it.** Errors come back right away, so fix them before moving on.
- **There's no hook at the end of a turn.** Many sessions only change design docs, and a full check after every turn would slow them down. The per-edit hook, the rule in section 1, and the pre-commit hook cover it.

---

## 7. Branches and pull requests

**`main` is protected.** Nothing is pushed to it directly. Every change goes on its own branch, and reaches `main` through a pull request. Only Joe decides when a pull request is merged: he merges it himself, or asks Claude Code to merge it. Claude Code never merges one without being asked. Asking for issues to be worked on autonomously counts as asking, for the PRs section 10's merge rule allows. A merge to `main` deploys it ([systems design](design/systems.md), section 7).

**A PR description holds the task, and nothing about how it was done.** It starts with the task, word for word, though filler words in a spoken request can be dropped. For an issue, that's its "Do" and "Done when" items, and `Closes #N`. Otherwise it's what Joe asked for. Then it lists each "Done when" item with its result, and what was checked by hand.

**Everything else goes in one PR comment, the decisions comment.** Post it right after the PR is opened. It holds:

- each decision made, and the design doc it was written into
- what was set aside, and where it was written down
- any config change that seems needed

A phase settled in the PR proposes its answers in this comment, and Joe agrees by approving the PR.

**Each PR that changes the app's code is reviewed in CI.** That's `src/` and `web/`. Other files, such as docs, plans, and the workflows, aren't. When such a PR is opened or gets a new commit, the "Code review" workflow runs our own reviewer, the `review-pr` skill, with Opus. It posts its findings as inline comments, each marked "fix", "note", or "check". Opening or pushing to a draft doesn't run it. The reviewer reads the description, so it knows what the change is for. It skips the comment, so the implementer's reasons don't color its review. The [code review design](design/code-review.md) covers the review, and which findings get fixed. Then the fix loop's fixer, the `fix-pr` skill, fixes the findings marked "fix", and its push starts the next review, for up to three fix rounds. When the loop stops, the PR gets the "ready for Joe" label (code review design section 4.6). The review doesn't block a merge. Handle the findings the loop leaves as the code review design section 3 says. Reply on each finding's thread from Joe's account, starting with the marker that says what was done with it, and then why (code review design section 3.6). The next review reads only what the marker means, never the reply, so it doesn't post the finding again (#93).

---

## 8. Objects and persistence in code

This section says how the [domain model](design/domain-model.md) and the [persistence design](design/persistence.md) look in TypeScript. Phase 10a set the pattern, and phase 10 added how `{viaService}` and `{keepsValue}` look. Later code follows it.

**Folders.** The trip's objects and services go in `src/domain/`. Repositories, writers, and readers go in `src/persistence/`, with memory items and sessions, since the persistence design defines those, not the domain model. Each ID comes from `newId()` in `src/ids/new-id.ts` (technical spec 7.1).

**An object's properties.** The example is a memory item (persistence design, section 8.8):

```ts
export class MemoryItem {
  readonly id: string;
  readonly userId: string;
  readonly tripId: string | null;
  readonly createdDateTime: Date;
  #text: string;

  get text(): string {
    return this.#text;
  }

  set text(value: string) {
    if (value.trim() === "") {
      throw new RuleError("A memory item's text can't be empty.");
    }
    this.#text = value;
  }
}
```

- **`{readOnly}` is TypeScript's `readonly`.** When the object's own operation changes the property, such as `Itinerary.replaceCheckResults()`, it's a private field with a getter instead.
- **A private field starts with `#`,** such as `#text`. Only code inside the class can reach it.
- **A property that can be set has a setter,** which runs the property's own rules. The constructor sets it through the setter too, so a new object can't break them. A property with no rules of its own is a plain field, such as the trip brief's `usualStartTime`, whose type is always a valid time.
- **`{viaService}`: the property has a getter and no setter.** Its change method sits on the object under the key `VIA_SERVICE` (`src/domain/via-service.ts`), and runs the object's own rules. A service calls it as `brief[VIA_SERVICE].setTripLengthInDays(days)`. TypeScript has no way to make a method usable only by code in one folder. So the key doesn't hide anything when the code runs. It only means a caller has to import `VIA_SERVICE`, and a test (`via-service.test.ts`) fails if any file outside `src/domain/` imports it. Example: the trip brief's `tripLengthInDays`, which `TripBriefService.setTripLength()` sets.
- **`{keepsValue}`: the getter returns the value or `null`, and the setter refuses `null` when it runs.** It calls `keptValue()`, or `keptText()` for text, from `src/domain/keeps-value.ts`. Text that's only spaces counts as empty. The setter has to take `null` too, since a lint rule makes a setter take whatever its getter returns, so the type checker can't refuse it. The constructor lets a stored `null` through with `startingValue()`, since that's how the property starts, and runs the setter's rule on any other value. Example: the trip brief's `focus`.
- **A broken rule throws `RuleError`** (`src/domain/rule-error.ts`). Its message is written for the agent, which reads it as the tool's error. It says what was refused and why, and gives the limit when there is one, such as "A trip is at most 14 days long."
- **A rule that needs a setting, or another object, is a business rule.** It goes in a service, or for memory and sessions in the writer, not in the setter (domain model, section 1). Example: the maximum memory item length.

**Repositories** are the only code that sends SQL (persistence design, section 8.7).

- **Each is created for one connection,** a `Queryable` (`src/persistence/queryable.ts`): the pool for a read, or a transaction's client for a write.
- **Each value goes into the SQL as a parameter,** such as `$1`, never joined into the text.
- **Rows come back as `unknown`.** Each repository parses them with a Zod schema in a `*.schema.ts` file, which turns the column names into camelCase (section 4). Then it builds the object.
- **Each repository's file exports an interface of its operations,** such as `MemoryStore`, and the class implements it. Writers and readers take the interface, so tests can pass a fake that keeps rows in memory (section 5).

**Writers and readers** are the only way in from outside persistence (persistence design, section 8).

- **Each is given the pool, and a function that makes its repository for a connection.** Tests pass a fake for both.
- **A writer runs each change in a transaction** with `inTransaction()` (`src/persistence/transaction.ts`). If anything throws, nothing is saved.

---

## 9. Tracking work

**Work is tracked in GitHub issues,** ordered in the [project](https://github.com/users/nimbusscale/projects/1). Each issue is one piece of work that ends in a PR or a decision. `plan/` is frozen. Read it only to look up an old phase or open item.

**To see the open work in roadmap order,** run this. It lists each item that isn't Done, with its status, issue number, and title, in the board's order. Then read the body of only the issue you need.

```sh
gh project item-list 1 --owner nimbusscale --format json --limit 200 \
  | jq -r '.items[] | select(.status != "Done") | [.status, .content.number, .content.title] | @tsv'
```

**Each item moves through these statuses:**

- **Triage:** new and not ordered yet. Anything Claude Code opens starts here.
- **Backlog:** Joe moves an item here and sets its place. The order of this column is the roadmap.
- **In progress:** Claude Code moves an item here when it starts the work.
- **In review:** Claude Code moves it here when the PR is opened, while the CI review and Joe give feedback.
- **Done:** the PR is merged and deployed.

**The issue body is the current task.** Its sections are Why, Design, Open questions, Do, Done when, Ends in, and Settled in. Why says, in a few sentences, what the work is for. Comments are for discussion. When a question is settled, strike it out in the body, add when and how, and write the answer into the design doc it belongs to, in the same PR. A reviewer reads the body, never the comments, for the same reason as with a PR's comments (section 7).

**An issue stands on its own.** Its reader may have only the repo and the issue, such as a Claude Code session with no chat history or memory. So the body:

- says why the work matters, in its Why section.
- defines any term that isn't defined in a design doc. Example: "act", if it's used for the findings that need something done.
- points only to things in the repo or on GitHub. It never points to chat, memory, or files on Joe's machine, such as files in the gitignored `scratch/`.
- says what's been decided, and where it's written down, such as a design doc section or a struck-out open question. Not "as discussed".

**The test:** could a new Claude Code session, with only the repo and the issue, build it the way it's meant? Check an issue against it when writing the issue, and when changing its body.

**"Settled in" says where answers are agreed.** "Chat" means propose each answer to Joe in chat first, and write it in once he agrees. "The PR" means propose each answer in the PR's decisions comment, and Joe agrees by approving the PR.

**Write down anything set aside right away.** The rule is in CLAUDE.md, since it applies in chat too, not only while writing code.

**Issues have no phase numbers,** since their order changes. Refer to other work by issue number. When an issue can't start until another is merged, link it as "blocked by", and say so in the body's first line, such as "**Starts** once #47 is merged."

---

## 10. Working on issues on your own

**Joe can ask for issues to be worked on without him,** such as "work autonomously on #197" or "use subagents to work autonomously on #197 and #199." The work follows this section from start to finish, so Joe doesn't have to explain it each time.

**First, check each issue for open questions.** If any issue has an open question that isn't struck out, tell Joe which ones, and ask whether to go through them before starting. Joe tries to settle every open question before the work starts, so one that's left was usually missed. Go through them as section 9 says, and as the issue's "Settled in" says.

**Then ask Joe every other question at once.** Read each issue, and the design docs it points to. Ask only what the docs and the issues don't answer. Also check whether one issue's PR changes what another one needs. Example: #199 added tools to the `trip` server, and until #197 merged, the coordinator would have been given them. After Joe answers, the work goes on with no more questions.

**Each issue gets its own branch, and with subagents, its own worktree.** If the Agent tool can't make a worktree, make one with `git worktree add`, and remove the branch's upstream, so a bare `git push` can't go to `main`. When one issue has to merge first, the later one does its work, but holds its PR until the earlier PR merges. Then it merges `main` into its branch and opens its PR.

**Decisions are made without Joe, even when the issue says "Settled in: chat."** Make the call that fits the design docs best. Write it into the design doc it belongs to, and list it with its reason in the PR's decisions comment (section 7). A config change still needs Joe (section 6). Note it in the decisions comment, and stop if the check can't pass without it.

**The implementer opens the PR, posts the decisions comment, and stops.** It doesn't act on the review, since the fix loop handles that (section 7). The session that started the work watches the loop.

**A PR is merged when the loop stops with nothing left for Joe.** That means it has the "ready for Joe" label, and every finding left is a note, or has a "Not fixed" or "Deferred" reply. If any finding is still marked "fix" or "check", or needs attention, the PR isn't merged, and Joe is told. The same goes for a PR that never gets the label. Merge with a merge commit, and don't wait for the deploy.

**When every PR is merged or held, report on all of them at once.** For each PR:

- each decision, and whether it should stand, with the reason
- each note the loop left, and whether it should be fixed
- what was set aside, and where it was written down
- why a PR was held, if it was

Don't change anything the report raises until Joe says what to change. Then those changes go in one PR. Once the report is sent, remove the worktrees and their branches.
