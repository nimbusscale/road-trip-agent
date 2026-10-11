# Road Trip Planner: Tool Design (MVP)

This document covers the agents' custom tools: which MCP server each tool is on, what it takes and returns, and which agents get it. Inputs and outputs are listed at the same level of detail as the [technical spec](technical-spec.md). Exact fields are settled during development. For where each tool's data comes from, see the [data sources index](data-sources.md).

**Terms used here:**

- **MCP server:** a named set of tools, made in our app's code with the Agent SDK's `createSdkMcpServer`. Its tools run inside our app. It is not a separate process, container, or machine.
- **Session:** one user's conversation with the agent about one trip.
- **Trip brief** and **worker brief:** the trip brief is what the user wants from the whole trip (functional spec 5.2). A worker brief is the part of it that one worker gets, plus the stop and stay IDs it fills (technical spec 5.3). This document always says which one it means.

---

## 1. How tools are grouped into MCP servers

**MCP servers are grouped by job, not by vendor and not by agent.** An MCP server's name is part of every tool name the model sees, such as `mcp__places__search_near`. Naming by job keeps that name stable when a source changes. Example: the server is `places`, not `google`. If place data later came from somewhere else, nothing the agent sees would change.

**One source can serve several jobs, and one job can use several sources.** The Google client is shared code used by the `places`, `routing`, and `weather` MCP servers. The `weather` MCP server uses Google for forecasts and Open-Meteo for seasonal averages.

**Grouping is separate from access.** An MCP server can hold tools for the coordinator and tools for workers. Each agent gets exactly the tools it uses (section 3).

| MCP server | Job | Sources behind it |
|---|---|---|
| `trip` | The trip brief and the itinerary, including candidates and feasibility checks | Our storage. Google Routes, to re-route legs |
| `memory` | User memory and trip memory | Our storage |
| `places` | Finding places and reading their details | Google Places |
| `routing` | Rough drive times for the coordinator's checks | Google Routes |
| `weather` | Forecasts and seasonal averages | Google Weather, Open-Meteo |

Web search is Claude's built-in `WebSearch` and `WebFetch` ([web search design](data-sources-web-search.md), section 1), not one of our MCP servers. The coordinator calls workers with the SDK's built-in `Agent` tool.

---

## 2. Tools

### 2.1 Trip

The coordinator's tools for the trip brief and itinerary, plus the workers' tools for adding candidates and saving weather text.

**Reading:**

| Tool | Does | Returns |
|---|---|---|
| `read_trip_brief` | Reads the trip brief | Every item in functional spec 5.2 |
| `read_itinerary` | Reads the whole itinerary, or one part of it. Optional scope: a day ID (the day, its leg, its stops, and their candidates), a stay ID (the stay, its days and their stops, and stops on other days whose search area is this stay), or a stop ID (the stop and its full candidate history) | With no scope: start and end places, start date, stays with their nights, and days with their dates, start times, stops, and legs. Each day's schedule, worked out: each stop's arrival and departure, free time, and the arrival where the party sleeps (technical spec 3.1). For each stop and stay: its selected place, if any, with its rationale, every candidate, in the order offered, each with its set number, and its rejected places with their reasons. Each place is shown as its name and short line (technical spec 7.2). A read scoped to a stop or stay also gives every candidate's rationale. Each stay's weather and clothing text, marked out of date when the stay's place or dates no longer match the ones it was written for. Each day's and stop's approvals, each marked as applying or not. Current check results, each marked new or already known, with approved warnings marked approved. A scoped read returns the same details for its part only, with the results for that part |

**Scoped reads keep the coordinator's context small.** A whole read of a 14-day trip with a few "more options" rounds is about 300 candidate lines, or roughly 20,000 tokens. Every read stays in context, and older copies go out of date. Most questions are about one part, such as "what's on Day 2" or "what's tied to Moab," so the coordinator asks for that part by ID. Claude Code may also cut off large tool results. The default limit for MCP tools is believed to be 25,000 tokens, but that hasn't been checked for in-process MCP servers. The scopes are IDs, not a query language, so a bad request gets an error instead of quietly returning nothing.

