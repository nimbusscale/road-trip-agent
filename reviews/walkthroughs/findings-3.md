# Walk-through 3: findings

> **Snapshot, out of date.** This is the output of design walk-through 3, from 2026-10-11. It describes the design as it was then. The design changed after it, so much of this no longer matches. The current design is in `design/`. Anything still open is in `research/domain-model-notes.md`. See `reviews/walkthroughs/README.md`.

This is technical spec open question 4. I walked both examples in technical spec section 3.1 from an empty trip, using only the files in `design/`. Tool replies, drive times, and place details are made up. Hours marked "assume" in the examples are used as if Google returned them.

Made-up facts used in the walk, beyond the examples:

- San Francisco trip brief: max driving 5 hours a day, mid-range by default with no other rules, local food over hotel breakfast.
- Moab: the user says Moab meals count under "mid-range for stays of 2+ nights."
- Assumed hours (Google): Santa Cruz Boardwalk 11 a.m. to 7 p.m. Love Muffin Cafe 7 a.m. to 2 p.m. Milt's 11 a.m. to 12:30 p.m. every day. The Hanksville pie place that replaces Gifford is open every day 7 a.m. to 8 p.m. Panorama Point has no hours on Google.

---

## Review groups

Added after the walk, by the reviewing session. Related findings are grouped so each group can be settled and committed together. The groups are in the order to discuss them. F16's bullets are numbered F16.1 to F16.5 so they can be placed in groups.

1. **The day's schedule while stops are empty:** F1, F8, F7, F13, F16.5, and F9 (moved here from group 3 during the review). Touches technical spec section 3.1 (the schedule rules) and section 8 (the opening-hours check and the late check), and tool design section 2.1 (`update_stop`, `select_candidate`, `read_itinerary`).
2. **Rejections, selections, and moving stops:** F2, F10, F5, F16.1, F16.3. Touches technical spec sections 3.2, 3.5, and 5.1, and tool design sections 2.1 and 2.3.
3. **Check results and approvals:** F4, F12, F16.4. Touches technical spec sections 3.5, 5.2, and 8.
4. **Weather:** F3, F15. Touches technical spec sections 3.5, 4.2, and 6.3, tool design sections 2.1 and 2.5, and Open-Meteo design section 2.3.
5. **Workers, worker briefs, and place lookups:** F6, F11, F14, F16.2. Touches technical spec sections 4.2, 5.2, 5.3, and 6, and tool design sections 2.1, 2.3, and 2.4.

---

## 1. Findings

### F1. A stop with no place takes no time, so times are wrong all through the fill (needs a decision)

**What happened.** On San Francisco Day 2, the coordinator lays out seven empty stops. Nothing is selected yet, so every stop takes no time (technical spec section 3.1, "A stop with no selected place takes no time"). The schedule puts Point Lobos, Bixby, Nepenthe, and Piedras Blancas all at 8:00 a.m. The worker brief passes on "each stop's time in the day's schedule" (technical spec section 5.3). So the leg scout is told the Nepenthe stop is at 8:00 a.m. The leg scout is told to "check hours against each stop's date and time" (technical spec section 6.2). Nepenthe opens late morning, so by the rules it looks closed.

The purpose can't help either. It must never say when, so "lunch" is not allowed (technical spec section 3.1, "A meal is just a meal"). The only sign that the Nepenthe stop is lunch is its position between two attractions.

The same gap shows up twice more:

- **A duration the user gives for a stop nobody has filled has nowhere to go.** On Moab Day 2 the user asks for "a 5-hour hike in Arches." `update_stop` rejects a visit time while no place is selected (tool design section 2.1). When the user later selects a candidate, `select_candidate` copies the worker's estimate (say 4 hours). The coordinator has to remember the user's 5 hours and set it again.
- **Warnings arrive late.** The 5-hour hike pushes Love Muffin past closing, Milt's past closing, and dinner 1 hour 45 minutes late. None of this shows until the place is selected. The user only hears about it after picking a trail.

**Touches:** technical spec section 3.1 (schedule rules), section 5.3 (worker brief), section 6.1 and 6.2 (worker instructions); tool design section 2.1 (`update_stop`, `select_candidate`).

**Options:**

1. Let an empty stop hold a planned visit time. The coordinator sets it when it lays out the day, with one hour for a meal as the default. The schedule uses it until a place is selected. Selecting a place keeps a visit time the user gave, and otherwise uses the candidate's estimate. The stop would need to know whether its visit time came from the user.
2. Keep empty stops at no time, but stop passing clock times for empty stops in the worker brief. Pass "after Bixby Creek, before Piedras Blancas," and let the worker judge hours from the along-leg search's drive time from the leg's start.
3. Leave it as is, and tell workers to ignore times on empty stops.

**Recommendation:** option 1. It fixes the worker brief, the hours check, and the 5-hour hike at once. Drive times to empty stops would still be missing, so label the times on a day with empty stops as rough.

**Post-review analysis.** Agree. Technical spec section 3.1 says an empty stop takes no time. Technical spec section 5.3 puts each stop's scheduled time in the worker brief. Together they give every empty stop on a fresh day the same time, so the walker is right that the leg scout would check Nepenthe's hours for 8 a.m.

I agree with option 1, with one change. The coordinator shouldn't have to give every empty stop a planned time. That would be a new input on `add_stops`, and our tool design principle is that code works out values the model doesn't need to handle. Instead, code gives an empty stop a default visit time by kind. A meal gets one hour, the same as `select_candidate` uses. An attraction gets a setting, such as 1.5 hours. The coordinator sets a visit time on an empty stop only when the user gives one, such as "a 5-hour hike." So `update_stop` would accept a visit time on an empty stop.

Caveat: the stop then has to know whether its visit time came from the user. Otherwise `select_candidate` would overwrite the user's 5 hours with the worker's 4-hour estimate. That is one more stored property, for the object model.

An add-on, not a replacement: the purpose can say how long, as long as it doesn't say when. "A long hike in Arches, about 5 hours" is a valid purpose. The worker then looks for trails that fit 5 hours.

I agree that times on a day with empty stops should be labeled rough. Empty stops along the leg still have no drive time.

**Settled (2026-10-11):** fix it in the worker brief, not on the stop. No new property and no new tool input. Rough times, a default visit time, and a time object marked fixed or about were all considered and dropped.

1. Technical spec section 5.3: for an empty stop, the worker brief says in plain words roughly when the coordinator expects it, such as "they leave at 10:30, so this is lunch, around noon." It doesn't pass the stop's time from the schedule. The worker brief is written fresh and not stored, so the rule that a purpose never says when doesn't apply to it.
2. Technical spec section 3.1: in the schedule, an empty stop shows no time ("time set once a place is picked"). Selected stops keep their worked-out times.
3. Technical spec section 3.1: a purpose can say how long, but never when, such as "a long hike in Arches, about 5 hours." The worker's estimate follows it, and `select_candidate` copies the estimate.

Accepted costs: no warnings about a stop until its place is picked, and in a later session the coordinator works out when an empty stop happens from its position in the day.

### F2. Rejection is permanent, but the docs' own example rejects a place for a reason tied to one day (needs a decision)

**What happened.** Day 4 of the Moab trip falls on a Wednesday. Gifford Homestead is closed on Wednesdays. The user asks for a substitute. The docs' own example of a rejection is "skip Gifford, it's closed that day" (technical spec section 3.2). So the coordinator calls `reject_places` for Gifford with the reason "closed on Wednesdays, our Day 4." Then the user moves the trip one day later. Day 4 is now a Thursday, and Gifford is open. But the rejection is permanent for the trip. Gifford is gone from every search, and `select_user_place` refuses it.

Two related gaps:

- **There is no tool to clear a selection without rejecting the place.** Technical spec section 5.1 says the coordinator can "clear a stop's or lodging's selection." Tool design section 2.1 has no tool for it. The only way to clear a selection is `reject_places`. If the user says "leave lunch open for now," the coordinator can't do it without rejecting the place for the whole trip.
- **Candidate notes go stale when dates move.** The leg scout wrote "closed Wednesdays, and you're there on a Wednesday" in a candidate's notes (technical spec section 3.2 gives this exact style). Candidates never change. After the date move, the remaining cards for that stop still show notes written for a Wednesday.

**Touches:** technical spec section 3.2 (rejections, candidate notes), section 5.1 (coordinator tools), section 5.2 ("When the user turns down a place"); tool design section 2.1 (`reject_places`, no clear tool).

**Options:**

1. Keep rejection for "never offer this again," and add a `clear_selection` tool for everything else. Change the Gifford example to selecting a different candidate from the card. Tell the coordinator to reject only when the user's reason is about the place, not the day.
2. Let a rejection hold a scope: the whole trip, or one stop. A rejection for one stop goes away with the stop.
3. Keep it as is, and let the coordinator "unreject" when dates move. This needs a new tool and a rule for when.

**Recommendation:** option 1. For notes, have workers write the place's hours ("closed Wednesdays") and leave "you're there on a Wednesday" to the opening-hours check, which is worked out fresh.

