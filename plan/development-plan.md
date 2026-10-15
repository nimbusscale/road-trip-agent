# Road Trip Planner: Development Plan

This document lists the development work, phase by phase, in the order it's done. How code is written and checked is in [DEVELOPMENT.md](../DEVELOPMENT.md). What the app does and how it's built is in [design/](../design/README.md).

**The goal.** At the end of this plan, the app can plan the two example trips in the [domain model](../design/domain-model.md), section 5: San Francisco to Los Angeles, and Grand Junction to Salt Lake City through Moab. A simulated user and Joe each walk both trips through the live app, the way the design walk-throughs did on paper.

**Phase 1, setting up the code checks, is done** (commit 067bfd4). It's no longer listed. The phases below start at 2, so "phase 1" in the git history still means the code checks.

---

## How the phases work

- **Each phase is done on its own branch, and ends in a PR or a decision.** `main` is protected, so nothing is pushed to it directly ([DEVELOPMENT.md](../DEVELOPMENT.md), section 7). A PR is ready when `npm run check` passes and the phase's "Done when" items are checked. Joe merges it, or asks Claude Code to. Once phase 6 is done, a merge to `main` deploys.
- **Run the "Done when" checks yourself,** and report each result in the PR description.
- **Some steps need Joe,** such as creating keys in a console. The phase says so.
- **When a phase settles something the design leaves open,** propose the doc change to Joe in chat first. Once he agrees, write it into the design doc in the same PR.
- **Tests in `npm run check` use fakes** for Google, Open-Meteo, Supabase, and Claude ([DEVELOPMENT.md](../DEVELOPMENT.md), section 5). Some phases also make a few real calls by hand. Those are listed in "Done when."
- **The thin slice comes early.** Phases 10 to 14 build a small app that works end to end: Joe signs in on the live site and talks with the coordinator about the trip brief and memory. The riskiest parts get tested early: the Max plan on the server, streaming replies, and saved transcripts. The itinerary code and the rest of the tools come after.

| Phase | What it builds |
|---|---|
| **Running the app** | |
| 2 | Create the Google keys |
| 3 | Choose the libraries the design leaves open |
| 4 | Run the app locally |
| 5 | Prepare the server |
| 6 | Deploy on merge |
| 7 | Back up the database nightly |
| 8 | Sign in |
| 9 | Run the Agent SDK on the server |
| **The thin slice** | |
| 10 | The trip, and saving it |
| 11 | Store memory |
| 12 | Store sessions and transcripts |
| 13 | The first coordinator |
| 14 | Chat in the browser |
| **The itinerary** | |
| 15 | Places |
| 16 | The itinerary's objects |
| 17 | The calendar and the day's schedule |
| 18 | The services |
| 19 | Legs |
| 20 | Feasibility checks |
| **Planning in chat** | |
| 21 | Read the itinerary |
| 22 | Build the skeleton |
| 23 | Lay out days |
| 24 | The itinerary view |
| 25 | The map |
| **Workers** | |
| 26 | Place searches |
| 27 | The stay researcher |
| 28 | The leg scout |
| 29 | Option cards |
| 30 | Weather data |
| 31 | The weather worker |
| 32 | Finish the coordinator's instructions |
| **Walk-throughs** | |
| 33 | The simulated user |
| 34 | Walk the San Francisco trip |
| 35 | Walk the Moab trip |
| 36 | Acceptance scenarios and memory tests |

---

## Running the app

By the end of this part, an empty app runs on `roadtrip.jjk3.com`, deploys on each merge, backs up its database, and knows who is signed in. It can also call Claude from the server.

### Phase 2. Create the Google keys

**Design:** [Google design](../design/data-sources/google.md), sections 1 and 5. [Systems design](../design/systems.md), section 8.

**Do:**

