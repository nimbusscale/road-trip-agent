# Walk-through findings, run 6

> **Snapshot, out of date.** This is the output of design walk-through 6, from 2026-10-12. It describes the design as it was then. The design changed after it, so much of this no longer matches. The current design is in `design/`. Anything still open is in `research/domain-model-notes.md`. See `reviews/walkthroughs/README.md`.

Both examples in technical spec section 3.1 were walked from an empty trip, with the changes from the prompt. Today is March 1, 2027 unless a step says otherwise. Only the files in `design/` were read. Tool replies, hours, and drive times are made up to fit `tool-design.md`. Hours marked "assume" in technical spec 3.1 were used as given.

Made-up hours used in the walk (as if from Google):

- Santa Cruz Beach Boardwalk: 11 a.m. to 8 p.m. daily
- Moffett Field Museum, next to Hangar One: Wednesday to Saturday, 10 a.m. to 3 p.m.
- The Whaling Station: 4 to 9:30 p.m. daily
- Milt's: 7 a.m. to 12:30 p.m. daily (the closing time is the planted one)
- Gifford Homestead: closed Wednesdays (planted), otherwise 7 a.m. to 5 p.m.
- Stan's Burger Shak: 7 a.m. to 9 p.m. daily
- Love Muffin Cafe: 7 a.m. to 1 p.m. daily

---

## Review groups

12 findings plus 2 extra items from the properties list (E1, E2), in 5 groups. Settle them in this order.

1. **Check results and the schedule:** F1, F2, F6. The only real design gaps in this run are F1 and F2.
2. **Weather text:** F3, F4.
3. **Option cards and tiers:** F5, F7.
4. **Started trips and dates:** F9, F10.
5. **Small fixes:** F8, F11, F12 (four items), E1, E2.

F4 partly re-raises a fifth-run decision: forecasts aren't refreshed as they age. Whatever we decide, it needs wording so it isn't flagged again.

---

## 1. Findings

Most important first.

### F1. Stops after an empty stop that has a set time get times out of order. Needs a decision

**What happened.** San Francisco Day 2, during the fill. The user picked Copper Café (dessert) before picking the tri-tip dinner. The dinner stop has a set time of 6:30 p.m. and no place yet. Technical spec 3.1 says an empty stop takes no time, and "the drive to the next selected stop starts from the selected stop before it." So Copper Café arrives when Piedras Blancas ends (3:35) plus the drive to San Luis Obispo. The day reads:

- 2:35 p.m. Piedras Blancas, until 3:35
- 6:30 p.m. tri-tip dinner (set time, place not picked yet)
- 4:35 p.m. Copper Café, until 5:35
- 5:45 p.m. arrive at the hotel

Dessert shows two hours before dinner, and the party "arrives" at the hotel before dinner. The late-for-a-set-time check in technical spec section 8 already counts an empty stop's set time as "the last item before it with a time." The schedule rule doesn't. Copper Café's opening hours were also tested at 4:35. It's open then, so there is no result to carry the "may be too early" mark, and nothing on the day says the time is wrong.

**Touches:** technical spec 3.1 (the schedule bullets), technical spec section 8 (late for a set time, and "a stop after an empty stop may really come later"), tool design 2.1 (`read_itinerary`).

**Options:**

- **A. Treat an empty stop with a set time as a point in time.** The next stop can't arrive before that set time. Its arrival is the later of two times: the selected stop before it ends, plus the stored drive; or the empty stop's set time. This matches the late check, and the day stays in order. Copper Café would show 6:30, still too early, but in the right place. **Recommended.**
- **B.** Same as A, but add the stored drive after the set time. This counts the drive twice in practice, because most of the drive from Piedras Blancas happens before dinner.
- **C.** Keep the rule. Mark every stop after an empty stop as "may be too early" in the schedule itself, not only on its opening-hours result.

**Post-review analysis.** I checked this against technical spec 3.1 and section 8, and it holds. The schedule rule skips an empty stop's set time, but the late check counts it. So the two disagree about when the party reaches the next stop. I agree with option A. It doesn't undo the "an empty stop takes no time" decision. The empty stop still takes no time, but it sits at its set time, and the next stop can't arrive before it. That's one sentence in technical spec 3.1, and the "may be too early" mark still applies.

**Settled 2026-10-12: option A, as proposed. Technical spec 3.1.**

### F2. The docs don't say whether worker writes run the checks or save the check results list. Needs a decision

**What happened.** On May 8 the San Francisco trip comes into forecast range. The coordinator's session-start read shows "forecast now available" for Monterey and San Luis Obispo. The weather worker then calls `set_stay_weather` twice. That is a write, and tool design 2.1 says "every write" returns check results. Technical spec section 8 says "only writes save the list." If the worker's writes save the list, then:

- The forecast notes go away inside the worker's call. The coordinator never gets a reply listing them as gone. That part is harmless.
- Any result that first appears during a worker's write is saved as "already known" without ever reaching the coordinator. The clearest case is "forecast now available," which can appear on any write once the date ticks over. Between the worker's first and second `set_stay_weather` calls, the second stay has no text and gets "weather out of date." Same problem.

This breaks the promise in technical spec section 8 that "every result saved as already known has come back to the coordinator at least once." The same question applies to `add_stay_candidates` and `add_stop_candidates`. They change nothing any check reads, but the rule "every write" still covers them.

**Touches:** technical spec section 8 ("Check results are worked out fresh", "What comes back"), tool design 2.1 (the "Writing" paragraph, `set_stay_weather`, the two candidate tools).

**Options:**

- **A. Worker writes don't run the checks, return no check results, and don't save the list.** The coordinator's next write reports what changed, such as the forecast notes going away. **Recommended.** It is the smallest rule, and workers can't act on check results anyway.
- **B.** Worker writes run the checks and save the list. The worker passes any new result up in its own result. This adds work to every worker for no gain.
- **C.** Worker writes run the checks but don't save the list. Same effect as A, with wasted work.

**Post-review analysis.** This holds. Technical spec section 8 promises that every result saved as "already known" has reached the coordinator once. That breaks if a worker's write saves the list. I agree with option A: worker writes (`set_stay_weather`, `add_stay_candidates`, `add_stop_candidates`) don't run the checks or save the list. The fix is a sentence in technical spec section 8 and in the "Writing" paragraph in tool design 2.1, plus a line on each of the three tools.

**Settled 2026-10-12: option A, as proposed. Technical spec section 8 and tool design 2.1.**

### F3. Weather text can name dates, weekdays, and clock times that go stale without being marked out of date. Wording fix

**What happened.** The weather round for Moab ran with the trip starting October 10. `stay_weather` returns each activity with "its date and time, for the worker to write from" (tool design 2.5). So the worker wrote Torrey's text like this: "Wednesday, Oct 13: Goblin Valley will be warm at midday. Stargazing at Panorama Point at 1 a.m. will be near freezing." Then the user moved the trip a day later. Technical spec 3.5 says seasonal averages aren't out of date while the new dates stay inside the 7-day window, so the text was kept as current. It now names the wrong weekday and date. The same happens with a clock time: if stargazing moved to 11 p.m., the text would still say 1 a.m., and nothing marks it, because a time change isn't a change to activities.

Candidate rationales and notes already have a rule against naming the trip's dates (technical spec 3.2, 6.4). Weather text has no such rule.

**Touches:** technical spec 6.3 (instructions for the weather worker), technical spec 3.5 (the seasonal-averages exception), tool design 2.5 (`stay_weather` returns dates and times).

**Options:**

- **A. Tell the weather worker that seasonal-averages text names no dates, weekdays, or clock times.** It names activities and the part of the day instead, such as "late-night stargazing." Forecast text can name dates, since any date change already marks a forecast out of date. **Recommended.**
- **B.** Mark seasonal text out of date on any date change. This reruns the worker more often, for no change in the averages.
- **C.** Have `stay_weather` leave dates out of the activities it returns for seasonal averages. This helps, but times still leak, so A is still needed.

**Post-review analysis.** This holds. We already keep dates and times out of what's saved with the weather text. We never said to keep them out of the text itself. I'd go a little further than option A. No weather text names clock times, forecast or not, because a time change never marks the text out of date. Seasonal-averages text also names no dates or weekdays. Forecast text can name dates, since any date change marks a forecast out of date. This is a wording fix in technical spec 6.3.

**Settled 2026-10-12: option A, extended so no weather text names clock times. Technical spec 6.3.**

