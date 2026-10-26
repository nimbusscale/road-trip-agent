# Road Trip Planner: Making a Whole Itinerary Read Smaller

> **This is a research document, not a design document.** It records what was measured for #129, on how to fit a whole `read_itinerary` of a long trip under Claude Code's limit. It describes a proposal, with its problems and trade-offs, but it makes no decision. Decisions go in tool design 2.1 once Joe agrees to one.

The problem: Claude Code gives the model at most 25,000 tokens of a tool result. A whole read of a busy 14-day trip is well over that, so `read_itinerary` refuses it (tool design 2.1).

**Where it stands.** The leading proposal takes a busy 14-day trip from 34,498 tokens to 21,000. It mainly drops the candidates that weren't picked, on stops and stays that have a picked place (section 4). Two things are still open:

- The proposed read is 41,710 characters, and the tool refuses anything over 40,000. So the tool's character limit would have to go up too (section 8).
- It doesn't help a trip where little is picked yet. That read is 24,078 to 26,324 tokens, so it's at or over the limit, and still needs a fallback (section 7).

---

## 1. Method

- **The trip measured** is a realistic version of the 14-day loop from Las Vegas that #54 measured. It has 8 stays, 3 to 6 stops a day, and 275 candidates. The places have real names, such as The Narrows and Cliff Palace, with types, ratings, and towns that read like Google's. Each selected place has its own rationale. Nearly everything is picked. One stop has candidates but no place picked, one stop has no candidates yet, and there are four rejected places and three open warnings. Its whole read is `itinerary-read-size/full-read-14-realistic.txt`.
- **The same trip with nothing picked** shows the state right after workers fill the days, before the user chooses. It's the same trip, built with no lodging or stop place selected. Only the two stops the user named have a place. Its whole read is `itinerary-read-size/full-read-14-nothing-picked.txt`.
- **How the reads were made:** a script builds the trip through the services, like the example trips, and prints it with `wholeLines`, the code `read_itinerary` uses. It skips the tool's size limit. The script is `scratch/realistic-itinerary.ts`, which is git-ignored. `NOTHING_PICKED=1` builds the trip with nothing picked, and `ONE_SET=1` keeps only each item's first set.
- **How each change was measured:** `itinerary-read-size/variants.py` rewrites the read's text into each slimmer version. So these are mockups of the formats, not code changes. Each version keeps the same IDs and places.
- **How tokens were counted:** the same way as in tool design 2.1. The text goes to `claude-opus-5-5`, the coordinator's model, through the Agent SDK. The count is its input tokens less those of a one-word prompt.
- **The review.** A fresh agent, with no chat history or memory, compared the first proposal (version F in section 3) with the design docs, the code, and the tests. Section 5 covers what it found and how the proposal changed.

---

## 2. Where the characters go

The whole read is 66,260 characters, and the API counts it as 34,498 tokens. That's 1.92 characters a token, close to the 1.89 that #54 measured.

| Part | Characters | Share |
|---|---|---|
| Candidate lines for places not picked | 20,813 | 31% |
| Candidate lines for the picked places | 17,181 | 26% |
| Everything else: stays, days, legs, schedules, stop lines, check results | 28,266 | 43% |

The picked places' candidate lines mostly repeat the stop line. The stop line already says "Selected: Whiptail Grill (place_…), visit time 1 h." The candidate line then says the name and ID again, and adds the short line and the rationale.

---

## 3. What each change saves

Each version is the busy trip's whole read with one or more changes.

| Version | Characters | Tokens | Change in tokens |
|---|---|---|---|
| Today | 66,260 | 34,498 | — |
| A. Drop the candidates not picked, on stops and stays with a picked place, and give their count | 47,711 | 23,944 | −31% |
| B. A, and fold the picked place into the stop or lodging line | 40,177 | 20,194 | −41% |
| C. B, without the "drive" lines | 37,378 | 18,186 | −47% |
| D. B, with a meal's tier only when it isn't the trip default | 38,297 | 19,554 | −43% |
| E. B, without each stay's weather text | 38,275 | 19,458 | −44% |
| F. B, with C and D. The first proposal | 35,498 | 17,546 | −49% |
| G. B, without the picked place's rationale | 32,377 | 17,268 | −50% |
| H. B, with C, D, E, short dates, and no "the usual start time" | 32,480 | 16,422 | −52% |
| I. H, and G | 24,680 | 13,496 | −61% |
| **J. B, keeping the picked place's detour time, and counting the others by set. The current proposal** | **41,710** | **21,000** | **−39%** |
| K. B, keeping the detour time, and listing in full any set newer than the picked one | 46,598 | 23,023 | −33% |

Short dates means "Sun Sep 12" instead of "Sunday, September 12, 2027". It and dropping "the usual start time" each save about 1% of the characters. Their tokens weren't counted on their own.

The same trip with nothing picked:

| State | Characters | Tokens |
|---|---|---|
| Nothing picked, one set for each item | 47,064 | 24,078 |
| Nothing picked, with the second sets | 51,047 | 26,324 |