**Writing.** Every write makes the follow-on changes itself, such as re-routing legs or adding days (technical spec 3.5). Its reply carries only what code worked out: each re-routed leg's new drive time and distance, anything the tool did on its own, such as days added, the stops on any day whose start or end changed, and the check results for everything it touched, marked new or already known (technical spec, section 8). It doesn't echo back what the coordinator sent. Example: "Moved Corona Arch to Day 3, after Windows. Day 2: 2 h 10 m → 1 h 30 m. Day 3: 0 h → 45 m. No new warnings." For more, the coordinator uses a scoped read:

| Tool | Does | Takes |
|---|---|---|
| `update_trip_brief` | Changes one or more items in the trip brief. Items not given are left alone. An item that holds a list, such as must-sees, is replaced as a whole | The items and their new values |
| `update_itinerary` | Changes the itinerary's own properties. Properties not given are left alone | Any of: start place ID with a name, end place ID with a name, start date. The name is required with the place. It is used only when Google has no name for the place, such as "Mike's house" for an address (technical spec 3.1). For a loop, the start and end are the same place |
| `add_stay` | Adds a stay, and one day for each of its nights. The reply lists the stops on any day whose start or end changed (technical spec 3.5) | Place ID (usually a town), the stay it goes after or "first", and number of nights. Optional: lodging tier and the rule that produced it. Rejected until the itinerary has a start date, start place, and end place (technical spec 4.2) |
| `update_stay` | Changes a stay | Stay ID, and any of: a new place ID, the stay it now goes after or "first", number of nights, lodging tier and rule. Changing the nights adds or removes days at the end of the stay's days. Moving the stay lists the stops on any day whose start or end changed (technical spec 3.5). Setting the tier records the stay's current nights with it (technical spec section 9). Removing a night is refused while that day holds stops, and the error lists them |
| `remove_stay` | Removes a stay and its days. Refused while any stop is on its days, or while any stop anywhere has the stay as its search area. The error lists those stops by name and ID (technical spec 3.5) | Stay ID |
| `update_day` | Changes a day: whether it's a rest day, its start time, and its approvals. A day that moves to a new stay, and the last day, can't be rest days. Marking a rest day removes the day's leg and its waypoints (technical spec 3.1). Setting an approval replaces any of the same kind (technical spec section 8) | Day ID, and any of: rest day or not, start time (a time, or "none" to use the trip brief's usual start time), approve drive hours (hours and a reason), approve route type (type and a reason), and remove an approval (its kind). An approval without a reason is rejected |
| `add_stops` | Adds empty stops to a day, in order. The reply gives the new stops' IDs, in order | Day ID, the stop the list goes after or "first", and an ordered list of one or more stops. Each item takes a kind (meal or attraction), a purpose (a short note on what the stop is for, never when, such as "dessert"), a search area: near a stay, as its ID, or along the leg, and a set time: a time, or "none" to follow the stop before it. Meals also take a tier and the rule that produced it. A stay that isn't where the party slept the night before or sleeps that night is rejected. "Along the leg" is rejected on a day that starts and ends at the same stay |
| `update_stop` | Changes a stop's set time, visit time, tier, or approvals. Its kind, purpose, and search area can't change | Stop ID, and any of: set time (a time, or "none"), visit time (rejected while no place is selected), tier and rule (meal stops), approve opening hours (a reason; the tool records the selected place and how many minutes of the visit fall within its opening hours), and remove an approval (its kind). An approval without a reason is rejected |
| `move_stop` | Moves a stop within its day or to another day. It keeps its candidates, selection, and visit time. The legs of the day it left and the day it joined are both re-routed. A move that would change the stop's search area is rejected, and the error says to remove the stop and add a new one | Stop ID, day ID, the stop it goes after or "first", and a set time: a time, or "none". All are required. The set time is required so an old one never carries over: moving dinner to breakfast restates its time or drops it |
| `remove_stops` | Removes stops and their candidates | A list of one or more stop IDs |
| `update_leg` | Sets a day's waypoints. An empty list clears them. Rejects a day with no leg, such as a rest day. Code places the waypoints among the day's selected stops (technical spec 3.3) | Day ID, and waypoints as place IDs |
| `select_candidate` | Selects one of a stop's or a stay's candidates. For a stop, sets its visit time: the candidate's estimate for an attraction, or one hour for a meal (technical spec 3.1) | Stop or stay ID, and a place ID. A place that isn't already a candidate there is rejected, and the error says to use `select_user_place` |
| `select_user_place` | Selects a place the user specified, such as a friend's house. Adds it as a candidate in a new set of one, marked "specified by the user," then selects it (technical spec 3.2) | Stop or stay ID, place ID, name, type, and the user's reason. Attraction stops also take a visit time, which becomes the stop's. A meal stop's visit time is one hour. A place that's already a candidate there is rejected, and the error says to use `select_candidate` |
| `clear_selection` | Rejects the selected place on a stop or a stay's lodging and starts it over. Clears the selection, removes its candidates, and adds the place to its rejected places with the reason. Its status goes back to empty (technical spec 3.2). The legs it affects are re-routed (technical spec 3.5). A stop or stay with no selection is rejected | Stop or stay ID, and the reason |
| `set_stay_weather` | Saves a stay's weather and clothing text. Called by the weather worker, not the coordinator | Stay ID, the text, and whether it is a forecast or seasonal averages. The tool records the stay's current place and dates with it, so later changes can mark it out of date (technical spec 3.5) |