- Joe creates two keys in the Google Cloud console. The server key is restricted to the Routes, Places (New), and Weather APIs. The browser key is restricted to the Maps JavaScript API, and to these addresses: `https://roadtrip.jjk3.com/*`, `http://localhost:5173/*` for `npm run dev`, and `https://localhost/*` for the whole stack run locally.
- Joe confirms the $100 budget alert is set.
- Put both keys in the local `.env` file, as `GOOGLE_MAPS_SERVER_KEY` and `VITE_GOOGLE_MAPS_BROWSER_KEY` ([Google design](../design/data-sources/google.md), section 1).
- Add `.env.example`, listing every variable the app reads, with no values. Later phases add to it.

**Done when:**

- A call to each of Routes, Places Text Search, and Weather with the server key returns data.
- A call with the server key to an API outside its list, such as Geocoding, is refused.

**Ends in:** a PR adding `.env.example`.

### Phase 3. Choose the libraries the design leaves open

**Design:** [Persistence design](../design/persistence.md), section 9. [Systems design](../design/systems.md), section 10.

**Do:**

- Compare two or three options for each of these:
  - **The database library.** It sends queries to Postgres directly, rather than mapping each class to a table (persistence design, section 9).
  - **The migration tool.** It runs from the `app` image before the new app starts (systems design, section 7).
  - **The HTTP server library** for the API. It needs Zod checks on request bodies, and Server-Sent Events for streaming replies.
- Write the comparison in `research/`.
- Propose a choice for each to Joe in chat.

**Done when:** Joe has agreed to each choice, and it's written into persistence design section 9 and systems design section 10.

**Ends in:** a PR with the comparison and the doc changes.

### Phase 4. Run the app locally

**Design:** [Systems design](../design/systems.md), sections 2, 4, and 6. [DEVELOPMENT.md](../DEVELOPMENT.md), section 4. [Technical spec](../design/technical-spec.md), section 10.

**Do:**

- Add the Docker Compose file, with `postgres`, `app`, and `web`. Postgres uses the standard image, keeps its data on a volume, and is reachable from the host but not from outside it.
- Add the app's entry point. It parses the environment variables with Zod once, and loads the settings file in technical spec section 10, also with Zod. A missing or bad value stops the app from starting.
- Add the migration tool and a first migration, with an npm script to run them.
- Add `GET /api/health`, which reports whether the app can reach the database.
- Add the front end, with React, TypeScript, and Vite. For now it's one page that calls `/api/health` and shows the result.
- Make `npm run dev` start the app and the front end. Vite passes `/api` to the app.
- Add a Dockerfile for `app`, and one for `web`: Caddy with the front end's built files. Caddy passes `/api` to `app`, and reads its site name from the environment.
- The front end needs its own TypeScript and lint settings. Those are config files that change only with Joe's approval ([DEVELOPMENT.md](../DEVELOPMENT.md), section 6). Show Joe the changes and why, and ask before making them.

**Done when:**

- With Postgres running in its container, `npm run dev` starts the app and the front end, and the page in the browser says the API and database are reachable.
- With Postgres stopped, the health check reports the database can't be reached.
- With a required variable removed from `.env`, the app refuses to start, and the message names the variable. The same goes for a bad value in the settings file.
- With `docker compose up`, `https://localhost` shows the same page, served by Caddy.
- `app` can't be reached from the host directly, only through Caddy.
- `npm run lint` checks the front end's files.
- Tests cover the parsing of the environment and the settings.

**Ends in:** a PR.

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

**Design:** [Systems design](../design/systems.md), sections 7 and 10.

**Do:**

- Add the GitHub Actions workflow. On a push to `main`, it runs `npm run check`, builds the `app` and `web` images, and pushes them to GitHub's container registry. Then it connects to the server over SSH, pulls the images, runs the migrations from the new `app` image, and restarts the containers.
- Decide whether the images are private, and if so, how the server signs in to pull them (systems design, section 10). Propose it to Joe.

**Done when:**

- Merging this phase's PR deploys it.
- `https://roadtrip.jjk3.com` shows the page, with a valid certificate, and says the API and database are reachable.
- The workflow's log shows the migrations ran before the containers restarted.
- The workflow doesn't build or deploy when `npm run check` fails.

**Ends in:** a PR. The merge is the test.

### Phase 7. Back up the database nightly