### F4. A forecast doesn't record when it was made, so a started trip shows a stale forecast as current. Needs a decision

**What happened.** On October 6 the coordinator offered a forecast for the Moab stay, and the weather worker wrote one. On October 12 the trip has started. The user opens the trip. The Moab weather says "Forecast" with highs and storm chances for October 11 to 13. It was made six days earlier. Technical spec 3.5 says "a forecast isn't refreshed as it ages, and nothing marks it old." Before the trip starts, the user can ask for a new one. After it starts, every write is refused, including weather text (technical spec section 8), so the coordinator can't refresh it either. Nothing stored says when the forecast was made, so neither the UI nor the coordinator can say "forecast as of Oct 6."

**Touches:** technical spec 3.5 (weather out of date), technical spec 3.1 (stay: weather text), technical spec section 8 (trip has started), tool design 2.1 (`set_stay_weather`), functional spec 8.

**Options:**

- **A. Store the date the text was written.** The UI shows "Forecast as of Oct 6," and the coordinator can say it. This needs no outside call. **Recommended.**
- **B.** Let weather text be rewritten after the trip starts, as the one exception to the lock. This creeps toward in-trip mode, which functional spec 2 rules out.
- **C.** Leave it. The user may plan around a week-old forecast.

**Post-review analysis.** This partly re-raises the fifth-run decision that a forecast isn't refreshed as it ages. The new part is the started trip: the user can't ask for a new forecast once the trip locks. Storing the date the text was written is cheap. But it's an in-trip concern, and functional spec 2 rules out in-trip use. Following the "prefer scope cuts" approach, I lean to option C, with wording so it isn't flagged again. In technical spec 3.5, say that once a trip starts, its weather text stays as it was, and the app doesn't track how old it is. If you'd rather show "as of Oct 6," option A is a small add.

**Settled 2026-10-12: out of scope, as before. Wording added to technical spec 3.5 so it isn't flagged again.**

### F5. The option card after a pick is turned down: the functional spec and technical spec disagree. Wording fix

**What happened.** Moab Day 4. The user picked Gifford Homestead from a set of three pie places. It's closed Wednesdays. The user first kept it, then asked for a substitute and didn't remember the others. That is a reason about the date, so the coordinator doesn't reject Gifford (technical spec 3.2, 5.2). No rejection means no card comes back. Functional spec 7.5 says "a new card appears ... when a turned-down pick leaves others in its set," and Gifford's set still has two others. The coordinator instead did a stop-scoped read and listed the other two in chat. The user picked by chat.

There's a second mismatch. Functional spec 7.5 says the new card shows the others "in its set." Technical spec 3.2 says the card shows "the newest set, the one with the highest set number still present." These differ when the turned-down pick came from an older set. Example: the San Luis Obispo hotel. The user picked Garden Street Inn from set 0 (mid-range) after set 1 (posh) existed. Rejecting it would bring back a card showing set 1, the posh hotels, not the other two mid-range ones.

A smaller point from the same walk. When the user asked "what were the other hotels?", the coordinator listed five hotels from two sets. "Take the second one" is only clear if the list is numbered once across both sets. Technical spec 7.1 says "the second one in whatever the coordinator last listed in chat," but doesn't say how to number a list that spans sets.

**Touches:** functional spec 7.5, technical spec 3.2 ("The list keeps every candidate", "A rejection is about the place"), technical spec 5.2 ("When the user turns down a place"), technical spec 7.1.

**Options:**

- **A. Reword functional spec 7.5:** a new card appears only after a rejection, and it shows the newest set still present. When the user turns down a pick for a date or time reason, the coordinator lists the other candidates in chat, numbered once across all sets. **Recommended.**
- **B.** Let the user ask to see the card again. The UI reopens the newest set without a rejection. This needs a new UI action.
- **C.** Show the turned-down pick's own set, as functional spec 7.5 says. This needs code to know which set a rejected place was in, after it has been removed from the candidates.

**Post-review analysis.** This holds. Functional spec 7.5 says a new card appears when "a turned-down pick leaves others in its set." But technical spec 3.2 always shows the newest set, and only a rejection brings a card back. I agree with option A. Change functional spec 7.5 to say that a new card appears after new options are offered, or after a rejection leaves candidates, and that it shows the newest set. When the user turns a pick down for a date reason, the coordinator lists the others in chat. Add one line in technical spec 7.1: a list in chat that spans sets is numbered once, top to bottom.

**Settled 2026-10-12: option A, as proposed. Functional spec 7.5 and technical spec 7.1.**

### F6. "Everything it touched" isn't defined for changes that only move worked-out dates and times. Needs a decision

**What happened.** Tool design 2.1 and technical spec section 8 say a write returns the already-known results "for everything it touched: the stops, days, and stays it changed, and the trip as a whole." Two writes in the walk made this unclear:

- `update_itinerary` moved the Moab start date from October 10 to 11. Every day's date is worked out from the start date, so every day "changed." If that counts as touched, the reply carries every already-known result in the trip, which is close to a full read.
- `update_stay` cut Moab to 2 nights. The Torrey day's date moved from Thursday to Wednesday, but nothing stored on that day changed. Gifford's "closed" result came back as new, which works. But does the Torrey day's already-known, approved drive-hours warning come back too?

**Touches:** technical spec section 8 ("What comes back"), tool design 2.1 (the "Writing" paragraph).

**Options:**

- **A. Define "touched" as what the write stored:** items whose stored properties changed, the days whose legs were re-routed, and the trip. A change only to worked-out dates or times reaches the coordinator as new or gone results. **Recommended.** It keeps replies short, and new results still come through.
- **B.** Count every item whose worked-out date or time changed. Replies get large after a start-date change.

**Post-review analysis.** This holds, and option A is right. "Touched" should mean what the write stored, not what code worked out again. A start-date change otherwise drags the whole trip into the reply. New results and results that went away still come back from anywhere, so nothing gets lost. This is a wording fix in technical spec section 8 ("What comes back") and tool design 2.1.

**Settled 2026-10-12: option A, as proposed. Technical spec section 8.**

### F7. A stay's stored tier and the tiers on candidates can disagree. Needs a decision

**What happened, case 1.** San Luis Obispo hotel. The user clicked "Higher tier," so the stay's tier became posh, with the rule "the user asked for a higher tier" (technical spec 4.2). The user later took Garden Street Inn, a mid-range hotel from set 0. The stay still says posh. A later "More options" would send the worker looking for posh hotels, though the user just chose mid-range.

**What happened, case 2.** The tri-tip dinner stop was briefed as mid-range, the trip default. The worker's best tri-tip find was Firestone Grill, a counter-service place with a "$" price level. Technical spec section 9 says the worker "stores the tier and rule with each candidate," and functional spec 7.1 says each candidate shows "which tier it is." The docs don't say whether a worker may offer a place off the briefed tier, or what tier and rule its card then shows.

**Touches:** technical spec section 9, technical spec 4.2 (refine), technical spec 3.2 (candidate tier), functional spec 7.1, tool design 2.1 (`select_candidate`, `add_stop_candidates`).

**Options:**

- **A. Add two instructions.** For the coordinator: when the user picks a candidate whose tier differs from the stored tier, set the stored tier to match, with a rule such as "the user picked a mid-range option." For workers: stay within the briefed tier. If a standout place is off-tier, store its own tier, keep the briefed rule, and say so in the rationale. **Recommended.**
- **B.** Leave the stored tier alone. Accept that "More options" can come back at a tier the user moved away from.

**Post-review analysis.** Case 1 holds, but it's small. Once the card closes, "More options" only comes through chat, and the coordinator can see the user's pick. I agree with the coordinator half of option A: when the user picks a candidate at a different tier, set the stay's or stop's tier to match. Case 2 is mostly already covered. Technical spec section 9 says the worker "searches at that tier." I'd add "and offers only places at that tier" there and drop the off-tier exception. One less rule.

**Settled 2026-10-12: case 1 done in code by select_candidate; case 2 workers offer only places at the briefed tier. Technical spec section 9 and tool design 2.1.**

### F8. Technical spec 4.2 says Moab Day 4 has a waypoint in Capitol Reef. The example in 3.1 shows none. Wording fix

**What happened.** Technical spec 4.2 says that for an area must-see on a moving day, "the coordinator adds a waypoint inside it if needed, as for Capitol Reef on Moab Day 4." Technical spec 3.1 lists a waypoint for Day 1 (Dewey Bridge) but none for Day 4. In the walk, Goblin Valley was selected first, as a must-see. The route then ran through Hanksville and along UT-24, which goes straight through Capitol Reef. No waypoint was needed, which fits "if needed." But the example in 4.2 says one was added.

