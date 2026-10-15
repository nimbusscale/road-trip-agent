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

**Tests in `npm run check` make no outside calls.** Google, Open-Meteo, Supabase, Claude, and Postgres are replaced with fakes. So the check runs without the database, locally and in GitHub.

**Postgres is faked at the repositories,** the only code that sends SQL (section 8). Tests give the writers and readers fake repositories that keep rows in memory. What only the database can show, such as two writes waiting on the row lock, or a query's SQL, is checked by hand against the local Postgres. The PR says what was checked. This is a learning project with no staging server, so the risk that a later change breaks it unnoticed is accepted.

**Tests that need the real agent run on their own,** outside `npm run check`. Examples: the acceptance scenarios (functional spec 11) and the memory tests (technical spec 3.1). They cost money and their results vary from run to run. How they run is settled when the first one is written.

---

## 6. Rules for Claude Code

- **The config files change only with Joe's approval.** That's `tsconfig*.json`, `eslint.config.*`, the Prettier config and ignore file, `.claude/settings.json`, and the hook scripts. Claude Code writes them during first setup. After that, if a change seems needed, stop, say why, and ask first. Never edit them, or add a disable comment or `@ts-expect-error`, just to make a check pass. Permission ask rules make Claude Code prompt Joe before each edit to these files.
- **After each edit to a `.ts` file, a hook runs Prettier and ESLint on it.** Errors come back right away, so fix them before moving on.
- **There's no hook at the end of a turn.** Many sessions only change design docs, and a full check after every turn would slow them down. The per-edit hook, the rule in section 1, and the pre-commit hook cover it.

---

## 7. Branches and pull requests

**`main` is protected.** Nothing is pushed to it directly. Every change goes on its own branch, and reaches `main` through a pull request. Only Joe decides when a pull request is merged: he merges it himself, or asks Claude Code to merge it. Claude Code never merges one without being asked. A merge to `main` deploys it ([systems design](design/systems.md), section 7).

---

## 8. Objects and persistence in code

This section says how the [domain model](design/domain-model.md) and the [persistence design](design/persistence.md) look in TypeScript. Phase 10a set the pattern, and later code follows it. Phase 10 adds how `{viaService}` and `{keepsValue}` look.

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
- **A property that can be set has a setter,** which runs the property's own rules. The constructor sets it through the setter too, so a new object can't break them.
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