**Design:** [Systems design](../design/systems.md), sections 8, 9, and 10.

**Do:**

- Add a script that dumps the database, copies the dump to the Spaces bucket, and removes dumps older than a set number of days. Agree the number of days with Joe.
- Put the Spaces access key in the server's `.env` file.
- Run the script every night on the server.

**Done when:**

- After one run, the dump is in the Spaces bucket.
- The dump loads into a new, empty Postgres, and has the same tables.
- A test dump dated past the limit is removed by the next run.

**Ends in:** a PR with the script, and the number of days written into systems design section 9.

### Phase 8. Sign in

**Design:** [Systems design](../design/systems.md), sections 3, 4, and 8. [Functional spec](../design/functional-spec.md), section 3. [DEVELOPMENT.md](../DEVELOPMENT.md), section 4.

**Do:**

- Joe confirms the Supabase project has sign-up turned off and email sign-in on. He adds his own user, and a second test user for isolation tests.
- Add a sign-in page and sign-out to the front end, with Supabase's JavaScript library. The front end sends the token with each `/api` request.
- In the app, check each token's signature with the Supabase project's public signing keys, and parse its contents with Zod. Refuse a request with no valid token. Decide how the app gets the keys and how often it refreshes them (systems design, section 10).
- Add `GET /api/me`, which returns the signed-in user's ID.

**Done when:**

- On the live site, Joe signs in and the page shows his user ID. Sign-out returns to the sign-in page.
- A request with no token, or with a changed token, gets a 401.
- Tests use tokens signed with a test key, not Supabase.

**Ends in:** a PR.

### Phase 9. Run the Agent SDK on the server

How the server signs in to the Claude Max plan is open (systems design, section 10). This phase settles it.

**Design:** [Systems design](../design/systems.md), sections 2, 5, 8, and 10.

**Do:**

- Find out, from Anthropic's current docs, how a server signs in to a Max plan for the Agent SDK. Try the options that look right.
- Confirm that paid use past the plan's limits is turned off.
- Add the Agent SDK, and a dev-only script that sends Claude one question and prints the reply.
- Put the credential in the local and server `.env` files.
- Propose the answer to Joe, and write it into systems design section 10.

**Done when:**

- The script, run inside the `app` container on the server, prints Claude's reply.
- The script works locally too.
- The memory used by one SDK session's Claude Code process is measured and noted in the PR. Systems design section 2 expects a few hundred MB.

**Ends in:** a PR.

---

## The thin slice

By the end of this part, Joe can sign in on the live site, start a trip, and talk it over with the coordinator. The coordinator fills in the trip brief, and remembers preferences across trips. It has no itinerary yet.

### Phase 10. The trip, and saving it

**Design:** [Technical spec](../design/technical-spec.md), section 7.1. [Domain model](../design/domain-model.md), sections 1, 3.1, 3.2, and 4.2. [Persistence design](../design/persistence.md), sections 1 to 5, 8.1 to 8.4, and 8.7.

**Do:**

- Add the ID maker: a prefix for the kind of item, then 8 random letters and digits, leaving out ones that are easy to confuse.
- Settle how the domain model's markers look in code: `{readOnly}`, `{viaService}`, and `{keepsValue}`. Every later object follows the same pattern, so show Joe the first one before going on.
- Add `TripBrief`, with its rules, and `TripBriefService`.
- Add `Trip`, holding its owner, its trip brief, and an itinerary that holds only its last day for now.
- Add the migration for the trips table, with the plan as one JSON document. Decide how the home screen gets each trip's name, dates, and last updated: from the plan, or from extra columns (persistence design, section 9).
- Add the Zod schema for the plan document. Later phases add to it as they add objects.
- Add `TripRepository`, `EditableTrip`, `TripWriter`, and `TripReader`. For now, the finish step of a write only sets last updated. Phases 19 and 20 add the legs and the checks.
- Set how long a write waits for the row lock, and retry "trip busy" a few times before the error goes back (persistence design, section 9).

**Done when:**