**Post-review analysis.** Agree with the main point. One part needs a correction.

- **The Gifford example is the wrong example.** In the last round we settled that a rejection is about the place, for the whole trip, and permanent. "Skip Gifford, it's closed that day" (technical spec section 3.2) is about the day, not the place. So the example should change. The coordinator's instructions (technical spec section 5.2, "When the user turns down a place") should say that a reason about the date or time isn't a rejection. In the walk, the user wanted "something else for pie." `select_candidate` on one of the other two pie places does that with no rejection at all, because selecting a different candidate replaces the selection.
- **The missing clear tool is leftover wording, not a missing tool.** We removed `clear_selection` on purpose last round and folded clearing into `reject_places`. Technical spec section 5.1 still says the coordinator can "clear a stop's or lodging's selection." That sentence should go. I would not add the tool back. If the user says "leave lunch open for now," the coordinator can leave the selection as it is, or select something else later. If a real need turns up, we add it then.
- **Stale candidate notes: agree.** Candidates never change, so a note that names a trip date goes stale when dates move. Notes should hold facts about the place, such as "closed Wednesdays." How those facts meet the trip's dates belongs in the worker's result, which is read once, and in the opening-hours check, which is worked out fresh. This touches the notes example in technical spec section 3.2 ("closed Mondays, and you're there on a Monday") and the worker instructions in technical spec sections 6.1 and 6.2.

Option 2 (a rejection for one stop only) would undo last round's decision, so I would not pick it.

**Settled (2026-10-11):** as proposed in the analysis. The Gifford example changes; a reason about the date or time is answered by selecting another candidate; the leftover "clear a selection" sentence in technical spec section 5.1 goes; notes hold facts about the place, never the trip's dates.

### F3. The weather round runs before anything is selected, and "activities" isn't defined well enough to tell when it is out of date (needs a decision, and for the object model)

**What happened.** Technical spec section 4.2 runs weather and clothing right after the fill. At that point the workers have added candidates, but the user hasn't selected anything. So most attraction stops have no place. `stay_weather` returns "its attraction stops, each with its place, date, and time" (tool design section 2.5). An empty stop has no place and, per F1, no real time.

Then the user starts selecting. Technical spec section 3.5 marks the weather out of date when an attraction stop "gets a different place." If going from no place to a place counts, every stay's weather goes out of date during the selections. The coordinator reruns the weather worker for all of them. The first weather round was wasted.

There is a second gap. The weather text records "the place, dates, and activities it was written for" (technical spec section 3.1, Stay). The docs don't say what an activity record holds. `stay_weather` returns each activity with its date and time. If the stored record holds dates and times:

- Moving the Moab trip by one day changes every activity's date. That would mark the weather out of date, even though the seasonal-averages window rule says a one-day move should rerun nothing (technical spec section 3.5).
- Planning 5 hours at the Boardwalk instead of 2 changes later stops' times. That isn't on the list of changes that count.

**Touches:** technical spec section 3.5 (weather out of date), section 4.2 (round 5), section 6.3; tool design section 2.1 (`set_stay_weather`) and section 2.5 (`stay_weather`).

**Options:**

1. Run the weather round after the user has made most selections, not right after the fill. Say that a stop going from empty to selected counts as a change.
2. Run it after the fill, as now, and write for each empty stop's purpose ("a short hike in Capitol Reef"). Say that a first selection doesn't count as a change. Only a selected stop that gets a different place counts.
3. Leave it as is.

**Recommendation:** option 2, because the user sees clothing advice early. Either way, define the stored activity record as the stop ID and its place ID only, with no dates or times. Dates are covered by the stay's own dates and the window rule.

**Post-review analysis.** Agree that both gaps are real. I'd pick option 1, not the walker's option 2.

- **When the weather round runs.** Technical spec section 4.2 round 4 ends when the workers add candidates, before the user selects anything. Round 5 runs "after the fill." Running the weather worker on mostly empty stops gives clothing advice for activities nobody has picked. It also can't catch a far-off place, such as Tuolumne Meadows on a Yosemite stay (tool design section 2.5), because an empty stop has no place to look up. Reruns are cheap: Open-Meteo is free, and the worker writes a short text. So it's better to run the weather worker once most selections are made, and to count a first selection as a change. Option 2 needs a special rule that a first selection doesn't count, which is one more rule to get wrong.
- **What a saved activity holds: agree.** Make it the stop ID and the place ID, or the stop ID alone for an empty stop. No dates or times. The stay's dates already cover the date side through the window rule, and times shift with every visit-time change.

Caveat: without times, moving stargazing from 1 a.m. to 9 p.m. wouldn't mark the weather out of date, though a 9 p.m. sky is warmer. I think that loss is small enough to accept.

**Settled (2026-10-11):** as proposed in the analysis. The weather round runs once most selections are made; a first selection counts as a change; a saved activity is its stop ID and selected place ID, with no date or time.

### F4. Which check results count as "the same" isn't clear, and one check breaks the new or already-known list (needs a decision)

**What happened.**

- **"Forecast now available" flips on and off.** It is worked out "on full reads only" (technical spec section 8). But after every write, code "saves the list of check results that apply, replacing the list before." Picture a new session in May 2027, a week before the trip. The opening full read shows "forecast now available" as new. The next write doesn't work this check out, so the note is listed as gone and dropped from the saved list. The next full read shows it as new again, and the coordinator would raise it again.
- **The opening-hours check has three results at two levels.** Suppose Milt's still had its open warning, "open, but not long enough," at noon. Then the 5-hour hike pushes it to 4:45 p.m., after it closes at 12:30. Now it is "closed for the whole visit." Both come from the same check about the same stop. By the rule in technical spec section 8, the second is "already known," so the coordinator stays quiet. The user should hear that a place is now closed for the whole visit.
- **The wording clashes.** Technical spec section 8 says "Check results are worked out, not stored as decisions," with the stop-order check as "the one exception." The next paragraph saves the whole list with the trip. So two things are stored.

**Touches:** technical spec section 8 (check results, new or already known, forecast now available), section 5.2 (when to raise).

**Options:**

1. Work out "forecast now available" on every write too. It needs only today's date and the stay's dates, with no outside call. Treat each row of the table in technical spec section 8 as its own check, so a change between opening-hours results is new.
2. Keep read-only checks out of the saved list, and compare them against a separate list saved by reads.
3. Leave it as is, and have the coordinator remember in trip memory that it offered a forecast.

**Recommendation:** option 1. Also reword "not stored" to say that results are worked out fresh, and that the list is saved only to mark results new or already known.

**Post-review analysis.** Agree on all three bullets.

- **"Forecast now available."** The problem is a bit worse than the walker says. Technical spec section 8 saves the list of check results "after every change," and a read isn't a change. So the note never reaches the saved list, and every full read marks it new. Option 1 fixes this. It needs only today's date and the stay's dates. One side effect: today's date changes between sessions with no change to the plan. So the note first shows up on whatever write happens first that day, even one about something else. That's fine, because it is a note and the coordinator raises it at the end of the turn.
- **Each opening-hours result as its own check: agree.** The table in technical spec section 8 already lists them as separate rows. A stop going from "open, but not long enough" to "closed for the whole visit" would then be new, and the coordinator would raise it.
- **The "not stored" wording: agree.** It's a wording fix.

**Settled (2026-10-11):** as proposed. Also: at the start of a new session the coordinator offers the forecast whether the note is new or already known, since a write may have saved it before anyone raised it.

### F5. Adding a stay strands selected stops along the leg, and moving them loses their candidates (needs a decision)

**What happened.** The user adds a Big Sur night after Monterey. `add_stay` puts a new, empty day after Monterey's. The old Day 2, now Day 3, drives Big Sur to San Luis Obispo but still holds Point Lobos and Bixby Creek, which are north of Big Sur. The reply lists all seven stops. The check results warn that the Monterey breakfast's search area no longer fits the day. Day 3's driving goes over 5 hours, because the route drives north to Monterey and back.

In the walk the user changed their mind before anything moved. But if they had kept Big Sur, Point Lobos and Bixby belong on the new Day 2, from Monterey to Big Sur. A stop along the leg can't move to another day (tool design section 2.1). The coordinator has to remove it and add a new one. Removing it deletes its candidates and the worker's rationale. To put Point Lobos back, the coordinator can't use `select_candidate`, because the new stop has no candidates. It has to use `select_user_place`, which marks it "specified by the user" with the user's reason. That isn't true. The leg scout found it. Or the coordinator sends a new leg scout to find Point Lobos again.

The First Awakenings breakfast is fine: it is near the Monterey stay, and the new Day 2 starts there, so `move_stop` allows it.

**Touches:** technical spec section 3.5 (a stay is added), section 6 (search area never changes); tool design section 2.1 (`move_stop`, "A stop's kind, purpose, and search area are fixed").

**Options:**

