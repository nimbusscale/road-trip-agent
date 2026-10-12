# Walk-through findings, run 5

> **Snapshot, out of date.** This is the output of design walk-through 5, from 2026-10-12. It describes the design as it was then. The design changed after it, so much of this no longer matches. The current design is in `design/`. Anything still open is in `research/domain-model-notes.md`. See `reviews/walkthroughs/README.md`.

Two trips walked on paper, from an empty trip to the finished itinerary: San Francisco to Mike's house, and Grand Junction to Salt Lake City through Moab (technical spec section 3.1). All listed changes were run. Only the files in `design/` were read. Tool replies, drive times, and place details are made up and rough.

Assumptions made during the walk are labeled **Assumption** in the step log. Hours marked "assume" in technical spec section 3.1 were used as if Google returned them.

---

## Review groups

22 findings: F1 to F17, plus the five items in F18 (F18.1 to F18.5). I added one more from the walker's properties list (E1 below), so 23 items in 5 groups. Settle the groups in this order.

1. **Check results: what comes back and what counts as new.** F1, F2, F7, F16. The only real design gaps in this run. Both F1 and F2 are about the saved list of check results hiding a warning the user should hear.
2. **The day's schedule.** F3, F4, F10, F11, F17, F18.5. Mostly wording and coordinator rules. F3 overlaps earlier decisions about empty stops.
3. **Workers, search areas, and places the user names.** F5, F9, F13, F14. F5 is a real gap. The rest are wording.
4. **New sessions, and things that drift over time.** F6, F8, F15, F18.1, F18.2. Coordinator rules and wording. Memory design is still deferred.
5. **Tool replies and object-model tidy-ups.** F12, F18.3, F18.4, E1. Wording only.

**E1 (added from section 2, Place). Settled 2026-10-12: cut.** A start or end place that is an address has no type. Nothing sets the card type of a start or end place that is an address, such as Mike's house. `update_itinerary` takes a name with the place, but not a type. Proposed: `update_itinerary` takes a type along with the name, the same as `select_user_place`.

---

## 1. Findings

Most important first.

### 1. A write can save a new warning as "already known" without ever returning it

**Needs a decision.**

**What happened.** On San Francisco Day 1, the user asked for five hours at the Boardwalk. The coordinator called `update_stop` on the Boardwalk stop with the new visit time. That pushes the party's arrival at the Whaling Station to 7:45 p.m., against a 7:00 set time. That is a "late for a set time" warning, on the Whaling Station stop. But the write changed only the Boardwalk stop. Technical spec section 8 says a write returns "the check results for everything it touched: the stops, days, and stays it changed, and the trip as a whole." The Whaling Station stop wasn't changed. Only its worked-out time moved. So it's unclear whether the late warning comes back.

The saved list makes this worse. After every change, code saves the list of check results for the whole trip. If the late warning is saved but not returned, the next write that does return it marks it "already known." Technical spec section 5.2 then tells the coordinator to stay quiet about it. The user never hears about it.

The same thing came up three more times:

- Moving the Moab trip to October 11 with `update_itinerary` changes every stop's date. The write touched only the itinerary.
- Removing a Moab night moves the Torrey day from Thursday to Wednesday. None of the Torrey day's stops were changed.
- Picking Devils Garden for the new 5-hour hike pushes Milt's and Love Muffin past closing and makes dinner late. Only the hike stop and Day 2's leg changed.

Technical spec section 8 also says the "forecast now available" note "can first appear on a write about something else." That already contradicts "everything it touched."

**Docs:** technical spec section 8 ("Each check result is marked new or already known" and "What comes back"), tool design section 2.1 ("Writing").

**Options:**

- **Return every change.** Every write returns each result that is new or went away, anywhere in the trip. It also returns already-known results for what it touched. The saved list and the reply then always agree on what's new.
- **Widen "touched."** Define it as every day whose date, schedule, or leg changed, with all its stops, plus every stay whose dates or nights changed, plus the trip. Harder to get right, and it still misses the forecast note.
- **Save only what was returned.** A result that wasn't returned stays new until a write returns it. Results can then sit unseen for a long time.

**Recommendation:** return every change. It's the simplest rule, and it covers the forecast note too.

**Post-review analysis.** Agree, and this is the most important one. A late warning on the Whaling Station after a Boardwalk change is exactly what the user needs to hear. Returning every new or gone result, anywhere in the trip, is the simplest rule. It also removes the clash with the forecast note's "can first appear on a write about something else." Caveat: a start date change can return many new results at once. That's fine, because each one is something the coordinator has to raise anyway. Already-known results stay limited to what the write touched, so replies don't fill up with old ones.

**Settled 2026-10-12,** as proposed: a write returns every new or gone result anywhere in the trip, plus already-known results for what it touched. Technical spec section 8 and tool design section 2.1.

### 2. A warning whose approval stops applying comes back "already known," so the coordinator stays quiet

**Needs a decision.**

**What happened.** Moab Day 4 holds a drive hours approval for 5 hours. Later writes return its driving warning, marked approved. Suppose a later change makes Day 4 about 5 hours 20 minutes, such as adding a dinner stop in Loa. The approval no longer applies, so the warning is open again. But it's the same check about the same day, so it's marked "already known." Technical spec section 8 says so directly: "A driving warning whose hours change is still already known." Technical spec section 5.2 then says to stay quiet about results marked already known.

That conflicts with functional spec section 6.2 item 4 ("If a later change makes that day 7 hours, the agent asks again") and technical spec section 8 ("it gets a warning again").

Opening hours have the same problem. Say the user kept Milt's at noon with 30 of its 60 minutes open. A later change cuts that to 10 minutes. The warning is still "open, but not long enough," still about Milt's, so it's already known.

There's a related gap. Tool design section 2.1 says reads mark approved warnings, but doesn't say whether writes return approved warnings at all, or whether the saved list includes them. If the saved list leaves approved warnings out, the problem goes away by accident.

**Docs:** technical spec section 8 (new or already known, and Approvals), technical spec section 5.2 ("Raise each warning once"), functional spec section 6.2, tool design section 2.1.

**Options:**

- **Count reopening as new.** The saved list records whether each warning was approved and applying. A warning that goes from approved to open is marked new.
- **A coordinator rule.** Add to technical spec section 5.2: raise any warning whose approval stopped applying, even when it's already known. This relies on the coordinator comparing replies.
- **A separate check.** Make "approval no longer applies" its own row in the check table.

**Recommendation:** count reopening as new. Also say in tool design section 2.1 that writes return approved warnings, marked approved.

**Post-review analysis.** Agree. This contradicts functional spec section 6.2 directly, so it has to be fixed. The walker's fix works. A slightly simpler way to say it: the saved list records each warning as open or approved, and a warning that goes from approved to open is new. Also take the walker's side note: say in tool design section 2.1 that writes return approved warnings, marked approved, so the reply and a full read agree.

**Settled 2026-10-12,** as proposed: approved to open counts as new, and writes mark approved warnings. Technical spec section 8 and tool design section 2.1.

### 3. An empty stop whose purpose says "about 5 hours" hides the problems it will cause

**Needs a decision.**

**What happened.** On Moab Day 2, the user asked for a 5-hour hike in Arches after the sunrise hike. The coordinator added an empty stop with the purpose "a long hike in Arches, about 5 hours." An empty stop takes no time (technical spec section 3.1). So the schedule still showed Milt's at 10:20 a.m. and Love Muffin at 11:25 a.m., both open. No check result fired. The "may be too early" mark goes only on opening-hours results that exist (technical spec section 8), and a stop that passes has none.

Once the user picked Devils Garden, three new warnings appeared at once: Milt's closed for the whole visit, Love Muffin closed for the whole visit, and dinner late. Before that, a coordinator following the docs could have told the user "Day 2 still works."

The coordinator does know roughly how long the hike is. It has to, to write "roughly when" in the worker brief (technical spec section 5.3). But nothing tells it to think through what the hike pushes later, or to say so to the user.

**Docs:** technical spec section 3.1 ("A stop with no selected place takes no time"), section 8 (the "may be too early" mark), section 5.2, section 5.3.

**Options:**

- **A coordinator rule.** When the coordinator adds a stop whose purpose says how long, it works out what that pushes later and tells the user before the fill. It uses the same rough timing it writes in the worker brief.
- **A planned visit time on an empty stop.** `add_stops` takes a planned length, used by the schedule and the checks until a place is picked. This makes the checks real right away, but it adds an input, and the tool-design rule is no optional inputs.
- **Mark every time after an empty stop.** The schedule marks all later times as "may be later," not only opening-hours results. Cheap, but vague.

**Recommendation:** the coordinator rule. Add the schedule mark too if it's cheap in the UI.

**Post-review analysis.** Partly agree. This overlaps two earlier decisions. Empty stops have no rough time, and only opening-hours results get the "may be too early" mark. The walker doesn't ask to undo either one. Its recommendation is a coordinator rule, which fits both. I agree with the rule: when a stop's purpose says how long, the coordinator tells the user what it pushes later, before the fill. Drop the walker's "planned visit time" option, which was turned down before. Also add a sentence in technical spec section 3.1 saying why empty stops don't warn, so this isn't flagged again.

**Settled 2026-10-12,** as proposed: a coordinator rule in technical spec section 5.2, and a sentence in section 3.1 saying empty stops don't warn on purpose.