- Tests cover each rule in domain model sections 3.2 and 4.2. Examples: an item can't be emptied once set, and a trip length over the maximum is refused.
- Tests against the local Postgres show that two writes to one trip take turns, and neither loses the other's work.
- A write to another trip doesn't wait.
- A refused write saves nothing.
- A trip from a read can't be passed to `save()`. The type checker catches it.

The started-trip lock at save can't be tested yet, since nothing can set a start date. Phase 18 tests it.

**Ends in:** a PR.

### Phase 11. Store memory

**Design:** [Technical spec](../design/technical-spec.md), section 3.1. [Persistence design](../design/persistence.md), sections 2 and 8.8.

**Do:** add the migration for memory items, `MemoryRepository`, `MemoryWriter`, and `MemoryReader`.

**Done when:**

- Tests show user A can't read, update, or forget user B's items. The error is the same as for an ID that doesn't exist.
- A trip item from another trip is refused the same way.
- An add over the maximum memory items, or text over the maximum length, is refused, and the error gives the limit.

**Ends in:** a PR.

### Phase 12. Store sessions and transcripts

**Design:** [Persistence design](../design/persistence.md), sections 6, 7, and 8.5.

**Do:**

- First, check that the Agent SDK's `sessionStore` option works the way the design expects. It's marked alpha. Lines should reach the adapter as soon as they're written, and a resume should read them back from it. If it doesn't work, use the fallback in persistence design section 6, and tell Joe.
- Add the migrations for sessions and transcript lines.
- Add `SessionRepository`, `SessionWriter`, `SessionReader`, and the `TranscriptAdapter`.

**Done when:**

- A two-turn conversation with Claude is resumed after the app restarts with its local scratch files deleted. Claude still knows what was said in the first turn. This makes real Claude calls, so it runs outside `npm run check`.
- Transcript rows appear while a turn runs, not only at its end.
- Tests with a fake SDK cover the adapter's ordering of lines.

**Ends in:** a PR. If the SDK behaves differently from persistence design section 6, the PR also updates it.

### Phase 13. The first coordinator

**Design:** [Technical spec](../design/technical-spec.md), sections 1, 3.1, 5.1, and 5.2. [Tool design](../design/tools.md), sections 1, 2.1 (the trip brief tools), 2.2, and 4.

**Do:**

- Make each session's `trip` and `memory` MCP servers, with the trip and user already set (tool design, section 4). For now, `trip` holds only `read_trip_brief` and `update_trip_brief`. `memory` holds all four memory tools.
- Add the coordinator, with only those tools. Its instructions cover conduct, the trip brief items to establish, the memory rules, and comfortable driving hours (technical spec, section 5.2).
- Add today's date to user messages, and the line after a resume, as technical spec section 5.2 says.
- Add a dev script to chat with the coordinator in the terminal, against the local database.
- Settle how tests that use the real agent run (DEVELOPMENT.md, section 5), and write it there once Joe agrees.

**Done when:**

- In the terminal, a discovery conversation fills in the trip brief, and `read_trip_brief` shows every item.
- "We never eat at chains" goes to user memory, and "skip I-35 this time" goes to trip memory.
- On a second trip, the coordinator confirms the user's usual driving hours instead of asking from scratch (functional spec 11, S9).
- Asked for 14 hours of driving a day, the coordinator pushes back, and sets no more than the maximum.

**Ends in:** a PR.

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

## The itinerary

By the end of this part, code can build both example trips through the services, route their legs, and give their check results. Most of it is tested without the agent.

### Phase 15. Places

**Design:** [Domain model](../design/domain-model.md), section 3.10. [Persistence design](../design/persistence.md), section 8.6. [Google design](../design/data-sources/google.md), sections 1 and 2.1 to 2.3. [Tool design](../design/tools.md), section 2.3 (`find_place` and `read_place`). [Technical spec](../design/technical-spec.md), section 7.2.

**Do:**

- Add the Google Places client for Text Search. It sends the key in a header, asks only for the fields it needs, has a timeout, and checks responses with Zod. Review text goes to the model labeled as place content.
- Add `Place`, with its opening periods and short line.
- Add the places table, `PlaceRepository`, `PlaceWriter`, and `PlaceReader`.
- Add `find_place` and `read_place` on the `places` server, and give them to the coordinator. `read_place` checks the place belongs to the session's trip.