1. Let `move_stop` move a stop along the leg to another day that has a leg, keeping its candidates and selection. The candidates' detour times are already labeled "as of when offered." The selected stop's real drive time is worked out again when the leg is re-routed.
2. Keep the rule, and let the coordinator copy a selected place to a new stop as a candidate with the old rationale. This needs a new tool.
3. Keep it as is, and accept the new leg scout call or the false "specified by the user."

**Recommendation:** option 1. "Along the leg" means "along this day's drive," and the day it moves to has a drive too.

**Post-review analysis.** Agree that the problem is real. But the docs chose this on purpose. Technical spec section 3.5 says "A stop along the leg can't move to another day, so it is removed and added again on the new day." What the walker found is the cost of that choice. The user's earlier pick comes back labeled "specified by the user," and its other candidates are lost.

I agree with option 1, with a limit. `move_stop` can move a stop along the leg to another day that moves to a new stay or to the end place. It can't move it to a day that stays put, since "along the leg" isn't allowed there (technical spec section 6). The search area stays "along the leg." Only which day's leg changes.

The old reason in tool design section 2.1 ("another day has a different leg") was to keep candidates near the road they were found on. That still matters. Moving Fisher Towers from Moab Day 1 to the Torrey day would be nonsense. But the daily driving check would catch a move like that. And the coordinator should only make the move when the place is on the new day's road, as when a new stay splits a leg. "More options" for the moved stop then goes to the new day's leg scout.

**Settled (2026-10-11):** `move_stop` can move a stop along the leg to another day that drives to a new stay or to the end place, keeping its candidates and selection. Not to a day that starts and ends at the same stay.

### F6. Places the user names skip the workers, so nobody checks seasonal closures or reservations (needs a decision)

**What happened.** The user names all five Day 1 stops in San Francisco, and Delicate Arch and Goblin Valley in Moab. Each is selected right away with `select_user_place` (technical spec section 4.2, round 3). No worker ever looks at them. Code checks only weekly hours (technical spec section 8). The seasonal checks and notes like "reservations advised" come from workers, through web search and their own knowledge (technical spec section 6.1; data sources index, "Seasonal hours and closures"). The coordinator has no web search (technical spec section 5.1).

Example: a sunrise hike at Delicate Arch in October could need a park entry reservation, depending on the park's rules that year. Nobody would find out. The user-named place's card has no notes, because the candidate `select_user_place` writes has none.

**Touches:** technical spec section 4.2 (must-sees first), section 5.1, section 6.1; tool design section 2.1 (`select_user_place`).

**Options:**

1. During the fill, add the selected user-named attraction stops to the right worker's brief as "check only." The worker reports seasonal closures or reservation needs in its result, and the coordinator raises them. The worker writes no candidates.
2. Let the coordinator flag them from its own knowledge only.
3. Give the coordinator web search for details only.

**Recommendation:** option 1. It keeps web results out of the coordinator's context, and workers already return "problems found."

**Post-review analysis.** Partly agree. The gap is real, but the docs aren't silent. Technical spec section 8 ends by leaving "seasonal risks, and seasonal closures" to the agent's judgment. Technical spec section 4.2 round 2 says closures come from the model's own knowledge at that stage. Functional spec section 11, scenario S4, says the same. So the coordinator is already meant to know that Arches may need a timed entry reservation. What's missing is an instruction to apply that knowledge to places the user names.

My recommendation: start with option 2, written as an instruction in technical spec section 5.2. When the coordinator selects a place the user named, it mentions any seasonal closure or reservation it knows about. Option 1 is a stronger check, but it adds worker work. On San Francisco Day 1 it would mean running a leg scout just to check five places. If the coordinator's own knowledge proves weak in testing, add option 1 then.

**Settled (2026-10-11):** option 2, as an instruction in technical spec section 5.2. Option 1 held back unless testing shows the coordinator's knowledge is weak.

### F7. A late-night stop routed on the way in shows a misleading day (needs a decision)

**What happened.** On Moab Day 4 the party reaches Capitol Gorge's end around 4:45 p.m. The next stop is stargazing at Panorama Point, set for 1:00 a.m., next day. It is routed on the way in (technical spec section 3.1). So the schedule says: arrive at Panorama Point 5:10 p.m., free time until 1:00 a.m., then reach the Torrey hotel at 2:10 a.m. The user sees almost eight hours of "free time" at a viewpoint, and a hotel arrival at 2 a.m. Really they check in around 5:30 p.m.

The same thing shows smaller on San Francisco Day 1: the party reaches the Whaling Station at 4:45 p.m. and the schedule shows free time there until dinner at 7.

Day 4 also has no dinner at all, and nothing notices. That ties to functional spec section 12, open question 1 (meal coverage). The day isn't wrong, but the schedule makes it look odd.

**Touches:** technical spec section 3.1 (late-night stop, free time); functional spec section 9.5.

**Options:**

1. In the schedule, show free time as its own entry not tied to a place, such as "free time, 5:10 p.m. to 12:45 a.m." If the free time is long and the stop is near tonight's stay, label it "at the hotel."
2. Route a late-night stop near the stay as a round trip from the lodging after check-in. This needs a new rule and an extra segment.
3. Leave it as is.

**Recommendation:** option 1. It costs nothing and is honest about what the times mean.

**Post-review analysis.** Agree that this is a display problem, not a planning problem. Technical spec section 3.1 already accepts that the late-night stop is routed on the way in. The trouble is where the free time shows up.

I'd suggest a different fix from option 1: put the free time before the drive to a stop with a set time, not after it. The party waits where it is, then leaves so it arrives at the set time. Moab Day 4 would read: Capitol Gorge until 4:40 p.m., free time until 12:35 a.m., drive to Panorama Point, stargazing 1:00 to 2:00 a.m. San Francisco Day 1 would read: Boardwalk until 6:55 p.m., free time, drive to the Whaling Station, dinner at 8:00. This matches how people actually travel, and it needs no "at the hotel" label, which would need code to judge what counts as near and long.

This also makes F8 mostly go away (see there). The 2:10 a.m. hotel arrival on Moab Day 4 stays, which is true to the plan.

The missing dinner on Moab Day 4 is a separate question: functional spec section 12, open question 1 (meal coverage). It isn't part of this finding.

**Settled (2026-10-11):** free time goes before the drive to a stop with a set time. The party waits where it is, then leaves so it arrives at the set time. Code lays out the times this way. Nothing new is stored.

### F8. "Arrival" in the opening-hours check isn't the same as when the stop starts (wording fix)

**What happened.** On Moab Day 2 the party gets to Milt's at 11:25 a.m. but the stop has a set time of 12:00. Technical spec section 8 tests hours "from its worked-out arrival." Its example says "You'd get there at noon," so it means the stop's start, not the arrival. If a museum opened at noon and the party arrived at 11:25 for a noon set time, a check using the arrival would warn "opens after the party arrives." The party is just waiting.

Tool design section 2.1 (`read_itinerary`) returns "each stop's arrival and departure, free time."

**Touches:** technical spec section 3.1 and section 8; tool design section 2.1.

**Recommendation:** name three times per stop: arrival (when the drive gets there), start (the later of arrival and set time), and end (start plus visit time). The hours check tests start to end. The late check compares arrival with the set time. The gap between arrival and start is free time.

**Post-review analysis.** Agree that "arrival" is used two ways. Technical spec section 8 tests hours "from its worked-out arrival," but its own example means the stop's start.

If we take my suggestion in F7 (free time goes before the drive), the problem mostly goes away. The party leaves so it arrives at the set time, or arrives late. Either way, arrival and start are the same time. The schedule then needs only two times per stop: arrival and end (`read_itinerary` calls the end "departure"). The hours check tests arrival to end. The late check compares arrival with the set time. If we keep free time after the drive instead, I agree with the walker's three times.

**Settled (2026-10-11):** with F7, arrival and start are the same time. Each stop has two times: arrival and end. The opening-hours check tests arrival to end. The late check compares arrival with the set time.

### F9. Too many changes call Google (wording fix)

**What happened.**

- Technical spec section 3.5 says a stop that "is changed" gets its day's leg re-routed. Changing the Boardwalk's visit time from 2 to 5 hours, or Milt's set time, doesn't change the route. As written, each re-routes the leg and reruns the stop-order check, which is three Routes calls, one at the Pro level.
- The stop-order check makes a second "basic call" with the day's own order and no waypoints (technical spec section 8). On a day with no waypoints, such as San Francisco Day 1 or Moab Day 2, that call is the leg's own route, which is already stored.
- Selecting the five Day 1 stops in San Francisco takes five `select_user_place` calls. Each one re-routes the leg and, from the second on, runs the stop-order check.

**Touches:** technical spec section 3.5 and section 8.

**Recommendation:** list in technical spec section 3.5 which stop changes re-route: a different place, a selection cleared, a new order, or removal. Not visit time or set time. Skip the second stop-order call when the leg has no waypoints. Leave batching selections for later, since cost is low at this scale.

**Post-review analysis.** Agree with all three.

