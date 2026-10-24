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

**Grouping is separate from access.** An MCP server can hold tools for the coordinator and tools for workers. Each agent gets exactly the tools it uses (section 3).

| MCP server | Job | Sources behind it |
|---|---|---|
| `trip` | The trip brief and the itinerary, including candidates and feasibility checks | Our storage. Google Routes, to re-route legs |
| `memory` | User memory and trip memory | Our storage |
| `places` | Finding places and reading their details | Google Places |
| `routing` | Rough drive times for the coordinator's checks | Google Routes |
| `weather` | Forecasts and seasonal averages | Google Weather, Open-Meteo |

Web search is Claude's built-in `WebSearch` and `WebFetch` ([web search design](data-sources/web-search.md), section 1), not one of our MCP servers. The coordinator calls workers with the SDK's built-in `Agent` tool.

---

## 2. Tools

### 2.1 Trip

The coordinator's tools for the trip brief and itinerary, plus the workers' tools for adding candidates and saving weather text.

**Reading:**

| Tool | Does | Returns |
|---|---|---|
| `read_trip_brief` | Reads the trip brief | Every item in functional spec 5.2 |
| `read_itinerary` | Reads the whole itinerary, or one part of it. The scope is required: "all" for the whole itinerary, a day ID (the day, its leg, its stops, and their candidates), a stay ID (the stay, its days and their stops, and stops on other days whose search area is this stay), or a stop ID (the stop and its full candidate history) | Every stored property of each item it covers, plus what code works out from it. The exception is each leg's route line, which never goes to the model ([Google design](data-sources/google.md), 2.3). The [domain model](domain-model.md) lists them. For the whole itinerary, that includes: start and end places, start date, stays with their nights, and days with their dates, start times, stops, and legs. Each day's schedule, worked out: each stop's arrival and end, free time, and the arrival where the party sleeps (domain model 4.1). A stop with no place shows its set time, or no time if it has none. For each stop and stay: its selected place, if any, with its rationale, every candidate, in the order offered, each with its set number and its visit and detour times. Days, stops, and sets are counted from 1, as people count them (domain model section 1). For the whole itinerary, also the trip's rejected places with their reasons. Each place is shown as its name and short line (technical spec 7.2). A read scoped to a stop or stay also gives every candidate's other stored properties: its rationale, its tier and rule, how it was found with the source link, and its notes. Each stay's weather and clothing text, marked out of date when the stay's place, dates, or activities no longer match the ones it was written for (domain model 4.1). Each day's and stop's approvals, each marked as applying or not. Current check results, each marked new or already known, with approved warnings marked approved. Results that went away since the last write aren't shown, since the next write's reply reports them. A scoped read returns the same details for its part only, with the results for that part. Each leg's routed places, best order, and time saved aren't shown: they're for telling when to route the leg again, and the stop order note gives the best order when it matters (technical spec section 8) |

**Scoped reads keep the coordinator's context small.** Every read stays in context, and older copies go out of date. Most questions are about one part, such as "what's on Day 2" or "what's tied to Moab," so the coordinator asks for that part by ID. The scopes are IDs, not a query language, so a bad request gets an error instead of quietly returning nothing. The scope is required, so a whole read is asked for by name, never by leaving an input out (section 4).

**A read has a size limit of 25,000 tokens.** Claude Code saves a tool result over 25,000 tokens to a file, and gives the model only the file's path and a short preview. The coordinator has no tool to read the file, so for it the result is cut off. 25,000 is Claude Code's default for MCP tools, and nothing in it treats in-process servers differently (checked in Claude Code 2.1.301, which SDK 0.3.301 ships). So `read_itinerary` returns an error instead of a reply over the limit: "Can't read the itinerary: it's too large to return. Read one day, stay, or stop at a time instead." The tool can't count tokens without calling the API, so it counts characters, and refuses a reply over 40,000 of them.

**The size of a whole read, measured on 2026-10-23.** The trip measured is a 14-day loop with 8 stays, five stops a day, three candidates for each stop and stay, and a second set for about one in four of them, 312 candidates in all (`src/domain/fourteen-day-example.fake.ts`). Its whole read is 72,264 characters. The API counts it as 38,271 tokens for the coordinator's model, `claude-opus-5-5`. That's 1.89 characters a token. Plain English counts about 2.9, so the IDs and short lines in a read cost more tokens than prose does. At 1.89, 40,000 characters is about 21,000 tokens, which leaves room for text with even more IDs. So at that density, a whole read of a 14-day trip is refused, and one of about a week fits. Each of its days fits, at about 5,200 characters at most. Its 3-night stay is 28,104 characters, since a stay read gives every candidate's full details. A stay of 5 nights or more at that density would be refused too.

