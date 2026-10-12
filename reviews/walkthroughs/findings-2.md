# Walk-through 2: findings

> **Snapshot, out of date.** This is the output of design walk-through 2, from 2026-10-11. It describes the design as it was then. The design changed after it, so much of this no longer matches. The current design is in `design/`. Anything still open is in `research/domain-model-notes.md`. See `reviews/walkthroughs/README.md`.

Technical spec open question 4. Both examples in technical spec 3.1 were walked from an empty trip through every planning round, with the requested changes. I worked only from `design/`. Drive times and place details are rough and made up. Assumptions I made where the docs are silent are labeled **A1**, **A2**, and so on in the step log (section 3).

Tags: **needs a decision**, **wording fix**, **for the object model**.

---

## Review groups

Added after the walk, in a review that could see the project history and memory. Work through the groups in this order. The findings in each group touch the same parts of the design, so settling them together means each section gets edited once.

1. **Time inside a day:** F3, F2, F7, F16, F19.2. Where the drive after the last stop goes, when the party really reaches a stop, and whose visit time the checks use. F3 and F2 both rest on code estimating when each stop starts within its block, so settle them together. Do this group first. Time blocks and the hours check are what this walk-through was for.
2. **Stays changing under existing stops:** F1, F12, F15. What adding, removing, or reordering stays and nights does to the stops and legs already there, and the lists of what re-routes a leg.
3. **Check results and approvals:** F4, F10, F11, F19.3, F19.6. When a result counts as new, which results come back, where the last set is stored, and two checks that read the wrong inputs.
4. **Skeleton and fill:** F6, F8, F9 (all but the weather bullet), F18, F19.4, F19.5, F19.10. Must-sees, waypoints on scenic legs, what goes in a worker brief, and detour time.
5. **Weather:** F5, F17, F9 (the weather bullet), F19.8.
6. **Candidates, selection, and tiers:** F13, F14, F19.1, F19.7, F19.9.

**Group 1 schedule details (settled 2026-10-11, committed 5358f71).** These came from replacing time blocks with a schedule, not from the walk.

- **Day start time:** a property on the day, set with `update_day`. When a day has none, it comes from a usual start time in the trip brief, defaulting to 8 a.m.
- **A stop's time:** each stop either follows the previous stop or has a set time. A set time is "not before": if the party would arrive early, the gap shows as free time. Code works out every arrival and departure on read, from the day's start time, drive times, and visit times. Nothing new is stored.
- **Opening-hours approval:** records the place and how much of the visit falls within opening hours. It warns again only if a later change makes that smaller, the same pattern as drive hours.
- **Late for a set time:** replaces block fit. A warning when the party would arrive more than a set allowance after a stop's set time (a setting, starting at 15 minutes). No approval: the user's answer changes the plan, by moving the set time or cutting something earlier. The block fit approval kind goes away.
- **Stop-order note:** names the stops in the faster order, and says which set times that order would miss.
- **After midnight:** a day runs from its start time until its last stop ends, even past midnight. Panorama Point moves to Day 4 at "1:00 a.m., next day," and Day 5 is just Torrey to Salt Lake City. The tool input needs an explicit way to say "next day."

**Where I disagree with the walker's recommendation:** F9 (towns along the leg, and how the weather worker gets activities), F14 (the "any" tier), F18 (I'd drop the stored search results), and F19.7 (set numbers after a clear). F6 and F16 are partial agreements. Each finding ends with a **post-review analysis** that gives the reasons.

---

## 1. Findings

Most important first.

### F1. Adding a stay in the middle strands the next day's stops (needs a decision)

**What happened.** In San Francisco, after everything was selected, the user added a Big Sur night after Monterey. Code inserted a new Big Sur day as Day 2. The old Day 2 became Day 3 and now starts in Big Sur. It still holds First Awakenings (breakfast, search area: the Monterey stay), Point Lobos, and Bixby Creek Bridge. All three are now behind the party. The route became Big Sur → north to Monterey for breakfast → south again. Day 3 went from 3 h 41 m to about 5 h 15 m.

Three things go wrong:

- **No check flags it.** First Awakenings' search area is Monterey, but Day 3 neither starts nor ends at Monterey. `add_stops` and `move_stop` refuse to create that state, but `add_stay` creates it without saying anything.
- **The stop-order check doesn't catch it, although section 8 says it does** ("a new night that puts Monterey stops behind the party"). Every order has to go north and come back, so no order saves 15 minutes. Only the daily driving warning fired, and only because the day went over 5 hours. On a shorter day, nothing would have shown.
- **Fixing it is awkward, and undoing the fix is worse.** Point Lobos and Bixby are "along the leg" stops, which can't move to another day. They have to be removed and re-added with `select_user_place`. That loses the worker's rationale and asks the user for visit times again. Then say the coordinator had moved First Awakenings to the Big Sur day, and the user changes their mind. `remove_stay` is refused, because a stop is on the Big Sur day. The stop can't move back to Day 3 while Big Sur exists, because Day 3 still starts in Big Sur. The only way out is to park the stop on Day 1 for a moment, or remove it.

In the walk, the user changed their mind before anything moved. So `remove_stay` worked, and everything came back as it was, waypoint included.

**Docs.** Technical spec 3.5 (night added, stay removed), section 6 (search area), section 8 (stop order). Tool design 2.1 (`add_stay`, `move_stop`, `remove_stay`).

**Options.**
1. Add a check: a warning when a stop's search area is a stay its day no longer starts or ends at. It names the stops. Correct section 8's stop-order claim.
2. Have `add_stay` refuse when it would strand stops, listing them, the same way `remove_stay` does.
3. Leave the tools alone. Tell the coordinator, in its instructions, not to move stops for an inserted stay until the user confirms the stay.

**Recommendation.** Option 1 plus option 3. Option 2 would block the "try it and see" flow the user did here. Re-adding along-leg stops on the new day is acceptable, because their detours were for the old leg anyway.

**Post-review analysis.**

- **Finding:** Agree. `add_stay` puts Big Sur's day after Monterey's, so the old Day 2 keeps its stops but now starts in Big Sur. The section 8 example is wrong: no order of those stops avoids driving north and back, so the stop-order check can't flag it.
- **Recommendation:** Agree with option 1. Option 3 is fine as well.
- **Caveats:**
  - The new check only catches First Awakenings. Point Lobos and Bixby are along the leg, and "along the leg" is still a valid search area on the new Day 3. They're just behind the party now. So the check alone misses two of the three stranded stops.
  - To cover them, use the pattern 3.5 already has for "a stay moves to a different town." The tool leaves the stops alone, and its reply lists the stops on each day whose from or to changed. The coordinator then talks them through with the user. Add a 3.5 bullet for a stay that's added or moved to a new spot in the order.
  - Run the check on every write, not only `add_stay`. Moving a stay to a new spot in the order (`update_stay`, "the stay it now goes after") strands stops the same way.
  - Make it a warning, not a note. The plan doesn't work as it stands.
  - The undo deadlock is real but rare. It only happens if the coordinator has already moved a stop onto the new day. Option 3's instruction avoids it. I wouldn't design more for it.

**Settled (2026-10-11, fbdb0a8).** The write's reply lists the stops on any day whose start or end changed, and a new warning flags a stop near a stay its day no longer starts or ends at. The coordinator holds off moving stops until the new stay is confirmed. The stop-order claim in section 8 is corrected.

### F2. Driving after the last stop belongs to no block (needs a decision)

**What happened.** San Francisco Day 3 has no stops. It is 3 h 40 m from San Luis Obispo to Mike's house. Functional spec 9.5 says a day's blocks contain driving, but this day has nothing to put in any block. Moab Day 5 has Panorama Point at 1 a.m., then 3 h 25 m to Salt Lake City that sits in no block. Moab Day 4 ends with Capitol Gorge in the afternoon, then about 40 minutes to Torrey that isn't counted anywhere.

Block fit adds "each stop's visit time and its drive time from the previous stop." The drive from the last stop to tonight's stay is never in any sum. A day with one morning stop and then 4 hours of driving shows an empty afternoon. Block fit says it fits.