- The leg stores the drive time between stops, and the schedule is worked out from those (technical spec section 3.1). So a new visit time or set time needs no new route. "It is changed" in technical spec section 3.5 should become a list: a place selected or cleared, a stop moved within or between days, or a stop removed.
- With no waypoints, the stop-order check's second call is the same route the leg already stored. Reuse it.
- Batching selections can wait.

**Settled (2026-10-11), with group 1:** all three parts. Code re-routes a leg only when its selected places, in order, differ before and after a write (technical spec section 3.5). The stop-order check reuses the leg's stored drive time when the leg has no waypoints (technical spec section 8). Batching selections is left for later, with no doc change.

### F10. Rejected places are hidden from `find_place`, so the coordinator can't explain them (needs a decision)

**What happened.** The user rejects the Sardine Factory during discovery. Later, suppose they say "let's try the Sardine Factory after all." The coordinator calls `find_place`. Rejected places are "left out of every search's results" (tool design section 2.3), so it finds nothing, or a different restaurant. The coordinator can't tell the user "you turned that down earlier." The error in `select_user_place` that "gives the reason it was rejected" can never be reached this way. A full `read_itinerary` lists rejected places, but that is an expensive way to answer.

**Touches:** tool design section 2.3 (`find_place`) and section 2.1 (`select_user_place`); technical spec section 3.2.

**Options:**

1. `find_place` returns rejected places, marked rejected with the reason. The search tools for workers keep leaving them out.
2. Leave it as is, and have the coordinator read the rejected list when a lookup fails.

**Recommendation:** option 1. Only the coordinator and workers use `find_place`, and a worker can't select anything anyway.

**Post-review analysis.** Agree with option 1, with a caveat about workers. A worker can't select, but it can add candidates. Workers use `find_place` to look up places found by web search. If a worker passes a rejected place to `add_stop_candidates`, its whole set is refused (tool design section 2.1, "A repeat rejects the whole call"). So the rejected mark has to be clear, and the worker instructions (technical spec section 6.4) should say to skip rejected places. Hiding them from workers only isn't simple, because the tools don't know which agent is calling (tool design section 4). So mark them for everyone.

**Settled (2026-10-11):** `find_place` returns rejected places marked with the reason; workers skip them (technical spec section 6.4).

### F11. Worker briefs: who gets one, and what the weather worker's holds (wording fix)

**What happened.**

- Technical spec section 4.2, round 4 says "one leg scout per leg with stops along it." San Francisco Day 1 has four stops along the leg, all named by the user and already selected. No leg scout is needed. It should say "with empty stops along it." The same goes for stay researchers: the Whaling Station is near the Monterey stay but already selected.
- Technical spec section 5.3 lists what a worker brief holds for stops and lodging. It says nothing about the weather worker's brief, such as which stay IDs and the stays' dates.
- Technical spec section 3.3 says "The leg scout is briefed with the day's ID." Technical spec section 5.3 doesn't list the day ID. `search_along_leg` needs it (tool design section 2.3).

**Touches:** technical spec section 4.2 and section 5.3.

**Recommendation:** fix the wording in 4.2, and add the day ID and a weather worker line to 5.3.

**Post-review analysis.** Agree with all three. One addition for technical spec section 4.2: a stay researcher is needed only when the stay has something empty. That means lodging not yet selected, or an empty stop whose search area is that stay. A stay whose lodging the user named, with all its stops selected, needs no stay researcher.

**Settled (2026-10-11):** as proposed, including the stay researcher rule.

### F12. Approvals are defined as accepting a warning, but no check warns about route type (wording fix)

**What happened.** On San Francisco Day 3 the user says "we just want to get to LA quickly." The coordinator calls `update_day` with a route type approval. Technical spec section 8 says "When the user agrees to keep something a check warned about, the coordinator records an approval." No check warns about route type. The same section later says "No check reads it." The two statements don't fit together.

**Recommendation:** define an approval as "a recorded exception to the trip brief that the user agreed to, with its reason." Most kinds also make a warning count as accepted. Route type is recorded only so it isn't raised again.

**Post-review analysis.** Agree. Functional spec section 6.2, step 4, already calls it accepting an exception, so the walker's definition matches. One small change: an opening-hours approval isn't an exception to the trip brief. It's an exception to a place's hours. So say "a recorded exception the user agreed to," without "to the trip brief." Drive hours and opening hours approvals make a warning count as accepted. A route type approval stops the coordinator from raising it again and from adding scenic waypoints that day.

**Settled (2026-10-11):** as proposed.

### F13. Nothing checks a day's end against the next day's start (needs a decision)

**What happened.** Moab Day 4 ends around 2:10 a.m. The user agreed to a 10 a.m. start on Day 5. If they hadn't, Day 5 would start at 8:00 a.m. after a 2 a.m. night, and nothing would say so. If a stop ran later still, the day could even overlap the next day's start.

**Options:**

1. Add a note when a day's end is less than a set number of hours (a setting, say 8) before the next day's start.
2. Leave it to the coordinator's judgment.

**Recommendation:** option 1, as a note. Code already works out both times.

**Post-review analysis.** Agree, as a low-priority note. A day can't realistically run into the next day's start, so a warning isn't needed. A short night is worth a note, and code has both times, so it's cheap. The minimum hours would be a setting. If you'd rather keep the list of checks short, this is the one I'd drop.

**Settled (2026-10-11):** dropped. Out of scope. The user can see a late night followed by an early start in the schedule.

### F14. Detour time and the along-leg search need a few rules spelled out (for the object model)

**What happened.**

- `add_stop_candidates` works out detour time "with one routing call against the stop's day's leg." It doesn't say whether that is one call per candidate or one per set. It also doesn't say where in the leg the candidate goes. On Moab Day 4, the pie stop sits between Goblin Valley and Capitol Gorge, so the candidate should be inserted at the stop's position among the selected stops.
- `search_along_leg` drops places "within a few miles of either end." Point Lobos is about 5 miles from Monterey's town center, which is the leg's start until a hotel is picked. If "a few miles" is set at 5 or more, Point Lobos is dropped.

**Touches:** tool design section 2.1 (`add_stop_candidates`) and section 2.3 (`search_along_leg`); Google design section 2.4.

**Recommendation:** say the detour is worked out per candidate, inserted at the stop's position among the selected stops. Start the end-drop setting small, such as 2 miles, and note Point Lobos as the test case.

**Post-review analysis.** Agree with both.

- **Detour time.** "One routing call" in technical spec section 3.2 and tool design section 2.1 reads as one call for the whole set. Each candidate needs its own route, so it is one call per candidate. Placing the candidate at the stop's position among the selected stops is right. Without that, the pie candidates on Moab Day 4 would be measured as if they came first or last.
- **The end-drop distance.** Point Lobos is a good test case. Note that the leg's start moves from Monterey's town center to the Monterey hotel once the hotel is selected. So Point Lobos's distance from the start can change between two searches.

**Settled (2026-10-11):** one routing call per candidate, placed at the stop's position. The end-drop distance is a setting that starts small, such as 2 miles; it drops places within that distance of either end. Point Lobos must not be dropped.

### F15. The seasonal-averages label shows old dates after a small date move (wording fix)

**What happened.** The Moab weather text was written for October 10 to 13, labeled "Typical for Oct 10–13, based on 2016–2025" (Open-Meteo design section 2.3). The trip moves one day later. The new dates are inside the 7-day window, so nothing is marked out of date (technical spec section 3.5). The stay now shows Oct 11 to 14, but its weather label still says Oct 10 to 13.

**Recommendation:** have the UI show the label as "Typical for mid-October" or show the window, not the exact dates. Or accept it, since the numbers are the same.

**Post-review analysis.** Agree. It's low priority. I'd go with the walker's first option. The UI shows the stay's current dates, and the label says "typical for this time of year, based on 2016–2025," with no dates in it. Open-Meteo design section 2.3 defines the label, so it changes there.

**Settled (2026-10-11):** the label becomes "Typical for this time of year, based on <first year>–<last year>" (Open-Meteo design section 2.3).

### F16. Smaller points (wording fix)

- **F16.1. A meal stop the user named still needs a tier.** `add_stops` requires a tier for every meal (tool design section 2.1). The Whaling Station gets "mid-range, from rule: the trip default," while its card shows "your choice." Say that the stop's tier is used only if the user later asks for more options.
- **F16.2. `compute_route` and places.** It returns "the place each plain name resolved to" (tool design section 2.4). It doesn't say whether these are saved as places with IDs that `add_stay` can use, or whether the coordinator must call `find_place` again.
- **F16.3. An opening-hours approval is left behind.** When Gifford is rejected, its stop keeps an opening-hours approval for Gifford that no longer applies. That is by design ("nothing has to be cleared"), but reads will show it as "not applying" forever. Consider removing approvals for a place when it is rejected.
- **F16.4. A warning raised once and then left open is never raised again.** In a new session, the coordinator stays quiet about already-known results. That is fine, but the coordinator should list open warnings when asked "what's left to decide?" Say so in technical spec section 5.2.
- **F16.5. The late check on an empty first stop.** Moab Day 2's Delicate Arch stop has a set time of 6:00 a.m. If the coordinator adds the stop before changing the day's start to 5:30, the schedule puts the empty stop at 8:00 and the late check warns. Say whether the late check applies to empty stops. I assumed it does, since it "catches a day that starts too late."

