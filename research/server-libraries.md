# Road Trip Planner: Database, Migration, and HTTP Libraries

> **This is a research document, not a design document.** It compares libraries for phase 4 of the [development plan](../plan/development-plan.md). The choices are written in the [persistence design](../design/persistence.md), section 1, and the [systems design](../design/systems.md), sections 4 and 7.

Phase 4 needs three libraries for the back end: one to send queries to Postgres, one to run migrations, and one to serve the API. This compares two or three options for each.

The versions, dates, and download counts are from the npm registry and GitHub on 2026-10-15. Downloads are per week. They show how widely a library is used, which matters here because more users means more examples to learn from.

---

## 1. What each library has to do

- **The database library** sends SQL to Postgres directly. It doesn't map each class to a table (persistence design, section 2). Later phases need transactions, a row lock with `SELECT ... FOR UPDATE` (persistence design, section 4), and a limit on how long a write waits for that lock. Every row read is parsed with Zod (DEVELOPMENT.md, section 4), so the library's own row types matter less.
- **The migration tool** runs from the `app` image before the new app starts (systems design, section 7). So it should run with what the image already has, record which migrations ran, and refuse to run twice at once.
- **The HTTP server library** checks request bodies with Zod, and streams the coordinator's reply with Server-Sent Events (systems design, section 4).

All three should be maintained, have TypeScript types, and be widely used.

---

## 2. The database library

| | node-postgres (`pg`) | postgres.js (`postgres`) | Kysely |
|---|---|---|---|
| Version | 8.23.1, 2026-09-30 | 3.4.9, 2026-04-05 | 0.29.6, 2026-09-16 |
| Downloads | 65 million | 22 million | 21 million |
| GitHub | 13,200 stars, last push 2026-10-01 | 8,700 stars, last push 2026-09-02 | 14,300 stars, last push 2026-10-15 |
| Types | `@types/pg`, kept in step with each release | Built in | Built in |
| A query | `pool.query("SELECT plan FROM trips WHERE id = $1", [id])` | `` sql`SELECT plan FROM trips WHERE id = ${id}` `` | `db.selectFrom("trips").select("plan").where("id", "=", id)` |

**node-postgres** is the standard Postgres driver for Node. It has the most users and the most examples. Values go in as numbered parameters, such as `$1`. A transaction takes one client from the pool, and runs `BEGIN`, the queries, and `COMMIT` on it. Rows come back loosely typed, which is fine here, since every row is parsed with Zod anyway. Its weak point: nothing stops code from building SQL by joining strings. That's left to code review.

**postgres.js** writes queries as tagged templates. Every value in `${}` becomes a parameter, so joining strings into SQL by accident isn't possible. It has its own types and is fast. It has one main maintainer, and releases are slower: three since May 2025, the last in April 2026. It would also be a second Postgres driver if the migration tool is node-pg-migrate, which uses node-postgres.

**Kysely** is a typed query builder, run on node-postgres or postgres.js. It isn't an ORM. But it needs each table's columns declared as TypeScript types, and our types come from the Zod schemas (DEVELOPMENT.md, section 4). That's the same shapes declared twice. Most of a trip is one JSON document (persistence design, section 2), where a query builder adds little.

Drizzle isn't compared. It defines each table in code and maps to it, which persistence design section 2 rules out.

**This points to node-postgres.** It's the most used and the most documented, and it shares a driver with the migration tool. The safety of postgres.js's templates is real. But most SQL will be in the repositories (persistence design, section 8.7), a few files that are easy to review for values joined into SQL text.

---

## 3. The migration tool

| | node-pg-migrate | dbmate | Kysely's `Migrator` |
|---|---|---|---|
| Version | 9.0.0, 2026-07-17 | 2.36.0, 2026-09-19 | Part of Kysely |
| Downloads | 880,000 | 295,000 on npm. Also a Go binary, Homebrew, and a Docker image | Part of Kysely |
| GitHub | 1,500 stars, last push 2026-10-15 | 7,500 stars, last push 2026-10-14 | See Kysely |
| Migrations are | SQL files, or TypeScript | SQL files | TypeScript, using the query builder |
| Runs as | Node code, called from our script, or its own command | A Go binary | Node code, called from our script |

**node-pg-migrate** runs SQL files marked `-- Up Migration`. It can be called from our own code with `runner()`, so it connects with the same parsed environment as the app. Nothing extra goes in the image. It records each run in a `pgmigrations` table, and holds a Postgres advisory lock while it runs, so a second run at the same time fails instead of running the same migration twice. It uses node-postgres.

**dbmate** runs SQL files too, and is simple and language-neutral. It's a separate Go binary, which the npm package installs for each platform. It reads its own `DATABASE_URL` variable, so the connection details would be set up twice: once for the app, and once for dbmate.

**Kysely's `Migrator`** only makes sense with Kysely as the database library.

**This points to node-pg-migrate.** It runs from the app's own code in the app image, with no second binary and no second copy of the connection details.

---

## 4. The HTTP server library

| | Hono | Fastify | Express |
|---|---|---|---|
| Version | 4.13.13, 2026-10-04 | 5.12.7, 2026-10-13 | 5.3.0, 2026-10-09 |
| Downloads | 74 million | 15 million | 145 million |
| GitHub | 32,500 stars, last push 2026-10-15 | 37,300 stars, last push 2026-10-15 | 69,600 stars, last push 2026-10-09 |
| Types | Written in TypeScript | Bundled | `@types/express` |
| Zod checks on request bodies | `@hono/zod-validator`, from Hono's own middleware repo | `fastify-type-provider-zod`, from a third party. It lists Fastify's Swagger plugin as a required peer | None. Each handler calls the schema itself |
| Server-Sent Events | Built in: `streamSSE` | `@fastify/sse` 0.6.1, still before 1.0. Or written by hand | Written by hand |
| Tests without a server | `app.request()` | `app.inject()` | Needs a library such as supertest |
| On Node | Through `@hono/node-server` 2.1.5 | Built for Node | Built for Node |

**Hono** has both things the API needs built in or in its own repo: Zod checks and Server-Sent Events. It's written in TypeScript, so a route's types flow through. It uses the web standard `Request` and `Response`. Its downloads are high partly because other tools use it inside them. Two things to know for phase 14, from Hono's streaming docs: if the streaming callback throws, Hono's `onError` handler isn't called, so the callback handles its own errors. And the stream should only pass on the turn's messages: the turn itself must keep running when the browser disconnects (systems design, section 4).

**Fastify** is the most proven for heavy traffic on Node, which this app doesn't need. Zod checks come from a third-party package, and its Server-Sent Events plugin isn't at 1.0 yet.

**Express** is the most used, and the most familiar. But it has neither Zod checks nor Server-Sent Events, so both would be our own code. Its types are written separately from the code.

**This points to Hono.** It covers both needs with the least of our own code, and its types are the strongest of the three.

---

## 5. Sources

- npm registry: `npm view <package> time`, and the npm downloads API, on 2026-10-15.
- GitHub's API, for stars and last push, on 2026-10-15.
- [node-pg-migrate API docs](https://salsita.github.io/node-pg-migrate/api), and its migration templates in the 9.0.0 package.
- [Hono streaming helper docs](https://hono.dev/docs/helpers/streaming).
