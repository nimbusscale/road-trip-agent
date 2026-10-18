# Road Trip Planner: Development Plan

This document lists the development work, phase by phase, in the order it's done. How code is written and checked is in [DEVELOPMENT.md](../DEVELOPMENT.md). What the app does and how it's built is in [design/](../design/README.md). What's still open with no phase to settle it is in the [open items](open-items.md).

**The goal.** At the end of this plan, the app can plan the two example trips in the [domain model](../design/domain-model.md), section 5: San Francisco to Los Angeles, and Grand Junction to Salt Lake City through Moab. A simulated user and Joe each walk both trips through the live app, the way the design walk-throughs did on paper.

**Phase 1, setting up the code checks, is done** (commit 067bfd4). It's no longer listed. The phases below start at 2, so "phase 1" in the git history still means the code checks.

---

## How the phases work

- **Each phase is done on its own branch, and ends in a PR or a decision.** `main` is protected, so nothing is pushed to it directly ([DEVELOPMENT.md](../DEVELOPMENT.md), section 7). A PR is ready when `npm run check` passes and the phase's "Done when" items are checked. Joe merges it, or asks Claude Code to. Once phase 6 is done, a merge to `main` deploys.
- **Run the "Done when" checks yourself,** and report each result in the PR description. The description holds only the task and these results. Decisions go in a PR comment ([DEVELOPMENT.md](../DEVELOPMENT.md), section 7).
- **Mark the phase done in its own PR.** Fill in its row of the table below with the date and the PR, such as "2026-10-15, PR #2". Use the date the PR is opened.
- **Some steps need Joe,** such as creating keys in a console. The phase says so.
- **Some phases list open questions,** after the design sections. Answering them is part of the phase. Each answer is written into the design doc it belongs to, in the same PR.
- **A phase settles its questions and choices in chat or in the PR.** A phase that says "Settled in: the PR" proposes each answer in the PR's decisions comment ([DEVELOPMENT.md](../DEVELOPMENT.md), section 7), and Joe agrees by approving the PR. Otherwise, propose each answer to Joe in chat first, and write it in once he agrees.
- **Some phases run in parallel,** in batches. Claude Code coordinates, and a worker agent does each phase on its own branch. Batch 1 is phases 4 and 5. Batch 2 is phases 6 and 7, and starts once phase 4 is merged. Batch 3 is phases 10, 11, and 12, and starts once phase 10a is merged. Its PRs are merged in that order, since the migrations have to run in order (phase 10a). Batch 4 is phases 15 to 20, done one at a time overnight, before phase 13, on a `development` branch. [Batch 4](batch-4.md) says how.
- **When something new comes up,** such as an idea, a test, or a question, write it down right away. If a phase will deal with it, add it to that phase's open questions. If not, add it to the [open items](open-items.md).
- **Tests in `npm run check` use fakes** for Google, Open-Meteo, Supabase, Claude, and Postgres ([DEVELOPMENT.md](../DEVELOPMENT.md), section 5). Some phases also make a few real calls, or check the database by hand. Those are listed in "Done when."
- **The thin slice comes early.** Phases 10 to 14 build a small app that works end to end: Joe signs in on the live site and talks with the coordinator about the trip brief and memory. The riskiest parts get tested early: the Max plan on the server, streaming replies, and saved transcripts. The rest of the tools come after. The itinerary code, phases 15 to 20, was moved ahead of phase 13 on 2026-10-15, so work on the agents can start with the domain finished.

