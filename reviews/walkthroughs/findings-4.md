# Walk-through 4: findings

> **Snapshot, out of date.** This is the output of design walk-through 4, from 2026-10-12. It describes the design as it was then. The design changed after it, so much of this no longer matches. The current design is in `design/`. Anything still open is in `research/domain-model-notes.md`. See `reviews/walkthroughs/README.md`.

Two trips from technical spec section 3.1, walked from an empty trip through the planning rounds in technical spec section 4.2, with the changes from the walk-through prompt. Only files in `design/` were read. No APIs were called. Tool replies, drive times, and place details are made up to fit `tool-design.md`.

Hours I invented, beyond the "assume" hours in the examples, are marked **(walk assumption)** where they are used. They were added to exercise a rule, not because the docs needed them.

---

## Review groups

Added after the walk, by the reviewing session. That session could see the findings and decisions from the earlier rounds. Related findings are grouped so each group can be settled and committed together. The groups are in the order to discuss them.

1. **Decisions from earlier rounds that came back:** F1, F2, F5, F16, F20. Each one was settled in an earlier round. For each, the question is whether the docs failed to say what we decided, or whether the walk found something the decision missed. Touches technical spec sections 3.1, 3.2, 5.2, and 8, functional spec section 2, and Google design section 5.
2. **Check results and when the coordinator raises them:** F3, F21, F17, F13, F12, F19, F15. Touches technical spec sections 5.2, 8, and 9.
3. **Routes and the day's schedule:** F9, F14, F8, F6, F4. Touches technical spec sections 3.1, 3.2, 3.3, 3.5, and 5.2, and tool design section 2.1.
4. **Reads, new sessions, and place searches:** F7, F11, F10, F18. Touches technical spec sections 5.2 and 7.2, functional spec section 10.1, and tool design sections 2.1 and 2.3.

---

## 1. Findings

Most important first.

### F1. An empty stop takes no time, so the checks after it run on the wrong times — **needs a decision**

**What happened.** Moab change 5. The user wants a 5-hour hike on the morning of Day 2. The coordinator removes the Windows stop and adds an empty stop, "a long hike in Arches, about 5 hours." Until the user picks a trail, that stop takes no time (technical spec section 3.1, "A stop with no selected place takes no time"). So the coffee stop that follows it moves from about 2:30 p.m. (where it will really be) to 9:05 a.m., and Milt's moves to 10:10 a.m. Milt's opens at 11 (walk assumption), so the write returns a new warning: "Milt's opens at 11:00 a.m. You'd get there at 10:10." That warning is false. Once the user picks Devils Garden (5 hours), Milt's lands at 3:35 p.m., after it closes, and a different warning appears ("closed for the whole visit").

The hike's candidates go on the card at the end of the coordinator's turn, and the user picks in the next turn. So at the end of this turn the coordinator holds an open, new warning. Technical spec section 5.2 says to raise open warnings at the end of the turn. It would tell the user about a problem that doesn't exist, and miss the real one.

The same thing happens on every day during the fill. On Moab Day 2 before the fill, only Delicate Arch is selected, so every check on the empty stops' neighbors runs on times that ignore the empty stops. The daily driving check also undercounts a day whose along-leg stops are still empty. Moab Day 4 shows about 3.6 hours with buffer, and no warning, until Capitol Gorge is picked. Then it jumps to about 4.5 hours, because Capitol Gorge sits at the end of a dead-end road.

**Touches:** technical spec section 3.1 (schedule bullets), section 5.2 (when to raise warnings), section 8 (opening hours, late for a set time); tool design section 2.1 (`update_stop` rejects a visit time while no place is selected).

**Options:**
1. Let an empty stop hold a planned visit time. `add_stops` takes it for each stop as a required input ("a time, or none"), the same way it takes a set time. The schedule and the checks use it until a place is selected. Selecting a place replaces it as today. The drive to and from the empty stop is still missing, but the big error goes away.
2. Keep empty stops at no time, and have code skip the opening-hours and late checks for any stop that comes after an empty stop on the same day, until it is filled. Simpler, but hides real problems too.
3. Leave the design, and tell the coordinator to ignore check results on stops after an empty stop. This relies on the model reading the schedule carefully every time.

**Recommendation:** option 1. The coordinator already knows the length (it wrote "about 5 hours" in the purpose). Storing it as a time costs one more input and makes the times honest during the fill.

**Post-review analysis.** This came back from round 3 (F1), and the walker found something new.

Round 3 settled that an empty stop takes no time. The worker brief, not the schedule, tells a worker roughly when an empty stop happens. A planned visit time on the stop was considered and dropped. The cost we accepted was "no warnings about a stop until its place is picked."

What we didn't write down is what happens to the stops *after* an empty stop. Their times come out too early. That doesn't only delay warnings, it can cause a false one. On Moab Day 2, Milt's lands at 10:10 a.m., before it opens, only because the 5-hour hike in front of it counts as zero. The real problem, Milt's being closed by 3:35 p.m., shows up only once a trail is picked.

I disagree with the walker's option 1. It is the planned visit time we dropped last round. I'd keep the round 3 decision and fix only the new part:

- **Technical spec section 8, opening hours:** code marks an opening-hours result on a stop that comes after an empty stop on the same day: "An earlier stop on this day is still empty, so this time may be too early." Nothing is stored, and there's no new input. Code already knows which stops are empty.
- **Technical spec section 5.2:** the coordinator holds marked warnings until the empty stop is filled, the same way it holds warnings while a change is still being discussed. Once the stop is filled, the check runs fresh. This ties to F3: a warning the coordinator held back gets raised later, whatever its mark.
- **Technical spec section 3.1:** one sentence saying that times after an empty stop may be too early.

Only opening-hours results need the mark. An empty stop can only push later stops later. So a "late for a set time" warning, or a daily driving warning, that fires while a stop is empty is real. The driving check can also miss a problem until the stop is filled, as on Moab Day 4. That is the cost we already accepted.

The walker's option 2, skipping the checks after an empty stop, would also hide those real warnings.

**Settled (2026-10-12):** as proposed. Code marks an opening-hours result on a stop after an empty stop as "may be too early," and the coordinator holds it until the empty stop is filled. No planned visit time on the stop.

### F2. "Let's try the Sardine Factory after all" can't be done — **needs a decision**

**What happened.** San Francisco change 2: the coordinator looks up the Sardine Factory with `find_place` and rejects it ("we didn't like it last time"). Change 6: the user wants it for dinner on Day 1 instead of the Whaling Station. `find_place` returns it marked rejected, with the reason. `select_user_place` refuses it. There is no tool to undo a rejection, because a rejection is permanent for the trip (technical spec section 3.2, tool design section 2.1 `reject_places`). The coordinator can only say "I can't add it back in this version." The user asked for something reasonable about their own trip, and the app can't do it.

**Touches:** technical spec section 3.2 ("A rejection is permanent for the trip in the MVP"); tool design section 2.1; functional spec section 10.2.

**Options:**
1. Add an undo: let `reject_places` take "remove from the rejected list" for a place, or add `unreject_places`. Undoing only takes the place off the list. It does not bring back the candidates the rejection removed. The coordinator then uses `select_user_place` as for any named place.
2. Keep rejections permanent, and add a line to the coordinator's instructions to explain this plainly when it happens.
3. Make `select_user_place` itself lift the rejection when the user names the place again, since naming it is the user overriding their own earlier choice.

**Recommendation:** option 1. It's small, and it keeps the rule "the user's latest word wins" (functional spec section 10.4). Option 3 is tempting but makes one tool do two jobs.

**Post-review analysis.** This was settled in round 2 (F13) and again in round 3 (F2). A rejection is about the place, for the whole trip, and permanent in the MVP. The docs do say "permanent for the trip in the MVP." They don't say that undoing a rejection was left out on purpose, or what the coordinator tells the user who asks for a rejected place again. So the walker read it as a gap.

I disagree with the walker's option 1. Make the decision hard to miss instead:

- **Functional spec section 2, "Out of scope":** add "Taking back a place the user rejected, within the same trip."
- **Technical spec section 5.2, "When the user turns down a place":** when the user asks for a rejected place again, the coordinator says they turned it down earlier, gives the reason `find_place` returns, says this version can't bring it back, and offers other options.

The walk handled it this way already, as an assumption. With these two lines it is no longer an assumption.

**Settled (2026-10-12):** as proposed. Taking back a rejection is listed as out of scope in functional spec section 2, and technical spec section 5.2 says what the coordinator tells the user.

### F3. "Already known" tracks what code saw, not what the user heard — **needs a decision**

**What happened.** San Francisco change 5. `add_stay` for Big Sur returns three new warnings: trip length (4 days against 3), the Monterey breakfast's search area on the Big Sur to San Luis Obispo day, and that day's driving. The coordinator is in the middle of talking it through, so it doesn't raise them yet (technical spec section 5.2). Its next write, the first `move_stop`, returns them again marked "already known." The instructions say "stay quiet about check results marked already known." If the user had closed the tab here, the next session would see these warnings as already known. They would come up only if the user asked "what's left to decide?"

In one session the model can remember which warnings it deferred. But the mark itself doesn't say it, and across sessions it's lost. The mark compares with the previous write, and a single turn can have ten writes.

**Touches:** technical spec section 8 ("Each check result is marked new or already known"), section 5.2 (raise at end of turn, stay quiet about already known).

**Options:**
1. Compare against the list as it stood at the end of the previous turn, not the previous write. Within a turn, a warning that appeared in this turn stays "new" on every write. The app knows when a turn ends, so it saves the list then.
2. Store a "raised" mark on each saved check result, set by the coordinator (one more tool input or tool). The coordinator stays quiet only about results it has raised.
3. Leave it, and tell the coordinator to treat any open warning it hasn't raised in this conversation as new.

**Recommendation:** option 1. It needs no new tool, and it matches what the coordinator actually does: it reads results at the end of a turn. A warning deferred at the end of a session still needs a home, so also have the coordinator add an open item to trip memory when a session ends with a deferred warning. (Memory design is deferred; this only names the need.)

**Post-review analysis.** I agree that "already known" doesn't mean the user heard it. We hit this once before. Round 3 (F4) found that a write could list the "forecast now available" note before anyone raised it. That fix covered only the forecast note: the coordinator offers it at the start of a session, whether it's new or already known.

Within one session this isn't a real problem. The coordinator sees every write's reply in its context, so it knows what it held back. The gap is across sessions, when a session ends while a change is still being discussed.

I disagree with the walker's option 1. Comparing against the end of the previous turn fixes the case inside one turn, which the coordinator already handles. It doesn't help a discussion that runs over several turns. Option 2, a "raised" mark the coordinator sets, adds a tool input.

I'd fix it in the coordinator's instructions, technical spec section 5.2:

- "Already known" means an earlier write returned it. It doesn't mean the user heard it. Raise any warning you held back once the change is settled, whatever its mark.
- At the start of a new session, briefly mention open warnings, along with the forecast note. Example: "Still open from last time: the trip is 4 days, and you asked for 5." This replaces the forecast-only rule with one rule.

Caveat: an open warning the user put off ("let me think about it") comes up once each session. I think that's right, because it's still open.

**Settled (2026-10-12):** as proposed. Coordinator instructions only (technical spec section 5.2): raise a held-back warning once the change is settled, whatever its mark, and briefly mention open warnings at the start of a new session, with the forecast note.

### F4. The coordinator can't see which road a leg takes — **needs a decision**

