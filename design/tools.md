# Road Trip Planner: Tool Design (MVP)

This document covers the agents' custom tools: which MCP server each tool is on, what it takes and returns, and which agents get it. Inputs and outputs are listed at the same level of detail as the [technical spec](technical-spec.md). Exact fields are settled during development. For where each tool's data comes from, see the [data sources index](data-sources/README.md).

**Terms used here:**

- **MCP server:** a named set of tools, made in our app's code with the Agent SDK's `createSdkMcpServer`. Its tools run inside our app. It is not a separate process, container, or machine.
- **Session:** one user's conversation with the agent about one trip.
- **Trip brief** and **worker brief:** the trip brief is what the user wants from the whole trip (functional spec 5.2). A worker brief is the part of it that one worker gets, plus the stop and stay IDs it fills (technical spec 5.3). This document always says which one it means.

---

## 1. How tools are grouped into MCP servers

**MCP servers are grouped by job, not by vendor and not by agent.** An MCP server's name is part of every tool name the model sees, such as `mcp__places__search_near`. Naming by job keeps that name stable when a source changes. Example: the server is `places`, not `google`. If place data later came from somewhere else, nothing the agent sees would change.

**One source can serve several jobs, and one job can use several sources.** The Google client is shared code used by the `places`, `routing`, and `weather` MCP servers. The `weather` MCP server uses Google for forecasts and Open-Meteo for seasonal averages.

**Grouping is separate from access.** An MCP server can hold tools for the coordinator and tools for workers. Each agent gets exactly the tools it uses (section 3). Every server is in the session, and each agent's definition lists the tools it's sent, the coordinator's too (technical spec 6.5). So the coordinator doesn't see the workers' tools, such as `search_near` on the `places` server.

| MCP server | Job | Sources behind it |
|---|---|---|
| `trip` | The trip brief and the itinerary, including candidates and feasibility checks | Our storage. Google Routes, to re-route legs |
| `memory` | User memory and trip memory | Our storage |
| `places` | Finding places and reading their details | Google Places |
| `routing` | Rough drive times for the coordinator's checks | Google Routes |
| `weather` | Forecasts and seasonal averages | Google Weather, Open-Meteo |
| `worker` | A worker's result, which code builds into what the coordinator sees (technical spec 6.5) | None. A hook records the call |

Web search is Claude's built-in `WebSearch` and `WebFetch` ([web search design](data-sources/web-search.md), section 1), not one of our MCP servers. The coordinator calls workers with the SDK's built-in `Agent` tool. These three are the session's only built-in tools. A worker can't be given a built-in tool the session doesn't have, so both web tools are in the session, and only the workers' definitions list them.

---

## 2. Tools

### 2.1 Trip

The coordinator's tools for the trip brief and itinerary, plus the workers' tools for reading their worker briefs, adding candidates, and saving weather text.

**Reading:**

| Tool | Does | Returns |
|---|---|---|
| `read_trip_brief` | Reads the trip brief | Every item in functional spec 5.2 |
| `read_itinerary` | Reads the whole itinerary, or one part of it. The scope is required: "all" for the whole itinerary, a day ID (the day, its leg, its stops, and their candidates), a stay ID (the stay, its days and their stops, and stops on other days whose search area is this stay), or a stop ID (the stop and its full candidate history) | Every stored property of each item it covers, plus what code works out from it. The exception is each leg's route line, which never goes to the model ([Google design](data-sources/google.md), 2.3). The [domain model](domain-model.md) lists them. For the whole itinerary, that includes: start and end places, start date, stays with their nights, and days with their dates, start times, stops, and legs. Under each leg's line, a line for each of the day's waypoints, with its reason, such as `- Waypoint: Belfast (place_…), City, Belfast. Reason: "steer onto US-1".` Each day's schedule, worked out: each stop's arrival and end, free time, and the arrival where the party sleeps (domain model 4.1). A stop with no place shows its set time, or no time if it has none. For each stop and stay in a read scoped to a day, stay, or stop: its selected place, if any, with its rationale, and every candidate, in the order offered, each with its set number and its visit and detour times. A whole read gives less here: the selected place, and a count of the other candidates by set (below). Days, stops, and sets are counted from 1, as people count them (domain model section 1). For the whole itinerary, also the trip's rejected places with their reasons. Each place is shown as its name and short line (technical spec 7.2). A read scoped to a stop or stay also gives every candidate's other stored properties: its rationale, its tier, such as "Tier: midRange.", how it was found with the source link, and its notes. Each stay's weather and clothing text, marked out of date when the stay's place, dates, or activities no longer match the ones it was written for (domain model 4.1). A whole read gives only where the text came from and when it was written, still marked out of date. Each day's and stop's approvals, each marked as applying or not. Current check results, each marked new or already known, with approved warnings marked approved. A read doesn't mark a result changed: it gives each result's current text, so one whose text differs from the saved one shows as already known. Results that went away since the last write aren't shown, since the next write's reply reports them. A scoped read returns these details for its part only, with the results for that part. Each leg's routed places, best order, and time saved aren't shown: they're for telling when to route the leg again, and the stop order note gives the best order when it matters (technical spec section 8) |
| `find_in_trip` | Searches the trip's own places by name, to find which stop or stay holds a place the user names (below). Takes only the text the user said, such as "Desert Rose" | The 5 places in the trip closest to the text, best first, or every place when the trip has fewer than 5. Each with its name, place ID, and short line, and a line for each spot the trip holds it in |

**Scoped reads keep the coordinator's context small.** Every read stays in context, and older copies go out of date. Most questions are about one part, such as "what's on Day 2" or "what's tied to Moab," so the coordinator asks for that part by ID. The scopes are IDs, not a query language, so a bad request gets an error instead of quietly returning nothing. A search by name is a query, so it's its own tool, `find_in_trip`, not a scope. The scope is required, so a whole read is asked for by name, never by leaving an input out (section 4).

**A whole read gives less than a scoped read.** The coordinator reads the whole itinerary at the start of a session, after a resume, and for "what's left to decide?" (technical spec 5.2). None of these needs every candidate. For a picked item, the picked place is what matters. For an item not picked yet, the coordinator needs to know it's undecided, and how many options it has. After a resume, it needs to notice new candidates, not read them. The details the user can already see in the itinerary view, such as the rationale and the weather text, come from a scoped read when the user asks about them. So a whole read differs from a scoped read in these ways:

- **No candidate is listed.** A line under each stop and stay counts its candidates by set, such as "Candidates: 3 in set 1, 3 in set 2." The count is by set, so a set added after the pick shows up. A stop with no candidates says "No candidates yet."
- **A picked place is folded into its stop or lodging line.** It gives the place's name, ID, and town, its detour time if it has one, and the stop's visit time. The count line then covers only the other candidates, such as "Other candidates: 2 in set 1." A picked place with no other candidates, such as a place the user named, gets no count line.
- **Of the picked place's short line, only the town is given.** The stop line already says what kind of stop it is.
- **No rationale,** for the picked place or any other.
- **Each stay's weather line gives where the text came from and when it was written, but not the text.** Example: "Weather and clothing, from seasonal averages, written Thursday, October 15, 2026." That's what the forecast note works from (technical spec section 8). The line is still marked out of date when the text is.
- **No tier.** A stop or stay has none (technical spec section 9), and a whole read lists no candidate, so it shows no tier. A read of the stop or stay gives each candidate's.