**Touches:** technical spec 4.2 (skeleton, "Must-sees that aren't one place"), technical spec 3.1 (Moab example).

**Options:**

- **A. Change the 4.2 example** to say that Day 4 needs no waypoint, because UT-24 already runs through the park. Use a made-up case for when one is needed. **Recommended.**
- **B.** Add a Capitol Reef waypoint to Day 4 in the 3.1 example.

**Post-review analysis.** This holds. It's a wrong example. The 3.1 example is the finished state, and there UT-24 runs through Capitol Reef with no waypoint. I agree with option A. Reword technical spec 4.2 so the Capitol Reef example says no waypoint was needed because the road already runs through the park.

**Settled 2026-10-12: option A, as proposed. Technical spec 4.2.**

### F9. What the coordinator can still do on a started trip isn't fully said. Wording fix

**What happened.** October 12, Moab Day 2. The user asked what time dinner is, which the coordinator answered from a full read: 7:00 p.m. at Desert Bistro. Then they asked to swap Desert Bistro. The coordinator said the plan can't change now. The user's natural next question is "then where else could we go tonight?" The docs say the coordinator "answers questions about the trip, and says it can't be changed" (technical spec 5.2). They don't say:

- whether it can suggest other restaurants from its own knowledge, or look one up with `find_place` and `read_place` to check its hours tonight
- whether it can still save memory. Technical spec section 8 lists the trip brief, itinerary, candidates, and weather text as locked. Memory is on a different MCP server, so it's presumably allowed. Example: "remember we loved Desert Bistro."

**Touches:** technical spec 5.2 (the "Today's date" bullet), technical spec section 8 (trip has started), tool design section 4.

**Options:**

- **A. Say it plainly.** On a started trip the coordinator can answer from the stored trip, look up a named place with `find_place` and `read_place`, and read and write memory. It sends no workers and makes no writes to the trip. It may mention alternatives from its own knowledge, but says they won't be added to the plan. **Recommended.**
- **B.** Answer only from the stored trip, and offer nothing else.

**Post-review analysis.** This holds, but keep the answer short. The trip lock was a scope cut. I'd say in technical spec 5.2 that on a started trip the coordinator still reads the trip, looks up places, and uses memory, but sends no workers and makes no writes to the trip. Suggesting other restaurants from its own knowledge is fine, as long as it says they won't be added to the plan. This is close to option A, without spelling out each tool.

**Settled 2026-10-12: as proposed. Technical spec 5.2.**

### F10. "Today" has no time zone. For the object model

**What happened.** Three rules depend on today's date: the start date must be after today, the trip locks on its start date, and the forecast window counts from today (technical spec section 8). The Moab trip runs on Mountain time. A user in New York at 11 p.m. on October 10 is already on October 11 by the server's clock if it uses UTC, but not by Utah's. The docs say only that today's date "is given in the coordinator's context each session" (technical spec 5.2). Google forecast dates are local to the place (Google design, section 3).

A related gap, not hit by these two trips: the schedule's clock times have no stated time zone, which matters for a trip that crosses one.

**Touches:** technical spec 5.2, technical spec section 8, Google design section 3.

**Options:**

- **A. Use the local date at the trip's start place.** It's stored, and it's where the trip begins. Schedule times are local to each place. **Recommended.**
- **B.** Use the user's own time zone, which would need a new property on the user.

**Post-review analysis.** This holds. Option A is the simple fix: "today" is the local date at the start place. The second gap is bigger: clock times for a trip that crosses a time zone. That's mostly code, so I'd cut it. Say in technical spec 3.1 that schedule times use the start place's time zone, and that a trip crossing a time zone is a known limit for the MVP. Neither example crosses one.

**Settled 2026-10-12: today is the start place's date; crossing a time zone is a known limit. Technical spec 3.1 and 5.2.**

### F11. Trip memory for a place passed over for a date reason goes stale. For memory design (deferred)

**What happened.** The coordinator saved "Took Stan's only because Gifford Homestead is closed Wednesdays." The trip then moved a day, Gifford fit again, and the user took it back. Nothing says to forget the memory item then. Later, cutting a Moab night put the Torrey day back on a Wednesday, and the stale item was still in trip memory. Technical spec 5.2 says to save the item and to re-offer, but not to clean it up.

**Touches:** technical spec 5.2 ("When the user says why they chose an option").

**Options:**

- **A. When the user takes the passed-over place back, forget the memory item.** **Recommended,** as a note for the memory design.
- **B.** Leave it. The opening-hours check catches the real problem anyway.

**Post-review analysis.** This holds. It's one sentence next to the existing rule in technical spec 5.2: when the user takes a passed-over place back, forget the memory item about it. That says when to write memory, not how memory works, so it fits even with memory design deferred. Option A.

**Settled 2026-10-12: option A, as proposed. Technical spec 5.2.**

### F12. Smaller items. For the object model or wording

- **A day's "location" isn't defined.** Functional spec 9.5 shows each day with a "location." Technical spec 3.1 has nothing for it. Assumption used: a moving day shows "Monterey → San Luis Obispo," and a day that stays put shows the stay's town. For the object model.
- **A place the user dislikes for good is rejected only for this trip.** "No Sardine Factory, we didn't like it last time" is a lasting dislike. It's a rejected place on this trip only (technical spec 3.2). On the next Monterey trip, it could be offered again. For memory design (deferred): the coordinator might ask whether to remember it in user memory.
- **Sessions and "last updated" aren't in the data model.** Functional spec 3 shows each trip's last-updated time on the home screen. Functional spec 10.1 gives each session a date and short title. Technical spec 3.1 has neither. That's expected, since technical spec says sessions will be added later. For the object model.
- **"Sunrise hike" sits on the line between what and when.** Technical spec 3.1 says a purpose never says when, and rules out "lunch." Technical spec 5.3 uses "sunrise hike" as an example purpose. That reads as "what," like "stargazing." But the walk had to use "pancakes and eggs" instead of "breakfast" for the Monterey breakfast. Wording fix: one sentence saying an activity tied to a time of day, such as sunrise or stargazing, is a "what," and a meal name is a "when."

**Post-review analysis.**

- **Day location:** for the object model. The walker's guess is fine: a moving day shows "from → to," and a day that stays put shows the stay's town. Worked out, not stored.
- **Lasting dislike:** for the memory design (deferred). Technical spec 3.2 already sends dislikes that aren't about one place to memory. I'd leave this one alone for now.
- **Sessions and last updated:** expected. Leave it for the object model.
- **"Sunrise hike":** this holds. It's a wording fix in technical spec 3.1. An activity tied to a time of day, such as a sunrise hike or stargazing, is a "what." A meal name, such as "breakfast" or "lunch," is a "when."

**F12 settled 2026-10-12: sunrise-hike wording added to technical spec 3.1. Day location and sessions left for the object model. Lasting dislike left for memory design.**

### E1. The shape of rest days in the trip brief isn't said. For the object model

Added in review, from the properties list. Functional spec 5.2 lists "rest days: days with no driving" in the trip brief. It doesn't say whether that's a count ("one rest day") or specific days ("a rest day in Moab"). Lean: a count plus a plain-words note, the same way budget rules are stored, and the coordinator places them. Settle it in the object model.

**Settled 2026-10-12: in the user's words; the agent decides which days. Functional spec 5.2.**

### E2. A stop's visit time after its place is cleared isn't said. For the object model

Added in review, from the properties list. Technical spec 3.1 says selecting a place sets the visit time, and an empty stop takes no time. It doesn't say whether a rejection that clears the place also clears the visit time, or whether the old one is kept and ignored. Lean: clear it, since the next selection sets it again anyway.

**Settled 2026-10-12: clearing the place clears the visit time. Technical spec 3.1 and tool design 2.1.**

---

## 2. Properties and rules touched

Grouped by object. **(not in docs)** marks something the walk needed that the design docs don't mention. **(unclear)** marks something mentioned but not settled.

### Trip

- Owner (one user)
- Trip brief, itinerary, trip memory, places: one each, or a list of places
- Rejected places, each a place and the user's reason
- Saved check results list, each marked approved or not. Only writes save it
- Name and region, worked out from the brief's region, route, or theme and the start month
- Last updated, shown on the home screen **(not in docs: technical spec)**
- Sessions, each with a date, short title, and transcript **(not in docs: technical spec)**
- Rule: refuses every write from its start date on. Memory writes still allowed **(unclear, F9)**
- Rule: "today" for the start-date, lock, and forecast rules **(time zone not in docs, F10)**