**What happened.** San Francisco Day 2. The coordinator adds the Big Sur village waypoint to keep the leg on Highway 1 (technical spec section 3.3). `update_leg` replies with the new drive time and distance: "Day 2: 2 h 25 m → 3 h 20 m, 147 → 135 mi." The coordinator has to infer from that alone that the route moved to the coast. On San Francisco Day 1, the route preference is scenic, and the user's stops choose the road (technical spec section 4.2). The coordinator has to decide whether the stretch from San Francisco to Millbrae and the stretch from Santa Cruz to Monterey are "still open." It can't see which roads the stored route uses, only times. The route line goes to the UI only (Google design section 2.3). The same gap hits Moab Day 4: did the route go through Capitol Reef on UT-24, which is how a must-see area is honored (technical spec section 4.2)? Times and miles alone can't say.

**Touches:** technical spec sections 3.3 and 4.2 (skeleton bullets about must-see areas and the route preference); tool design section 2.1 (what a write returns), section 2.4 (`compute_route` returns no route line either); Google design section 2.3.

**Options:**
1. Store and return a short road summary for each leg, such as "CA-1 S, then US-101 S," built in code from the route. (Google Routes may offer a route description field. This wasn't tested and would need a check.) Return it in write replies when a leg is re-routed, and in reads.
2. Return the main towns the route passes through, worked out in code from the route line.
3. Leave it. The coordinator judges from times, and checks with `compute_route` against a known alternative when unsure.

**Recommendation:** option 1 if Google gives the summary cheaply, otherwise option 2. Steering by waypoint without being able to see the result is the weakest link in how scenic routes work.

**Post-review analysis.** I partly agree. The coordinator can't see the road, but the design doesn't depend on seeing it. A waypoint is a place the route must pass through (technical spec section 3.3). A waypoint at Big Sur village puts the route on Highway 1, because that is the only road there. For a must-see area, technical spec section 4.2 already says to add a waypoint inside it if needed, so Capitol Reef is certain. On San Francisco Day 1, the user's stops choose the road, and the coordinator doesn't question it.

So I wouldn't add a road summary now. Add one sentence to technical spec section 3.3: the coordinator picks a waypoint on the road it wants, so it doesn't need to see the route to know the leg uses that road.

If testing shows waypoints steering wrong, Google Routes appears to return a short description of each route (`routes.description`). That wasn't tested. It could be added then.

**Settled (2026-10-12):** as proposed. No road summary; technical spec section 3.3 says the waypoint is the guarantee.

### F5. Taking back a new stay after stops were moved onto it needs a workaround — **needs a decision**

**What happened.** San Francisco change 5. After `add_stay` for Big Sur, the coordinator proposes moving Point Lobos, Bixby, and the Monterey breakfast (First Awakenings) to the new Monterey-to-Big Sur day. The user agrees. (The prompt names only Point Lobos and Bixby. I added the breakfast, because the coordinator has to do something about its search-area warning, and moving it is the natural answer.) Then the user changes their mind.

`remove_stay` is refused, because three stops are on the Big Sur day (technical spec section 3.5). Point Lobos and Bixby move back fine: they are along the leg, and the Big Sur to San Luis Obispo day also drives to a new stay. First Awakenings can't move back. Its search area is the Monterey stay, and that day still starts in Big Sur until the stay is gone, so `move_stop` refuses it (technical spec section 8, "Search area doesn't fit the day": "`add_stops` and `move_stop` refuse to create this"). It can't stay where it is either, because it blocks the removal.

The only way through is to park it: move First Awakenings to Day 1 (which ends at Monterey, so it's allowed), remove the Big Sur stay, then move it to the start of the Monterey to San Luis Obispo day. That works, but it costs four extra re-routes, and while it's parked on Day 1 at 9:05 p.m., the opening-hours check returns a new "closed for the whole visit" warning the coordinator has to ignore. Nothing in the coordinator's instructions describes this. Technical spec section 5.2 says only "If the user changes their mind first, removing the stay puts everything back," which covers the case where nothing has moved yet.

**Touches:** technical spec section 3.5 (a stay is added; a stay is removed), section 5.2 (after adding or moving a stay), section 8 (search area doesn't fit the day); tool design section 2.1 (`move_stop`, `remove_stay`).

**Options:**
1. Let `move_stop` move a stop near a stay onto a day where that stay doesn't fit, with the existing search-area warning instead of a refusal. A move still can't change the search area. This only lets the plan pass through a state that adding a stay already creates.
2. Let `remove_stay` take a list of moves for the stops that block it ("stop X goes to day Y after Z"), applied as part of the removal and checked after the stay is gone.
3. Keep both refusals, and add the parking trick to the coordinator's instructions.

**Recommendation:** option 1. The warning already exists for exactly this state, so a refusal adds nothing. Option 2 is cleaner for the user but adds a complex input to a tool the model rarely uses.

**Post-review analysis.** Round 2 (F1) found this same deadlock, with the same breakfast stop. We judged it rare and chose not to design for it. Instead, technical spec section 5.2 tells the coordinator not to move stops onto a new stay's days until the user confirms the stay. Here the user confirmed and then changed their mind, which is the rare case we accepted. Round 3's change, letting a stop along the leg move to another driving day, made Point Lobos and Bixby movable both ways. Only stops near a stay are still stuck.

What's missing is how the coordinator gets out of it. I'd keep the refusal in `move_stop` and add the way out to technical spec section 5.2, "After adding or moving a stay": "If the user changes their mind after stops were moved, move them back, then remove the stay. A stop near the old stay can't go back to a day that still starts at the new stay. Move it to another day at the old stay first, remove the new stay, then move it where it belongs."

The extra re-routes and the short-lived "closed" warning are fine for a rare case. That warning comes and goes inside one turn, so it's never raised.

The alternative is the walker's option 1: turn the `move_stop` refusal into a warning. It removes the workaround, but it loosens a check that catches real mistakes, such as moving Moab lunch onto the Torrey day. I'd keep the check.

**Settled (2026-10-12):** the walker's option 1, not the analysis. Parking a stop on another day was turned down. `move_stop` lets a stop near a stay land on a day that doesn't start or end at that stay, with the existing search-area warning. Moving stops into code during `remove_stay` was also considered and dropped: on a multi-day stay the coordinator still has to sort out most stops, and stops already on the next day can conflict. `add_stops` keeps its refusal.

### F6. A stop on a rest day with no set time has no sensible time — **needs a decision**

**What happened.** Moab Day 3 is a rest day with one stop, dinner at The Spoke at a set time of 6:30 p.m. That works. But a rest day has no leg, so its stops have no drive times (technical spec section 3.1, "Any stops on it, such as dinner, are near the lodging and aren't routed"). Suppose the user also wants lunch on the rest day, with no set time. The schedule rule says a stop follows the stop before it plus the drive to it. The first stop follows the day's start. So lunch shows at 8:00 a.m., the trip brief's usual start time, and the opening-hours check tests it at 8:00 a.m. A lunch place closed at 8 gets a false "open, but not long enough" warning. The docs also don't say whether a rest day has a start time at all. The Moab example shows "No leg" and no "Starts" line.

**Touches:** technical spec section 3.1 (a rest day; schedule bullets); tool design section 2.1 (`add_stops`, `update_day`).

**Options:**
1. Require a set time for every stop on a rest day. `add_stops` and `move_stop` reject "none" on a rest day, and marking a rest day is refused while it holds a stop with no set time.
2. Allow it, but show such stops with no time ("any time") and skip the opening-hours and late checks for them.
3. Route rest-day stops after all, from the lodging and back, without calling it a leg. This brings back the driving the rest day was meant to avoid.

**Recommendation:** option 1. A rest day is the one place where "follows the stop before it" means nothing, and a set time is cheap to ask for.

**Post-review analysis.** I agree there's a gap, but it's small. A rest day has a start time like any other day: its own, or the trip brief's usual one. So a lunch with no set time lands at 8 a.m., the day's start, because no drive places it.

I disagree with option 1's refusals. Three tools would each gain a rule (`add_stops`, `move_stop`, and `update_day`). Instead:

- **Technical spec section 3.1, the rest day bullet:** stops on a rest day aren't routed, so each needs a set time.
- **Technical spec section 5.2:** the coordinator gives every stop on a rest day a set time.

If the coordinator forgets, the user sees lunch at 8 a.m. and can say so.

**Settled (2026-10-12):** as proposed. Wording in technical spec section 3.1 and an instruction in section 5.2; no tool refusals.

### F7. `read_itinerary` doesn't list several stop and stay properties the coordinator needs — **wording fix** and **for the object model**

**What happened.** Moab change 6, a new session. The coordinator reads the whole itinerary and must be able to brief a worker or answer "what's left" from it alone (technical spec section 7.2: "this is all the coordinator knows about the trip's places, along with trip memory"). The return list in tool design section 2.1 names stops, their selected place, candidates, the schedule, approvals, weather, and check results. It doesn't name a stop's kind, purpose, search area, set time, visit time, or tier with rule. It doesn't name a stay's tier, its rule, or the nights the tier was set for. It doesn't name a leg's waypoints, or its best order and time saved. Without purpose and tier, a "More options" brief in a later session can't be written (technical spec section 5.3 needs both).

**Touches:** tool design section 2.1 (`read_itinerary` returns); technical spec section 5.3.

**Options:**
1. List them in the `read_itinerary` row: for each stop, kind, purpose, search area, set time, visit time, and tier with rule; for each stay, tier, rule, and the nights it was set for; for each leg, waypoints, route type, and the stop-order result.
2. Say "every stored property of each item, plus what's worked out," and let the object model define the list.

**Recommendation:** option 2 in the tool design, with the object model listing them. A list in two places drifts.

**Post-review analysis.** I agree with the walker's option 2. Tool design section 2.1 (`read_itinerary`) should say it returns every stored property of each item, plus what's worked out. The object model then lists them. A list in two places would drift.

**Settled (2026-10-12):** as proposed. `read_itinerary` returns every stored property plus what's worked out; the object model lists them.

### F8. The detour call must include the leg's waypoints, or detours come out negative — **wording fix**

**What happened.** San Francisco Day 2, during the fill. No stops on the leg are selected. The leg runs Monterey → Big Sur village (waypoint) → San Luis Obispo, about 3 h 20 m. The leg scout adds Point Lobos as a candidate. `add_stop_candidates` makes one routing call with Point Lobos placed at its stop's position, then subtracts the leg's stored time (technical spec section 3.2). If that call leaves out the waypoint, Google routes Point Lobos → San Luis Obispo inland on US-101, about 2 h 40 m from Monterey in all. The "detour" comes out about −40 minutes. The docs say the call is made "against the leg as it is then," which suggests the waypoints are included, but they never say so. The stop-order check, by contrast, explicitly leaves waypoints out.

**Touches:** technical spec section 3.2 (detour time); tool design section 2.1 (`add_stop_candidates`).

**Options:**
1. Say it outright: the detour call includes the leg's waypoints, placed by code among the selected stops and the candidate, the same way as for the leg itself (technical spec section 3.3).
2. Measure the detour against a waypoint-free baseline too (one more call), so both sides of the subtraction match.

**Recommendation:** option 1. One sentence, and the subtraction is then like for like.

**Post-review analysis.** I agree. The leg's stored route goes through its waypoints, so the detour route has to as well, or the subtraction compares different roads. Add one sentence to technical spec section 3.2 (detour time) and tool design section 2.1 (`add_stop_candidates`): the detour call includes the leg's waypoints, placed by code the same way as for the leg (technical spec section 3.3).

**Settled (2026-10-12):** as proposed.

### F9. "Drive time from the previous stop" is unclear when the previous stop is empty, and the last drive has no home — **for the object model**

**What happened.** Moab Day 2 after change 5. The order is Delicate Arch (selected), the hike (empty), coffee (selected). Technical spec section 3.1 says each stop "holds the drive time from the previous stop." Coffee's previous stop is the empty hike, which has no place. The leg is routed through selected stops only (technical spec section 3.3), so the stored figure is really from Delicate Arch. Separately, the drive after the last stop to where the party sleeps (Desert Bistro → Moab hotel) is part of every schedule, but no doc says where it is stored. It isn't on a stop.

**Touches:** technical spec section 3.1 (stop row; schedule bullets), section 3.3 (leg properties).

**Options:**
1. Say "the drive time from the previous selected stop, or from where the party slept." Store the final drive on the leg ("drive time to the end").
2. Store all segment times as one list on the leg, in route order, and let code match them to stops when it works out the schedule.

**Recommendation:** option 2. The leg already owns everything the route call returns. A list on the leg keeps a stop free of a value that changes whenever another stop changes.

**Post-review analysis.** I agree, and I'd settle it now rather than wait for the object model, because the docs don't agree with each other. Technical spec section 3.1, the stop row, says a stop "holds the drive time from the previous stop, computed and stored with the day's leg." Technical spec section 3.3 says the leg stores drive time, distance, and route line. So it isn't clear which one holds the times between stops, and the drive after the last stop has nowhere to go.

I agree with the walker's option 2:

- **Technical spec section 3.3:** the leg stores the drive time for each segment, in route order, including the drive after the last stop.
- **Technical spec section 3.1:** take "holds the drive time from the previous stop" out of the stop row. Code matches segments to selected stops when it works out the schedule.
- **Technical spec section 3.2:** the detour-time bullet says "its stored drive time from the previous stop gives the real figure." Change it to point at the leg's segments.

A stop after an empty stop then gets its drive from the previous selected stop, which is what the route actually has.

**Settled (2026-10-12):** as proposed. The leg stores each segment's drive time, including the drive after the last stop. The stop no longer holds a drive time.

### F10. A stop after midnight gets hours for the wrong day from `search_near` — **wording fix**

**What happened.** Moab Day 4 (a Wednesday in the original dates). The Torrey stay researcher fills Panorama Point, set for "1:00 a.m., next day." `search_near` returns "hours on the stop's dates" (tool design section 2.3). The stop's day is Wednesday. The visit is on Thursday. The opening-hours check reads the real date (technical spec section 3.1), but the worker sees Wednesday's hours and may pick or reject a place on the wrong day.

**Touches:** tool design section 2.3 (`search_near` returns); technical spec section 5.3 (worker brief).

**Options:**
1. `search_near` returns hours for the stop's day and the next day when the stop's set time is after midnight.
2. The worker brief states the real date of a stop after midnight ("Thursday Oct 14, 1 a.m."), and the worker reads hours with that in mind.

**Recommendation:** option 1, since code already knows the set time. Option 2 is also worth one sentence in technical spec section 5.3.

**Post-review analysis.** I agree with the walker's option 1, made a bit simpler. Tool design section 2.3 (`search_near`): hours come back for the date the stop actually falls on, which is the next day for a set time after midnight. Code already knows the set time, and the opening-hours check already uses the real date (technical spec section 3.1). The worker brief already gives the set time as "1:00 a.m., next day," so it needs no change.

**Settled (2026-10-12):** as proposed.

### F11. A new session doesn't say it reads the trip brief — **wording fix**

**What happened.** Moab change 6. Technical spec section 5.2 says "At the start of a new session, the coordinator reads the whole itinerary." Functional spec section 10.1 says a new session "starts from the current itinerary, trip memory, and user memory." Neither names the trip brief. "What's left to decide?" needs it: the open trip-length warning only makes sense next to the brief's 5 days. "Why did we pick that hotel?" can need it too: the brief holds the budget rules.

**Touches:** functional spec section 10.1; technical spec section 5.2.

**Options:**
1. Add the trip brief to both: the coordinator reads the itinerary, the trip brief, and memory at the start of a new session.

**Recommendation:** option 1.

**Post-review analysis.** I agree. Add the trip brief to the start-of-session read in technical spec section 5.2 and functional spec section 10.1.

**Settled (2026-10-12):** as proposed.

### F12. The tier note fires when the rule's answer didn't change — **wording fix**

**What happened.** Moab change 5 drops Moab from 3 nights to 2. The rule is "mid-range for stays of 2+ nights," so the tier is still mid-range. The check results still include "Moab's nights changed from 3 to 2. Its tier was set for 3" (technical spec section 9). To clear it, the coordinator sets the same tier again with `update_stay`. That's fine, but technical spec section 9 says the coordinator "asks the user before changing anything." It doesn't say whether setting the same tier again is a change that needs asking. Code can't judge it, because the rule is the user's own words.

**Touches:** technical spec section 9.

**Options:**
1. Add: "When the rule gives the same tier for the new nights, set it again without asking, and don't mention it."

**Recommendation:** option 1.

**Post-review analysis.** I agree. Technical spec section 9 already says setting the same tier again clears the note. Add: "When the rule gives the same tier for the new nights, set it again without asking."

**Settled (2026-10-12):** as proposed.

### F13. A changed stop-order suggestion is still "already known" — **needs a decision** (small)

**What happened.** Moab Day 2. At the fill, the stop-order note suggests a faster order that saves about 20 minutes by doing the in-town meals first. The coordinator judges it not worth raising, since it would move the sunrise hike past 6 a.m. After change 5 (the long hike, Milt's moved to Day 1, Corona Arch dropped), the leg is re-routed and the note comes back with a different suggestion, saving about 15 minutes by a different swap. It is the same check about the same day, so it is marked already known (technical spec section 8), and the coordinator stays quiet. A new suggestion, possibly a good one, is never looked at.

**Touches:** technical spec section 8 ("Two check results are the same when they come from the same check about the same thing").

**Options:**
1. Treat a stop-order note as new when its suggested order changes.
2. Leave it. The time saved is "a rough signal," and the coordinator can look at the stored best order whenever it re-reads the day.

**Recommendation:** option 1. The suggested order is the note's whole content.

**Post-review analysis.** I disagree. Round 3 (F4) settled that two results are the same when they come from the same check about the same thing. A driving warning whose hours change stays already known. A stop-order note whose suggestion changes follows the same rule. The note is a rough signal, and the coordinator decides whether a note is worth raising. Every write that re-routes the leg returns the note's current text, so the coordinator sees the new suggestion anyway. No change.

**Settled (2026-10-12):** the rule stays, but technical spec section 8 now says it: a stop-order note whose suggested order changes is still already known, and the coordinator can still decide a new order is worth raising.

### F14. Removing a night re-routes legs that didn't change — **wording fix**

**What happened.** Moab change 5 removes Moab's third night, which was the rest day. The rest day had no leg. The next day (Moab to Torrey) still starts at the Moab hotel. Technical spec section 3.5 says "a day is added or removed ... and the legs around it are re-routed." Read literally, the Torrey day is re-routed for nothing: one paid Routes call, plus a stop-order call. The same happens when adding a night to a stay that is followed by a day starting at the same stay.

**Touches:** technical spec section 3.5 (a night is added or removed).

**Options:**
1. Say "re-routes any leg whose from or to changed," using the same before-and-after comparison code already does for a leg's places (technical spec section 3.5, "The places a leg passes through change").

**Recommendation:** option 1.

**Post-review analysis.** I agree. Round 3 (F9) settled that a leg is re-routed only when its selected places, in order, differ before and after a write. Extend that same comparison to the whole leg: code re-routes a leg only when its from, its to, its selected places in order, or its waypoints differ. Say this once at the top of technical spec section 3.5. Then the bullets for nights, stays, and lodging only need to say what changes. Removing Moab's rest day then changes nothing on the Torrey day, so it isn't re-routed.

**Settled (2026-10-12):** as proposed, stated once at the top of technical spec section 3.5.

### F15. Is a visit that ends exactly at closing "open long enough"? — **wording fix**

**What happened.** Moab change 2. Milt's follows the coffee stop with no set time and arrives at 11:30 a.m. It's planned for an hour and closes at 12:30 p.m. The visit ends exactly at closing. Technical spec section 8 says "open from the party's arrival to the end of the visit," which reads as passing, but doesn't say whether the ends count. A one-minute rounding difference would flip it to a warning.

**Touches:** technical spec section 8 (opening hours).

**Recommendation:** add "A visit that ends at closing time, or starts at opening time, is open long enough."

**Post-review analysis.** I agree. It's low priority. Add one sentence to technical spec section 8, opening hours: a visit that starts at opening time or ends at closing time is open long enough.

**Settled (2026-10-12):** as proposed.

### F16. Free time waits at the last stop, even when that's hours long — **needs a decision** (small)

**What happened.** Moab Day 4: Capitol Gorge ends at 4:40 p.m., then free time until 12:35 a.m. The schedule puts the party at a dead-end canyon for eight hours (technical spec section 3.1 says the party "waits where it is"). Technical spec section 3.1 accepts this for routing, but the user sees it in the schedule. The day also has no dinner, and nothing prompts one: a dinner stop is a judgment call the coordinator can miss. San Francisco Day 1 has the same pattern on a smaller scale: two hours of free time at the Boardwalk before dinner in Monterey.

**Touches:** technical spec section 3.1 (set times; late-night stop routed on the way in); functional spec section 9.5.

**Options:**
1. When the wait before a set time is longer than a setting (say 2 hours), show the free time at where the party sleeps: drive there first, wait, then drive out. The schedule shows it that way, but the route doesn't change. The daily driving check would then undercount by the extra drive, which is small near the lodging.
2. Leave the schedule, and have the coordinator mention a long gap ("you'll have the evening free in Torrey").

**Recommendation:** option 2 for the MVP. It's honest about the plan without a second kind of drive. Also add one line to the coordinator's instructions: check each day for a missing meal when laying it out.

**Post-review analysis.** This was settled in round 3 (F7): free time goes before the drive to a stop with a set time. The missing dinner on Moab Day 4 is functional spec section 12, open question 1 (meal coverage). The walker found nothing new about the schedule. But technical spec section 3.1 says the party "waits where it is," which suggests the party sits at Capitol Gorge for eight hours.

Fix the wording only: "If the party would get there early, it leaves later, so it arrives at the set time. The wait shows as free time before the drive." The schedule doesn't say where the party spends it.

I disagree with adding a coordinator instruction to check each day for a missing meal. That belongs to the open question on meal coverage. The coordinator can mention a long gap on its own judgment.

**Settled (2026-10-12):** wording only, as proposed.

### F17. When to change the trip brief's trip length during a stay that's still being discussed — **wording fix**

**What happened.** San Francisco change 5. Adding the Big Sur night makes the trip 4 days against a 3-day brief. Technical spec section 8 says "If the user agrees to the new length, the coordinator updates the brief." The user agreed to the night, so I had the coordinator update the brief to 4. When the user changes their mind, the trip is 3 days against a brief of 4, and the coordinator has to set the brief back. If it waits until the discussion ends instead, it never touches the brief. The docs don't say which.

**Touches:** technical spec section 8 (trip length vs the brief), section 5.2.

**Recommendation:** add "Update the trip length in the brief once the change is settled, at the same time as raising warnings, not while it's still being discussed."

**Post-review analysis.** I agree. Technical spec section 8, trip length vs the brief: "If the user agrees to the new length, the coordinator updates the brief once the change is settled." This matches the rule for raising warnings in technical spec section 5.2.

**Settled (2026-10-12):** as proposed.

### F18. Hours clashes for candidates nobody selected live only in the worker's result — **for the object model**

**What happened.** Moab change 2. The user wants a different pie place but doesn't remember the others. A scoped read of the stop (`read_itinerary` with the stop ID) gives the other two candidates with their rationales. It doesn't say whether they are open on that Wednesday. The leg scout's result said so, but results aren't stored (technical spec section 6.4: notes never name dates). In the same session the coordinator still has the result in context. In a later session it would need a `read_place` for each candidate and would have to read the weekly hours itself, or select one and see what the check says.

**Touches:** technical spec sections 3.2 (candidate notes), 6.4, 7.2.

**Options:**
1. A read scoped to a stop or stay also runs the opening-hours check for each unselected candidate, as if it were selected at the stop's current time, and shows "open," "closed," or "not known" beside it. Worked out, not stored.
2. Leave it to `read_place`.

**Recommendation:** option 1. It is computed from data already stored, and it is exactly what "pick another one" needs.

**Post-review analysis.** I disagree, and it's low priority. A read scoped to the stop gives the other candidates with their rationales. If the coordinator needs to know whether one is open, it can call `read_place` on the two or three of them, or select one and see the check result. In the same session, the worker's result is still in context, as in the walk. Running the opening-hours check on every candidate in every scoped read is cheap in code, but it adds a rule and output for one rare question. If you'd rather have it, it's a small change to tool design section 2.1 (`read_itinerary`).

**Settled (2026-10-12):** no new check in reads. Technical spec section 7.2 now says the coordinator reads the candidate's place, or selects it and sees the check result.

### F19. An opening-hours approval for a closed place never stops applying — **wording fix**

**What happened.** Moab change 2. The user first keeps Gifford Homestead, closed on Wednesdays. The approval records 0 minutes open. It "applies while the place is the same and at least that many minutes are open" (technical spec section 8). At least 0 minutes is always true, so this approval can never stop applying while Gifford stays selected. That's probably intended (closed is the worst case), but the docs' examples only show the partial case, and a reader could expect the approval to lapse if the stop moved to another closed day.

**Touches:** technical spec section 8 (opening hours approval).

**Recommendation:** add one sentence: "Approving a closed place records 0 minutes, so it applies for as long as that place stays selected."

**Post-review analysis.** I agree that it's intended. It's low priority. Add one clause to technical spec section 8, opening hours approval: "Approving a closed place records 0 minutes, so it applies as long as that place stays selected."

**Settled (2026-10-12):** as proposed.

### F20. Laying out a day of named stops costs many Routes calls — **for the object model** (cost)

**What happened.** San Francisco Day 1 has five stops the user named. Each `select_user_place` call re-routes Day 1 (technical spec section 3.5). From the second selected stop on, each re-route also runs the stop-order check, which costs one or two more calls (technical spec section 8). That's about 13 Routes calls to lay out one day, where one call at the end would do. At 10,000 free basic calls a month (Google design section 5) this is affordable, but it adds up across a trip and across "more options" rounds.

**Touches:** technical spec sections 3.5 and 8; tool design section 2.1 (`select_user_place`).

**Options:**
1. Let `select_user_place` take several selections in one call, and re-route once.
2. Run the stop-order check only at the end of a turn, not after every write.
3. Accept the cost.

**Recommendation:** option 2. It also cuts noise, since a stop-order note mid-layout is rarely useful.

**Post-review analysis.** This was settled in round 3 (F9). Batching selections was left for later, with no doc change. Because nothing in the docs says we accepted the cost, it came back.

The walker's option 2, running the stop-order check only at the end of a turn, is new. But code would need to know when a turn ends, and no write would carry the result back. I wouldn't do it.

Fix: one sentence in Google design section 5 (quotas and cost). Each selection re-routes its day, so laying out a day of five named stops costs about a dozen Routes calls, counting the stop-order check. That's accepted for the MVP. Selecting several places in one call can come later if usage shows a need.

**Settled (2026-10-12):** as proposed, a sentence in Google design section 5.

### F21. Short-lived driving warnings while the skeleton is half built — **wording fix**

**What happened.** San Francisco discovery. Once the start place, end place, and start date are set, the itinerary is a day trip: just the last day, San Francisco to Mike's house. That leg is routed at once (about 6 h 10 m), and the daily driving check warns: about 6.8 hours against 5. Technical spec section 5.2 says a skeleton built over several turns warns about trip length, and "that isn't worth raising." It says nothing about other warnings that only exist because the skeleton isn't finished. Read literally, the coordinator should tell the user their single day is too long. It also costs a paid route that `add_stay` replaces minutes later.

**Touches:** technical spec section 5.2 (raising warnings), section 3.5 (start or end place changes).

**Recommendation:** widen the sentence in technical spec section 5.2: "While the skeleton is still being built, don't raise trip-length or daily-driving warnings until the stays are in." Optionally, don't route the last day until the first `add_stay` or until the user says it's a day trip.

**Post-review analysis.** I agree. Round 2 (F4) saw the same last-day driving warning during discovery, but we only wrote down trip length. Widen the sentence in technical spec section 5.2: "While the skeleton is still being built, warnings that come only from it being unfinished, such as trip length and the last day's driving, aren't worth raising."

I disagree with the optional part, not routing the last day until the first stay. A day trip needs that route, and it's one basic call.

**Settled (2026-10-12):** as proposed. The sentence in technical spec section 5.2 covers any warning that comes only from the unfinished skeleton.

---

### Not tested: "forecast now available"

Both trips are in 2027, and "today" is in October 2026, so no stay came within 7 days and the note never fired. Walked on paper: if the user reopened the Moab trip on October 5, 2027, the start-of-session full read would include "Forecast now available" for the Moab stay (October 11 to 13). The coordinator offers to rerun the weather worker (technical spec section 5.2). If the user says yes, the worker's `stay_weather` call returns a forecast and `set_stay_weather` labels it so. I found no hole here, but a test with a trip close to today would confirm it.

**Post-review analysis.** Agreed, nothing to change. To test the note in a later round, the prompt could add a change where the user returns a week before the trip.

---

## 2. Properties and rules touched

Everything the walk relied on, grouped by object. **(not in docs)** marks something the walk needed that no doc names. **(unclear)** marks something the docs mention but don't pin down. "Worked out" means computed when read, not stored (technical spec section 3).

### Trip
- ID, owner (user). Created when a new conversation starts.
- Name and region: worked out from the trip brief's region, route, or theme and the start date's month ("Pacific Coast Highway, May 2027").
- Rejected places: list of place plus the user's reason. Permanent for the trip. No way to remove one (F2).
- Saved check results list: replaced after every write, used to mark new or already known. Compared per write (F3 proposes per turn).
- Rule: the trip comes from the session, never a tool input.

### Trip brief
- Region, route, or theme. Trip length (days). Interests and must-sees, each with why it matters (a list, replaced whole). Max driving hours per day. Route preference (scenic or fastest). Rest days (a wish, such as "one rest day in Moab"). Usual start time (default 8 a.m.). Budget posture: default tier plus rules in the user's words. Meal preferences.
- Rule: the brief holds wishes, the itinerary holds the plan. Changing the brief never changes the itinerary.
- Rule: `update_trip_brief` returns check results.
- When to change trip length while a change is still being discussed **(unclear, F17)**.

### Itinerary
- Start place (with a given name), end place (with a given name), start date. All three needed before `add_stay`.
- Stays in order; days in order. Created holding only the last day.
- Trip length: worked out as the number of days. End date worked out.
- Rule: start date in the past is refused; more than 14 days is refused.

### Place
- ID (`place_`), Google place ID (can be empty), coordinates, Google's name, a given name (used only when Google has none, such as an address), type shown on cards (set by the first candidate or `select_user_place` that offers it), rating, review count, price level, weekly hours (structured periods), summaries, links.
- Rejected or not: worked out from the trip's rejected list. `find_place` shows it with the reason.
- Rule: matched by Google place ID only. Stored once per trip. Kept when stops or stays go away.
- Short line: worked out from type, rating, price level, and area.

### Stay
- ID (`stay_`), place (usually a town), order.
- Nights: worked out from the days pointing to it.
- Dates: worked out (its nights plus the morning the party leaves).
- Lodging: a place, empty until selected. Lodging candidates.
- Tier, the rule that produced it, and the nights it was set for.
- Weather and clothing text, with its label (forecast or seasonal averages) and what it was written for: place, dates, activities (stop ID plus selected place ID, or stop ID alone).
- Activities: worked out (attraction stops whose search area is this stay, plus attraction stops along the legs of its days; the last day's along-leg stops count with the last stay).
- Where the party sleeps: the lodging once selected, otherwise the stay's place.
- Rules: adding or moving a stay lists the stops on days whose start or end changed. Removing a stay is refused while stops are on its days or use it as a search area. Removing a night is refused while that day holds stops.

### Day
- ID (`day_`), order, rest day or not, its own start time or none, stay it sleeps at (none for the last day), its stops in order, its leg (zero or one), its approvals.
- Date: worked out (start date plus order).
- Start time used: its own, or the trip brief's usual start time.
- Kinds of day, worked out, not stored: moves to a new stay or the end place; stays put (gains a leg with its first selected stop, loses it with the last); rest day (no leg).
- Rules: only a day that stays put can be a rest day. Marking a rest day removes the leg and its waypoints. Unmarking it rebuilds the leg without them.
- Start time on a rest day **(unclear, F6)**.
- Schedule: worked out. Each stop's arrival and end, free time (shown before the drive, waiting at the stop before), the drive after the last stop, a day running past midnight with set times written as "next day."

### Leg
- Held by its day. From and to: worked out.
- Stored: drive time, distance, route line, waypoints (place IDs, set by the coordinator), best order and time saved (from the stop-order check).
- Route type: worked out (the day's route type approval, otherwise the brief's preference).
- Segment drive times, including the drive after the last stop **(not in docs where the last one lives, F9)**.
- A road summary the coordinator can read **(not in docs, F4)**.
- Rules: waypoints are placed by code among selected stops by least added straight-line distance, one at a time. Re-routed only when its places or their order change, its waypoints change, or its from or to change (see F14).

### Stop
- ID (`stop_`), kind (meal or attraction), purpose (never when; can say how long), search area (a stay's ID, or along the leg), order in the day, set time or none, visit time, selected place, candidates, tier and rule (meal stops), approvals.
- Fixed once added: kind, purpose, search area.
- Drive time from the previous stop **(unclear when the previous stop is empty, F9)**.
- Arrival and end: worked out.
- Status: worked out (empty, proposed, selected).
- Visit time sources: candidate estimate (attraction), user's figure (named attraction), one hour (meal), or the coordinator's change. Reset on a new selection.
- Planned visit time for an empty stop **(not in docs, proposed in F1)**.
- Rules: search area must be the stay slept at the night before or that night, or the leg on a day that moves. A stop near a stay can move to any day that starts or ends there. A stop along the leg can move to another day that drives to a new stay or the end place. `move_stop` always restates the set time. A rest-day stop with no set time has no meaningful time **(F6)**.

### Candidate
- Held inside a stop or stay. Place, rationale, tier and rule (lodging and meals), how found with source link, notes (never naming dates), visit time estimate (attractions), detour time (along-leg stops), set number.
- When it was offered, so the card can label the detour time "as of when offered" **(not in docs as a stored value)**.
- Whether it was specified by the user (shows "your choice" instead of a tier).
- Rules: never changed after written. Removed only by a rejection, or when its stop or stay is removed. The card shows the newest set still present. A repeat in a set rejects the whole set. Not selecting is not rejecting. Detour call includes waypoints **(unclear, F8)**.
- Open or closed at the stop's current time, for "pick another one" **(not in docs, proposed in F18)**.

### Approval
- Kind, value, reason. On a day: drive hours (hours), route type (type). On a stop: opening hours (place, minutes of the visit within hours).
- Applies or not: worked out. Drive hours applies while the day's driving is at or under the hours. Opening hours applies while the place is the same and at least that many minutes are open (0 for a closed place, so it always applies, F19). Route type covers no warning.
- Rules: one of each kind per item; setting one replaces it; reason required; code removes an opening-hours approval when the selected place changes or is cleared; day approvals survive the leg going away.

### Check result
- Check (one row of technical spec section 8), subject (trip, stay, day, or stop), level (warning or note), message, new or already known (worked out against the saved list), approved (for warnings with an approval that applies).
- Raised to the user or not **(not in docs, F3 option 2)**.
- Rules: worked out fresh after every write. A result that goes away and returns is new. Notes never need approval. "Late for a set time" never takes an approval. The stop-order note is the same note even when its suggestion changes **(F13)**.

### Worker brief (not stored)
- Stop or stay IDs with day, dates, and nights; the day ID for a leg scout; resolved tier and rule; each stop's purpose, set time, and roughly when in plain words; the day's other stops in order with times, purposes, and selected names; interests, must-sees, meal preferences; places to leave out (earlier candidates, and what memory says to avoid).
- Weather worker: stay IDs only.
- The real date of a stop after midnight **(not in docs, F10)**.

### Settings (named in the docs)
- Driving buffer 10%. Late allowance 15 minutes. Stop-order minimum saving 15 minutes. Along-leg drop distance near the ends, about 2 miles. "Near" distance for `search_near`. Seasonal averages window: the stay's dates plus 7 days each side. Forecast range 7 days.

### Memory touchpoints (design deferred)
- Read at the start of discovery to prefill the brief; at the start of a new session; before raising a returning note; when answering "what's left" and "why did we pick that".
- Written for: how each stretch is planned (road fixed or places fixed); why the user chose an option ("the one with the hot tub"); declined notes (a stop order the user turned down); open items ("decide whether to keep 4 days"); rejections not about one place; pace ("we're slow"); and possibly a place rejection that should outlive the trip ("didn't like the Sardine Factory").

---

## 3. Step log

Notation: **C** = coordinator, **SR** = stay researcher, **LS** = leg scout, **WX** = weather and clothing worker, **code** = code inside a tool, **UI** = the itinerary view or a card click. "Checks" lists check results as level, new (N) or already known (K). Times are rounded. [mem] marks where the coordinator would read or write memory.

### 3.1 San Francisco to Mike's house

**Discovery**

1. **UI/code.** The user starts a new conversation. Code creates the trip, an empty trip brief, and an itinerary holding only the last day, `day_q2w8e4rt` (order 0, no date, no route).
2. **C** `read_memory` [mem: prefill the brief]. Nothing yet. User: "PCH from San Francisco to LA, three days, mid-May 2027."
3. **C** `update_trip_brief` {region: "Pacific Coast Highway, San Francisco to Los Angeles", trip length: 3}. Reply checks: trip length vs brief, warning, N (1 day against 3). Not raised: the skeleton isn't built (technical spec section 5.2). [mem: write "road fixed: Highway 1 the whole way" as the stretch kind, technical spec section 4.1]
4. **Change 1.** User: "We end at my friend Mike's place in Silver Lake, 2400 Example Ave. Start Thursday May 13." **C** `find_place` {"2400 Example Ave", "Los Angeles, CA"} → `place_mk3h8q2r`, address only, no name, type "premise." `find_place` {"San Francisco", "CA"} → `place_sf7k2m4p`. **C** `update_itinerary` {start: `place_sf7k2m4p` "San Francisco", end: `place_mk3h8q2r` "Mike's house", start date: May 13, 2027}. Code stores "Mike's house" as the place's name, since Google has none, and routes the last day: 6 h 10 m, 382 mi. Reply checks: trip length, warning, K; daily driving on the last day, warning, N (about 6.8 h with buffer against 5). **Assumption:** the coordinator treats this like the trip-length warning and doesn't raise it (F21). Trip name worked out: "Pacific Coast Highway, May 2027."
5. **C** asks about interests, driving, budget, meals. User: max 5 hours a day, scenic, the usual 8 a.m. start, "cheap and cheerful, but one nice meal in Big Sur," local spots over hotel breakfast, the last day "just get to Mike's fast." **C** `update_trip_brief` {interests and must-sees: Hangar One, Santa Cruz Boardwalk, the Big Sur coast (a road), elephant seals, good cake; max driving: 5; route preference: scenic; usual start: 8:00 a.m.; budget: "value by default; mid-range for one nice meal in Big Sur"; meals: "local cafés, not hotel breakfast"}. Reply checks: unchanged, all K.
6. **Shape** is skipped: the user gave a fixed route (technical spec section 4.2).

**Skeleton**

7. **C** `compute_route` {San Francisco (stop), Monterey (stop), Big Sur village (pass-through), San Luis Obispo (stop), `place_mk3h8q2r` (stop); order "keep"} → 2 h 0 m, 3 h 20 m, 3 h 35 m, with each plain name's resolved place. All three days fit under 5 hours with the buffer. Nothing saved.
8. **Change 2.** C proposes Monterey for night 1. User: "Fine, but no Sardine Factory, we didn't like it last time." **C** `find_place` {"Sardine Factory", "Monterey, CA"} → `place_sdf4k9m2`. **C** `reject_places` [{`place_sdf4k9m2`, "didn't like it last time"}]. Storage: added to the trip's rejected places. It was never a candidate, so the reply touches no stops or stays. [mem: C asks "Want me to remember that for future trips?" User: yes. Write to user memory.] User sees: "Got it. I'll leave the Sardine Factory out."
9. **C** `find_place` Monterey → `place_mt4n6w2x`; San Luis Obispo → `place_sb9d3f7b`. **C** `add_stay` {`place_mt4n6w2x`, "first", 1 night, value, "the trip default"} → `stay_mty8a3kc`. Code adds Day 1 `day_m3k9p2xs` (night at Monterey). The last day moves to order 1. Re-routed: Day 1, San Francisco → Monterey, 2 h 0 m; last day, Monterey → Mike's house, 5 h 30 m. Checks: trip length, warning, K (2 days against 3); daily driving on the last day, warning, K (hours changed, still known).
10. **C** `add_stay` {`place_sb9d3f7b`, after `stay_mty8a3kc`, 1 night, value, "the trip default"} → `stay_sp2r7fdk`, Day 2 `day_s7v4n8ht`. The last day is now Day 3. Re-routed: Day 2, Monterey → San Luis Obispo on US-101, 2 h 25 m; Day 3, San Luis Obispo → Mike's house, 3 h 35 m. Checks: trip length and the last-day driving warning both listed as gone.
11. **C** `update_day` {`day_q2w8e4rt`, approve route type: fastest, "wants to get to LA quickly"}. No re-route, no checks. The itinerary shows "Fastest: you want to get to LA quickly" on Day 3. No scenic waypoints go on Day 3.
12. **C** `find_place` {"Big Sur village", "Big Sur, CA"} → `place_bsv5g8h3`. **C** `update_leg` {`day_s7v4n8ht`, [`place_bsv5g8h3`]}. Code places it between Monterey and San Luis Obispo. Reply: "Day 2: 2 h 25 m → 3 h 20 m, 140 → 125 mi." The coordinator reads "longer but shorter in miles" as "on the coast now." It can't confirm the road (F4).
13. **Day 1 must-sees.** User: "Day 1: pancakes at Millbrae Pancake House, Hangar One, coffee at Philz in San Jose, the Boardwalk, and dinner at the Whaling Station at 7." C asks visit times: "People usually spend about two hours at Hangar One, and two at the Boardwalk. Sound right?" User: yes. C mentions that Hangar One has limited public access and to check tours (technical spec section 5.2, places the user names).
14. **C** `add_stops` {`day_m3k9p2xs`, "first", [meal "pancake breakfast," along the leg, none, value, trip default; attraction "airship hangar and aviation history," along the leg, none; meal "coffee," along the leg, none, value, trip default; attraction "classic seaside boardwalk and rides," along the leg, none; meal "seafood dinner," near `stay_mty8a3kc`, 7:00 p.m., value, trip default]} → `stop_mp3k8x2a`, `stop_h7n9g4wc`, `stop_pz6c3t8e`, `stop_bw4y7r2n`, `stop_ws8u5q3d`. No re-route (all empty). No checks: dinner's set time is reached at 8:00 a.m. while everything before it is empty.
15. **C** `find_place` for each named place. Philz returns three San Jose matches; C asks which; user says "the one on The Alameda." **C** `select_user_place` five times, such as {`stop_h7n9g4wc`, `place_hg5m2w7k`, "Hangar One," "attraction," "aviation history," visit time 2 h}. Meals get one hour. Each call re-routes Day 1; from the second on, each also runs the stop-order check (F20). Final: Day 1, 2 h 0 m → 2 h 45 m, 128 mi. Checks: Hangar One hours not known, note, N (walk assumption: Google has no hours for it). Stop order: Google's order matches, so no note. Day 1 gets no waypoints: the user's stops choose the road, and Santa Cruz to Monterey is Highway 1 anyway. No route label shows.
    Day 1 schedule: starts 8:00 · drive · **Millbrae Pancake House 8:25–9:25** · drive · **Hangar One 9:50–11:50** · drive · **Philz 12:05–1:05** · drive · **Boardwalk 1:55–3:55** · free time 3:55–6:00 · drive · **Whaling Station 7:00–8:00** (set time) · drive · Monterey (town) 8:05.
16. **Change 4.** User: "Make it five hours at the Boardwalk." **C** `update_stop` {`stop_bw4y7r2n`, visit time 5 h}. No re-route. Checks: late for a set time, warning, N: "You'd reach dinner at 7:55, but it's set for 7:00." C raises it at the end of the turn with two choices: dinner at 8, or leave the Boardwalk at 5. User: dinner at 8. **C** `update_stop` {`stop_ws8u5q3d`, set time 8:00 p.m.}. Checks: the late warning listed as gone. Whaling Station is open until 9:30 (walk assumption), so the opening-hours check passes. No approval: "late for a set time" never takes one.
    Day 1 now: Boardwalk 1:55–6:55 · free time 6:55–7:00 · drive · **Whaling Station 8:00–9:00** · drive · Monterey 9:05.
17. **Day 2 layout.** **C** `add_stops` {`day_s7v4n8ht`, "first", 7 items: meal "coffee and a hearty breakfast," near `stay_mty8a3kc`, none, value, trip default; attraction "coastal walk among cypress and sea lions, about 1.5 hours," along the leg, none; attraction "quick look at a famous bridge," along the leg, none; meal "a nicer lunch with an ocean view," along the leg, none, mid-range, "one nice meal in Big Sur"; attraction "elephant seals," along the leg, none; meal "tri-tip," near `stay_sp2r7fdk`, 6:30 p.m., value, trip default; meal "dessert," near `stay_sp2r7fdk`, none, value, trip default]} → `stop_fa2k6m9w`, `stop_pk7x3d5r`, `stop_bx9c4h2g`, `stop_np5t8v3y`, `stop_pb3w7k6s`, `stop_fg6r2n9h`, `stop_cc4m8x5t`. No re-route. No checks.
    Day 2 schedule now: starts 8:00 · six stops with "time set once a place is picked" · Firestone stop at 6:30 p.m. (set time).

**Fill**

18. **C** briefs three workers at once with `Agent` (technical spec section 4.2). No leg scout for Day 1, because every stop there is named and selected. None for Day 3, which has no stops.
    - **SR Monterey:** `stay_mty8a3kc` lodging, value, "the trip default," Thu May 13, 1 night; `stop_fa2k6m9w` on Day 2, Fri May 14, "coffee and a hearty breakfast," no set time, "first thing; they leave the hotel at 8, so about 8 to 9 a.m."; Day 2's other stops in order (all empty, tri-tip dinner at 6:30 p.m.); interests; meals "local cafés, not hotel breakfast." Places to leave out: none. The Sardine Factory is left out by the tools.
    - **SR San Luis Obispo:** `stay_sp2r7fdk` lodging, value, trip default, Fri May 14; `stop_fg6r2n9h` "tri-tip," 6:30 p.m.; `stop_cc4m8x5t` "dessert," "right after dinner, about 7:30." Interest: "good cake."
    - **LS Day 2:** day `day_s7v4n8ht`, Fri May 14; stops `stop_pk7x3d5r`, `stop_bx9c4h2g`, `stop_np5t8v3y` (mid-range, "one nice meal in Big Sur"), `stop_pb3w7k6s`; "they leave Monterey about 9:10 after breakfast; coastal walk mid-morning; the bridge before lunch; lunch around noon in Big Sur; seals early afternoon; they must reach San Luis Obispo for a 6:30 dinner."
19. **SR Monterey** `search_near` {`stay_mty8a3kc`, "value hotels near Cannery Row"}; `search_near` {`stop_fa2k6m9w`, "breakfast café"} → hours for Fri May 14 only. `add_stay_candidates` {`stay_mty8a3kc`, 3 hotels, each value, "the trip default"} → "Set 0 for stay_mty8a3kc: 3 candidates." `add_stop_candidates` {`stop_fa2k6m9w`, First Awakenings, Old Monterey Café, Rosine's, each value} → set 0. No detour times: the stop is near a stay. Returns six lines.
20. **SR San Luis Obispo** does the same: lodging set 0 (three value motels); tri-tip set 0 (Firestone Grill and two others); dessert set 0 (Copper Café at the Madonna Inn, using the café's own listing per technical spec section 6.4, plus two others).
21. **LS Day 2** `search_along_leg` {`day_s7v4n8ht`, "state park coastal trail"}, {"scenic viewpoint"}, {"restaurant ocean view"}, {"elephant seal viewing"}. The route line is Monterey (town) → Big Sur village → San Luis Obispo (town), because no Day 2 stop is selected yet. The waypoint is what keeps the search on the coast. Without it, results would come from Salinas and King City on US-101. Code drops places within 2 miles of either end: Cannery Row spots and the Madonna Inn. Point Lobos, about 5 miles out, stays. `WebSearch` {"Big Sur California unusual places", allowed_domains atlasobscura.com} → Henry Miller Library and others. `add_stop_candidates` four times. For each candidate, code makes one routing call with the candidate at its stop's position and the waypoint placed among them. **Assumption:** the call includes the waypoint (F8). Detours: Point Lobos about 8 minutes, Bixby about 2, Nepenthe about 2, Piedras Blancas about 3. Returns: four sets with one line each, plus "Nepenthe takes no lunch reservations; expect a wait."
22. **C** summarises in chat. Option cards appear for 2 lodgings and 7 stops. Each candidate shows tier and rule, such as "value, from: the trip default." The Whaling Station's card on Day 1 shows "your choice."
23. **User** clicks Select on several cards over several turns. Each click reaches C as a message. **C** `select_candidate` {`stay_mty8a3kc`, Monterey Bay Lodge} re-routes Day 1 (it now ends at the hotel) and Day 2 (it now starts there). [mem: user says "the one by the water"; C writes it to trip memory.] **C** `select_candidate` for First Awakenings, Point Lobos, Bixby, Nepenthe, Piedras Blancas, Firestone, and Copper Café. Each sets the visit time (candidate estimate for attractions, one hour for meals) and re-routes Day 2. The Big Sur waypoint ends up placed between Bixby and Nepenthe, where it changes nothing.
24. **Change 3.** On the San Luis Obispo hotel card, the user clicks "Higher tier." UI sends "User asked for a higher tier on the San Luis Obispo hotel card." **C** `update_stay` {`stay_sp2r7fdk`, tier mid-range, rule "the user asked for a higher tier"}. Code records the stay's 1 night with it. No checks. **C** `Agent` SR San Luis Obispo: lodging only, mid-range, that rule; leave out the three set-0 motels. **SR** `search_near`, then `add_stay_candidates` → set 1: Garden Street Inn, Madonna Inn (the hotel, a different place from the Copper Café listing), and Petit Soleil, each "mid-range, from: the user asked for a higher tier." The card now shows set 1. **User** selects Garden Street Inn. **C** `select_candidate` {`stay_sp2r7fdk`, `place_gs4t8k2w`}. Re-routed: Day 2 now ends at the inn, Day 3 starts there. User sees: "Garden Street Inn is your San Luis Obispo stay." A later "More options" would stay mid-range.
    Day 2 schedule: starts 8:00 · drive · **First Awakenings 8:10–9:10** · drive · **Point Lobos 9:25–10:55** · drive · **Bixby Creek Bridge 11:10–11:30** · drive · **Nepenthe 12:05–1:05** · drive · **Piedras Blancas 2:35–3:20** · free time 3:20–5:35 · drive · **Firestone Grill 6:30–7:30** (set time) · drive · **Copper Café 7:35–8:35** · drive · Garden Street Inn 8:45. Driving: about 3 h 55 m of road, 4 h 20 m with buffer, under 5. Stop order: Google's order matches, so no note.
    Day 3: starts 8:00 · drive (fastest, US-101) · Mike's house about 12:00 p.m.

**Weather and clothing**

25. Most selections are made. **C** `Agent` WX with [`stay_mty8a3kc`, `stay_sp2r7fdk`]. **WX** `stay_weather` {`stay_mty8a3kc`, `place_mt4n6w2x`} → seasonal averages (dates are a year out), "Typical for this time of year, based on 2016–2025": highs about 64 °F, lows about 49 °F, rain on about 8% of days; activities Hangar One (Day 1, 9:50 a.m.) and the Boardwalk (Day 1, 1:55 p.m.), since attractions along Day 1's leg count for the Monterey stay. **WX** `set_stay_weather` {`stay_mty8a3kc`, text}. Code labels it seasonal averages and records the place, dates (May 13–14), and activities (two stop IDs with place IDs). Same for San Luis Obispo: activities Point Lobos, Bixby, Piedras Blancas, all along Day 2's leg. WX returns two lines. The UI shows each stay's text with "Weather data by Open-Meteo.com."

**Refine**

26. **Change 5.** User: "Let's add a night in Big Sur between Monterey and San Luis Obispo." **C** `find_place` {"Big Sur", "CA"} → `place_bsv5g8h3`, the same place as Day 2's waypoint. **C** `add_stay` {`place_bsv5g8h3`, after `stay_mty8a3kc`, 1 night, value, trip default} → `stay_bsr6t4nh`. Code adds `day_b5r2j6yu` (night at Big Sur) as the new Day 2. The old Day 2 (`day_s7v4n8ht`) is now Day 3 and drives Big Sur → San Luis Obispo. Its waypoint is now the place it starts from, which changes nothing. The last day is Day 4. Dates after Day 1 move one day later. Re-routed: new Day 2, Monterey Bay Lodge → Big Sur (town), about 1 h; Day 3, Big Sur → First Awakenings (back north in Monterey) → Point Lobos → Bixby → Nepenthe → … → Garden Street Inn, about 5 h 15 m. Reply lists the stops on Day 3, whose start changed. Checks: trip length vs brief, warning, N (4 days against 3); search area doesn't fit the day, `stop_fa2k6m9w` on Day 3 (it's near Monterey, the day starts in Big Sur), warning, N; daily driving on Day 3, warning, N (about 5.8 h against 5); weather out of date for `stay_bsr6t4nh` (no text while others have some), note, N; opening hours re-checked for every stop on Days 3 and 4 because their dates moved (all fine). Stop order on Day 3: the backtrack north is shared by every order, so no note (technical spec section 8).
27. **C** (still discussing, so it raises nothing as warnings yet): "Big Sur is in. Day 3 now starts in Big Sur but still has breakfast in Monterey, Point Lobos, and Bixby, which are behind you. I'd move all three to the new Day 2, the drive from Monterey to Big Sur." User: "Yes, Point Lobos and Bixby, and breakfast too." (I added breakfast. See F5.) User also agrees to a 4-day trip. **C** `move_stop` {`stop_fa2k6m9w`, `day_b5r2j6yu`, "first", none}: allowed, since Day 2 starts at the Monterey stay. **C** `move_stop` {`stop_pk7x3d5r`, `day_b5r2j6yu`, after `stop_fa2k6m9w`, none} and {`stop_bx9c4h2g`, …, after `stop_pk7x3d5r`, none}: both allowed, because they're along the leg and Day 2 drives to a new stay. Each move re-routes both days. The candidates keep their old detour times, labeled as of when offered. Checks after the last move: the search-area and Day 3 driving warnings listed as gone; trip length, warning, K; weather out of date for San Luis Obispo, note, N (Point Lobos and Bixby left its activities); weather out of date for Big Sur, note, K. **C** `update_trip_brief` {trip length: 4} → trip-length warning gone (F17). **C** `Agent` SR Big Sur: lodging only, value, trip default, Fri May 14 → set 0 of three. Card shown. No weather rerun: the change is still being discussed.
    New Day 2: starts 8:00 · **First Awakenings 8:10–9:10** · **Point Lobos 9:25–10:55** · **Bixby 11:10–11:30** · drive · Big Sur about 11:50.
28. User, same session: "Actually, let's not do Big Sur. Put it back." **C** `remove_stay` {`stay_bsr6t4nh`} → refused, listing First Awakenings, Point Lobos, and Bixby. **C** `move_stop` {`stop_pk7x3d5r`, `day_s7v4n8ht`, "first", none} and {`stop_bx9c4h2g`, `day_s7v4n8ht`, after `stop_pk7x3d5r`, none}: both allowed. **C** `move_stop` {`stop_fa2k6m9w`, `day_s7v4n8ht`, "first", none} → refused: that day starts in Big Sur, so it would create a search-area misfit. **Assumption:** the coordinator works out the parking trick (F5): `move_stop` First Awakenings to Day 1 after the Whaling Station (allowed: Day 1 ends at Monterey). Check: First Awakenings at 9:05 p.m., closed for the whole visit, warning, N (ignored). **C** `remove_stay` {`stay_bsr6t4nh`} → done. Its day and lodging candidates go. Day 3 becomes Day 2 again, Monterey → San Luis Obispo, re-routed. **C** `move_stop` {`stop_fa2k6m9w`, `day_s7v4n8ht`, "first", none} → allowed now. Day 1 and Day 2 re-routed. Checks: trip length, warning, N (3 days against a brief of 4); weather out of date notes for San Luis Obispo and Big Sur both listed as gone (San Luis Obispo's activities and dates match what was recorded). **C** `update_trip_brief` {trip length: 3} → gone. No weather rerun is needed. [mem: write nothing. The Big Sur question is settled.] User sees the itinerary back as it was in step 24.
29. **Change 6.** User: "Let's try the Sardine Factory after all, instead of the Whaling Station on Day 1." **C** `find_place` {"Sardine Factory", "Monterey, CA"} → `place_sdf4k9m2`, marked rejected: "didn't like it last time." **Assumption:** the coordinator knows `select_user_place` would refuse it, and that there's no undo. C: "Earlier you asked me to rule out the Sardine Factory for this trip, and I can't add it back in this version. I can keep the Whaling Station, or find you other seafood options for that dinner." (F2.) [mem: the user memory item from step 8 is now out of date. C asks whether to forget it, and calls `forget_memory_item` on yes.] User keeps the Whaling Station.

**Finished state vs the example:** matches technical spec section 3.1, except that dinner on Day 1 is at 8:00 p.m. (change 4) with five hours at the Boardwalk, and the San Luis Obispo hotel is mid-range from the user's higher-tier request (change 3).

### 3.2 Grand Junction to Salt Lake City through Moab

**Discovery**

1. **UI/code.** New conversation. Code creates the trip, an empty brief, and an itinerary with only the last day, `day_z9x4c7vb`.
2. **C** `read_memory` [mem]. User memory says "usually drives up to 6 hours." User: "Grand Junction to Salt Lake through Moab. Only 4 hours of driving a day this time." C asks whether that changes the usual limit. User: one-off. Memory left alone (functional spec section 11, S10).
3. **Change 1.** User: "We start October 10, 2027, five days." **C** `find_place` Grand Junction → `place_gj3r8t6y`; Salt Lake City → `place_sc5w2n9k`. **C** `update_itinerary` {start `place_gj3r8t6y` "Grand Junction", end `place_sc5w2n9k` "Salt Lake City", start date Oct 10, 2027}. Last day routed: 4 h 30 m. **C** `update_trip_brief` {region: "Grand Junction to Salt Lake City through Moab", trip length 5}. Checks: trip length vs brief, warning, N (1 against 5); daily driving on the last day, warning, N. Neither raised: the skeleton isn't built (F21). Trip name: "Grand Junction to Salt Lake City through Moab, October 2027."
4. **C** asks about interests and the rest. **C** `update_trip_brief` {must-sees: Delicate Arch at sunrise (place), Goblin Valley (place), Arches (area), Capitol Reef (area), Highway 128 along the river (road), stargazing (activity); interests: pie, red-rock hikes; max driving 4; route scenic; rest days: "one lazy day in Moab"; usual start 8:00 a.m.; budget: "value by default, mid-range for stays of 2+ nights"; meals: local spots}. C suggests Torrey for the last night, close to Capitol Reef and its dark skies. User agrees. [mem: write stretch kinds: Highway 128 is a fixed road; the rest is fixed places.]
5. **C** asks whether "mid-range for 2+ nights" covers meals in Moab (technical spec section 9). User: "Just hotels. But one special dinner in Moab." **C** `update_trip_brief` {budget: "value by default; mid-range hotels for stays of 2+ nights; one special dinner in Moab"}.
6. **Shape** skipped: the route is fixed.

**Skeleton**

7. **C** `compute_route` {Grand Junction (stop), Dewey Bridge (pass-through), Moab (stop), Goblin Valley (stop), Torrey (stop), Salt Lake City (stop); keep}. Dewey Bridge resolves to a point on UT-128, not Salt Lake City, so the times are sane: 2 h 5 m, 1 h 45 m, 1 h 30 m, 3 h 25 m.
8. **C** `find_place` Moab → `place_mb7h4d2q`, Torrey → `place_tr6k3p8m`. **C** `add_stay` {Moab, "first", 3 nights, mid-range, "stays of 2+ nights"} → `stay_mab3k8wq`; Days 1–3 `day_a4h8n2wk`, `day_c6p3t9re`, `day_e2v7m5yu`. Days 2 and 3 stay put with nothing selected, so they have no leg. Re-routed: Day 1 (1 h 50 m on I-70 and US-191) and the last day (Moab → Salt Lake City). Checks: trip length, warning, K (4 against 5).
9. **C** `add_stay` {Torrey, after `stay_mab3k8wq`, 1 night, value, "the trip default"} → `stay_trr7h2xc`, Day 4 `day_g8k4s3hn`. Last day is Day 5, Torrey → Salt Lake City, 3 h 25 m. Checks: trip length and the last-day driving warning listed as gone.
10. **C** `update_day` {`day_e2v7m5yu`, rest day: yes}. It has no leg to remove.
11. **C** `find_place` {"Dewey Bridge", "Grand County, UT"} → `place_db4f9w2j` (address on UT-128, checked). **C** `update_leg` {`day_a4h8n2wk`, [`place_db4f9w2j`]} → "Day 1: 1 h 50 m → 2 h 5 m." No waypoints on Day 4: Goblin Valley and Capitol Reef will choose the road. Day 5: C judges there's no scenic road worth adding under 4 hours and leaves it with no waypoints. **Assumption:** this is the coordinator's call, and nothing tells the user (no route label shows unless an approval exists).
12. **Must-sees that are one place.** **C** `add_stops` {`day_c6p3t9re`, "first", [attraction "sunrise hike to Delicate Arch," near `stay_mab3k8wq`, 6:00 a.m.]} → `stop_da9w4k2m`. Checks: late for a set time, warning, N: "Day 2 starts at 8:00, but the hike is set for 6:00." C, at the end of the turn: "To make sunrise, Day 2 would start at 5:30. OK?" User: yes. **C** `update_day` {`day_c6p3t9re`, start 5:30 a.m.} → gone. C: "Most people take about 2½ hours for Delicate Arch. Sound right?" Yes. **C** `find_place` Delicate Arch trailhead → `place_dt8k3m6w`; `select_user_place` {`stop_da9w4k2m`, `place_dt8k3m6w`, "Delicate Arch trail," "hiking area," "sunrise at Delicate Arch," 2.5 h}. Day 2 gains a leg (its first selected stop): Moab (town) → trailhead → Moab. Opening hours: open 24 hours (example's assumption), open long enough, no result. C mentions Arches' timed-entry reservations (April to October, 7 a.m. to 4 p.m.) and that a 6 a.m. arrival is before the window.
13. **C** `add_stops` {`day_g8k4s3hn`, "first", [attraction "Goblin Valley hoodoos," along the leg, none]} → `stop_gv6r3w8k`; `select_user_place` with 2 h. Day 4 re-routed: Moab → Goblin Valley → Torrey, about 3 h 15 m. It passes through Capitol Reef on UT-24, which takes care of that must-see area. The coordinator can only tell from the time (F4).
14. **Laying out the other stops** (one `add_stops` per day):
    - Day 1, after nothing ("first"): attraction "red-rock towers by the river road, a short walk," along the leg, none → `stop_ft6n3k8w`; meal "brewpub dinner," near Moab, 6:00 p.m., value, trip default → `stop_mb2x7r4p`.
    - Day 2, after `stop_da9w4k2m`: attraction "short walk among the big arches in Arches," near Moab, none → `stop_wn3h8t6c`; meal "coffee and breakfast burritos," near Moab, none, value → `stop_ve5p2y7s`; meal "burgers and shakes," near Moab, 12:00 p.m., value → `stop_mt7c4x9e`; attraction "arch hike outside the park, about 2 hours," near Moab, none → `stop_cr2k6w8d`; meal "a special dinner," near Moab, 7:00 p.m., posh, "one special dinner in Moab" → `stop_db8n3v5h`.
    - Day 3 (rest day): meal "casual dinner near the hotel," near Moab, 6:30 p.m., value → `stop_sp4y9m2t`. It has a set time, so F6 doesn't bite.
    - Day 4, after `stop_gv6r3w8k`: meal "pie," along the leg, none, value → `stop_pe2t7h4n`; attraction "a short hike in Capitol Reef," along the leg, none → `stop_cg9k5x3a`; attraction "stargazing," near Torrey, "1:00 a.m., next day" → `stop_pp3m8w6v`.
    - C proposes a late start after stargazing. **C** `update_day` {`day_z9x4c7vb`, start 10:00 a.m.}.
    No re-routes (all empty). No checks.

**Fill**

15. **C** `Agent`, four workers at once:
    - **SR Moab:** lodging (mid-range, "stays of 2+ nights," Oct 10–13, 3 nights); Day 1 brewpub (6 p.m.); Day 2 arches walk ("right after Delicate Arch, about 8:45"), coffee ("back in town mid-morning, about 10:15"), burgers (noon), arch hike ("early afternoon"), special dinner (7 p.m., posh); Day 3 dinner (6:30 p.m.).
    - **SR Torrey:** lodging (value, trip default, Oct 13); stargazing ("1:00 a.m. after Day 4, so early Thursday morning"). **Assumption:** the brief states the real date, since `search_near` would give Wednesday's hours (F10).
    - **LS Day 1** (`day_a4h8n2wk`): `stop_ft6n3k8w`, "they leave Grand Junction at 8, so about 9:45."
    - **LS Day 4** (`day_g8k4s3hn`): pie ("after Goblin Valley ends about noon, so around 12:30 to 1:30"); Capitol Reef hike ("mid-afternoon"); the stargazing stop listed as a later, empty stop.
16. **SR Moab** runs `search_near` per stop, plus `WebSearch` "must-see things to do in Moab Utah" and an Atlas Obscura search (2+ nights, web search design section 2), and adds sets: lodging (three mid-range hotels), Windows Section / Double Arch / Balanced Rock, Love Muffin / Moab Coffee Roasters / Jailhouse Café, Milt's / two others, Corona Arch / Hunter Canyon / Grandstaff Canyon, Desert Bistro / two others, The Spoke / two others. Its result flags: "Milt's closes at 12:30 p.m., so a noon visit is tight."
17. **LS Day 1** `search_along_leg` {`day_a4h8n2wk`, "viewpoint"} along the Dewey Bridge route. It drops places within 2 miles of Grand Junction and of Moab. Fisher Towers, about 21 miles from Moab, stays. Detours are worked out by `add_stop_candidates` with the waypoint in the call: Fisher Towers about 20 minutes (a dirt spur road). Result: "Fisher Towers has no hours on Google."
18. **LS Day 4** `search_along_leg` {`day_g8k4s3hn`, "pie"}, {"bakery café"}, {"Capitol Reef trail"}. The route line is Moab → Goblin Valley → Torrey (the only selected stop). Code drops places within 2 miles of Torrey, so a pie shop in Torrey itself is never offered for this along-leg stop. That belongs to the Torrey researcher. The search misses Capitol Gorge, at the end of a dead-end road. The leg scout uses `find_place` {"Capitol Gorge", "Capitol Reef National Park, UT"} from its own knowledge. Sets: pie = Gifford Homestead, Stan's Burger Shack (Hanksville), Blondie's Eatery (Hanksville); hike = Capitol Gorge, Grand Wash, Hickman Bridge. Detours, each measured between Goblin Valley and Torrey: Gifford about 2 minutes, Stan's about 1, Capitol Gorge about 40 (the spur). Result: "Gifford Homestead is closed on Wednesdays, and Day 4 is a Wednesday."
19. **SR Torrey** adds lodging (three value motels) and stargazing (Panorama Point, Sunset Point, Goosenecks Overlook). Notes: "International Dark Sky Park."

**Selections and the opening-hours check (change 2)**

20. **User** selects the Moab hotel: "the one with the hot tub." **C** `select_candidate` {`stay_mab3k8wq`, `place_hd5r8k3m`}. Re-routed: Day 1 (now ends at the hotel), Day 2 (starts and ends there), and Day 4 (starts there). Day 3 is a rest day and has no leg. [mem: write "picked the Moab hotel for the hot tub."] The user also selects the Torrey motel, Panorama Point, and the Moab meals and walks.
21. **Fisher Towers.** **C** `select_candidate` {`stop_ft6n3k8w`, Fisher Towers}. Day 1 re-routed; the Dewey Bridge waypoint is placed between Grand Junction and Fisher Towers. Checks: opening hours not known, note, N. C chooses to mention it: "Google has no hours for Fisher Towers. It's a trailhead and usually open, but check before you go." The card shows "Hours not confirmed. Check before you go."
22. **Delicate Arch.** Already selected (step 12). Open long enough, so nothing is said.
23. **Milt's.** **C** `select_candidate` {`stop_mt7c4x9e`, Milt's}. Day 2 re-routed. Checks: opening hours, open but not long enough, warning, N: "Milt's closes at 12:30 p.m. You'd get there at noon, with an hour planned. Times are estimates from average drive times." User: "Can we move it to the morning?" Milt's opens at 11 a.m. (walk assumption), so C tries **`update_stop`** {`stop_mt7c4x9e`, set time 11:00 a.m.}. Checks: the opening-hours warning is gone, but there's a late for a set time warning, N: "You'd reach Milt's at 11:30, but it's set for 11:00" (coffee ends at 11:20). C settles it without an approval: **`update_stop`** {`stop_mt7c4x9e`, set time "none"}. Milt's now follows coffee at 11:30–12:30. The late warning is gone, and the visit ends exactly at closing (F15; assumed to pass). C: "Milt's is now right after coffee, about 11:30, done by its 12:30 close. Tight, so don't linger."
24. **Gifford Homestead.** **User** selects Gifford from the pie card. **C** `select_candidate` {`stop_pe2t7h4n`, `place_gf7w2k9t`}. Checks: opening hours, closed for the whole visit, warning, N. User: "Keep it anyway, I've heard they sometimes open." **C** `update_stop` {`stop_pe2t7h4n`, approve opening hours, "user wants to try anyway"}. Code records Gifford and 0 minutes open. The warning is now approved. Later, same session: "Actually, skip Gifford, it's closed that day. What were the other pie places?" The reason is about the date, so there's no rejection. **C** `read_itinerary` {`stop_pe2t7h4n`} → set 0 with rationales: Gifford (selected), Stan's Burger Shack ("homemade pie and shakes, right on the way in Hanksville"), Blondie's Eatery. The read doesn't say whether they're open on Wednesday (F18). C has the leg scout's result in context and also calls `read_place` on Stan's to confirm it's open Wednesdays. User picks Stan's. **C** `select_candidate` {`stop_pe2t7h4n`, Stan's}. Code removes the opening-hours approval (the place changed). Day 4 re-routed. Gifford stays a candidate in set 0. No rejection, so it could be picked again if the dates moved.
    Day 2 now: starts 5:30 · **Delicate Arch 6:00–8:30** · **Windows 8:50–9:50** · **Love Muffin 10:20–11:20** · **Milt's 11:30–12:30** · **Corona Arch 12:45–2:45** · free time 2:45–6:45 · **Desert Bistro 7:00–8:00** · hotel 8:10. Stop order: note, N. The faster order does the in-town meals first and would move Delicate Arch past 6 a.m. C doesn't raise it. The user never turned it down, so nothing goes to memory.

**Day 4 driving (change 3)**

25. **User** selects Capitol Gorge. **C** `select_candidate` {`stop_cg9k5x3a`, Capitol Gorge}. Day 4 re-routed, Moab hotel → Goblin Valley → Stan's → Capitol Gorge → Panorama Point → Torrey motel. Checks: daily driving, warning, N: "Day 4 needs about 4.5 hours of driving against your 4-hour preference." Before this pick it was about 3.6 hours (F1). C, at the end of the turn: accept a longer day; drop Capitol Gorge (saves about 40 minutes); or drop Goblin Valley. User: "Longer day is fine. We want both." **C** `update_day` {`day_g8k4s3hn`, approve drive hours 5, "wants Goblin Valley and Capitol Reef on the way"}. The warning is approved. It stays approved while Day 4's driving is 5 hours or less.
    Day 4: starts 8:00 · **Goblin Valley 9:55–11:55** · **Stan's 12:20–1:20** · **Capitol Gorge 2:30–4:30** · free time 4:30 p.m.–12:35 a.m. (F16) · **Panorama Point 1:00 a.m., next day, to 2:00** · Torrey motel 2:15 a.m. Day 5: starts 10:00 · Salt Lake City about 1:45 p.m.

**Weather and clothing**

26. **C** `Agent` WX [`stay_mab3k8wq`, `stay_trr7h2xc`]. **WX** `stay_weather` {`stay_mab3k8wq`, `place_mb7h4d2q`} → seasonal averages for Oct 10–13 (2016–2025): highs about 72 °F, lows about 43 °F, rain on about 10% of days, a few freezing nights; activities: Fisher Towers (Day 1, along its leg), Delicate Arch, Windows, Corona Arch. **WX** `set_stay_weather` saves the text: layers for the 6 a.m. start, sun and water for the afternoon hikes. **WX** `stay_weather` {`stay_trr7h2xc`, `place_tr6k3p8m`}, activities: Goblin Valley and Capitol Gorge (along Day 4's leg) and Panorama Point (near Torrey, 1 a.m. Thursday). Freezing nights about 40% → "a warm jacket, hat, and gloves for stargazing." Saved. WX returns two lines.

**Moving the trip a day (change 4)**

27. User: "Let's start a day later, October 11." **C** `update_itinerary` {start date Oct 11, 2027}. No re-route. Every date moves one day. The opening-hours check runs again on every stop. Checks: Love Muffin is closed Tuesdays (walk assumption) and Day 2 is now Tuesday Oct 12, so closed for the whole visit, warning, N. Stan's on Thursday is fine. Weather: Moab is now Oct 11–14, inside the Oct 3–20 window it was built from; Torrey is now Oct 14–15, inside Oct 6–21. So no weather note, and no rerun. C raises Love Muffin. User: "Skip it, then, if it's closed." That's about the date, so C asks which of the other two. User: Moab Coffee Roasters. **C** `select_candidate` {`stop_ve5p2y7s`, Moab Coffee Roasters}. Day 2 re-routed. The warning is gone.

**Fewer Moab nights and a long hike (change 5)**

28. User: "Let's do two nights in Moab instead of three." **C** `read_itinerary` {`stay_mab3k8wq`} to see what's tied to Moab. C: "Removing a night removes the last Moab day, Day 3. That's the lazy day you asked for, with dinner at The Spoke. I can drop it, or you could lose a busier day instead." User: drop the lazy day and The Spoke. **C** `remove_stops` [`stop_sp4y9m2t`]. **C** `update_stay` {`stay_mab3k8wq`, nights 2}. Code removes `day_e2v7m5yu`. Torrey's day is now Day 3 (Wed Oct 13), and the last day is Day 4 (Thu Oct 14). It keeps its 10 a.m. start. The Torrey day is re-routed even though it still starts at the Moab hotel (F14). Checks: trip length vs brief, warning, N (4 against 5); stay tier set for different nights, note, N ("Moab's nights changed from 3 to 2. Its tier was set for 3"); opening hours re-run (Stan's is open Wednesdays; Gifford would have been closed again). Weather: still inside both windows, no note. **C** `update_stay` {`stay_mab3k8wq`, tier mid-range, "stays of 2+ nights"} → note cleared (F12). C raises the trip length: "The trip is now 4 days, and you asked for 5. Keep 4, or add a night, perhaps a second one in Torrey?" User: "Let me think about it." [mem: open item "decide whether to keep 4 days or add a night, maybe Torrey".] The warning stays open.
29. User: "Can we do a 5-hour hike in Arches on the morning of Day 2?" C: "Day 2 starts with sunrise at Delicate Arch, then the Windows. Swap the Windows for the long hike?" Yes. **C** `remove_stops` [`stop_wn3h8t6c`] and `add_stops` {`day_c6p3t9re`, after `stop_da9w4k2m`, [attraction "a long hike in Arches, about 5 hours," near `stay_mab3k8wq`, none]} → `stop_lh6w3k9p`. Day 2 re-routed (Windows removed). The empty hike takes no time, so coffee moves to 9:05–10:05 and Milt's to 10:10. Checks: Milt's, open but not long enough, warning, N ("opens at 11:00, you'd get there at 10:10"). This is false (F1). Weather out of date for Moab, note, N (Windows left its activities, and the hike was added). Stop order, note, K, though its suggestion changed (F13).
30. **C** `Agent` SR Moab: `stop_lh6w3k9p`, Tue Oct 12, "a long hike in Arches, about 5 hours," "after the sunrise hike, which ends about 8:30, so roughly 8:45 a.m. to 2 p.m."; the other Day 2 stops in order with times and names; leave out: nothing (new stop). **SR** `search_near` {`stop_lh6w3k9p`, "long day hike Arches"} and a details web search → `add_stop_candidates`: Devils Garden Primitive Loop (5 h estimate), Devils Garden to Double O Arch (4½ h), Tower Arch trail (4 h). Each with notes: "timed-entry reservation April to October." No detours (near a stay). C, at the end of the turn: **Assumption:** C sees the hike is empty and says "Once you pick a hike, the times after it will move. I'll check Milt's then," instead of raising the false warning (F1).
31. User picks Devils Garden Primitive Loop. **C** `select_candidate` → visit time 5 h, Day 2 re-routed. Coffee 2:30–3:30, Milt's 3:35. Checks: Milt's, closed for the whole visit, warning, N (a different check row from before, so it's new); the earlier "not long enough" listed as gone. Desert Bistro: reached at 7:10 after Corona Arch, inside the 15-minute allowance, so no late warning. C offers: move Milt's to Day 1 as lunch, about 11:30 (Day 1 ends at the Moab stay, so the search area fits), approve it closed, or drop it. User: Day 1. **C** `move_stop` {`stop_mt7c4x9e`, `day_a4h8n2wk`, after `stop_ft6n3k8w`, none}. Day 1 and Day 2 re-routed. Day 1 is now Monday Oct 11: Milt's 11:30–12:30, open (walk assumption: open daily). Warning gone.
32. **Extra step, not in the prompt (to test rejecting a selected place).** User: "And skip Corona Arch, we hiked it last trip." That's about the place. **C** `reject_places` [{Corona Arch place, "hiked it last trip"}]. Code removes it from the stop's candidates, clears the selection, and re-routes Day 2. Reply lists `stop_cr2k6w8d`. The card now shows Hunter Canyon and Grandstaff Canyon from the same set, with no worker call. User: "Just drop that stop, the day's full." **C** `remove_stops` [`stop_cr2k6w8d`]. Corona Arch stays on the trip's rejected list.
33. End of turn. Nothing is still being discussed. **C** `Agent` WX [`stay_mab3k8wq`]. `stay_weather` now returns activities Fisher Towers, Delicate Arch, and Devils Garden. `set_stay_weather` saves the new text. The weather note is gone. Torrey's text still matches.
    Day 2 final: starts 5:30 · **Delicate Arch 6:00–8:30** · **Devils Garden 8:55–1:55** · **Moab Coffee Roasters 2:30–3:30** · free time 3:30–6:45 · **Desert Bistro 7:00–8:00** · hotel 8:10.

**Next day, new session (change 6)**

34. **UI.** The user opens the trip and starts a new session. Code gives the coordinator today's date (Oct 13, 2026). **C** `read_itinerary` (whole), `read_trip_brief` (**assumption**, F11), `read_memory` [mem]. Checks in the read: trip length, warning, K (open); Fisher Towers hours, note, K; Day 3 driving, warning, approved (4.5 hours, approval for 5 applies); Day 2 stop order, note, K. No "forecast now available": the trip is a year away.
35. User: "Why did we pick that Moab hotel?" C answers from the selected lodging's rationale in the read ("mid-range, from rule: stays of 2+ nights; walkable to Main Street, about 10 minutes from the Arches entrance") and trip memory ("you picked it for the hot tub").
36. User: "What's left to decide?" C answers from the read and trip memory: every stop and both hotels are selected. One open warning: the trip is 4 days against the 5 you asked for, and you wanted to decide whether to add a night, maybe in Torrey. Unconfirmed: Fisher Towers hours. Already agreed: the long drive day to Torrey (up to 5 hours). C doesn't mention the stop-order note, which it judged not worth raising.

**Finished state vs the example:** Oct 11–14, 2027, four days. Moab has 2 nights and no rest day. Milt's is lunch on Day 1. Day 2 has Delicate Arch, Devils Garden, Moab Coffee Roasters, and Desert Bistro. Stan's replaces Gifford on the Torrey day, which holds a 5-hour drive approval. Panorama Point is at 1 a.m., and the last day starts at 10. The trip-length warning is still open, on purpose.