**A stop's kind, purpose, and search area are fixed** (technical spec 6). Its candidates were found for that kind and purpose, in that area. A stop with a different kind, purpose, or area is a different stop, so the coordinator removes it and adds a new one. A move keeps the search area when it stays valid. A stop near a stay can move to any day that starts or ends at that stay. A stop along the leg can move only within its own day, since another day has a different leg. Example: moving Moab lunch from Day 2 to Day 3 is allowed. Moving it to the Torrey day is rejected.

**Laying out a day takes one `add_stops` call.** The day's stops are one ordered list, so San Francisco Day 2 is one call with seven items.

**Times are clock times,** such as "7:00 p.m." A time after midnight is given as the next day, such as "1:00 a.m., next day," so it can't be read as an early start (technical spec 3.1). A set time and a day's start time take "none" rather than a blank, because in the update tools a blank means "don't change it."

**There are no tools to add or remove days.** Days follow from stays' nights, and the last day is created with the itinerary (technical spec 3.1).

**Where an item goes.** Tools never take position numbers, which are easy to get wrong after items have been added or removed. Instead, a tool takes the item to go after, or the word "first". That input is required whenever an item is placed. It is never left blank. In the update tools a blank means "don't move it," so a blank can't also mean "first."

- **Stays** take the stay they go after, or "first". Example: to put Big Sur between Monterey and San Luis Obispo, add it after the Monterey stay.
- **Stops** always take a day, plus the stop they go after on that day, or "first". `add_stops` and `move_stop` work the same way. `add_stops` places its whole list after the stop given, in list order. If the stop given isn't on that day, the tool rejects the call. The day doubles as a check that the coordinator meant the one it named. Example: to move Denny's from dinner to breakfast, move it "first" on its day, with a set time of "7:30 a.m." or "none".

**Adding candidates (workers):**

| Tool | Does | Takes |
|---|---|---|
| `add_stay_candidates` | Adds one set of lodging candidates to a stay | Stay ID, and for each candidate: place ID, name, type, rationale, tier and rule, how it was found with the source link, and notes, such as "closed Mondays" or "reservations advised" |
| `add_stop_candidates` | Adds one set of candidates to a stop. For a stop along the leg, works out each candidate's detour time itself, with one routing call against the stop's day's leg as it is then. A stop near a stay gets no detour time | Stop ID, and for each candidate: place ID, name, type, rationale, how it was found with the source link, and notes. Meal stops also take a tier and rule. Attraction stops also take a visit time, the worker's estimate |