### 4. The stop-order note's "set times it would miss" can't be worked out fresh

**For the object model.**

**What happened.** On Moab Day 2, the stop-order note said a faster order would save about 25 minutes by doing Corona Arch right after Windows, and that dinner would still be on time. Technical spec section 8 says code works out the missed set times "from the drive times the best-order call returns." Only the best order and time saved are stored with the leg. Check results are worked out fresh after every change.

Several changes alter which set times the faster order misses, without re-routing the leg:

- a set time changes (Whaling Station from 7:00 to 8:00)
- a visit time changes (Boardwalk from 2 to 5 hours)
- a day's start time changes (Moab Day 2 to 5:30 a.m.)

To redo the note after any of these, code needs the best-order call's segment drive times, and those aren't stored.

**Docs:** technical spec section 3.3 (leg table: "Best order and time saved"), section 8 (Stop order).

**Options:**

- **Store the best-order segment times** with the leg, next to the best order. They come back in the same call, so this adds no cost.
- **Freeze the note's text** when the leg is re-routed. It can go stale after a set-time change.
- **Drop missed set times from the note.** The coordinator works them out itself.

**Recommendation:** store the best-order segment times.

**Post-review analysis.** Agree. Storing the best-order call's segment times costs nothing extra and matches how the leg already stores its own segment times. Another option is to drop missed set times from the note and let the coordinator judge. That loses a useful signal, so I'd store the times.

**Settled 2026-10-12,** the note drops "set times it would miss." The coordinator judges set times itself. Technical spec section 8.

### 5. No worker can find a place near the start or end place

**Needs a decision.**

**What happened.** Checking which worker fills each stop: say the Moab user wants breakfast in Grand Junction before leaving on Day 1. A stop's search area is the stay where the party slept last night, the stay where it sleeps tonight, or the leg (technical spec section 6). Grand Junction is the start place, not a stay. So the only choice is "along the leg." But `search_along_leg` drops places within a set distance of either end of the leg, about 2 miles (tool design section 2.3). Downtown Grand Junction is dropped. The same goes for lunch near Mike's house at the end of the San Francisco trip.

Tool design section 2.3 says "Places near the ends belong to stops near those stays." The start and end places have no stay, so nobody covers them.

**Docs:** technical spec section 6 (search area), tool design section 2.3 (`search_along_leg`), Google design section 2.4 (results bunch at the ends).

**Options:**

- **Drop only near stays.** `search_along_leg` drops places near an end only when that end is a stay. Near the start or end place, it keeps them. The leg scout already sorts by position and can name the town in its query.
- **Add the start and end places as search areas.** A stop could be "near the start place" on the first day or "near the end place" on the last day, filled with `search_near`. This adds a search area and a worker question.
- **Leave it.** The coordinator asks the user to name a place there.

**Recommendation:** drop only near stays.

**Post-review analysis.** Agree it's a gap. I'd go a different way than the walker, though. The ends are dropped because results bunch there: half the Dallas to Austin barbecue results were in those two cities (Google design section 2.4). Dropping only near stays brings that back on every first and last day. The San Francisco Day 1 leg scout would get mostly San Francisco results. Two better options: (a) let a stop's search area be the start place on the first day, or the end place on the last day, and have the leg scout fill it with `search_near`; or (b) leave it for the MVP, and have the coordinator ask the user to name a place there. I lean to (b). It's rare, and (a) adds a search area value and a tool to the leg scout.

**Settled 2026-10-12,** differently from the walker: "near the start place" (first day) and "near the end place" (last day) are new search areas, filled by the leg scout with `search_near`. They work like stops near a stay. Technical spec and tool design both say why the leg scout has the tool.

### 6. A place passed over because of the date can fit again when the dates move, and nothing says so

**Needs a decision.**

**What happened.** Gifford Homestead is closed Wednesdays, and Moab Day 4 was a Wednesday. The user chose Stan's Burger Shak instead. Following technical spec section 3.2, the coordinator selected another candidate and didn't reject Gifford, "since Gifford may fit if the dates move." Then the user moved the trip to October 11. Day 4 became a Thursday, and Gifford was open. Nothing told the coordinator. Stan's passes the hours check, so no check result fires. Then the user dropped a Moab night, and the Torrey day became a Wednesday again.

The docs keep Gifford available on purpose, but give no way to bring it back up.

**Docs:** technical spec section 3.2 ("Not being selected isn't a rejection"), section 5.2 ("When the user turns down a place"), section 3.5 ("The start date changes").

**Options:**

- **Memory item and a recheck.** When the coordinator swaps a place for a date reason, it saves a trip memory item, such as "Wanted Gifford Homestead's pie. Took Stan's only because Gifford is closed Wednesdays." After any date change, it rereads trip memory and offers the swap back. Memory design is deferred, but this is where it would write.
- **A code note.** Store the reason with the stop, and add a note when the passed-over candidate now fits. This needs a new stored property and a new check.
- **Accept it.** The user can ask.

**Recommendation:** memory item and a recheck. Add one line to technical spec section 5.2.

**Post-review analysis.** Agree, as a small coordinator rule. Technical spec section 5.2 already says to save why the user chose an option. So the only new line is this: after a date change, check trip memory for places passed over for a date reason, and offer them again if they now fit. This touches deferred memory design only lightly.

**Settled 2026-10-12,** as a coordinator rule (kept, not cut: it exercises memory and judgment). Technical spec sections 3.2 and 5.2.

### 7. Checks that read the trip brief before the brief item is set

**Wording fix.**

**What happened.** In San Francisco discovery, the coordinator set the start place, end place, and start date before the user gave max driving hours. Setting both places routes the last day's leg, San Francisco to Mike's house, about 6 hours. The daily driving check compares that against the brief's max hours, which are still empty. Trip length vs the brief has the same issue when the brief has no trip length yet. Technical spec section 5.2 tells the coordinator not to raise warnings that come only from an unfinished skeleton. It doesn't say what the check does with an empty brief item.

**Docs:** technical spec section 8 (Daily driving, Trip length vs the brief), section 5.2.

**Options:**

- **Skip the check while its brief item is empty.**
- **Refuse itinerary writes** until the brief's required items are set. This blocks discovery, which mixes the two.
- **Use defaults,** such as 6 hours. That would raise warnings against a number the user never gave.

**Recommendation:** skip the check while its brief item is empty. Say so in technical spec section 8.

**Post-review analysis.** Agree. "Skip the check while its brief item is empty" is the obvious rule. It's a wording fix in technical spec section 8.

**Settled 2026-10-12,** as proposed: a check is skipped while its trip brief item is empty. Technical spec section 8.

### 8. A forecast gets old without anything saying so

**Needs a decision.**

**What happened.** On May 8, 2027, the user reopened the San Francisco trip. Both stays were fully within 7 days, so the coordinator offered the forecast and the weather worker wrote it. Say the user reopens on May 12, the day before leaving. The forecast text is four days old, but nothing marks it. Technical spec section 3.5 marks text out of date only when the stay's place, dates, or activities change. The stored text doesn't record when it was written.

A smaller related issue: the "forecast now available" note first shows up on the full read at the start of a session. Reads don't save the list of check results. So if the user says no to the forecast, the next write marks the note "new" again.

**Docs:** functional spec section 8, technical spec section 3.5, section 5.2 (new session), section 8 (Forecast now available).

**Options:**

- **Record when the text was written.** At the start of a new session, if a stay's forecast is more than a day or two old and its dates haven't passed, offer to refresh it.
- **A "forecast is old" note,** worked out like the forecast-now-available note.
- **Accept it.** Forecasts a few days old are still useful.

**Recommendation:** record when the text was written, and offer a refresh at the start of a new session. Also say whether a read saves the list of check results.

**Post-review analysis.** Two separate items. (a) An old forecast: I'd keep this small. Record the date the text was written and show it on the card ("forecast as of May 8"). The coordinator offers a refresh in a new session when the forecast is more than a day old. A new check isn't needed. Or accept it as it is, since in-trip use is out of scope. Your call. (b) Reads don't save the check results list: say so plainly, since a read should never write. A forecast the user turned down is already covered by trip memory (technical spec section 5.2), so this is wording only.

**Settled 2026-10-12,** (a) cut: a forecast isn't refreshed as it ages, and the user can ask. The coordinator already returns to the weather worker in three kinds of situations. (b) wording: only writes save the check results list. Technical spec sections 3.5 and 8.

### 9. Does a place the user names along the leg get a detour time?

**Wording fix.**

**What happened.** On San Francisco Day 1, all five stops are places the user named. Four are along the leg, such as Millbrae Pancake House. `select_user_place` adds one candidate and selects it (tool design section 2.1). Technical spec section 3.2 says the tool works out detour time "when the candidate is added." Tool design describes that only for `add_stop_candidates`. It's unclear whether `select_user_place` makes a routing call per stop for a detour time nobody will use. The stop is selected at once, and the leg's segment times give the real figure.

**Docs:** technical spec section 3.2 (Detour time), tool design section 2.1 (`select_user_place`, `add_stop_candidates`).

**Options:**

- **No detour time** for a place the user names. Say so in both docs.
- **Compute it anyway,** so every along-leg candidate has one.

**Recommendation:** no detour time. It saves a paid call and the card shows "your choice" anyway.