None of the changes above make these smaller. With no place picked, every candidate stays, and with no times known, the schedule has no drive lines to drop.

---

## 4. The current proposal (version J)

It changes only the whole read. Reads of a day, stay, or stop stay as they are. `itinerary-read-size/slim-read-proposed.txt` is the busy trip in this format.

**What changes:**

- On a stop or stay with a picked place, the candidates not picked are no longer listed. A line gives their count, by set.
- The picked place's own candidate line goes away. Its short line, its detour time, and its rationale move onto the stop line, or onto the stay's "Lodging:" line.
- A picked place with no other candidates gets no count line, such as a place the user named.

Today:

```
- 10:18 a.m. to 12:18 p.m.: Stop 2 (stop_…), attraction: "a first look at red rock on the way". Along the leg. Selected: Valley of Fire State Park (place_…), visit time 2 h.
  - Candidates:
    - Set 1: Valley of Fire State Park (place_…), State park, 4.8 stars, $, Overton, visit time 2 h, detour 38 m when offered, selected. Why: "Nevada's oldest state park, …"
    - Set 1: Kolob Canyons Viewpoint (place_…), Scenic spot, 4.8 stars, New Harmony, visit time 45 m, detour 12 m when offered.
    - Set 1: Red Cliffs Recreation Area (place_…), Park, 4.6 stars, $, Leeds, visit time 1 h, detour 6 m when offered.
```

Proposed:

```
- 10:18 a.m. to 12:18 p.m.: Stop 2 (stop_…), attraction: "a first look at red rock on the way". Along the leg. Selected: Valley of Fire State Park (place_…), State park, 4.8 stars, $, Overton, detour 38 m when offered, visit time 2 h. Why: "Nevada's oldest state park, …"
  - Other candidates: 2 in set 1.
```

**What stays:**

- A stop or stay with no picked place still lists every candidate. So "what's left to decide?" (technical spec 5.2) still has what it needs.
- The schedule's drive lines, each meal's tier, and each stay's weather text.
- Everything outside candidates: the trip's dates and ends, stays, legs, approvals, rejected places, and check results. So the parts that only a whole read shows stay in reach. These are the check results about the trip itself, such as its length, plus the start and end places, the dates, and the rejected places. Reading a stay at a time loses them (#129, last open question).
- A read scoped to a stop or stay still gives every candidate in full. So the coordinator can always get the rest with a call it already has.

---

## 5. What the review found, and how the proposal changed

The first proposal was version F. The review found four problems with it.

**1. The meal tier cut (D) can't be built reliably. The proposal now drops it.** It would hide a meal's tier when it's the trip default. But code has no reliable way to tell what the trip default is:

- The tier rule is free text. The example trips write "the trip default", but the coordinator's instructions tell it to write "the default tier" (`src/agent/coordinator-prompt.ts`).
- Code could compare with the trip brief's `defaultTier` instead. But domain model 3.2 says code doesn't read that item, so this would change the domain model. It would also need a rule for when it isn't set.
- A text match would go wrong in a real case. Say the user raises the default from value to mid-range after the meals are filled. The meals keep value, but the read still hides their tier. So the coordinator assumes mid-range, and briefs "more options" at the wrong tier.
- Stays would still show their tier, so a missing tier on a meal could read as "this meal has no tier."

It saved only about 640 tokens.

**2. The picked place's detour time was dropped. The proposal now keeps it.** When a day drives too long, technical spec 5.2 has the coordinator offer two or three trade-offs. The detour times show which stop costs the most driving. Without them, it would need a stop read for each stop along the leg. Keeping them costs about 600 characters.

**3. A set offered after the pick would be hidden. The proposal now counts the others by set.** "More options" can run on an item that's already picked (functional spec 7.5). That card doesn't come back after a reload. And after a resume, technical spec 5.2 relies on the read to find candidates a cut-off worker saved. With a plain count, "2 other candidates" just turns into "5 other candidates", with nothing to say a new set came. There are two ways to fix it:

- **Count by set (J):** "Other candidates: 2 in set 1, 3 in set 2." A set newer than the picked one shows up. Counting by set costs about 900 characters more than a plain count. To see its places, the coordinator reads the stop. J is 41,710 characters and 21,000 tokens.
- **List newer sets in full (K):** any set newer than the picked one is listed, as today. The coordinator sees the new places without another call. But code can't tell whether the user already saw that set and kept the old pick. In this trip, that happened on 10 stops and stays, so K lists sets that were already turned down. K is 46,598 characters and 23,023 tokens.

**4. Without drive lines (C), gaps in the schedule read as free time. The proposal now keeps them.** On Day 1, free time runs until 5:37 p.m., and dinner is at 6:30. The 53 minutes between are a drive, but nothing in the read would say so. A model could tell the user they're free until 6:30. A day with only a drive would show an empty schedule. Tool design section 4 says a read's lines are explained by the instructions, and nothing there would explain the gap. Keeping the drive lines costs about 2,000 tokens.

---

## 6. Trade-offs that remain

