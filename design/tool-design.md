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

The coordinator's tools for the trip brief and itinerary, plus the workers' tools for adding candidates.

**Reading:**

| Tool | Does | Returns |
|---|---|---|
| `read_trip_brief` | Reads the trip brief | Every item in functional spec 5.2 |
| `read_itinerary` | Reads the whole itinerary | Start and end places, start date, stays with their nights, and days with their dates, stops, and legs. For each stop and stay: its selected place, if any, and every candidate ever offered, in the order offered, each with its set number. Each place is shown as its name and short line (technical spec 7.2). Each stay's weather and clothing text, marked out of date when the stay's place or dates no longer match the ones it was written for. Current feasibility results |

**Writing.** Every write returns the feasibility results (technical spec, section 8). It also makes the follow-on changes itself, such as re-routing legs or adding days (technical spec 3.5):

| Tool | Does | Takes |
|---|---|---|
| `update_trip_brief` | Changes one or more items in the trip brief. Items not given are left alone. An item that holds a list, such as must-sees, is replaced as a whole | The items and their new values |
| `update_itinerary` | Changes the itinerary's own properties. Properties not given are left alone | Any of: start place ID, end place ID, start date. For a loop, the start and end are the same place |
| `add_stay` | Adds a stay, and one day for each of its nights | Place ID (usually a town), the stay it goes after or "first", and number of nights. Optional: lodging tier and the rule that produced it |
| `update_stay` | Changes a stay | Stay ID, and any of: a new place ID, the stay it now goes after or "first", number of nights, lodging tier and rule. Changing the nights adds or removes days at the end of the stay's days |
| `remove_stay` | Removes a stay, its days, and their stops | Stay ID |
| `set_rest_day` | Marks a day as a rest day, or not | Day ID, and rest day or not |
| `add_stop` | Adds an empty stop to a day | Day ID, the stop it goes after or "first", kind (meal or attraction), and time block. Meals also take a tier and the rule that produced it |
| `update_stop` | Changes a stop, or moves it, including to another day | Stop ID, and any of: kind, time block, tier and rule, approval to keep it despite its opening hours and the reason, and a move. A move takes a day ID and the stop it goes after or "first". A moved stop keeps its candidates and selection. The legs of the day it left and the day it joined are both re-routed. An approval without a reason is rejected |
| `remove_stop` | Removes a stop and its candidates | Stop ID |
| `update_leg` | Changes a day's leg. Properties not given are left alone, and an empty value clears one. Rejects a day with no leg, such as a rest day | Day ID, and any of: route type (scenic or fastest), waypoints, approved drive hours, approved route type, and the reason for an approval. An approved value without a reason is rejected |
| `select_candidate` | Selects one of a stop's or a stay's candidates | Stop or stay ID, and a place ID. A place that isn't already a candidate there is rejected, and the error says to use `select_user_place` |
| `select_user_place` | Selects a place the user specified, such as a friend's house. Adds it as a candidate in a new set of one, marked "specified by the user," then selects it (technical spec 3.2) | Stop or stay ID, place ID, name, type, and the user's reason. Attraction stops also take a visit time. A place that's already a candidate there is rejected, and the error says to use `select_candidate` |
| `clear_selection` | Clears the selected place from a stop or a stay's lodging. Its candidates stay, so its status goes back to proposed (technical spec 3.2). The legs it affects are re-routed (technical spec 3.5) | Stop or stay ID |
| `set_stay_weather` | Saves a stay's weather and clothing text from the weather worker | Stay ID, the text, and whether it is a forecast or seasonal averages. The tool records the stay's current place and dates with it, so later changes can mark it out of date (technical spec 3.5) |

**There are no tools to add or remove days.** Days follow from stays' nights, and the last day is created with the itinerary (technical spec 3.1).

**Where an item goes.** Tools never take position numbers, which are easy to get wrong after items have been added or removed. Instead, a tool takes the item to go after, or the word "first". That input is required whenever an item is placed. It is never left blank. In the update tools a blank means "don't move it," so a blank can't also mean "first."