**Docs.** Functional spec 9.5. Technical spec 3.1 (time blocks, stop's drive time), section 8 (block fit).

**Options.**
1. Code works out where the final drive goes. It starts in the block of the last stop. On a day with no stops, it starts in the morning. Block fit counts it, and the daily view shows it.
2. Store a departure block on the day, set by the coordinator.

**Recommendation.** Option 1. It needs no new input.

**Post-review analysis.**

- **Finding:** Agree. Block fit adds each stop's drive from the previous stop, so the drive from the last stop to the night's stay is never counted. The daily driving check does count it, so the day's total is right. What's wrong is block fit and the daily view.
- **Recommendation:** Agree with option 1.
- **Caveats:**
  - Settle it with F3. If code estimates when each stop starts within its block, the final drive starts when the last stop ends. It can run into later blocks, the same way a long visit does.
  - On Moab Day 5, this puts the 3 h 25 m drive to Salt Lake City at about 2 a.m. That is the MVP shortcut 3.1 already accepts (the drive back from a stop after midnight on the last day). Leave it, but expect the daily view to look odd there.
  - "Morning" for a day with no stops is a display default, not a plan. Say so, so nobody reads it as a decision.

**Settled (2026-10-11).** Replaced by a schedule worked out in code. Time blocks go away. Stops are in one order for the day, each either following the previous stop or at a set time, from the day's start time. The drive after the last stop gets its own times. Details are settled with the rest of group 1.

### F3. The hours check ignores where a stop sits in its block (needs a decision)

**What happened.** In Moab change 5, the user added a 5-hour hike (Devils Garden) to the Day 2 morning, after Windows. Milt's, which closes at 12:30 p.m., was later in the same morning, after the hike and Love Muffin. The party would really arrive around 3:30 p.m. The hours check passed Milt's, because it is open for an hour starting somewhere between 8 a.m. and noon. Block fit warned that the morning held about 9 hours, but said nothing about Milt's. The coordinator caught it only because it remembered the 12:30 closing from an earlier warning.

**Docs.** Technical spec section 8 (opening hours, block fit).

**Options.**
1. Keep the check as is. Tell the coordinator to look at hours whenever block fit warns.
2. Code estimates each stop's earliest arrival within its block. It adds up the visit and drive times of the stops before it in the block. These are the same numbers block fit already adds. It tests hours from that time. No clock time is stored or shown.
3. Option 2, but report a late arrival as a note ("may close before you get there") rather than a warning.

**Recommendation.** Option 2.

**Post-review analysis.**

- **Finding:** Agree. I'd rank it first. Block fit did warn here. But once the user approves a 9-hour morning, nothing would ever point at Milt's again.
- **Recommendation:** Agree with option 2.
- **Caveats:**
  - It replaces the "starts within the block" rule that F19.2 rewords. The new rule: the place is open from the estimated arrival for the whole visit time. Settle the wording once, here.
  - The estimate starts at the beginning of the block and ignores spillover from the block before. That's lenient on purpose. Block fit already covers spillover between blocks.
  - The opening-hours approval records the place, date, and block. It won't notice a stop moved later within the same block. Decide whether the approval also records the stop's position, or accept the gap. I'd accept it.
  - A message can say "you'd reach Milt's around 3:30 p.m." That's a clock time in a message, not a stored one, so it keeps the "no clock times" rule.

**Settled (2026-10-11).** Replaced by the schedule (see F2). The hours check tests each stop's worked-out arrival time.

### F4. Check results: false alarms mid-build, and "already known" is fragile (needs a decision, partly for the object model)

**What happened.**

- **False alarms while building.** Before the skeleton is built, every write returns warnings that the next write will fix. Setting the start date gave "trip length 1 day vs 3." Setting the start and end places gave "Day 1 driving 6 h 40 m vs 5 h" (San Francisco straight to Los Angeles, the only day). Moab gave the same for Grand Junction to Salt Lake City. Section 8 says the coordinator "must raise" each warning. Here it shouldn't. I assumed it held them until the turn's writes were done (**A2**).
- **"Already known" is only relative to the last write.** When Big Sur was added and then removed, results that went away and came back were marked "new" again. On Moab Day 2, the user agreed to keep the stop order. If a later change pushes the saving below 15 minutes and then back above, the note returns as new, and the coordinator raises it again. Nothing records the user's decision, because stop order has no approval.
- **Where the last set lives isn't said.** In the new session (Moab change 6), results are only "already known" if the last set is stored with the trip, not the session. I assumed per trip (**A6**).
- **What counts as the same result isn't said.** If an unapproved daily driving warning grows from 4 h 10 m to 4 h 50 m, is it new?
- **Whether approved warnings come back isn't said.** For example, Moab Day 4 driving with its 5-hour approval.
- **Results aren't only about days.** "A write returns results for the days it touched." But trip length is about the trip, and weather and tier notes are about a stay.

**Docs.** Technical spec section 8, 5.2 ("Raise each warning once").

**Options.**
1. Tell the coordinator to raise warnings that are still open when its writes for the turn are done. This is the same pattern as the weather rerun. Store the last set per trip. Identify a result by check and subject (trip, stay, day, stop, block). Return approved warnings, marked approved, in full reads only.
2. For note decisions such as stop order, have the coordinator save them in trip memory.
3. Add a stop-order approval that records the order the user accepted.

**Recommendation.** Options 1 and 2. Add option 3 only if stop-order notes keep coming back in testing.

**Post-review analysis.**

- **Finding:** Agree with all six points. The false alarms are certain: the itinerary starts with only the last day, so the first write of a skeleton always gets a trip-length warning.
- **Recommendation:** Agree with options 1 and 2.
- **Caveats:**
  - "Raise warnings still open at the end of the turn" needs the escape the weather rule has: "once no change is still being discussed." A skeleton often takes several turns. After the user agrees to Monterey but before SLO is decided, "trip is 2 days, you asked for 3" is still a false alarm.
  - Identify a result by check and subject, as proposed. A driving warning that grows from 4 h 10 m to 4 h 50 m stays already known. The write's reply shows the new figure anyway.
  - Returning approved warnings, marked approved, in full reads goes with F19.6. Settle them together: a read shows each approval as applying or not, and each warning as approved or open.
  - Option 2 matches functional spec 10.2, which already lists rejected options and why as trip memory. A declined stop-order note is the same kind of thing.

**Settled (2026-10-11, 0451071).** Option 1 and 2 with the caveats: warnings raised at the end of the turn; the list of check results saved with the trip; same check about the same thing is the same check result; declined notes go to trip memory; full reads mark approved warnings.

### F5. Weather text misses changes, and some stops and dates fall outside every stay (needs a decision)

**What happened.**

- **Activity changes don't mark the text out of date.** Only place and date changes do. In Moab change 5, the new 5-hour hike got into Moab's weather text only because the dropped night also changed the dates. If the hike had been added a day later on its own, the text would stay "current" and never mention water and sun for a long desert hike.
- **A new stay gets no weather and no note.** Big Sur was added after the weather round. Its weather was empty, and no result said so.
- **A one-day shift reruns everything.** Moving the Moab trip from October 10 to 11 marked both stays out of date. The rerun cost 20–40 Open-Meteo calls for averages that barely move, since each request already covers the dates plus 7 days on each side.
- **The last day's leg belongs to no stay.** Technical spec 6.3 says "a stop on the last day ... is still covered." That is only true when the stop's search area is a stay, like Panorama Point. A lunch along the last day's leg would be covered by nobody.
- **"A stay's dates" isn't defined.** Torrey's only night is October 13. Panorama Point is at 1 a.m. on October 14. For averages this doesn't matter. For a forecast, the "every date within 7 days" test and the days fetched should include the departure morning.

**Docs.** Technical spec 3.5 (weather out of date), 6.3, section 8. Tool design 2.5.

**Options.**
1. Record the activities with the text: the stop IDs and their selected places. Mark the text out of date when they change. Add a note for a stay with no weather once any stay has some. For averages, ignore date shifts of a few days.
2. Keep the current rule and tell the coordinator to rerun weather when it changes a stay's activities.
3. Define a stay's dates as its first night through its departure morning. Give the last day's leg to the last stay for weather.

**Recommendation.** Options 1 and 3.

**Post-review analysis.**

- **Finding:** Agree with all five points. One correction: the Open-Meteo calls aren't the real cost. The Open-Meteo doc puts a stay at 10 to 22 calls against a limit of 10,000 a day. The cost of a needless rerun is the weather worker itself: a model call, and time.
- **Recommendation:** Agree with option 3. Agree with option 1, with the changes below.
- **Caveats:**
  - Record only the attraction stops the text was written for, not the meals. Clothing advice turns on hikes and stargazing, not on which café. Otherwise every restaurant swap marks the weather out of date and reruns the worker.
  - Make the "ignore small shifts" rule for averages exact, so code can work it out. The text stays current while the stay's new dates still fall inside the window it was built from: its dates plus 7 days on each side. A forecast goes out of date on any date change.
  - If `stay_weather` returns the activities (my take on F9), `set_stay_weather` can record them without the worker passing anything.
  - "No weather yet" can be the same note as "out of date": once any stay has weather text, a stay with none is out of date. One note, not two.

**Settled (2026-10-11, 2a8a78c).** All five recommendations: activities (attraction stops) recorded with the weather text, a stay with no text is out of date once any stay has some, averages ignore shifts inside their window, last day's leg counts with the last stay, a stay's dates include the departure morning.

### F6. A "scenic" leg can quietly run on the freeway (needs a decision, plus a wording fix)

**What happened.** San Francisco Day 1 has a scenic route preference. It has no waypoint and no route type approval, so the itinerary labels it scenic. But its selected stops (Millbrae, Moffett Field, San Jose) are all on US-101. The leg runs US-101 and CA-17 to Santa Cruz. Technical spec 4.2 says selecting the Boardwalk "pulls San Francisco Day 1 onto the coast." That is only true from Santa Cruz to Monterey. The coast road out of San Francisco (CA-1 through Half Moon Bay) is never used. Nothing prompts the coordinator to compare the leg's road with the preference before the fill. The leg scout then searches US-101, and its finds lock the inland route in.

**Docs.** Technical spec 3.1 example, 3.3, 4.2 step 3.

**Options.**
1. Add a coordinator instruction for the end of the skeleton. For each moving day, check the leg's road against the preference with `compute_route`, with and without a waypoint. Then add the waypoint, or agree a route type approval with the user.
2. Fix the example. Either add a Half Moon Bay waypoint and coastal stops, or add a Day 1 route type approval with a reason (for example, "inland for Hangar One").
3. Accept it: route type is only a label.

**Recommendation.** Options 1 and 2. Also correct the 4.2 sentence.

**Post-review analysis.**

- **Finding:** Agree. The real gap is that no round says when the coordinator sets waypoints. The skeleton step in 4.2 lists stays, nights, and legs, but not waypoints. So the fill searches whatever road the leg happens to run on.
- **Recommendation:** Partly agree.
  - Option 1, but lighter: add to the skeleton step that the coordinator sets waypoints on scenic legs before the fill. It judges from its own knowledge, and calls `compute_route` when unsure. Requiring two `compute_route` calls for every moving day is more than needed.
  - Option 2: the example's Day 1 stops (Millbrae, Moffett Field, San Jose) are inland by choice. A Half Moon Bay waypoint doesn't fit them, because code would place it far off the line between them. The honest fix is a route type approval with a reason, such as "inland in the morning for Hangar One, coast from Santa Cruz." That also plants a useful test: stops that pull a leg off the preferred road.
  - Correct the 4.2 sentence. The Boardwalk pulls Day 1 onto the coast from Santa Cruz south, not the whole way.

**Settled (2026-10-11, 50e65a5).** The route preference only guides stretches nobody has decided; no flag when the user's own stops choose the road. No route type approval on SF Day 1. Legs show a route type only when the day has its own.

### F7. A visit time can't be changed once offered (needs a decision)

**What happened.** The Moab researcher estimated Devils Garden at 4.5 hours. The user said, "plan 5, we're slow." No tool can change it. Candidates never change. `update_stop` has no visit time. `select_user_place` refuses a place that's already a candidate. Block fit and the hours check read the visit time, so the wrong number gives wrong checks. The same thing happens if the user later wants "the whole afternoon" at the Boardwalk, which they first said was 2 hours. I assumed the coordinator saved it to trip memory and sized the block fit approval to match (**A8**).

**Docs.** Technical spec 3.2 (visit time on the candidate), section 8. Tool design 2.1 (`update_stop`, `select_user_place`).

**Options.**
1. The stop holds its own visit time. Selecting a candidate copies the candidate's estimate. `update_stop` can change it. The candidate keeps the worker's estimate.
2. Add a visit time override to `update_stop`, used instead of the candidate's when set.

**Recommendation.** Option 1. It gives one value to read, and no "if set" rule.

**Post-review analysis.**

- **Finding:** Agree.
- **Recommendation:** Agree with option 1.
- **Caveats:**
  - Give meals a visit time too, starting at 1 hour. Then the hours check and block fit read one value for every stop, and a long tasting-menu dinner can be 2.5 hours. Today "a meal counts as one hour" is a fixed rule.
  - Selecting a different candidate resets the visit time to that candidate's estimate. That's right, because it's a different place. But "we're slow" is about the party's pace, not Devils Garden. The coordinator should save it to trip memory and apply it to later picks.
  - `select_user_place` already takes a visit time for attractions. With option 1, that sets the stop's visit time directly.

**Settled (2026-10-11).** Agreed with the post-review analysis. The stop holds its own visit time, copied from the selected candidate and changeable with `update_stop`. Meals get one too, starting at 1 hour. A pace preference such as "we're slow" goes to trip memory.

### F8. Must-sees that are areas, roads, or activities (needs a decision)

**What happened.** Technical spec 4.2 says to add a stop for each must-see and select it with `select_user_place`. That works for one place: the Boardwalk, Delicate Arch, Goblin Valley, or the Whaling Station. It doesn't work for "Capitol Reef," "Arches," "stargazing," or "the Big Sur coast." Capitol Reef's Google listing is one point with 24-hour hours. Selecting it gives a stop with a made-up visit time, while the example's real stops are Gifford Homestead and Capitol Gorge. Stargazing has no place until a worker finds Panorama Point.

I assumed (**A3**) the following. The coordinator selects only must-sees that are one place. For an area, it makes sure the leg passes it (UT-24 already does) and lays out stops with the area in the purpose, for a worker to fill. For a road, it sets waypoints.

**Docs.** Technical spec 4.2 step 3.

**Options.**
1. Write A3 into 4.2.
2. Select the area's own listing as a stop anyway, and let the fill add stops around it.

**Recommendation.** Option 1.

**Post-review analysis.**

- **Finding:** Agree.
- **Recommendation:** Agree with option 1, with one addition. When the leg might miss an area must-see, the coordinator adds a waypoint inside it, such as the Capitol Reef visitor center. That gives an area the same pull on the route that selecting a place gives a single-place must-see. Roads getting waypoints fits 4.1, which already treats a named road as an anchor.

**Settled (2026-10-11, 50e65a5).** As in the post-review analysis.

### F9. Worker briefs leave out things the workers need (needs a decision, partly a wording fix)

**What happened.**

- **No block or neighbors.** The San Francisco Day 1 leg scout filled breakfast, an aviation stop, and coffee, all meant for before the Boardwalk. Its brief has each stop's purpose, but not its block or the selected stops around it. `search_along_leg` sorts results by position, but doesn't say where along the route each one is. A breakfast in Capitola, after the Boardwalk, is a valid answer to the brief as written.
- **No towns for Atlas Obscura.** The leg scout is told to search Atlas Obscura "for towns the leg passes through." Nothing tells it which towns. I assumed it read them off the along-leg results' addresses (**A4**). That is how it found Fisher Towers via "Castle Valley, Utah."
- **The leg scout doesn't check hours.** The stay researcher's instructions say to check hours against the dates and report problems. The leg scout's (6.2) don't. Gifford Homestead, closed on Wednesdays, came back from the leg scout with no warning in its result.
- **No party size.** Lodging for "us plus another couple" needs two rooms.
- **Weather activities.** 6.3 says "code gathers" each stay's activities for the brief. But the coordinator writes every brief through the built-in `Agent` tool, so code has no step where it could add them. A stay-scoped `read_itinerary` already returns exactly that set of stops. I assumed the coordinator copied them from it (**A5**).

**Docs.** Technical spec 5.3, 6.2, 6.3. Tool design 2.3 (`search_along_leg`).

**Options.**
1. Add to 5.3: each stop's block, the selected stops before and after it, and the party. Have `search_along_leg` return each place's drive time from the leg's start, and the towns along the route. Add the hours check and "problems found" to 6.2. Say in 6.3 that the coordinator copies activities from a stay-scoped read.
2. Same, but have `stay_weather` return the activities itself, so the coordinator doesn't copy them.

**Recommendation.** Option 1. Option 2 is fine too if copying proves error-prone.

**Post-review analysis.**

- **Finding:** Agree with all five points. The missing time block matters most. A worker can't check hours "against the dates" without knowing when in the day the stop is.
- **Recommendation:** Partly agree.
  - **Block and neighbors:** agree. The simplest form: the brief lists the day's stops in order, each with its block and purpose, and names any that are selected.
  - **Drive time from the leg's start in `search_along_leg`:** agree. It costs nothing, since code already sorts results by that figure.
  - **Towns for Atlas Obscura:** disagree with having the tool return them. Code would have to look up towns along the route line, which takes extra calls. The leg scout can name the towns from its own knowledge and the addresses in its results. Write A4 into 6.2.
  - **Hours check in 6.2, and the party in 5.3:** agree.
  - **Weather activities:** I'd pick option 2, not option 1. 6.3 already says code gathers them, and your principle is that code works out what it can. Copying a list out of a read is the kind of model step that slips. It also lets `set_stay_weather` record the activities for F5.

**Settled (2026-10-11).** Partly, with group 1: the worker brief gives each stop's worked-out time instead of its block. The rest of F9 is settled with group 4.

**Settled (2026-10-11, 50e65a5).** The rest, except the weather bullet: the day's other stops in the brief, drive time from the leg's start in search_along_leg, the leg scout checks hours and names its own towns. Party size is cut entirely instead of added. SF Day 1's stops are marked as named by the user (the leg scout never filled them).

**Settled (2026-10-11, 2a8a78c).** Weather bullet: option 2, `stay_weather` returns the activities.

### F10. The stop-order check compares unequal routes, and its result can't be "worked out fresh" (wording fix, for the object model)

**What happened.** The current order's time includes the leg's waypoints. The best-order call leaves them out, because Google rejects them. Take San Francisco Day 2 partway through selection, with only breakfast, the seals, and dinner selected. Without the Big Sur waypoint, Google is free to take US-101. Part of any "time saved" is just dropping the waypoint, even when the order hardly changes.

Separately, section 8 says results are "worked out fresh from the plan after every change." But this check needs a paid call that runs only on re-routes. A start-date change reruns the hours check but can't rerun stop order. So its last result has to be stored with the leg.

**Docs.** Technical spec section 8 (stop order, "Results are worked out").

**Options.**
1. Report a note only when the order differs. Compare against the current order also computed without waypoints, which is one more basic call. Store the best-order result on the leg.
2. Report only when the order differs, and accept the rough figure.

**Recommendation.** Option 1.

**Post-review analysis.**

- **Finding:** Agree with both parts.
- **Recommendation:** Agree with option 1. The extra call is a basic Routes call, cheaper than the best-order call that's already made. Storing the result on the leg follows 3.3's rule: anything that costs a call is computed once and stored. Section 8's "worked out fresh" sentence needs an exception for it.

**Settled (2026-10-11, 0451071).** Option 1: compare Google's best order with the day's order, both without waypoints; skip when the orders match; store the result on the leg. The time saved is a rough signal, not a figure to quote.

### F11. Whether hours are known depends on the candidate, not the place (for the object model)

**What happened.** Fisher Towers came from Atlas Obscura. The leg scout looked it up with `find_place`, which asks Google for hours and ratings and stores them on the place. Section 8 says hours are "not known" for anything found by web search. So the check has to read how the selected candidate was found, not just the place. The same place could be found by a Google search for another stop, and then its hours would be trusted. The card's "Not rated" works the same way.

**Docs.** Technical spec 3.1 (place), section 8. Tool design 2.3. Web search design, section 4.

**Options.**
1. The check and the card look at the selected candidate's source.
2. Store a "hours trusted" flag on the place, set by the first candidate.

**Recommendation.** Option 1.

**Post-review analysis.**

- **Finding:** Agree.
- **Recommendation:** Agree with option 1. It keeps the split from 3.2: facts on the place, how it was found on the candidate. Say that a place the user specified counts as trusted, since `find_place` looked it up on Google.

**Settled (2026-10-11, 0451071).** Changed the rule instead: places found by web search use Google's hours and rating like any other place. Web search design section 4 updated.

### F12. The lists of what re-routes a leg are incomplete (wording fix)

**What happened.** In San Francisco change 1, the end place changed from Los Angeles to Mike's house. The last day's leg has to re-route. But "start or end place changes" isn't in the trigger lists in 3.3, 3.4, or 3.5 (**A1**). Unmarking a rest day re-routes too (3.1 says so), but it isn't in those lists either. 3.5 says "a day that stays put gains a leg when its first stop is selected." It needs "unless it is a rest day." Moab Day 3 got dinner at The Spoke and no leg. 3.1 says "the last day always has a leg," but it can't be routed until the start and end places are set.

**Docs.** Technical spec 3.1, 3.3, 3.4, 3.5.

**Recommendation.** Add the missing triggers and the exception. Say the last day's leg is empty until both places are set.

**Post-review analysis.**

- **Finding:** Agree.
- **Recommendation:** Agree. Also keep the trigger list in one place, 3.5, and have 3.3 and 3.4 point to it. Three copies is how they got out of step.

**Settled (2026-10-11, fbdb0a8).** Section 3.5 is the one list of re-route triggers, with the missing ones added. 3.3 and 3.4 point to it.

### F13. "Doesn't remember" shouldn't mean clearing (wording fix, plus a UI question)

**What happened.** The user wanted a substitute for Gifford Homestead and didn't remember the other two pie places. 3.2 tells the coordinator to clear. But a stop-scoped read gives it both names and rationales. Clearing threw them away and sent a new leg scout, which brought the same two back. The docs also don't say where option cards appear (chat or itinerary), or whether a selected stop's card can be reopened.

**Docs.** Technical spec 3.2, 5.2. Functional spec 7.5.

**Options.**
1. Have the coordinator list the earlier candidates from a scoped read, and clear only if the user turns them down.
2. Let the UI reopen the card for a selected stop.

**Recommendation.** Option 1 now. Settle option 2 with the UI design.

**Post-review analysis.**

- **Finding:** Agree. The "or if the user doesn't remember them" clause in 3.2 contradicts the 5.2 instruction to offer the earlier candidates first.
- **Recommendation:** Agree with option 1 now and option 2 with the UI.
- **Caveats:**
  - One more hole. If the user hears the earlier candidates and turns them down, `clear_selection` records only the selected place as rejected. The other two go away with the candidate list, so the next worker can bring them straight back.
  - Fix: have `clear_selection` also take the earlier candidates the user turned down, each with a reason. Make it a required list that can be empty, which keeps to the no-optional-inputs rule.

**Settled (2026-10-11, 5527e80).** Redesigned: reject_places replaces clear_selection. Rejection is per place, for the whole trip, permanent. Not being selected isn't a rejection, so the other candidates stay and the card shows what's left.

### F14. Tiers on meals that don't need one, and on user-named places that can't have one (needs a decision)

**What happened.** `add_stops` requires a tier on every meal. Coffee at Philz and cake at the Madonna Inn needed one, and the user's rule said nothing about coffee. The coordinator put "mid-range, trip default," which makes the worker hunt for mid-range coffee. The Whaling Station, a dinner the user named, needed a tier on the stop even though no worker would search. `select_user_place` takes no tier, but 3.2 says meal and lodging candidates hold a tier and rule, and functional spec 7.1 says each candidate shows one. So what does the Whaling Station card show? Also, functional spec 7.5 lists Higher and Lower tier on every card, but attractions have no tier.

**Docs.** Technical spec 3.2, section 9. Tool design 2.1 (`add_stops`, `select_user_place`). Functional spec 7.1, 7.5.

**Options.**
1. Add "any" as a meal tier the coordinator can choose. Say that user-named candidates show "your choice" instead of a tier. Hide the tier actions on attraction cards.
2. Keep tiers required. Tell the coordinator to pick the tier that fits the meal, such as value for coffee.

**Recommendation.** Option 1.

**Post-review analysis.**

- **Finding:** Partly agree. The Whaling Station card and the tier buttons on attraction cards are real gaps. The coffee tier isn't a problem.
- **Recommendation:** Split it.
  - **Coffee and cake:** option 2. The user gave a default tier. Applying it to coffee is what they said. A worker asked for mid-range coffee finds an ordinary coffee shop. An "any" tier adds a fourth value that has to be explained everywhere tiers are.
  - **User-named places:** agree. The card shows "your choice," not a tier. Don't copy the stop's tier onto it, since the Whaling Station may not be that tier.
  - **Tier buttons on attraction cards:** agree, hide them.

**Settled (2026-10-11, 5527e80).** Tier stays required on meals; a rule can cover a kind of meal (upscale coffee), otherwise the trip default. User-named places show "your choice". No tier buttons on attraction cards.

### F15. Removing a night always removes the stay's last day (needs a decision, low priority)

**What happened.** Dropping Moab to 2 nights removed Day 3, the rest day, after The Spoke was removed. That matched what the user wanted. If they had wanted to keep the rest day and drop the Arches day instead, the coordinator would have to empty Day 3, move its stops to Day 2, swap the rest-day flag, then drop the night. Also, the rest day the brief asked for disappeared, and no check noticed, because nothing compares rest days with the brief.

**Docs.** Technical spec 3.5. Tool design 2.1 (`update_stay`).

**Options.**
1. Let `update_stay` take which day to remove.
2. Keep it. Describe the shuffle in the coordinator's instructions.

**Recommendation.** Option 2 for now. Have the coordinator mention a lost rest day.

**Post-review analysis.**

- **Finding:** Agree.
- **Recommendation:** Agree with option 2.

**Settled (2026-10-11, fbdb0a8).** Option 2. The coordinator instruction covers losing a different day and mentions a lost rest day.

### F16. A stop's purpose can go stale after a move (wording fix, low priority)

**What happened.** Panorama Point's purpose is "stargazing, about 1 a.m." If it moved to Day 4's night block, it would still say 1 a.m. Milt's purpose is "lunch," but it now sits at 9 a.m. Purpose can't change, and a "more options" worker searches by it.

**Docs.** Technical spec 3.1 (stop), 3.1 examples, 5.3.

**Recommendation.** Keep clock times and meal names out of purposes ("stargazing," "casual burgers"). The block gives the time. Fix the example.

**Post-review analysis.**

- **Finding:** Agree about clock times. "About 1 a.m." in a purpose duplicates the block, and goes stale when the stop moves.
- **Recommendation:** Partly agree. Keep clock times out. Meal names are less clear-cut. "Breakfast" tells a worker what food to look for, not only when. I'd write the rule as "describe the food or the activity, not the time." That nudges toward "pancakes" or "burgers" without banning the word "breakfast." Fix the Panorama Point example.

**Settled (2026-10-11).** A purpose says what the stop is for, and the stop's time says when. No clock times or meal names in a purpose ("burgers and shakes," not "lunch"). Breakfast-style food is said as food ("pancakes"). Fix the examples, such as "stargazing, about 1 a.m."

### F17. The coordinator doesn't know today's date (needs a decision, low priority)

**What happened.** Functional spec 8 says to offer the forecast when a reopened trip moves into range. Nothing gives the coordinator today's date, and no check notes it. Nothing refuses a start date in the past either. In the new Moab session this didn't matter, because the trip is a year away.

**Docs.** Functional spec 8. Technical spec section 8.

**Recommendation.** Put today's date in the coordinator's session context. Have the weather check add a note when a stay's averages could now be a forecast.

**Post-review analysis.**

- **Finding:** Agree.
- **Recommendation:** Agree. Also have `update_itinerary` refuse a start date in the past, since code knows today's date.
- **Caveats:** A note that depends on today's date can change with no change to the plan. That bends "worked out from the plan after every change." It works if full reads compute it, and a new session starts with a full read. Settle it with F5.

**Settled (2026-10-11, 2a8a78c).** Today's date in the coordinator's context, a full read at the start of a new session with a "forecast now available" note, and a start date in the past is refused.

### F18. Keeping track of detour time (for the object model)

**What happened.** `add_stop_candidates` uses the detour "from `search_along_leg` when the place came from there." So the tool has to remember that search's results for the day. Also, the detour was measured against the route at the time. After later selections re-route the leg, it is out of date. That's harmless while the stop is proposed, but the card still shows it.

**Docs.** Technical spec 3.2. Tool design 2.1, 2.3.

**Recommendation.** Store the last along-leg results per day, as place ID → detour. Label the card's detour as of when it was offered.

**Post-review analysis.**

- **Finding:** Agree.
- **Recommendation:** I'd go simpler. Always work out detour time with one routing call per candidate, and drop the "from `search_along_leg`" path. That's about three basic calls per stop. It removes the stored search results, and measures each detour against the route as it is when the candidate is added. Keep the "as of when offered" label. The trade-off: the walker's version saves those calls. Your call.

**Settled (2026-10-11, 50e65a5).** Detour time is always worked out with one routing call when the candidate is added. Nothing stored.

### F19. Small wording fixes

- **F19.1** **Rejected places live in two places.** Functional spec 10.2 lists "rejected options and why" as trip memory. The technical spec stores them on the stop or stay. Keep only the stop or stay, plus trip memory for rejections that aren't tied to one, such as "stay out of this town."
- **F19.2** **"An open stretch ... that starts within the block"** (section 8) reads as "opens during the block." On that reading, Delicate Arch (open 24 hours) and the example park that opens at 6 a.m. would fail. Say instead: "the party can arrive at some time in the block and stay the visit time."
- **F19.3** **The Moab example's finished state has two open warnings.** Milt's and Gifford have no approvals. Say they're planted, or show how they were settled.
- **F19.4** **"One leg scout per leg"** (4.2) should be "per leg with stops along it." San Francisco Day 3 and Moab Day 5 need none.
- **F19.5** **Waypoints: 3.3 and the San Francisco example agree** on what matters. The Big Sur waypoint stays, code places it between Bixby Creek Bridge and Nepenthe, and it changes nothing there. One tension: 3.1 says it matters "before any stops are selected." With must-sees selected first, that's only true on a leg with no must-sees. Day 2 already had the elephant seals.
- **F19.6** **Approvals that no longer apply stay in the list.** Gifford's opening-hours approval was still stored after the selection was cleared. Say whether reads mark it as not applying.
- **F19.7** **Set numbers after a clear.** Say whether the next set is 0 again or continues. I assumed it continues (**A7**).
- **F19.8** **`set_stay_weather` takes the forecast or averages label from the worker,** but code picked the source. Code could set it.
- **F19.9** **`add_stay`'s tier is optional,** so a stay can have no tier. Say what the card and the tier note do then.
- **F19.10** **Madonna Inn as a dessert stop.** The San Francisco example names the hotel itself. Technical spec 6.4 says to use the venue's own listing when it has one, here its café. Use the café in the example.

**Post-review analysis.**

- **F19.1:** Agree. **Settled (2026-10-11, 5527e80).**
- **F19.2:** Agree, but settle it as part of F3, which replaces the rule. **Settled (2026-10-11):** goes away with the time blocks (see F2).
- **F19.3:** Agree. After the walk, Milt's moved to the morning and Gifford was swapped, so the example no longer shows the end state. Label the "assume" lines as the starting point of the test. **Settled (2026-10-11):** fixed in the example, committed 5358f71.
- **F19.4:** Agree. **Settled (2026-10-11, 50e65a5).**
- **F19.5:** Agree. Change "before any stops are selected" to "during the fill." **Settled (2026-10-11):** fixed in the example, committed 5358f71.
- **F19.6:** Agree. Settle it with F4. **Settled (2026-10-11, 0451071):** full reads mark each approval as applying or not.
- **F19.7:** Disagree with assumption A7. Work the set number out as one more than the highest set present, so nothing is stored. After a clear the list is empty, so the next set is 0. That follows the "worked out, not stored" rule at the top of technical spec section 3. **Settled (2026-10-11, 5527e80).**
- **F19.8:** Agree. Code works the label out from the stay's dates, with the same rule `stay_weather` uses. **Settled (2026-10-11, 2a8a78c).**
- **F19.9:** This breaks the no-optional-inputs rule. Make tier and rule required on `add_stay`. The coordinator already has the budget rules by the skeleton round. **Settled (2026-10-11, 5527e80).**
- **F19.10:** Agree. **Settled (2026-10-11):** fixed in the example, committed 5358f71.

---

## 2. Properties and rules touched

Items marked **(not in docs)** were needed by the walk but aren't stated anywhere.

**Trip**
- Owner. Name and region, worked out from the brief and the start month.
- Places, kept per trip and matched by Google place ID.
- Last set of check results, used to mark new or already known **(not in docs: where it's stored, per trip or per session)**.
- Last updated, for the home screen list **(not in docs)**.
- Sessions: date, short title, transcript (functional spec 10.1) **(not in technical spec)**.
- Rule: the trip comes from the session. No tool takes a trip ID.

**Trip brief**
- Region, route, or theme. Trip length (at most 14). Party (not passed to workers, F9). Interests and must-sees, with why. Max driving hours. Route preference. Rest days. Budget: default tier plus free-text rules. Meal preferences.
- Rule: changing the brief never changes the itinerary. Code reads it for checks.
- Rule: no check compares rest days with the itinerary **(not in docs)**.
- Stretch kinds (road fixed, places fixed) go in trip memory, not the brief (4.1).

**Itinerary**
- Start place, end place (each with a given name), start date.
- Stays in order. Days in order.
- Trip length = number of days. End date worked out. Over 14 days is refused.
- Created with only the last day. `add_stay` is refused until start, end, and date are set.
- Total driving time (functional spec 9.1), worked out **(not in technical spec)**.

**Stay**
- ID, place (usually a town), order.
- Nights, worked out from the days pointing to it. At least 1 **(not in docs)**.
- Dates, worked out **(not defined: first night only, or through the departure morning, F5)**.
- Lodging place, empty until selected. Lodging candidates. Rejected places with reasons.
- Tier, rule, and the nights it was set for. Optional on `add_stay` **(not in docs what an empty tier means)**.
- Weather text, its label (forecast or averages), and the place and dates it was written for. Out of date is worked out. Activities it was written for **(proposed, F5)**.
- Where the party sleeps is the lodging, or the town until a lodging is selected.
- Selecting or clearing the lodging re-routes the legs in, through, and out.
- Removal is refused while stops are on its days, or while any stop uses it as search area.
- Tier note when its nights differ from the nights set.

**Day**
- ID, order, date (worked out).
- Rest day flag. Only for a day that stays put, never a moving day or the last day.
- Points to a stay (none for the last day).
- Stops, ordered by block, then by order in the block.
- Leg, or none.
- Approvals: drive hours, route type, block fit (one per block).
- Location (functional spec 9.5) **(not in technical spec)**.
- Moving, staying put, and rest are worked out, except the rest flag.

**Leg** (value object on the day)
- From and to, worked out. To is tonight's lodging, the town, or the end place.
- Drive time, distance, route line: stored.
- Waypoints: place IDs in the coordinator's order. Code places them among the selected stops on each re-route **(not in docs whether the placement is stored)**.
- Route type, worked out from the approval or the brief.
- Last stop-order result: the best order and the time saved **(not in docs; must be stored, F10)**.
- Drive after the last stop, and which block it falls in **(not in docs, F2)**.
- Exists on a moving day and the last day, and on a day that stays put with at least one selected stop and no rest flag.
- Marking a rest day removes the leg and its waypoints.
- Re-routes when the stays, a stay's lodging, the selected stops, or the waypoints change. Also when the start or end place changes, and when a rest day is unmarked **(not in docs, F12)**.

**Stop**
- ID. Kind (meal or attraction), purpose, search area (a stay ID, or along the leg). All three are fixed.
- Time block (one of six), order in the block. Changing the block is a move.
- Selected place, candidates, rejected places with reasons.
- Status, worked out: empty, proposed, or selected.
- Tier and rule, required on meals.
- Drive time from the previous stop, stored with the leg. Cleared when the leg goes away **(not in docs)**.
- Approvals: opening hours (place, date, block, reason).
- Visit time: comes from the selected candidate, or 1 hour for meals. No stop-level value **(gap, F7)**.
- Next set number **(not in docs whether it resets after a clear)**.
- Search area must be the stay slept at or slept in that day, or the leg on a moving day. Along-leg stops can't change day. Code never reorders stops.
- Search area can become invalid after `add_stay` with no check **(gap, F1)**.

**Candidate** (value object on a stop or stay)
- Place, rationale, tier and rule (lodging and meals), how found and source link, notes, visit time (attractions), detour time (along-leg stops), set number.
- Never changes once written. A selected place must be a candidate.
- "Specified by the user" as a source. Tier for a user-named place **(not in docs, F14)**.
- Detour measured against the route at the time it was offered **(not in docs, F18)**.

**Place**
- Our ID, Google place ID (can be empty), coordinates, address.
- Google name. Given name, used only when Google has none (Mike's house).
- Type, set by the first candidate **(not in docs: type for a start or end place with no candidate)**.
- Rating, review count, price level, weekly hours (periods and descriptions), summaries, links.
- Short line, worked out from type, rating, price level, and area.
- Hours and rating are ignored when the candidate came from web search **(not in docs how; F11)**.

**Approval** (value object on a day or stop)
- Kind, value for that kind, reason. One per kind (block fit: one per block). Setting one replaces the old one.
- Drive hours and block fit compare by amount. Route type is a label.
- Opening hours applies only while place, date, and block match. Otherwise it stays stored but inactive **(not in docs whether reads mark it)**.

**Check result**
- Check, level (refused, warning, or note), subject (trip, stay, day, stop, block) **(subject not in docs)**, message, new or already known, approved or open **(not in docs whether approved ones are returned)**.
- Settings: 10% buffer, 1-hour block fit allowance, 15-minute stop-order minimum, 1 hour per meal, along-leg "few miles" end drop, `search_near` radius.

**Worker brief**
- Technical spec 5.3 list, plus the day ID for the leg scout.
- Proposed additions: each stop's block and neighbors, party, towns along the leg, and activities for the weather worker (F9).

**Memory item**
- ID (`mem_`), user or trip, text. Design deferred.

**Option card** (UI)
- Shows the newest set. Actions: select, more options, higher tier, lower tier.
- Where it appears, and whether a selected stop's card can reopen **(not in docs)**. Tier actions on attraction cards **(not in docs)**.

---

## 3. Step log

### Assumptions used

- **A1.** Changing the start or end place re-routes the first or last day (F12).
- **A2.** The coordinator holds warnings while it is mid-build, and raises what's still open at the end of its writes for the turn (F4).
- **A3.** Area and activity must-sees become purposes for workers. Only one-place must-sees are selected in the skeleton (F8).
- **A4.** The leg scout picks Atlas Obscura towns from the addresses in its along-leg results (F9).
- **A5.** The coordinator gathers weather activities from a stay-scoped read (F9).
- **A6.** The last set of check results is stored per trip (F4).
- **A7.** Set numbers continue after a clear.
- **A8.** A visit time the user changes goes into trip memory, and block fit approvals are sized to it (F7).
- **A9.** Hours that weren't planted are made up: the Boardwalk 11 a.m.–8 p.m., Point Lobos 8 a.m.–7 p.m., Mesa Farm Market 7 a.m.–6 p.m. Wednesdays, Hangar One has none on Google.

Places: SF `place_sf3k9m2x`, LA `place_ra7h2q4w`, Mike's house `place_mk8d5r3z`, Monterey `place_mr6t3p9c`, SLO `place_sv2y7f5h`, Big Sur `place_bs4v8n2t`, Grand Junction `place_gj7w3r5k`, Salt Lake City `place_sc4n8x2v`, Moab `place_mb6r3t9e`, Torrey `place_tr2k5y8h`, Dewey Bridge `place_dw8b3m6q`. Other IDs are given where they first appear.

### San Francisco to Mike's house

**Setup**

0. **UI and app.** The user clicks New trip. The app creates the trip, an empty brief, and an itinerary holding only the last day `day_x7k3m9qa`. Its leg can't be routed yet. The user sees an empty chat.

**Discovery**

1. **User:** "Pacific Coast Highway, San Francisco to LA, 3 days." **Coordinator:** `read_memory()` returns "usually my wife and me," "about 5 hours of driving," "local food, no hotel breakfast." *Memory read.* It confirms the party and 5 hours, and asks for dates, must-sees, and budget.
2. **User:** "May 13, 2027. Must-sees: the Santa Cruz Boardwalk (I rode the Giant Dipper as a kid) and the elephant seals. We always have dinner at the Whaling Station in Monterey. Mid-range. I like old planes."
   - `update_trip_brief` sets route "PCH, SF to LA," 3 days, 2 adults, interests, must-sees, max 5 h, scenic, no rest days, "mid-range by default," local meals. **Reply:** trip length 1 day vs 3, a warning (new). It is held (A2).
   - `find_place("San Francisco","CA")` and `find_place("Los Angeles","CA")`, then `update_itinerary(start: place_sf3k9m2x "San Francisco", end: place_ra7h2q4w "Los Angeles", start date 2027-05-13)`. **Storage:** the last day's leg is routed SF → LA, 6 h 05 m. **Reply:** Day 1 driving 6 h 40 m with buffer vs 5 h (new). Held.
   - `add_memory_item(trip, "SF → LA: road is fixed, Highway 1")` (4.1). *Memory write.*
   - **User sees:** "Got it." The trip is named "Pacific Coast Highway, May 2027."
3. **Change 1.** **User:** "We're ending at my friend Mike's place in Silver Lake, 2345 Example Ave." **Coordinator:** `find_place("2345 Example Ave","Los Angeles, CA")` returns `place_mk8d5r3z`, an address with no name or type. Then `update_itinerary(end: place_mk8d5r3z, name "Mike's house")`.
   - **Storage:** the end place changes, and the place gets the given name "Mike's house." The last day re-routes to 6 h 15 m (A1, F12). The place's type stays empty, since no candidate set it.
   - **Reply:** warnings already known.
   - **User sees:** "Ending at Mike's house in Silver Lake." A map pin.

**Shape:** skipped, because the road is fixed.

**Skeleton**

4. `find_place("Big Sur","CA")` returns `place_bs4v8n2t`. `compute_route([SF, "Monterey, CA", place_bs4v8n2t pass-through, "San Luis Obispo, CA", place_mk8d5r3z], keep)` returns 2 h 00, 3 h 05, and 3 h 40, plus what each name resolved to. The coordinator proposes Monterey and SLO, one night each. The user agrees.
5. `add_stay(place_mr6t3p9c, "first", 1, mid-range, "trip default")`. **Storage:** creates `stay_mt4k8z2e` and `day_h2v9r6ns` (Day 1). Re-routes Day 1 (2 h 00) and the last day (5 h 20). **Reply:** trip length 2 vs 3 (known). Day 2 driving 5 h 50 m vs 5 h (new). Held.
6. `add_stay(place_sv2y7f5h, after stay_mt4k8z2e, 1, mid-range, "trip default")`. **Storage:** creates `stay_s9q2w7ub` and `day_p5c8j3td` (Day 2, Fri May 14). The last day is now Day 3, Sat May 15. Re-routes Day 2 (2 h 20 on US-101) and Day 3 (3 h 40). **Reply:** both warnings went away.
7. `update_leg(day_p5c8j3td, [place_bs4v8n2t])`. Day 2 goes from 2 h 20 to 3 h 05, on CA-1. Day 1 gets no waypoint, because 4.2 says the Boardwalk pulls it to the coast (F6).
8. **Must-sees.** `find_place` for the Boardwalk, the Piedras Blancas elephant seal vista point, and the Whaling Station. The coordinator asks: "People usually spend about 3 hours at the Boardwalk. Does that sound right?" User: "2 hours." Seals: 45 minutes.
9. `add_stops(day_h2v9r6ns, afternoon, "first", [attraction, "Giant Dipper and boardwalk walk", along the leg])` returns `stop_k7m2x9qa`. Then `select_user_place(stop_k7m2x9qa, place_bw9k4e7g, "Santa Cruz Beach Boardwalk", "amusement park", "must-see: rode the Giant Dipper as a kid", 2 h)`. **Storage:** set 0, one candidate, specified by the user, selected. Day 1 re-routes SF → Boardwalk → Monterey: 2 h 00 to 2 h 20, via I-280 and CA-17. **Hours:** open long enough, nothing said.
10. `add_stops(day_h2v9r6ns, evening, "first", [meal, "dinner, a tradition", near stay_mt4k8z2e, mid-range, "trip default"])` returns `stop_r4t8w2zp`. Then `select_user_place(..., "The Whaling Station", "restaurant", "their dinner tradition")`. The candidate has no tier (F14). Day 1 goes to 2 h 25.
11. `add_stops(day_p5c8j3td, afternoon, "first", [attraction, "see the elephant seals", along the leg])` returns `stop_e6h3n9cv`. `select_user_place(..., 45 m)`. Day 2 goes to 3 h 10. Code places the waypoint between Monterey and the seals. **User sees:** the outline with stays, legs, and three selected stops.

**Fill**

12. The coordinator lays out the days, one `add_stops` per block. No routes change, because the stops are empty.
    - Day 1 morning: breakfast, old aircraft, coffee (along the leg; meals mid-range, "trip default"; F14 for coffee). IDs `stop_a3f7k2mu`, `stop_g8p4s6yd`, `stop_u2x5b9hr`.
    - Day 2 morning: breakfast near the Monterey stay, then a coastal walk and a Big Sur viewpoint along the leg (`stop_c9w3j7tn`, `stop_n5q8v2ke`, `stop_y3d6m4fs`).
    - Day 2 afternoon, "first": lunch with a view, along the leg (`stop_t7z2h5wb`).
    - Day 2 evening: dinner near SLO (`stop_f4j9r3xa`). Day 2 night: dessert near SLO (`stop_v6k2p8gm`).
13. The coordinator makes four `Agent` calls at once:
    - Monterey researcher: lodging, plus the Day 2 breakfast.
    - SLO researcher: lodging, dinner, dessert.
    - Leg scout for `day_h2v9r6ns`.
    - Leg scout for `day_p5c8j3td`.
    - No scout for Day 3, which has no stops (F19). The briefs carry no blocks or neighbors (F9).
14. **Workers.**
    - Monterey: `search_near(stay_mt4k8z2e, "hotels")`, then `add_stay_candidates`, which returns "Set 0: 3 candidates." `search_near(stop_c9w3j7tn, "breakfast")` returns hours for Fri May 14. `add_stop_candidates` adds First Awakenings and two others, with no detour.
    - SLO: hotels; Firestone Grill and two others; the Madonna Inn café for dessert.
    - Leg scout Day 1: `search_along_leg(day_h2v9r6ns, ...)` three times. Millbrae is about 15 miles out, so it isn't dropped. Hangar One comes from Google. An Atlas Obscura search on towns from the addresses (A4). `add_stop_candidates` works out detours from the along-leg results.
    - Leg scout Day 2: Point Lobos, about 7 miles from Monterey, survives the end drop. Also Bixby Bridge viewpoint and Nepenthe.
    - **Coordinator gets** one line per candidate, for example: "Hangar One, historic airship hangar, Moffett Field. Rationale: you like old planes. 6 minutes off 101."
    - **User sees:** option cards, and a chat summary.
15. **User selects** by clicking cards. Each click becomes a message, then `select_candidate`.
    - Monterey hotel: re-routes Days 1 and 2. The user says "the one with the bay view," so `add_memory_item(trip, ...)`. *Memory write.*
    - Day 1 picks: Day 1 ends at 2 h 45 m. Hangar One has no Google hours, so a note, "hours not known" (new). The coordinator mentions it once. The card says "Hours not confirmed." The stop-order check runs: no note.
    - Day 2 picks: Day 2 goes to 3 h 40 m. Code places the waypoint between Bixby and Nepenthe, where it changes nothing. Everything is within 5 h with buffer.

**Change 2: higher tier on the SLO hotel**

16. **UI:** "Higher tier" becomes the message "User asked for a higher tier for the San Luis Obispo hotel."
17. **Coordinator:** `update_stay(stay_s9q2w7ub, tier posh, rule "the user asked for a higher tier")`. **Storage:** tier, rule, and set for 1 night. Then `read_itinerary(scope: stay_s9q2w7ub)`, which returns all three set-0 candidates with rationales, to build the leave-out list. Then `Agent(stay researcher: stay_s9q2w7ub lodging only, posh, leave out the three)`.
18. **Worker:** `search_near(stay_s9q2w7ub, "luxury boutique hotel")`, then `add_stay_candidates`, which returns "Set 1: 2 candidates."
19. **User sees** a card showing set 1, with "posh, you asked for a higher tier." They select Hotel San Luis Obispo, so `select_candidate`. Day 2 re-routes to 3 h 41 and Day 3 to 3 h 39. The stop-order check runs: no note. The coordinator confirms in chat.

**Last day**

20. **User:** "On the last day, just get us to Mike's quickly." **Coordinator:** `update_day(day_x7k3m9qa, approve route type: fastest, "wants to get to LA quickly")`. There are no waypoints, so nothing re-routes. The leg shows "fastest."

**Weather**

21. **Coordinator:** a stay-scoped read of each stay gives its activities (A5). Then `Agent(weather worker, Monterey May 13 with its activities; SLO May 14 with its activities)`.
22. **Worker:** `stay_weather(stay_mt4k8z2e, place_mr6t3p9c)` returns seasonal averages, because May 2027 is too far out: "Typical for May 6–20, 2016–2025: high 66, low 49." Then `set_stay_weather(..., averages)`, which stores the text with its place and dates. The same for SLO. The worker returns two lines. **User sees** weather per stay, labeled, with the Open-Meteo credit.

**Change 3: add Big Sur, then remove it**

23. **User:** "Add a night in Big Sur between Monterey and SLO." **Coordinator:** `add_stay(place_bs4v8n2t, after stay_mt4k8z2e, 1, mid-range, "trip default")`.
    - **Storage:** creates `stay_b6g3y8rx` and `day_w4n7e2fk` as Day 2. The old Day 2 becomes Day 3 (Sat), and the last day becomes Day 4.
    - **Re-routes:** Day 2, Monterey hotel → Big Sur, 50 m. Day 3, Big Sur → Monterey breakfast → … → hotel, 3 h 41 to 5 h 15.
    - **Reply:** new warnings: trip length 4 vs 3, and Day 3 driving 5 h 47 vs 5 h. New note: SLO weather out of date. No stop-order note, and nothing about First Awakenings' search area (F1). The new Big Sur stay has no weather and no note (F5).
24. **Coordinator:** explains that the trip becomes 4 days, and that Day 3 now backtracks for breakfast, Point Lobos, and Bixby. It suggests moving breakfast to the Big Sur day and redoing the other two as Big Sur-day stops. It moves nothing yet.
25. **User:** "Never mind, skip Big Sur." **Coordinator:** `remove_stay(stay_b6g3y8rx)` is allowed, because no stops are on its day or use it as search area.
    - **Storage:** the day is gone, and Day 2 starts from the Monterey hotel again. It re-routes from 5 h 15 back to 3 h 41. The waypoint stayed on Day 2 the whole time.
    - **Reply:** went away: the trip length warning, the driving warning, and the SLO weather note, since its dates match again. No weather rerun.
    - `add_memory_item(trip, "Considered a Big Sur night, decided against")`. *Memory write.*
    - What happens if the stops had been moved is traced in F1.

**End state** matches the 3.1 example. The differences: SLO is posh from the user's click, and Day 1 is still labeled scenic on US-101 (F6).

### Grand Junction to Salt Lake City

**Setup**

0. **App:** new trip. The itinerary holds only the last day `day_z5r8k2nf`.

**Discovery**

1. **Change 1.** **User:** "Utah red rock. Flying into Grand Junction, out of Salt Lake City. Five days from October 10, 2027."
   - `read_memory()`. *Memory read.*
   - `update_trip_brief(route "Utah red rock parks, GJ to SLC", 5 days)`. **Reply:** trip length 1 vs 5, a warning (new). Held.
   - `find_place` for both cities, then `update_itinerary(start: place_gj7w3r5k, end: place_sc4n8x2v, start date 2027-10-10)`. The last day (Sun Oct 10) is routed GJ → SLC, 4 h 15.
2. **Coordinator** asks the rest. **User:** "My wife and me. 4 hours max, scenic. Must: sunrise at Delicate Arch, Goblin Valley, Capitol Reef, and stargazing. Value by default, mid-range where we stay 2+ nights. One rest day. Casual food."
   - **Coordinator** asks (section 9) whether the 2+ nights rule covers meals. **User:** "Just hotels. Food casual, plus one special dinner in Moab."
   - `update_trip_brief(...)` saves budget "value by default; mid-range lodging for 2+ nights; meals value; one special dinner in Moab." **Reply:** Day 1 driving 4 h 40 vs 4 h (new). Held.

**Shape** (the route between Moab and SLC is open)

3. **Coordinator** makes one `compute_route` per sketch:
   - Moab 3 nights + Torrey 1 night: 1 h 50, 2 h 25, 3 h 25.
   - Moab 4 nights: last day 3 h 50.
   - Moab 3 nights + Green River 1 night: 1 h 50, 50 m, 3 h 00.
   - **User sees** three named sketches in chat, and picks "Moab and Capitol Reef."
   - `add_memory_item(trip, "Places fixed: Moab, Torrey")`. *Memory write.*

**Skeleton**

4. `add_stay(place_mb6r3t9e, "first", 3, mid-range, "lodging for stays of 2+ nights")`. **Storage:** creates `stay_m9b4t6xq` and Days 1–3 (`day_d2h7w3ka`, `day_j6s9e4vu`, `day_r3n8p5cy`). Re-routes Day 1 (1 h 50) and the last day (3 h 50). **Reply:** trip length 4 vs 5. Day 4 driving 4 h 13 vs 4 h. Held. Is this the same result as the old Day 1 driving warning, or a new one? (F4)
5. `add_stay(place_tr2k5y8h, after Moab, 1, value, "trip default")`. **Storage:** creates `stay_t8c3x7gw` and `day_f7u4m2bh` (Day 4, Wed Oct 13). The last day is Day 5, Thu Oct 14. Re-routes Day 4 (2 h 25) and Day 5 (3 h 25). **Reply:** both warnings went away.
6. `update_day(day_r3n8p5cy, rest day: true)`. There was no leg to remove.
7. `find_place("Dewey Bridge","UT")` returns three matches, and the coordinator checks the addresses. `update_leg(day_d2h7w3ka, [place_dw8b3m6q])`: Day 1 goes from 1 h 50 to 2 h 05, on UT-128.
8. **Must-sees.** Delicate Arch and Goblin Valley are one place each. Capitol Reef and stargazing become purposes for the fill (A3, F8). Visit times confirmed with the user: 3 h and 1.5 h.
9. `add_stops(day_j6s9e4vu, early morning, "first", [attraction, "sunrise hike to Delicate Arch", near Moab])` returns `stop_d4a7r9cz`. `select_user_place(..., 3 h)`. **Storage:** Day 2 gains a leg: Moab → trail → Moab, 50 m. **Hours:** open 24 hours, so open long enough. Nothing is said. *(Hours result 1 of 4.)*
10. `add_stops(day_f7u4m2bh, morning, "first", [attraction, "Goblin Valley", along the leg])` returns `stop_g5n2z8ht`. `select_user_place(..., 1.5 h)`. Day 4 goes from 2 h 25 to 3 h 45. **Reply:** Day 4 driving 4 h 08 vs 4 h (new).
11. **Change 3.** **Coordinator:** "Day 4 needs about 4 h 10 m with a 10% buffer, against your 4 hours. It'll be nearer 5 once Capitol Reef stops are in. You could skip Goblin Valley, add a Hanksville night (6 days), or accept a longer day." **User:** "Longer is fine. We want Goblin Valley and Capitol Reef on the way." `update_day(day_f7u4m2bh, approve drive hours: 5, reason)`. The warning is accepted. The must-see surfaced the problem before the fill.

**Fill**

12. **Layout:**
    - Day 1 afternoon: a red rock stop on the river road, along the leg (`stop_q8f3w6nk`). Day 1 evening: dinner near Moab, value, "meals: value" (`stop_b5e9t2hx`).
    - Day 2 morning: an Arches highlight and a late breakfast (`stop_w2k6y8jm`, `stop_h9v3n5ps`). Afternoon: lunch and a hike outside the park (`stop_m6t2q8ea`, `stop_c3x7u4gf`). Evening: the special dinner, posh, "one special dinner in Moab" (`stop_s8j5b2wy`).
    - Day 3 (rest) evening: dinner near the hotel (`stop_p7r4e9kv`).
    - Day 4 afternoon, along the leg: "pie in Capitol Reef" (value) and "Capitol Reef Scenic Drive" (`stop_e9c4k3uq`, `stop_x6w9f2rd`).
    - Day 5 overnight: "stargazing, about 1 a.m.", near Torrey (`stop_n3p8j5ta`).
13. **Coordinator** makes four `Agent` calls: the Moab researcher, the Torrey researcher, a leg scout for Day 1, and a leg scout for Day 4. There is no scout for Day 2 (stays put), Day 3 (rest), or Day 5 (nothing along the leg).
14. **Workers.**
    - Leg scout Day 1: `search_along_leg` finds little on UT-128. `WebSearch("Castle Valley Utah unusual places", allowed_domains atlasobscura.com)` is let through by the hook and finds Fisher Towers (A4). `find_place` gives the pin. `add_stop_candidates` works out Fisher Towers' detour with one routing call.
    - Moab researcher: hotels; Windows, Love Muffin, Milt's (Mon: 7 AM–12:30 PM), Corona Arch, Desert Bistro (posh), The Spoke, Moab Brewery. Its result flags: "Milt's closes 12:30; your lunch slot is in the afternoon."
    - Torrey researcher: motels, Panorama Point, Sunset Point.
    - Leg scout Day 4: Gifford Homestead ("Wed Oct 13: Closed"), Mesa Farm Market in Caineville, and Duke's in Hanksville. Torrey's cafés are dropped as too close to the end of the leg. No hours warning comes back in the result (F9). For the Scenic Drive: Capitol Gorge, Hickman Bridge, Goosenecks.
15. **Selections. Change 2, the four hours results.**
    - **Fisher Towers** (`select_candidate`): Day 1 goes from 2 h 05 to 2 h 15. Dewey Bridge is placed before it. It was found by web search, so a note, "hours not known" (new) (F11). The card says "Hours not confirmed." No approval is needed. The coordinator mentions it once. *(Hours result 2 of 4.)*
    - **Moab hotel:** re-routes Days 1, 2, and 4. "The one with the hot tub" goes to trip memory. *Memory write.*
    - **Day 2 picks:** Day 2 goes to 1 h 50.
      - **Milt's** in the afternoon gets a warning (new): "Milt's closes at 12:30 p.m. It's about 5 minutes from your previous stop, so allow extra time for traffic." *(Hours result 3 of 4.)*
      - A stop-order note (new): "A faster order saves 20 minutes. It moves Corona Arch from the afternoon to the morning."
      - The coordinator offers to move Milt's, swap it, or keep it. **User:** "Move it to the morning." `move_stop(stop_m6t2q8ea, day_j6s9e4vu, morning, after stop_h9v3n5ps)`. **Reply:** the Milt's warning went away. The stop-order note is already known.
      - The coordinator mentions stop order once ("puts lunch late, I'd keep it"). The user keeps the order. Saved to trip memory (F4). *Memory write.* Milt's purpose still says "lunch" (F16).
    - **The Spoke** on the rest day: no leg, so no re-route. Block fit counts 1 hour with no drive time.
    - **Capitol Gorge:** Day 4 goes to 4 h 15, which is 4 h 41 with buffer, under the approved 5. Its hours are a note (no Google hours).
    - **Gifford Homestead:** Day 4 goes to 4 h 25 (4 h 52 with buffer). A warning (new): "Closed: Gifford Homestead is closed Wednesdays, and you're there Wed Oct 13." *(Hours result 4 of 4.)*
      - **User:** "Keep it, maybe they'll be open." `update_stop(stop_e9c4k3uq, approve opening hours, "wants to try anyway")`. The tool records Gifford, Oct 13, and afternoon. The warning is accepted.
      - **User**, later: "Actually, find another pie place." The coordinator asks about the other two. **User:** "I don't remember them." Per 3.2: `clear_selection(stop_e9c4k3uq, "closed Wednesdays, the day we're there")`. **Storage:** the selection and three candidates are removed, and Gifford goes into rejected places. The approval stays stored but no longer applies. Day 4 goes back to 4 h 15. **Reply:** the Gifford warning went away. (F13: a stop-scoped read would have given the two names.)
      - `Agent(leg scout Day 4, stop_e9c4k3uq, "pie in Capitol Reef", value, leave out Gifford: "closed Wednesdays")`. It returns set 1 (A7): Mesa Farm Market, Duke's, and Stan's. The old two are allowed back. **User sees** the new card, and leaves it for later.
    - **Panorama Point:** Day 5 is routed Torrey hotel → Panorama Point → SLC, 3 h 45. Open 24 hours. It's in the overnight block, after midnight, so it belongs to Day 5.
    - **Torrey hotel:** re-routes Days 4 and 5.

**Weather**

16. **Coordinator:** stay-scoped reads, then `Agent(weather worker)`.
    - Moab (Oct 10–12): Fisher Towers from Day 1's leg, the sunrise hike, and the rest.
    - Torrey (Oct 13): Goblin Valley, Capitol Gorge from Day 4's leg, and Panorama Point at 1 a.m. on Oct 14.
17. **Worker:**
    - Moab: `stay_weather` returns "high 72, low 43, freezing nights 4%." `set_stay_weather`: "Sunrise at Delicate Arch near 40 °F. Warm layer, gloves, headlamp."
    - Torrey (6,800 ft): "low 32, freezing nights 48%." "1 a.m. stargazing: winter coat, hat, gloves."
    - Torrey's dates are only Oct 13, but stargazing is on Oct 14 (F5).

**Change 4: start one day later**

18. **User:** "Start October 11 instead." `update_itinerary(start date 2027-10-11)`.
    - **Storage:** every date moves (Mon Oct 11 – Fri Oct 15). Nothing re-routes. The hours check reruns: Day 4 is now Thursday, but the pie stop has no selection. The approvals stay on their days.
    - **Reply:** Fisher Towers and Capitol Gorge notes are known. New notes: Moab and Torrey weather out of date.
    - **Coordinator:** "Done. By the way, Gifford Homestead is open Thursdays." User: "No, fine."
    - **End of turn:** the coordinator reruns the weather worker for both stays, and the notes clear. This was a rerun for a one-day shift (F5).

**Change 5: Moab to 2 nights, then a 5-hour hike**

19. `update_stay(stay_m9b4t6xq, nights 2)` is **refused**: "Day 3 (Wed Oct 13) holds stops: The Spoke on Center (stop_p7r4e9kv)."
20. **Coordinator:** "That removes Day 3, your rest day, and dinner at The Spoke. Drop it, or move it to Day 2?" **User:** "Drop it." `remove_stops([stop_p7r4e9kv])`. Then `update_stay(stay_m9b4t6xq, nights 2)`.
    - **Storage:** `day_r3n8p5cy` is removed. The Torrey day becomes Day 3 (Wed Oct 13), and the last day becomes Day 4 (Thu Oct 14). Day 3 re-routes, unchanged.
    - **Reply:** new warning: trip length 4 vs 5. New notes: Moab tier set for 3 nights, now 2; weather out of date for both stays.
    - Had Gifford been kept, its approval (Gifford, Oct 13, afternoon) would apply again here.
21. **User** agrees to 4 days. `update_trip_brief(trip length 4, rest days 0)`: the warning goes away. `update_stay(stay_m9b4t6xq, mid-range, "lodging for stays of 2+ nights")`: it records 2 nights, and the note clears. The tier is the same, so nothing to ask (section 9).
22. **User:** "A 5-hour hike in Arches, Day 2 morning." `add_stops(day_j6s9e4vu, morning, after stop_w2k6y8jm, [attraction, "long hike in Arches, about 5 hours", near Moab])` returns `stop_v2h7c4me`. Then `Agent(Moab researcher, that stop only)`.
23. **Worker:** `add_stop_candidates`: Devils Garden (4.5 h, an estimate), Fiery Furnace (3 h, "permit needed"), Tower Arch. Set 0.
24. **User** picks Devils Garden. `select_candidate`: Day 2 goes from 1 h 48 to 2 h 20.
    - **Reply:** new warning: block fit for the Day 2 morning, about 8 h 50 against 4 h + 1 h.
    - Milt's, fourth in the morning, still passes the hours check (F3). The stop-order note changes.
    - **User:** "Plan 5 hours for the hike." No tool can do this (F7). Saved to trip memory (A8). *Memory write.*
25. **Coordinator:** "Milt's will be closed when you're off the trail. Drop Windows and Love Muffin, and eat at Milt's before the hike?" **User:** yes.
    - `remove_stops([stop_w2k6y8jm, stop_h9v3n5ps])`, then `move_stop(stop_m6t2q8ea, day_j6s9e4vu, morning, "first")`.
    - **Reply:** block fit morning about 6 h 25, still over (already known). Stop-order note (new): "saves 25 minutes, moves Milt's to the early morning, before Delicate Arch." The coordinator ignores it, since Milt's isn't open before sunrise.
    - **Coordinator:** "The morning runs about 7 hours with the hike. OK?" **User:** yes. `update_day(day_j6s9e4vu, approve block fit: morning, 7 h, "long Devils Garden hike")`. The warning is accepted.
26. **End of turn:** the coordinator reruns the weather worker for both stays, now including the hike. The notes clear.

**Change 6: a new session the next day**

27. **User** opens the trip and starts a new session. **Coordinator:** `read_trip_brief()`, `read_memory()` (stretches, hot tub, stop order kept, hike 5 h), and `read_itinerary()` (whole). Results come back known (A6). Open items: the pie stop is proposed, and three places have unconfirmed hours. *Memory read.*
28. **User:** "Why did we pick that Moab hotel?" **Coordinator** answers from the selected lodging's rationale, which is in the whole read, plus trip memory: "It was offered as quiet and walkable to Main Street. It's mid-range under your rule for 2+ night stays, which still holds at 2 nights. You picked it for the hot tub."
29. **User:** "What's left to decide?" **Coordinator:** "The pie stop on Day 3: Mesa Farm Market, Duke's, or Stan's. Also, Fisher Towers, Corona Arch, and Capitol Gorge have no posted hours, so check before you go."
30. **User** picks Mesa Farm Market. `select_candidate(stop_e9c4k3uq, ...)`: Day 3 goes to 4 h 20 (4 h 46 with buffer, under 5). The hours are fine (A9). The trip is finished.

**End state** differs from the 3.1 example on purpose, because of the changes:
- Starts Oct 11, with Moab at 2 nights and no rest day. The trip is 4 days.
- Milt's is in the morning. Windows and Love Muffin are gone, and Devils Garden is added.
- Mesa Farm Market replaces Gifford.
- The Day 4 drive hours approval carried over to what is now Day 3.

### Check results seen, and what the coordinator did

| Result | Level | Repeats on later writes? | Coordinator |
|---|---|---|---|
| Trip length vs brief, mid-build | Warning | Until the build finishes | Held (A2) |
| Trip length after Big Sur, or after Moab drops a night | Warning | Until the brief is updated or the night removed | Raised once |
| Daily driving, Moab Day 4 | Warning | Every Day 4 write, marked approved after approval | Raised once, approved at 5 h |
| Hours not known (Hangar One, Fisher Towers, Capitol Gorge) | Note | Every write to that day, marked known | Mentioned once |
| Open but not long enough (Milt's) | Warning | Until moved | Raised, stop moved |
| Closed (Gifford) | Warning | Until approved, then until cleared | Raised, approved, then cleared |
| Block fit (Moab Day 2 morning) | Warning | Until approved | Raised, approved at 7 h |
| Stop order (Moab Day 2) | Note | Every re-route, marked known | Raised once, kept; trip memory |
| Weather out of date | Note | Until the rerun | Not raised; reran at end of turn |
| Stay tier for different nights | Note | Until the tier is set again | Tier set again quietly |