- **In a new session, the coordinator doesn't know the other options.** Technical spec 7.2 says a whole read gives every candidate, and that in a new session it's all the coordinator knows about the trip's places. Now some requests take one extra stop read each:
  - "What else was offered?", or picking another option by name (functional spec 7.5).
  - Offering again a place passed over for a date reason (technical spec 5.2).
  - Checking whether another candidate is open on the stop's date (technical spec 7.2).

  If the coordinator uses `find_place` instead of reading the stop, it may call `select_user_place` on a place that's already a candidate. The error tells it to use `select_candidate`, so it recovers after one wasted call.
- **"More options", "Higher tier", and "Lower tier" need a stop read first.** A worker brief lists the candidates already offered, as places to leave out (technical spec 5.3). If the coordinator writes the brief from the count alone, the worker will likely find the same top places again. Code refuses a repeat ("…is already one of the candidates"), so the cost is a wasted worker call, not a broken trip. The instructions for the refine round should say to read the stop first. Those instructions aren't written yet.
- **A whole read and a day read of the same day will look different.** The day read still lists every candidate. That makes traces harder to compare, and a model might think something changed between the two reads. In code, both use `dayLines(…, "short")` in `src/tools/itinerary-lines.ts`, so this needs a third level of detail, not a change to "short".

---

## 7. A trip with little picked is still too large

Right after workers fill the days, nothing is picked yet. The read is then 24,078 tokens with one set per item, and 26,324 with the second sets (section 3). The proposal can't help, since it only trims items that have a pick. That's also when a session is most likely to start or resume mid-planning. So on a long trip, the whole read at the start of a session can still be refused, at the busiest stretch of picking.

The read gets smaller as the user picks.

So the tool still needs its fallback for a whole read that's too large. Today its error says to read the trip a stay at a time. But a stay read is the largest scoped read, since it gives every candidate's full details. #54 measured a 3-night stay at 28,104 characters. Day reads are smaller, at about 5,200 characters each at most. So the error could point to day reads instead. That still leaves the parts only a whole read shows (section 4) out of reach in this state.

---

## 8. The tool's character limit

The tool can't count tokens, so it refuses a reply over 40,000 characters, which is about 21,000 tokens at 1.89 characters a token (tool design 2.1). Version J is 41,710 characters but only 21,000 tokens, so the tool would refuse it.

Fewer IDs means more characters per token. The measured reads ran from 1.83 to 2.06 characters a token, and the densest one is version I, with the most IDs for its length. At 1.83, a limit of about 45,000 characters stays under 25,000 tokens. J would fit. K, at 46,598 characters, would not. The nothing-picked reads, at 47,064 and 51,047 characters, still wouldn't.

---

## 9. What in the design and code would change

- **Tool design 2.1, the `read_itinerary` row.** It says a read gives "every stored property of each item it covers", and for each stop and stay "every candidate, in the order offered, each with its set number and its visit and detour times." It also says a scoped read returns "the same details for its part only". A day read would now return more than the whole read does.
- **Tool design 2.1, the size paragraphs.** "A whole read of a long trip is refused" would be true only while little is picked. The 40,000-character limit would change (section 8). So would the fallback, if it points to day reads (section 7).
- **Technical spec 7.2, "Reading the itinerary".** It says the read returns "the name and short line for every selected place and every candidate," and that in a new session this is all the coordinator knows about the trip's places.
- **The tool's description, `READ_ITINERARY_DESCRIPTION` in `src/tools/itinerary-tools.ts`.** "Candidates are listed in the order offered, with their set" would be wrong for a whole read, and the count line needs explaining. `src/agent/coordinator.view.md` is a snapshot of it, so `npm run agent-views` updates it.
- **The coordinator's instructions.** They should say to read the stop before "More options", "Higher tier", or "Lower tier" (section 6).
- **Tests.** `src/tools/itinerary-read-marks.test.ts` has a test that a whole read of `fourteenDayExample` is refused as too large. That trip has everything picked, so in the new format it would probably fit, and the test would fail. A new test should pin the count line, the folded stop line, and that undecided items still list every candidate.

---

## 10. Fine as is

The review checked these, and found they don't change:

- "What's left to decide?" (technical spec 5.2): empty and undecided items still list everything.
- Fill briefs (technical spec 4.2): the stops they cover are still empty, so every candidate shows.
- The weather worker's brief (technical spec 5.3): it needs only stay IDs, town names, and place IDs, which stay.
- Open warnings and forecast notes at the start of a session: check results don't change.
- Rejected places, approvals, waypoints, leg lines, and arrival lines.
- Functional spec S7.
- Write replies, which don't use the read's line builders.

---

## 11. Not measured

- **Fewer IDs.** Version B has 191 IDs, at about 5 tokens each, so about 1,000 tokens. The coordinator needs each one to act on its item, so there isn't much to cut.
- **JSON instead of text.** Repeating each key and its quotes on every item would likely cost more.
- **The largest busy trip.** Since 14 days is the longest trip allowed (technical spec section 10), a trip like this one is close to the largest a whole read gets once most items are picked.
