# Road Trip Planner: Development Plan

This document lists the development work, phase by phase, in the order it's done. How code is written and checked is in [DEVELOPMENT.md](../DEVELOPMENT.md). What the app does and how it's built is in [design/](../design/README.md).

Only phase 1 is written so far. The later phases are added when the plan is written in full.

---

## Phase 1. Set up the code checks

There's no code yet. This phase sets up the tools that check all later code ([DEVELOPMENT.md](../DEVELOPMENT.md), sections 1 to 6). Once it's done, the config files hold the exact settings, and this phase is a record of where they started. It isn't kept in step with later changes.

Set up the parts in order. Use current stable versions, and pin exact versions in `package.json`. Items marked **verify** need a check against current docs first. When done, report what was set up, anything that couldn't be set up as written, and the results of the checks at the end of this phase.

**Compiler,** in `tsconfig.json`:

- Set `strict: true` explicitly, so it's visible.
- Set `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noImplicitReturns`, and `noFallthroughCasesInSwitch` to `true`.

**Linter:**

- Use ESLint with a flat config, `eslint.config.mjs`.
- Turn on typescript-eslint's `strictTypeChecked` and `stylisticTypeChecked`, with typed linting on (`projectService: true`). Pin typescript-eslint to an exact version, since its strict configs can change in minor releases.
- Keep `no-floating-promises` and `no-misused-promises` on. They're in the preset, and are listed so nobody turns them off.
- Apply `eslint-config-prettier` last, so ESLint doesn't fight Prettier.
- Set `linterOptions.reportUnusedDisableDirectives: "error"`.
- Run `lint` with `--max-warnings 0`.
- Set typescript-eslint's `naming-convention` to the names in DEVELOPMENT.md section 3.
- Ban default exports with the core `no-restricted-exports` rule, except in config files (**verify** the option).

**Formatter:**

- Use Prettier with default options.
- Add a `.prettierignore` covering build output, coverage, and lockfiles.

**Outside data:**

- Add Zod, for the boundaries in DEVELOPMENT.md section 4.
- Set `@typescript-eslint/consistent-type-assertions` to ban `as` on outside data while still allowing `as const` (**verify** the option).

**Readability limits,** as core ESLint rules set to errors. They change only with Joe's approval.

| Rule | Starting value |
|---|---|
| `complexity` | 10 |
| `max-depth` | 3 |
| `max-lines-per-function` | 50, skipping blank lines and comments. Test files may go over |
| `max-params` | 4 |
| `max-lines` | 300 per file, skipping blank lines and comments |

**Escape hatch bans:**

- Set `@typescript-eslint/no-explicit-any` and `@typescript-eslint/no-non-null-assertion` to errors.
- Set `@typescript-eslint/ban-ts-comment` to ban `@ts-ignore` and `@ts-nocheck`, and to allow `@ts-expect-error` only with a description.
- Add `@eslint-community/eslint-plugin-eslint-comments`, with `require-description` and `no-unlimited-disable`.
- Ban barrel files with a lint plugin, if a maintained one exists (**verify**). Otherwise the rule in DEVELOPMENT.md section 3 stands alone.

**Scripts and hooks:**

- Add the scripts in DEVELOPMENT.md section 2, with `check` stopping at the first failure.
- Add a `PostToolUse` hook in `.claude/settings.json` on `Edit|Write`. For `.ts` files, it runs Prettier (writing) and ESLint on the changed file. It exits with code 2 and the errors on stderr, so Claude Code sees them.
- Add a pre-commit hook, with lefthook or husky, that runs `npm run check`.

**Config protection, set up last,** since it prompts on edits to the files above: add permission ask rules for Edit and Write on the files in DEVELOPMENT.md section 6. **Verify** whether ask rules still prompt in bypass-permissions mode.

**Done when** each of these is checked and passes:

- `npm run check` passes on the code as it is.
- Each of these planted failures makes `npm run check` fail, and is then removed:
  - An async call without `await`
  - A value typed `any`
  - `items[0].name` with no check for undefined
  - A function with 5 parameters
  - An `eslint-disable` comment with no description
  - A default export outside a config file
  - A badly formatted file
- An edit to `eslint.config.mjs` by Claude Code prompts Joe for approval.
- The per-edit hook reports a lint error right after an edit.