**The place ID comes from a search or from `find_place`.** A place found by web search is looked up with `find_place`, by name and town. If Google doesn't list it but the source gives a street address, the worker looks up the address instead. If there's neither, the worker drops the find ([web search design](data-sources-web-search.md), section 4).

**Name and type are always required,** even when Google has them, so the worker never has to decide whether to pass them. A place looked up by its address has no name or type on Google. Cards show Google's name whenever Google has one, so the given name is used only for a place Google has no name for. The first candidate that offers a place sets that name, and the type cards show, whether a worker added it or the user specified it (`select_user_place`). Later candidates for the same place don't change them. Places are matched by Google place ID only.

**The other inputs follow the stop's kind, and they're required.** Tier and rule are for lodging and meal stops. Attractions have no tier. Visit time is for attraction stops, whatever the place is. Example: a barbecue joint on a barbecue trip, filling an attraction stop, needs a visit time and has no tier. A call missing a required input is rejected.

**Each call is one set** of one to three candidates. The tool assigns the set number (technical spec 3.2). A worker adds all of a stop's or stay's candidates in one call. A second call makes a new set, and the option card shows only the newest set. The tool's reply names the set it made, such as "Set 1 for stop_k7m2x9qa: 3 candidates," with one line per candidate. The worker passes those lines on in the result it returns to the coordinator.

**A repeat rejects the whole call.** If any place is already a candidate for the same stop or stay, or was rejected for it, nothing is added, and the error names the repeat. So a set is never partly written. The same place can still be a candidate for a different stop or stay. Example: the Palace Hotel can be a lodging candidate for a stay and also a candidate for a stop (technical spec 3.2).

**Adding a set to a stop or stay that already has a selection keeps the selection.** That happens when the user asks for more options after choosing. The selected place is still one of the candidates, in an older set. Candidates are never changed after they're written.

**One tool for every stop, because code knows whether a detour applies.** Detour time is the extra driving off a leg's route, and only stops along the leg have one. The stop's search area already says which kind it is (technical spec 3.1), so the worker passes the same inputs either way. Example: candidates for Goblin Valley, along the Moab Day 4 leg, get detour times off the Moab-to-Torrey route. Candidates for lunch near the Moab stay don't, because there's no route to detour from. Each worker's brief holds only its own stops, so the stay researcher and the leg scout share the tool.

### 2.2 Memory

Coordinator only. Workers never see memory (technical spec 6.4).

| Tool | Does | Takes |
|---|---|---|
| `read_memory` | Reads user memory and this trip's memory | Nothing |
| `add_memory_item` | Adds an item | User or trip, and the text |
| `update_memory_item` | Rewrites an item | Item ID and the new text |
| `forget_memory_item` | Removes an item | Item ID |

### 2.3 Places

Every search saves its results as places in the trip's data and returns their IDs. A place found twice is stored once (technical spec 3.1). Each result's text from outside sources is labeled as data, not instructions.

| Tool | Does | Takes | Returns |
|---|---|---|---|
| `find_place` | Finds a named place: a town, a must-see, an address, a place the user names, or a place a worker found by web search | Text, and where to search: a town, region, or state. When unsure, the state | The best few matches, each with place ID, name, address, and type |
| `read_place` | Reads a place's full record | Place ID | Everything stored: hours, coordinates, rating, summary, links |
| `search_near` | Finds hotels, restaurants, or attractions near a stay | A stop or stay ID from the worker brief, and what to look for | Matches with the details the worker needs to choose: rating, review count, price level, hours on the stop's or stay's dates, summary, links |
| `search_along_leg` | Finds places along a day's route | Day ID and what to look for | The same details as `search_near`, plus a rough detour time for each, and the drive time from the leg's start to it. Places within a few miles of either end are dropped, and the rest are sorted by position along the route ([Google design](data-sources-google.md), 2.3 and 2.4). The few miles is a setting |