- **Stays** take the stay they go after, or "first". Example: to put Big Sur between Monterey and San Luis Obispo, add it after the Monterey stay.
- **Stops** always take a day, plus the stop they go after or "first" in that day. `add_stop` and a move in `update_stop` work the same way. If the stop given isn't on that day, the tool rejects the call. The day doubles as a check that the coordinator meant the day it named.

**Adding candidates (workers):**

| Tool | Does | Takes |
|---|---|---|
| `add_stay_candidates` | Adds one set of lodging candidates to a stay | Stay ID, and for each candidate: place ID, name, type, rationale, tier and rule, how it was found with the source link, and notes, such as "closed Mondays" or "reservations advised" |
| `add_nearby_stop_candidates` | Adds one set of candidates to a stop near a stay | Stop ID, and for each candidate: place ID, name, type, rationale, how it was found with the source link, and notes. Meal stops also take a tier and rule. Attraction stops also take a visit time, the worker's estimate |
| `add_route_stop_candidates` | Adds one set of candidates to a stop along the drive | The same as `add_nearby_stop_candidates`, plus each candidate's detour time in minutes, from `search_along_leg` |

**The place ID comes from a search or from `find_place`.** A place found by web search is looked up with `find_place`, by name and town. If Google doesn't list it but the source gives a street address, the worker looks up the address instead. If there's neither, the worker drops the find ([web search design](data-sources-web-search.md), section 4).

**Name and type are always required,** even when Google has them, so the worker never has to decide whether to pass them. A place looked up by its address has no name or type on Google. The first candidate that offers a place sets the name and type that cards show, whether a worker added it or the user specified it (`select_user_place`). Later candidates for the same place don't change them. Places are matched by Google place ID only.

**The other inputs follow the stop's kind, and they're required.** Tier and rule are for lodging and meal stops. Attractions have no tier. Visit time is for attraction stops, whatever the place is. Example: a barbecue joint on a barbecue trip, filling an attraction stop, needs a visit time and has no tier. A call missing a required input is rejected.

**Each call is one set** of one to three candidates. The tool assigns the set number (technical spec 3.2). A worker adds all of a stop's or stay's candidates in one call. A second call makes a new set, and the option card shows only the newest set. The tool's reply names the set it made, such as "Set 1 for stop_k7m2x9qa: 3 candidates," with one line per candidate. The worker passes those lines on in the result it returns to the coordinator.

**A repeat rejects the whole call.** If any place was already offered for the same stop or the same stay, nothing is added, and the error names the repeat. So a set is never partly written. The same place can still be a candidate for a different stop or stay. Example: the Palace Hotel can be a lodging candidate for a stay and also a candidate for a stop (technical spec 3.2).

**Adding a set to a stop or stay that already has a selection keeps the selection.** That happens when the user asks for more options after choosing. The selected place is still one of the candidates, in an older set. Candidates are never changed after they're written.

**There are three tools so each one asks only for what it means.** Detour time is the extra driving off a leg's route, and only stops along the drive have one. The stay researcher's stops near a stay have no route to detour from, even on a day it drives between them. So the leg scout gets only `add_route_stop_candidates`, and the stay researcher gets the other two.

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
| `find_place` | Finds a named place: a town, a must-see, an address, a place the user names, or a place a worker found by web search | Text, and an optional point to search near | The best few matches, each with place ID, name, and short line |
| `read_place` | Reads a place's full record | Place ID | Everything stored: hours, coordinates, rating, summary, links |
| `search_near` | Finds hotels, restaurants, or attractions near a point | A place ID or coordinates, what to look for, and an optional price level | Matches with the details the worker needs to choose: rating, review count, price level, hours, summary, links |
| `search_along_leg` | Finds places along a day's route | Day ID and what to look for | The same details as `search_near`, plus a rough detour time for each |

**`search_along_leg` reads the route line itself,** from the day's leg in the trip. The route line is large, so it never passes through the leg scout's context.

### 2.4 Routing