**Done when:**

- Tests use saved Google responses.
- A real lookup of "Smitty's Market, Lockhart, TX" stores the place with its opening periods.
- Looking up the same place twice stores it once.
- In chat, the coordinator resolves "Moab," and answers "is Milt's open on Mondays?" from `read_place`.

**Ends in:** a PR.

### Phase 16. The itinerary's objects

**Design:** [Domain model](../design/domain-model.md), sections 2 and 3.3 to 3.9. [Technical spec](../design/technical-spec.md), section 8 (approvals).

**Do:**

- Add `Itinerary`, `Stay`, `Day`, `StayDay`, and `LastDay`, with their rules.
- Add `Stop`, `Candidate`, the approvals, `CheckResult`, `WeatherText`, and `ActivityRecord`, with their rules. Approvals are a tagged union, with a `kind` field.
- Add `Leg` as stored data only. Phase 19 routes it.
- Add them all to the plan document's schema. Links are stored as IDs and turned back into links on load.

**Done when:**

- Tests cover each rule in those sections. Examples: a meal stop needs a tier, a selected place is one of the stop's candidates, a set holds one to three candidates, and a stop holds at most one approval of each kind.
- A trip with stays, days, stops, candidates, and approvals saves and loads back unchanged.

**Ends in:** a PR.

### Phase 17. The calendar and the day's schedule