Everything else is the same as in a scoped read: the trip's dates and ends, stays, days, legs, the schedule with its drive lines, approvals, rejected places, and check results. A picked stop, a picked lodging, and a stop with nothing picked:

```
- 10:18 a.m. to 12:18 p.m.: Stop 2 (stop_…), attraction: "a first look at red rock on the way". Along the leg. Selected: Valley of Fire State Park (place_…), Overton, detour 38 m when offered, visit time 2 h.
  - Other candidates: 2 in set 1.

- Lodging: Desert Pearl Inn (place_…), Springdale.
- Other candidates: 2 in set 1, 3 in set 2.

- 6:30 p.m.: Stop 4 (stop_…), meal: "dinner". Near the Springdale stay. Set time: 6:30 p.m. No place selected yet.
  - Candidates: 3 in set 1, 3 in set 2.
```

A stay with no lodging picked reads "Lodging: none selected yet." and "Lodging candidates: 3 in set 1, 3 in set 2." A day read and a whole read of the same day look different, since the day read still lists every candidate.

**A read has a size limit of 25,000 tokens.** Claude Code saves a tool result over 25,000 tokens to a file, and gives the model only the file's path and a short preview. The coordinator has no tool to read the file, so for it the result is cut off. 25,000 is Claude Code's default for MCP tools, and nothing in it treats in-process servers differently (checked in Claude Code 2.1.301, which SDK 0.3.301 ships). So `read_itinerary` returns an error instead of a reply over the limit. The tool can't count tokens without calling the API, so it counts characters, and refuses a reply over 40,000 of them. Raising the limit isn't the fix: every read stays in context for the rest of the session, so a larger read costs tokens on every later turn.

**The size of a whole read, measured on 2026-10-26.** The trip measured is a 14-day loop from Las Vegas with 8 stays, 3 to 6 stops a day, and 275 candidates, with real place names. Nearly everything is picked. Its whole read is 27,582 characters, and the API counts it as 15,291 tokens for the coordinator's model, `claude-opus-5-5`. The same trip with nothing picked is 18,889 characters and 9,433 tokens. Each pick makes the read longer, since a picked place's line is longer than a count, so a busy trip is close to the largest a whole read gets. Reads like these run from 1.80 to 2.13 characters a token, since IDs and short lines cost more tokens than prose. Plain English runs about 4. At 1.80, 40,000 characters is about 22,200 tokens, still under 25,000. Before the whole read gave less, the busy trip's read was 66,260 characters and 34,498 tokens. On the same trip, a day read is about 5,200 characters at most, and a stay read is 4,090 to 12,154 tokens, since it gives every candidate in full for every stop on the stay's days. [Research doc: making a whole itinerary read smaller](../research/itinerary-read-size.md) has the measurements.

**A trip too large to read whole can't be planned any further.** A whole read over the limit gets the error "Can't read the itinerary: it's too large to read, so this trip can't be planned any further." The coordinator tells the user. Nothing else changes: no code marks the trip, and scoped reads still work. A trip that size means something has likely gone wrong, or it's a trip this app doesn't need to handle. Scoped reads aren't a fallback for it, since no scoped read shows the parts of the trip that only a whole read does, such as the check results about the trip's length.

**A scoped read too large to return gets a different error:** "Can't read the itinerary: it's too large to return. Read one day, stay, or stop at a time instead." A long stay with many candidates can be that large, and its days and stops can still be read one at a time.

**`find_in_trip` finds a place the user names.** A whole read lists no candidate names, so nothing in context tells the coordinator which stop or stay holds a candidate the user names, such as "let's do the Desert Pearl." A wrong guess fails quietly. `select_user_place` on another stop adds the place there as one the user named, and the stop that offered it stays undecided. So when the user names a place the coordinator has no ID for, and it may be one the trip offered, the coordinator calls `find_in_trip`. For a place that's new to the trip, it calls `find_place` (technical spec 5.2).

- **What it searches:** the places the itinerary holds. That's every stop's and stay's candidates, which include the selected places, plus the rejected places, the start and end places, and the stays' towns. Not every place saved for the trip: each search saves its results (section 2.3), and most of them were never offered. The tool walks the itinerary from a read, so it needs no new table or query.
- **How it matches:** by trigram similarity, written in the tool, with no new package. It splits both strings into overlapping three-letter pieces, such as "des", "ese", and "ser", and scores how many they share. Each word is split on its own, with two spaces before it and one after, as Postgres's `pg_trgm` does. So a word's start counts for more, and a word of one or two letters still has pieces. That handles typos, such as "Desert Rose" for "Desert Pearl Inn", and partial names, such as "Cliffrose" for "Cliffrose Springdale, Curio Collection by Hilton". The score is the share of the text's pieces found in the place's name. Ties go to the higher share of both strings' pieces together, then to the order the whole read lists the places. The usual score, the share of both strings' pieces together, ranks a short partial name low against a long full name: for "Cliffrose", it puts Cliff Palace ahead of the Cliffrose Springdale. The share of the text's pieces alone ties "Desert Rose" between the Desert Pearl Inn and Desert View Watchtower, so the usual score breaks ties. Before scoring, both strings are lowercased, with punctuation and a leading "the" taken out. An apostrophe is dropped, so "Milts" matches "Milt's". Other punctuation becomes a space, so "Desert-Pearl" matches "Desert Pearl". Not vector search: that matches meaning, and a typo is a spelling problem.
- **No cutoff for a match.** It always returns the 5 closest, and the coordinator judges. When a match is close but may not be the place the user meant, it asks the user, such as "Did you mean the Desert Pearl Inn, the hotel in Springdale?" for "Desert Rose". A shorter form of a name, such as "the Desert Pearl", needs no question. When none is close, the place isn't in the trip, so the coordinator looks it up with `find_place`. Example: "let's add Arches" on a trip with no Arches. That keeps a threshold out of code, and leaves the judgment with the agent, where an evaluation can watch it.
- **Only the text as input.** No stay or day to narrow it. The coordinator often won't know the stay, and an optional input goes against section 4. Text with no letters or digits, such as "?", is refused, since it has nothing to match.
- **The reply** is in the read's style, with the full short line, since it's the coordinator's only look at each match. A place in more than one spot, such as a hotel that's also a dinner candidate, gets a line for each. A stop is named by its day, its number, its kind, and its purpose, as in the read's stop line. When the trip has no places yet, the reply says so, and it isn't an error.

  ```
  The 5 places in the trip closest to "Desert Rose", best first:
  - Desert Pearl Inn (place_…), Hotel, 4.8 stars, $$$, Springdale.
    - Lodging candidate for Stay 1, Springdale (stay_…), set 1. Selected.
  - Desert View Watchtower (place_…), Historical landmark, 4.8 stars, $, Grand Canyon Village.
    - Candidate for Day 12, Stop 5 (stop_…), attraction: "the east end of the South Rim", set 1. Not selected.
  - Rose Well Camp (place_…), Campground, 4.1 stars, Seligman.
    - Rejected for the whole trip: "too far off the route".
  - Las Vegas (place_…), City.
    - The start and end place.
  - Springdale (place_…), City.
    - The town of Stay 1 (stay_…).
  ```