| Tool | Does | Takes | Returns |
|---|---|---|---|
| `compute_route` | Works out a rough route for the coordinator's checks, such as a shape sketch (technical spec 4.2) | Points in order, as place IDs or plain names. Optional: route type, waypoints, and putting the middle points in the best order | Drive time and distance from each point to the next, and in total, and the order used. The route line goes to the UI, not to the model (technical spec 5.1) |

Plain names are allowed so a sketch doesn't need a lookup for every town. Routes on the itinerary's legs are computed and stored by the `trip` tools when a write changes them, not with this tool (technical spec 3.4).

### 2.5 Weather

Weather worker only.

| Tool | Does | Takes | Returns |
|---|---|---|---|
| `forecast` | Daily forecast | A place ID and dates within the next 7 days | Daily highs, lows, conditions, and chances of rain and thunderstorms ([Google design](data-sources-google.md), section 3) |
| `seasonal_averages` | Typical weather for the dates | A place ID and dates | Average highs and lows, chances of rain and snow, and shares of hot days and freezing nights, labeled as typical for the dates ([Open-Meteo design](data-sources-open-meteo.md), 2.3) |

---

## 3. Who gets which tool

| Tool | Coordinator | Stay researcher | Leg scout | Weather and clothing worker |
|---|---|---|---|---|
| `trip`: both reads, and the trip brief and itinerary writes (2.1) | Yes | | | |
| `trip`: `add_stay_candidates`, `add_nearby_stop_candidates` | | Yes | | |
| `trip`: `add_route_stop_candidates` | | | Yes | |
| `memory`: all (2.2) | Yes | | | |
| `places`: `find_place` | Yes | Yes | Yes | |
| `places`: `read_place` | Yes | | | |
| `places`: `search_near` | | Yes | | |
| `places`: `search_along_leg` | | | Yes | |
| `routing`: `compute_route` | Yes | | | |
| `weather`: all (2.5) | | | | Yes |
| Built-in `WebSearch` | | Yes | Yes | |
| Built-in `WebFetch` | | Yes | | |
| Built-in `Agent`, to call workers | Yes | | | |

The leg scout gets `WebSearch` only for Atlas Obscura, and Atlas Obscura blocks `WebFetch` ([web search design](data-sources-web-search.md), section 3). So the leg scout gets no `WebFetch`.

---

## 4. Rules for all tools

- **The trip comes from the session, never from a tool input.** Each session gets its own MCP server objects, made with the trip and user already set. They are small wrappers around shared tool code. One object can't be shared by two sessions running at once (tested: the second session silently got no tools). No tool takes a trip ID, so no agent can reach another trip, even with a made-up ID.
- **Bad IDs are rejected** (technical spec 7.1). A stop, stay, day, or place that doesn't exist in this trip returns an error. So does selecting a place that isn't one of that stop's or stay's candidates. The tool never guesses.
- **IDs are short and random, with a prefix for the kind of item,** such as `stop_k7m2x9qa` (technical spec 7.1). A worker only sees the IDs in its worker brief, and can't guess any others. So it can only add candidates to its own stops and stay, without the tools needing to know which worker is calling. An ID of the wrong kind, such as a stay ID passed to `update_stop`, gets an error that says so.
- **Errors are readable.** A failed call, a spent API limit, or a broken rule comes back as a message. The agent that called the tool can read it, and the coordinator can explain it to the user.
- **The coordinator sees short lines, not full records** (technical spec 7.2). Only `read_place` returns a full record to the coordinator.

---

## 5. Open questions

1. **Tool count for the coordinator.** It has about two dozen tools. If that proves too many for it to choose well, merge the add, update, and remove tools for each kind of item.
2. **Repeated reads of the itinerary.** One read fits easily: a 14-day trip with a few "more options" rounds is about 300 candidate lines, or roughly 20,000 tokens. The concern is repetition. Every read stays in the coordinator's context, so ten reads during planning add up, and the older copies are out of date. Claude Code may also cut off large tool results. The default limit for MCP tools is believed to be 25,000 tokens, but that hasn't been checked for in-process MCP servers. If either becomes a problem, return the full candidate history for one stop or stay at a time.
3. **Places nobody uses.** Searches save every result, and most are never offered as candidates. That is harmless for the MVP. Clean them up later if storage grows.