**Post-review analysis.** Agree. No detour time for a place the user names. It saves a paid call, and the card shows "your choice" anyway.

**Settled 2026-10-12,** as proposed, framed as: a place the user names, including a must-see, is a reason for the trip, not a detour.

### 10. Empty stops in a row: where the late check and the last drive start from

**Wording fix.**

**What happened.** On San Francisco Day 2, right after the layout, every stop was empty. Stop 6, the tri-tip dinner, had a set time of 6:30 p.m. Stop 5, before it, was empty. Technical spec section 8 says the late check covers an empty stop with a set time, and "the party reaches it when the stop before it ends." Stop 5 has no end.

The drive after the last stop had the same question. Technical spec section 3.1 says the drive starts from the last selected stop. No stops were selected, so the whole Monterey-to-San Luis Obispo drive started at 8:00 a.m. and arrived at 11:20 a.m. It was listed after a 6:30 p.m. dinner, so the schedule was out of time order.

**Assumption used in the walk:** the late check measures from the last item with a time. That is the day's start, a selected stop's end, or an empty stop's set time.

**Docs:** technical spec section 3.1 (the day's schedule), section 8 (Late for a set time).

**Options:**

- **Say "the last item with a time"** in technical spec section 8. Show the last drive as "time set once a place is picked" whenever an empty stop comes after the last selected stop.
- **Leave it to development.**

**Recommendation:** the wording above.

**Post-review analysis.** Agree. "The last item with a time" is the right wording. Showing the last drive as "time set once a place is picked" when an empty stop follows the last selected stop fixes the out-of-order schedule.

**Settled 2026-10-12,** as proposed. Technical spec sections 3.1 and 8.

### 11. Rest-day stops need a set time, but only the coordinator's instructions say so

**Needs a decision.**

**What happened.** On Moab Day 3, a rest day, the coordinator added The Spoke on Center with a 6:30 p.m. set time, following technical spec section 5.2. Nothing in the tools enforces it. `add_stops` and `move_stop` accept "none" on a rest day. `update_day` can mark a day as a rest day when it holds stops with no set time. Such a stop would follow the day's start time and show at 8:00 a.m., since there is no drive.

**Docs:** technical spec section 3.1 (a rest day), section 5.2 ("Stops on a rest day"), tool design section 2.1 (`add_stops`, `move_stop`, `update_day`).

**Options:**

- **The tools refuse.** `add_stops` and `move_stop` refuse "none" on a rest day. `update_day` refuses to mark a rest day while a stop on it has no set time, and the error lists those stops.
- **Keep the instruction only.**

**Recommendation:** the tools refuse. Code catches it, so the model doesn't have to remember it.

**Post-review analysis.** Agree. This follows the "code works out what the model doesn't need to handle" principle. `move_stop` already requires a set time input, so it just refuses "none" on a rest day. Caveat: marking a rest day becomes two steps when a stop has no set time. The error lists the stops, so that's easy.

**Settled 2026-10-12,** as proposed: `add_stops`, `move_stop`, and `update_day` refuse a rest-day stop with no set time.

### 12. `add_stay` doesn't say it returns the new stay's ID and day IDs

**Wording fix.**

**What happened.** Building the San Francisco skeleton, the coordinator called `add_stay` for Monterey, then needed the Monterey stay's ID for the next `add_stay` ("after" it) and Day 1's ID for `add_stops`. Tool design section 2.1 says `add_stops` returns the new stops' IDs. For `add_stay` it says only "days added." Adding nights with `update_stay` has the same gap.

**Docs:** tool design section 2.1 (`add_stay`, `update_stay`, and the "Writing" paragraph).

**Recommendation:** say that `add_stay` returns the new stay's ID and its days' IDs, and that `update_stay` returns the IDs of any days it adds.

**Post-review analysis.** Agree. Wording fix.

**Settled 2026-10-12,** as proposed.


### 13. A must-see area on a day that stays put

**Wording fix.**

**What happened.** Arches is a must-see area. It's visited on Moab Day 2, a day that stays put. Technical spec section 4.2 says that for an area, the coordinator "makes sure the leg passes through it, adding a waypoint inside it if needed." Day 2 has no leg until a stop on it is selected. `update_leg` rejects a day with no leg. Here the stops themselves put the day in Arches, so no waypoint is needed.

**Docs:** technical spec section 4.2 (Skeleton, "Must-sees that aren't one place"), tool design section 2.1 (`update_leg`).

**Recommendation:** add one sentence: "On a day that stays put, the stops do this. Lay out stops that name the area in their purpose."

**Post-review analysis.** Agree. Wording fix.

**Settled 2026-10-12,** with a fuller rewrite of the technical spec section 4.2 bullet.

### 14. What the coordinator checks for a place the user names is too narrow

**Wording fix.**

**What happened.** The San Francisco user named Hangar One at Moffett Field. **Assumption:** the coordinator may know that public access to the hangar is limited. Technical spec section 5.2 asks the coordinator to mention "any seasonal closure or reservation need you know of." A place that may not be open to visitors at all isn't seasonal. Neither is a permit, such as for the Fiery Furnace in Arches. Google had no hours for Hangar One, so the hours check returned only "hours not known."

**Docs:** technical spec section 5.2 ("Places the user names").

**Recommendation:** reword as "mention anything you know that could stop the visit, such as a seasonal closure, limited public access, or a needed reservation or permit."

**Post-review analysis.** Agree. The broader wording covers Hangar One and Fiery Furnace permits.

**Settled 2026-10-12,** as proposed.

### 15. The start-of-session read doesn't list trip memory

**Wording fix.**

**What happened.** In the new sessions (Moab, March 2; San Francisco, May 8; Moab, October 6), the coordinator needed trip memory. It needed it to answer "what's left to decide?", to check whether the user had turned down a forecast before, and to see the open item about Day 2's lunch. Technical spec section 5.2 says the coordinator "reads the whole itinerary and the trip brief" at the start of a new session. Functional spec section 10.1 says a new session starts from the itinerary, the trip brief, trip memory, and user memory. Memory design is deferred, but the read belongs in the list.

**Docs:** technical spec section 5.2 ("Today's date"), functional spec section 10.1.

**Recommendation:** add "and reads trip memory and user memory" to that sentence.

**Post-review analysis.** Agree. Wording fix. Technical spec section 5.2 already relies on trip memory at the start of a session ("trip memory says so"), so the read belongs in the list.

**Settled 2026-10-12,** as proposed.

### 16. "Start date in the past" is listed as a check that runs after every change

**Wording fix.**

**What happened.** Technical spec section 8 lists "Start date in the past: refused" among the checks that run after every change. Read literally, once a trip's start date passes, every write to it is refused. Tool design section 2.1 says only that `update_itinerary` rejects a past start date. The walk didn't hit this, since the October 6 session is before the trip. It would come up for a user who opens a trip after the start date.

**Docs:** technical spec section 8 (check table and the "Start date in the past" bullet), tool design section 2.1 (`update_itinerary`).

**Recommendation:** say it applies only to a write that sets the start date.

**Post-review analysis.** Agree. Say the refusal applies only to a write that sets the start date.

**Settled 2026-10-12 (e6ad4a8).** Scope cut instead: a trip can't be changed once it starts. The start date must be after today. From the start date on, every write is refused and reads still work. Applied to functional spec section 2 and 5.2, technical spec sections 5.2 and 8, and tool design sections 2.1 and 4.

### 17. A day that runs past midnight and the next day's start

**Needs a decision.** Low priority.

**What happened.** Moab Day 4 ends at 2:10 a.m., after stargazing. Day 5 starts at 10:00 a.m. only because the user agreed to a late start. No check compares a day's end with the next day's start. If Day 5 had kept 8:00 a.m., the party would get under 6 hours of sleep with no warning. A late enough stop could even run past the next day's start time.

**Docs:** technical spec section 3.1 ("A day can run past midnight"), section 8.

**Options:**

- **A coordinator rule.** After a stop past midnight, offer a later start the next day.
- **A new check.** A warning when a day ends less than a set number of hours before the next day starts.

**Recommendation:** the coordinator rule. Add the check only if it's needed later.

**Post-review analysis.** Low priority. A similar sleep-and-pace item was dropped in an earlier run as "users are adults." But the Moab example already shows the coordinator offering a 10 a.m. start after stargazing. A one-line coordinator rule that writes down that behavior seems worth it. Skip the new check.

**Settled 2026-10-12,** both the sentence that no check compares a day's end with the next start, and a coordinator rule to offer a later start after a late night. Technical spec sections 3.1 and 5.2.

### 18. Smaller wording items

**Wording fix.**

- **Rationale can go stale.** The Moab hotel's rationale could say "good base for your three nights." After the user drops a night it's wrong, and candidates never change. Technical spec section 3.2 says notes never name the trip's dates. Say the same for rationale: no dates and no night counts.
- **Rest days in the brief.** Dropping Moab's third night removed the rest day the user asked for. Nothing checks the brief's rest days item. Add to technical spec section 5.2: when the user agrees to lose a rest day, update the brief's rest days item along with the trip length.
- **The option card for a selected stop.** The user forgot the other pie places. The coordinator answered from a stop-scoped read. Functional spec section 7.5 doesn't say whether the user can reopen a selected stop's card, or whether the card marks the selected candidate. It also doesn't say what "Higher tier" does when the tier is already posh.
- **The approval stores the place twice.** The opening hours approval's value holds the place (technical spec section 8). Code also removes the approval when the place changes. The object model can drop one of the two.
- **"A day runs until its last stop ends."** Technical spec section 3.1 says this. On Moab Day 4 the drive to the hotel after Panorama Point ends at 2:10 a.m., after the last stop. Say "until it reaches where the party sleeps, or the end place."

**Post-review analysis.** F18.1, rationale: agree. Use the same rule as notes: no dates and no night counts. F18.2, rest days in the brief: agree. F18.3, card for a selected stop: real but small. Say the card marks the selected candidate and can be reopened, and hide "Higher tier" at posh and "Lower tier" at value. F18.4, the approval stores the place twice: agree, for the object model. Keep the code removal and drop the place from the value. F18.5, when a day ends: agree.

**F18.5 settled 2026-10-12, as proposed. The rest of F18 is in groups 4 and 5.**

**F18.1 and F18.2 settled 2026-10-12, as proposed.**

**F18.3 settled 2026-10-12, the user's version:** the card closes once an option is selected, and later changes go through chat. Tier buttons are hidden at the ends. "The second one" means the coordinator's last chat list once the card has closed. **F18.4 settled, as proposed.**

---

## 2. Properties and rules touched

"(not in docs)" marks something the walk needed that the docs don't mention. "(implied)" marks something the docs need without naming it.

### Trip

- Owner user. Rejected places: each a place and the user's reason.
- Saved list of current check results, used to mark new or already known.
- Whether each saved warning was approved and applying (not in docs, finding 2).
- Name and region: worked out from the brief's region, route, or theme and the start date. Example: "Pacific Coast Highway, May 2027."
- Rule: a rejection is permanent for the trip. It removes the place from every candidate list, clears any selection, and re-routes the affected legs.
- Rule: the trip comes from the session, never from a tool input.

### Trip brief

- Region, route, or theme. Trip length. Interests and must-sees, with why (a list, replaced as a whole). Max driving hours. Route preference. Rest days. Usual start time (default 8 a.m.). Budget posture: default tier plus rules. Meal preferences.
- Rule: changing the brief never changes the itinerary.
- Rule: checks read the brief. What a check does while its item is empty isn't covered (not in docs, finding 7).

### Itinerary

- Start place, end place, start date. Stays in order. Days in order. Created holding only the last day.
- End date: worked out. Trip length: number of days, worked out.
- Rule: `add_stay` is refused until all three of start place, end place, and start date are set.
- Rule: the last day has a leg, with no route until both places are set.

### Stay

- Place (usually a town). Order. Lodging place, empty until selected. Lodging candidates.
- Tier, the rule that produced it, and the nights it was set for.
- Weather text, with its label (forecast or seasonal averages) and the place, dates, and activities it was written for.
- When the weather text was written (not in docs, finding 8).
- Nights: worked out, the number of days pointing to the stay.
- Dates: worked out, its nights plus the morning the party leaves.
- Activities: worked out. Attraction stops whose search area is the stay, plus attraction stops along the legs of its days. The last day's along-leg attractions count with the last stay.
- Rule: where the party sleeps is the lodging once selected, otherwise the stay's place.
- Rule: removing a stay is refused while any stop is on its days, or any stop anywhere has it as its search area.
- Rule: weather text goes out of date on a change of place, dates (seasonal averages only outside the stay's dates plus 7 days on each side, as recorded; a forecast on any date change), or activities. Once any stay has text, a stay with none is out of date.

### Day

- Rest day or not. Its own start time, or none. Stops in order. Leg, at most one. Approvals (a list). The stay where the party sleeps that night, or none on the last day.
- Date: worked out, the start date plus the day's order.
- Schedule: worked out. Each stop's arrival and end, free time, and the drive after the last stop.
- Rule: only a day that stays put can be a rest day. Marking one removes its leg and waypoints. Unmarking restores the leg from the selected stops, without waypoints.
- Rule: rest-day stops need a set time. This is only an instruction today (finding 11).
- Rule: a day runs past midnight. A stop after midnight is written "next day."
- Rule: no check compares a day's end with the next day's start (not in docs, finding 17).

### Leg (value object on its day)

- Waypoints: place IDs, set by the coordinator.
- Drive time, distance, route line, and each segment's drive time: stored.
- Best order and time saved: stored.
- Best-order segment drive times (not in docs, finding 4).
- From and to: worked out.
- Route type: worked out, from the day's route type approval or the brief.
- Rule: re-route only when the start, the end, the selected places in order, or the waypoints differ before and after a write.
- Rule: code places each waypoint in the gap between neighbors where it adds the least straight-line distance.
- Rule: a day that stays put gains a leg at its first selected stop, unless it's a rest day.

### Segment

- Drive time, stored on the leg. The drive after the last stop is one of them. The schedule adds the driving buffer to each.

### Stop

- Kind, purpose, and search area: fixed.
- Order in its day. Set time or none. Visit time (from the candidate's estimate, the time the user gave, or one hour for a meal; the coordinator can change it).
- Selected place, empty until selected. Candidates.
- Tier and rule (meal stops). Approvals (a list).
- Status: worked out. Empty, proposed, or selected.
- Arrival and end: worked out.
- Rule: purpose never says when. It can say how long.
- Rule: search area is the stay slept at last night, the stay slept at tonight, or the leg. The leg only on a day that moves.
- Rule: a stop near a stay can move to a day that doesn't fit it, with a warning. A stop along the leg can move only to another day that moves.
- Rule: an empty stop takes no time. Its worker learns roughly when it happens from the worker brief.
- Rule: no search area exists for the start or end place (not in docs, finding 5).
- Rule: whether a stop the user names along the leg gets a detour time isn't covered (not in docs, finding 9).

### Candidate (value object on a stop or stay)

- Place. Rationale. Tier and rule (lodging and meal). How it was found, with source link. Notes. Visit time (attraction). Detour time (along the leg). Set number.
- When the detour time was worked out (implied: the card labels it "as of when offered").
- Rule: the selected place must be a candidate. A set holds one to three. The card shows the newest set still present.
- Rule: a repeat or a rejected place makes the whole call fail.
- Rule: notes never name the trip's dates. Rationale has no such rule (finding 18).

### Place

- Google place ID. Coordinates. Name (Google's, or a given name when Google has none). Type, set by the first candidate. Rating, review count, price level, weekly hours, summary, links.
- Short line: worked out from type, rating, price level, and area.
- Type for a start or end place that is an address: nothing sets it, since no candidate offers it (not in docs).
- Rule: matched by Google place ID only. Stored once per trip.

### Approval (on a day or a stop)

- Kind, value, reason.
- Drive hours: hours. Route type: type. Opening hours: the place and the minutes of the visit within opening hours.
- Applying or not: worked out.
- Rule: at most one of each kind per item. Setting replaces. Code removes an opening hours approval when the selected place changes or is cleared.
- Rule: a route type approval covers no warning. It stops the coordinator adding scenic waypoints, and the leg shows its route type.

### Check result

- Check, level (warning or note), subject (the trip, a stay, a day, or a stop), current text.
- New or already known. Approved or not. The "may be too early" mark, on opening-hours results only.
- Rule: the same result means the same check about the same subject.
- Rule: a result that goes away and comes back is new.
- Rule: what a write returns is unclear (finding 1).
- Rule: whether a read saves the list isn't covered (not in docs, finding 8).
- Settings: driving buffer (10%), late allowance (15 minutes), stop-order minimum (15 minutes), the along-leg drop distance (about 2 miles), the "near" distance for `search_near`.

### Worker brief (not stored)

- Stop and stay IDs with day, dates, and nights. The day's ID for a leg scout. Resolved tier and rule. Each stop's purpose, set time, and roughly when. The day's other stops in order with times, purposes, and selected names. Interests, must-sees, and meal preferences. Places to leave out.
- Weather worker: the stay IDs only.

### Memory (design deferred)

Places the walk would read or write memory:

- The kind of each stretch, road fixed or places fixed (technical spec section 4.1).
- "We didn't like the Sardine Factory last time." This could also be user memory, across trips.
- Why the user chose an option.
- A stop-order note the user turned down (Moab Day 2).
- A place passed over for a date reason (finding 6).
- An open item: Day 2 lunch in Moab.
- A Big Sur night that was tried and dropped.
- A forecast the user turned down.
- New-session reads (finding 15).

Note: a memory item that names a day by number ("Day 2 lunch") goes stale when days shift. Removing a Moab night turned Day 4 into Day 3.

---

## 3. Step log

Format for each step: **who acts**, then the call, then what changes in storage, what comes back, and what the user sees. "Code" means code inside a tool. Check results are written as level, new or already known, then text.

### San Francisco to Mike's house

**Session 1. Today is March 1, 2027.**

1. **UI and code.** The user clicks "New trip" and types "Pacific Coast Highway, San Francisco to LA, three days in May." Code creates the trip, an empty trip brief, and an itinerary holding only the last day, `day_t9r5e3wz`.
2. **Coordinator.** `read_memory` to prefill the brief (memory design is deferred). `update_trip_brief` with route "Pacific Coast Highway, San Francisco to Los Angeles" and trip length 3. Reply: warning, new, trip length vs the brief (1 day vs 3). Held, because it comes only from the unfinished skeleton. The user sees questions about dates, the start and end, and interests.
3. **Change 1.** The user says: "We start May 13. The trip ends at our friend Mike's house in Silver Lake, 2417 Example Ave." **Coordinator.** `find_place("San Francisco", "CA")` returns `place_7h3k2mrw`. `find_place("2417 Example Ave, Los Angeles, CA 90026", "Silver Lake, Los Angeles, CA")` returns `place_q4v8n2tx`, a street address with no Google name. Then `update_itinerary` with start place `place_7h3k2mrw` named "San Francisco", end place `place_q4v8n2tx` named "Mike's house", and start date May 13, 2027. **Code** stores these and routes the last day's leg, San Francisco to Mike's house, about 6 hours. Reply: trip length warning, already known. Daily driving: the brief has no max hours yet. **Assumption:** the check is skipped (finding 7). The trip name is now worked out as "Pacific Coast Highway, May 2027." The user sees: "Got it. You'll finish at Mike's house in Silver Lake."
4. **Coordinator** asks about interests, must-sees, driving, budget, and meals, a few at a time. The user names five places for the first day: Millbrae Pancake House, Hangar One at Moffett Field, Philz Coffee in San Jose, the Santa Cruz Beach Boardwalk, and dinner at the Whaling Station in Monterey. Also: the Big Sur coast, elephant seals, a dessert place, mid-range by default, 5 hours of driving a day, scenic, an 8 a.m. start, local food over hotel breakfast, and no rest days. On the last day: "We just want to get to LA quickly." `update_trip_brief` with all of these. Reply: no new results. **Memory:** trip memory notes this is a road-fixed stretch (technical spec section 4.1).
5. **Shape is skipped,** since the route is fixed. **Skeleton. Coordinator.** `find_place` for Monterey (`place_m5c9w3ze`), San Luis Obispo (`place_s8d4p6ub`), and "Big Sur village" (`place_b3g7r2kd`). Then `compute_route` over San Francisco (stop), Monterey (stop), Big Sur village (pass-through), San Luis Obispo (stop), and `place_q4v8n2tx` (stop), with order "keep." Returns about 2 h, 3 h 10 m, and 3 h 35 m. The user sees the proposal: one night in Monterey, one in San Luis Obispo. The user agrees.
6. **Coordinator.** `add_stay(place_m5c9w3ze, "first", 1 night, mid-range, rule "the trip default")`. **Code** creates `stay_r4t8k2vm` and Day 1, `day_a3f8k2m9`, which points to it. It routes Day 1 (San Francisco to the Monterey town, about 2 h on US-101) and re-routes the last day (Monterey to Mike's house, about 5 h 40 m). Reply: days added, the two legs, trip length (already known). **Assumption:** the reply gives the new stay and day IDs (finding 12). Daily driving on the last day: 5 h 40 m plus the buffer is about 6 h 15 m, over 5. Warning, new, held while the skeleton is unfinished.
7. **Coordinator.** `add_stay(place_s8d4p6ub, after stay_r4t8k2vm, 1 night, mid-range, "the trip default")`. **Code** creates `stay_w6n3x9pe` and Day 2, `day_p7x4v2hc`. It routes Day 2 (Monterey to San Luis Obispo, 2 h 20 m inland on US-101) and re-routes the last day (San Luis Obispo to Mike's house, 3 h 35 m). Reply: the trip length warning went away, and the last-day driving warning went away.
8. **Coordinator.** `update_leg(day_p7x4v2hc, [place_b3g7r2kd])`. **Code** re-routes Day 2 through Big Sur village: 3 h 10 m on Highway 1. No results. Then `update_day(day_t9r5e3wz, approve route type: fastest, reason "wants to get to LA quickly")`. No re-route. The user sees Day 3 labeled "Fastest: you want to get to LA quickly." The coordinator adds no scenic waypoints to Day 3.
9. **Coordinator.** Day 1's must-sees come first. `add_stops(day_a3f8k2m9, "first", 5 items)`:
   - meal, "pancakes," along the leg, none, mid-range, the trip default
   - attraction, "aviation history, a giant airship hangar," along the leg, none
   - meal, "coffee," along the leg, none, mid-range
   - attraction, "beach boardwalk and rides," along the leg, none
   - meal, "seafood," near `stay_r4t8k2vm`, "7:00 p.m.," mid-range

   Reply: `stop_c4x7n2pa`, `stop_v8k3r6tm`, `stop_e2w9h4qd`, `stop_k7m2x9qa`, `stop_u3p8z5fn`. No re-route, since the stops are empty.
10. **Coordinator** asks: "People usually spend about 2 hours at Hangar One and 2 at the Boardwalk. Does that sound right?" The user says yes. `find_place` for each of the five. There are three Philz in San Jose. The coordinator asks which one, and the user says "the one on The Alameda." Hangar One comes back with no hours on Google. The coordinator mentions it may have limited public access (finding 14).
11. **Coordinator.** Five `select_user_place` calls. Each adds a candidate set of one, marked "specified by the user," with the user's reason. Each selects it and sets the visit time: 2 h for each attraction and 1 h for each meal. **Code** re-routes Day 1 after each one, and runs the stop-order check from the second selection on. **Assumption:** no detour time for these candidates (finding 9). The route runs San Francisco, Millbrae, Moffett Field, San Jose, CA-17 to Santa Cruz, then Highway 1 to Monterey. These are the user's own stops choosing the road. The coordinator doesn't question that the northern part is inland (technical spec section 4.2). Results:
    - note, new: Hangar One, hours not known
    - the others are open long enough
    - stop order: Google's order is the same as the day's, so no note

    Each place's card shows "your choice." The user sees Day 1: leave 8:00; Millbrae Pancake House 8:25 to 9:25; Hangar One 9:50 to 11:50; Philz 12:05 to 1:05; Boardwalk 1:55 to 3:55; free time; Whaling Station 7:00 to 8:00 (set time); arrive in the Monterey town 8:05.
12. **Change 4.** The user says "five hours at the Boardwalk." **Coordinator.** `update_stop(stop_k7m2x9qa, visit time 5 h)`. No re-route. The schedule now has the Boardwalk until 6:55 and arrival at the Whaling Station at 7:45. Warning, new: late for a set time, "You'd reach dinner at 7:45, but it's set for 7." **Assumption:** this comes back even though the write touched only the Boardwalk (finding 1). At the end of the turn, the coordinator offers three trade-offs: dinner at 8, about 4 hours at the Boardwalk, or a 7:15 start. The user picks dinner at 8. `update_stop(stop_u3p8z5fn, set time "8:00 p.m.")`. The late warning goes away. The Whaling Station (assume open 4:30 to 9:30 p.m.) is open long enough. No approval is needed. The user sees: Boardwalk 1:55 to 6:55, free time, Whaling Station 8:00 to 9:00, arrive in Monterey 9:05.
13. **Fill. Coordinator.** `add_stops(day_p7x4v2hc, "first", 7 items)`, one call:
    - meal, "pancakes and coffee," near `stay_r4t8k2vm`, none, mid-range
    - attraction, "tide pools and a coastal walk," along the leg
    - attraction, "the famous Big Sur bridge, a quick photo stop," along the leg
    - meal, "a meal with an ocean view," along the leg, mid-range
    - attraction, "elephant seals," along the leg (the must-see activity)
    - meal, "tri-tip barbecue," near `stay_w6n3x9pe`, "6:30 p.m.," mid-range
    - meal, "dessert," near `stay_w6n3x9pe`, none, mid-range

    Reply: `stop_y5t2c8rb`, `stop_d9n4g3we`, `stop_f3h7m5ux`, `stop_n6r2k8zt`, `stop_x4e9p2hv`, `stop_j8w3t6cm`, `stop_z2q5v9rk`. The schedule: leave 8:00; stops 1 to 5 "time set once a place is picked"; stop 6 at 6:30 p.m.; stop 7 no time. The drive to San Luis Obispo shows 8:00 to 11:20 a.m. and is listed last (finding 10). No late warning on stop 6. **Assumption:** measured from the last item with a time.
14. **Change 2.** Before the workers go, the user says: "No Sardine Factory, we didn't like it last time." **Coordinator.** `find_place("Sardine Factory", "Monterey, CA")` returns `place_g8t3w5nr`. Then `reject_places([{place_g8t3w5nr, "didn't like it last time"}])`. **Code** adds it to the trip's rejected places. Reply: no stops or stays touched. **Memory:** this might also belong in user memory. The user sees: "Got it. I won't suggest the Sardine Factory."
15. **Coordinator** briefs three workers at once. No leg scout goes to Day 1 (every stop is named) or Day 3 (no stops).
    - **Monterey stay researcher.** `stay_r4t8k2vm`: lodging, mid-range from the trip default, 1 night, May 13. `stop_y5t2c8rb`: Day 2, May 14, "pancakes and coffee," mid-range, "the first thing on Day 2, about 8 a.m. before driving south; next comes a coastal walk." Interests, and local food over hotel breakfast. Places to leave out: none (the tools drop the Sardine Factory).
    - **Day 2 leg scout.** `day_p7x4v2hc`, with the four along-leg stops, their purposes, and roughly when: "they leave Monterey around 9 after breakfast; tide pools mid-morning; the bridge late morning; a meal around noon to 1; elephant seals mid-afternoon; they need to reach San Luis Obispo for a 6:30 dinner." The day's other stops in order: the breakfast (empty) first, then the dinner at 6:30 and dessert (both empty).
    - **San Luis Obispo stay researcher.** `stay_w6n3x9pe`: lodging, mid-range, 1 night, May 14. `stop_j8w3t6cm`: tri-tip at a 6:30 set time. `stop_z2q5v9rk`: dessert, "right after dinner, around 7:30."
16. **Workers.**
    - **Monterey researcher:** `search_near` for hotels and for the café. The Sardine Factory never appears. `add_stay_candidates` adds set 0 with three hotels, including Hotel Abrego. `add_stop_candidates` adds First Awakenings, Old Monterey Café, and Rosine's.
    - **Leg scout:** `search_along_leg(day_p7x4v2hc, …)` several times, for "state natural reserve tide pools," "scenic viewpoint," "restaurant ocean view," and "elephant seal viewing." The route line runs Monterey town, Big Sur village, San Luis Obispo town. Places within 2 miles of either town are dropped. Point Lobos, about 5 miles out, stays. Also a `WebSearch` limited to Atlas Obscura for "Big Sur California." **Code** works out a detour time for each candidate, with one call each. With no selected stops yet, each candidate goes between the Monterey town and the San Luis Obispo town, and code places Big Sur village in the gap that adds the least distance. Results: Point Lobos 6 min, Bixby Creek Bridge viewpoint 2 min, Nepenthe 3 min, Piedras Blancas elephant seal rookery 4 min. Result line: "Piedras Blancas: no hours on Google, hours unconfirmed."
    - **San Luis Obispo researcher:** three mid-range hotels. Tri-tip: Firestone Grill and two others. Dessert: the Madonna Inn's Copper Café, using the café's own listing (technical spec section 6.4), and two others.
17. **UI and coordinator.** The user selects Hotel Abrego on the Monterey card. **Code** re-routes Day 1, which now ends at the hotel, and Day 2, which now starts there.
18. **Change 3.** On the San Luis Obispo hotel card the user clicks "Higher tier." **UI** sends "User asked for a higher tier on the San Luis Obispo hotel card." **Coordinator.** `update_stay(stay_w6n3x9pe, tier posh, rule "the user asked for a higher tier")`. **Code** records 1 night with the tier. The coordinator briefs the San Luis Obispo researcher with the lodging only, posh, leaving out the three set 0 hotels. The worker's `add_stay_candidates` makes set 1 with three posh hotels. The card now shows set 1, labeled "Posh, from rule: you asked for a higher tier." The user selects Hotel Cerro. `select_candidate(stay_w6n3x9pe, place_c6h2r8vx)`. **Code** re-routes Day 2 and Day 3. Reply: the new drive times, no results. The coordinator confirms in chat.
19. **UI and coordinator.** The user picks the Day 2 stops: First Awakenings, Point Lobos (estimate 1 h 30 m), Bixby (20 m), Nepenthe, Piedras Blancas (45 m), Firestone Grill, Copper Café. Each `select_candidate` re-routes Day 2. Code places the Big Sur waypoint between Bixby and Nepenthe, where it changes nothing. Stop order: same as Google's, so no note. Results: Piedras Blancas, hours not known (note, new). Day 2 driving: about 3 h 20 m plus the buffer, under 5. The user sees Day 2: First Awakenings 8:10; Point Lobos 9:25; Bixby 11:10; Nepenthe 12:05; Piedras Blancas 2:35; free time; Firestone 6:30 (set); Copper Café 7:35; Hotel Cerro 8:40.
20. **Weather round. Coordinator.** Most selections are made, so it briefs the weather worker with `[stay_r4t8k2vm, stay_w6n3x9pe]`.
    - Monterey: `stay_weather(stay_r4t8k2vm, place_m5c9w3ze)` returns seasonal averages for May 13 to 14, plus 7 days on each side, over 2017 to 2026: highs about 64, lows about 50, morning fog. Activities: Hangar One and the Boardwalk, which are along Day 1's leg. `set_stay_weather` labels it seasonal averages and records the place, dates, and those stop IDs and place IDs.
    - San Luis Obispo: activities are Point Lobos, Bixby, and Piedras Blancas, along Day 2's leg. The last day has no along-leg stops. `set_stay_weather`.

    The user sees each stay's weather and clothing text, labeled "Typical for this time of year."
21. **Change 5: add Big Sur.** The user wants a night in Big Sur. `find_place("Big Sur", "CA")`. **Assumption:** this returns a locality, `place_n2v8k4hs`. Then `add_stay(place_n2v8k4hs, after stay_r4t8k2vm, 1 night, mid-range, "the trip default")`. **Code** creates `stay_h2z7c5qa` and a new day, `day_g6m2y8ks`, after Monterey's day. The old Day 2 is now Day 3 (Big Sur to San Luis Obispo, May 15) and the last day is Day 4 (May 16). Re-routed: the new Day 2 (Hotel Abrego to the Big Sur town, about 1 h) and Day 3 (the Big Sur town north to First Awakenings, then south through the stops to Hotel Cerro, about 4 h 10 m plus the buffer). Day 4 isn't re-routed, since its start and end are unchanged. The reply lists Day 3's seven stops. Check results:
    - warning, new: trip length vs the brief (4 vs 3)
    - warning, new: search area doesn't fit the day, for First Awakenings (near the Monterey stay, on a day starting at Big Sur)
    - note, new: weather out of date for Big Sur (no text after the weather round)
    - no stop-order note: every order drives north to Monterey and back
    - San Luis Obispo's dates moved by a day, still inside its recorded window, so its averages aren't out of date

    All held while the change is discussed. The coordinator talks through the stops: Point Lobos and Bixby are on the new day's road.
22. The user agrees to move Point Lobos and Bixby. **Coordinator.** `move_stop(stop_d9n4g3we, day_g6m2y8ks, "first", "none")`, then `move_stop(stop_f3h7m5ux, day_g6m2y8ks, after stop_d9n4g3we, "none")`. Each re-routes both days. The candidates keep their detour times, labeled as of when offered. Note, new: weather out of date for San Luis Obispo (Point Lobos and Bixby left its activities). The breakfast warning is still open. **Memory:** an open item, "decide on Big Sur."
23. **The user changes their mind.** **Coordinator,** following technical spec section 5.2: move them back first. `move_stop(stop_d9n4g3we, day_p7x4v2hc, after stop_y5t2c8rb, "none")` and `move_stop(stop_f3h7m5ux, day_p7x4v2hc, after stop_d9n4g3we, "none")`. Then `remove_stay(stay_h2z7c5qa)`. Nothing is on its days, and no stop has it as a search area, so this goes through. **Code** removes the day. The old Day 2 starts at Hotel Abrego again and is re-routed. Every result raised by step 21 went away: trip length, search area, both weather notes. San Luis Obispo's activities match what was recorded again. No weather rerun. The coordinator never raised the held warnings. **Memory:** "Tried a Big Sur night and decided against it."
24. **Change 6.** The user says "Let's try the Sardine Factory after all." **Coordinator.** `find_place("Sardine Factory", "Monterey, CA")` returns it marked rejected, with the reason "didn't like it last time." The coordinator says: "You turned it down earlier because you didn't like it last time. This version can't take a rejection back." It offers more options for Day 1's dinner. The user says to keep the Whaling Station. (A "More options" would have briefed the Monterey researcher for `stop_u3p8z5fn`, leaving out the Whaling Station.)
25. **Side check, not a listed change: rejecting a selected place.** Say the user says "skip the Madonna Inn, it's too kitschy." `reject_places([{Copper Café's place, "too kitschy"}])`. Copper Café leaves `stop_z2q5v9rk`'s candidates. The selection is cleared and Day 2 is re-routed. The card shows the other two from set 0, with no worker call. Its visit time no longer counts, and no weather change follows, since it's a meal.

**Session 2. Change 7. Today is May 8, 2027.**

26. **UI.** The user opens the trip and starts a new session. **Coordinator.** `read_itinerary()` with no scope, and `read_trip_brief`. **Assumption:** `read_memory` too (finding 15). Results:
    - note: forecast now available for Monterey (dates May 13 and 14) and San Luis Obispo (May 14 and 15). May 8 is day 0, so May 15 is day 7. These are new: not in the saved list.
    - notes: Hangar One and Piedras Blancas hours not known (already known)
    - no open warnings
    - approvals: Day 3's route type (fastest)

    The coordinator says: "Your trip is within a week, so I can swap the typical weather for an actual forecast. Want that?" The user says yes. Weather worker with `[stay_r4t8k2vm, stay_w6n3x9pe]`. `stay_weather` now returns Google's 8-day forecast. `set_stay_weather` labels it a forecast. The notes go away. (See finding 8 for a later reopen.)

**Finished San Francisco itinerary.** It matches technical spec section 3.1, except: Boardwalk 1:55 to 6:55, Whaling Station at 8:00 p.m., the SLO hotel is posh (Hotel Cerro), and the weather is a forecast.

### Grand Junction to Salt Lake City through Moab

**Session 1. Today is March 1, 2027.**

1. **UI and code.** A new trip, with only the last day, `day_u3p7w2gn`. The user writes: "Grand Junction to Salt Lake City by way of Moab. Arches, hiking, red rock." **Coordinator.** `read_memory`. `update_trip_brief` with route "Grand Junction to Salt Lake City through Moab."
2. **Change 1.** The user says: "We start October 10, 2027, five days." **Coordinator.** `find_place("Grand Junction", "CO")` returns `place_h4w8e2rt`, and `find_place("Salt Lake City", "UT")` returns `place_z7k3m5pq`. Then `update_itinerary` with both places and the start date October 10, 2027 (a Sunday). **Code** routes the last day, Grand Junction to Salt Lake City, about 4 h 30 m. `update_trip_brief(trip length 5)`. Reply: trip length vs the brief (1 vs 5), held.
3. **Discovery.** The user gives:
   - must-sees: Delicate Arch at sunrise, Arches, Capitol Reef, Goblin Valley, stargazing, the river road (Highway 128), pie at Capitol Reef
   - 4 hours of driving a day, scenic, an 8 a.m. start, one rest day in Moab
   - budget: value by default, mid-range for stays of 2 or more nights
   - meals: local cafés, burgers, brewpubs, "one nice dinner in Moab"

   The coordinator asks whether "mid-range for 2+ nights" covers meals in Moab (technical spec section 9). The user says "just the hotel." `update_trip_brief` with all items. **Memory:** Grand Junction to Moab has a fixed road (Highway 128). Moab onward has fixed places.
4. **Shape. Coordinator.** The way from Moab to Salt Lake City is open, so it offers three sketches in chat:
   - "Arches and Capitol Reef": Moab 3 nights, then Torrey, then Salt Lake City
   - "All Moab": 4 nights, then straight north
   - "San Rafael Swell": Moab, then Green River

   One `compute_route` per sketch, with Dewey Bridge as a pass-through, using its place ID from `find_place`. The user picks the first sketch.
5. **Skeleton. Coordinator.** `find_place` for Moab (`place_m3r8t2wx`) and Torrey (`place_t6v2c9kn`).
   - `add_stay(place_m3r8t2wx, "first", 3, mid-range, "stays of 2+ nights")` creates `stay_k3x8p2wd` and Days 1 to 3: `day_r2m8x4kc`, `day_c7w3t9pe`, `day_n5h2v8qx`.
   - `add_stay(place_t6v2c9kn, after stay_k3x8p2wd, 1, value, "the trip default")` creates `stay_v5n9r2ht` and Day 4, `day_e8k4z3rm`.
   - **Code** routes Day 1 (Grand Junction to the Moab town, 1 h 45 m on I-70 and US-191), Day 4 (Moab to Torrey, 2 h 35 m on UT-24 through Capitol Reef), and Day 5 (Torrey to Salt Lake City, 3 h 20 m). Days 2 and 3 have no leg yet. The trip length warning went away.
   - `update_day(day_n5h2v8qx, rest day: yes)`.
   - `find_place("Dewey Bridge", "Utah")` returns `place_d5x3q8me`. `update_leg(day_r2m8x4kc, [place_d5x3q8me])` re-routes Day 1 onto Highway 128: 2 h.
   - Capitol Reef is an area. Day 4's road already runs through it, so no waypoint is needed. Arches is an area on a day that stays put (finding 13).
6. **Must-see: Delicate Arch.** `add_stops(day_c7w3t9pe, "first", [attraction, "sunrise hike to a famous arch," near stay_k3x8p2wd, "6:00 a.m."])` returns `stop_q2v7c5hd`. The coordinator asks: "Most people take 2.5 to 3 hours on the Delicate Arch trail with time at the top. Does 2.5 sound right?" The user says yes. It mentions that Arches may need a timed-entry reservation in October, and an entry before 7 a.m. may avoid it. `find_place("Delicate Arch Trailhead", "Arches National Park, UT")`. Then `select_user_place(stop_q2v7c5hd, place_a4k8r2nm, "Delicate Arch Trail," "hiking trail," "your must-see sunrise hike," visit time 2 h 30 m)`. **Code** gives Day 2 a leg (the Moab town to the trail and back, about 30 minutes each way). Results:
   - warning, new: late for a set time, "You'd reach the sunrise hike at 8:35, but it's set for 6:00"
   - Delicate Arch (assume open 24 hours): open long enough, nothing said

   The coordinator offers a 5:30 start. The user agrees. `update_day(day_c7w3t9pe, start time "5:30 a.m.")`. The warning goes away, with an arrival at 6:03. No approval.
7. **Must-see: Goblin Valley.** `add_stops(day_e8k4z3rm, "first", [attraction, "goblin-shaped hoodoos," along the leg, none])` returns `stop_a8r3w6ze`. Visit time 2 h, agreed. Then `select_user_place`. **Code** re-routes Day 4 through Goblin Valley's side road: about 3 h 15 m.
8. **Fill layout. Coordinator.**
   - Day 1: `add_stops(day_r2m8x4kc, "first", [attraction, "red rock towers by the river, a short walk," along the leg, none; meal, "brewpub," near stay_k3x8p2wd, "6:00 p.m.," value, "the trip default"])`.
   - Day 2: `add_stops(day_c7w3t9pe, after stop_q2v7c5hd, 5 items)`:
     - attraction, "big arches on an easy walk in Arches," near Moab, none
     - meal, "muffins and coffee," near Moab, none, value
     - meal, "burgers and shakes," near Moab, "12:00 p.m.," value
     - attraction, "a short hike to an arch outside the park," near Moab, none
     - meal, "a special dinner," near Moab, "7:00 p.m.," posh, rule "one nice dinner in Moab"
   - Day 3 (rest day): `[meal, "casual dinner near the hotel," near Moab, "6:30 p.m.," value]`, with a set time as technical spec section 5.2 requires (finding 11).
   - Day 4: `add_stops(day_e8k4z3rm, after stop_a8r3w6ze, 3 items)`:
     - meal, "pie," along the leg, none, value
     - attraction, "a short hike in Capitol Reef," along the leg, none
     - attraction, "stargazing," near `stay_v5n9r2ht`, "1:00 a.m., next day"
   - The coordinator offers a late start on Day 5. The user agrees. `update_day(day_u3p7w2gn, start time "10:00 a.m.")` (finding 17). The coordinator also asks about dinner in Torrey on Day 4. The user says "we'll grab something, don't plan it."
9. **Coordinator** briefs four workers at once. No scout goes to Day 5, which has no stops.
   - **Moab stay researcher:** lodging (mid-range, rule "stays of 2+ nights," 3 nights, October 10 to 12). Day 1 brewpub at 6:00. Day 2's five stops, each with roughly when, such as "Windows: right after the sunrise hike, about 8:45" and "muffins: back in town mid-morning, about 10:15." Day 3's dinner at 6:30.
   - **Torrey stay researcher:** lodging (value, 1 night, October 13). Stargazing at "1:00 a.m. on October 14, the night of Day 4."
   - **Day 1 leg scout:** `day_r2m8x4kc`, the towers stop, "mid-morning, about 9:45, after leaving Grand Junction at 8."
   - **Day 4 leg scout:** `day_e8k4z3rm`, with pie "after Goblin Valley ends around noon, so about 1 p.m." and the hike "mid-afternoon." The other stops are listed: Goblin Valley at 9:55 (selected) and stargazing at 1 a.m. (empty).
10. **Workers.**
    - **Day 1 scout:** `search_along_leg(day_r2m8x4kc, "red rock hiking trail")`, with places near Grand Junction and the Moab town dropped. Returns Fisher Towers Trail (estimate 2 h, no Google hours, detour about 12 min), Castle Valley Overlook, and the Dewey Bridge site.
    - **Day 4 scout:** pie returns Gifford Homestead (note: "closed Wednesdays"), Stan's Burger Shak in Hanksville, and Duke's in Hanksville (**Assumption:** made-up details). Places near Torrey are dropped. Hikes return Capitol Gorge (2 h), Hickman Bridge, and Grand Wash. Detour times are measured between Goblin Valley and the Torrey town. Result line: "Gifford Homestead is closed on Wednesdays, and Day 4 is a Wednesday."
    - **Moab researcher:** general and Atlas Obscura searches, since the stay is 3 nights. Hotels include Moab Springs Ranch. The other stops get Windows Section, Love Muffin Cafe, Milt's Stop & Eat, Corona Arch trail, Desert Bistro, and The Spoke on Center, among others.
    - **Torrey researcher:** value hotels. Stargazing returns Panorama Point, Sunset Point, and Goosenecks Overlook.
11. **Selections.** The user picks each one. **Code** re-routes each time.
    - Moab Springs Ranch re-routes Days 1, 2, and 4. Day 3 is a rest day with no leg.
    - The Torrey hotel re-routes Days 4 and 5.
    - Fisher Towers: note, new, hours not known. The card says "Hours not confirmed. Check before you go."
    - The Spoke: no re-route, since it's a rest day.
    - Milt's: warning, new, open but not long enough: "Milt's closes at 12:30 p.m. You'd get there at noon, with an hour planned. Times are estimates from average drive times."
    - Gifford Homestead: picked from the card despite the note. Warning, new: closed for the whole visit.
    - Capitol Gorge and Panorama Point. Day 4 then runs about 3 h 45 m on the road plus the buffer, about 4 h 10 m. Warning, new: daily driving, "Day 4 needs about 4 hours 10 minutes against your 4-hour default."
12. **Coordinator** at the end of the turn raises Milt's, Gifford, and Day 4's driving. It mentions Fisher Towers' unconfirmed hours briefly.
    - **Milt's (change 2).** The user says "move it to the morning." `read_place` shows Milt's hours. **Assumption:** opens at 7:00 a.m. The example gives only the 12:30 close. `move_stop(stop_t3z6w8pc, day_c7w3t9pe, after stop_h8x3p6wn, "none")`. **Code** re-routes Day 2. Milt's is now 10:20 to 11:20, open long enough, and the warning goes away. Love Muffin is now 11:25 (assume open until 2 p.m.).
    - **Stop order.** The re-route returns a note, new: "A faster order saves about 25 minutes by doing Corona Arch right after Windows. Dinner would still be on time." It's stored with Day 2's leg. The coordinator raises it, and adds that Milt's would then be close to its 12:30 closing. The user says to keep the order. **Memory:** "Turned down the faster Day 2 order. Wants meals before Corona Arch."
    - **Gifford.** The user says "Keep it, we'll take our chances." `update_stop(stop_y4m9c2tk, approve opening hours, reason "wants to try it even though it's closed Wednesdays")`. **Code** records the place and 0 minutes. The warning is approved.
    - **Day 4's driving (change 3).** The coordinator offers three trade-offs: accept a longer day, drop Capitol Gorge, or drop Goblin Valley. The user says "Up to 5 hours is fine." `update_day(day_e8k4z3rm, approve drive hours 5, reason "wants Goblin Valley and Capitol Reef on the way")`. The warning is approved.
13. **The user changes their mind on Gifford:** "Find us a substitute. What were the other pie places?" **Coordinator.** `read_itinerary(stop_y4m9c2tk)`, a stop-scoped read, returns three candidates with their rationale. `read_place` on Stan's and Duke's shows both open Wednesday. The coordinator lists them. The user picks Stan's. `select_candidate(stop_y4m9c2tk, place_s9p4m2vh)`. **Code** removes Gifford's approval, since the place changed, and re-routes Day 4. Gifford's warning went away. Driving is still approved (about 4 h 15 m, under 5). There is no rejection, because the reason was the date. **Memory:** "Took Stan's only because Gifford is closed Wednesdays" (finding 6). The user sees Day 4: Goblin Valley 9:55; Stan's 12:30; Capitol Gorge 2:35 to 4:35; free time; Panorama Point 1:00 a.m. next day (set); Torrey hotel 2:10 a.m.
14. **Weather round.** The coordinator briefs the weather worker with `[stay_k3x8p2wd, stay_v5n9r2ht]`.
    - Moab's activities: Fisher Towers (along Day 1's leg), Delicate Arch, Windows, and Corona Arch.
    - Torrey's: Goblin Valley and Capitol Gorge (along Day 4's leg), and Panorama Point at 1 a.m.
    - Seasonal averages for 2017 to 2026: Moab highs about 72, lows about 42. Torrey highs about 64, lows about 33, with many freezing nights.
    - The text covers layers for a 5:30 start and warm clothes for 1 a.m. stargazing. Two `set_stay_weather` calls.
15. **Change 4.** "Move everything one day later." `update_itinerary(start date October 11, 2027)`. **Code** re-routes nothing. Every date moves: Day 2 is now Tuesday and Day 4 Thursday. The opening-hours check runs again. Every stop still passes. Gifford is open on Thursdays now, but nothing says so (finding 6). The weather averages stay current, since the new dates are inside each stay's recorded dates plus 7 days on each side. Reply: no new results, if the trip-wide reply covers all stops (finding 1). The user sees the dates shift.
16. **Change 5, part 1: Moab to 2 nights.** `read_itinerary(stay_k3x8p2wd)`, a stay-scoped read, shows Days 1 to 3 and their stops. The coordinator says: "Removing a night removes Day 3, your rest day, with dinner at The Spoke." The user says "Drop it, and the Spoke dinner." `remove_stops([stop_x5k8t2nv])` has no re-route, since it's a rest day. Then `update_stay(stay_k3x8p2wd, nights 2)`. **Code** removes `day_n5h2v8qx`. The Torrey day is now Day 3, Wednesday October 13, and the last day is Day 4. The Torrey day still starts at Moab Springs Ranch, so it isn't re-routed. Results:
    - warning, new: trip length vs the brief (4 vs 5)
    - note, new: stay tier set for different nights, "Moab's nights changed from 3 to 2. Its tier was set for 3."
    - the hours check reruns on the Torrey day's new date. Stan's is open Wednesday.
    - weather: Moab's new dates are October 11 to 13, inside the recorded window, so no note

    The user accepts a 4-day trip. `update_trip_brief(trip length 4, rest days: none)`, which clears the trip length warning. The rule still gives mid-range for 2 nights, so the coordinator doesn't ask. `update_stay(stay_k3x8p2wd, tier mid-range, "stays of 2+ nights")` records 2 nights and clears the note.
17. **Change 5, part 2: the 5-hour hike.** `add_stops(day_c7w3t9pe, after stop_q2v7c5hd, [attraction, "a long hike in Arches, about 5 hours," near stay_k3x8p2wd, none])` returns `stop_s3w9k4pd`. No re-route. The schedule still shows Windows 8:50, Milt's 10:20, Love Muffin 11:25, and Corona Arch 12:40, all passing. No marks (finding 3). Note, new: weather out of date for Moab (a new attraction stop). The coordinator briefs the Moab researcher: "after the sunrise hike, starting about 8:45 a.m. and running to about 2 p.m." The worker's `search_near(stop_s3w9k4pd, "long hikes in Arches National Park")` returns Devils Garden Primitive Loop (estimate 5 h), Tower Arch (3 h 30 m), and Fiery Furnace (3 h, note "permit required").
18. The user picks Devils Garden. `select_candidate` sets the visit time to 5 h and re-routes Day 2. Results:
    - warning, new: Milt's closed for the whole visit (arrival 3:50 p.m.)
    - warning, new: Love Muffin closed for the whole visit (4:55 p.m.)
    - warning, new: late for a set time, "You'd reach dinner at 8:25, but it's set for 7"
    - stop-order note, already known, new text: no saving now
    - weather note, already known

    The coordinator offers three trade-offs: drop Milt's, Love Muffin, and Corona Arch so dinner stays on time; keep Corona Arch and move dinner to 8:30; or take the shorter Tower Arch hike. The user takes the first and says "we'll pack a lunch, sort it out later." `remove_stops([stop_t3z6w8pc, stop_m5e2r9tk, stop_g2n5x7hr])` re-routes Day 2. All three warnings went away. Milt's isn't rejected, since the reason is the time. The stop-order note went away, since the faster order involved Corona Arch. **Memory:** an open item, "Day 2 lunch." At the end of the turn, nothing is being discussed, so the coordinator reruns the weather worker for `[stay_k3x8p2wd]`. The new text adds water and sun advice for Devils Garden. `set_stay_weather` records October 11 to 13 and the new activities, and the note clears. The user sees Day 2: leave 5:30; Delicate Arch 6:00; Devils Garden 8:55 to 1:55; Windows 2:20 to 3:20; free time; Desert Bistro 7:00; hotel 8:05.

**Session 2. Change 6. Today is March 2, 2027.**

19. **UI.** The user starts a new session. **Coordinator.** `read_itinerary()`, `read_trip_brief`, and `read_memory` (finding 15). All results are already known:
    - no open warnings
    - notes: Fisher Towers and Panorama Point hours not known
    - approved: the Torrey day's drive hours (5)

    Opening line: "Welcome back. Nothing is open from last time."
20. "Why did we pick that Moab hotel?" The full read gives Moab Springs Ranch with its rationale: "Mid-range, from rule: stays of 2+ nights. Quiet, with kitchens and a pool, close to Arches." Trip memory has no reason for the choice, so the coordinator says the user didn't give one. (See finding 18 on rationale naming nights.)
21. "What's left to decide?" From the full read and trip memory:
    - every stop and lodging is selected
    - no open warnings
    - an open item from trip memory: lunch on Day 2
    - approved exceptions: the 5-hour day to Torrey; also the 5:30 start on Day 2 and the 10:00 start on the last day
    - two places with unconfirmed hours

**Session 3. Change 7. Today is October 6, 2027.**

22. **UI.** A new session. **Coordinator.** Full read, the brief, and memory. Note, new: forecast now available for Moab. Its dates are October 11, 12, and 13, and October 13 is day 7. Torrey's dates are October 13 and 14. October 14 is day 8, so Torrey keeps seasonal averages. The coordinator says: "Moab is within forecast range now. Want the actual forecast? Torrey will be in range tomorrow." It also reminds the user about Arches timed entry. The user says yes. The weather worker runs for `[stay_k3x8p2wd]`. `stay_weather` returns Google's forecast for October 6 to 13. `set_stay_weather` labels it a forecast, and the note goes away.

**Finished Moab itinerary.** It differs from technical spec section 3.1 because of the changes:
- 4 days starting Monday, October 11.
- Moab has 2 nights with no rest day.
- Day 2: sunrise at Delicate Arch, Devils Garden, Windows, and Desert Bistro.
- Torrey day: Goblin Valley, Stan's (pie), Capitol Gorge, and Panorama Point at 1 a.m., with a drive hours approval for 5.
- The last day starts at 10 a.m.
- Moab has a forecast. Torrey has seasonal averages.