**Post-review analysis.**

- **F16.1: agree.** The stop is added before the user names the place, so it needs a tier then. Making the tier optional would break our rule against optional inputs. Wording only: the stop's tier is used if the user later asks for more options or a different tier. The card for the named place shows "your choice."
- **F16.2 settled (2026-10-11):** `compute_route` saves no places; anything written goes through `find_place`.
- **F16.2: agree that it's unclear.** I'd settle it the other way from saving places. `compute_route` saves nothing. Anything written to the itinerary goes through `find_place` first. Plain names can resolve to the wrong place without any error (the Dewey Bridge case in technical spec section 3.3), so a separate lookup for anything kept is the safer rule. The walk already did this in San Francisco step 5.
- **F16.1 and F16.3 settled (2026-10-11)** as proposed below.
- **F16.3: agree.** Code removes a stop's opening-hours approval when the stop's selected place changes or is cleared. The coordinator still never has to clear anything, so "nothing has to be cleared" stays true from the coordinator's side.
- **F16.4 settled (2026-10-11)** as proposed below.
- **F16.4: agree.** Functional spec section 11, scenario S7, says a new session knows "the trip's open items." Technical spec section 5.2 should say what "what's left to decide?" covers: stops and lodging still empty or proposed, open warnings, and open items in trip memory. Approved exceptions can be mentioned briefly.
- **F16.5: agree that it applies, and the walk's result is correct.** An empty stop with a set time sits at its set time, or later if the stop before it runs late. So a 6 a.m. stop on a day that starts at 8 is late, and the warning is right. The coordinator raises warnings only at the end of its turn (technical spec section 5.2). So a warning that shows up between two calls in the same turn is never raised. Wording fix: say in technical spec section 8 that the late check covers empty stops.

**F16.5 settled (2026-10-11):** the late check covers an empty stop that has a set time. Example: a 6:00 a.m. sunrise hike on a day that starts at 8:00 a.m. warns. This refines the F1 decision: an empty stop with a set time shows its set time in the schedule. Only an empty stop with no set time shows "time set once a place is picked."

---

## 2. Properties and rules touched

"Not in docs" marks properties or rules the walk needed that the docs don't mention. "Worked out" means not stored (technical spec section 3).

**Trip**
- Owner (user). Name and region, worked out from the trip brief and start date.
- Rejected places: each a place and the user's reason. Permanent for the trip.
- Saved list of current check results, for marking results new or already known (technical spec section 8).
- Trip memory items, and sessions.
- Rule: no tool takes a trip ID. The trip comes from the session.

**Trip brief**
- Region, route, or theme. Trip length in days. Interests and must-sees, with why. Max driving hours. Route preference. Rest days. Usual start time, default 8 a.m. Budget posture: default tier plus rules as text. Meal preferences.
- Rule: changing the brief never changes the itinerary. The checks read it.
- Must-sees can be a place, an area, a road, or an activity. Not in docs: whether the brief stores which kind each is, or only text.

**Itinerary**
- Start place, end place, each with a name for places Google has no name for. Start date.
- Stays in order. Days in order. Created with the last day only.
- Rule: `add_stay` is rejected until the start date and both places are set.
- Rule: trip length is the number of days, and the end date is worked out.

**Stay**
- Place (usually a town). Order. Lodging place, empty until selected. Lodging candidates.
- Tier, the rule that produced it, and the nights it was set for.
- Weather and clothing text, labeled forecast or seasonal averages, with the place, dates, and activities it was written for.
- Worked out: nights (days pointing to it), dates (its nights plus the morning it leaves), status.
- Not in docs: what one activity record holds (F3). I assumed the stop ID and its place ID.
- Rule: where the party sleeps is the lodging, or the stay's place until one is selected.
- Rule: removing a stay is refused while any stop is on its days or has it as its search area.
- Rule: removing a night removes the stay's last day, and is refused while that day holds stops.