**Design:** [Domain model](../design/domain-model.md), section 4.1. [Persistence design](../design/persistence.md), section 5 (today's date). [Technical spec](../design/technical-spec.md), section 8 (opening hours).

**Do:**

- Add the calendar's lookup functions, such as `dateOf()`, `startStayOf()`, `fromPlaceOf()`, and `isStayingPut()`.
- Add `today()`. Choose a library that finds the time zone from coordinates, with no outside call (persistence design, section 9).
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

**Do:** add `ItineraryService`, `StaysService`, `DaysService`, `StopsService`, and `RejectionsService`.

**Done when:**

- Tests build, lay out, and fill both example trips through the services.
- Rejecting the selected Moab hotel clears the stay's lodging, and returns the Moab stay as changed.
- Each refusal in those sections has a test.
- The started-trip lock works: a write that loads at 11:59 p.m. the night before the start date and saves after midnight is refused.

**Ends in:** a PR.

### Phase 19. Legs

**Design:** [Domain model](../design/domain-model.md), sections 3.8 and 4.7. [Google design](../design/data-sources/google.md), sections 2.1 to 2.4 and 5. [Persistence design](../design/persistence.md), section 4.

**Do:**

- Add the Google Routes client. It takes place IDs and pass-through waypoints, can ask for the best order, has a timeout, and turns an empty result into a "no driving route" error.
- Add `LegsService`: `updateLegs()`, with waypoint placement and the stop-order calls, and `detourTimesOf()`.
- Add the legs to the finish step of a write, and the leg changes to what a write hands back.

**Done when:**

- Tests with a fake route finder cover adding, re-routing, and removing a leg.
- On San Francisco Day 2, with only First Awakenings selected, the Big Sur waypoint goes between First Awakenings and San Luis Obispo.
- A failed Google call refuses the whole write, and nothing is saved.
- A real run routes San Francisco Day 2 through Big Sur, with a drive time close to Google Maps'.

**Ends in:** a PR.

### Phase 20. Feasibility checks

**Design:** [Technical spec](../design/technical-spec.md), section 8. [Domain model](../design/domain-model.md), sections 3.3 and 4.8.

**Do:** add the `FeasibilityChecker`, and run it in the finish step of the coordinator's writes.

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

**Design:** [Tool design](../design/tools.md), sections 2.1 (`read_itinerary`) and 4. [Technical spec](../design/technical-spec.md), section 7.2.

**Do:**

- Add `read_itinerary`, for the whole trip or scoped to a day, stay, or stop. Leave out route lines.
- Measure a full read of a 14-day trip, and find the limit on an in-process MCP tool's result. Tool design section 2.1 says the limit hasn't been checked.

**Done when:**

- Tests on the example trips show what each scope returns.
- The measured size and the limit are written into tool design section 2.1. If a full read would be cut off, Joe hears about it before the next phase.

**Ends in:** a PR.

### Phase 22. Build the skeleton

**Design:** [Tool design](../design/tools.md), sections 2.1 (`update_itinerary`, `add_stay`, `update_stay`, `remove_stay`, `update_day`, `set_waypoints`) and 2.4. [Technical spec](../design/technical-spec.md), sections 4.1, 4.2 (discovery, shape, and skeleton), and 5.2.

**Do:**

- Add these tools and `compute_route`. Each write's reply is built from what the write hands back, as tool design section 2.1 says.
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

**Do:**

- Add `add_lodging_candidates` and `add_stop_candidates`.
- Add the stay researcher, with only its tools, and its instructions.
- Settle the worker brief and result formats (technical spec, open question 1), and write them into the technical spec once Joe agrees.
- Add the coordinator's instructions for the fill round, and give it the `Agent` tool.
- Test resuming a session whose transcript ends in a worker call that never got its result (persistence design, section 9).

**Done when,** in chat:

- The Moab stay researcher adds three mid-range lodging candidates and fills the stops near the Moab stay.
- The coordinator sees one line per candidate, not full records.
- The resume test's result is written into persistence design section 9.

**Ends in:** a PR.

### Phase 28. The leg scout

**Design:** [Technical spec](../design/technical-spec.md), section 6.2. [Tool design](../design/tools.md), sections 2.1 (detour times) and 4. [Domain model](../design/domain-model.md), section 4.7.

**Do:**

- Add the leg scout, its instructions, and detour times in `add_stop_candidates`.
- Add the hook that denies a leg scout's web search unless it's limited to `atlasobscura.com`.
- Measure how long real writes take. Set each Google call's timeout and a time limit for the whole write (persistence design, section 9).

**Done when:**

- The San Francisco Day 2 leg scout fills Point Lobos, Bixby Creek, and lunch with candidates that have detour times.
- A test shows the hook denies a leg scout's search with no domain limit.
- Two stay researchers and a leg scout run at once, and none loses another's candidates.

**Ends in:** a PR.

### Phase 29. Option cards

**Design:** [Functional spec](../design/functional-spec.md), sections 7.1, 7.5, and 7.6. [Technical spec](../design/technical-spec.md), sections 4.2 (refine), 7.2, and 9. [Domain model](../design/domain-model.md), section 3.9.

**Do:**

- Show an option card for the newest candidate set of each stop and stay with nothing selected, with each candidate's details. Select, More options, Higher tier, and Lower tier each send a message to the coordinator.
- Add the coordinator's instructions for card actions and budget tiers.

**Done when,** on the live site:

- Hotel cards for one-night stays show value options, and longer stays show mid-range, with the rule shown (functional spec 11, S5).
- "Higher tier" then Select updates the itinerary, and the coordinator confirms in chat (functional spec 11, S6).

**Ends in:** a PR.

### Phase 30. Weather data

**Design:** [Google design](../design/data-sources/google.md), section 3. [Open-Meteo design](../design/data-sources/open-meteo.md). [Tool design](../design/tools.md), section 2.5.

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

**Design:** [Technical spec](../design/technical-spec.md), sections 5.2 and 9. [Tool design](../design/tools.md), section 5 (open question 1).

**Do:**

- Go through every item in technical spec sections 5.2 and 9, and make sure the instructions cover it. Add what's missing, such as the opening line of a new session and "what's left to decide?"
- Watch for wrong tool choices, since the coordinator has about two dozen tools (tool design, open question 1). Tell Joe if merging tools looks needed.

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

**Do:** add real-agent tests for acceptance scenarios S1 to S13, and the three memory tests in technical spec section 3.1.

**Done when:** each test passes, and the results are in the PR.

**Ends in:** a PR.