**`find_place` adds where to search to the text,** as in "McDonald's, Salinas, CA." That keeps a lookup from returning matches from anywhere. It asks Google for hours and ratings as well as the basics, so a place the user names, such as "dinner at the Whaling Station," can go through the opening-hours check. Each match's address shows the agent whether it found the right place. A place found by web search gets the same lookup, and its Google hours and rating are used like any other place's ([web search design](data-sources-web-search.md), section 4).

**`search_near` finds the point and the dates itself,** from the stop or stay. The point is the stay's lodging if one is selected, or the stay's town if not. For a stop, it's the stay in the stop's search area. A stop along the leg is rejected, and the error says to use `search_along_leg`. How far counts as near is a setting. To search somewhere farther, the worker names it in the query, such as "restaurants in Tuolumne Meadows." Hours come back for the stop's or stay's dates only, such as "Sat Oct 10: 11 AM–9 PM. Sun Oct 11: closed."

**There is no price level input.** Results show each restaurant's price level, and the worker judges the tier from it, as it does for hotels from their summaries. A price filter would likely drop places with no price level listed (not tested).

**`search_along_leg` reads the route line itself,** from the day's leg in the trip. The route line is large, so it never passes through the leg scout's context.

### 2.4 Routing

| Tool | Does | Takes | Returns |
|---|---|---|---|
| `compute_route` | Works out a rough route for the coordinator's planning, such as a shape sketch (technical spec 4.2). One call can cover the whole trip | Points in order, each a place ID or a plain name, and each marked as a stop or as pass-through. Order: "keep" or "fastest" | Drive time and distance from each stop to the next, and in total. The order used. The place each plain name resolved to. No route line |

**A point is a stop or a pass-through point.** Stops are where the party stops, usually towns that might become stays. Pass-through points are waypoints: places the road must pass through without stopping, to steer the route. They go in the same list, where the coordinator wants them. Example: Grand Junction (stop), Dewey Bridge (pass-through), Moab (stop). A pass-through point doesn't split the times. Grand Junction to Moab comes back as one drive time, through Dewey Bridge.

**The coordinator places waypoints here, but code places them on a leg** (technical spec 3.3). A leg's stops change after its waypoints are set, so a waypoint placed by hand could end up next to the wrong stop. A `compute_route` call is one-off, so its order can't go stale.

**Order "fastest" lets Google rearrange the middle stops** into the fastest driving order. The first and last stay where they are. "Keep" leaves them as given. Google can't rearrange stops and steer through waypoints in one call, so "fastest" with any pass-through point is rejected with an error that says so. To get both, call once with "fastest", then again with "keep" and the pass-through points added.

**Plain names are allowed** so a sketch doesn't need a lookup for every town. A name can resolve somewhere unexpected without any error. In testing, "Dewey Bridge, UT" resolved to Salt Lake City. So the tool returns the place each name resolved to, and the coordinator can spot a bad match. Waypoints on the itinerary's legs are always place IDs (technical spec 3.3).

**There is no route type input.** It would change nothing in the call to Google. A route is made scenic with waypoints, or with stops that already pull it onto the scenic road (technical spec 3.3).

Routes on the itinerary's legs are computed and stored by the `trip` tools when a write changes them, one day at a time, not with this tool (technical spec 3.4).

### 2.5 Weather

Weather worker only.

| Tool | Does | Takes | Returns |
|---|---|---|---|
| `stay_weather` | Weather for a stay's dates | Stay ID, and a place ID: the stay's town, or an attraction far from it, such as Tuolumne Meadows on a Yosemite stay | A daily forecast if every one of the stay's dates is within 7 days: highs, lows, conditions, and chances of rain and thunderstorms ([Google design](data-sources-google.md), section 3). Seasonal averages otherwise: average highs and lows, chances of rain and snow, and shares of hot days and freezing nights ([Open-Meteo design](data-sources-open-meteo.md), 2.3). Labeled with which one it is |

**Code picks the source, not the worker.** The dates come from the stay, so the worker can't ask for a forecast too far out.

**The weather worker saves its own text** with `set_stay_weather` (2.1), and returns one line per stay to the coordinator.

---

## 3. Who gets which tool