**Day**
- Order. Rest day or not. Its own start time, or none. Stops in order. Leg, or none. Approvals. The stay it sleeps at, or none for the last day.
- Worked out: date, the schedule (each stop's times, free time, the arrival where the party sleeps), whether it has a leg.
- Rule: only a day that stays put can be a rest day. Marking one removes its leg and waypoints.
- Rule: a day that stays put gains a leg when its first stop is selected.
- Rule: a day can run past midnight. A stop after midnight stays on the day it follows.
- Not in docs: any rule about a day's end against the next day's start (F13).
- Not in docs: whether day IDs stay the same when days move. I assumed they do, since check results are matched by day.

**Leg** (value object on a day)
- Waypoints as place IDs, in the order the coordinator gave. Drive time, distance, route line.
- A drive time for each selected stop from the one before it, and for the drive from the last stop to where the party sleeps. Not in docs: where the last drive is stored. I assumed on the leg.
- Stop-order result: best order and time saved.
- Worked out: from, to, route type.
- Rule: code places each waypoint among the selected stops by least added straight-line distance.
- Rule: a leg is routed only through selected stops, never empty ones.

**Stop**
- Kind (meal or attraction), purpose, search area (a stay ID or along the leg). All three fixed.
- Order in the day. Set time, or none, written as "next day" after midnight.
- Place, empty until selected. Candidates. Visit time. Tier and rule, for meal stops. Approvals.
- Drive time from the previous selected stop, stored with the leg.
- Worked out: status, date, arrival, start, end.
- Not in docs: a planned visit time for an empty stop, and whether a visit time came from the user (F1).
- Not in docs: the difference between arrival and start (F8).
- Rule: purpose never says when. A meal has no type.
- Rule: search area must be the stay slept at the night before, the stay slept at that night, or the leg on a day that moves.
- Rule: a stop along the leg can't move to another day (F5).
- Rule: selecting sets the visit time: the candidate's estimate, the user's figure, or one hour for a meal.

**Candidate** (value object on a stop or stay)
- Place. Rationale. Tier and rule, for lodging and meals. How it was found, with a source link. Notes. Visit time estimate, for attractions. Detour time, for stops along the leg, labeled as of when offered. Set number.
- Rule: never changes after it's written. Only a rejection removes it.
- Rule: a whole set is refused if any place in it repeats or is rejected.
- Not in docs: whether date-specific text in notes is allowed (F2).

**Place**
- Our ID. Google place ID, which can be empty. Coordinates. Name, Google's or the one given. Type cards show. Rating, review count, price level, weekly hours, summaries, links.
- Rule: matched by Google place ID only. Stored once per trip.
- Rule: the first candidate that offers it sets the given name and type.

**Approval** (value object on a day or stop)
- Kind, value, reason.
- Drive hours: hours. Route type: the type. Opening hours: the place, and the minutes of the visit within opening hours.
- Rule: at most one of each kind per item. Setting one replaces the old one.
- Rule: an opening-hours approval applies while the place is the same and no fewer minutes are open.
- Not in docs: a single definition that fits route type (F12).

**Check result**
- Which check, its level (warning or note), what it is about (trip, stay, day, or stop), its text, new or already known, approved or not.
- Rule: worked out fresh after each change, compared against the saved list.
- Rule: a result that goes away and comes back is new again.
- Not in docs: whether each opening-hours result is its own check (F4).
- Not in docs: how read-only checks fit the saved list (F4).

**Worker brief**
- Stop or stay IDs, with day, dates, and nights. Tier and rule. Each stop's purpose and time. The day's other stops. Interests, must-sees, and meal preferences. Places to leave out.
- Not in docs: the day ID for a leg scout (F11), and the weather worker's brief.

**Settings** (named in the docs as settings)
- Driving buffer (10%). Late allowance (15 minutes). Stop-order minimum saving (15 minutes). How near counts as near for `search_near`. How many miles from the ends `search_along_leg` drops.

---

## 3. Step log

Each step gives who acts, the tool call, what changes in storage, what comes back, and what the user sees. "Coord" is the coordinator. Check results are written as level, new or already known. Times include the 10% driving buffer.

### 3.1 San Francisco to Mike's house

**Discovery**

1. User: "Pacific Coast Highway from San Francisco to LA, 3 days, starting Thursday May 13, 2027." Coord: `read_memory` (memory: nothing yet). Coord asks about interests, must-sees, driving hours, budget, and meals, a few at a time.
2. User answers: scenic, 5 hours a day max, mid-range, local food, elephant seals, classic desserts. Coord: `update_trip_brief` (region "Pacific Coast Highway", length 3, interests, max hours 5, route scenic, budget mid-range, meals). Reply: no check results, since the itinerary has no dates yet. App names the trip "Pacific Coast Highway, May 2027."
3. **Change 1.** User: "We end at our friend Mike's house," and gives an address in Silver Lake. Coord: `find_place` ("<address>", "Los Angeles, CA") returns `place_m4hx7tqa`, an address with no name. `find_place` ("San Francisco", "CA") returns `place_s9fk2wbn`. Coord: `update_itinerary` (start `place_s9fk2wbn` "San Francisco", end `place_m4hx7tqa` "Mike's house", start date May 13, 2027). Storage: the last day (`day_c3rt8pzv`) now has a route from San Francisco to Mike's house, about 6.5 hours, inland. Reply: trip length vs the brief, 1 day against 3, warning, new. Daily driving on the last day, warning, new. Coord stays quiet: the skeleton isn't built yet (technical spec section 5.2). User sees: "Got it, ending at Mike's house."

**Shape:** skipped. The user gave a fixed route.

**Skeleton**

4. Coord: `compute_route` (San Francisco stop, Monterey stop, San Luis Obispo stop, `place_m4hx7tqa` stop, order keep). Reply: about 2 h, 3 h 45 m on Highway 1 with a pass-through, 3 h 30 m. Coord proposes one night each in Monterey and San Luis Obispo. User agrees.
5. Coord: `find_place` for Monterey and San Luis Obispo. `add_stay` (Monterey `place_mty4k2na`, "first", 1 night, mid-range, "trip default"), giving `stay_mt7k2pqa`. Storage: new `day_a2kq9fxe` (Day 1) sleeps at Monterey. Legs re-routed: Day 1 San Francisco to Monterey, about 2 h. Last day Monterey to Mike's house. Reply: trip length 2 against 3, warning, already known. The daily driving warning on the last day stays.
6. Coord: `add_stay` (SLO, after `stay_mt7k2pqa`, 1 night, mid-range, "trip default"), giving `stay_sl3v8hra`, with new `day_b5wn4jcu` (Day 2). Legs re-routed: Day 2 Monterey to SLO, 2 h 40 m on US-101. Last day SLO to Mike's house, about 3 h 50 m. Reply: trip length and last-day driving warnings went away.
7. **Must-sees first, Day 1.** Coord: `find_place` for each of the five places. It asks for two visit times: "People usually spend about two hours at Hangar One, and two at the Boardwalk. Sound right?" User: yes. Coord: `add_stops` (`day_a2kq9fxe`, "first", five items). Millbrae Pancake House: meal, "pancakes," along the leg, no set time, mid-range. Hangar One: attraction, "aviation history," along the leg. Philz: meal, "coffee," along the leg. Boardwalk: attraction, "the beach boardwalk," along the leg. Whaling Station: meal, "a classic Monterey steakhouse," near `stay_mt7k2pqa`, set time 7:00 p.m., mid-range. Reply: five stop IDs. The tier on user-named meals is used only for "more options" (F16).
8. Coord: five `select_user_place` calls, one per stop, each with name, type, the user's reason, and a visit time for the two attractions. Each call re-routes Day 1, and from the second on, runs the stop-order check (F9). Final route: San Francisco, Millbrae, Moffett Field, San Jose, CA-17 to Santa Cruz, Highway 1 to Monterey. The leg is inland until Santa Cruz because the user's stops chose that road. The coordinator doesn't question it, and adds no waypoint (technical spec section 4.2). Stop order: Google's order is the same, so no note. Hours: all open long enough.
   - User sees Day 1: starts 8:00 a.m. Millbrae 8:25 to 9:25. Hangar One 9:50 to 11:50. Philz 12:05 to 1:05. Boardwalk 1:55 to 3:55. Arrive Whaling Station 4:45, free time until dinner at 7:00 to 8:00. Monterey (town, no hotel yet) about 8:05.
9. **Change 4.** User: "Make it five hours at the Boardwalk." Coord: `update_stop` (Boardwalk stop, visit time 5 h). Storage: visit time changes. Per technical spec section 3.5 as written, the leg is re-routed, though nothing about the route changed (F9). Reply: late for a set time on the Whaling Station, warning, new: "You'd reach dinner at 7:45, but it's set for 7." Boardwalk: open until 7 p.m., so open long enough (1:55 to 6:55).
10. End of turn. Coord raises the late warning with three choices: dinner at 8, an earlier start, or a shorter Hangar One. No approval is offered, because every answer changes the plan. User: "Dinner at 8." Coord: `update_stop` (Whaling Station, set time 8:00 p.m.). Reply: late warning went away. User sees the Boardwalk until 6:55, arrive at dinner 7:45, free time 15 minutes, dinner 8:00 to 9:00.
11. **Days 2 and 3.** Day 3: user says "On the last day we just want to get to LA quickly." Coord: `update_day` (`day_c3rt8pzv`, approve route type fastest, reason "wants to get to LA quickly"). No waypoints that day. Day 2: Coord: `find_place` ("Big Sur village", "Big Sur, CA") returns `place_bs8xk3tn`. `update_leg` (`day_b5wn4jcu`, [`place_bs8xk3tn`]). Leg re-routed to Highway 1, about 3 h 50 m.
12. Coord: `add_stops` (`day_b5wn4jcu`, "first", seven items). Breakfast: meal, "a local café," near `stay_mt7k2pqa`. Attractions along the leg: "a coastal walk," "a classic Big Sur viewpoint," "elephant seals." Meal along the leg: "a meal with an ocean view." Then near `stay_sl3v8hra`: meal "local barbecue" at 6:30 p.m., and meal "dessert," no set time. Each meal is mid-range, "trip default." Reply: seven IDs. Schedule: all empty, so the first five show at 8:00 a.m. (F1).

**Fill**

13. **Change 2.** User: "No Sardine Factory, we didn't like it last time." Coord: `find_place` ("Sardine Factory", "Monterey, CA") returns `place_sf2q7hdk`. `reject_places` ([`place_sf2q7hdk`, "didn't like it last time"]). Reply: no stops or stays touched. Memory: the coord could also save "didn't like the Sardine Factory" to user memory for later trips. Memory design is deferred.
14. Coord briefs three workers at once with `Agent`. Day 1 needs no leg scout: all its stops are selected (F11).
    - Monterey researcher: `stay_mt7k2pqa` (May 13 to 14, 1 night, mid-range from "trip default") and the breakfast stop on Day 2 (Fri May 14, shown at 8:00 a.m.). It calls `search_near` (stay, "hotels") and `search_near` (breakfast stop, "breakfast café") — the brief can't say "breakfast," but the stop is first in the day at 8:00 — then `add_stay_candidates` and `add_stop_candidates`, three each. Reply: "Set 0 for stay_mt7k2pqa: 3 candidates." The Sardine Factory never comes back from a search.
    - SLO researcher: `stay_sl3v8hra` lodging, the barbecue stop at 6:30, and the dessert stop. Three candidates each. The dessert set includes the Copper Café's own listing at the Madonna Inn.
    - Day 2 leg scout: day ID, the four stops along the leg, with purposes and the day's other stops. It calls `search_along_leg` (`day_b5wn4jcu`, "state park"), (`day_b5wn4jcu`, "scenic viewpoint"), (`day_b5wn4jcu`, "restaurant ocean view"), and (`day_b5wn4jcu`, "elephant seals"). The route line is Monterey town, Big Sur village, SLO town, because nothing on Day 2 is selected yet. The waypoint keeps the search on the coast. Point Lobos is about 5 miles from the start and survives only if the end-drop setting is small (F14). Each `add_stop_candidates` call works out detour times. For the ocean-view meal the scout sees "8:00 a.m." and has to judge from position that this is lunch (F1).
15. Workers return one line per candidate. Coord tells the user that cards are ready. User selects on the cards. Each click becomes a message and a `select_candidate` call. Each one re-routes the leg it touches. Selecting the Monterey hotel re-routes Day 1 and Day 2. Code places the Big Sur waypoint between Bixby Creek and Nepenthe as stops fill in.
16. **Change 3.** User clicks "Higher tier" on the SLO hotel card. Message: "User asked for a higher tier for the San Luis Obispo hotel." Coord: `update_stay` (`stay_sl3v8hra`, tier posh, rule "the user asked for a higher tier"), which records 1 night. Coord briefs the SLO researcher: lodging only, posh, leave out the three offered. Worker: `search_near`, then `add_stay_candidates`. Reply: "Set 1 for stay_sl3v8hra: 3 candidates." The card shows set 1, each "posh, from rule: the user asked for a higher tier." User selects one. Coord: `select_candidate`. Day 2 and Day 3 legs re-routed. Coord confirms in chat. If the user says why they chose it, the coord saves that to trip memory.
17. Day 2 once selected: starts 8:00. First Awakenings 8:10 to 9:10. Point Lobos 9:25 to 10:55. Bixby 11:10 to 11:40. Nepenthe 12:05 to 1:05. Piedras Blancas 2:35 to 3:35. Arrive Firestone 5:30, free time, 6:30 to 7:30. Copper Café 7:35 to 8:35. Hotel about 8:40. Stop order: same order, no note. Driving: about 4 h 20 m with buffer, under 5. Day 3: starts 8:00, arrives Mike's house about 11:50.

**Weather and clothing**

18. Coord briefs the weather worker with both stay IDs (F11: no brief format for this worker). Worker: `stay_weather` (`stay_mt7k2pqa`, Monterey town) returns seasonal averages for May 13 to 14, and activities Hangar One and the Boardwalk (Day 1's leg). `stay_weather` (`stay_sl3v8hra`, SLO) returns Point Lobos, Bixby, and Piedras Blancas, since those are on the leg of the day that sleeps in SLO. The last day has no stops. Worker calls `set_stay_weather` twice. Returns one line per stay. User sees "Typical for May 13–14" with layers for coastal fog.
    - If this round ran before the selections in step 15, every selection would mark the weather out of date (F3).

**Refine**

19. **Change 5, add.** User: "Add a night in Big Sur between Monterey and SLO." Coord: `find_place` ("Big Sur", "CA"). `add_stay` (Big Sur, after `stay_mt7k2pqa`, 1 night, mid-range, "trip default"), giving `stay_bg6r2xwa` and new `day_e7pz3mkd` (now Day 2, Fri May 14). Storage: old Day 2 is now Day 3 (Sat May 15), driving Big Sur to SLO. Last day is now Day 4 (Sun May 16). Legs re-routed: new Day 2 Monterey hotel to Big Sur. Day 3 Big Sur, north to First Awakenings in Monterey, then south, about 6 h with buffer. SLO's dates move by one day, inside its averages window, so not out of date. Reply lists all seven stops on Day 3, whose start changed. Check results: trip length 4 against 3, warning, new. Search area doesn't fit the day for First Awakenings, warning, new. Daily driving on Day 3, warning, new. Stop order on Day 3: Google drives Bixby, Point Lobos, then breakfast, saving about 20 minutes, note, new. Weather out of date for Big Sur, which has no text, note, new. Hours checks rerun for Day 3's stops on a Saturday: all open.
20. Coord, end of turn: explains that Point Lobos, Bixby, and breakfast are now behind them. Asks whether they'd like a 4-day trip, and proposes moving those stops to the new Day 2. It moves nothing until the user confirms. If confirmed: breakfast could move with `move_stop`, but Point Lobos and Bixby would have to be removed and added again, losing their candidates (F5). Weather is not rerun: the change is still being discussed.
21. **Change 5, remove.** User: "Actually, never mind Big Sur." Coord: `remove_stay` (`stay_bg6r2xwa`). Allowed, since no stop is on its day or names it. Storage: `day_e7pz3mkd` removed. Day 2 drives Monterey to SLO again and is re-routed. Dates go back. Reply: every warning and note from step 19 went away. No weather rerun was needed. The brief still says 3 days, so there is no trip-length warning.
22. Final state matches the example, except the Boardwalk is 5 hours and dinner is at 8:00 p.m.

### 3.2 Grand Junction to Salt Lake City through Moab

**Discovery**

1. User: "Grand Junction to Salt Lake City, through Moab. Red rock, hiking, stargazing, pie." Coord: `read_memory`. Asks a few questions at a time. User: 4 hours of driving a day, scenic, value by default and mid-range for stays of 2 or more nights, local food, one rest day.
2. Coord: `find_place` for Grand Junction and Salt Lake City. `update_itinerary` (start `place_gj5n8kra` "Grand Junction", end `place_sc2w9fmb` "Salt Lake City"). Reply: no check results, since there is no start date yet.
3. **Change 1.** User: "We start October 10, 2027, five days." Coord: `update_trip_brief` (length 5, must-sees: Delicate Arch at sunrise, Goblin Valley, Arches, Capitol Reef, stargazing, and the other items). `update_itinerary` (start date October 10, 2027). Reply: trip length 1 against 5, warning, new. Daily driving on the last day, Grand Junction to Salt Lake City, about 4 h 40 m with buffer, warning, new. Coord stays quiet during the skeleton. App names the trip after the region and "October 2027."

**Shape:** skipped. The user named the route.

**Skeleton**

4. Coord: `compute_route` (Grand Junction stop, "Dewey Bridge, UT" pass-through, Moab stop, Torrey stop, Salt Lake City stop, keep). Reply shows Dewey Bridge resolved to Salt Lake City and a huge Day 1. Coord spots it and does `find_place` ("Dewey Bridge", "Utah") instead, which returns `place_dw4k9hna`. Proposes Moab 3 nights and Torrey 1 night, with one Moab day as the rest day. User agrees.
5. Coord: `add_stay` (Moab, "first", 3 nights, mid-range, "stays of 2+ nights"), giving `stay_mb8q2xka`, with Days 1 to 3 (`day_m1a4kz7p`, `day_m2b7nq3r`, `day_m3c9hx2t`). `add_stay` (Torrey, after Moab, 1 night, value, "trip default"), giving `stay_tr5h3kwd`, with Day 4 (`day_m4d2fp8v`). Day 5 (`day_m5e6tw4g`) is the last day. Reply: trip length warning went away. Last-day driving went away (Torrey to Salt Lake City is about 3 h 40 m).
6. Coord: `update_day` (`day_m3c9hx2t`, rest day). `update_day` (`day_m2b7nq3r`, start 5:30 a.m.) after the user agrees to the early start for the sunrise hike. `update_day` (`day_m5e6tw4g`, start 10:00 a.m.) after the user agrees to a late start after stargazing.
7. **Must-sees that are one place.** Coord asks about visit times: "About 2.5 hours for Delicate Arch, and 2.5 for Goblin Valley?" Yes. Coord: `add_stops` (Day 2, "first", [attraction, "sunrise hike," near `stay_mb8q2xka`, 6:00 a.m.]). `select_user_place` (Delicate Arch, 2.5 h). Day 2 gains a leg: Moab town to Delicate Arch to Moab town. Hours: open 24 hours, so open long enough, and nothing is said. `add_stops` (Day 4, "first", [attraction, "goblin hoodoos," along the leg]). `select_user_place` (Goblin Valley, 2.5 h). Day 4 re-routed through Goblin Valley, about 3 h 40 m plus buffer, which is 4 h 02 m: daily driving, warning, new.
8. **Must-sees that aren't one place.** Arches is an area near Moab, so its stops on Day 2 name it in their purpose. Capitol Reef is an area that Day 4's leg already passes through on UT-24, so no waypoint is needed. Stargazing is an activity: a stop near Torrey, set for 1:00 a.m., next day.
9. **Route preference.** Day 1: the fastest road is US-191, but the scenic one is UT-128 along the river. Coord: `update_leg` (Day 1, [`place_dw4k9hna`]). Re-routed, about 2 h. Day 4 has only one sensible road. Day 5 gets no waypoint. The coord judges the default road fine, and no rule covers that choice, but no approval is needed either.
10. **Lay out the other stops** (Day 2, Day 3, Day 4). Coord asks: "Does 'mid-range for stays of 2+ nights' cover meals in Moab too?" User: yes. Calls:
    - `add_stops` (Day 1, "first"): attraction "red-rock towers along the river," along the leg. Meal "brewpub," near Moab, 6:00 p.m., mid-range, "stays of 2+ nights."
    - `add_stops` (Day 2, after Delicate Arch): attraction "a short hike in Arches," near Moab. Meal "coffee and pastries," near Moab, no set time. Meal "burgers and shakes," near Moab, 12:00 p.m. Attraction "an arch hike near town," near Moab. Meal "a special meal," near Moab, 7:00 p.m. Meals are mid-range.
    - `add_stops` (Day 3, "first"): meal "casual pub food near the hotel," near Moab, 6:30 p.m., mid-range. Rest day, so no leg.
    - `add_stops` (Day 4, after Goblin Valley): meal "pie in Capitol Reef," along the leg, value, "trip default." Attraction "a short hike in Capitol Reef," along the leg. Attraction "stargazing," near `stay_tr5h3kwd`, "1:00 a.m., next day."
    - Reply after Day 4: daily driving still a warning, already known. The empty stops add no time. The late check: stargazing, empty, sits at its set time, so nothing.

**Fill**

11. Coord briefs four workers at once. Day 2 and Day 3 stay put, so the Moab researcher fills their stops.
    - Moab researcher: lodging (mid-range, 2+ nights) plus seven stops. It runs both general and Atlas Obscura searches, since Moab has 3 nights. Notes include "Arches entry reservations may be needed" for the Arches hike. Delicate Arch is user-named, so it never gets that note (F6).
    - Torrey researcher: lodging (value) and stargazing. `search_near` (stargazing stop, "dark sky viewpoint") returns Panorama Point.
    - Day 1 leg scout: Fisher Towers stop. `search_along_leg` (`day_m1a4kz7p`, "scenic viewpoint") along Grand Junction, Dewey Bridge, Moab town. Candidates: Fisher Towers, Castle Valley overlook, Dewey Bridge site, each with a visit time and a detour time.
    - Day 4 leg scout: pie and Capitol Reef hike. Route: Moab, Goblin Valley, Torrey town. `search_along_leg` (`day_m4d2fp8v`, "pie bakery") returns Gifford Homestead, a Hanksville burger stand with pie, and a Caineville farm stand (Torrey places are dropped as near the end). Candidates are added in one call. Result line: "Gifford Homestead is closed on Wednesdays, and Day 4 is a Wednesday." Notes on the card say the same (F2).
12. User selects from the cards: Moab hotel, Torrey hotel, Fisher Towers, Windows, Love Muffin, Milt's, Corona Arch, Desert Bistro, The Spoke, Gifford, Capitol Gorge, Panorama Point. Each is a `select_candidate`. Each re-routes the leg it touches. The Moab hotel re-routes Days 1, 2, and 4.
13. **Change 2: the opening-hours check results.**
    - Fisher Towers: no hours on Google. Note, new: "Hours not confirmed. Check before you go." Coord mentions it once.
    - Delicate Arch: open 24 hours. Nothing.
    - Milt's: arrive 11:25, start 12:00, closes 12:30. Warning, new: "Milt's closes at 12:30 p.m. You'd get there at noon, with an hour planned. Times are estimates from average drive times." (F8: arrival or start?)
    - Gifford: closed on Wednesdays. Warning, new: closed for the whole visit.
    - End of turn, coord raises both warnings. **Milt's:** user says "move it to the morning." Milt's already comes right after Love Muffin, so this is just dropping the set time. Coord: `update_stop` (Milt's, set time "none"). Milt's is now 11:25 to 12:25, open long enough. Warning went away. Corona Arch moves earlier to 12:40. **Gifford, first:** user says "keep it, we'll see." Coord: `update_stop` (Gifford stop, approve opening hours, reason "user wants to keep it anyway"). The tool records Gifford and 0 open minutes. The warning is marked approved. **Gifford, then:** user says "No, find us something else for pie. What were the others?" Coord: `read_itinerary` (scope the pie stop) shows the two remaining candidates with rationales. Coord: `reject_places` ([Gifford, "closed Wednesdays, our Day 4"]) — the docs' own example handles this as a rejection (F2). Reply: Gifford removed from the pie stop's candidates, selection cleared, Day 4 re-routed. Stop status: proposed. The approval stays but no longer applies, since the place is different. Coord lists the other two. User picks the Hanksville stand. `select_candidate`. Visit time set to 1 hour. Hours: open long enough.
14. **Change 3.** Day 4 with everything selected: road time about 4 h, plus buffer, is 4 h 24 m. Warning, already known, since it has been open since step 7. Coord raises it once the fill is done. User: "That's fine, we want Goblin Valley and Capitol Reef." Coord: `update_day` (`day_m4d2fp8v`, approve drive hours 5, reason "wants Goblin Valley and Capitol Reef on the way"). Warning now approved.
15. Day schedules once selected:
    - Day 1 (Sun Oct 10): starts 8:00. Fisher Towers 9:40 to 11:40. Arrive Moab Brewery 12:15, free time, 6:00 to 7:00. Hotel 7:05.
    - Day 2 (Mon): starts 5:30. Delicate Arch 6:03 to 8:33 (within the late allowance). Windows 8:50 to 9:50. Love Muffin 10:20 to 11:20. Milt's 11:25 to 12:25. Corona Arch 12:40 to 3:10. Arrive Desert Bistro 3:30, free time, 7:00 to 8:00. Hotel 8:05. Stop order: Google drives Corona before Windows and saves about 25 minutes, but it would miss the 6:00 a.m. sunrise. Note, new. Coord judges it not worth raising.
    - Day 3 (Tue), rest day: no leg. The Spoke at 6:30 to 7:30 p.m., with no drive time.
    - Day 4 (Wed): starts 8:00. Goblin Valley 9:55 to 12:25. Hanksville pie 12:55 to 1:55. Capitol Gorge 3:10 to 4:40. Arrive Panorama Point 5:05, free time until 1:00 a.m., visit 1:00 to 2:00 a.m. Torrey hotel about 2:10 a.m. (F7). Panorama Point hours: not known, note.
    - Day 5 (Thu): starts 10:00. Arrives Salt Lake City about 1:40 p.m.

**Weather and clothing**

16. Coord briefs the weather worker for both stays. `stay_weather` (Moab) returns seasonal averages for Oct 10 to 13, and activities Fisher Towers (Day 1 leg), Delicate Arch, Windows, and Corona Arch. `stay_weather` (Torrey) returns Goblin Valley and Capitol Gorge (Day 4's leg) and Panorama Point at 1 a.m. Worker writes freezing-night layers for stargazing. `set_stay_weather` twice. User sees each stay's text labeled "Typical for ..., based on 2016–2025."

**Refine**

17. **Change 4.** User: "Can we go a day later, starting October 11?" Coord: `update_itinerary` (start date October 11, 2027). Storage: every date moves one day. Nothing is re-routed. Hours checks rerun: Day 4 is now Thursday. Milt's and the others are fine. Gifford would now be open, but it is rejected for the trip (F2). Weather: Moab's new dates (Oct 11 to 14) are inside the window from Oct 3 to 20, so not out of date. Torrey is the same. The labels still say the old dates (F15). Reply: no new check results.
18. **Change 5, part 1.** User: "Let's do 2 nights in Moab instead of 3." Coord, per technical spec section 5.2: says this removes Day 3, the rest day they asked for, which holds The Spoke. Asks what to do with The Spoke. User: drop it. Coord: `remove_stops` ([The Spoke]). `update_stay` (`stay_mb8q2xka`, nights 2). Storage: `day_m3c9hx2t` removed. Torrey day is now Day 3 (Wed Oct 13), keeping its drive hours approval. Last day is now Day 4 (Thu Oct 14), keeping its 10 a.m. start. Hours checks rerun for the moved days. The Hanksville stand is open Wednesdays. Reply: trip length 4 against 5, warning, new. Stay tier set for different nights, Moab, note, new: "Moab's nights changed from 3 to 2. Its tier was set for 3."
19. Coord: the 2+ nights rule still gives mid-range, so it asks nothing and calls `update_stay` (`stay_mb8q2xka`, mid-range, "stays of 2+ nights"). Note went away. Asks about trip length. User: "4 days is fine." Coord: `update_trip_brief` (length 4). Warning went away.
20. **Change 5, part 2.** User: "Can we add a 5-hour hike in Arches on the morning of Day 2?" Coord: `add_stops` (Day 2, after Windows, [attraction, "a long hike in Arches," near Moab, no set time]). It can't record the 5 hours (F1). Reply: one ID. Weather out of date for Moab, note, new (an attraction stop was added). Coord briefs the Moab researcher for that one stop, with the hike's time of 9:50. Worker adds three trails. User picks Devils Garden. `select_candidate` sets the worker's estimate of 4 hours. Coord: `update_stop` (hike, visit time 5 h).
21. Reply after the visit time change: Love Muffin closed for the whole visit (arrive 3:40, closes 2:00), warning, new. Milt's closed for the whole visit (arrive 4:45), warning, new, since its earlier warning went away in step 13. Had that warning still been open, this one would count as already known (F4). Late for a set time at Desert Bistro (arrive about 8:45 against 7:00), warning, new. Stop-order note changes. Coord raises the warnings with choices. User: drop Love Muffin and Corona Arch, and move Milt's to Day 1 after Fisher Towers. Coord: `remove_stops` ([Love Muffin, Corona Arch]). `move_stop` (Milt's, Day 1, after Fisher Towers, "none"). Allowed: Day 1 ends at Moab. Reply: Day 2's warnings went away. Milt's on Day 1: arrive 12:18, closes 12:30. Open, but not long enough, warning, new.
22. User: "We'll grab burgers to go, keep it." Coord: `update_stop` (Milt's, approve opening hours, reason "will order to go before closing"). The tool records Milt's and 12 open minutes. If Fisher Towers later gets a longer visit, fewer minutes would be open, and the approval would stop applying.
23. End of turn, nothing is being discussed. Coord reruns the weather worker for Moab only. New text covers Devils Garden. Note went away.

**New session, next day (Oct 12, 2026)**

24. **Change 6.** User starts a new session. Coord gets today's date in context. Coord: `read_trip_brief`, `read_memory`, `read_itinerary` (no scope). The full read returns every stop and stay with its selected place and rationale. It returns check results with their saved status: Fisher Towers and Panorama Point hours notes, already known. Milt's and Day 3 driving warnings, approved. Day 2 stop order, already known. No forecast note, since the trip is a year away.
25. User: "Why did we pick that Moab hotel?" Coord answers from the selected place's rationale in the full read, such as "mid-range, walkable to Main Street, has a pool." It checks trip memory for why the user chose it. Nothing was said, so it says it was offered for those reasons and the user picked it from the card. If more detail is wanted, `read_itinerary` (scope `stay_mb8q2xka`) gives every candidate's rationale.
26. User: "What's left to decide?" Coord answers from the same read: no stops are still proposed. Open items: Fisher Towers and Panorama Point hours aren't confirmed. Approved exceptions: the long Day 3 drive, and Milt's to go. Trip memory items to revisit, if any. It also mentions that Day 3 has no evening meal. Nothing in the docs tells it to list approved exceptions or open warnings for this question (F16).