**Writing.** Every write makes the follow-on changes itself, such as re-routing legs or adding days (domain model section 4). Its reply carries only what code worked out: each re-routed leg's new drive time and distance, anything the tool did on its own, such as days added, the stops on any day whose start or end changed, and its check results: every one that is new, changed, or went away, anywhere in the trip, plus the already-known ones for everything it touched, with approved warnings marked approved (technical spec, section 8). It doesn't echo back what the coordinator sent. Example: "Moved Corona Arch to Day 3, after Windows. Day 2: 2 h 10 m → 1 h 30 m. Day 3: 0 h → 45 m. No new warnings." The worker writes `set_stay_weather`, `add_lodging_candidates`, and `add_stop_candidates` return no check results (technical spec, section 8). For more, the coordinator uses a scoped read.

**The tool builds its reply from what the write hands back** ([persistence design](persistence.md), section 8.2): what its own change returned, the leg changes, and the check comparison. The check comparison lists every result that's new, changed, already known, or gone. **Changed** is a result that was already known, but whose text differs from the saved one, such as a daily driving warning that gives a new limit after the user lowers their driving hours (domain model 4.8). The tool keeps every new, changed, and gone result, and the already-known results for what the write touched. **What the write touched** is:

- The stops, days, and stays the call names.
- What its change returned as changed, such as the stops and stays a rejection changed (domain model 4.3), or the days `update_stay` added.
- The days in the leg changes.
- The itinerary, which stands for the trip as a whole.
- The days that now start or end somewhere else, whose stops the reply lists.

Example: rejecting the selected Moab hotel names only the hotel. The change returns the Moab stay, and the leg changes hold Days 1, 2, and 4. The reply gives the already-known results for those, and for the itinerary.

**Every write to the itinerary lists the stops on each day that now starts or ends somewhere else,** not only `add_stay` and a move with `update_stay`. A new start place, end place, or stay town changes where a day starts or ends too, and its stops are a judgment call the same way (technical spec 5.2). A day with no stops isn't listed. Example: "Day 2 (day_…) now runs Big Sur → San Luis Obispo, and still holds: breakfast at First Awakenings (stop_…); …".

**An update tool refuses a call that changes nothing,** as `update_trip_brief` does, since a call with every input left out is a mistake, not a request.

The writing tools:

| Tool | Does | Takes |
|---|---|---|
| `update_trip_brief` | Changes one or more items in the trip brief. Items not given are left alone. Each item given replaces the old value. If an item is refused, none of the items given is saved, so the coordinator sends the others again | The items and their new values |
| `update_itinerary` | Changes the itinerary's own properties. Properties not given are left alone | Any of: start place ID with a name, end place ID with a name, start date. The name is required with the place. It is used only when Google has no name for the place, such as "Mike's house" for an address, and only the first name given is kept (domain model 3.10). When the place already has a different name, the reply says the name was kept, since a place can't be renamed in the MVP. For a loop, the start and end are the same place. A start date that isn't after today is rejected, and the error gives today's date. So is a start date while the itinerary has no start place, unless the same call sets one, since today's date comes from the start place's time zone (technical spec section 8). A new start place where today is already on or after the start date is rejected too, since the trip would start at once (domain model 3.4) |
| `add_stay` | Adds a stay, and one day for each of its nights. The reply gives the new stay's ID and its days' IDs, and lists the stops on any day whose start or end changed (domain model 4.4) | Place ID (usually a town), the stay it goes after or "first", and number of nights. Rejected until the itinerary has a start date, start place, and end place (technical spec 4.2) |
| `update_stay` | Changes a stay | Stay ID, and any of: a new place ID, the stay it now goes after or "first", or number of nights. Changing the nights adds or removes days at the end of the stay's days. The reply gives the IDs of any days it adds. Moving the stay, or changing its place, lists the stops on any day whose start or end changed (domain model 4.4). Removing a night is refused while that day holds stops, and the error lists them. The tool applies the inputs in this order: place, position, then nights |
| `remove_stay` | Removes a stay and its days. Refused while any stop is on its days, or while any stop anywhere has the stay as its search area. The error lists each of those stops by its purpose, its selected place's name if it has one, and its ID (domain model 4.4) | Stay ID |
| `update_day` | Changes a day: whether it's a rest day, its start time, and its approvals. A day that moves to a new stay, and the last day, can't be rest days. Marking a rest day removes the day's leg and its waypoints (domain model 4.5). It is refused while a stop on the day has no set time, and the error lists those stops. Setting an approval replaces any of the same kind (technical spec section 8). Approving fastest clears the day's waypoints, and approving scenic leaves them (domain model 4.5). The reply then names each waypoint it cleared, with its reason, and gives the leg's new road time, so the coordinator can put back the ones it still needs (technical spec 5.2) | Day ID, and any of: rest day or not, start time (a time, or "default" to use the trip brief's usual start time), approve drive hours (hours and a reason), approve route type (type and a reason), and remove an approval (its kind). An approval without a reason is rejected. The tool applies the inputs in this order: rest day, start time, the approval to remove, then the approvals to set. So a call that removes and sets the same kind ends with the new one |
| `add_stops` | Adds stops to a day, in order. A meal or an attraction starts empty. A check-in has its place from the start, so the day's leg is re-routed (domain model 3.7). The reply gives the new stops' IDs, in order | Day ID, the stop the list goes after or "first", and an ordered list of one or more stops. Each item takes a kind (meal, attraction, or check-in), a purpose (a short note on what the stop is for, never when, such as "dessert". It can say how long, such as "a long hike, about 5 hours"), a search area: near a stay, as the stay's ID, or "alongLeg", "nearStartPlace", or "nearEndPlace", and a set time: a time, or "none" to follow the stop before it. The search area is one input, an ID or a word, the way `after` takes an ID or "first", so a stop near a stay can't leave the stay out. "None" is rejected on a rest day, where no drive places a stop in the day (domain model 4.6). A stay that isn't where the party slept the night before or sleeps that night is rejected. "Along the leg" is rejected on a day that starts and ends at the same stay. "Near the start place" is rejected except on the first day, and "near the end place" except on the last day. A check-in takes only its kind, purpose, and set time, since each item's schema is picked by its kind. Its place is where the party sleeps that night, and it gets the check-in visit time, a setting (technical spec section 10). A check-in on the last day, which has no stay, is rejected, and so is a second check-in on a day |
| `update_stop` | Changes a stop's set time, visit time, or approvals. Its kind, purpose, and search area can't change | Stop ID, and any of: set time (a time, or "none"), visit time (rejected while no place is selected, except on a check-in), approve opening hours (a reason; the tool records how many minutes of the visit fall within the selected place's opening hours), and remove an approval (its kind). An approval without a reason is rejected. The tool applies the inputs in this order: set time and visit time, then approvals. So an approval in the same call as a new set time records the minutes at the new time |
| `move_stop` | Moves a stop within its day or to another day. It keeps its candidates, selection, and visit time. The legs of the day it left and the day it joined are re-routed when their stops' places changed, so moving a stop with no selected place re-routes nothing. A check-in always has a place, so moving it to another day re-routes both days (domain model 4.6). A stop along the leg can't move to a day that starts and ends at the same stay, and the error says to remove the stop and add a new one. A stop near a stay, or near the start or end place, can move to a day that doesn't start or end there. The move goes through, and the check results warn that its search area doesn't fit the day (technical spec section 8). A check-in moves to the stay the party sleeps at on its new day. It can't move to the last day, or to a day that already holds one | Stop ID, day ID, the stop it goes after or "first", and a set time: a time, or "none". All are required. "None" is rejected on a rest day. The set time is required so an old one never carries over: moving dinner to breakfast restates its time or drops it |
| `remove_stops` | Removes stops and their candidates | A list of one or more stop IDs |
| `set_waypoints` | Sets a day's waypoints. An empty list clears them. Rejects a day with no leg, such as a rest day. Code places the waypoints among the day's selected stops (domain model 4.7). The reply lists each waypoint with its reason, and gives the leg's road time before and after, so the coordinator can tell a detour (technical spec 4.2). When the waypoints' places are the same as before, such as when only a reason changes, the leg isn't routed again (domain model 4.7). The reply still gives its road time, and says it wasn't routed again, so the coordinator doesn't read the missing change as a waypoint that adds nothing | Day ID, and a list of waypoints, each a place ID and a reason, both required. The reason says what the waypoint is for, in a few words, such as "steer onto US-1", "must-see: Capitol Reef", or "the user asked: the Golden Gate Bridge" (domain model 3.6). A place given twice is rejected, and so is an empty reason |
| `select_candidate` | Selects one of a stop's or a stay's candidates. Selecting the place that's already selected changes nothing, so a visit time the user changed stays. Otherwise, for a stop, it sets the visit time: the candidate's estimate for an attraction, or the meal visit time for a meal, a setting (domain model 4.6, and technical spec section 10). | Stop or stay ID, and a place ID. A place that isn't already a candidate there is rejected, and the error says to use `select_user_place`. A rejected place is never a candidate, so it gets the same error |
| `select_user_place` | Selects a place the user specified, such as a friend's house. Adds it as a candidate in a new set of one, marked "specified by the user," then selects it (domain model 3.7). The reply has a line for each other stop or stay where the place is a candidate, named as `find_in_trip` names them, such as "Oscar's Cafe is also a candidate for Day 1, Stop 4 (stop_…), meal: "dinner"." or "Desert Pearl Inn is also a lodging candidate for Stay 1, Springdale (stay_…)." The call isn't refused, since the same place can be a candidate on two stops on purpose (below). The coordinator decides: fix the pick with `select_candidate`, ask the user which one they meant, or leave it | Stop or stay ID, place ID, name, and the user's reason. When the user gives no reason, the coordinator passes "the user asked for it" (functional spec 7.6). The name works as in `update_itinerary`: it's used only when Google has no name for the place, and the reply says when it wasn't used. Attraction stops also take a visit time, which becomes the stop's. A meal stop's visit time is the meal visit time, a setting (technical spec section 10). The visit time is the one optional input, since the stop or stay ID doesn't show its kind: an attraction without one is refused, and so is a meal stop or a stay with one. It gets no detour time: a place the user names is a reason for the trip, not a detour (domain model 3.9). A place that's already a candidate there is rejected, and the error says to use `select_candidate`. One of the trip's rejected places is refused, and the error gives the reason it was rejected |
| `reject_places` | Rejects places for the whole trip, permanently (domain model 4.3). Adds each to the trip's rejected places with its reason, and removes it from every stop's and stay's candidates. Where it was selected, clears the selection and the stop's visit time, and re-routes the legs (domain model 4.7). The other candidates stay. The reply lists every stop and stay that lost a candidate, from what `rejectPlaces()` returns (domain model 4.3). A place already rejected is skipped, and keeps its first reason. A rejection undoes picks, not the trip's structure: it leaves a stay's town, the start and end places, and waypoints alone, since changing them is a conversation with the user | A list of one or more places, each a place ID and the user's reason. A place doesn't have to be a candidate: the coordinator can look one up with `find_place` and reject it before it's ever offered |
| `set_stay_weather` | Saves a stay's weather and clothing text. Called by the weather worker, not the coordinator | Stay ID and the text. The tool labels it forecast or seasonal averages itself, from the stay's dates, with the same rule `stay_weather` uses. It records the stay's current place, dates, and activities with it, so later changes can mark it out of date (domain model 4.1). Each activity is recorded as its stop ID and selected place ID, with no date or time (technical spec 6.3) |

**The trip brief tools name each item as the [domain model](domain-model.md) does** (section 3.2), such as `tripLengthInDays`, so an error that names an item matches the input. `read_trip_brief` shows an item with no value yet as "not set". The usual start time is a clock time, as with every time below.

**A stop's kind, purpose, and search area are fixed** (technical spec 6). Its candidates were found for that kind and purpose, in that area. A stop with a different kind, purpose, or area is a different stop, so the coordinator removes it and adds a new one. A move keeps the search area. A stop near a stay belongs on a day that starts or ends at that stay. It can also move to another day, with a warning, because undoing a new stay can need that for a moment (technical spec section 8). A stop along the leg can move within its day, or to another day that drives to a new stay or to the end place. It is then along that day's leg. Its candidates keep their detour times, labeled as of when offered. It can't move to a day that starts and ends at the same stay, where "along the leg" isn't allowed. Example: moving Moab lunch, near the Moab stay, from Day 2 to Day 3 is allowed. Moving it to the Torrey day goes through, with a warning that its search area doesn't fit the day. After a Big Sur stay is added, Point Lobos, along the leg, can move to the new Monterey-to-Big Sur day.

**Laying out a day takes one `add_stops` call.** The day's stops are one ordered list, so San Francisco Day 2 is one call with seven items.

**Times are clock times,** such as "7:00 p.m." A time after midnight is given as the next day, such as "1:00 a.m. the next day," the way a read writes it, so it can't be read as an early start (domain model 4.1). A set time takes "none", and a day's start time takes "default", rather than a blank, because in the update tools a blank means "don't change it." A stop with no set time really has none: it follows the stop before it. A day always has a start time, so "none" would read wrong there. "Default" means the trip brief's usual start time.

**There are no tools to add or remove days.** Days follow from stays' nights, and the last day is created with the itinerary (domain model 3.4).

**Where an item goes.** Tools never take position numbers, which are easy to get wrong after items have been added or removed. Instead, a tool takes the item to go after, or the word "first". That input is required whenever an item is placed. It is never left blank. In the update tools a blank means "don't move it," so a blank can't also mean "first." Each tool's description names the `after` input and says what "first" does, such as "Give after the ID of the stay it follows, or "first" to put it before every other stay." So `add_stay`, `update_stay`, `add_stops`, and `move_stop` read the same way.

- **Stays** take the stay they go after, or "first". Example: to put Big Sur between Monterey and San Luis Obispo, add it after the Monterey stay.
- **Stops** always take a day, plus the stop they go after on that day, or "first". `add_stops` and `move_stop` work the same way. `add_stops` places its whole list after the stop given, in list order. If the stop given isn't on that day, the tool rejects the call. The day doubles as a check that the coordinator meant the one it named. Example: to move Denny's from dinner to breakfast, move it "first" on its day, with a set time of "7:30 a.m." or "none".

**Adding candidates (workers):**

| Tool | Does | Takes |
|---|---|---|
| `add_lodging_candidates` | Adds one set of lodging candidates to a stay | Stay ID, and for each candidate: place ID, name, rationale, how it was found with the source link, notes, such as "closed Mondays" or "reservations advised", and its tier (technical spec section 9) |
| `add_stop_candidates` | Adds one set of candidates to a stop. For a stop along the leg, works out each candidate's detour time itself, with one routing call per candidate against the stop's day's leg as it is then, including its waypoints. The candidate is placed at the stop's position among the leg's selected stops (domain model 4.7). Other stops get no detour time, and neither does a place the user names (`select_user_place`) | Stop ID, and for each candidate: place ID, name, rationale, how it was found with the source link, and notes. Attraction stops also take a visit time, the worker's estimate, and meal stops a tier |

**The place ID comes from a search or from `find_place`.** A place found by web search is looked up with `find_place`, by name and town. If Google doesn't list it but the source gives a street address, the worker looks up the address instead. If there's neither, the worker drops the find ([web search design](data-sources/web-search.md), section 4).

**A name is always required,** even when Google has one, so the worker never has to decide whether to pass it. A place looked up by its address has no name on Google. Cards show Google's name whenever Google has one, so the given name is used only for a place Google has no name for. The first candidate that offers such a place sets its name, whether a worker added it or the user specified it (`select_user_place`). Later candidates for the same place don't change it. The type cards show is Google's, so no tool takes one. An address has none. Places are matched by Google place ID only (domain model 3.10).

**Visit time and tier follow the stop's kind, and they're required.** Visit time is for attraction stops, and tier for meal stops and lodging, whatever the place is. Example: a barbecue joint on a barbecue trip, filling an attraction stop, needs a visit time and has no tier. A call missing a required input is rejected.

**The worker gives each lodging and meal candidate its tier.** It says what the place is like, judged by the meanings in functional spec 7.1, not what the worker aimed for (technical spec section 9). A stop or stay has no tier to copy. Attractions have no tier, and neither does a place the user names.

**Each call is one set** of one to three candidates. The tool works out the set number (domain model 3.9). A worker adds all of a stop's or stay's candidates in one call. A second call makes a new set, and the option card shows only the newest set. The tool's reply names the set it made, and the stop or stay, with one line per candidate (below). Code passes those lines on in the worker's result (technical spec 6.5).

**A repeat rejects the whole call.** If any place is already a candidate for the same stop or stay, or is one of the trip's rejected places, nothing is added, and the error names it. So a set is never partly written. The same place can still be a candidate for a different stop or stay. Example: the Palace Hotel can be a lodging candidate for a stay and also a candidate for a stop (domain model 3.9).

**Adding a set to a stop or stay that already has a selection keeps the selection.** That happens when the user asks for more options after choosing. The selected place is still one of the candidates, in an older set. Candidates are never changed after they're written.

**One tool for every stop, because code knows whether a detour applies.** Detour time is the extra driving off a leg's route, and only stops along the leg have one. The stop's search area already says which kind it is (domain model 3.7), so the worker passes the same inputs either way. Example: candidates for Goblin Valley, along the Moab Day 4 leg, get detour times off the Moab-to-Torrey route. Candidates for lunch near the Moab stay don't, because there's no route to detour from. Each worker brief holds only that worker's stops, so the stay researcher and the leg scout share the tool.

**What each candidate takes, field by field.** A place ID, a name, a rationale, how it was found ("google" or "webSearch"), the source link, and notes. Lodging candidates and a meal's take a tier, and an attraction's take `visitTimeInMinutes`. Every field is required (section 4). Notes are "" when there are none, and code saves that as no notes. The source link must start with https:// or http://, since the option card links to it, and a link from a web page the worker read shouldn't be able to run a script there. The stop ID doesn't show the stop's kind, so each candidate in `add_stop_candidates` is one of two shapes, one with a tier and one with a visit time. The tool refuses a shape that doesn't fit the stop, and the error says what the stop's kind takes. Decided on 2026-10-28, while #199 was being built.

**The places are checked before any detour time is worked out.** A place that's already a candidate there, a place given twice, or one of the trip's rejected places refuses the call before any call to Google. The error names the place, and for a rejected place gives the user's reason. A check-in gets the same error as in `read_worker_brief_facts`. Decided on 2026-10-28, while #199 was being built.

**Each line of the reply gives the coordinator what it needs to talk about the place,** since code passes the lines on in the worker's result (technical spec 6.5), and a whole read lists no candidates. That's the place's name, ID, and short line, its visit and detour times, its rationale, its tier, and its notes. Not how it was found, or the source link. The first line names the stop or stay as `find_in_trip` does. Decided on 2026-10-28, while #199 was being built.

```
Set 2 for Day 4, Stop 2 (stop_…), meal: "pie": 2 candidates.
- Pie shop (place_…), Bakery, 4.6 stars, $, Torrey, detour 12 m when offered. Why: "Famous pie, on the way." Tier: value.
- Gifford's Bakery (place_…), Bakery, 4.4 stars, $$, Fruita, detour 0 m when offered. Why: "…" Tier: midRange. Notes: "closed Sundays"

Lodging set 1 for Stay 2, Torrey (stay_…): 3 candidates.
```

**Reading a worker brief (workers):**

| Tool | Does | Takes | Returns |
|---|---|---|---|
| `read_worker_brief_facts` | Reads the facts for the stops and stay in a worker brief, so the coordinator doesn't copy them into the worker brief (technical spec 5.3). Called first | The stop and stay IDs from the worker brief, as a list of one or more | For a stay: its town, with its place ID, its dates and nights, its activities, and its lodging candidates already offered. Its activities are its attraction stops (technical spec 6.3), each with its place's name, ID, and short line, or its purpose if none is selected, and its date and time. For a stop: its day's ID, number, and date, its kind, purpose, set time or "none", and search area, the day's stops in order, with their times, purposes, and selected places, and its candidates already offered. Each candidate with its place ID and name |

**It saves the worker a read for each item, and the coordinator one for each worker brief.** A whole read only counts candidates (above), so without it the coordinator would read each stop or stay to list the candidates already offered. The reply is the same for every worker, so a worker gets some facts it doesn't use, such as lodging candidates for the weather worker. The reply is written in the style of a scoped read, with the same names for days and stops. A stop with no search area, a check-in, gets an error, since no worker fills it (technical spec 6). A bad ID gets an error, as in every tool (section 4). The `Agent` hook uses the IDs passed here to list the worker brief's items that got no candidates, or no weather text (technical spec 6.5).

**It's its own tool, not a scoped `read_itinerary`, though it shows the same data.** The reply reuses the read's lines, but differs in three ways:

- **It's much smaller.** A stay read is 4,090 to 12,154 tokens on a busy trip (2.1, above). It gives every candidate in full for every stop on the stay's days, with their rationale, plus the weather text, approvals, and check results. A worker needs only its own items, the day's other stops, and the names of the candidates already offered. Check results could also lead a worker to report problems that aren't its job.
- **It takes the exact items the worker fills.** The `Agent` hook lists the ones that got nothing from these IDs. A stay read names only the stay, not which of its stops the worker was sent to fill.
- **It gives a stay's activities by the weather rule** (technical spec 6.3). A stay read doesn't. Example: stops along the last day's leg count with the last stay, but the last day isn't one of that stay's days.

**How the reply is laid out.** Each stay, and each day with stops asked for, is one part, in the order the IDs were given. Stops on the same day share their day's part, so the day's stops are listed once. An ID given twice counts once. A day's part gives the day's line, as a read gives it, then each stop asked for, in the day's order, with its kind, purpose, search area, and set time, given as "none" when it has none. Under each stop asked for come the candidates already offered, each with its set, its place, and whether it's selected, but no rationale. Then every stop on the day, as a whole read gives its line, with its times and selected place. A stay's part gives the stay's line, as a read gives it, its lodging candidates already offered, the same way, and its activities. Decided on 2026-10-28, while #199 was being built.

```
Stay 1 (stay_…): Moab (place_…), City, Moab. 3 nights, Days 1 to 3, from Sunday, October 10, 2027 to the morning of Wednesday, October 13, 2027.
- Lodging candidates already offered:
  - Set 1: Red Cliffs Lodge (place_…), Hotel, 4.5 stars, Moab, selected.
- The stay's activities:
  - Delicate Arch trail (place_…), Hiking area, 4.9 stars: Monday, October 11, 2027, 6:00 a.m. to 8:40 a.m.
  - a hike, no place picked yet: Monday, October 11, 2027, 1:15 p.m.

Day 4 (day_…), Wednesday, October 13, 2027: Moab → Torrey. Starts 8:00 a.m., the usual start time.
Stops asked for:
- Stop 2 (stop_…), meal: "pie". Along the leg. Set time: none.
  - Candidates already offered: none.
The day's stops, in order:
- 9:55 a.m. to 11:55 a.m.: Stop 1 (stop_…), attraction: "hoodoos". Along the leg. Selected: Goblin Valley State Park (place_…), Green River, visit time 2 h.
- 1:20 p.m.: Stop 2 (stop_…), meal: "pie". Along the leg. No candidates yet.
```

### 2.2 Memory

Coordinator only. Workers never see memory (technical spec 6.4). What memory holds, and the rules for writing it, are in technical spec 3.1 and 5.2.

| Tool | Does | Takes |
|---|---|---|
| `read_memory` | Reads all of user memory and all of this trip's memory | Nothing |
| `add_memory_item` | Adds an item | User or trip, and the text |
| `update_memory_item` | Rewrites an item | Item ID and the new text |
| `forget_memory_item` | Removes an item | Item ID |

**`read_memory` returns everything, with no search.** Memory has a size cap, so it's small enough to read whole (technical spec 3.1). Each item comes with its ID, whether it's user or trip memory, and its text, in the order added. The coordinator reads it at the start of a session and after a resume, and again whenever it isn't sure it still has it.

**Whose memory comes from the session.** No memory tool takes a user ID or trip ID (section 4). `add_memory_item` saves to the session user's memory, or to this trip's. `update_memory_item` and `forget_memory_item` work only on the session user's own items, and for a trip item, only on this trip's. Any other item ID gets "no such memory item," the same error as an ID that doesn't exist, so the error doesn't say whether another user's item exists.

**Refusals.** An add over the maximum memory items is refused, and so is text over the maximum memory item length (technical spec section 10). The error gives the limit, so the coordinator can merge or forget items, or shorten the text. Adding, updating, or forgetting a trip item on a started trip is refused (section 4).

### 2.3 Places

Every search saves its results as places in the trip's data and returns their IDs. The trip's rejected places are left out of `search_near` and `search_along_leg` results (domain model 3.4). `find_place` returns them, marked rejected with the user's reason, so the coordinator can tell the user why, and a worker knows to skip them. A place found twice is stored once (domain model 3.1). Each result's text from outside sources is labeled as data, not instructions.

| Tool | Does | Takes | Returns |
|---|---|---|---|
| `find_place` | Finds a named place: a town, a must-see, an address, a place the user names, or a place a worker found by web search | Text, and where to search: a town or region with its state, or only the state when unsure, such as "Big Sur, CA" or "Utah". The app plans only US trips, so every place has a state | Up to 5 matches, best first, each with place ID, name, address, and type. When Google finds none, the reply says so, and it isn't an error. Every match is stored, so its place ID works in the other tools, but that doesn't add it to the itinerary, so `find_in_trip` doesn't find it |
| `read_place` | Reads a place's full record. A place that isn't one of the session trip's places gets the same error as one that doesn't exist (persistence design, section 8.6) | Place ID | Everything stored: name, type, address, coordinates, rating and review count, price level, Google's weekly hours lines, links, and summaries inside the place content label. Not Google's place ID, or the opening periods the checks use, which say the same as the hours lines |
| `search_near` | Finds hotels, restaurants, or attractions near a stay, or near the start or end place | A stop or stay ID from the worker brief, and what to look for | Up to 10 matches, best first, with the details the worker needs to choose: place ID, name, type, address, distance from the point as the crow flies, rating, review count, price level, hours on the stop's or stay's dates, summaries, links. When Google finds none, the reply says so, and it isn't an error |
| `search_along_leg` | Finds places along a day's route | Day ID and what to look for | Up to 20 places, with the same details as `search_near`, except the distance from a point. Instead, each has about how far into the drive it is, in time and miles, and how far off the route it is, as the crow flies. No detour time: `add_stop_candidates` works it out when a candidate is added (2.1). Places within a set distance of either end are dropped, and the rest are sorted by position along the route ([Google design](data-sources/google.md), 2.3 and 2.4). Places near the ends belong to stops near those stays, or near the start or end place, which `search_near` covers. The distance is a setting, starting small ([technical spec](technical-spec.md), section 10). Point Lobos, about 5 miles from Monterey, must not be dropped. It does little for a big city, where naming the middle of the route in the query works better |

**`find_place` adds where to search to the text,** as in "McDonald's, Salinas, CA." That keeps a lookup from returning matches from anywhere. It asks Google for the same fields as the searches, including hours, ratings, and summaries. So a place the user names, such as "dinner at the Whaling Station," can go through the opening-hours check, and the first record stored for any place is complete (domain model 3.10). Each match's address shows the agent whether it found the right place. A place found by web search gets the same lookup, and its Google hours and rating are used like any other place's ([web search design](data-sources/web-search.md), section 4).

**`search_near` finds the point and the dates itself,** from the stop or stay. The point is the stay's lodging if one is selected, or the stay's town if not. For a stop, it's the stay in the stop's search area, or the start or end place. A stop along the leg is rejected, and the error says to use `search_along_leg`, with the stop's day ID. How far counts as near is a setting ([technical spec](technical-spec.md), section 10). To search somewhere farther, the worker names it in the query, such as "restaurants in Tuolumne Meadows." Hours come back for the stop's or stay's dates only, such as "Saturday, October 10, 2026: 11:00 AM – 9:00 PM. Sunday, October 11, 2026: Closed." A stop with a set time after midnight falls on the next day, and gets that day's hours and the day before's. Google lists hours that run past midnight on the day they open, so a bar open Friday from 11:00 AM to 2:00 AM shows it on Friday's line, not Saturday's (domain model 3.10 has the same for the opening periods). The reply's first line says so. A stay's dates are its nights plus the morning the party leaves, as the calendar's `datesOf()` gives them (domain model 4.1). Before the trip has a start date, no hours are given, and the reply says why.

**The near distance biases the search. It doesn't limit it.** The query goes to Google as the worker wrote it, with a circle around the point as a location bias, whose radius is the near distance. No town is added to the text, so a query that names a farther place searches there. Each result gives its distance from the point as the crow flies, so the worker can tell a place across town from one in the next town. Text Search ranks by relevance, not distance (Google design 2.1). Decided on 2026-10-26, while #59 was being built.

**`search_near` returns up to 10 places, and `search_along_leg` up to 20.** Each result takes several lines, with its summaries, so 10 is enough to choose from without filling the worker's context. `search_along_leg` asks for Google's most, 20, since it drops places near the ends, and the rest have to cover the whole drive. Decided on 2026-10-26, while #59 was being built.

**`search_along_leg` puts places in order by the leg's route line.** Each place goes at the line's spot nearest to it. That spot can fall between two of the line's points, since Google's points can be over 5 miles apart on a straight highway, such as on I-80 from Salt Lake City to Wendover (checked 2026-10-26). How far into the drive it is comes from the share of the line before that spot, times the leg's drive time and distance. Google's routing summaries give a drive from the leg's start to each place, but it's the fastest drive, which doesn't follow the leg's waypoints or stops. On San Francisco Day 2, the summaries put Estero Bluffs before Harmony Headlands, which the drive down the coast reaches first (Google design 2.4). A place is dropped when it's within the along-leg end distance of either end of the leg, as the crow flies. Decided on 2026-10-26, while #59 was being built.

**`search_along_leg` gives how far off the route each place is, not a detour time.** It's the distance from the place to the route line's nearest spot, as the crow flies, such as "0.2 miles off the route." The drive there can be longer, such as up a canyon road, and the description says so. It doesn't ask Google for routing summaries. A detour time from them would be Google's two drives, less the leg's drive time. Those drives skip the leg's waypoints and stops, so on San Francisco Day 2 most detours came out at 0 (Google design 2.4). A wrong number a worker trusts is harder to trace than none. Distance off the route also shows when Google's pin for a place is far from the road. Pfeiffer Big Sur State Park's pin is 6.4 miles off that leg's route, though the park's entrance is on CA-1. `add_stop_candidates` works out the real detour time when the candidate is added (2.1). Changed on 2026-10-26 at Joe's request, in PR #159.

**`search_along_leg` refuses a day with nothing along a leg.** A day that starts and ends at the same stay is refused, as `add_stops` refuses a stop along the leg there, and the error says to search near the stay. A day with no leg yet, before the trip has a start place and an end place, is refused too.

**Both searches reply in the same shape.** A first line says what was searched for, around which point or along which day, and which dates the hours are for. Each place follows after a blank line. A last line counts the places left out, and why, when there are any:

```
Places for "state park" along Day 2's drive (day_…), from Monterey to San Luis Obispo, in the order the drive reaches them. Hours are for Friday, May 14, 2027.

China Cove (place_…)
Type: none. Address: Point Lobos State Natural Reserve, 62 CA-1, Carmel, CA 93923, USA. About 16 m and 11.1 miles into the drive. 0.2 miles off the route.
Rating: 4.8 stars from 438 reviews. Price level: not listed.
Hours: Friday, May 14, 2027: 8:00 AM – 7:00 PM.
Links: https://maps.google.com/?cid=… https://www.google.com/maps/place//data=…
<place_content source="Google">
…
</place_content>

Left out: 2 places within 2 miles of either end of the drive.
```

A `search_near` result gives "0.6 miles away." in place of how far into the drive and off the route.

**There is no price level input.** Results show each restaurant's price level, which the worker uses as a guide when it judges the tier, as it uses the summaries for hotels. A price filter would likely drop places with no price level listed (not tested).

**`search_along_leg` reads the route line itself,** from the day's leg in the trip. The route line is large, so it never passes through the leg scout's context.

### 2.4 Routing

| Tool | Does | Takes | Returns |
|---|---|---|---|
| `compute_route` | Works out a rough route for the coordinator's planning, such as a shape sketch (technical spec 4.2). One call can cover the whole trip | Points in order, each a place ID or a plain name, and each marked as a stopover or a waypoint. Order: "keep" or "fastest" | Road time and distance from each stopover to the next, and in total. The order used. The place each plain name resolved to. No route line |

**A point is a stopover or a waypoint.** Stopovers are where the party stops, usually towns that might become stays. They aren't called stops, since a stop in the itinerary is a meal or attraction on a day. Waypoints are the same as a day's waypoints: places the road must pass through without stopping, to steer the route. They go in the same list, where the coordinator wants them. Example: Grand Junction (stopover), Dewey Bridge (waypoint), Moab (stopover). A waypoint doesn't split the times. Grand Junction to Moab comes back as one road time, through Dewey Bridge.

**The coordinator places waypoints here, but code places them on a leg** (domain model 4.7). A leg's stops change after its waypoints are set, so a waypoint placed by hand could end up next to the wrong stop. A `compute_route` call is one-off, so its order can't go stale.

**Order "fastest" lets Google rearrange the middle stopovers** into the fastest driving order. The first and last stay where they are. "Keep" leaves them as given. Google can't rearrange stopovers and steer through waypoints in one call, so "fastest" with any waypoint is rejected with an error that says so. To get both, call once with "fastest", then again with "keep" and the waypoints added.

**Plain names are allowed** so a sketch doesn't need a lookup for every town. A name can resolve somewhere unexpected without any error. In testing, "Dewey Bridge, UT" resolved to Salt Lake City. So the tool returns the place each name resolved to, and the coordinator can spot a bad match. These are for checking only: `compute_route` saves no places. Anything written to the itinerary, such as a stay's town, is looked up with `find_place` first. Waypoints on the itinerary's days are always place IDs (domain model 3.6).

**Code matches each plain name with Google Places, then routes by the match's place ID.** Google Routes can take a name itself, but it never says what the name matched. So the tool runs a Text Search for the best match first, asking only for its ID, name, and address, which makes it a Pro call, not a rated one ([Google design](data-sources/google.md), section 5). The reply gives each match's name and address, such as '"Moab, UT" matched Moab, at Moab, UT 84532, USA.' A name with no match is an error that says to add the state or use `find_place`. Agreed by Joe on 2026-10-24, while #55 was being built.

**Google can find no route through a waypoint, without saying why.** In testing, Seattle to Miami with Atlanta as a waypoint came back empty, and with Atlanta as a stopover it worked (Google design 2.4). So the error for no route names the waypoints, and says to try stopping at one. Routing a day's leg can give the same error, so it doesn't say "stopover".

**There is no route type input.** It would change nothing in the call to Google. A route is made scenic with waypoints, or with stops that already pull it onto the scenic road (domain model 3.8).

Routes on the itinerary's legs are computed and stored by the `trip` tools when a write changes them, one day at a time, not with this tool (domain model 4.7).

### 2.5 Weather

Weather worker only.

| Tool | Does | Takes | Returns |
|---|---|---|---|
| `look_up_stay_weather` | Looks up the weather for a stay's dates | Stay ID, and a place ID: the stay's town, from `read_worker_brief_facts`, or an attraction far from it, such as Tuolumne Meadows on a Yosemite stay | A daily forecast if every one of the stay's dates is within 7 days (technical spec section 8): highs, lows, conditions, and chances of rain and thunderstorms ([Google design](data-sources/google.md), section 3). Seasonal averages otherwise: average highs and lows, chances of rain and snow, and shares of hot days and freezing nights ([Open-Meteo design](data-sources/open-meteo.md), 2.3). Labeled with which one it is. An error when a forecast doesn't cover every date |

**Code picks the source, not the worker.** The dates come from the stay, so the worker can't ask for a forecast too far out.

**A forecast that doesn't cover every date is an error,** not seasonal averages, since `set_stay_weather` would label the text a forecast. The worker saves nothing for that stay, so it keeps its old text (technical spec 6.3).

**The weather worker saves its own text** with `set_stay_weather` (2.1). Code builds its result from those saves' replies, one line per stay (technical spec 6.5).

### 2.6 Worker

Every worker ends by calling `report_result`. A hook records its input, and code builds the result the coordinator sees from it and from the worker's other calls (technical spec 6.5).

| Tool | Does | Takes | Returns |
|---|---|---|---|
| `report_result` | Ends the worker's work, with what the coordinator should hear besides the candidates | `problems`: a list of short sentences, such as "Gifford Homestead is closed on Wednesdays, and Day 4 is a Wednesday" or "Only two places in Torrey fit a quiet B&B." `questionsForUser`: a list of short sentences, such as "Should the Day 2 lunch be a picnic, since the day is all hiking?" Both are required. Either can be an empty list | "Result recorded. You're done." |

**A problem is something the coordinator should know. A question needs the user's decision.** A worker can't ask the user anything, so the coordinator asks (technical spec 1). The candidates don't go here: the candidate tools already saved them, and code lists them from those calls.

**A second call replaces the first.** The result uses the last one.

**The questions input is `questionsForUser`, not `questions`.** The name says whose decision a question needs, so the model doesn't have to get that from its instructions alone. Decided on 2026-10-28, while #198 was being built.

**The description tells the worker not to repeat what it added or saved.** The coordinator gets that from the worker's other calls (technical spec 6.5). What a problem and a question are goes in the workers' instructions (section 4), since all three workers share the meaning. Technical spec 6.4 has the text.

---

## 3. Who gets which tool

| Tool | Coordinator | Stay researcher | Leg scout | Weather and clothing worker |
|---|---|---|---|---|
| `trip`: `read_trip_brief` | Yes | | | |
| `trip`: `read_itinerary` | Yes | | | |
| `trip`: `find_in_trip` | Yes | | | |
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
| `trip`: `set_waypoints` | Yes | | | |
| `trip`: `select_candidate` | Yes | | | |
| `trip`: `select_user_place` | Yes | | | |
| `trip`: `reject_places` | Yes | | | |
| `trip`: `set_stay_weather` | | | | Yes |
| `trip`: `add_lodging_candidates` | | Yes | | |
| `trip`: `add_stop_candidates` | | Yes | Yes | |
| `trip`: `read_worker_brief_facts` | | Yes | Yes | Yes |
| `memory`: `read_memory` | Yes | | | |
| `memory`: `add_memory_item` | Yes | | | |
| `memory`: `update_memory_item` | Yes | | | |
| `memory`: `forget_memory_item` | Yes | | | |
| `places`: `find_place` | Yes | Yes | Yes | |
| `places`: `read_place` | Yes | | | |
| `places`: `search_near` | | Yes | Yes | |
| `places`: `search_along_leg` | | | Yes | |
| `routing`: `compute_route` | Yes | | | |
| `weather`: `look_up_stay_weather` | | | | Yes |
| `worker`: `report_result` | | Yes | Yes | Yes |
| Built-in `WebSearch` | | Yes | Yes, Atlas Obscura only | |
| Built-in `WebFetch` | | Yes | | |
| Built-in `Agent`, to call workers | Yes | | | |

That's 25 tools for the coordinator, counting `Agent`, 8 for the stay researcher, 7 for the leg scout, and 4 for the weather worker. Each agent's definition lists exactly the tools in its column, each by name (technical spec 6.5). The coordinator's `Agent` entry also names the worker types it can start.

**Why only the coordinator gets `find_in_trip`.** Only the coordinator talks to the user, so only it hears a place named. A worker that offers a place already a candidate there gets a refusal from code (section 2.1).

**Why the leg scout has `search_near`.** For one case only: stops near the start or end place, such as breakfast in Grand Junction before the first drive. Those places aren't stays, so no stay researcher covers them. `search_along_leg` can't find them either, because it drops places near the leg's ends, where results bunch up ([Google design](data-sources/google.md), 2.4). A later tool review should keep this case in mind (technical spec 6.2).

The leg scout gets `WebSearch` only for Atlas Obscura, and a hook enforces it (section 4). Atlas Obscura blocks `WebFetch` ([web search design](data-sources/web-search.md), section 3), so the leg scout gets no `WebFetch`.

---

## 4. Rules for all tools

- **The trip comes from the session, never from a tool input.** Each session gets its own MCP server objects, made with the trip and user already set. They are small wrappers around shared tool code. One object can't be shared by two sessions running at once (tested: the second session silently got no tools). A turn's workers use the same objects as its coordinator, and two workers at once worked that way (#191). No tool takes a trip ID, so no agent can reach another trip, even with a made-up ID.
- **Bad IDs are rejected** (technical spec 7.1). A stop, stay, day, or place that doesn't exist in this trip returns an error. So does selecting a place that isn't one of that stop's or stay's candidates. The tool never guesses.
- **IDs are short and random, with a prefix for the kind of item,** such as `stop_k7m2x9qa` (technical spec 7.1). A worker only sees the IDs in its worker brief, and can't guess any others. So it can only add candidates to its own stops and stay, without the tools needing to know which worker is calling. An ID of the wrong kind, such as a stay ID passed to `update_stop`, gets an error that says so.
- **The leg scout's web search is limited by a hook, not only by its instructions.** A PreToolUse hook, code our app runs before every tool call, sees which kind of agent is calling. It denies a leg scout's `WebSearch` unless the search is limited to `atlasobscura.com`, with a reason the leg scout can read.
- **A started trip can't be changed.** Once today is the trip's start date or later, every `trip` tool that writes refuses the call. So does a memory tool that adds, updates, or forgets a trip item. User items can still change. The error says the trip has started, with the date it used (technical spec section 8). The chat is closed from then on (functional spec 2), so this catches a turn still running at midnight.
- **Errors are readable.** A failed call, a spent API limit, or a broken rule comes back as a message. The agent that called the tool can read it, and the coordinator can explain it to the user.
- **A rule that covers several tools goes in the system prompt of each agent that has those tools,** not in an MCP server's instructions, and not in each tool's description. Our MCP servers send no instructions. Those are for servers that anyone can plug into a client they don't control, and we write every server and every agent. A system prompt is also per agent, and a server isn't: the `trip` server holds both the coordinator's tools and the workers' tools. When a rule applies to more than one agent, its text is written once in code, and each agent's prompt that needs it includes it. A tool's description holds only what's specific to that tool, and the system prompt never repeats it. When an agent evaluation shows a model missing one of these rules, the rule is repeated in the description of the tool where it was missed.
- **What an item means goes in the agent's instructions, and a tool input says only how to pass it.** The instructions name each item as the tools do, such as `tripLengthInDays`, with what it means. The input description gives only format, units, and limits, such as "a clock time, such as 8:00 a.m." So a read's lines are explained by the instructions, never by pointing to another tool.
- **A limit that's a setting is filled in from the settings when the app starts,** in an input description or an agent's instructions. It's never written into the text, so a changed setting can't leave stale text. Example: the `update_trip_brief` input description for `tripLengthInDays` says "from 1 to" the maximum trip length, and `comfortableDrivingInHours` says "at most" the maximum daily driving (technical spec section 10).
- **The coordinator sees short lines, not full records** (technical spec 7.2). Only `read_place` returns a full record to the coordinator.