| Tool | Coordinator | Stay researcher | Leg scout | Weather and clothing worker |
|---|---|---|---|---|
| `trip`: `read_trip_brief` | Yes | | | |
| `trip`: `read_itinerary` | Yes | | | |
| `trip`: `update_trip_brief` | Yes | | | |
| `trip`: `update_itinerary` | Yes | | | |
| `trip`: `add_stay` | Yes | | | |
| `trip`: `update_stay` | Yes | | | |
| `trip`: `remove_stay` | Yes | | | |
| `trip`: `update_day` | Yes | | | |
| `trip`: `add_stops` | Yes | | | |
| `trip`: `update_stop` | Yes | | | |
| `trip`: `move_stop` | Yes | | | |
| `trip`: `remove_stops` | Yes | | | |
| `trip`: `update_leg` | Yes | | | |
| `trip`: `select_candidate` | Yes | | | |
| `trip`: `select_user_place` | Yes | | | |
| `trip`: `clear_selection` | Yes | | | |
| `trip`: `set_stay_weather` | | | | Yes |
| `trip`: `add_stay_candidates` | | Yes | | |
| `trip`: `add_stop_candidates` | | Yes | Yes | |
| `memory`: `read_memory` | Yes | | | |
| `memory`: `add_memory_item` | Yes | | | |
| `memory`: `update_memory_item` | Yes | | | |
| `memory`: `forget_memory_item` | Yes | | | |
| `places`: `find_place` | Yes | Yes | Yes | |
| `places`: `read_place` | Yes | | | |
| `places`: `search_near` | | Yes | | |
| `places`: `search_along_leg` | | | Yes | |
| `routing`: `compute_route` | Yes | | | |
| `weather`: `stay_weather` | | | | Yes |
| Built-in `WebSearch` | | Yes | Yes, Atlas Obscura only | |
| Built-in `WebFetch` | | Yes | | |
| Built-in `Agent`, to call workers | Yes | | | |

That's 24 tools for the coordinator, counting `Agent`, 6 for the stay researcher, 4 for the leg scout, and 2 for the weather worker.

The leg scout gets `WebSearch` only for Atlas Obscura, and a hook enforces it (section 4). Atlas Obscura blocks `WebFetch` ([web search design](data-sources-web-search.md), section 3), so the leg scout gets no `WebFetch`.

---

## 4. Rules for all tools

- **The trip comes from the session, never from a tool input.** Each session gets its own MCP server objects, made with the trip and user already set. They are small wrappers around shared tool code. One object can't be shared by two sessions running at once (tested: the second session silently got no tools). No tool takes a trip ID, so no agent can reach another trip, even with a made-up ID.
- **Bad IDs are rejected** (technical spec 7.1). A stop, stay, day, or place that doesn't exist in this trip returns an error. So does selecting a place that isn't one of that stop's or stay's candidates. The tool never guesses.
- **IDs are short and random, with a prefix for the kind of item,** such as `stop_k7m2x9qa` (technical spec 7.1). A worker only sees the IDs in its worker brief, and can't guess any others. So it can only add candidates to its own stops and stay, without the tools needing to know which worker is calling. An ID of the wrong kind, such as a stay ID passed to `update_stop`, gets an error that says so.
- **The leg scout's web search is limited by a hook, not only by its instructions.** A PreToolUse hook, code our app runs before every tool call, sees which kind of agent is calling. It denies a leg scout's `WebSearch` unless the search is limited to `atlasobscura.com`, with a reason the leg scout can read.
- **Errors are readable.** A failed call, a spent API limit, or a broken rule comes back as a message. The agent that called the tool can read it, and the coordinator can explain it to the user.
- **The coordinator sees short lines, not full records** (technical spec 7.2). Only `read_place` returns a full record to the coordinator.

---

## 5. Open questions

1. **Tool count for the coordinator.** It has about two dozen tools. If that proves too many for it to choose well, merge the add, update, and remove tools for each kind of item.
2. **Places nobody uses.** Searches save every result, and most are never offered as candidates. That is harmless for the MVP. Clean them up later if storage grows.
