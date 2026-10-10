# Road Trip Planner: Tool Design (MVP)

This document covers the agents' custom tools: which server each tool is on, what it takes and returns, and which agents get it. Inputs and outputs are listed at the level of the [technical spec](technical-spec.md). Exact fields are settled during development. For where each tool's data comes from, see the [data sources index](data-sources.md).

---

## 1. How tools are grouped into servers

**Servers are grouped by job, not by vendor and not by agent.** A server's name is part of every tool name the model sees, such as `mcp__places__search_near`. Naming by job keeps that name stable when a source changes. Example: the server is `places`, not `google`. If place data later came from somewhere else, nothing the agent sees would change.

**One source can serve several jobs, and one job can use several sources.** The Google client is shared code used by the places, routing, and weather servers. The weather server uses Google for forecasts and Open-Meteo for seasonal averages.

**Grouping is separate from access.** A server can hold tools for the coordinator and tools for workers. Each agent gets exactly the tools it uses (section 3).

| Server | Job | Sources behind it |
|---|---|---|
| `trip` | The trip brief and the itinerary, including candidates and feasibility checks | Our storage. Google Routes, to re-route legs |
| `memory` | User memory and trip memory | Our storage |
| `places` | Finding places and reading their details | Google Places |
| `routing` | Rough drive times for the coordinator's checks | Google Routes |
| `weather` | Forecasts and seasonal averages | Google Weather, Open-Meteo |

Web search is Claude's built-in `WebSearch` and `WebFetch` ([web search design](data-sources-web-search.md), section 1), not one of our servers. The coordinator calls workers with the SDK's built-in `Agent` tool.

---

## 2. Tools

### 2.1 Trip

The coordinator's tools for the brief and itinerary, plus the workers' tools for adding candidates.

**Reading:**

| Tool | Does | Returns |
|---|---|---|
| `read_trip_brief` | Reads the trip brief | Every item in functional spec 5.2 |
| `read_itinerary` | Reads the whole itinerary | Start and end places, start date, stays with their nights, and days with their dates, stops, and legs. For each stop and stay: its selected place, if any, and every candidate ever offered, in the order offered, each with its set number. Each place is shown as its name and short line (technical spec 7.2). Current feasibility results |

**Writing.** Every write returns the feasibility results (technical spec, section 8) and carries changes through (technical spec 3.5):

| Tool | Does | Takes |
|---|---|---|
| `update_trip_brief` | Changes one or more items in the brief. Items not given are left alone. An item that holds a list, such as must-sees, is replaced as a whole | The items and their new values |
| `update_itinerary` | Changes the itinerary's own properties. Properties not given are left alone | Any of: start place ID, end place ID, start date. For a loop, the start and end are the same place |
| `add_stay` | Adds a stay, and one day for each of its nights | Place ID, usually a town, where it goes, and number of nights. Optional: lodging tier and the rule that produced it |
| `update_stay` | Changes a stay | Stay ID, and any of: a new place ID, the stay it now goes after, number of nights, lodging tier and rule. Changing the nights adds or removes days at the end of the stay's days |
| `remove_stay` | Removes a stay, its days, and their stops | Stay ID |
| `set_rest_day` | Marks a day as a rest day, or not | Day ID, and rest day or not |
| `add_stop` | Adds an empty stop to a day | Day ID, kind (meal or attraction), time block, and optionally the stop it goes after. Meals also take a tier and the rule that produced it |
| `update_stop` | Changes a stop, or moves it, including to another day | Stop ID, and any of: kind, time block, tier and rule, and a move. A move takes a day ID and, optionally, the stop it goes after. A moved stop keeps its candidates and selection. The legs of the day it left and the day it joined are both re-routed |
| `remove_stop` | Removes a stop and its candidates | Stop ID |
| `update_leg` | Changes a day's leg. Properties not given are left alone, and an empty value clears one. Rejects a day with no leg, such as a rest day | Day ID, and any of: route type (scenic or fastest), waypoints, approved drive hours, approved route type, and the reason for an approval. An approved value without a reason is rejected |
| `select_place` | Selects a candidate for a stop or a stay's lodging | Stop or stay ID, and a place ID that is one of its candidates. For a place the user named, a place ID and the user's reason. The tool adds it as a candidate in a new set of one, then selects it (technical spec 3.2) |
| `clear_selection` | Clears a stop or lodging back to empty | Stop or stay ID |
| `set_stay_weather` | Saves a stay's weather and clothing text from the weather worker | Stay ID, the text, and whether it is a forecast or seasonal averages |

**There are no tools to add or remove days.** Days follow from stays' nights, and the last day is created with the itinerary (technical spec 3.1).

**Where an item goes.** Tools never take position numbers, which are easy to get wrong after items have been added or removed. Instead:

- **Stays** take the stay they go after, or nothing to go first. Example: to put Big Sur between Monterey and San Luis Obispo, add it after the Monterey stay.
- **Stops** always take a day, plus, optionally, the stop they go after. No stop means first in that day. `add_stop` and a move in `update_stop` work the same way. If the stop given isn't on that day, the tool rejects the call. The day doubles as a check that the coordinator meant the day it named.

**Adding candidates (workers):**

