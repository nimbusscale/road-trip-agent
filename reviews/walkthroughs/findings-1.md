# Walk-through of the two example trips: findings

> **Snapshot, out of date.** This is the output of design walk-through 1, from 2026-10-11. It describes the design as it was then. The design changed after it, so much of this no longer matches. The current design is in `design/`. Anything still open is in `research/domain-model-notes.md`. See `reviews/walkthroughs/README.md`.

Technical spec open question 4. I walked both examples in technical spec 3.1 through the planning rounds in 4.2. I worked only from `design/`. Every tool reply below is made up to fit its description in `tool-design.md`. Drive times are rough.

**Assumptions used throughout.** These are things the docs don't say, which I needed to keep walking. Each one is also a finding or is in the properties list.

- The drive-time buffer is 10% of road time. The docs call it a setting but give no value or form.
- The "few miles" that along-leg search drops at each end is 5 miles. The "near" distance for `search_near` is 30 miles.
- San Francisco brief items the example leaves out: two adults; max driving 5 hours; budget mid-range by default; local food, no hotel breakfast; interests are aviation history, coffee, old diners, the coast, and dessert; the Santa Cruz Boardwalk is a must-see.
- The user had no user memory before the San Francisco trip. By the Moab trip, user memory holds "usually two adults" and "prefers scenic routes".

---

## 1. Findings

Most important first. Tags: **needs a decision**, **wording fix**, **for the object model**.

### F1. Nobody says where waypoints go once stops are selected — **needs a decision**

**Settled 2026-10-11:** option 1. Applied to technical spec 3.1 and 3.3 and to `update_leg`, then committed.

**What happened.** In the skeleton, the coordinator puts a waypoint at Big Sur village on San Francisco Day 2 (Monterey to San Luis Obispo). The leg is then Monterey → Big Sur village → San Luis Obispo, about 2 h 50 m on Highway 1. That works for the fill. Then the user selects First Awakenings, a breakfast spot in Monterey, as the first stop. Code now has to route "through the day's selected stops in the day's order" (3.3) and also through the waypoint. No doc says where the waypoint goes in that list.

- If code puts waypoints first, the route is Monterey → Big Sur village → back north to First Awakenings in Monterey → south again. That adds about 1 h 40 m. The daily driving check could then flag a day that is fine.
- If code puts waypoints last, the route is … → Madonna Inn in San Luis Obispo → back north to Big Sur village → San Luis Obispo. That adds about 4 hours.

Moab Day 1 (Dewey Bridge) happens to work if waypoints go first, because its stops are all south of the waypoint. San Francisco Day 2 works with neither choice.

**The spec and the example disagree.** Technical spec 3.3 says that when a day's stops are already on Highway 1, "no waypoint is needed." The finished San Francisco example still holds the Big Sur waypoint, with every stop on Highway 1. Its comment says the waypoint is there "before any stops are selected." No rule or tool removes it. The coordinator could clear it with `update_leg`, but nothing tells it to.