### Trip brief

- Region, route, or theme
- Trip length in days, at most 14
- Interests and must-sees, with why. Must-sees are a list replaced as a whole. A must-see can be one place, an area, a road, or an activity
- Max driving hours per day
- Route preference: scenic or fastest
- Rest days **(shape not in docs: a count, or which days?)**
- Usual start time, 8 a.m. when empty
- Budget posture: default tier plus rules in plain words
- Meal preferences
- Rule: a check that compares against an item is skipped while that item is empty
- Rule: changing the brief never changes the itinerary

### Itinerary

- Start place, end place, each with a name for places Google can't name. Same place for a loop
- Start date. Must be after today
- Stays in order. Days in order. Always ends with the last day
- Rule: `add_stay` refused until the start place, end place, and start date are set

### Stay

- Place, usually a town
- Order
- Nights, worked out from the days pointing to it
- Dates, worked out: its nights plus the morning the party leaves
- Lodging: a place, or empty
- Lodging candidates
- Tier, the rule that produced it, and the nights it was set for
- Weather and clothing text, labeled forecast or seasonal averages
- With the text: the place, dates, and activities it was written for. Activities are stop IDs plus selected place IDs
- Date the weather text was written **(not in docs, F4)**
- Activities, worked out: attraction stops near it, plus attraction stops along its days' legs. For the first stay, also stops near the start place. For the last stay, also stops along the last day's leg and near the end place
- Rule: where the party sleeps is the lodging once selected, else the town
- Rule: removal refused while stops are on its days or use it as their search area
- Rule: the stored tier doesn't follow a pick from another tier **(unclear, F7)**

### Day

- Order. Date, worked out
- Stay where the party sleeps. The last day has none
- Rest day or not. Only a day that stays put can be one
- Own start time, or none
- Stops in order
- Leg, if any
- Approvals: drive hours, route type
- Location, shown in functional spec 9.5 **(not in docs, F12)**
- Schedule, worked out: start, each stop's arrival and end, free time, drives with buffer, arrival where the party sleeps
- Rule: a day runs past midnight until the party reaches where it sleeps. A rest day runs until its last stop ends
- Rule: a rest day's stops each need a set time
- Rule: schedule after an empty stop with a set time **(unclear, F1)**

### Leg (held by its day)

- From and to, worked out
- Drive time, distance, route line, each stored
- Each segment's drive time, stored, in route order, including the drive after the last stop
- Waypoints, as place IDs, stored. Code places them among the selected stops by straight-line distance
- Best order and time saved from the stop-order check, stored
- Route type, worked out: the day's route type approval, else the brief's preference
- Rule: re-routed only when its start, end, selected places in order, or waypoints change
- Rule: a day that stays put gains a leg at its first selected stop and loses it with the last one

### Stop