| Tool | Does | Takes |
|---|---|---|
| `add_stay_candidates` | Adds lodging candidates to a stay | Stay ID, and for each candidate: place ID, rationale, tier and rule, how it was found with the source link, and notes for these dates |
| `add_stop_candidates` | Adds candidates to a stop | Stop ID, and the same items per candidate |

Each call is one set. The tool assigns the set number (technical spec 3.2). Both tools reject a place already offered for the same stop or the same stay, so a worker can't offer it there twice. The same place can still be a candidate for a different stop or stay. Example: the Palace Hotel can be a lodging candidate for a stay and also a candidate for a stop (technical spec 3.2). Both return one line per candidate added, for the worker's result. Candidates are never changed after they're written. There are two tools so the leg scout, which fills stops only, never sees the stay tool.

### 2.2 Memory

Coordinator only. Workers never see memory (technical spec 6.4).

| Tool | Does | Takes |
|---|---|---|
| `read_memory` | Reads user memory and this trip's memory | Nothing |
| `add_memory_item` | Adds an item | User or trip, and the text |
| `update_memory_item` | Rewrites an item | Item ID and the new text |
| `forget_memory_item` | Removes an item | Item ID |

### 2.3 Places

Every search saves its results as places in the trip and returns their IDs. A place found twice is stored once (technical spec 3.1). Each result's text from outside sources is labeled as data, not instructions.

| Tool | Does | Takes | Returns |
|---|---|---|---|
| `find_place` | Finds a named place: a town, a must-see, an address, or a place the user names | Text, and an optional point to search near | The best few matches, each with place ID, name, and short line |
| `read_place` | Reads a place's full record | Place ID | Everything stored: hours, coordinates, rating, summary, links |
| `search_near` | Finds hotels, restaurants, or attractions near a point | A place ID or coordinates, what to look for, and an optional price level | Matches with the details the worker needs to choose: rating, review count, price level, hours, summary, links |
| `search_along_leg` | Finds places along a day's route | Day ID and what to look for | The same details as `search_near`, plus a rough detour time for each |

**`search_along_leg` reads the route line itself,** from the day's leg in the trip. The route line is large, so it never passes through the model.

### 2.4 Routing

| Tool | Does | Takes | Returns |
|---|---|---|---|
| `compute_route` | Works out a rough route for the coordinator's checks, such as a shape sketch (technical spec 4.2) | Points in order, as place IDs or plain names. Optional: route type, waypoints, and putting the middle points in the best order | Drive time and distance per stretch and in total, and the order used. The route line goes to the UI, not to the model (technical spec 5.1) |

Plain names are allowed so a sketch doesn't need a lookup for every town. Routes on the itinerary's legs are worked out by the trip server, not with this tool (technical spec 3.4).

### 2.5 Weather

Weather worker only.

| Tool | Does | Takes | Returns |
|---|---|---|---|
| `forecast` | Daily forecast | A place ID and dates within the next 7 days | Daily highs, lows, conditions, and chances of rain and thunderstorms ([Google design](data-sources-google.md), section 3) |
| `seasonal_averages` | Typical weather for the dates | A place ID and dates | Average highs and lows, chances of rain and snow, and shares of hot days and freezing nights, labeled as typical for the dates ([Open-Meteo design](data-sources-open-meteo.md), 2.3) |

---

## 3. Who gets which tool

| Tool | Coordinator | Stay researcher | Leg scout | Weather and clothing |
|---|---|---|---|---|
| `trip`: read, brief, and itinerary writes (2.1) | Yes | | | |
| `trip`: `add_stay_candidates` | | Yes | | |
| `trip`: `add_stop_candidates` | | Yes | Yes | |
| `memory`: all (2.2) | Yes | | | |
| `places`: `find_place`, `read_place` | Yes | | | |
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

- **The trip comes from the session, never from a tool input.** The servers are created for each session with the trip and user already set. No tool takes a trip ID, so no agent can reach another trip, even with a made-up ID.
- **Bad IDs are rejected** (technical spec 7.1). A stop, stay, day, or place that doesn't exist in this trip returns an error. So does selecting a place that isn't one of the target's candidates. The tool never guesses.
- **Workers add candidates only to the stops and stay in their brief.** Checking that a stop exists isn't enough. Without this check, a leg scout could add candidates to another leg's stops.
- **Errors are readable.** A failed call, a spent API limit, or a broken rule comes back as a message the agent can explain to the user.
- **The coordinator sees short lines, not full records** (technical spec 7.2). Only `read_place` returns a full record to the coordinator.

---

## 5. Open questions

1. **How the candidate tools learn a worker's brief** (section 4). Hooks report which subagent made a tool call. Linking that subagent to the brief it was given still needs a test.
2. **Tool count for the coordinator.** It has about two dozen tools. If that proves too many for it to choose well, merge the add, update, and remove tools for each kind of item.
3. **The size of `read_itinerary`'s output.** It returns every candidate ever offered. A 14-day trip with a few "more options" rounds could mean a few hundred candidate lines. If that gets too large, return the full history for one stop or stay at a time.
4. **Places nobody uses.** Searches save every result, and most are never offered as candidates. That is harmless for the MVP. Clean them up later if storage grows.
