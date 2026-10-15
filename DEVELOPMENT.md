# Road Trip Planner: Development

This document covers how the code is written, checked, and tested. Read it before writing or changing code. What the app does and how it's built is in [design/](design/README.md). How to run it locally, and how it's deployed, is in the [systems design](design/systems.md). The order of the development work, starting with setting up the tools below, is in the [development plan](plan/development-plan.md).

Claude Code writes the code, Joe reviews the code he cares about, and the tools enforce the baseline for all of it. The tools catch what they can. This document covers the rest.

---

## 1. The one check

**`npm run check` runs every check, in this order:** `format:check`, `typecheck`, `lint`, then `test`. It stops at the first failure.

**Work is done only when `npm run check` passes.** A pre-commit hook runs it too, so a failing change can't be committed.

---

## 2. Commands

| Command | Does |
|---|---|
| `npm run dev` | Runs the app and the front end locally ([systems design](design/systems.md), section 6) |
| `npm run migrate` | Runs the database migrations that haven't run yet ([persistence design](design/persistence.md), section 1) |
| `npm run ask-claude` | Sends Claude one question through the Agent SDK, on the plan's token, and prints the reply. Dev only. A question can follow, as in `npm run ask-claude -- "your question"` |
| `npm run build` | Builds the app into `dist/app` and the front end into `dist/web`, as the images do |
| `npm run check` | Runs every check below, stopping at the first failure |
| `npm run format` | Formats every file with Prettier |
| `npm run format:check` | Fails if any file isn't formatted |
| `npm run typecheck` | Type-checks with `tsc --noEmit` |
| `npm run lint` | Runs ESLint, failing on any warning |
| `npm run test` | Runs the tests with Vitest |

Postgres for local development runs in a container, with Docker Compose: `docker compose up -d postgres` ([systems design](design/systems.md), section 6). Copy `.env.example` to `.env` and fill it in first.

---

## 3. Style

**Style comes from the tools and the rules below.** The rules follow the [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html), and cover what the tools can't check. There's no need to read the guide itself.

- **Prettier formats all the code,** with its default options. Don't format by hand. Markdown docs are written by hand, and Prettier skips them.
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

**Types come from the schemas,** with `z.infer`, not declared a second time.

**Schemas for outside data go in files named `*.schema.ts`.** There, property names can be snake_case to match the outside data, such as Open-Meteo's `temperature_2m_max`. Each schema converts them to camelCase after parsing, so the rest of the code sees only camelCase. Other files allow camelCase only.

**A parse failure is an error the caller handles,** never a silent pass. Type assertions (`as SomeType`) aren't allowed on outside data. ESLint enforces this where it can.

Worker results aren't on the list. A worker returns text that the coordinator reads, not data our code parses ([technical spec](design/technical-spec.md), section 1).

---

## 5. Tests

**Vitest runs the tests.** It shares Vite's setup with the front end, and runs TypeScript directly.

**Tests in `npm run check` make no outside calls.** Google, Open-Meteo, Supabase, and Claude are replaced with fakes. Postgres is the local container.

**Tests that need the real agent run on their own,** outside `npm run check`. Examples: the acceptance scenarios (functional spec 11) and the memory tests (technical spec 3.1). They cost money and their results vary from run to run. How they run is settled when the first one is written.

---

## 6. Rules for Claude Code

- **The config files change only with Joe's approval.** That's `tsconfig*.json`, `eslint.config.*`, the Prettier config and ignore file, `.claude/settings.json`, and the hook scripts. Claude Code writes them during first setup. After that, if a change seems needed, stop, say why, and ask first. Never edit them, or add a disable comment or `@ts-expect-error`, just to make a check pass. Permission ask rules make Claude Code prompt Joe before each edit to these files.
- **After each edit to a `.ts` file, a hook runs Prettier and ESLint on it.** Errors come back right away, so fix them before moving on.
- **There's no hook at the end of a turn.** Many sessions only change design docs, and a full check after every turn would slow them down. The per-edit hook, the rule in section 1, and the pre-commit hook cover it.

---

## 7. Branches and pull requests

**`main` is protected.** Nothing is pushed to it directly. Every change goes on its own branch, and reaches `main` through a pull request. Only Joe decides when a pull request is merged: he merges it himself, or asks Claude Code to merge it. Claude Code never merges one without being asked. A merge to `main` deploys it ([systems design](design/systems.md), section 7).
