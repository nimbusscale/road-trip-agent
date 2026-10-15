# Road Trip Planner: Open Items

This document lists what's still open and has no phase to settle it: questions nobody has a plan for yet, things to check, and ideas set aside. A question that a phase will answer goes in that phase's open questions, in the [development plan](development-plan.md), not here.

**How to use it:**

- **Add an item as soon as something is set aside,** in chat or during a phase. Give it the next number, and say where it came from.
- **Numbers never change.** Other docs and PRs refer to an item by its number, such as "open item 3."
- **When an item is settled, or a phase takes it on,** strike it through and add a line saying when and how, such as "**Moved 2026-11-02:** to phase 29's open questions." Write any decision into the design doc it belongs to. Struck items stay in the list.

| # | Item | From |
|---|---|---|
| 1 | **Meal coverage.** Recommend every meal, or only lunch and dinner by default? It depends on data quality. | Functional spec |
| 2 | **Google's real prices.** Which price level each kind of Places and Routes request lands in, what Google Weather costs, and whether calls count against the free monthly calls or the trial credit. Joe checks in the Google Cloud console. | Research. Google design, section 5 |
| 3 | **What Atlas Obscura's terms of use say about automated access.** The terms page blocks automated reads, so it has to be read in a browser. | Research |
| 4 | **A reviewer.** A later worker that reads the finished itinerary with fresh eyes and checks it against the trip brief. Not in the MVP. | Technical spec |
| 5 | **An interview agent** that scopes the trip with the user, then hands the coordinator a summary (technical spec, section 2). Revisit if the coordinator's discovery turns out weak. | Technical spec |
| 6 | **Trip-level states.** Item-level status (functional spec 7.6) covers the need for now. Revisit with versioning in MVP+1. | Functional spec |
| 7 | **Root sign-in over SSH.** The server still lets root sign in with a key. Password sign-in is off. Turn root sign-in off once nothing needs it. | Phase 5 |
| 8 | **The deploy key is as strong as root.** Anyone in the `docker` group can take over the server, so the deploy key in GitHub's secrets can too. This comes with the design, but it isn't written down in systems design section 8 yet. | Phase 5 |