**Docs.** Technical spec 3.1 (San Francisco example, Day 2), 3.3 (waypoints, the leg's drive time row), 3.4. Tool design `update_leg`.

**Options.**
1. Code places each waypoint where it adds the least straight-line distance between the from point, the selected stops, and the to point. This needs no Google call. The waypoint stays on the leg and does no harm once the stops already pull the route onto the road.
2. Waypoints apply only while the leg has no selected stops. Code ignores them once any stop is selected. This is simple, but it breaks when only some stops are selected. Example: with only Firestone Grill (in San Luis Obispo) selected, Day 2 would route inland on US-101 again.
3. The coordinator places each waypoint "after stop X" the way it places stops, and is told to remove waypoints once stops cover the road. This ties waypoints to stops that may still be empty.

**Recommendation.** Option 1. Then fix 3.3 so it agrees with the example: "A waypoint stays on the leg. Once the selected stops pull the route onto the road, it changes nothing." Keep the coordinator's right to remove one, but don't require it.

### F2. A stop's "near" stay is wrong for morning stops on moving days and for every stop on the last day — **needs a decision**

**Settled 2026-10-11:** option 1, as a fixed "search area" on each stop, set in `add_stops`. Moves split into `move_stop`, which rejects a move that would change the search area. Committed with F13 and F18.8.

**What happened.** Three cases from the walk:

- **San Francisco Day 2, First Awakenings.** This is breakfast in Monterey before the drive south. Day 2 sleeps in San Luis Obispo. `search_near` uses "the stay of the stop's day" (tool design 2.3), so it searches San Luis Obispo, 140 miles away. `search_along_leg` drops places within a few miles of either end of the leg, so it drops Monterey too. The only way through is for the coordinator to brief the *Monterey* researcher with a *Day 2* stop, and for that worker to know to put "Monterey" in its query. Neither step is written down.
- **Moab Day 5, Panorama Point.** This is stargazing at 1 a.m. near Torrey. Day 5 is the last day and has no stay, so `search_near` has no point to search from. The Torrey researcher's brief covers "the stops near it on its days" (technical spec 6.1), and Day 5 isn't one of Torrey's days. The along-leg search runs Torrey to Salt Lake City, westward. Panorama Point is 10 miles east of Torrey. No worker fits the stop.
- **Moab Day 2, a day that stays put.** Before any stop is selected, the leg either doesn't exist or runs Moab hotel → Moab hotel, a route of zero length. A leg scout can't search along it. So every stop on a day that stays put has to go to the stay researcher. The docs don't say so, and technical spec 4.2 says "one leg scout per leg."

**Also: the choice of worker isn't stored.** The coordinator picks the worker when it lays out the day. Later, on "More options," or in a new session, it has to guess again. The choice also decides which candidate tool gets used, and so whether candidates have detour times.

**Docs.** Technical spec 4.2 (fill), 6, 6.1, 6.2. Tool design 2.3 (`search_near`, `search_along_leg`), 2.1 (the three candidate tools).

**Options.**
1. Each stop stores where it is filled from: "near stay X" or "along the leg." The coordinator sets it in `add_stop` and can change it with `update_stop`. `search_near` uses that stay. The brief goes to that stay's researcher. "More options" goes to the same worker.
2. Leave the model alone. Add an optional "near this stay" input to `search_near`, and tell the coordinator in its instructions to put morning stops on moving days with last night's researcher.
3. Code works it out: stops before the drive use last night's stay, and stops after it use tonight's. But a block doesn't say when the drive happens, so code can't tell which stops come before it.

**Recommendation.** Option 1. It fixes all three cases. It also gives Panorama Point a home: it is "near the Torrey stay," on Day 5. Add a line to 4.2: "a day that stays put has no leg scout; its stops go to the stay's researcher."

### F3. Seasonal closures can't reach the opening-hours check — **needs a decision**

**Settled 2026-10-11:** seasonal closures left to judgment in the MVP; code checks weekly hours only. Committed with F5, F7, F18.5, F18.7, F18.10.

**What happened.** Gifford Homestead is in the Moab example as the "closed for the whole block" case: closed for the season from October 1. As designed, the check can't produce that result.

- Google's hours are a normal week only, with no seasonal hours (Google design 2.2: Hearst Castle shows 8 AM to 6 PM every day). So Gifford's place record shows something like "8 AM–5 PM daily." On Wed Oct 13 in the afternoon, the check says "open long enough."
- A seasonal closure can only come from a web search for details. What that search finds goes into the candidate's notes as free text. Code can't read free text.
- Gifford sits on the Day 4 drive, so the leg scout finds it with `search_along_leg`. The leg scout can't run a details search, because the hook allows only Atlas Obscura searches. Its instructions (6.2) don't mention checking hours at all. The stay researcher's instructions (6.1) do.

So the only closures code can see are weekly ones such as "closed Mondays." Functional spec acceptance scenario S4, an attraction open only in summer, depends on the case that can't happen.

**One more problem in the same area.** The check decides "hours not known" for "any place found by web search." But places are shared across stops, and "how it was found" lives on the candidate, not on the place. If the same place were also found on Google for another stop, its place record would have Google's hours. So the check has to look at the *selected candidate's* source, not at the place. The docs don't say this.

**Assumption used.** To walk the example, I assumed Google's listing showed Gifford as closed every day.

**Docs.** Technical spec 6.1, 6.2, section 8 (opening hours). Tool design 4 (the hook). Web search design 4. Google design 2.2.

**Options.**
1. Add structured hours from search. A worker records, with a source link, a date range plus either weekly hours or "closed." The check uses these first. Next it uses Google's weekly hours, but only when the selected candidate came from Google. Otherwise the hours are "not known." Let the leg scout run a details search ("<place> <town> hours"), by widening the hook or adding a narrow pattern to it. Add "check hours against the dates" to 6.2.
2. Keep the code check to weekly hours. Seasonal closures are handled by judgment: the worker reports "closed on these dates" in its result, and the coordinator raises it. Then the "closed" result in the Moab example should become a worker-reported problem, not a code result.
3. Option 2, plus a stop property "closed on these dates (from a worker)" that the coordinator sets. The check reads it, but it isn't hours.

**Recommendation.** Option 1. It is the only option that lets S4 work the same way every time. It also fills web-search places' hours, which today are always "not known."

### F4. A stop's hours approval survives a change of date — **needs a decision**

**Settled 2026-10-11:** option 1, as the opening hours kind in the new list of approvals (see F6). Committed.

**What happened.** A stop's approval is yes or no. It is cleared only when the selected place or the time block changes (technical spec 3.5, section 8). It isn't cleared when the stop's *date* changes. A stop's date changes in three ways: the start date moves, an earlier stay gains or loses a night, or `update_stop` moves the stop to another day in the same block.

Concrete case. Suppose the user had kept Milt's in the afternoon with an approval ("we'll get there by noon"). Then change 4 moves the trip a day later, so Day 2 is a Tuesday. If Milt's were closed on Tuesdays, the check would now return "closed." The old approval would hide it. In the walk as scripted, no approval was still in place at the date shift: Milt's was moved, and Gifford was cleared. One different choice by the user and this would have happened.

**Docs.** Technical spec 3.5 (approval clearing, start date change), section 8 (stop approval).

**Options.**
1. Store the place, date, and block the approval was given for. It applies only while all three still match. No clearing logic is needed. This is the same pattern as the stay's weather text, which records the place and dates it was written for.
2. Store the result that was approved ("open but not long enough" or "closed"). Flag again only if the result gets worse. This is like the leg's approved drive hours. But a warning on a different weekday can be about different hours.
3. Add "the stop's date changes" to the clearing list in 3.5. This is simple, but code has to find every affected stop on each of three kinds of change.

**Recommendation.** Option 1.

### F5. Nothing compares the itinerary with fixed dates in the brief — **needs a decision**

**Settled 2026-10-11:** the start date lives only in the itinerary; the brief keeps a trip length, and a warning fires when the itinerary's days don't match. Committed.

**What happened.** The San Francisco brief says "exact: May 13–15, 2027, fixed." The user adds a night in Big Sur. `add_stay` adds a day, and the trip now ends on Sunday, May 16. The only date check in code is trip length of 14 days or less, so the write comes back clean. Only the coordinator's own care stops it from quietly breaking the user's fixed dates. The same gap applies to a window: nothing checks that the chosen dates still fall in "sometime in October."

**Docs.** Technical spec 3.1 (brief dates vs itinerary start date), section 8. Functional spec 6.1 (date windows).

**Options.**
1. Add a code check: the itinerary's dates fall within the brief's fixed dates or window. A warning, not a hard stop.
2. Leave it to the coordinator. Add a line to its instructions: "before a change that alters trip length, check the brief's dates."
3. Make `add_stay` and `update_stay` reject a change that breaks fixed dates. This is too strict, since the user may want to change the dates.

**Recommendation.** Option 1. The brief's dates are already structured, so the check is cheap. In the walk, the coordinator raised it before calling `add_stay`, but only because I played it carefully.

### F6. Route type is a label the check compares with itself — **needs a decision**

**Settled 2026-10-11:** replaced option 1's stored route type with a worked-out one. Legs and stops hold a list of approvals (kind, value, reason). Route-type check removed. Applied to technical spec 3.1–3.5, 5, and 8, and to `update_leg`, `update_stop`, and `compute_route`, then committed.

**What happened.**

- Code creates every leg, through `add_stay` or when a day that stays put gets its first stop. No doc says what route type a new leg starts with. If it starts empty, the route-type check flags every new leg. Moab Day 2 in the example has no route type.
- San Francisco Day 1 is labeled scenic and passes the check. But its selected stops (Moffett Field, San Jose, then CA-17) keep it inland on US-101 until Santa Cruz.
- San Francisco Day 3 stores "fastest" twice, once as route type and once as approved route type.

Route type changes nothing in the Google call. So the check only tests whether the coordinator's label matches the coordinator's approval. It can't catch a route that isn't really scenic.

**Docs.** Technical spec 3.1 (both examples), 3.3 (route type is a label), section 8 (route type check, exceptions).

**Options.**
1. Drop the stored route type. Keep only an optional approved route type with its reason. The leg's route type is worked out: the approved value if there is one, otherwise the trip default. Drop the route-type check, because a label that differs from the default can only exist with an approval.
2. Keep both. A new leg starts with route type empty, meaning "follows the trip default." The check flags only a route type that is set and differs from the default without an approval.
3. Code copies the trip default into each new leg. That is a stored copy, which goes stale when the brief changes, against the rule in 3.

**Recommendation.** Option 1. Whether a leg is really scenic stays the coordinator's job, through waypoints.

### F7. The hours check fails long visits and doesn't look at the clock — **needs a decision**

**Settled 2026-10-11:** option 1 with structured hours, plus a block-fit warning (one-hour setting). Committed.

**What happened.**

- **Visits longer than a block always fail.** "Long enough" means open within the block for the visit time. A block is 4 hours. A 5-hour hike at a place open 24 hours can never pass, so it gets "open, but not long enough." Delicate Arch (3 hours) passed only because it is shorter than a block.
- **Places open past midnight.** Google's hours for a bar open "Mon 5 PM – 2 AM" are filed under Monday. A 1 a.m. stop on Tuesday is in Tuesday's overnight block, so the check has to read Monday's hours. Google design 2.2 lists only `weekdayDescriptions`, which is display text such as "Monday: 11:00 AM – 9:00 PM." Code would be parsing text. (From my own knowledge, not the docs: Places also has a structured `regularOpeningHours.periods` field.)
- **Nothing checks that a block's stops fit in it.** San Francisco Day 1 morning holds Millbrae Pancake House (a meal counts as 1 hour), Hangar One (1.5 hours), Philz Coffee (1 hour), and about 1 hour of driving. That is 4.5 hours in a 4-hour block. No check notices.

**Docs.** Technical spec 3.1 (time blocks), section 8 (opening hours). Google design 2.2.

**Options.**
1. Change the test to: there is an open stretch of at least the visit time that *starts* within the block. A visit can run into the next block. Milt's in the afternoon still gets its warning (12:00–12:30 is 30 minutes). Milt's in the morning passes. A 5-hour hike starting at 8 a.m. passes. Use structured hours, and handle hours that run past midnight.
2. Cap the time needed at the block's length. This is simple, but a place that closes at 9 a.m. passes a 5-hour hike that starts at 8.
3. Let a stop span blocks, with a start block and an end block. That adds a property and makes ordering harder.

**Recommendation.** Option 1, with structured hours. Treat the block-fit check as a separate, later decision. A warning when visit times plus segment drive times go over the block by more than an hour would be cheap, since the drive times are already stored.

### F8. When the coordinator reruns the weather worker isn't defined — **needs a decision**

**Settled 2026-10-11:** option 1. Out-of-date weather is a note; rerun at the end of a turn. Committed with group 2.

**What happened.** Technical spec 3.5 says the coordinator "reruns the weather worker for those stays before calling the itinerary done." There is no "done": the functional spec has no trip-level states (open question 12.2). Two cases from the walk pull in different directions:

- **The Big Sur night.** Adding it moves San Luis Obispo's dates, so its weather is out of date. Removing it moves them back, so the text matches again and is current. Rerunning in between would have wasted a run and then made the text out of date the other way.
- **Moving the Moab trip a day later.** Every stay goes out of date at once, and the user is done changing things. The coordinator should rerun now.

Also, the coordinator learns that weather is out of date only from `read_itinerary`. Write replies return feasibility results, and out-of-date weather isn't one. And technical spec 1's table says the weather worker runs "once per trip," which contradicts reruns.

**Docs.** Technical spec 1 (table), 3.5, 6.3. Tool design `read_itinerary`, `set_stay_weather`.

**Options.**
1. Write replies include a note: "Weather out of date for: San Luis Obispo stay." The coordinator reruns at the end of a turn when no change is still being discussed with the user.
2. Rerun right after any change that marks text out of date. This is simple, but wastes runs during back-and-forth.
3. Rerun only when the user asks, or when the coordinator next summarizes the trip.

**Recommendation.** Option 1. Fix the table in technical spec 1 to say "after the fill, and again for stays whose text is out of date."

### F9. Removing a stay deletes stops that were moved onto its days — **wording fix**

**Settled 2026-10-11:** remove_stay and night removal refused while stops depend on them; error lists them. Stop order runs on any re-route. Committed with group 2.

**What happened.** The Big Sur night added a day pointing to Big Sur. The San Luis Obispo day kept First Awakenings (Monterey), Point Lobos, and Bixby Bridge, which now lay behind the party. The day's drive went from about 3 h 45 m to about 4 h 15 m. Nothing flagged the backtrack. The stop-order check didn't run, because it runs only when a selected stop changes. The coordinator moved the three stops onto the Big Sur day. Then the user removed Big Sur. `remove_stay` deletes the stay's days "and their stops." The three stops, with their selections and candidate history, would be gone. The coordinator had to move them back first, and no doc tells it to.

**Docs.** Technical spec 3.5 (a stay is removed), section 8 (stop order). Tool design `remove_stay`.

**Options.**
1. Add to the coordinator's instructions: before removing a stay or a night, move any stops worth keeping. `remove_stay`'s reply lists the selected stops it deleted, by name.
2. `remove_stay` rejects a stay whose days hold selected stops, unless the call says to delete them.
3. Run the stop-order check on any re-route, not only on selection changes, so a backtrack shows up.

**Recommendation.** Options 1 and 3. Option 3 also settles when the stop-order check runs (see F17).

### F10. Tiers go stale, and card tier buttons don't say what they change — **needs a decision**

**Settled 2026-10-11:** a nights change raises a note; the coordinator asks the user before new options; tier buttons update the stored tier. Committed 4f27071.

**What happened.**

- **Tiers depend on nights but are stored.** The Moab lodging is mid-range "from rule: stays of 2+ nights." If Moab dropped to one night, the stored tier would still say mid-range, and nothing in 3.5 resolves it again. Candidates never change, so the card would keep showing mid-range hotels.
- **"Higher tier" on the San Francisco hotel card.** The user clicks it on the San Luis Obispo lodging card. The docs say it sends one worker for that lodging (4.2). They don't say whether the stay's stored tier changes. If it doesn't, a later "More options" goes back to mid-range. In the walk, I had the coordinator call `update_stay` with tier posh and rule "user asked for a higher tier."
- **Rules for meals are vague.** "Mid-range for stays of 2+ nights" sounds like a lodging rule. The coordinator had to ask whether it covers meals in Moab. Even then, does a meal follow the day's stay or where the meal is? Moab Day 1's dinner is in Moab, on the day the party arrives.

**Docs.** Technical spec 3.1 (stay and stop tiers), 4.2 (refine), section 9. Functional spec 7.1.

**Options.**
1. A nights change returns a note: "Check the tier on stay X: its nights changed from 3 to 1." The coordinator resolves the tier again and sends "More options" at the new tier. Card tier buttons always update the stored tier, with the rule "user asked for a higher tier."
2. Code resolves simple rules itself (nights thresholds). This goes against the decision that the agent interprets natural-language rules.
3. Leave it all to the coordinator's judgment and say so in section 9.

**Recommendation.** Option 1. Add to section 9: the coordinator decides which day or place a meal rule applies to, and asks when the rule is unclear.

### F11. A new session can't fully answer "why that one?" or "what's left?" — **for the object model**

**Settled 2026-10-11:** reads return selected rationales; short line built by code; choice reasons to trip memory; clear_selection restarts a rejected selection. Committed.

**What happened.** In a new session, the user asks "why did we pick that Moab hotel?"

- The candidate's rationale is the answer. Technical spec 3.2 says the coordinator reads it. But `read_itinerary` returns each place's "name and short line," and `read_place` returns the place record. Neither one names the rationale, which lives on the candidate.
- The "short line" isn't defined anywhere: not what it holds, and not who writes it. The example in 7.2 ("walkable to the barbecue spots") mixes place facts with a reason for offering.
- The user's own reason for choosing from the three ("the one with the pool") isn't stored. `select_candidate` takes no reason. It survives only if the coordinator writes it to trip memory.

Then the user asks "what's left to decide?" The pie stop on Moab Day 4 shows up only because the coordinator cleared Gifford's selection when the user asked for a substitute. If it had just sent the worker for more options, the stop would still read "selected" (Gifford, approved), and the open decision would be invisible.

**Docs.** Technical spec 3.2, 7.2. Tool design `read_itinerary`, `select_candidate`. Functional spec 7.6, S7.

**Options.**
1. `read_itinerary` returns, for each candidate: name, short line, tier and rule, rationale, and set number. Define the short line as built by code from place facts only (type, rating, area). `select_candidate` takes an optional reason from the user.
2. Keep `read_itinerary` short, and add a tool that reads one stop's or stay's candidates in full. This also helps tool design open question 2.
3. Option 1, plus a coordinator instruction: when the user rejects a selected place, clear the selection first, then send for more options.

**Recommendation.** Option 3. Option 2 is a fallback if reads get too big.

### F12. There is no way to name a place that isn't a candidate — **needs a decision**

**Settled 2026-10-11:** Google's name wins; update_itinerary requires a name with start and end; trip name worked out. Committed.

**What happened.** The user gives Mike's address in Silver Lake. `find_place` returns an address with no name or type (tool design 2.1). `update_itinerary` sets it as the end place. A place's name comes from "the first candidate that offers it," but the end place is never a candidate. `select_user_place` needs a stop or stay. So the itinerary and the last leg show "3412 Example Ave, Los Angeles," never "Mike's house." The same goes for a waypoint and for a start place given by address.

The trip has the same problem. Functional spec 10.1 says the agent names the trip, and the home screen shows its name and region. No tool sets either one.

**Docs.** Technical spec 3.1 (Place, Itinerary), 3.2. Tool design `update_itinerary`, `select_user_place`. Functional spec 3, 10.1.

**Options.**
1. `update_itinerary` takes an optional name and type alongside the start or end place ID. Add the trip name and region to `update_itinerary` or to the brief.
2. Add a general `name_place` tool for the coordinator. It sets the name only if the place has none.
3. `find_place` takes an optional display name.

**Recommendation.** Option 1. It keeps naming tied to the moment the place is chosen.

### F13. A stop has nowhere to say what it's for — **for the object model**

**Settled 2026-10-11:** option 1. A stop's purpose is fixed, like its kind and search area. Committed with F2 and F18.8.

**What happened.** The examples' comments carry information the model has no place for: "late breakfast, back in town," "sunrise hike," "for its pink champagne cake," "stargazing, about 1 a.m.," "pie." Meals have no type, so the worker filling the Madonna Inn night stop can't tell it should look for dessert unless the brief says so. Worker brief contents (5.3) don't list a note for each stop. On "More options," or in a new session, the coordinator has to rebuild that intent from memory, or guess.

**Docs.** Technical spec 3.1 (stops, meals have no type), 5.3.

**Options.**
1. Add a short free-text purpose on the stop, set by the coordinator. It goes into the worker brief and shows on the itinerary.
2. Put the purpose in the worker brief only, not stored.
3. Keep it in trip memory.

**Recommendation.** Option 1. It doesn't bring back meal types, because it is a note, not a value code checks.

### F14. A stop after midnight is routed onward, and last-day stops get no weather — **needs a decision**

**Settled 2026-10-11:** option 2; weather briefs gather stops by search area. Committed.

**What happened.** Panorama Point at 1 a.m. sits in Day 5's overnight block. Day 5's leg is Torrey hotel → Panorama Point → Salt Lake City. The party really drives back to the hotel and sleeps, then leaves in the morning. Here the times hardly differ, because the road to Salt Lake City runs back through Torrey. A stargazing spot in another direction would get the wrong drive time and the wrong line on the map.

Day 5 also has no stay, so no stay's weather and clothing text covers it. The 1 a.m. stargazing, in high desert in October with lows near freezing, is the stop that most needs clothing advice. The weather worker's brief goes by stay, so it never sees that stop.

**Docs.** Technical spec 3.1 (stop after midnight, last day), 3.3, 6.3.

**Options.**
1. Code routes overnight-block stops as a round trip from last night's stay, separately from the day's leg. Their activities go into last night's stay's weather brief.
2. Accept it for the MVP. Say so in 3.1, and have the coordinator list last-day stops in the weather brief of the last stay.
3. Let an overnight stop belong to the previous day. This reverses a rule you already settled.

**Recommendation.** Option 2 for the MVP. If F2 option 1 is taken, "near the Torrey stay" also gives the weather brief its link.

### F15. The leg scout's web finds have no detour time — **needs a decision**

**Settled 2026-10-11:** the candidate tool computes detour times; the two stop candidate tools merged into add_stop_candidates. Committed 4f27071.

**What happened.** The leg scout may search Atlas Obscura for towns the leg passes through. On Moab Day 4, it could find something in Hanksville that way, then look it up with `find_place`. `add_route_stop_candidates` requires a detour time "from `search_along_leg`." `find_place` gives none, so the call is rejected.

**Docs.** Technical spec 6.2. Tool design 2.1 (`add_route_stop_candidates`), 2.3 (`find_place`).

**Options.**
1. `find_place` takes an optional day ID. With one, it also returns the detour time off that day's route.
2. Detour time can be "unknown" for places not found by the along-leg search.
3. The leg scout estimates it, labeled as an estimate.

**Recommendation.** Option 1.

### F16. `compute_route` can't say which stretch a waypoint belongs to — **wording fix**

**Settled 2026-10-11:** option 1. Applied to tool design 2.4 (`compute_route`), then committed. The title should say "segment," not "stretch."

**What happened.** In the Moab shape round, the coordinator sketched Grand Junction → Moab → Torrey → Salt Lake City with a waypoint at Dewey Bridge. The tool takes points and waypoints as two separate lists. Google needs one ordered list, with pass-through points marked. Code can't know that Dewey Bridge goes between Grand Junction and Moab rather than between Torrey and Salt Lake City. (The plain name "Dewey Bridge, UT" also came back resolved to Salt Lake City, just as in testing. The reply showed it and the coordinator caught it. That part worked.)

**Docs.** Tool design 2.4.

**Options.**
1. One ordered list. Each entry is a place ID or a name, marked as a stop or as pass-through.
2. Each waypoint names the point it comes after.

**Recommendation.** Option 1.

### F17. Feasibility results need levels, scope, and a way to set one aside — **wording fix**

**Settled 2026-10-11:** warning or note, plus refused for >14 days; results marked new or already known; approvals moved to the day with a block fit kind. Committed with group 2.

**What happened.**

- Section 8 uses "flag," "warning," and "note," but never says which level each check gives. Daily driving and route type aren't given a level. Trip length is "a hard limit," but it doesn't say whether the write is refused or accepted and flagged.
- "Every write returns the feasibility results." Does it return all of them, or only the ones the change touched? On Moab Day 2, the stop-order note ("Corona Arch to the morning saves 18 minutes") came back. The coordinator decided not to raise it, and the user agreed to keep the order. When Milt's was moved, the same note came back again. Nothing records that it was set aside.
- The stop-order check runs "when a selected stop on the day changes." Moving Milt's to the morning changes the day's order but not a selection. It isn't clear whether the check runs.

**Docs.** Technical spec section 8. Tool design 2.1 (writing).

**Options.**
1. Give each check a stated level. A write returns results for the days it touched, marked new or already known. `read_itinerary` returns them all. Run the stop-order check whenever the leg is re-routed and has at least two selected stops. Notes can't be approved and don't need to be. The coordinator sees "already known" and stays quiet.
2. Return everything on every write. This is simple, but noisy.

**Recommendation.** Option 1. Say that a trip-length write over 14 days is refused.

### F18. Smaller items

Each is one change. Tag in brackets.

1. **[Settled 2026-10-11 with group 2.]** **Lodging re-routes more than "the legs on either side."** Selecting the Moab hotel re-routes Day 1 (into Moab), Day 2 (the day that stays put), and Day 4 (out of Moab). Say "every leg that starts or ends at the stay." [wording fix] Technical spec 3.5.
2. **[Settled 2026-10-11 with group 2.]** **When a day has a leg.** The rule in 3.3 covers moving to a new stay and stops to drive to. The last day moves to the *end place*, which neither case covers. "A stop to drive to" should say *selected* stop. A leg whose start or end place is still empty can't be routed. Say what code does then: no leg, or a leg with no drive time. [wording fix] Technical spec 3.3.
3. **[Settled 2026-10-11 with group 2.]** **Rest day rules.** A moving day or the last day can't be a rest day. Say that `set_rest_day` rejects them. 3.5 doesn't say what marking a day as a rest day does to an existing leg (it removes it). [wording fix] Technical spec 3.1, 3.5.
4. **[Settled 2026-10-11 with group 2.]** **Warnings for rest-day stops** can't give "the drive time from the previous stop." Rest-day stops aren't routed. [wording fix] Technical spec section 8.
5. **[Settled 2026-10-11: venue's own listing.]** **A hotel used as a stop gets the hotel's hours.** Madonna Inn is listed as "open 24 hours," but the cake comes from its café, which closes around 9 or 10 p.m. The night stop passes. Workers should use the café's own listing if there is one, or record the café's hours by the F3 route. [wording fix] Technical spec 3.2, web search design 4.
6. **[Settled 2026-10-11: count back from today.]** **Open-Meteo years.** "The last 10 complete years. For a trip in 2026, that is 2016 to 2025." For the October 2027 trip planned today (October 11, 2026), counting back from the trip's year gives 2017–2026. October 2026 isn't complete yet. Count back from today instead. [wording fix] Open-Meteo design 2.2.
7. **[Settled 2026-10-11: a start date is now required before the skeleton.]** **The hours check with no start date.** It can't know weekdays. Say that it skips, or that it checks every day of the week. [wording fix] Technical spec section 8.
8. **[Settled 2026-10-11 with F2: `add_stops` takes an ordered list for one time block.]** **Laying out a day takes one call per stop.** Each `add_stop` needs the ID of the stop before it, so the calls run one after another. That was 12 calls for San Francisco and 13 for Moab, each returning feasibility results. Let `add_stop` take an ordered list for one day. [needs a decision] Tool design 2.1, open question 1.
9. **[Settled 2026-10-11: must-sees selected in the skeleton round.]** **Select must-sees before the fill.** The Santa Cruz Boardwalk had to be selected before the Day 1 leg scout ran. Otherwise the route stayed on US-101 and the scout never searched the coast. Say this in 4.2. [wording fix]
10. **[Settled 2026-10-11: start and end live only in the itinerary.]** **Brief start and end vs itinerary start and end.** 3.1 explains why dates live in both the brief and the itinerary. It doesn't explain the same for start and end points. [for the object model]
11. **[Settled 2026-10-11 with F6: each approval has its own reason.]** **One reason for two approvals.** A leg has approved drive hours and approved route type, but a single reason. If both are set, one reason overwrites the other. [for the object model] Technical spec section 8.
12. **[Settled 2026-10-11: 10% of road time, as a setting.]** **The buffer has no form.** It could be minutes per day, a percentage, or minutes per stop. [for the object model]
13. **[Settled 2026-10-11 with F6: removing an approval needs no reason.]** **Undoing an approval.** `update_stop` rejects an approval without a reason. Say whether setting "not approved" needs one. [wording fix]

---

## 2. Properties and rules touched

**(not in docs)** marks what the walk needed but the docs don't mention. **(unclear)** marks what the docs mention without settling.

### Trip
- Owner (user). Created when a new conversation starts.
- Name **(not in docs: no tool sets it; F12)**.
- Region for the home screen **(not in docs)**.
- Holds one brief, one itinerary, places, and trip memory items.

### Trip brief
- Region, route, or theme.
- Start and end points, one-way or loop **(unclear: text, or linked to the itinerary's places? F18.10)**.
- Dates: exact, window, or length, plus a "fixed" flag.
- Party: count and who.
- Interests and must-sees, with why they matter.
- Max driving hours per day (the trip default).
- Route preference, scenic or fastest (the trip default).
- Rest days (what the user asked for).
- Budget: default tier plus rules in natural language.
- Meal preferences.
- Rules: an update changes only the items given, and list items are replaced whole. Every update returns feasibility results. **(not in docs) The itinerary's dates must fit the brief's fixed dates or window (F5).**

### Itinerary
- Start place, end place, start date (empty until decided).
- Stays in order. Days in order. Created holding only the last day.
- Worked out: end date, trip length, total driving time (functional spec 9.1).
- Display name and type for the start and end place **(not in docs; F12)**.
- Rules: trip length is 14 days or fewer. A start date change moves every date, reruns the hours check, and marks weather out of date. Nothing is re-routed.

### Stay
- Place (usually a town), order.
- Nights (worked out from the days pointing to it).
- Lodging place (empty until selected). Lodging candidates.
- Tier and the rule that produced it **(not in docs: re-resolved when nights change; F10)**.
- Weather and clothing text, labeled forecast or seasonal averages, with the place and dates it was written for. Out of date is worked out by comparing them.
- Dates (worked out).
- Rules: changing nights adds or removes days at the end of the stay's days. Selecting or clearing lodging re-routes **every leg that starts or ends at the stay (F18.1)**. Removing a stay removes its days and their stops. Moving a stay to another town re-routes the legs around it and leaves lodging and stops for the coordinator to judge.

### Day
- Order. Date (worked out). Rest day flag. Stops in order. Leg (zero or one). Night-at stay (none on the last day).
- Rules: the last day is created with the itinerary and never removed. A rest day has no leg. **(not in docs) A moving day or the last day can't be a rest day (F18.3).** The day's full order is worked out: the blocks in clock order, then the stops in each block.

### Leg (value object on the day)
- From and to (worked out). The to is tonight's lodging, or tonight's town, or the end place.
- Drive time, distance, route line (stored; one paid call).
- Route type **(unclear: default for a new leg; F6)**.
- Waypoints as place IDs **(not in docs: where they go among the stops; F1)**.
- Approved drive hours, approved route type, reason **(unclear: one reason for both; F18.11)**.
- Rules: when a day has a leg **(unclear for the last day and for empty stops; F18.2)**. Re-routed when the stays, a stay's lodging, the day's selected stops, the stops' order, the route type, or the waypoints change.

### Stop
- Kind (meal or attraction). Time block (one of six). Order in the block.
- Selected place. Candidates.
- Tier and rule (meals only).
- Drive time from the previous stop (stored with the leg) **(unclear: what it is for the first stop, and for rest-day stops)**.
- Hours approval and reason **(not in docs: the place, date, and block it was given for; F4)**.
- Where it is filled from: near stay X, or along the leg **(not in docs; F2)**.
- Purpose note **(not in docs; F13)**.
- Rules: a stop after midnight belongs to the calendar day. A moved stop keeps its candidates and selection. Changing the selected place or the block clears the approval. Code never reorders stops.

### Candidate (value object on a stop or stay)
- Place. Rationale. Tier and rule (lodging and meals). How it was found, with source link. Notes. Visit time (attractions; an estimate). Detour time (along-leg stops) **(not in docs: can it be unknown; F15)**. Set number. Marker for "specified by the user".
- Hours found by search, with a date range and source **(not in docs; F3)**.
- Rules: candidates never change after they're written. A set holds one to three, all added in one call. A repeat for the same stop or stay rejects the whole call. Adding a set keeps the selection. The card shows the newest set. The selected place must be one of the candidates.

### Place
- Our ID. Google place ID (can be empty). Coordinates. Google name. Rating. Review count. Price level. Weekly hours **(unclear: text or structured; F7)**. Summary. Links.
- Display name and type (set by the first candidate that offers it).
- Short line **(not in docs: what it holds and who writes it; F11)**.
- Rules: stored once per trip, matched by Google place ID only. The kind of place doesn't limit its use.

### Feasibility result
- Check, the item it's about, level (flag, warning, note), message.
- **(not in docs) A level for each check; new or already known; whether a note can be set aside (F17).**
- Checks used in the walk: daily driving, opening hours (all four results), route type, stop order. Trip length came up only as a limit. Must-sees vs days and seasonal risks stayed with the coordinator.

### Worker brief
- IDs to fill, with day, dates, and nights. Tier and rule. Interests, must-sees, and meal preferences. Places to leave out, with reasons.
- **(not in docs) The purpose for each stop; which stay a stop is near (F2, F13); planned activities for each stay, for the weather worker.**

### Memory item
- ID, user or trip, text. Reads and writes are noted in the step log as **[memory]**. I didn't design them.

### Settings
- Drive buffer **(form not in docs; F18.12)**. Stop-order minimum saving (15 minutes). How far counts as near. The few miles dropped at each end of an along-leg search. A meal counts as 1 hour.

---

## 3. Step log

Notation: **C** = coordinator, **SR** = stay researcher, **LS** = leg scout, **WW** = weather and clothing worker, **Code** = code inside a tool, **UI** = the interface. Each step gives who acts, the call, what changes in storage, the reply, and what the user sees. When a reply comes back with nothing to report, I write "feasibility: none."

### 3.1 San Francisco to Mike's house

**Start**

1. **UI.** The user starts a new conversation. The app creates the trip, an empty brief, and an itinerary holding only the last day `day_x8kq2vme`. No start or end place, so no leg yet (F18.2).

**Discovery**

2. **User:** "Pacific Coast Highway from San Francisco to LA, May 13 to 15 next year."
3. **C** reads memory **[memory: read user and trip; both empty]**, then calls `read_trip_brief` (empty). It asks about party, interests and must-sees, driving hours, budget, and meals. **User sees:** three questions.
4. **User:** "Two of us. Aviation history, coffee, old diners, dessert. The Santa Cruz Boardwalk is a must. Five hours of driving a day max. Mid-range. Local food, not hotel breakfast."
5. **C** → `update_trip_brief(region "Pacific Coast Highway", dates exact May 13–15 2027 fixed, party 2 adults, interests […], must-sees ["Santa Cruz Beach Boardwalk"], max driving 5, route scenic, budget "mid-range by default", meals "local spots, no hotel breakfast")`. **Storage:** brief items set. **Reply:** feasibility: none. **[memory: write user memory "usually two adults", "prefers scenic routes", after confirming they are standing preferences]**.
6. **Change 1. User:** "We're ending at my friend Mike's place, 3412 Example Ave, Silver Lake."
7. **C** → `find_place("3412 Example Ave", "Los Angeles, CA")`. **Code:** stores the place. **Reply:** `place_mk8h3vtr`, address, type "street address," no name.
8. **C** → `find_place("San Francisco", "CA")` → `place_s7fz2qkn`. Then `update_itinerary(start place_s7fz2qkn, end place_mk8h3vtr, start date 2027-05-13)`. **Code:** routes the last day's leg, San Francisco → the address, 6 h 10 m. **Reply:** feasibility: Day 1 driving 6 h 47 m against 5 h, **flag**. Trip length 1 day. The coordinator ignores the flag, since stays come next. **User sees:** "Got it: ending at Mike's in Silver Lake." **Finding F12:** the end place can't be named "Mike's house." The itinerary shows the street address. **[memory: write trip memory "road is fixed: Highway 1 coast; Mike is a friend in Silver Lake"]**.

**Shape:** skipped. The route is fixed.

**Skeleton**

9. **C** → `find_place` for Monterey (`place_mt4yrx9e`), San Luis Obispo (`place_s9bq6wex`), and Big Sur village (`place_bg5vr2wa`). Then `compute_route([San Francisco, Monterey, San Luis Obispo, place_mk8h3vtr], scenic, waypoints [place_bg5vr2wa], keep)`. **Reply:** 2 h 05 m, 2 h 50 m, 3 h 40 m. **Finding F16:** the tool can't say the waypoint belongs between Monterey and San Luis Obispo. I assumed code inserts it where it fits.
10. **C** → `add_stay(place_mt4yrx9e, "first", nights 1, tier mid-range, rule "trip default")` → `stay_m7tr3yq2`. **Code:** adds `day_m3pw7trc` (order 0). The last day moves to order 1. Routes Day 1 (San Francisco → Monterey, 2 h 05 m) and re-routes the last day (Monterey → the address). **Reply:** feasibility: route type empty on the new leg, **flag**? (**F6:** default unknown. I assumed new legs start empty and are flagged.)
11. **C** → `add_stay(place_s9bq6wex, after stay_m7tr3yq2, nights 1, mid-range, "trip default")` → `stay_s4bk8hwz`, day `day_s6vn4bqe`. **Code:** routes Day 2 Monterey → San Luis Obispo on US-101, 2 h 25 m. Re-routes the last day, San Luis Obispo → the address, 3 h 40 m.
12. **C** → `update_leg(day_s6vn4bqe, route scenic, waypoints [place_bg5vr2wa])`. **Code:** re-routes through Big Sur, 2 h 50 m. Then `update_leg(day_m3pw7trc, route scenic)`, with no waypoint (as in the example).
13. **User** (asked about the last day): "Last day, just get us to Mike's fast."
14. **C** → `update_leg(day_x8kq2vme, route fastest, approved route type fastest, reason "wants to get to LA quickly")`. **Reply:** feasibility: none. **User sees** the skeleton in chat and the itinerary: 3 days, 2 stays, legs of 2 h 05 m, 2 h 50 m, and 3 h 40 m.

**Fill**

15. **C** → `add_stop(day_m3pw7trc, afternoon, "first", attraction)` → `stop_c9p4vx3m`. Then **C** asks: "People usually spend two to three hours at the Boardwalk. Does 2.5 sound right?" **User:** yes. → `find_place("Santa Cruz Beach Boardwalk", "Santa Cruz, CA")` → `place_bw3k8czt`. → `select_user_place(stop_c9p4vx3m, place_bw3k8czt, name "Santa Cruz Beach Boardwalk", type "amusement park", reason "must-see", visit 2.5 h)`. **Code:** adds set 0 with one candidate, selects it, and re-routes Day 1 through Santa Cruz (2 h 30 m). The stop-order check has only one stop, so it does nothing. Hours check: Thursday, open 11 a.m.–6 p.m., afternoon block: open long enough, so nothing said. **Finding F18.9:** this has to happen before the leg scout runs.
16. **C** lays out the rest of the stops. Each `add_stop` needs the ID from the one before it (**F18.8**). Day 1: morning meal `stop_k7m2x9qa`, attraction `stop_a3w8nc5r`, meal `stop_b6t2kq9y`; evening meal `stop_d2h7rw6k`. Day 2: morning meal `stop_e5n3qz8t`, attractions `stop_f8c6wy2p` and `stop_g4x9ma7h`; afternoon meal `stop_h7r2tk5v`, attraction `stop_j3y8cw4n`; evening meal `stop_k9e5px2d`; night meal `stop_m2v7hb6q`. All meals are mid-range, "trip default." 11 calls. Each reply: feasibility: none new. **Storage:** 11 empty stops.
17. **C** decides the workers. Day 1 morning → LS for Day 1. Day 1 evening → SR Monterey. Day 2 `stop_e5n3qz8t` (breakfast in Monterey) → SR **Monterey**, with a note to search in Monterey (**F2**). Day 2 Highway 1 stops → LS for Day 2. Day 2 evening and night → SR San Luis Obispo. The night stop is "dessert, Madonna Inn's cake if it fits." The purpose is only in the brief (**F13**). The last day has no stops, so no LS.
18. **C** → `Agent` ×4, in parallel. The briefs carry IDs, dates, tiers, interests, and leave-outs (none yet).
19. **SR Monterey** → `search_near(stay_m7tr3yq2, "mid-range hotels")`, `search_near(stop_d2h7rw6k, "seafood dinner")`, and `search_near(stop_e5n3qz8t, "breakfast diner in Monterey, CA")`. Because of the stop's day, the point is San Luis Obispo, so the query names Monterey (**F2**). → `add_stay_candidates(stay_m7tr3yq2, [Hotel Pacific, Casa Munras, Jabberwock Inn])`. **Reply:** "Set 0 for stay_m7tr3yq2: 3 candidates." The same for the two stops. Whaling Station is in set 0 for `stop_d2h7rw6k`, and First Awakenings in set 0 for `stop_e5n3qz8t`. **Returns:** one line per candidate.
20. **LS Day 1** → `search_along_leg(day_m3pw7trc, "breakfast diner")`, then "aviation museum," then "coffee." The route runs through the selected Boardwalk, so it covers US-101 and CA-17. → `add_route_stop_candidates` ×3. Millbrae Pancake House has a 6-minute detour, Hangar One at Moffett Field 9 minutes, Philz Coffee San Jose 4 minutes.
21. **LS Day 2** → `search_along_leg(day_s6vn4bqe, "scenic viewpoint")` and `("tourist attraction")`. No stops are selected, so the route is Monterey → Big Sur village → San Luis Obispo, and the waypoint keeps it on the coast. Point Lobos has a 5-minute detour, Bixby Bridge viewpoint 2, Piedras Blancas rookery 3. A Monterey breakfast place would have been dropped as within 5 miles of the start. Then "lunch with a view": Nepenthe.
22. **SR San Luis Obispo:** lodging set 0 (Garden Street Inn, Lamplighter Inn, SpringHill Suites, all mid-range, "trip default"). Firestone Grill. Madonna Inn for the night stop, with the note "famous pink champagne cake."
23. **C** gets four results. **User sees:** option cards on every stop and both lodgings, and chat says "Here are options for each stop."

**Selections (refine)**

24. **User** clicks Select on the cards one by one. Each click is a message such as "User selected Millbrae Pancake House for Day 1 breakfast." Each time, **C** → `select_candidate(stop, place)`. **Code:** re-routes the day and runs the hours check on that stop. On Day 1 and Day 2, it also runs the stop-order check. **Replies:** none for most. Bixby: "Hours not known," a **note** ("Hours not confirmed. Check before you go."). Madonna Inn: open 24 hours (the hotel listing), so open long enough (**F18.5**). Stop order: never a saving of 15 minutes or more. **User sees:** "Done: Bixby is in. Its hours aren't listed, but it's a roadside viewpoint." Day 2 drive with stops: 3 h 45 m road, 4 h 08 m with buffer, under 5 h. **Waypoint check:** `place_bg5vr2wa` is still on Day 2. Where code puts it among seven stops is undefined (**F1**). I assumed it fit between Bixby and Nepenthe.
25. **User** selects Casa Munras for Monterey → `select_candidate(stay_m7tr3yq2, place_hc4t9mxe)`. **Code:** re-routes Day 1 (into the hotel) and Day 2 (out of it).

**Change 2: Higher tier on the San Luis Obispo hotel**

26. **UI:** the user clicks "Higher tier" on the San Luis Obispo lodging card. The message: "User asked for a higher tier on the San Luis Obispo hotel card (now mid-range)."
27. **C** → `update_stay(stay_s4bk8hwz, tier posh, rule "user asked for a higher tier")`. **Assumption:** the stored tier changes (**F10**). **Reply:** feasibility: none. → `Agent(SR San Luis Obispo, brief: stay_s4bk8hwz only, posh, leave out the three set 0 hotels)`.
28. **SR** → `search_near(stay_s4bk8hwz, "luxury boutique hotel")` → `add_stay_candidates(stay_s4bk8hwz, [Hotel San Luis Obispo, Granada Hotel & Bistro, Hotel Cerro])`. **Reply:** "Set 1 for stay_s4bk8hwz: 3 candidates." **User sees:** the card now shows set 1 (posh).
29. **User** selects Granada → **C** → `select_candidate(stay_s4bk8hwz, place_hd9c2tvx)`. **Code:** re-routes Day 2 (into the hotel) and the last day (out of it). **User sees:** "Granada Hotel & Bistro is your San Luis Obispo pick. It's in the posh tier you asked for." **[memory: maybe write trip memory "user went posh for San Luis Obispo"]**.

**Weather and clothing**

30. **C** → `Agent(WW, brief: both stays with dates and planned activities)`. **WW** → `stay_weather(stay_m7tr3yq2, place_mt4yrx9e)`. May 2027 is beyond 7 days, so **Code** returns Open-Meteo averages: "Typical for May 13, based on 2017–2026." → `set_stay_weather(stay_m7tr3yq2, text, seasonal averages)`. **Code** records the stay's place and dates with the text. The same for San Luis Obispo. **Returns:** two lines. The last day gets no weather (**F14**). **User sees:** weather on each stay: "Highs in the 60s, cool fog in the morning. Bring a light jacket for Bixby and Point Lobos."

**Change 3: add Big Sur, then remove it**

31. **User:** "Can we add a night in Big Sur between Monterey and San Luis Obispo?"
32. **C** notices the brief's fixed dates. No check would have told it (**F5**). **User sees:** "That adds a day, so you'd reach Mike's on Sunday the 16th instead of Saturday. OK?" **User:** "Yes, I'll tell Mike."
33. **C** → `update_trip_brief(dates exact May 13–16 2027 fixed)`. → `find_place("Big Sur", "CA")` returns `place_bg5vr2wa`, the same place as the Day 2 waypoint. → `add_stay(place_bg5vr2wa, after stay_m7tr3yq2, nights 1, mid-range, "trip default")` → `stay_b2gs6trx`, day `day_b9tz3hwa`. **Code:** the new day is order 1. The San Luis Obispo day moves to order 2 (May 15), and the last day to order 3 (May 16). Routes the new day: Casa Munras → Big Sur, 50 m. Re-routes the San Luis Obispo day: it now starts in Big Sur, still has breakfast in Monterey, and backtracks. 4 h 15 m road, 4 h 40 m with buffer, still under 5 h. **Storage:** San Luis Obispo weather is now out of date (dates changed). **Reply:** feasibility: none. The stop-order check doesn't run, since no selected stop changed (**F9**). Weather staleness isn't in the reply (**F8**).
34. **C** → `read_itinerary` to see the new layout. It spots the backtrack. **User sees:** "Your San Luis Obispo day now starts in Big Sur but still has breakfast in Monterey, and Point Lobos and Bixby behind you. Move those three to the Big Sur day?" **User:** "Yes."
35. **C** → `update_stop(stop_e5n3qz8t, move day_b9tz3hwa morning "first")`, then Point Lobos after it, then Bixby after that. **Code:** each move re-routes both days. The blocks are the same, so no approvals are cleared (none were set; see **F4** for the date change). → `Agent(SR Big Sur, lodging only)` → set 0 with Big Sur River Inn, Glen Oaks, Ripplewood. **C** doesn't rerun weather yet, since the user is still deciding (**F8**).
36. **User:** "Actually, forget Big Sur. Keep the original plan."
37. **C** moves the three stops back to `day_s6vn4bqe` (3 calls) **before** removing, so they aren't deleted (**F9**). → `remove_stay(stay_b2gs6trx)`. **Code:** deletes the stay, its day, and its lodging candidates. The places stay. The San Luis Obispo day goes back to order 1 (May 14), and its leg starts at Casa Munras again. Re-routed: 3 h 45 m. **Storage:** San Luis Obispo weather matches its dates again, so it is current again. → `update_trip_brief(dates May 13–15 2027 fixed)`. **User sees:** "Back to the three-day plan. Nothing else changed." **[memory: write trip memory "considered a Big Sur night, decided against: Mike expects us Saturday"]**.

**End state** matches technical spec 3.1, except that the San Luis Obispo lodging is posh (change 2), and the end place shows the street address, not "Mike's house" (F12).

### 3.2 Grand Junction to Salt Lake City through Moab

**Start and discovery**

1. **UI:** new conversation → new trip, empty brief, last day `day_e5h9nwq2`.
2. **User:** "Grand Junction to Salt Lake City through Moab, sometime in October next year, about five days."
3. **C:** **[memory: read; user memory has "usually two adults", "prefers scenic routes"]**. **User sees:** "Same as last time: two of you, and scenic roads?" (S9). Then it asks about driving hours, budget, interests, and meals.
4. **User:** "Yes. Four hours of driving a day max. Value by default, mid-range where we stay two or more nights. Arches, a sunrise hike at Delicate Arch, stargazing, and I've heard about pie in Capitol Reef. One lazy day in Moab."
5. **C** asks whether "mid-range for 2+ nights" covers meals. **User:** "Yes, everything in Moab." (**F10**) → `update_trip_brief(dates window "October 2027, about 5 days", max driving 4, route scenic, budget "value by default, mid-range for stays of 2+ nights, meals included", interests […], must-sees ["Delicate Arch at sunrise"], rest days "one in Moab", …)`. **Reply:** feasibility: none.
6. **C** → `find_place` for Grand Junction (`place_gj4t8vxc`) and Salt Lake City (`place_sc7k2rwm`) → `update_itinerary(start, end)`. No start date yet. **Code:** routes the last day, Grand Junction → Salt Lake City, 4 h 05 m. **Reply:** Day 1 driving 4 h 30 m with buffer against 4 h, **flag**. Ignored for now.

**Shape** (the route past Moab is open)

7. **C** → `compute_route(["Grand Junction, CO", "Moab, UT", "Torrey, UT", "Salt Lake City, UT"], scenic, waypoints ["Dewey Bridge, UT"], keep)`. **Reply:** the times, plus "Dewey Bridge, UT → resolved to Salt Lake City, UT," with a Day 1 time of 8 h. **C** spots the bad match → `find_place("Dewey Bridge", "Utah")` → `place_dw5c9ypa`. Calls `compute_route` again with the ID. The result: 2 h 00 m, 2 h 30 m, 3 h 20 m. (**F16:** which stretch the waypoint is on is still undefined.) → `compute_route([Grand Junction, Moab, Salt Lake City], scenic, [place_dw5c9ypa], keep)`: 2 h 00 m, 3 h 45 m.
8. **User sees:** two sketches. "Moab and Capitol Reef, 5 days": Grand Junction → Moab for 3 nights → Torrey → Salt Lake City, through Goblin Valley and Capitol Reef, for pie and dark skies. Or "Moab only, 5 days": 4 nights in Moab, then straight up US-6. **User:** "The first one." **[memory: write trip memory "stretches: Highway 128 into Moab is a fixed road; Moab to Torrey, places fixed (Goblin Valley, Capitol Reef)"]**.

**Skeleton** (change 1: the coordinator picks the dates)

9. **C** → `find_place` for Moab (`place_mb3x6tqe`) and Torrey (`place_tr8z4hbk`). → `add_stay(place_mb3x6tqe, "first", nights 3, tier mid-range, rule "stays of 2+ nights")` → `stay_mq4p8xra`, days `day_a2r7ksvt`, `day_b8m3cxpe`, `day_c4w6tzhq`. → `add_stay(place_tr8z4hbk, after stay_mq4p8xra, nights 1, value, "trip default")` → `stay_tz6w3kdn`, day `day_d7p2fynk`. **Code:** routes Day 1 (Grand Junction → Moab, I-70, 1 h 45 m) and Day 4 (Moab → Torrey, 2 h 30 m). Re-routes Day 5 (Torrey → Salt Lake City, 3 h 20 m). Days 2 and 3 have no stops, so no leg. **Reply:** route type empty on the new legs, **flag** (**F6**).
10. **C** → `update_leg(day_a2r7ksvt, scenic, waypoints [place_dw5c9ypa])` → re-routed on Highway 128, 2 h 00 m. → `update_leg` sets scenic on Day 4 and Day 5. → `set_rest_day(day_c4w6tzhq, true)`.
11. **C** chooses dates by judgment: Sun–Thu, so Arches is quieter on weekdays, and before the cold of late October. → `update_itinerary(start date 2027-10-10)`. **Code:** the days become Oct 10–14. The hours check runs, but there are no stops yet. **User sees:** "I'd go Sunday Oct 10 to Thursday Oct 14: weekdays in Arches, and nights not too cold yet." **[memory: write trip memory "picked Oct 10–14: weekdays in Arches, before late-October cold"]**. The brief keeps the window, not marked fixed.

**Fill**

12. **C** → `add_stop(day_b8m3cxpe, early morning, "first", attraction)` → `stop_h2q6tw8r`. Asks: "Most people take about three hours for Delicate Arch, with time at the top. OK?" **User:** yes. → `find_place("Delicate Arch trail", "Arches National Park, UT")` → `place_da9t2kvc` → `select_user_place(stop_h2q6tw8r, place_da9t2kvc, "Delicate Arch trail", "hiking area", reason "sunrise hike, must-see", visit 3 h)`. **Code:** Day 2 gains a leg: Moab (town) → Delicate Arch → Moab. Hours check: Google says open 24 hours; early morning block (4–8 a.m.), Monday: 4 h is at least 3 h, so open long enough, nothing said. **Result 1 of 4.**
13. **C** lays out the other stops (11 `add_stop` calls, one after another; **F18.8**). Day 1: afternoon attraction `stop_f3x8kd2w`, evening meal `stop_g7y4nm9c` (mid-range, "stays of 2+ nights"). Day 2: morning attraction `stop_j9c3vk5e`, morning meal `stop_k4r7xm2p`, afternoon meal `stop_m6t9wb3h`, afternoon attraction `stop_n8f2qy7d`, evening meal `stop_p3z5kc8v`. Day 3 (rest day): evening meal `stop_q7d4rh6x`. Day 4: morning attraction `stop_r2w8tm5g`, afternoon meal `stop_s9k3vy4c` (value, "trip default"; purpose "pie," brief only, **F13**), afternoon attraction `stop_t5x7pn2e`. Day 5: overnight attraction `stop_v8c4qz6w` ("stargazing, about 1 a.m."; it goes on Day 5 by the after-midnight rule).
14. **C** decides the workers (**F2**). SR Moab gets the Moab lodging plus all of Day 1 (Fisher Towers is 25 miles up Highway 128, within "near"), Day 2, and Day 3. Day 2 stays put, so it has no route to search along. LS Day 4 gets Goblin Valley, pie, and Capitol Gorge. SR Torrey gets the Torrey lodging plus **Day 5's** stargazing stop. That isn't one of Torrey's days, so this is an assumption. No LS for Day 1 (no stops assigned to it) or Day 5.
15. **C** → `Agent` ×3, in parallel.
16. **SR Moab:**
    - Runs the general web search "must-see things to do in Moab Utah," which finds Fisher Towers. → `find_place("Fisher Towers", "Moab, UT")` → `place_ft7k3wqe` (location only). → `add_nearby_stop_candidates(stop_f3x8kd2w, [Fisher Towers (web search, link, visit 2 h, note "Hours not confirmed"), Dead Horse Point overlook, Castle Valley viewpoint])`.
    - Runs `search_near` for hotels, meals, and Arches stops. Adds sets for each stop: Moab Brewery; Windows Section; Love Muffin; Milt's (Google hours: Mon 7:30 a.m.–12:30 p.m., an assumption); Corona Arch; Desert Bistro; The Spoke. Adds lodging set 0: Hyatt Place, SpringHill Suites, Moab Springs Ranch.
    - **Returns:** one line per candidate, plus "Milt's closes at 12:30 p.m."
17. **LS Day 4** → `search_along_leg(day_d7p2fynk, "state park")`, `("pie bakery")`, `("scenic drive canyon hike")`. No stops are selected, so the route is the bare Moab → Torrey line, through Hanksville and Fruita. Torrey places are dropped as within 5 miles of the end. → `add_route_stop_candidates`. Goblin Valley has a 25-minute detour. The pie set: Gifford Homestead (Google hours "8 AM–5 PM daily," a normal week, **F3**) with 2 minutes, Stan's Burger Shak 1 minute, Luna Mesa Oasis 3 minutes. Capitol Gorge: 50 minutes. The leg scout can't do a details search for Gifford, because the hook blocks it (**F3**).
18. **SR Torrey** → `search_near(stop_v8c4qz6w, …)`. **Reply:** error: "stop_v8c4qz6w is on the last day, which has no stay." (**F2**, made up, since the docs don't say). The worker runs a web search for "best stargazing Capitol Reef," which finds Panorama Point. → `find_place` → `add_nearby_stop_candidates(stop_v8c4qz6w, [Panorama Point (web search, visit 1.5 h), Goosenecks Overlook])`. Torrey lodging set 0: Austin's Chuck Wagon Lodge, Capitol Reef Inn, Rim Rock Inn (all value).
19. **User sees:** cards everywhere.

**Selections and the hours check** (change 2)

20. **User** selects Fisher Towers → **C** → `select_candidate(stop_f3x8kd2w, place_ft7k3wqe)`. **Code:** re-routes Day 1. Hours: the selected candidate was found by web search, so **"Hours not known" note** (**result 2 of 4**). The check has to read the candidate's source, not the place (**F3**). **User sees:** "Added Fisher Towers. Its hours aren't confirmed, so check before you go. It's an open trail, so it's usually fine."
21. **User** selects Moab Brewery, Windows, and Love Muffin. Nothing to report.
22. **User** selects Milt's → `select_candidate(stop_m6t9wb3h, place_ms3r7kwy)`. **Code:** hours on Monday, afternoon block (12–4): open 12:00–12:30, 30 minutes, under the 1-hour meal. **Warning** (**result 3 of 4**): "Closes at 12:30 p.m. It's about 5 minutes from your previous stop, Love Muffin Cafe. Drive times are averages, so allow extra time." **User sees** that, plus the trade-offs: move it to the morning, swap it for another lunch spot, or keep it and get there right at noon.
23. **User:** "Move it to the morning." **C** → `update_stop(stop_m6t9wb3h, move day_b8m3cxpe, morning, after stop_k4r7xm2p)`. **Code:** the block changed, so any approval is cleared (none was set). Hours: morning, open 7:30–12:30, open long enough. Re-routes Day 2. **User sees:** "Milt's is now in the morning, right after Love Muffin. Two meals back to back. Keep both?" **User:** "Yes, Love Muffin is just coffee." (Meals have no type, so this is fine.) The finished Day 2 now differs from the example: Milt's is in the morning.
24. **User** selects Corona Arch → `select_candidate(stop_n8f2qy7d, …)`. **Code:** stop-order check (a Pro-level call). **Note:** "A faster order saves 18 minutes. It moves Corona Arch from the afternoon to the morning." **C** judges it: doing it would push the meals past noon after an early hike. It mentions it in one line and recommends keeping the order. **User:** "Keep it." Nothing records that this was declined (**F17**). Selecting Desert Bistro brings the same note back.
25. **User** selects The Spoke on the rest day. **Code:** a rest day, so no leg and no re-route. Hours: Tuesday evening, open long enough.
26. **User** selects Hyatt Place → `select_candidate(stay_mq4p8xra, place_hy7p4mwz)`. **Code:** re-routes Day 1 (to the hotel), Day 2 (hotel to hotel), and Day 4 (from the hotel). That is more than "the legs on either side" (**F18.1**).
27. **User** selects Goblin Valley → Day 4 is 3 h 15 m road, 3 h 35 m with buffer.
28. **User** selects Gifford Homestead → `select_candidate(stop_s9k3vy4c, place_gh8k4wzn)`. **Assumption:** Google's listing shows it closed every day (**F3**). Hours: Wednesday, afternoon, **closed, flag** (**result 4 of 4**). **User sees:** "Gifford Homestead looks closed for the season by mid-October. Options: keep it anyway (you can still walk the orchard), pick another pie stop, or drop the stop."
29. **User:** "Keep it, we'll see the orchard." **C** → `update_stop(stop_s9k3vy4c, approval yes, reason "wants to see the homestead and orchard even if the shop is closed")`. **Reply:** flag gone.
30. **Change 3. User** selects Capitol Gorge → `select_candidate(stop_t5x7pn2e, …)`. **Code:** re-routes Day 4: 4 h 15 m road, 4 h 40 m with buffer. **Flag:** "Day 4 needs about 4 h 40 m of driving against your 4-hour default." **User sees** the trade-offs: drop Capitol Gorge (saves about 50 minutes), drop Goblin Valley, or accept a 5-hour day.
31. **User:** "A longer day is fine." **C** → `update_leg(day_d7p2fynk, approved drive hours 5, reason "wants Goblin Valley and Capitol Reef on the way")`. **Reply:** none (4 h 40 m is within 5 h).
32. **User** (still change 2): "Actually, let's find another pie place instead of Gifford."
33. **C** → `clear_selection(stop_s9k3vy4c)`. **Code:** the approval is cleared because the place was cleared. Status back to proposed. Re-routes Day 4 (almost the same). This makes the open decision visible later (**F11**). **[memory: write trip memory "rejected Gifford Homestead: closed for the season"]**. **User sees:** "The other two from before are Stan's Burger Shak and Luna Mesa Oasis. Want fresh options?" **User:** "Fresh ones."
34. **C** → `Agent(LS Day 4, stop_s9k3vy4c only, value, purpose "pie or dessert," leave out Gifford (closed), Stan's, and Luna Mesa)`. **LS** → `search_along_leg` → `add_route_stop_candidates(stop_s9k3vy4c, [Duke's Slickrock Grill, Mesa Market])`. **Reply:** "Set 1 for stop_s9k3vy4c: 2 candidates." **User:** "I'll look at these later."
35. **User** selects Austin's Chuck Wagon (Torrey) and Panorama Point. Panorama Point: Day 5, overnight block, Thursday, found by web search, so a **note**. **Code:** Day 5's leg is Torrey hotel → Panorama Point → Salt Lake City, with no return to the hotel (**F14**). 3 h 30 m road, 3 h 51 m with buffer, under 4.

**Weather**

36. **C** → `Agent(WW, both stays, dates, activities)`. Day 5's stargazing isn't in any stay, so **C** adds it to Torrey's activities by its own choice (**F14**). **WW** → `stay_weather(stay_mq4p8xra, place_mb3x6tqe)`, which returns averages labeled "Typical for Oct 10–12, based on 2017–2026." That range includes an incomplete October 2026 (**F18.6**). → `set_stay_weather` ×2. **User sees:** "Moab: highs around 70 °F, nights in the low 40s. Sun and water for Corona Arch; layers for the sunrise hike. Torrey: near freezing at night. A warm jacket for stargazing."

**Change 4: the whole trip one day later**

37. **User:** "Can we start Monday the 11th instead?"
38. **C** checks the brief: a window, not fixed, and Oct 11–15 is still in October. → `update_itinerary(start date 2027-10-11)`. **Code:** every date moves. Nothing is re-routed. The hours check runs on every stop with the new weekdays (Day 2 is now Tuesday). No new results. The approval that would have hidden a change is already gone (Milt's was moved, Gifford cleared). **F4** shows how close this came. **Storage:** both stays' weather is now out of date, since the dates no longer match.
39. **C** reads it as out of date only through `read_itinerary` (**F8**). The user is done changing things, so it reruns. → `Agent(WW, both stays)` → new text for Oct 11–13 and Oct 14. **User sees:** "Moved to Mon Oct 11 – Fri Oct 15. Hours still work. Weather updated (no real change)."
40. **C** **[memory: update trip memory "dates moved to Oct 11–15 at user's request"]**. The session ends.

**Change 5: a new session the next day**

41. **UI:** the user opens the trip and starts a new session. There is no transcript. **C** → `read_memory`, `read_trip_brief`, `read_itinerary`.
42. **User:** "Why did we pick that Moab hotel?" **C** answers from the selected candidate: "Hyatt Place: mid-range, from your rule for stays of 2+ nights, with a pool and close to the Arches entrance for the sunrise hike." It needs the candidate's rationale. `read_itinerary` may not return it, and no other tool clearly does (**F11**). If the user said why they chose it, that is only in trip memory.
43. **User:** "What's left to decide?" **C** builds the list from the itinerary and memory:
    - The pie stop on Day 4 is still open (set 1: Duke's, Mesa Market). It shows only because the selection was cleared at step 33.
    - Fisher Towers and Panorama Point have unconfirmed hours.
    - Day 4 is a 5-hour day, already approved.
    - Trip memory shows no other open items.

**End state** matches technical spec 3.1, with these differences from the walk:
- Dates are Oct 11–15.
- Milt's is in the morning.
- Day 4's meal stop is proposed, not Gifford.
- The Moab Day 1 route type and waypoint are as in the example.