- Kind: meal or attraction. Fixed
- Purpose: what, never when. May say how long. Fixed
- Search area: a stay ID, along the leg, near the start place, or near the end place. Fixed
- Order in the day
- Set time or none. Can be "next day" for after midnight
- Visit time. Set on selection. Ignored while no place is selected **(what's stored then is not in docs)**
- Selected place, or empty
- Candidates
- Tier and rule, for meals, even when the user names the place
- Approvals: opening hours
- Status, worked out: empty, proposed, or selected
- Rule: "along the leg" only on a day that moves. "Near the start place" only on the first day. "Near the end place" only on the last day
- Rule: a move keeps candidates, selection, and visit time. It needs a set time or "none"

### Candidate (held by a stop or stay)

- Place
- Rationale: names no dates or nights
- Tier and rule, for lodging and meals. None for a place the user named; it shows "your choice"
- How it was found, with a source link, or "specified by the user"
- Notes: name no dates
- Visit time estimate, for attractions
- Detour time, for stops along the leg, labeled as of when offered. None for a place the user named
- Set number, worked out when written, then stored
- Rule: a set holds one to three. A repeat rejects the whole set. Candidates never change
- Rule: the card shows the newest set still present **(differs from functional spec 7.5, F5)**
- Rule: whether a worker may offer an off-tier place **(not in docs, F7)**

### Place

- Google place ID, coordinates, address
- Name: Google's, or one given by an agent when Google has none
- Type: set by the first candidate that offers it. Empty for a start or end address
- Rating, review count, price level
- Weekly hours as structured periods, plus weekday text
- Summaries and links
- Short line, worked out: type, rating, price level, area
- Rule: one record per trip per Google place ID

### Approval (held by a day or stop)

- Kind, value, reason. Drive hours: hours. Route type: a type. Opening hours: minutes of the visit inside opening hours
- Applying or not, worked out
- Rule: at most one of each kind. Setting one replaces it. A reason is required
- Rule: the opening-hours approval is removed by code when the stop's place changes or is cleared. An approval of 0 minutes applies for as long as the place stays selected

### Check result

- Check kind: one row of the table in technical spec section 8
- Subject: the trip, a stay, a day, or a stop
- Level: warning or note
- Text, always current
- New or already known. Went away
- Approved, for warnings
- "May be too early" mark, on opening-hours results after an empty stop
- Rule: a warning whose approval stops applying is new
- Rule: a result that goes away and comes back is new
- Rule: which writes save the list **(not in docs, F2)**
- Rule: what counts as "touched" **(unclear, F6)**

### Worker brief (not stored)

- Stop or stay IDs, with their day, dates, and nights. The leg scout also gets the day ID
- Resolved tier and rule for lodging and meals
- Each stop's purpose, set time, and rough expected time in plain words
- The day's other stops in order, with times, purposes, and selected names
- Interests, must-sees, meal preferences
- Places to leave out: earlier candidates, plus what memory says to avoid
- Weather worker: only the stay IDs

### Memory item

- ID with `mem_` prefix, user or trip scope, text
- Uses in the walk: stretch kinds (technical spec 4.1), why a pick was made, places passed over for a date reason, turned-down stop-order notes, open items, decisions against a change
- Cleanup of stale items **(not in docs, F11)**

### Option card (UI)

- Shows one stop's or stay's newest set
- Actions: Select, More options, Higher tier, Lower tier. No tier actions on attractions. Higher tier hidden at posh, Lower tier hidden at value
- Closes once a pick is made. Comes back only with new options or after a rejection

---

## 3. Step log

Format for each step: who acts, the call, what changes in storage, what comes back, and what the user sees. "C" is the coordinator.

### San Francisco to Mike's house

**Session 1, March 1, 2027**

1. **The trip is created.** App code creates the trip, an empty trip brief, and an itinerary holding only its last day, `day_q4vn8xte`. The last day has no route yet. C gets today's date. C calls `read_itinerary()`, `read_trip_brief()`, and `read_memory()`, which is a memory read. User memory (made up): "usually drives up to 5 hours; mid-range by default; local food over hotel breakfast." The user sees an empty itinerary.

2. **Discovery, part 1.** The user: "Pacific Coast Highway from San Francisco to LA, three days in mid-May." C confirms the values from user memory and asks about interests, must-sees, dates, and meals. C calls `update_trip_brief(route "Pacific Coast Highway, San Francisco to Los Angeles", trip length 3, max driving 5 h, route preference scenic, budget "mid-range by default; cheap and cheerful for breakfast and coffee", meal preferences)`. Returns: trip length vs the brief, warning, **new** (1 day vs 3). C holds it, because the skeleton isn't built yet.

3. **Change 1: the trip ends at a friend's house.** The user gives Mike's address in Silver Lake and a start date of May 13. C calls `find_place("2345 Lake View Ave, Los Angeles", "Los Angeles, CA")`, which returns `place_m2kh9vwe`: an address with no name and no type. C calls `find_place("San Francisco", "CA")`, which returns `place_s7fr2nka`. Then C calls `update_itinerary(start place_s7fr2nka "San Francisco", end place_m2kh9vwe "Mike's house", start date May 13, 2027)`. Storage: the start, end, and date are set, and Mike's house gets its name. The last day's leg is routed San Francisco → Mike's house, 6 h 05 m on I-5. Returns: that leg's time; daily driving on `day_q4vn8xte`, warning, **new** (6 h 40 m with buffer vs 5 h); trip length, already known. C holds both. The trip name becomes "Pacific Coast Highway, May 2027."

4. **Discovery, part 2.** Interests: the coast, aviation, good breakfasts, elephant seals, a famous cake. Must-sees: five Day 1 places (Millbrae Pancake House, Hangar One, Philz Coffee in San Jose, the Santa Cruz Boardwalk, and dinner at the Whaling Station at 7), plus the Big Sur coast, which is a road. C calls `update_trip_brief(interests and must-sees)`. C calls `add_memory_item(trip, "SF→LA: road fixed, Highway 1 south of Santa Cruz; Day 1 places named by the user")` (technical spec 4.1). The shape round is skipped, because the route is fixed.

5. **Skeleton: stays.** C calls `compute_route([SF stop, Monterey stop, San Luis Obispo stop, place_m2kh9vwe stop], keep)` and gets rough times. C looks up the towns with `find_place`: Monterey is `place_m6ty3rqa`, San Luis Obispo is `place_s3vb7ytp`.
   - `add_stay(place_m6ty3rqa, "first", 1 night, mid-range, "trip default")` returns `stay_m4ry8kdn` and Day 1 `day_d3wa7ctz`. Day 1 is routed San Francisco → Monterey. The last day is re-routed Monterey → Mike's. Trip length is still known (2 vs 3).
   - `add_stay(place_s3vb7ytp, after stay_m4ry8kdn, 1, mid-range, "trip default")` returns `stay_s9vk2hxe` and Day 2 `day_h6pe4rmy`. Day 2 is routed Monterey → San Luis Obispo on US-101, 2 h 20 m. The last day becomes San Luis Obispo → Mike's, 3 h 40 m. **Went away:** trip length, and last-day driving.

6. **Skeleton: route type and waypoints.** The user: "On the last day we just want to get to Mike's." C calls `update_day(day_q4vn8xte, approve route type: fastest, reason "wants to get to LA quickly")`. Nothing to re-route. C calls `find_place("Big Sur village", "Big Sur, CA")`, which returns `place_b5gs8vuw`, then `update_leg(day_h6pe4rmy, [place_b5gs8vuw])`. Day 2 is re-routed onto Highway 1: 2 h 20 m → 3 h 00 m. Day 1 gets no waypoint, because the user's own stops will choose its road. The last day gets none, because of its approval.

7. **Change 2: "No Sardine Factory, we didn't like it last time."** C calls `find_place("Sardine Factory", "Monterey, CA")`, which returns `place_s5rd3fyk`, then `reject_places([{place_s5rd3fyk, "didn't like it last time"}])`. Storage: one rejected place added to the trip. Returns: "Rejected Sardine Factory. No stops or stays touched. No new warnings." A memory point: it's a lasting dislike, but it's rejected for this trip only (F12).

8. **Must-sees on Day 1.** C calls `add_stops(day_d3wa7ctz, "first", [...])` with five items:
   - meal, "pancakes", along the leg, none, value from "cheap and cheerful for breakfast and coffee"
   - attraction, "historic airship hangar", along the leg, none
   - meal, "good coffee", along the leg, none, value from the same rule
   - attraction, "seaside amusement park", along the leg, none
   - meal, "seafood dinner", near `stay_m4ry8kdn`, 7:00 p.m., mid-range from "trip default"

   Returns, in order: `stop_m8pc2kda`, `stop_h3gn6wqe`, `stop_p9hz4xtr`, `stop_b2dw7kyn`, `stop_w5hs3mpa`. No re-route, since the stops are empty. No late warning: the last timed item before dinner is the 8:00 start.

9. **Checking the Hangar One must-see.** C calls `find_place("Hangar One", "Moffett Field, CA")`. Two matches come back: Hangar One, the building, with no hours; and the Moffett Field Museum, open Wednesday to Saturday, 10 to 3. C tells the user that Hangar One itself isn't open to the public, and that the museum beside it is (technical spec 5.2, places the user names). The user: "Do the museum, and we'll look at the hangar." C offers a typical visit time ("about two hours"), and the user agrees.

10. **Selecting the Day 1 must-sees.** C makes five `select_user_place` calls, each with the stop, the place, a name, a type, and the user's reason. The museum and Boardwalk calls also pass a visit time of 2 h. On the Boardwalk, C mentions that rides keep shorter weekday hours before Memorial Day. Each call re-routes Day 1. From the second one on, the stop-order check runs; Google's order matches, so no note. None of the five get a detour time. Each meal gets a 1-hour visit time. Returns from the museum selection: opening hours, open but not long enough, warning, **new** ("Opens at 10:00 a.m.; you'd arrive at 9:50 a.m. with 2 hours planned"). At the end of the turn C offers three choices: leave later, linger at breakfast, or keep it. The user: "Keep it, we'll look at the hangar outside until it opens." C calls `update_stop(stop_h3gn6wqe, approve opening hours, reason "look at Hangar One from outside until the museum opens")`. The tool records 110 minutes.

    Day 1 schedule (Thu May 13), with the hotel not yet picked:
    - Start 8:00 a.m., San Francisco
    - 8:25 Millbrae Pancake House, until 9:25
    - 9:50 Moffett Field Museum, until 11:50
    - 12:05 Philz Coffee, until 1:05
    - 1:55 Santa Cruz Boardwalk, until 3:55
    - Free time 3:55 to 6:05, then the drive
    - 7:00 The Whaling Station (set time), until 8:00
    - Arrive in Monterey 8:05 p.m.

11. **Change 4: five hours at the Boardwalk.** C calls `update_stop(stop_b2dw7kyn, visit time 5 h)`. No re-route. Returns: late for a set time on `stop_w5hs3mpa`, warning, **new**, though the write didn't touch that stop ("You'd reach dinner at 7:50, but it's set for 7:00"). C offers three fixes: dinner at 8, start at 7:10, or 4 hours at the Boardwalk.
    - The user tries the earlier start. C calls `update_day(day_d3wa7ctz, start 7:10 a.m.)`. Returns: late warning **gone**. Museum opening hours, warning, **new**, because the approval stopped applying: 60 of 120 minutes are now in hours, and the approval was for 110.
    - C raises it. The user changes their mind: "Keep 8, dinner at 8." C calls `update_day(day_d3wa7ctz, start "none")`. The late warning comes back as **new**, and the museum warning is already known and approved again. Then C calls `update_stop(stop_w5hs3mpa, set time 8:00 p.m.)`. Late warning **gone**. C raises nothing more, because the change is settled.

    Day 1 schedule now:
    - 8:00 start
    - 8:25 Millbrae Pancake House
    - 9:50 museum
    - 12:05 Philz Coffee
    - 1:55 Boardwalk, until 6:55
    - Free time 6:55 to 7:05
    - 8:00 The Whaling Station
    - Arrive 9:05 p.m.

12. **Fill: laying out Day 2.** C calls `add_stops(day_h6pe4rmy, "first", [...])` with seven items:
    - meal, "pancakes and eggs at a local café", near `stay_m4ry8kdn`, value from the breakfast rule
    - attraction, "a short coastal walk", along the leg
    - attraction, "a famous bridge to photograph", along the leg
    - meal, "a meal with a cliffside ocean view", along the leg, mid-range
    - attraction, "elephant seals", along the leg
    - meal, "tri-tip barbecue", near `stay_s9vk2hxe`, 6:30 p.m., mid-range
    - meal, "dessert", near `stay_s9vk2hxe`, mid-range

    Returns IDs: `stop_f6aw2kth`, `stop_p4xb9tne`, `stop_b7xc3dmq`, `stop_n2pt8hfa`, `stop_e9sw4kvy`, `stop_f3gr7wzc`, `stop_c8pk5vna`.

13. **Fill: worker briefs, all sent at once.**
    - Monterey stay researcher: the lodging (mid-range, from "trip default") and `stop_f6aw2kth`. Brief: "Day 2, Fri May 14; they leave the hotel at 8, so this is right away."
    - San Luis Obispo stay researcher: the lodging, plus `stop_f3gr7wzc` ("6:30 p.m. set time") and `stop_c8pk5vna` ("after dinner, about 7:30").
    - Day 2 leg scout: `day_h6pe4rmy` and its four stops along the leg. Rough times: "walk around 9:15, bridge around 11, the meal around noon, seals mid-afternoon." It also gets the day's other stops in order.
    - No leg scout for Day 1, because all its stops are named. None for Day 3, because it has no stops.

14. **Fill: the workers act.**
    - The leg scout calls `search_along_leg(day_h6pe4rmy, "state park coastal walk")`. The route line follows Highway 1 because of the waypoint, even though no Day 2 stop is selected yet. Places within 2 miles of Monterey or San Luis Obispo are dropped. Point Lobos, about 5 miles out, is kept. The search misses Piedras Blancas, so a second query, "elephant seal viewing," finds it.
    - The leg scout calls `add_stop_candidates` once per stop. The tool works out each candidate's detour time with one routing call, placing the candidate between Monterey and San Luis Obispo with the waypoint placed by code. Example: "Set 0 for stop_n2pt8hfa: Nepenthe; Big Sur Bakery; Deetjen's."
    - The researchers call `search_near` and `add_stay_candidates` or `add_stop_candidates`, with no detour times. Monterey hotels: Casa Munras, Hotel Abrego, Monterey Hotel. San Luis Obispo set 0: Petit Soleil, Garden Street Inn, Apple Farm Inn. Tri-tip: Firestone Grill is a "$" place on a mid-range stop (F7).
    - The workers' writes return check results? Not said in the docs (F2). Assumption: they don't.
    - Each worker returns one line per candidate. The user sees option cards.

15. **Fill: selections.**
    - Casa Munras: `select_candidate(stay_m4ry8kdn, place_c7mn5rqd)`. Re-routes Day 1 and Day 2. C calls `add_memory_item(trip, ...)` only if the user says why.
    - First Awakenings: `select_candidate(stop_f6aw2kth, place_f4wk7mzt)`. Re-routes Day 2. Code places the Big Sur waypoint between First Awakenings and San Luis Obispo.
    - The user picks dessert first: Copper Café, the café's own listing inside the Madonna Inn. The schedule shows Copper Café at 4:35 p.m., under a 6:30 p.m. dinner with no place yet (F1). Assumption: the walk goes on with the times as the docs give them.
    - Big Sur Bakery is picked, then turned down: "Not the bakery, a friend said it's overpriced." That reason is about the place. C calls `reject_places([{place_b9kr4tey, "a friend said it's overpriced"}])`. The selection is cleared, Day 2 is re-routed, and the stop goes back to proposed. Returns: "Touched stop_n2pt8hfa." The card comes back with Nepenthe and Deetjen's, and no worker is called. The user picks Nepenthe.
    - Point Lobos, Bixby, Piedras Blancas, and Firestone are selected. The stop-order check runs after each re-route. Google's order matches, or saves less than 15 minutes, so there's no note.

16. **Change 3: "Higher tier" on the San Luis Obispo hotel card.** The click reaches C as a message.
    - C calls `update_stay(stay_s9vk2hxe, tier posh, rule "the user asked for a higher tier")`. This records 1 night with the tier.
    - The researcher is briefed again to leave out the three set 0 hotels. It calls `add_stay_candidates`, which returns "Set 1 for stay_s9vk2hxe: Hotel Cerro, Hotel San Luis Obispo, Granada Hotel." The card shows set 1.
    - The user clicks Select on Hotel Cerro. C calls `select_candidate(stay_s9vk2hxe, place_c9rr4npt)`. Day 2 and the last day are re-routed, and the card closes.

    Day 2 schedule (Fri May 14):
    - 8:10 First Awakenings
    - 9:25 Point Lobos
    - 11:10 Bixby Creek Bridge
    - 12:05 Nepenthe
    - 2:35 Piedras Blancas
    - Free time 3:35 to 5:35
    - 6:30 Firestone Grill (set time)
    - 7:35 Copper Café
    - Arrive 8:40 p.m.

17. **Weather round.** Most picks are made. C calls `Agent(weather worker, [stay_m4ry8kdn, stay_s9vk2hxe])`. The worker calls `stay_weather` for each stay, which returns seasonal averages, labeled "Typical for this time of year, 2016–2025." It also returns activities: the museum and the Boardwalk for Monterey, because they're along Day 1's leg; Point Lobos, Bixby, and Piedras for San Luis Obispo. The worker calls `set_stay_weather` twice, and returns one line per stay.

18. **Change 3, later: "What were the other hotels?"** C calls `read_itinerary(stay_s9vk2hxe)` and gets every candidate with its set number and rationale. C lists them numbered once: 1 Petit Soleil, 2 Garden Street Inn, 3 Apple Farm Inn, 4 Hotel San Luis Obispo, 5 Granada Hotel (F5). The user: "Take the second one." C calls `select_candidate(stay_s9vk2hxe, place_g3st7wkm)`, and the legs are re-routed. No card appears. The stay's tier still says posh (F7).

19. **Change 5: adding a Big Sur night.** C calls `add_stay(place_b5gs8vuw, after stay_m4ry8kdn, 1, mid-range, "trip default")`. It returns `stay_b6sr4wqn` and a new Day 2, `day_n8bs3ktx` (Fri May 14). The old Day 2 is now Day 3 (Sat May 15), running Big Sur → San Luis Obispo with all seven stops. The last day is now Day 4 (Sun May 16).
    - Storage: Day 2 is routed Casa Munras → Big Sur. Day 3 is re-routed starting from the Big Sur town. The waypoint is the same place as the leg's start, which does no harm.
    - Returns: stops on days whose start or end changed (Day 3's seven stops).
    - New warnings: trip length (4 vs 3); search area doesn't fit for `stop_f6aw2kth`, because the Monterey breakfast is now on a day that starts in Big Sur.
    - New notes: weather out of date for `stay_b6sr4wqn`, which has no text.
    - The opening-hours check reruns with the new weekdays, and nothing new comes up. Stop order: every order backtracks north, so no note.
    - C talks through the stops with the user. The user agrees to move Point Lobos and Bixby. C calls `move_stop(stop_p4xb9tne, day_n8bs3ktx, "first", "none")`, then `move_stop(stop_b7xc3dmq, day_n8bs3ktx, after stop_p4xb9tne, "none")`. Both days are re-routed each time. The candidates keep their detour times, labeled as of when offered. Returns: weather out of date for `stay_s9vk2hxe`, note, **new**, because its activities lost Point Lobos and Bixby. On breakfast the user says "decide later," so the warning stays open. C holds the warnings, since the change is still being discussed.

20. **Change 5: removing the Big Sur night.** The user changes their mind. C moves the stops back first: `move_stop(stop_p4xb9tne, day_h6pe4rmy, after stop_f6aw2kth, "none")` and `move_stop(stop_b7xc3dmq, day_h6pe4rmy, after stop_p4xb9tne, "none")`. The San Luis Obispo weather note goes away. Then `remove_stay(stay_b6sr4wqn)`, which no stop blocks. The days go back to three, and Day 2 starts at Casa Munras again and is re-routed. Code places the waypoint between Bixby and Nepenthe again. **Went away:** trip length, search area, Big Sur weather. The weather worker is never rerun. C calls `add_memory_item(trip, "Considered a Big Sur night; decided against it")`.

21. **Change 6: "Let's try the Sardine Factory after all."** C calls `find_place("Sardine Factory", "Monterey, CA")`, which returns `place_s5rd3fyk`, marked rejected: "didn't like it last time." C: "You turned it down earlier because you didn't like it last time. This version can't take a rejection back. Want another seafood place in place of the Whaling Station?" The user keeps the Whaling Station. No writes.

**Session 2, May 8, 2027 (change 7)**

22. **Start of a new session.** C calls `read_itinerary()`, `read_trip_brief()`, and `read_memory()`. The read shows forecast now available, note, for both stays: Monterey's dates are May 13 to 14 and San Luis Obispo's are May 14 to 15. Both are within today plus 7 days. No open warnings. C: "Your trip is now in forecast range for Monterey and San Luis Obispo. Want forecasts in place of the typical weather?"

23. **Forecasts.** The user says yes. C calls `Agent(weather worker, [stay_m4ry8kdn, stay_s9vk2hxe])`. `stay_weather` returns daily forecasts. `set_stay_weather` labels them "Forecast." The UI shows the forecast. The saved list still holds the forecast notes until C's next write (F2). Nothing records that the forecast was made on May 8 (F4).

### Grand Junction to Salt Lake City through Moab

**Session 1, March 1, 2027**

1. **The trip is created.** It holds an empty brief and the last day, `day_t5vs9rwe`. C reads the itinerary, the brief, and memory.

2. **Change 1, discovery.** The user: "Grand Junction to Salt Lake City through Moab, five days starting October 10."
   - C calls `update_trip_brief` with:
     - length 5, max driving 4 h, scenic, usual start 8:00
     - rest days: one in Moab
     - budget: value by default; mid-range for stays of 2+ nights; one special dinner in Moab at posh
     - meals: local cafés, burgers, pie
     - must-sees: Delicate Arch at sunrise, Arches, Goblin Valley, Capitol Reef, stargazing, Highway 128
   - C asks whether the 2+ nights rule covers meals (technical spec section 9). The user: "Hotels only."
   - C looks up Grand Junction (`place_g7jc4nxa`) and Salt Lake City (`place_s8kc2wmd`) with `find_place`. Then it calls `update_itinerary(start place_g7jc4nxa "Grand Junction", end place_s8kc2wmd "Salt Lake City", start date October 10, 2027)`. October 10 is after today, so the date is accepted.
   - The last day is routed Grand Junction → Salt Lake City, 4 h 30 m. Returns: driving and trip length, both warnings, **new**. C holds them, since the skeleton isn't built.
   - Memory: `add_memory_item(trip, "Open: maybe a jeep tour in Moab, decide later")`.

3. **Shape round.** The road from Moab to Salt Lake City is open, so C offers sketches.
   - C calls `compute_route([Grand Junction stop, "Dewey Bridge, UT" pass-through, "Moab" stop, "Torrey" stop, Salt Lake City stop], keep)`. The reply shows "Dewey Bridge, UT" resolved to Salt Lake City, with a 9-hour total. C spots it, calls `find_place("Dewey Bridge", "Utah")`, which returns `place_d4wy8bfn`, and calls again.
   - Sketch A, "Moab and Capitol Reef": Moab 3 nights, Torrey 1. Sketch B, "Moab only": Moab 4 nights, home via Price.
   - The user picks A. C calls `add_memory_item(trip, "Grand Junction→Moab: road fixed, Highway 128. Moab→Salt Lake City: places fixed, Capitol Reef and Torrey")`.

4. **Skeleton: stays.**
   - `add_stay(place_m3ab6wrt, "first", 3, mid-range, "stays of 2+ nights")` returns `stay_m7ab3kxd` and days `day_a4mq9ved`, `day_b8mz3wkc`, and `day_c2rt6yhp`.
   - `add_stay(place_t9ry4cqe, after stay_m7ab3kxd, 1, value, "trip default")` returns `stay_t2ry8wqa` and `day_t6qw4nrk`.
   - **Went away:** trip length and last-day driving (Torrey → Salt Lake City is 3 h 30 m).
   - `update_leg(day_a4mq9ved, [place_d4wy8bfn])` sends Day 1 along Highway 128.
   - `update_day(day_c2rt6yhp, rest day: yes)` makes Day 3 the rest day. It has no leg.
   - No scenic waypoint on the last day. C judges that the road has no clear scenic option.

5. **Skeleton: Delicate Arch.** C calls `add_stops(day_b8mz3wkc, "first", [attraction, "sunrise hike to a famous arch", near stay_m7ab3kxd, 6:00 a.m.])`, which returns `stop_d7ar3hqn`. Returns: late for a set time, warning, **new**: the day starts at 8:00, and the hike is set for 6:00. The user already asked for sunrise, so C calls `update_day(day_b8mz3wkc, start 5:30 a.m.)`, and the warning goes away. C then calls `select_user_place(stop_d7ar3hqn, place_d9ra4mcp, "Delicate Arch", "hiking area", "sunrise at Delicate Arch", visit 2.5 h)`. C mentions Arches' timed-entry reservations, needed from 7 a.m. to 4 p.m., April through October; entering before 7 needs none. Day 2 gains a leg, Moab town → Delicate Arch → Moab town. Opening hours: open 24 hours, so there's no result.

6. **Skeleton: Goblin Valley, and change 4.** C calls `add_stops(day_t6qw4nrk, "first", [attraction, "a walk among hoodoos", along the leg, none])`, which returns `stop_g9vy2hmc`. Then `select_user_place(stop_g9vy2hmc, place_g5vk3nap, ..., visit 2 h)`. There's no detour time. Day 4 is re-routed through Goblin Valley and Hanksville, then on UT-24 through Capitol Reef. Returns: daily driving for Day 4, warning, **new** (4 h 13 m with buffer vs 4 h). C raises it with options: add a night, drop Goblin Valley, or accept a longer day. The user agrees to a longer day. C calls `update_day(day_t6qw4nrk, approve drive hours 4.5, "wants Goblin Valley and Capitol Reef on the way")`. Capitol Reef needs no waypoint, because UT-24 already runs through it (F8).

7. **Fill: laying out the days.** Four `add_stops` calls:
   - Day 1, first: attraction "a quick look at red rock towers on the river road," along the leg (`stop_f5tw2mxe`); meal "craft beer and pub food," near Moab, 6:00 p.m., value (`stop_m9bw4tkc`).
   - Day 2, after `stop_d7ar3hqn`:
     - attraction "a short walk among big arches" (`stop_w4nd8ycf`)
     - meal "coffee and breakfast burritos," value (`stop_v6mf2tke`)
     - meal "burgers and shakes," 12:00 p.m., value (`stop_m3kt9wrd`)
     - attraction "a moderate hike to a big arch outside the park" (`stop_c8rn5vax`)
     - meal "a special dinner," 7:00 p.m., posh from "one special dinner in Moab" (`stop_d2bs7kyf`)

     All are near the Moab stay.
   - Day 3, the rest day: meal "casual dinner near the hotel," 6:30 p.m., value (`stop_s4pk7xna`). A set time is required here.
   - Day 4, after Goblin Valley: meal "pie," along the leg, value (`stop_p7ie4rdt`); attraction "a short hike in Capitol Reef," along the leg (`stop_c3gg8wfk`); attraction "stargazing," near `stay_t2ry8wqa`, "1:00 a.m., next day" (`stop_p5nr6xqa`).

   C offers a later start after the late night. The user agrees, and C calls `update_day(day_t5vs9rwe, start 10:00 a.m.)`.

8. **Fill: worker briefs.**
   - Moab stay researcher: the lodging (mid-range, from "stays of 2+ nights") and seven stops.
   - Torrey stay researcher: the lodging (value, from "trip default") and stargazing. Brief: "1 a.m. after Day 4, so early Thursday, Oct 14."
   - Day 1 leg scout: `stop_f5tw2mxe`.
   - Day 4 leg scout: the pie and the hike. Brief: "after Goblin Valley ends around noon; pie around 1:20; hike around 2:45."
   - No leg scout for Days 2 and 3, which stay put, or for Day 5, which has no stops.

9. **Fill: the workers act.**
   - The Day 4 leg scout's `search_along_leg` follows Goblin Valley, which is selected, so the route line is right. Pie places in Torrey fall within 2 miles of the end and are dropped.
   - `add_stop_candidates(stop_p7ie4rdt, ...)` adds Gifford Homestead, Stan's Burger Shak, and Mesa Farm Market. Each detour time is measured with the candidate placed after Goblin Valley.
   - The leg scout's result: "Gifford Homestead is closed on Wednesdays, and Day 4 is a Wednesday."
   - Moab lodging candidates: Moab Springs Ranch, Red Cliffs Lodge, Hyatt Place.

10. **Change 3: the opening-hours results, as each stop is selected.**
    - **Moab Springs Ranch** is picked: `select_candidate(stay_m7ab3kxd, place_m5sr2ktq)`. It re-routes Days 1, 2, and 4. The user says it's for being near the Arches entrance, so C calls `add_memory_item(trip, "Picked Moab Springs Ranch: closest to the Arches entrance for the sunrise start")`.
    - **Fisher Towers:** hours not known, note, **new**. C mentions it lightly: "it's a trailhead, open all day as far as I know."
    - **Delicate Arch:** open long enough. Nothing is said.
    - **Milt's:** open, but not long enough, warning, **new** ("Milt's closes at 12:30 p.m. You'd get there at noon, with an hour planned."). The user asks to move it to the morning. C calls `move_stop(stop_m3kt9wrd, day_b8mz3wkc, after stop_w4nd8ycf, "none")`. The set time has to be given, so the old noon time doesn't carry over. Day 2 is re-routed. Milt's warning **gone**.
    - **Day 2 stop order:** note, **new** ("saves about 20 minutes by doing Corona Arch before the town stops"). C raises it. The user keeps the order. C calls `add_memory_item(trip, "Turned down a faster Day 2 order")`. Later writes return the note as already known.
    - **Gifford:** closed for the whole visit, warning, **new**. The user first wants to keep it ("we'll look at the orchards"). C calls `update_stop(stop_p7ie4rdt, approve opening hours, reason)`, and the tool records 0 minutes. Later the user changes their mind and asks for a substitute, but doesn't remember the others. C calls `read_itinerary(stop_p7ie4rdt)` and lists Stan's and Mesa Farm Market in chat. No card appears (F5). The user: "Stan's." C calls `select_candidate(stop_p7ie4rdt, place_s6tn4kmr)`. Code removes the approval, and the Gifford result goes away. C calls `add_memory_item(trip, "Took Stan's only because Gifford is closed Wednesdays")`.
    - **Change 4 again:** selecting Capitol Gorge makes Day 4 4 h 46 m. Daily driving, **new**, because the 4.5-hour approval stopped applying. C asks again. The user agrees to 5. C calls `update_day(day_t6qw4nrk, approve drive hours 5, reason)`, which replaces the old approval.

11. **Change 2: breakfast in Grand Junction.** C calls `add_stops(day_a4mq9ved, "first", [meal, "hearty local breakfast", near the start place, none, value, "trip default"])`, which returns `stop_g3bk8rwa`. C briefs the Day 1 leg scout again, for this stop only. The leg scout calls `search_near(stop_g3bk8rwa, "breakfast café")`, centered on Grand Junction, with hours for Sunday, October 10. Then `add_stop_candidates`, with no detour times. The card shows three cafés. The user leaves it for later. The Fisher Towers note now carries "may be too early."

    Day 1 schedule (Sun Oct 10):
    - 8:00 start
    - Breakfast: time set once a place is picked
    - 9:50 Fisher Towers, until 10:50
    - Free time, then 6:00 Moab Brewery (set time)
    - Arrive 7:05 p.m.

    Day 2 schedule:
    - Start 5:30
    - 6:00 Delicate Arch
    - 8:50 Windows
    - 10:20 Milt's
    - 11:25 Love Muffin
    - 12:45 Corona Arch
    - 7:00 Desert Bistro
    - Arrive 8:05 p.m.

    Day 3, rest day: 6:30 The Spoke, until 7:30.

    Day 4 schedule:
    - 8:00 start
    - 9:55 Goblin Valley
    - 12:25 Stan's
    - 2:50 Capitol Gorge, until 4:50
    - Free time until 12:35 a.m.
    - 1:00 a.m. (next day) Panorama Point
    - Arrive 2:15 a.m.

    Day 5: start 10:00, arrive in Salt Lake City about 1:45 p.m.

12. **Weather round.** C calls `Agent(weather worker, [stay_m7ab3kxd, stay_t2ry8wqa])`. Both come back as seasonal averages. Moab's activities are Fisher Towers, Delicate Arch, Windows, and Corona Arch. Torrey's are Goblin Valley, Capitol Gorge, and Panorama Point. The worker may also ask for Goblin Valley's weather by its own place ID. The Torrey text names "Wednesday, Oct 13" and "1 a.m." (F3).

13. **Change 5: the trip moves one day later.** C calls `update_itinerary(start date October 11, 2027)`. Every date moves. Nothing is re-routed. The opening-hours check reruns, and there's nothing new. Weather is not out of date, because the new dates are inside the 7-day window, but the Torrey text now names the wrong weekday (F3). C sees that a date moved and checks trip memory. It calls `read_place(place_g8fd2xwe)`: Gifford is open Thursdays, 7 to 5. C offers Gifford again. The user takes it: `select_candidate(stop_p7ie4rdt, place_g8fd2xwe)`. Day 4 is re-routed, now 4 h 52 m, under 5, so still approved. C should forget the memory item now, but the docs don't say to (F11). Assumption: C calls `forget_memory_item(mem_g7fd2wpe)`.

14. **Change 6: Moab goes from 3 nights to 2.** C explains that this removes Moab's last day, which is the user's rest day with dinner at The Spoke.
    - The user drops the dinner and accepts losing the rest day. C calls `remove_stops([stop_s4pk7xna])`, then `update_stay(stay_m7ab3kxd, nights 2)`.
    - Storage: Day 3 is removed. The Torrey day is now Day 3, on Wed Oct 13. Its leg isn't re-routed, since it still starts at Moab Springs Ranch.
    - Returns:
      - trip length, warning, **new** (4 vs 5)
      - stay tier set for different nights, note, **new**
      - Gifford, closed for the whole visit, warning, **new**, on a day whose stored properties the write didn't change (F6)
    - The rule still gives mid-range for 2 nights, so C calls `update_stay(stay_m7ab3kxd, tier mid-range, "stays of 2+ nights")` without asking, and the note goes away.
    - The user accepts the shorter trip. C calls `update_trip_brief(trip length 4, rest days: none)`, and the trip-length warning goes away.
    - C raises Gifford. The user: "Let me think about it." The warning stays open.

15. **Change 6: a 5-hour hike in Arches on Day 2.** C calls `add_stops(day_b8mz3wkc, after stop_d7ar3hqn, [attraction, "a long hike in Arches, about 5 hours", near stay_m7ab3kxd, none])`, which returns `stop_h5kz3wem`. Adding an empty stop doesn't re-route.
    - C tells the user what the hike pushes later: "Windows would move to about 2:15, Milt's to 3:45, after its 12:30 closing, and Love Muffin past its 1 p.m. closing." The checks can't see this until a place is picked.
    - The user drops Windows and Love Muffin, and keeps Milt's for now. C calls `remove_stops([stop_w4nd8ycf, stop_v6mf2tke])`, and Day 2 is re-routed.
    - The Moab researcher is briefed: "starts around 8:50 after Delicate Arch, runs to about 2." It offers Devils Garden Primitive Loop, Tower Arch, and Fiery Furnace. The notes say Fiery Furnace needs a permit.
    - The user picks Devils Garden: `select_candidate(stop_h5kz3wem, place_d8vg5tny)`, with a visit time of 5 h. Returns: Milt's, closed for the whole visit, warning, **new**; the stop-order note **gone**; weather out of date for the Moab stay, note, **new**.
    - The user: "Skip Milt's this time." C calls `remove_stops([stop_m3kt9wrd])`. This isn't a rejection, since the reason is about time. Memory: "Skipped Milt's because the long hike runs past its closing."
    - At the end of the turn, C reruns the weather worker for `stay_m7ab3kxd`.

    Day 2 schedule:
    - 5:30 start
    - 6:00 Delicate Arch, until 8:30
    - 8:50 Devils Garden, until 1:50
    - 2:20 Corona Arch, until 4:50
    - 7:00 Desert Bistro
    - Arrive 8:05 p.m.

**Session 2, March 2, 2027 (change 7)**

16. **Start of a new session.** C reads the full itinerary, the brief, and memory. C: "Still open from last time: Gifford Homestead is closed Wednesdays, and the Torrey day is now a Wednesday."
    - "Why did we pick that Moab hotel?" C answers from the selected lodging's rationale in the read ("quiet cottages at the north end of town, closest to the Arches entrance; fits mid-range") and the trip-memory item.
    - "What's left to decide?" From the full read and memory, C lists:
      - the Grand Junction breakfast, still proposed with three options
      - the Gifford warning
      - the jeep tour, an open item in trip memory
      - briefly: the Torrey day is approved for 5 hours of driving
    - The user picks Stan's. C calls `select_candidate(stop_p7ie4rdt, place_s6tn4kmr)` and saves the date reason to memory again.

**Session 3, October 6, 2027 (change 8)**

17. **Start of a new session.** The read shows forecast now available, note, for Moab: its dates, October 11 to 13, are all within October 6 plus 7 days. Torrey's dates run to October 14, which is day 8, so it gets no note. No open warnings. C offers a forecast for Moab, and the user agrees. The weather worker calls `stay_weather` (forecast) and `set_stay_weather`, which labels it "Forecast." Nothing records the date it was made (F4).

**Session 4, October 12, 2027 (change 9)**

18. **Start of a new session.** The trip started October 11. C reads the trip but mentions no warnings or forecast notes. "What time is dinner tonight?" Today is Day 2. C: "7:00 p.m. at Desert Bistro, after Corona Arch." "Swap Desert Bistro for somewhere else." C: "The trip has started, so I can't change the plan." Any write would be refused. The docs don't say whether C may suggest places from its own knowledge or look one up (F9). The Moab weather shown is the October 6 forecast, with no date on it (F4).