| Phase | What it builds | Done |
|---|---|---|
| **Running the app** | | |
| 2 | Create the Google keys | 2026-10-15, [PR #2](https://github.com/nimbusscale/road-trip-agent/pull/2) |
| 3 | Combined with phase 4 | |
| 4 | Choose the libraries, and run the app locally | 2026-10-15, [PR #6](https://github.com/nimbusscale/road-trip-agent/pull/6) |
| 5 | Prepare the server | 2026-10-15, no PR |
| 6 | Deploy on merge | 2026-10-15, [PR #9](https://github.com/nimbusscale/road-trip-agent/pull/9) |
| 7 | Back up the database nightly | 2026-10-15, [PR #8](https://github.com/nimbusscale/road-trip-agent/pull/8) |
| 8 | Sign in | 2026-10-15, [PR #12](https://github.com/nimbusscale/road-trip-agent/pull/12) |
| 9 | Run the Agent SDK on the server | 2026-10-15, [PR #14](https://github.com/nimbusscale/road-trip-agent/pull/14) |
| **The thin slice** | | |
| 10a | The shared start for phases 10 to 12 | 2026-10-15, [PR #17](https://github.com/nimbusscale/road-trip-agent/pull/17) |
| 10 | The trip, and saving it | 2026-10-15, [PR #25](https://github.com/nimbusscale/road-trip-agent/pull/25) |
| 11 | Store memory | 2026-10-15, [PR #20](https://github.com/nimbusscale/road-trip-agent/pull/20) |
| 12 | Store sessions and transcripts | 2026-10-15, [PR #23](https://github.com/nimbusscale/road-trip-agent/pull/23) |
| 12a | Put phases 10 to 12 together | 2026-10-15, [PR #26](https://github.com/nimbusscale/road-trip-agent/pull/26) |
| 13 | The first coordinator, done in 13a to 13c | |
| 13a | The trip server | |
| 13b | The memory server | |
| 13c | The coordinator in the terminal | |
| 14 | Chat in the browser | |
| **Agent evaluations** | | |
| 14a | Agent evaluations | |
| **The itinerary** | | |
| 15 | Places | 2026-10-15, [PR #30](https://github.com/nimbusscale/road-trip-agent/pull/30) |
| 16 | The itinerary's objects | 2026-10-15, [PR #31](https://github.com/nimbusscale/road-trip-agent/pull/31) |
| 17 | The calendar and the day's schedule | 2026-10-15, [PR #32](https://github.com/nimbusscale/road-trip-agent/pull/32) |
| 18 | The services | 2026-10-15, [PR #33](https://github.com/nimbusscale/road-trip-agent/pull/33) |
| 19 | Legs | 2026-10-15, [PR #34](https://github.com/nimbusscale/road-trip-agent/pull/34) |
| 20 | Feasibility checks | 2026-10-15, [PR #35](https://github.com/nimbusscale/road-trip-agent/pull/35) |
| **Planning in chat** | | |
| 21 | Read the itinerary | |
| 22 | Build the skeleton | |
| 23 | Lay out days | |
| 24 | The itinerary view | |
| 25 | The map | |
| **Workers** | | |
| 26 | Place searches | |
| 27 | The stay researcher | |
| 28 | The leg scout | |
| 29 | Option cards | |
| 30 | Weather data | |
| 31 | The weather worker | |
| 32 | Finish the coordinator's instructions | |
| **Walk-throughs** | | |
| 33 | The simulated user | |
| 34 | Walk the San Francisco trip | |
| 35 | Walk the Moab trip | |
| 36 | Acceptance scenarios and memory tests | |

---

## Running the app

By the end of this part, an empty app runs on `roadtrip.jjk3.com`, deploys on each merge, backs up its database, and knows who is signed in. It can also call Claude from the server.

### Phase 2. Create the Google keys

**Design:** [Google design](../design/data-sources/google.md), sections 1 and 5. [Systems design](../design/systems.md), section 8.

**Do:**

- Joe creates two keys in the Google Cloud console. The server key is restricted to the Routes, Places (New), and Weather APIs. The browser key is restricted to the Maps JavaScript API, and to these addresses: `https://roadtrip.jjk3.com/*`, `http://localhost:5173/*` for `npm run dev`, and `https://localhost/*` for the whole stack run locally.
- Joe confirms the $100 budget alert is set.
- Put both keys in the local `.env` file, as `GOOGLE_MAPS_SERVER_KEY` and `VITE_GOOGLE_MAPS_BROWSER_KEY` ([Google design](../design/data-sources/google.md), section 1). **2026-10-15:** Joe also put both keys in the server's `.env` file.
- Add `.env.example`, listing every variable the app reads, with no values. Later phases add to it.

**Done when:**

- A call to each of Routes, Places Text Search, and Weather with the server key returns data.
- A call with the server key to an API outside its list, such as Geocoding, is refused.

**Ends in:** a PR adding `.env.example`.

### Phase 3. Combined with phase 4

Choosing the libraries is now part of phase 4, since running the app needs all three choices.

### Phase 4. Choose the libraries, and run the app locally

**Design:** [Persistence design](../design/persistence.md), sections 1 and 2. [Systems design](../design/systems.md), sections 2, 4, 6, and 7. [DEVELOPMENT.md](../DEVELOPMENT.md), section 4. [Technical spec](../design/technical-spec.md), section 10.

**Settled in:** the PR.

**Do:**

- Compare two or three options for each of these:
  - **The database library.** It sends queries to Postgres directly, rather than mapping each class to a table (persistence design, section 2).
  - **The migration tool.** It runs from the `app` image before the new app starts (systems design, section 7).
  - **The HTTP server library** for the API. It needs Zod checks on request bodies, and Server-Sent Events for streaming replies.
- Write the comparison in `research/`. Pick one of each, write the choices into the persistence and systems designs, and explain them in the PR description.
- Add the Docker Compose file, with `postgres`, `app`, and `web`. Postgres uses the standard image, keeps its data on a volume, and is reachable from the host but not from outside it.
- Add the app's entry point. It parses the environment variables with Zod once, and loads the settings file in technical spec section 10, also with Zod. A missing or bad value stops the app from starting.
- Add the migration tool and a first migration, with an npm script to run them.
- Add `GET /api/health`, which reports whether the app can reach the database.
- Add the front end, with React, TypeScript, and Vite. For now it's one page that calls `/api/health` and shows the result.
- Make `npm run dev` start the app and the front end. Vite passes `/api` to the app.
- Add a Dockerfile for `app`, and one for `web`: Caddy with the front end's built files. Caddy passes `/api` to `app`, and reads its site name from the environment.
- Add the front end's own TypeScript and lint settings. Match the strictness and style of the existing config files, and explain the settings in the PR description. Approving the PR is Joe's approval for these config files ([DEVELOPMENT.md](../DEVELOPMENT.md), section 6). The rest of that rule still holds: never loosen a setting just to make a check pass.

**Done when:**

- With Postgres running in its container, `npm run dev` starts the app and the front end, and the page in the browser says the API and database are reachable.
- With Postgres stopped, the health check reports the database can't be reached.
- With a required variable removed from `.env`, the app refuses to start, and the message names the variable. The same goes for a bad value in the settings file.
- With `docker compose up`, `https://localhost` shows the same page, served by Caddy.
- `app` can't be reached from the host directly, only through Caddy.
- `npm run lint` checks the front end's files.
- Tests cover the parsing of the environment and the settings.
- The comparison is in `research/`, and the choices are written into the persistence and systems designs.

**Ends in:** a PR with the comparison, the doc changes, and the code.

### Phase 5. Prepare the server

The server already exists, with Ubuntu, and so do its DNS records: `projects.jjk3.com` points at it, and `roadtrip.jjk3.com` is a CNAME to that. Today it's reached with `ssh root@projects.jjk3.com`. This phase gets it ready for deploys.

**Design:** [Systems design](../design/systems.md), sections 2, 7, and 8.

**Do:**

- Confirm the server runs Ubuntu with 2 vCPUs and 4 GB of memory.
- Install Docker and the Compose plugin. Create the user that runs the containers.
- Open only ports 22, 80, and 443 to the internet. Check this from outside the server: Docker's published ports can get around `ufw`.
- Make the production `.env` file, readable only by the container user. Later phases fill in its values.
- Make an SSH key for deploys. Add the server's address and the key to the GitHub repo's secrets.

**Done when:**

- `dig roadtrip.jjk3.com` resolves to the server.
- A port scan from outside shows only 22, 80, and 443 open.
- The deploy key can sign in over SSH as the container user, and run `docker ps`.
- The `.env` file's permissions are `600`, owned by the container user.

**Ends in:** a ready server. No PR.

### Phase 6. Deploy on merge

**Design:** [Systems design](../design/systems.md), sections 7 and 8.

**Settled in:** the PR.

**Starts** once phase 4 is merged. The PR is merged once phase 5 is done, since the merge deploys to the server.

**Open questions:**

- ~~Should the container images be private? If so, how does the server sign in to pull them?~~ **Answered 2026-10-15, in this phase's PR:** private. Each deploy signs the server in with the workflow's own short-lived token. Written into systems design section 8.

**Do:**

- Add the GitHub Actions workflow. On a push to `main`, it runs `npm run check`, builds the `app` and `web` images, and pushes them to GitHub's container registry. Then it connects to the server over SSH, pulls the images, runs the migrations from the new `app` image, and restarts the containers.

**What phase 5 set up:**

- **Signing in.** The containers run as the user `roadtrip`, in the `docker` group. The repo's secrets are `DEPLOY_HOST` (`projects.jjk3.com`), `DEPLOY_USER`, `DEPLOY_SSH_KEY`, and `DEPLOY_KNOWN_HOSTS`. Connect by host name, not IP address, since the known hosts entries only cover the name.
- **Where to deploy.** Run Compose from `/home/roadtrip/road-trip-agent`, so it picks up the `.env` file there.
- **The firewall.** `ufw` allows 22, 80, and 443 (TCP, and UDP for HTTP/3). Rules in Docker's `DOCKER-USER` chain, at the end of `/etc/ufw/after.rules`, stop published container ports from getting around it. Keep Docker's default firewall mode: its nftables mode drops that chain.
- **Postgres** is published as `127.0.0.1:5432:5432`, so only the server itself reaches it.

**Done when:**

- Merging this phase's PR deploys it.
- `https://roadtrip.jjk3.com` shows the page, with a valid certificate, and says the API and database are reachable.
- The workflow's log shows the migrations ran before the containers restarted.
- The workflow doesn't build or deploy when `npm run check` fails.

**Ends in:** a PR. The merge is the test.

### Phase 7. Back up the database nightly

**Design:** [Systems design](../design/systems.md), sections 8 and 9.

**Settled in:** the PR.

**Starts** once phase 4 is merged. Test the backup against the local Postgres first. It reaches the server through the phase 6 deploy.

**Open questions:**

- ~~How many days of backups should be kept?~~ **Closed 2026-10-15:** 3 days, agreed in chat. This phase's PR writes it into systems design section 9.

**Do:**

- Add a script that dumps the database, copies the dump to the Spaces bucket, and removes dumps older than 3 days. The bucket is `jjk3-backups`, in the `nyc3` region, at `https://nyc3.digitaloceanspaces.com`.
- Run it every night in a `backup` Compose service, with its own image, in the `production` profile. Nothing is installed on the server outside Docker, such as a crontab, so `docker compose down` stops it with everything else. Have the phase 6 deploy build, push, and start the image too.
- ~~Put the Spaces access key and `COMPOSE_PROFILES=production` in the server's `.env` file. The local `.env` has the key as `SPACES_ACCESS_KEY_ID` and `SPACES_SECRET_ACCESS_KEY`.~~ **Done 2026-10-15:** Joe added both.

**What phase 5 set up:** the server has Docker and Compose, and no S3 upload tool. Run one in the backup image.

**Done when:**

- After one run, the dump is in the Spaces bucket.
- The dump loads into a new, empty Postgres, and has the same tables.
- A test dump dated past the limit is removed by the next run.

**Ends in:** a PR with the script, and the number of days written into systems design section 9.

### Phase 8. Sign in

**Design:** [Systems design](../design/systems.md), sections 3, 4, and 8. [Functional spec](../design/functional-spec.md), section 3. [DEVELOPMENT.md](../DEVELOPMENT.md), section 4.

**Open questions:**

- ~~How does the app get the Supabase project's public signing keys, and how often does it refresh them?~~ **Closed 2026-10-15,** agreed in chat: the project signs tokens with an asymmetric key, `ECC (P-256)`, so the app needs no secret. It downloads the public keys from `<project URL>/auth/v1/.well-known/jwks.json` and keeps them in memory. It downloads them again only when a token names a key it hasn't seen, such as after a key rotation, with a limit on how often. A library such as `jose` does this. The app reads the project URL from `SUPABASE_URL`, kept apart from the front end's `VITE_SUPABASE_URL`. Joe added it to the local `.env`. The server's `.env` still needs it. This phase's PR writes it into systems design section 3.
- ~~How does the `web` image get the Supabase project's address and browser key? Vite builds them into the front end's files, and the image is built in GitHub Actions, which has no `.env` (systems design section 7). Phase 25 asks the same about Google's browser key, so answer both here. One option is GitHub repo variables, passed to the image build as build arguments. Raised in phase 6.~~ **Closed 2026-10-15,** agreed in chat: GitHub repo variables, passed to the `web` image build as build arguments. The values aren't secret, since they end up in the front end's files, but they stay out of the repo so Google and GitHub don't flag the key as exposed. Joe sets `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and `VITE_GOOGLE_MAPS_BROWSER_KEY` in GitHub, and the same names go in the local `.env`. This phase's PR writes it into systems design section 7.

**Do:**

- ~~Joe confirms the Supabase project has sign-up turned off and email sign-in on. He adds his own user, and a second test user for isolation tests.~~ **Done 2026-10-15:** sign-up is off. Joe added `joe@jjk3.com` and `test@jjk3.com` by hand, set their passwords, and confirmed them. New users can only be added this way.
- Add a sign-in page and sign-out to the front end, with Supabase's JavaScript library. The front end sends the token with each `/api` request.
- In the app, check each token's signature with the Supabase project's public signing keys, and parse its contents with Zod. Refuse a request with no valid token.
- Add `GET /api/me`, which returns the signed-in user's ID.

**Done when:**

- On the live site, Joe signs in and the page shows his user ID. Sign-out returns to the sign-in page.
- A request with no token, or with a changed token, gets a 401.
- Tests use tokens signed with a test key, not Supabase.

**Ends in:** a PR.

### Phase 9. Run the Agent SDK on the server

How the server signs in to the Claude Max plan is still open. This phase settles it.

**Design:** [Systems design](../design/systems.md), sections 2, 5, and 8.

**What Joe tried before:** in an earlier proof of concept, the app's container had Claude Code in it, and `CLAUDE_CONFIG_DIR` pointed at a mounted volume. Joe ran `claude` in the container once and did `/login`, and the login was saved to that volume. Later runs of the SDK used it. The setup is described in `/home/jjk3/PycharmProjects/personal/agentic-study/container/README.md`, outside this repo. It's one option to try. Check it against Anthropic's current docs.

**Before starting**:

- Joe does the sign-in himself, since it opens a browser. That's `/login` in the container, as in his proof of concept, or `claude setup-token`, which makes a long-lived token.
- Joe checks that paid use past the plan's limits is off. It's a setting in his Claude account.
- Auto mode may block changes on the server, such as editing `.env` or running the script in the `app` container. If it does, ask Joe to approve the step or do it himself.

**Do:**

- Find out, from Anthropic's current docs, how a server signs in to a Max plan for the Agent SDK. Try the options that look right.
- Confirm that paid use past the plan's limits is turned off.
- Add the Agent SDK, and a dev-only script that sends Claude one question and prints the reply.
- Put the credential in the local and server `.env` files.
- Propose the answer to Joe, and write it into systems design section 8.

**Done when:**

- The script, run inside the `app` container on the server, prints Claude's reply.
- The script works locally too.
- The memory used by one SDK session's Claude Code process is measured and noted in the PR. Systems design section 2 expects a few hundred MB.

**Ends in:** a PR.

---

## The thin slice

Phases 10, 11, and 12 are built at the same time, by three workers. Phase 10a first does what all three need. Phase 12a then puts them together. The two lettered phases were added later, so the other phases keep their numbers.

### Phase 10a. The shared start for phases 10 to 12

**Design:** [Technical spec](../design/technical-spec.md), section 7.1. [Domain model](../design/domain-model.md), section 1. [Persistence design](../design/persistence.md), sections 1, 2, and 8.7. [DEVELOPMENT.md](../DEVELOPMENT.md), sections 4 and 5.

**Open questions:**

- ~~How do tests reach Postgres, locally and in the workflow's check?~~ **Closed 2026-10-15,** agreed in chat: they don't. Tests in `npm run check` fake the repositories, the only code that sends SQL. What only the database can show, such as the row lock, is checked by hand against the local Postgres, and the PR reports it. This is a learning project with no staging server, so the risk is accepted. This phase's PR writes it into DEVELOPMENT.md section 5.
- ~~How does `{readOnly}` look in code? How are a repository, a writer, and a reader shaped, and how does a row read back get parsed? Show Joe a small example before going on. Phases 10 to 12 follow it.~~ **Closed 2026-10-15,** agreed in chat: `{readOnly}` is TypeScript's `readonly`, or a private field with a getter when the object's own operation changes it. A property that can be set has a setter that runs its rules. A refusal throws `RuleError`. Repositories take one connection, and parse rows with Zod. This phase's PR writes it into DEVELOPMENT.md.

**Do:**

- Add the ID maker: a prefix for the kind of item, then 8 random letters and digits, leaving out ones that are easy to confuse (technical spec 7.1).
- Add the trips table, in migration `0002`: the trip's ID, its owner, and the plan as one JSON document. The migrations run in file-name order, and a deploy refuses one that comes before a migration that already ran. So each phase of batch 3 gets its own number: `0003` for phase 10, if it changes the trips table, `0004` for phase 11, and `0005` for phase 12.
- Add `RuleError`, and a helper that runs a function in a transaction, for the writers.
- Write the pattern into DEVELOPMENT.md, and say in section 5 that tests fake Postgres.

**Done when:**

- Tests show each ID has its prefix, 8 characters after it, and none of the left-out ones.
- `npm run migrate` adds the trips table to the local Postgres.
- The pattern is written down.

**Ends in:** a PR.

By the end of this part, Joe can sign in on the live site, start a trip, and talk it over with the coordinator. The coordinator fills in the trip brief, and remembers preferences across trips. It has no itinerary yet.

### Phase 10. The trip, and saving it

**Design:** [Technical spec](../design/technical-spec.md), section 7.1. [Domain model](../design/domain-model.md), sections 1, 3.1, 3.2, and 4.2. [Persistence design](../design/persistence.md), sections 1 to 5, 8.1 to 8.4, and 8.7.

**Open questions:**

- How does the home screen get each trip's name, dates, and last updated: from the plan document, or from extra columns?
- How long does a write wait for the row lock before it's refused as "trip busy"?

**Do:**

- Settle how the other two markers look in code: `{viaService}` and `{keepsValue}`. Phase 10a settled `{readOnly}`. Every later object follows the same pattern, so show Joe the first one before going on.
- Add `TripBrief`, with its rules, and `TripBriefService`.
- Add `Trip`, holding its owner, its trip brief, and an itinerary that holds only its last day for now.
- If the trips table needs more columns, such as for the home screen, add them in migration `0003` (phase 10a).
- Add the Zod schema for the plan document. Later phases add to it as they add objects.
- Add `TripRepository`, `EditableTrip`, `TripWriter`, and `TripReader`. For now, the finish step of a write only sets last updated. Phases 19 and 20 add the legs and the checks.
- Retry "trip busy" a few times, with a short pause, before the error goes back. No agent has to understand the lock.

**Done when:**

- Tests cover each rule in domain model sections 3.2 and 4.2. Examples: an item can't be emptied once set, and a trip length over the maximum is refused.
- Checked by hand against the local Postgres: two writes to one trip take turns, and neither loses the other's work. A write to another trip doesn't wait.
- A refused write saves nothing.
- A trip from a read can't be passed to `save()`. The type checker catches it.

The started-trip lock at save can't be tested yet, since nothing can set a start date. Phase 18 tests it.

**Ends in:** a PR.

### Phase 11. Store memory

**Design:** [Technical spec](../design/technical-spec.md), section 3.1. [Persistence design](../design/persistence.md), sections 2 and 8.8.

**Starts** once phase 10a is merged, at the same time as phases 10 and 12.

**Do:**

- Add the migration for memory items, as `0004` (phase 10a), and `MemoryRepository`, `MemoryWriter`, and `MemoryReader`.
- `MemoryWriter` refuses a change to a trip item on a started trip (persistence design, section 8.8). Phase 10's `Trip` doesn't exist yet, so give `MemoryWriter` a function that says whether the trip has started, and fake it in tests. Phase 12a passes in one that uses `TripRepository.load()`.

**Done when:**

- Tests show user A can't read, update, or forget user B's items. The error is the same as for an ID that doesn't exist.
- A trip item from another trip is refused the same way.
- An add over the maximum memory items, or text over the maximum length, is refused, and the error gives the limit.
- Checked by hand against the local Postgres: items save and read back, and user B's read doesn't return user A's items.

**Ends in:** a PR.

### Phase 12. Store sessions and transcripts

**Design:** [Persistence design](../design/persistence.md), sections 6, 7, and 8.5.

**Open questions:**

- Where do the Agent SDK's local scratch files go?

**Starts** once phase 10a is merged, at the same time as phases 10 and 11.

**Do:**

- First, check that the Agent SDK's `sessionStore` option works the way the design expects. It's marked alpha. Lines should reach the adapter as soon as they're written, and a resume should read them back from it. If it doesn't work, use the fallback in persistence design section 6, and tell Joe.
- Add the migration for sessions and transcript lines, as `0005` (phase 10a).
- Add `SessionRepository`, `SessionWriter`, `SessionReader`, and the `TranscriptAdapter`.

**Done when:**

- A two-turn conversation with Claude is resumed after the app restarts with its local scratch files deleted. Claude still knows what was said in the first turn. This makes real Claude calls, so it runs outside `npm run check`.
- Transcript rows appear while a turn runs, not only at its end.
- Tests with a fake SDK cover the adapter's ordering of lines.

**Ends in:** a PR. If the SDK behaves differently from persistence design section 6, the PR also updates it.

### Phase 12a. Put phases 10 to 12 together

**Design:** [Persistence design](../design/persistence.md), sections 5, 8.5, and 8.8.

**Starts** once phases 10, 11, and 12 are merged.

**Do:**

- Pass `MemoryWriter` a check that uses `TripRepository.load()` and `Trip.hasStarted`, in place of phase 11's fake.
- Make a trip with `TripWriter` on the local Postgres, and give it memory items and sessions.

**Done when:**

- Checked by hand against the local Postgres: a trip made by `TripWriter` gets trip memory items and sessions, and each reads back with that trip.
- A change to a trip item on a trip that hasn't started goes through the real check. A started trip can't be made yet, since nothing sets a start date. Phase 18 tests it, as it does for `TripWriter`.
- On the server, the `pgmigrations` table lists each migration from `0002` on, in order. Each merge in batch 3 ran its own.

**Ends in:** a PR.

### Phase 13. The first coordinator

Phase 13 is done in three parts, each with its own PR: the `trip` server, the `memory` server, and then the coordinator. These are the first tools, so Joe reviews each server on its own: its description, its tools' descriptions, their input schemas, and what they return. Phase 13 is done when 13c is merged. The split was agreed in chat on 2026-10-18.

**Design:** [Technical spec](../design/technical-spec.md), sections 1, 3.1, 5.1, and 5.2. [Tool design](../design/tools.md), sections 1, 2.1 (the trip brief tools), 2.2, and 4.

**Open questions:**

- ~~Which model does each agent use, and where is it set? No design doc names one. Left to Claude Code, the model depends on where it runs: in phase 9, the same script got Opus run on Joe's machine and Sonnet in the `app` container. So the app should set the model itself. Raised in phase 9.~~ **Closed 2026-10-18,** agreed in chat: a `coordinatorModel` setting in `settings.json`, set to the exact model ID `claude-opus-5-5`. A short name such as "opus" would move to newer models on its own, so a later run could use a different model. Each worker phase adds its own model setting. Phase 13c writes it into technical spec section 10.
- ~~How does `update_trip_brief` get a `TripWriter`? Since phase 19, `TripWriter` needs a `routeFinder`, because every write updates the legs. Phase 13 makes the `RoutesClient` from `env.googleMapsServerKey` and the global `fetch`, and passes it to `TripWriter` as `routeFinder`. Raised in phase 19.~~ **Closed 2026-10-18,** agreed in chat: as the question says. Phase 13a does it.
- ~~What does the app do when the Agent SDK sends a `mirror_error` message? The SDK sends it when it couldn't save transcript lines to the store after 3 tries, and drops them. The turn goes on, so a database outage can lose lines. At least log it. Also, a batch the SDK retries can land after batches sent later, so a database hiccup can put a few lines out of order. Raised in phase 12.~~ **Closed 2026-10-18,** agreed in chat: log it, with the session's ID and the error, and do nothing more. A few lines out of order after a retry are accepted. Phase 13c does it, since that's where the agent first runs, and writes both into persistence design section 6.
- ~~How do tests that use the real agent run (DEVELOPMENT.md, section 5)?~~ **Closed 2026-10-18,** agreed in chat: in phase 13, Joe runs the checks by hand in the terminal. Phase 14a sets up evaluations that can be run again after each change.

### Phase 13a. The trip server

**Do:**

- Make each session's `trip` MCP server, with the trip already set (tool design, section 4). For now, it holds only `read_trip_brief` and `update_trip_brief`. No agent uses it yet.
- Give `update_trip_brief` a `TripWriter` whose `routeFinder` is a `RoutesClient`, made from `env.googleMapsServerKey` and the global `fetch`.

**Done when:**

- Tests with fake repositories cover both tools as tool design section 2.1 describes them. Examples: an update of several items saves them all, and a refused update saves nothing, and its error gives the limit.
- The PR shows the server's description, and each tool's description, input schema, and an example of what it returns, so Joe can review them in one place.

**Ends in:** a PR. **Settled in:** the PR.

### Phase 13b. The memory server

**Starts** once phase 13a is merged, so it follows the pattern Joe agreed there.

**Do:**

- Make each session's `memory` MCP server, with the user and trip already set (tool design, section 4). It holds all four memory tools.

**Done when:**

- Tests with fake repositories cover the four tools as tool design section 2.2 describes them. Examples: one user can't read, update, or forget another user's items through them, and the error is the same as for an ID that doesn't exist. An add over the limits is refused, and the error gives the limit.
- The PR shows the server's description, and each tool's description, input schema, and an example of what it returns.

**Ends in:** a PR. **Settled in:** the PR.

### Phase 13c. The coordinator in the terminal

**Starts** once phase 13b is merged.

**Do:**

- Add the coordinator, with only the tools from phases 13a and 13b. Its instructions cover conduct, the trip brief items to establish, the memory rules, and comfortable driving hours (technical spec, section 5.2).
- Add the `coordinatorModel` setting, and give it to the Agent SDK.
- Add today's date to user messages, and the line after a resume, as technical spec section 5.2 says.
- Log each `mirror_error` message, with the session's ID and the error.
- Add a dev script to chat with the coordinator in the terminal, against the local database.

**Done when:** Joe runs these conversations by hand in the terminal. Claude Code runs each one first, to catch problems before Joe's run, and the PR quotes the lines that show it.

- A discovery conversation fills in the trip brief, and `read_trip_brief` shows every item.
- "We never eat at chains" goes to user memory, and "skip I-35 this time" goes to trip memory.
- On a second trip, the coordinator confirms the user's usual driving hours instead of asking from scratch (functional spec 11, S9).
- Asked for 14 hours of driving a day, the coordinator pushes back, and sets no more than the maximum.

**Ends in:** a PR. Phase 13 is done once it's merged.

### Phase 14. Chat in the browser

**Design:** [Systems design](../design/systems.md), sections 3 and 4. [Persistence design](../design/persistence.md), sections 8.2 and 8.5. [Functional spec](../design/functional-spec.md), sections 2, 3, and 10.1.

**Do:**

- Add the endpoints: list the user's trips, with name, dates, and last updated; start a trip from the "New trip" form; list a trip's sessions; send a message, with the reply streamed back over Server-Sent Events; and resume a session.
- Check that the signed-in user owns the trip before making a session's tools.
- Keep a turn running when the browser disconnects.
- Refuse to start or resume a session, or take a message, once the trip has started. Check before each message.
- Add the home screen: the user's trips, and "New trip."
- Add the trip page: its sessions, with date and title, each with resume, plus "start a new session." Add the chat view, showing the reply as it streams in.

**Done when:**

- Tests with a fake agent show that another user's trip is refused.
- A stream closed partway through a turn still leaves the whole turn in the transcript.
- A started trip refuses a new message.
- On the live site after the merge, Joe signs in, starts a trip, and goes through discovery.
- After a reload, resuming the session restores the conversation.
- A new session on the same trip knows the trip brief and memory.
- The second test user sees none of Joe's trips, and the coordinator knows none of his preferences (functional spec 11, S8).
- Closing the tab partway through a reply, then coming back, shows the finished reply.

**Ends in:** a PR. This is the first version Joe can use.

---

## Agent evaluations

By the end of this part, the agent's behavior can be checked again after any change to its instructions, its tools, or its model, by running a set of evaluations. Without them, the only way to tell whether a change made the agent better or worse is Joe testing by hand. Phase 14a was added on 2026-10-18, so the phases after it keep their numbers.

### Phase 14a. Agent evaluations

**Design:** [DEVELOPMENT.md](../DEVELOPMENT.md), section 5. [Technical spec](../design/technical-spec.md), section 3.1 (tests). [Functional spec](../design/functional-spec.md), section 11.

**Open questions:**

- Which framework runs the evaluations? promptfoo is the likely choice. Check its current docs, and that it can run the app's coordinator through the Agent SDK on the Max plan.
- How is each result scored: by what was saved, such as the trip brief and memory, by a model reading the reply, or both?
- How much of the Max plan does one run of the evaluations use?
- How do phase 33's simulated user and phase 36's tests fit with the evaluations?

**Do:**

- Set up the framework, and a command that runs the evaluations against the local stack, outside `npm run check`.
- Turn phase 13c's checks into evaluations: discovery fills in the trip brief, user or trip memory, confirming the usual driving hours on a second trip, and pushing back on 14 hours of driving.
- Write how the evaluations run into DEVELOPMENT.md section 5, in place of "How they run is settled when the first one is written."

**Done when:**

- One command runs every evaluation and prints each result.
- Each evaluation passes against the current coordinator. A change made on purpose to break one, such as taking the driving hours line out of the instructions, makes it fail.

**Ends in:** a PR.

---

## The itinerary

By the end of this part, code can build both example trips through the services, route their legs, and give their check results. Most of it is tested without the agent.

### Phase 15. Places

**Design:** [Domain model](../design/domain-model.md), section 3.10. [Persistence design](../design/persistence.md), section 8.6. [Google design](../design/data-sources/google.md), sections 1 and 2.1 to 2.3. [Technical spec](../design/technical-spec.md), section 7.2.

**2026-10-15:** this phase now runs before phase 13, in [batch 4](batch-4.md). The tools `find_place` and `read_place` moved to phase 21, since they need the coordinator.

**Open questions:**

- ~~Does Google give a street address no name? If it returns the street as the name, "Mike's house" never fills in (domain model 3.10).~~ **Closed 2026-10-15,** proposed in this phase's PR, under batch 4's rules: Google names an address with its street, such as "712 Neches St." So code gives a place no name when Google gives it no type, and its `types` include `street_address`, `premise`, or `subpremise`. Written into domain model 3.10, and Google design 2.2 and 2.4.

**Do:**

- Add the Google Places client for Text Search. It sends the key in a header, asks only for the fields it needs, has a timeout, and checks responses with Zod. Review text goes to the model labeled as place content.
- Add `Place`, with its opening periods and short line.
- Add the places table, `PlaceRepository`, `PlaceWriter`, and `PlaceReader`.
- Load the trip's places in `TripRepository`, and add `placeOf()` and `unnamedPlaceIds` to `EditableTrip`. Phase 10 left these out, since there was no places table.

**Done when:**

- Tests use saved Google responses.
- A real lookup of "Smitty's Market, Lockhart, TX" stores the place with its opening periods.
- Looking up the same place twice stores it once.
- A real lookup of a street address shows whether Google gives it a name.

**Ends in:** a PR.

### Phase 16. The itinerary's objects

**Design:** [Domain model](../design/domain-model.md), sections 2 and 3.3 to 3.9. [Technical spec](../design/technical-spec.md), section 8 (approvals).

**Do:**

- Add `Itinerary`, `Stay`, `Day`, `StayDay`, and `LastDay`, with their rules.
- Add `Stop`, `Candidate`, the approvals, `CheckResult`, `WeatherText`, and `ActivityRecord`, with their rules. Approvals are a tagged union, with a `kind` field.
- Add `Leg` as stored data only. Phase 19 routes it.
- Add them all to the plan document's schema. Links are stored as IDs and turned back into links on load.
- Make `TripRepository.load()` load the trip's places, as `loadForWrite()` does, so the plan's place IDs can be turned back into links (persistence design, section 8.7). Phase 15 left this out, since the plan linked to no places yet.
- Phase 10 added `Itinerary` and `LastDay` with only what a new trip needs. Once the itinerary has its start date and start place, make `Trip.name` add the month, and make `Trip.hasStarted` and `EditableTrip.hasStarted()` real. Until then they're always false.

**Done when:**

- Tests cover each rule in those sections. Examples: a meal stop needs a tier, a selected place is one of the stop's candidates, a set holds one to three candidates, and a stop holds at most one approval of each kind.
- A trip with stays, days, stops, candidates, and approvals saves and loads back unchanged.

**Ends in:** a PR.

### Phase 17. The calendar and the day's schedule

**Design:** [Domain model](../design/domain-model.md), section 4.1. [Persistence design](../design/persistence.md), section 5 (today's date). [Technical spec](../design/technical-spec.md), section 8 (opening hours).

**Open questions:**

- ~~Which library finds the time zone from coordinates, with no outside call?~~ **Closed 2026-10-15,** proposed in phase 16's PR, under batch 4's rules: `@photostructure/tz-lookup`. Phase 16 needed it first, to make `Trip.hasStarted` real. Its `todayAt()` (`src/domain/today.ts`) gives today's date at a place, and the calendar's `today()` uses it with the start place. Written into persistence design section 5.

**Do:**

- Add the calendar's lookup functions, such as `dateOf()`, `startStayOf()`, `fromPlaceOf()`, and `isStayingPut()`.
- Add `today()`.
- Add `scheduleOf()`, `openTimeInMinutesOf()`, `activitiesOf()`, and `isWeatherOutOfDate()`.

**Done when:**

- San Francisco Day 2 starts at the Monterey stay, and Moab Day 2 stays put.
- At 8 p.m. in Moab, today in UTC is already the next day.
- With made-up drive times, the example trips' times in domain model section 5 come out as shown.
- On San Francisco Day 2, with dinner still empty, dessert shows at 6:30.
- On Moab Day 4, stargazing is at 1:00 a.m. on the next day, with free time before it.
- A bar open Monday from 5 p.m. to 2 a.m. counts as open at 1 a.m. on Tuesday.
- Torrey's activities include the Panorama Point stop.

**Ends in:** a PR.

### Phase 18. The services

**Design:** [Domain model](../design/domain-model.md), sections 4.3 to 4.6 and 4.9. [Persistence design](../design/persistence.md), section 5.

**Open questions:**

- ~~How does the started-trip lock test set the time? `Trip.hasStarted` and `EditableTrip.hasStarted()` read the system clock with `new Date()`. The test of a write that loads at 11:59 p.m. and saves after midnight needs a clock it controls. `TripWriter` already takes a `Clock`, so it could pass `now()` in. Raised in phase 16. Phase 17's `Calendar` takes a `now` function for `today()`, so the services' tests can already set the time through it.~~ **Closed 2026-10-15,** proposed in this phase's PR, under batch 4's rules: the time is passed in. `TripWriter` checks the lock after the load, and `TripRepository.save(editableTrip, now)` checks it again before every save, both with the time from `TripWriter`'s `Clock`. `EditableTrip.startedToday(now)` replaces `hasStarted()`, and gives today's date for the error. `Trip.hasStarted(now)` and the memory check (`tripStartedCheckUsing(storeFor, now)`) take the time the same way. Written into persistence design sections 5, 8.1, 8.2, 8.4, 8.7, and 8.8, and domain model 3.1.

**Do:** add `ItineraryService`, `StaysService`, `DaysService`, `StopsService`, and `RejectionsService`. The "trip has started" error also gives the date it went by.

**Done when:**

- Tests build, lay out, and fill both example trips through the services.
- Rejecting the selected Moab hotel clears the stay's lodging, and returns the Moab stay as changed.
- Each refusal in those sections has a test.
- The started-trip lock works: a write that loads at 11:59 p.m. the night before the start date and saves after midnight is refused.
- `MemoryWriter` refuses a change to a trip item once the trip has started. Phase 12a left this test for now.

**Ends in:** a PR.

### Phase 19. Legs

**Design:** [Domain model](../design/domain-model.md), sections 3.8 and 4.7. [Google design](../design/data-sources/google.md), sections 2.1 to 2.4 and 5. [Persistence design](../design/persistence.md), section 4.

**Open questions:**

- ~~How does the app get the server key? Phase 15's `PlacesClient` takes it as an argument, and nothing in the app makes one yet, so `GOOGLE_MAPS_SERVER_KEY` isn't in the env schema (`src/config/env.schema.ts`) or in the `app` service's environment in `compose.yaml`. The legs run in every write, so this phase is the first whose code the app runs with a Google key. Add it to both, so a missing key stops the app from starting. Raised in phase 15.~~ **Closed 2026-10-15,** in this phase's PR: `GOOGLE_MAPS_SERVER_KEY` is in the env schema, so a missing or empty key stops the app and the migrations from starting, and in the `app` service's environment in `compose.yaml`. The server's `.env` already has it (phase 2). Written into systems design section 8.

**Do:**

- Add the Google Routes client. It takes place IDs and pass-through waypoints, can ask for the best order, has a timeout, and turns an empty result into a "no driving route" error.
- Add `LegsService`: `updateLegs()`, with waypoint placement and the stop-order calls, and `detourTimesOf()`.
- Add the legs to the finish step of a write, and the leg changes to what a write hands back. Phase 10's `WriteResult` holds only `changeResult`. This phase adds `legChanges`.

**Done when:**

- Tests with a fake route finder cover adding, re-routing, and removing a leg.
- On San Francisco Day 2, with only First Awakenings selected, the Big Sur waypoint goes between First Awakenings and San Luis Obispo.
- A failed Google call refuses the whole write, and nothing is saved.
- A real run routes San Francisco Day 2 through Big Sur, with a drive time close to Google Maps'.

**Ends in:** a PR.

### Phase 20. Feasibility checks

**Design:** [Technical spec](../design/technical-spec.md), section 8. [Domain model](../design/domain-model.md), sections 3.3 and 4.8.

**Do:** add the `FeasibilityChecker`, and run it in the finish step of the coordinator's writes. Phase 10's `TripWriter.write()` has no `by` argument yet. This phase adds it, and `checkComparison` in `WriteResult`.

**Done when:** tests cover each row of the checks table in technical spec section 8, using the Moab trip's planted problems:

- Fisher Towers gives "hours not known."
- Delicate Arch gives nothing.
- Milt's gives "open, but not long enough."
- Gifford Homestead gives "closed for the whole visit."
- Day 4, approved for 5 hours, gives a new driving warning once it reaches 5 hours 20 minutes.
- Selecting Love Muffin clears the "may be too early" mark on Milt's warning, and returns it as new.

**Ends in:** a PR.

---

## Planning in chat

By the end of this part, the coordinator can build a trip's skeleton and lay out days with places the user names, and the browser shows the itinerary and map. No workers yet.

### Phase 21. Read the itinerary

**Design:** [Tool design](../design/tools.md), sections 2.1 (`read_itinerary`), 2.3 (`find_place` and `read_place`), and 4. [Technical spec](../design/technical-spec.md), section 7.2.

**Open questions:**

- What's the size limit on an in-process MCP tool's result? Claude Code may cut off large results. The limit for MCP tools is believed to be 25,000 tokens, but it hasn't been checked for in-process servers.
- How does `read_itinerary` get its check results? A read runs `FeasibilityChecker.workOut()` and `compare()`, and saves nothing (domain model 4.8). But `TripReader.read()` hands back only the trip. Phase 20 creates the checker only inside `TripWriter`'s finish, from the settings, the clock, and the write's calendar. The read tool needs the same: a calendar and a checker for the trip it read. Raised in phase 20.

**Do:**

- Add `find_place` and `read_place` on the `places` server, and give them to the coordinator. `read_place` checks the place belongs to the session's trip. These moved here from phase 15.
- Add `read_itinerary`, for the whole trip or scoped to a day, stay, or stop. Leave out route lines.
- Measure a full read of a 14-day trip, and find the limit on an in-process MCP tool's result.

**Done when:**

- In chat, the coordinator resolves "Moab," and answers "is Milt's open on Mondays?" from `read_place`.
- Tests on the example trips show what each scope returns.
- The measured size and the limit are written into tool design section 2.1. If a full read would be cut off, Joe hears about it before the next phase.

**Ends in:** a PR.

### Phase 22. Build the skeleton

**Design:** [Tool design](../design/tools.md), sections 2.1 (`update_itinerary`, `add_stay`, `update_stay`, `remove_stay`, `update_day`, `set_waypoints`) and 2.4. [Technical spec](../design/technical-spec.md), sections 4.1, 4.2 (discovery, shape, and skeleton), and 5.2. [Domain model](../design/domain-model.md), section 4.8.

**Do:**

- Add these tools and `compute_route`. Each write's reply is built from what the write hands back, as tool design section 2.1 says.
- Report check results whose text changed. Today a result that's still there after a write is "already known", so the reply leaves it out unless the write touched its subject, even when its text changed. Example: the user lowers their driving hours from 6 to 5, and Day 2's warning now gives the new limit, but the reply doesn't show it. Make `FeasibilityChecker.compare()` mark a known result whose text differs from its saved match as "changed". Each write's reply lists changed results anywhere in the trip, like new ones. The coordinator decides whether to raise one. Write it into domain model 4.8 and tool design 2.1. Then take out `touchedBy()` in `src/tools/trip-brief-tools.ts`, which phase 13a added for the driving hours only. Raised in PR #44's third review.
- Add the coordinator's instructions for anchors and stretches, the shape and skeleton rounds, broken feasibility rules, and changes to stays.

**Done when,** in chat:

- The coordinator sets up the Moab trip: start and end places, start date, Moab for 3 nights, Torrey for 1, and the Dewey Bridge waypoint. A read shows each leg's drive time.
- Asked for Seattle to Miami in five days at four hours a day, it says how far short the plan falls and offers trade-offs (functional spec 11, S3).

**Ends in:** a PR.

### Phase 23. Lay out days

**Design:** [Tool design](../design/tools.md), section 2.1 (`add_stops`, `update_stop`, `move_stop`, `remove_stops`, `select_candidate`, `select_user_place`, `reject_places`). [Technical spec](../design/technical-spec.md), sections 4.2 (must-sees) and 5.2.

**Do:**

- Add these tools.
- Add the coordinator's instructions for must-sees, places the user names, visit times, rejections, and moving stops.

**Done when,** in chat:

- San Francisco Day 1 is laid out with the five places the user names, all selected, with times close to domain model section 5.1. No worker is needed.
- Making the Boardwalk visit five hours gives a warning that the Whaling Station dinner is late, and the coordinator raises it.
- "No Sardine Factory" rejects it, with the user's reason.

**Ends in:** a PR.

### Phase 24. The itinerary view

**Design:** [Functional spec](../design/functional-spec.md), sections 7.6 and 9.1 to 9.7.

**Do:**

- Add an endpoint that returns the itinerary for the browser, including route lines for the map.
- Show the itinerary beside the chat: the trip summary, stays, legs, and each day's schedule with its free time and rest days. Selected places show their rationale. Refresh the view after each turn.

**Done when:** on the live site, the San Francisco skeleton and Day 1 show as in domain model section 5.1.

**Ends in:** a PR.

### Phase 25. The map

**Design:** [Functional spec](../design/functional-spec.md), section 9.2. [Google design](../design/data-sources/google.md), section 4.

**Open questions:**

- ~~How does the `web` image get Google's browser key? Vite writes `VITE_` variables into the front end's files when it builds them, and the image build doesn't see `.env` (it's left out by `.dockerignore`). Raised in phase 4. Phase 8 answers the same question for the Supabase values first, so use its answer.~~ **Answered 2026-10-15, in phase 8's PR:** the workflow passes the GitHub repo variable `VITE_GOOGLE_MAPS_BROWSER_KEY` to the `web` build (systems design section 7). The build already reads it. Joe added the variable in GitHub on 2026-10-15.

**Do:** add the Google map to the itinerary view, with the browser key. It shows the route lines, and different markers for stays, attractions, and restaurants. Clicking a marker shows the item's details.

**Done when:**

- On the live site, the San Francisco trip's map shows the route down the coast, and its markers.
- The map works on `localhost` too.

**Ends in:** a PR.

---

## Workers

By the end of this part, the full planning flow works: workers fill stops and lodging, the user picks from option cards, and each stay gets its weather and clothing text.

### Phase 26. Place searches

**Design:** [Tool design](../design/tools.md), section 2.3 (`search_near` and `search_along_leg`). [Google design](../design/data-sources/google.md), sections 2.1, 2.3, and 2.4. [Technical spec](../design/technical-spec.md), section 10.

**Do:** add `search_near` and `search_along_leg`. They leave out the trip's rejected places.

**Done when:**

- Tests use saved Google responses.
- A real search for scenic viewpoints along San Francisco Day 2 returns places in route order. Point Lobos is kept, and places within 2 miles of either end are dropped.
- A real `search_near` for a stay returns hours for the stay's dates only.

**Ends in:** a PR.

### Phase 27. The stay researcher

**Design:** [Technical spec](../design/technical-spec.md), sections 4.2 (fill), 5.3, 6.1, and 6.4. [Tool design](../design/tools.md), sections 2.1 (the candidate tools) and 3. [Web search design](../design/data-sources/web-search.md).

**Open questions:**

- What exact fields go in a worker brief and in a worker's result? Technical spec section 5.3 lists the contents, not the fields.
- Can a session resume when its transcript ends in a worker call that never got its result? A restart can leave it that way. If the SDK won't resume, the adapter drops the unfinished line.
- May a worker run in the background? Each subagent definition has a `background` option. In phase 12's check, a background helper finished after the coordinator's turn ended, and the SDK started a second turn on its own, in the same `query()` call. Raised in phase 12.

**Do:**

- Add `add_lodging_candidates` and `add_stop_candidates`.
- Add the stay researcher, with only its tools, and its instructions.
- Add the coordinator's instructions for the fill round, and give it the `Agent` tool.

**Done when,** in chat:

- The Moab stay researcher adds three mid-range lodging candidates and fills the stops near the Moab stay.
- The coordinator sees one line per candidate, not full records.
- The resume test's result is written into persistence design section 7.

**Ends in:** a PR.

### Phase 28. The leg scout

**Design:** [Technical spec](../design/technical-spec.md), section 6.2. [Tool design](../design/tools.md), sections 2.1 (detour times) and 4. [Domain model](../design/domain-model.md), section 4.7.

**Open questions:**

- What timeout does each Google call get, and what time limit does the whole write get? One write can make several calls, such as selecting Moab lodging, which re-routes four days. Measure real writes first.

**Do:**

- Add the leg scout, its instructions, and detour times in `add_stop_candidates`.
- Add the hook that denies a leg scout's web search unless it's limited to `atlasobscura.com`.

**Done when:**

- The San Francisco Day 2 leg scout fills Point Lobos, Bixby Creek, and lunch with candidates that have detour times.
- A test shows the hook denies a leg scout's search with no domain limit.
- Two stay researchers and a leg scout run at once, and none loses another's candidates.

**Ends in:** a PR.

### Phase 29. Option cards

**Design:** [Functional spec](../design/functional-spec.md), sections 7.1, 7.5, and 7.6. [Technical spec](../design/technical-spec.md), sections 4.2 (refine), 7.2, and 9. [Domain model](../design/domain-model.md), section 3.9.

**Open questions:**

- Which attractions show a rating and review count? A national park or a historic plaque shows none (functional spec 7.5).
- Do Google's terms require the "Summarized with Gemini" label wherever a Places summary appears?

**Do:**

- Show an option card for the newest candidate set of each stop and stay with nothing selected, with each candidate's details. Select, More options, Higher tier, and Lower tier each send a message to the coordinator.
- Add the coordinator's instructions for card actions and budget tiers.

**Done when,** on the live site:

- Hotel cards for one-night stays show value options, and longer stays show mid-range, with the rule shown (functional spec 11, S5).
- "Higher tier" then Select updates the itinerary, and the coordinator confirms in chat (functional spec 11, S6).

**Ends in:** a PR.

### Phase 30. Weather data

**Design:** [Google design](../design/data-sources/google.md), section 3. [Open-Meteo design](../design/data-sources/open-meteo.md). [Tool design](../design/tools.md), section 2.5.

**Open questions:**

- Is the first day of a Google Weather forecast today? Google design section 3 assumes so, but it isn't confirmed.

**Do:** add the Google Weather client, the Open-Meteo client, and `stay_weather`, which picks the source from the stay's dates.

**Done when:**

- Tests use saved responses, including Open-Meteo's spent-limit reply.
- A real call for a stay within 7 days returns a forecast.
- A real call for a stay in October 2027 returns seasonal averages, labeled "Typical for this time of year, based on 2016–2025."
- A forecast that leaves out a date returns an error.

**Ends in:** a PR.

### Phase 31. The weather worker

**Design:** [Technical spec](../design/technical-spec.md), sections 4.2 (weather and clothing), 5.2, and 6.3. [Tool design](../design/tools.md), section 2.1 (`set_stay_weather`). [Functional spec](../design/functional-spec.md), sections 8 and 9.6.

**Do:**

- Add `set_stay_weather`, the weather worker, and its instructions.
- Add the coordinator's rules for when to run and rerun it.
- Show each stay's weather and clothing text in the itinerary view, with its label, an out-of-date mark, and the Open-Meteo credit.

**Done when:**

- The Moab trip gets weather and clothing text for both stays, and Torrey's covers freezing-night stargazing.
- Moving the trip one day later doesn't mark seasonal averages out of date.
- Adding a stay marks it out of date.

**Ends in:** a PR.

### Phase 32. Finish the coordinator's instructions

**Design:** [Technical spec](../design/technical-spec.md), sections 5.2 and 9.

**Open questions:**

- Are about two dozen tools too many for the coordinator? If it chooses badly, merge the add, update, and remove tools for each kind of item.

**Do:**

- Go through every item in technical spec sections 5.2 and 9, and make sure the instructions cover it. Add what's missing, such as the opening line of a new session and "what's left to decide?"

**Done when:**

- The PR description lists each item in sections 5.2 and 9, with the part of the instructions that covers it.
- Real-agent tests pass for a new session's opening line and for "what's left to decide?"

**Ends in:** a PR.

---

## Walk-throughs

By the end of this part, both example trips have been planned through the live app, by a simulated user and by Joe.

### Phase 33. The simulated user

**Do:**

- Add a script that runs Claude as the user, talking to the app through its API, signed in as the test user. It follows a trip script: the trip, the user's replies, and changes to make along the way, like the design walk-throughs.
- Add a way to set today's date outside production, so a script can say "on May 8, 2027, the user opens the trip again." This changes the design, so propose it to Joe first.
- Have the script write a report: the transcript, the final itinerary next to the example in domain model section 5, and each place where the app didn't do what the design docs say.

**Done when:** a short trip script that covers only discovery runs against the local stack and writes its report.

**Ends in:** a PR.

### Phase 34. Walk the San Francisco trip

**Open questions:**

- How much of the Max plan does a planning session use? Check the usage bars before and after the run.

**Do:**

- Write the San Francisco trip script, with its changes along the way.
- Run it, fix each problem in the report, and run it again. A fix that changes the design goes to Joe first.
- Joe then plans the same trip by hand on the live site.

**Done when:**

- The simulated run ends with the itinerary in domain model section 5.1: the same stays, nights, stops, places, and approvals. Each change along the way is handled as the design docs say.
- Joe's run ends the same way.
- Any problems still open are listed in the PR.

**Ends in:** a PR.

### Phase 35. Walk the Moab trip

**Do:** the same as phase 34, for the Moab trip in domain model section 5.2.

**Done when:** the same as phase 34, against domain model section 5.2.

**Ends in:** a PR.

### Phase 36. Acceptance scenarios and memory tests

**Design:** [Functional spec](../design/functional-spec.md), section 11. [Technical spec](../design/technical-spec.md), section 3.1 (tests).

**Do:** add real-agent tests for acceptance scenarios S1 to S13, and the three memory tests in technical spec section 3.1, as evaluations in phase 14a's setup.

**Done when:** each test passes, and the results are in the PR.

**Ends in:** a PR.
