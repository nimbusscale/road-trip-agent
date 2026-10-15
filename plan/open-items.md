# Road Trip Planner: Open Items

This document lists what's still open: questions the design left for later, things to check, and ideas set aside during development. Each item says which phase of the [development plan](development-plan.md) settles it, or "none yet."

**How to use it:**

- **Add an item as soon as something is set aside,** in chat or during a phase. Give it the next number. Say where it came from and what would settle it.
- **Numbers never change.** Other docs and PRs refer to an item by its number, such as "open item 15."
- **When an item is settled,** write the decision into the design doc it belongs to. Then strike the item through here, and add a line saying when and how it closed, such as "**Closed 2026-11-02:** settled in phase 3, see persistence design section 1." Closed items stay in the list.

The items below were gathered on 2026-10-15 from the open questions and "left for development" sections of the design docs, which were then removed, plus items still open in `research/`.

| # | Item | From | Settled in |
|---|---|---|---|
| 1 | **The Docker Compose file, the Caddy config, and the GitHub Actions workflow.** | Systems design | Phases 4 and 6 |
| 2 | **The database library and migration tool.** The library should send queries to Postgres directly, rather than map each class to a table of its own, since the plan is one document (persistence design, section 2). | Systems design, persistence design | Phase 3 |
| 3 | **Table and column layout, indexes, and migrations.** | Persistence design | Phase 10 onward, as each phase adds tables |
| 4 | **How the home screen finds each trip's name, dates, and last updated:** from the plan document, or from extra columns. | Persistence design | Phase 10 |
| 5 | **How long a write waits for the row lock, and retrying "trip busy."** A write refused because it waited too long is retried by the tool a few times, with a short pause, before the error goes back. No agent has to understand the lock. | Persistence design | Phase 10 |
| 6 | **Access checks.** `TripReader.read()`, `PlaceReader.get()`, and `SessionReader.get()` take no owner. The memory classes do take the user. The app checks that the signed-in user owns the trip before it makes a session's tools. `read_place` checks that the place belongs to the session's trip. | Persistence design | Phases 14 and 15 |
| 7 | **How many days of backups to keep.** | Systems design | Phase 7 |
| 8 | **Whether the container images are private,** and if so, how the server signs in to pull them. | Systems design | Phase 6 |
| 9 | **How the app gets the Supabase project's public signing keys,** and how often it refreshes them. | Systems design | Phase 8 |
| 10 | **How the server signs in to the Claude Max plan,** such as a long-lived sign-in token or an API key drawing on the plan's credits, and which value goes in the `.env` file. | Systems design | Phase 9 |
| 11 | **The transcript adapter's code,** and where the Agent SDK's local scratch files go. | Persistence design | Phase 12 |
| 12 | **The time zone lookup** from a place's coordinates, with no outside call. | Persistence design | Phase 17 |
| 13 | **The size limit on a tool's result.** Claude Code may cut off large tool results. The limit for MCP tools is believed to be 25,000 tokens, but it hasn't been checked for in-process MCP servers. A full read of a 14-day trip is roughly 20,000 tokens. | Tool design, section 2.1 | Phase 21 |
| 14 | **Whether Google gives no name for an address.** If it returns the street as the name, "Mike's house" never fills in (domain model 3.10). | Research, domain model notes | Phase 15 |
| 15 | **Worker brief and result formats.** Technical spec section 5.3 lists the contents, not the exact fields. | Technical spec | Phase 27 |
| 16 | **Resuming after a worker call with no result.** After a restart, the coordinator's transcript can end in an `Agent` call that never got its result. Test what the SDK does with it. If it won't resume, the adapter drops the unfinished line. | Persistence design | Phase 27 |
| 17 | **Google call timeouts, and a time limit for the whole write.** One write can make several calls, such as selecting Moab lodging, which re-routes four days. Measure real times before setting them. | Persistence design | Phase 28 |
| 18 | **The coordinator's tool count.** It has about two dozen tools. If that proves too many for it to choose well, merge the add, update, and remove tools for each kind of item. | Tool design | Phase 32 |
| 19 | **Which attractions show a rating and review count.** A national park or a historic plaque shows none (functional spec 7.5). | Functional spec, section 7.5 | Phase 29 |
| 20 | **Whether Google's terms require the "Summarized with Gemini" label** wherever a Places summary appears. | Research, data sources | Phase 29 |
| 21 | **Whether the first day of a Google Weather forecast is today.** Not yet confirmed in testing (Google design, section 3). | Google design, section 3 | Phase 30 |
| 22 | **Meal coverage.** Recommend every meal, or only lunch and dinner by default? It depends on data quality. | Functional spec | None yet |
| 23 | **How much of the Max plan a search-heavy planning session uses.** Check the usage bars before and after a run. | Research, data sources | None yet. The walk-throughs, phases 34 and 35, would show it |
| 24 | **Google's real prices.** Which price level each kind of Places and Routes request lands in, what Google Weather costs, and whether calls count against the free monthly calls or the trial credit. Joe checks in the Google Cloud console. | Research, data sources and maps evaluation. Google design, section 5 | None yet |
| 25 | **What Atlas Obscura's terms of use say about automated access.** The terms page blocks automated reads, so it has to be read in a browser. | Research, data sources and attractions | None yet |
| 26 | **A reviewer.** A later worker that reads the finished itinerary with fresh eyes and checks it against the trip brief. Not in the MVP. | Technical spec | None yet |
| 27 | **An interview agent** that scopes the trip with the user, then hands the coordinator a summary (technical spec, section 2). Revisit if the coordinator's discovery turns out weak. | Technical spec | None yet |
| 28 | **Trip-level states.** Item-level status (functional spec 7.6) covers the need for now. Revisit with versioning in MVP+1. | Functional spec | None yet |