**A whole read of a long trip is refused.** Technical spec 5.2 has the coordinator read the whole itinerary at the start of a session, after a resume, and for "what's left to decide?". On a long trip it gets the error instead, and reads the trip a stay or a day at a time. Raising the limit isn't the fix: a result cut off by Claude Code would leave the coordinator with part of the trip, and nothing to tell it so.

**Writing.** Every write makes the follow-on changes itself, such as re-routing legs or adding days (domain model section 4). Its reply carries only what code worked out: each re-routed leg's new drive time and distance, anything the tool did on its own, such as days added, the stops on any day whose start or end changed, and its check results: every one that is new or went away, anywhere in the trip, plus the already-known ones for everything it touched, with approved warnings marked approved (technical spec, section 8). It doesn't echo back what the coordinator sent. Example: "Moved Corona Arch to Day 3, after Windows. Day 2: 2 h 10 m → 1 h 30 m. Day 3: 0 h → 45 m. No new warnings." The worker writes `set_stay_weather`, `add_lodging_candidates`, and `add_stop_candidates` return no check results (technical spec, section 8). For more, the coordinator uses a scoped read.

**The tool builds its reply from what the write hands back** ([persistence design](persistence.md), section 8.2): what its own change returned, the leg changes, and the check comparison. The check comparison lists every result that's new, already known, or gone. The tool keeps every new and gone result, and the already-known results for what the write touched. **What the write touched** is:

- The stops, days, and stays the call names.
- What its change returned as changed, such as the stops and stays a rejection changed (domain model 4.3), or the days `update_stay` added.
- The days in the leg changes.
- The itinerary, which stands for the trip as a whole.
- For a trip brief change, every day when the comfortable driving hours change, since every daily driving warning gives them. Without this, a warning still there after the change would be already known, and its new text, the new limit, wouldn't come back.

Example: rejecting the selected Moab hotel names only the hotel. The change returns the Moab stay, and the leg changes hold Days 1, 2, and 4. The reply gives the already-known results for those, and for the itinerary.

The writing tools:

| Tool | Does | Takes |
|---|---|---|
| `update_trip_brief` | Changes one or more items in the trip brief. Items not given are left alone. Each item given replaces the old value | The items and their new values |
| `update_itinerary` | Changes the itinerary's own properties. Properties not given are left alone | Any of: start place ID with a name, end place ID with a name, start date. The name is required with the place. It is used only when Google has no name for the place, such as "Mike's house" for an address, and only the first name given is kept (domain model 3.10). When the place already has a different name, the reply says the name was kept, since a place can't be renamed in the MVP. For a loop, the start and end are the same place. A start date that isn't after today is rejected, and the error gives today's date. So is a start date while the itinerary has no start place, unless the same call sets one, since today's date comes from the start place's time zone (technical spec section 8). A new start place where today is already on or after the start date is rejected too, since the trip would start at once (domain model 3.4) |
| `add_stay` | Adds a stay, and one day for each of its nights. The reply gives the new stay's ID and its days' IDs, and lists the stops on any day whose start or end changed (domain model 4.4) | Place ID (usually a town), the stay it goes after or "first", number of nights, and the lodging tier and the rule that produced it. Rejected until the itinerary has a start date, start place, and end place (technical spec 4.2) |
| `update_stay` | Changes a stay | Stay ID, and any of: a new place ID, the stay it now goes after or "first", number of nights, lodging tier and rule. Changing the nights adds or removes days at the end of the stay's days. The reply gives the IDs of any days it adds. Moving the stay lists the stops on any day whose start or end changed (domain model 4.4). Setting the tier records the stay's current nights with it (technical spec section 9). Removing a night is refused while that day holds stops, and the error lists them. The tool applies the inputs in this order: place, position, nights, then tier. So one call that changes the nights and sets the tier records the new nights |
| `remove_stay` | Removes a stay and its days. Refused while any stop is on its days, or while any stop anywhere has the stay as its search area. The error lists each of those stops by its purpose, its selected place's name if it has one, and its ID (domain model 4.4) | Stay ID |
| `update_day` | Changes a day: whether it's a rest day, its start time, and its approvals. A day that moves to a new stay, and the last day, can't be rest days. Marking a rest day removes the day's leg and its waypoints (domain model 4.5). It is refused while a stop on the day has no set time, and the error lists those stops. Setting an approval replaces any of the same kind (technical spec section 8) | Day ID, and any of: rest day or not, start time (a time, or "none" to use the trip brief's usual start time), approve drive hours (hours and a reason), approve route type (type and a reason), and remove an approval (its kind). An approval without a reason is rejected |
| `add_stops` | Adds empty stops to a day, in order. The reply gives the new stops' IDs, in order | Day ID, the stop the list goes after or "first", and an ordered list of one or more stops. Each item takes a kind (meal or attraction), a purpose (a short note on what the stop is for, never when, such as "dessert". It can say how long, such as "a long hike, about 5 hours"), a search area: near a stay, as its ID, along the leg, or near the start or end place, and a set time: a time, or "none" to follow the stop before it. "None" is rejected on a rest day, where no drive places a stop in the day (domain model 4.6). Meals also take a tier and the rule that produced it, even one whose place the user will name (technical spec section 9). A stay that isn't where the party slept the night before or sleeps that night is rejected. "Along the leg" is rejected on a day that starts and ends at the same stay. "Near the start place" is rejected except on the first day, and "near the end place" except on the last day |
| `update_stop` | Changes a stop's set time, visit time, tier, or approvals. Its kind, purpose, and search area can't change | Stop ID, and any of: set time (a time, or "none"), visit time (rejected while no place is selected), tier and rule (meal stops), approve opening hours (a reason; the tool records how many minutes of the visit fall within the selected place's opening hours), and remove an approval (its kind). An approval without a reason is rejected. The tool applies the inputs in this order: set time and visit time, then tier, then approvals. So an approval in the same call as a new set time records the minutes at the new time |
| `move_stop` | Moves a stop within its day or to another day. It keeps its candidates, selection, and visit time. The legs of the day it left and the day it joined are re-routed when their selected places changed, so moving a stop with no selected place re-routes nothing (domain model 4.6). A stop along the leg can't move to a day that starts and ends at the same stay, and the error says to remove the stop and add a new one. A stop near a stay, or near the start or end place, can move to a day that doesn't start or end there. The move goes through, and the check results warn that its search area doesn't fit the day (technical spec section 8) | Stop ID, day ID, the stop it goes after or "first", and a set time: a time, or "none". All are required. "None" is rejected on a rest day. The set time is required so an old one never carries over: moving dinner to breakfast restates its time or drops it |
| `remove_stops` | Removes stops and their candidates | A list of one or more stop IDs |
| `set_waypoints` | Sets a day's waypoints. An empty list clears them. Rejects a day with no leg, such as a rest day. Code places the waypoints among the day's selected stops (domain model 4.7) | Day ID, and waypoints as place IDs |
| `select_candidate` | Selects one of a stop's or a stay's candidates. Selecting the place that's already selected changes nothing, so a visit time the user changed stays. Otherwise, for a stop, it sets the visit time: the candidate's estimate for an attraction, or the meal visit time for a meal, a setting (domain model 4.6, and technical spec section 10). When the candidate's tier differs from the stop's or stay's tier, sets the stored tier to the candidate's, with the rule "the user picked a mid-range option" (or whichever tier) (technical spec section 9) | Stop or stay ID, and a place ID. A place that isn't already a candidate there is rejected, and the error says to use `select_user_place`. A rejected place is never a candidate, so it gets the same error |
| `select_user_place` | Selects a place the user specified, such as a friend's house. Adds it as a candidate in a new set of one, marked "specified by the user," then selects it (domain model 3.7) | Stop or stay ID, place ID, name, and the user's reason. When the user gives no reason, the coordinator passes "the user asked for it" (functional spec 7.6). The name works as in `update_itinerary`: it's used only when Google has no name for the place, and the reply says when it wasn't used. Attraction stops also take a visit time, which becomes the stop's. A meal stop's visit time is the meal visit time, a setting (technical spec section 10). It gets no detour time: a place the user names is a reason for the trip, not a detour (domain model 3.9). A place that's already a candidate there is rejected, and the error says to use `select_candidate`. One of the trip's rejected places is refused, and the error gives the reason it was rejected |
| `reject_places` | Rejects places for the whole trip, permanently (domain model 4.3). Adds each to the trip's rejected places with its reason, and removes it from every stop's and stay's candidates. Where it was selected, clears the selection and the stop's visit time, and re-routes the legs (domain model 4.7). The other candidates stay. The reply lists every stop and stay that lost a candidate, from what `rejectPlaces()` returns (domain model 4.3). A place already rejected is skipped, and keeps its first reason. A rejection undoes picks, not the trip's structure: it leaves a stay's town, the start and end places, and waypoints alone, since changing them is a conversation with the user | A list of one or more places, each a place ID and the user's reason. A place doesn't have to be a candidate: the coordinator can look one up with `find_place` and reject it before it's ever offered |
| `set_stay_weather` | Saves a stay's weather and clothing text. Called by the weather worker, not the coordinator | Stay ID and the text. The tool labels it forecast or seasonal averages itself, from the stay's dates, with the same rule `stay_weather` uses. It records the stay's current place, dates, and activities with it, so later changes can mark it out of date (domain model 4.1). Each activity is recorded as its stop ID and selected place ID, with no date or time (technical spec 6.3) |

**The trip brief tools name each item as the [domain model](domain-model.md) does** (section 3.2), such as `tripLengthInDays`, so an error that names an item matches the input. `read_trip_brief` shows an item with no value yet as "not set". The usual start time is a clock time, as with every time below.

**A stop's kind, purpose, and search area are fixed** (technical spec 6). Its candidates were found for that kind and purpose, in that area. A stop with a different kind, purpose, or area is a different stop, so the coordinator removes it and adds a new one. A move keeps the search area. A stop near a stay belongs on a day that starts or ends at that stay. It can also move to another day, with a warning, because undoing a new stay can need that for a moment (technical spec section 8). A stop along the leg can move within its day, or to another day that drives to a new stay or to the end place. It is then along that day's leg. Its candidates keep their detour times, labeled as of when offered. It can't move to a day that starts and ends at the same stay, where "along the leg" isn't allowed. Example: moving Moab lunch, near the Moab stay, from Day 2 to Day 3 is allowed. Moving it to the Torrey day goes through, with a warning that its search area doesn't fit the day. After a Big Sur stay is added, Point Lobos, along the leg, can move to the new Monterey-to-Big Sur day.

**Laying out a day takes one `add_stops` call.** The day's stops are one ordered list, so San Francisco Day 2 is one call with seven items.

**Times are clock times,** such as "7:00 p.m." A time after midnight is given as the next day, such as "1:00 a.m., next day," so it can't be read as an early start (domain model 4.1). A set time and a day's start time take "none" rather than a blank, because in the update tools a blank means "don't change it."

**There are no tools to add or remove days.** Days follow from stays' nights, and the last day is created with the itinerary (domain model 3.4).

**Where an item goes.** Tools never take position numbers, which are easy to get wrong after items have been added or removed. Instead, a tool takes the item to go after, or the word "first". That input is required whenever an item is placed. It is never left blank. In the update tools a blank means "don't move it," so a blank can't also mean "first."

- **Stays** take the stay they go after, or "first". Example: to put Big Sur between Monterey and San Luis Obispo, add it after the Monterey stay.
- **Stops** always take a day, plus the stop they go after on that day, or "first". `add_stops` and `move_stop` work the same way. `add_stops` places its whole list after the stop given, in list order. If the stop given isn't on that day, the tool rejects the call. The day doubles as a check that the coordinator meant the one it named. Example: to move Denny's from dinner to breakfast, move it "first" on its day, with a set time of "7:30 a.m." or "none".

**Adding candidates (workers):**

| Tool | Does | Takes |
|---|---|---|
| `add_lodging_candidates` | Adds one set of lodging candidates to a stay | Stay ID, and for each candidate: place ID, name, rationale, how it was found with the source link, and notes, such as "closed Mondays" or "reservations advised" |
| `add_stop_candidates` | Adds one set of candidates to a stop. For a stop along the leg, works out each candidate's detour time itself, with one routing call per candidate against the stop's day's leg as it is then, including its waypoints. The candidate is placed at the stop's position among the leg's selected stops (domain model 4.7). Other stops get no detour time, and neither does a place the user names (`select_user_place`) | Stop ID, and for each candidate: place ID, name, rationale, how it was found with the source link, and notes. Attraction stops also take a visit time, the worker's estimate |

**The place ID comes from a search or from `find_place`.** A place found by web search is looked up with `find_place`, by name and town. If Google doesn't list it but the source gives a street address, the worker looks up the address instead. If there's neither, the worker drops the find ([web search design](data-sources/web-search.md), section 4).

**A name is always required,** even when Google has one, so the worker never has to decide whether to pass it. A place looked up by its address has no name on Google. Cards show Google's name whenever Google has one, so the given name is used only for a place Google has no name for. The first candidate that offers such a place sets its name, whether a worker added it or the user specified it (`select_user_place`). Later candidates for the same place don't change it. The type cards show is Google's, so no tool takes one. An address has none. Places are matched by Google place ID only (domain model 3.10).

**Visit time follows the stop's kind, and it's required.** Visit time is for attraction stops, whatever the place is. Example: a barbecue joint on a barbecue trip, filling an attraction stop, needs a visit time and has no tier. A call missing a required input is rejected.

**No tool takes a candidate's tier.** Each candidate gets its stop's or stay's tier and rule when its set is added, which the coordinator set (domain model 3.9). The worker searches at the tier in its worker brief, which is the same tier. Attractions have no tier, and neither does a place the user names.

**Each call is one set** of one to three candidates. The tool works out the set number (domain model 3.9). A worker adds all of a stop's or stay's candidates in one call. A second call makes a new set, and the option card shows only the newest set. The tool's reply names the set it made, such as "Set 1 for stop_k7m2x9qa: 3 candidates," with one line per candidate. The worker passes those lines on in the result it returns to the coordinator.

**A repeat rejects the whole call.** If any place is already a candidate for the same stop or stay, or is one of the trip's rejected places, nothing is added, and the error names it. So a set is never partly written. The same place can still be a candidate for a different stop or stay. Example: the Palace Hotel can be a lodging candidate for a stay and also a candidate for a stop (domain model 3.9).

**Adding a set to a stop or stay that already has a selection keeps the selection.** That happens when the user asks for more options after choosing. The selected place is still one of the candidates, in an older set. Candidates are never changed after they're written.

**One tool for every stop, because code knows whether a detour applies.** Detour time is the extra driving off a leg's route, and only stops along the leg have one. The stop's search area already says which kind it is (domain model 3.7), so the worker passes the same inputs either way. Example: candidates for Goblin Valley, along the Moab Day 4 leg, get detour times off the Moab-to-Torrey route. Candidates for lunch near the Moab stay don't, because there's no route to detour from. Each worker's brief holds only its own stops, so the stay researcher and the leg scout share the tool.

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
| `find_place` | Finds a named place: a town, a must-see, an address, a place the user names, or a place a worker found by web search | Text, and where to search: a town, region, or state. When unsure, the state | Up to 5 matches, best first, each with place ID, name, address, and type. When Google finds none, the reply says so, and it isn't an error |
| `read_place` | Reads a place's full record. A place that isn't one of the session trip's places gets the same error as one that doesn't exist (persistence design, section 8.6) | Place ID | Everything stored: name, type, address, coordinates, rating and review count, price level, Google's weekly hours lines, links, and summaries inside the place content label. Not Google's place ID, or the opening periods the checks use, which say the same as the hours lines |
| `search_near` | Finds hotels, restaurants, or attractions near a stay, or near the start or end place | A stop or stay ID from the worker brief, and what to look for | Matches with the details the worker needs to choose: rating, review count, price level, hours on the stop's or stay's dates, summary, links |
| `search_along_leg` | Finds places along a day's route | Day ID and what to look for | The same details as `search_near`, plus a rough detour time for each, and the drive time from the leg's start to it. Places within a set distance of either end are dropped, and the rest are sorted by position along the route ([Google design](data-sources/google.md), 2.3 and 2.4). Places near the ends belong to stops near those stays, or near the start or end place, which `search_near` covers. The distance is a setting, starting small ([technical spec](technical-spec.md), section 10). Point Lobos, about 5 miles from Monterey, must not be dropped. It does little for a big city, where naming the middle of the route in the query works better |

**`find_place` adds where to search to the text,** as in "McDonald's, Salinas, CA." That keeps a lookup from returning matches from anywhere. It asks Google for the same fields as the searches, including hours, ratings, and summaries. So a place the user names, such as "dinner at the Whaling Station," can go through the opening-hours check, and the first record stored for any place is complete (domain model 3.10). Each match's address shows the agent whether it found the right place. A place found by web search gets the same lookup, and its Google hours and rating are used like any other place's ([web search design](data-sources/web-search.md), section 4).

**`search_near` finds the point and the dates itself,** from the stop or stay. The point is the stay's lodging if one is selected, or the stay's town if not. For a stop, it's the stay in the stop's search area, or the start or end place. A stop along the leg is rejected, and the error says to use `search_along_leg`. How far counts as near is a setting ([technical spec](technical-spec.md), section 10). To search somewhere farther, the worker names it in the query, such as "restaurants in Tuolumne Meadows." Hours come back for the stop's or stay's dates only, using the date a stop actually falls on, which is the next day for a set time after midnight, such as "Sat Oct 10: 11 AM–9 PM. Sun Oct 11: closed."

**There is no price level input.** Results show each restaurant's price level, and the worker judges the tier from it, as it does for hotels from their summaries. A price filter would likely drop places with no price level listed (not tested).

**`search_along_leg` reads the route line itself,** from the day's leg in the trip. The route line is large, so it never passes through the leg scout's context.

### 2.4 Routing

| Tool | Does | Takes | Returns |
|---|---|---|---|
| `compute_route` | Works out a rough route for the coordinator's planning, such as a shape sketch (technical spec 4.2). One call can cover the whole trip | Points in order, each a place ID or a plain name, and each marked as a stop or as pass-through. Order: "keep" or "fastest" | Drive time and distance from each stop to the next, and in total. The order used. The place each plain name resolved to. No route line |

**A point is a stop or a pass-through point.** Stops are where the party stops, usually towns that might become stays. Pass-through points are waypoints: places the road must pass through without stopping, to steer the route. They go in the same list, where the coordinator wants them. Example: Grand Junction (stop), Dewey Bridge (pass-through), Moab (stop). A pass-through point doesn't split the times. Grand Junction to Moab comes back as one drive time, through Dewey Bridge.

**The coordinator places waypoints here, but code places them on a leg** (domain model 4.7). A leg's stops change after its waypoints are set, so a waypoint placed by hand could end up next to the wrong stop. A `compute_route` call is one-off, so its order can't go stale.

**Order "fastest" lets Google rearrange the middle stops** into the fastest driving order. The first and last stay where they are. "Keep" leaves them as given. Google can't rearrange stops and steer through waypoints in one call, so "fastest" with any pass-through point is rejected with an error that says so. To get both, call once with "fastest", then again with "keep" and the pass-through points added.

**Plain names are allowed** so a sketch doesn't need a lookup for every town. A name can resolve somewhere unexpected without any error. In testing, "Dewey Bridge, UT" resolved to Salt Lake City. So the tool returns the place each name resolved to, and the coordinator can spot a bad match. These are for checking only: `compute_route` saves no places. Anything written to the itinerary, such as a stay's town, is looked up with `find_place` first. Waypoints on the itinerary's days are always place IDs (domain model 3.6).

**There is no route type input.** It would change nothing in the call to Google. A route is made scenic with waypoints, or with stops that already pull it onto the scenic road (domain model 3.8).

Routes on the itinerary's legs are computed and stored by the `trip` tools when a write changes them, one day at a time, not with this tool (domain model 4.7).

### 2.5 Weather

Weather worker only.

| Tool | Does | Takes | Returns |
|---|---|---|---|
| `look_up_stay_weather` | Looks up the weather for a stay's dates | Stay ID, and a place ID: the stay's town, from the worker brief, or an attraction far from it, such as Tuolumne Meadows on a Yosemite stay | A daily forecast if every one of the stay's dates is within 7 days (technical spec section 8): highs, lows, conditions, and chances of rain and thunderstorms ([Google design](data-sources/google.md), section 3). Seasonal averages otherwise: average highs and lows, chances of rain and snow, and shares of hot days and freezing nights ([Open-Meteo design](data-sources/open-meteo.md), 2.3). Labeled with which one it is. Also the stay's activities: its attraction stops, each with its place's name and ID, or its purpose if none is selected, and its date and time (technical spec 6.3). An error when a forecast doesn't cover every date |

**Code picks the source, not the worker.** The dates come from the stay, so the worker can't ask for a forecast too far out.

**A forecast that doesn't cover every date is an error,** not seasonal averages, since `set_stay_weather` would label the text a forecast. The worker saves nothing for that stay, so it keeps its old text (technical spec 6.3).

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
| `trip`: `set_waypoints` | Yes | | | |
| `trip`: `select_candidate` | Yes | | | |
| `trip`: `select_user_place` | Yes | | | |
| `trip`: `reject_places` | Yes | | | |
| `trip`: `set_stay_weather` | | | | Yes |
| `trip`: `add_lodging_candidates` | | Yes | | |
| `trip`: `add_stop_candidates` | | Yes | Yes | |
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
| Built-in `WebSearch` | | Yes | Yes, Atlas Obscura only | |
| Built-in `WebFetch` | | Yes | | |
| Built-in `Agent`, to call workers | Yes | | | |

That's 24 tools for the coordinator, counting `Agent`, 6 for the stay researcher, 5 for the leg scout, and 2 for the weather worker.

**Why the leg scout has `search_near`.** For one case only: stops near the start or end place, such as breakfast in Grand Junction before the first drive. Those places aren't stays, so no stay researcher covers them. `search_along_leg` can't find them either, because it drops places near the leg's ends, where results bunch up ([Google design](data-sources/google.md), 2.4). A later tool review should keep this case in mind (technical spec 6.2).

The leg scout gets `WebSearch` only for Atlas Obscura, and a hook enforces it (section 4). Atlas Obscura blocks `WebFetch` ([web search design](data-sources/web-search.md), section 3), so the leg scout gets no `WebFetch`.

---

## 4. Rules for all tools

- **The trip comes from the session, never from a tool input.** Each session gets its own MCP server objects, made with the trip and user already set. They are small wrappers around shared tool code. One object can't be shared by two sessions running at once (tested: the second session silently got no tools). No tool takes a trip ID, so no agent can reach another trip, even with a made-up ID.
- **Bad IDs are rejected** (technical spec 7.1). A stop, stay, day, or place that doesn't exist in this trip returns an error. So does selecting a place that isn't one of that stop's or stay's candidates. The tool never guesses.
- **IDs are short and random, with a prefix for the kind of item,** such as `stop_k7m2x9qa` (technical spec 7.1). A worker only sees the IDs in its worker brief, and can't guess any others. So it can only add candidates to its own stops and stay, without the tools needing to know which worker is calling. An ID of the wrong kind, such as a stay ID passed to `update_stop`, gets an error that says so.
- **The leg scout's web search is limited by a hook, not only by its instructions.** A PreToolUse hook, code our app runs before every tool call, sees which kind of agent is calling. It denies a leg scout's `WebSearch` unless the search is limited to `atlasobscura.com`, with a reason the leg scout can read.
- **A started trip can't be changed.** Once today is the trip's start date or later, every `trip` tool that writes refuses the call. So does a memory tool that adds, updates, or forgets a trip item. User items can still change. The error says the trip has started, with the date it used (technical spec section 8). The chat is closed from then on (functional spec 2), so this catches a turn still running at midnight.
- **Errors are readable.** A failed call, a spent API limit, or a broken rule comes back as a message. The agent that called the tool can read it, and the coordinator can explain it to the user.
- **A rule that covers several tools goes in the system prompt of each agent that has those tools,** not in an MCP server's instructions, and not in each tool's description. Our MCP servers send no instructions. Those are for servers that anyone can plug into a client they don't control, and we write every server and every agent. A system prompt is also per agent, and a server isn't: the `trip` server holds both the coordinator's tools and the workers' tools. When a rule applies to more than one agent, its text is written once in code, and each agent's prompt that needs it includes it. A tool's description holds only what's specific to that tool, and the system prompt never repeats it. When an agent evaluation shows a model missing one of these rules, the rule is repeated in the description of the tool where it was missed.
- **What an item means goes in the agent's instructions, and a tool input says only how to pass it.** The instructions name each item as the tools do, such as `tripLengthInDays`, with what it means. The input description gives only format, units, and limits, such as "a clock time, such as 8:00 a.m." So a read's lines are explained by the instructions, never by pointing to another tool.
- **A limit that's a setting is filled in from the settings when the app starts,** in an input description or an agent's instructions. It's never written into the text, so a changed setting can't leave stale text. Example: the `update_trip_brief` input description for `tripLengthInDays` says "from 1 to" the maximum trip length, and `comfortableDrivingInHours` says "at most" the maximum daily driving (technical spec section 10).
- **The coordinator sees short lines, not full records** (technical spec 7.2). Only `read_place` returns a full record to the coordinator.
