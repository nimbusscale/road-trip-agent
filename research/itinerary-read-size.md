# Road Trip Planner: Making a Whole Itinerary Read Smaller

> **This is a research document, not a design document.** It records what was measured for #129, on what a whole `read_itinerary` of a long trip needs to carry, and how much smaller it could be. It describes a proposal, with its problems and trade-offs, but it makes no decision. Decisions go in tool design 2.1 once Joe agrees to one.

The problem: a whole read of a busy 14-day trip is 34,498 tokens. That's over Claude Code's limit of 25,000 tokens for a tool result, so `read_itinerary` refuses it (tool design 2.1). The limit could be raised. But every read stays in context for the rest of the session, so a large read costs tokens on every later turn. So the better question is why the coordinator reads the whole trip, and what it needs from the read each time. Section 2 answers that. The rest of the doc measures a read that carries only that.

**Where it stands.** The leading proposal is version L (section 5). It lists the picked place on each stop and stay, and gives only a count of the other candidates, by set. A busy 14-day trip goes from 34,498 tokens to 20,860. The same trip with nothing picked goes from 26,324 tokens to 10,820. So the read fits in every state the trip passes through. One thing is still open:

- The busy read in version L is 41,444 characters, and the tool refuses anything over 40,000. So the tool's character limit would have to go up too (section 9).

---

## 1. Method

- **The trip measured** is a realistic version of the 14-day loop from Las Vegas that #54 measured. It has 8 stays, 3 to 6 stops a day, and 275 candidates. The places have real names, such as The Narrows and Cliff Palace, with types, ratings, and towns that read like Google's. Each selected place has its own rationale. Nearly everything is picked. One stop has candidates but no place picked, one stop has no candidates yet, and there are four rejected places and three open warnings. Its whole read is `itinerary-read-size/full-read-14-realistic.txt`.
- **The same trip with nothing picked** shows the state right after workers fill the days, before the user chooses. It's the same trip, built with no lodging or stop place selected. Only the two stops the user named have a place. Its whole read is `itinerary-read-size/full-read-14-nothing-picked.txt`.
- **How the reads were made:** a script builds the trip through the services, like the example trips, and prints it with `wholeLines`, the code `read_itinerary` uses. It skips the tool's size limit. The script is `scratch/realistic-itinerary.ts`, which is git-ignored. `NOTHING_PICKED=1` builds the trip with nothing picked, and `ONE_SET=1` keeps only each item's first set.
- **How each change was measured:** `itinerary-read-size/variants.py` rewrites the read's text into each slimmer version. So these are mockups of the formats, not code changes. Each version keeps the same IDs and places.
- **How tokens were counted:** the same way as in tool design 2.1. The text goes to `claude-opus-5-5`, the coordinator's model, through the Agent SDK. The count is its input tokens less those of a one-word prompt. Counting version J a second time gave the same 21,000 tokens.
- **The review.** A fresh agent, with no chat history or memory, compared an earlier proposal (version F in section 4) with the design docs, the code, and the tests. Section 6 covers what it found and how the proposal changed.

---

## 2. Why the coordinator reads the whole trip

There are two questions here, and they have different answers. When does the coordinator read the whole trip, and what does it need then? And what does the read carry for later in the session, in case the user asks?

### 2.1 When it reads the whole trip

Technical spec 5.2 has the coordinator read the whole itinerary in three cases. Here is what each one needs from the read.

| Case | What the coordinator needs |
|---|---|
| **The start of a session** | The open warnings, to mention in its first reply. The forecast notes, to offer a weather rerun. And the trip as it stands: its dates and ends, its stays and days, the schedule, what's picked on each stop and stay, and what's still open |
| **After a resume** | The same as at the start of a session: the trip as it stands now. A list of what changed wouldn't do instead, since the coordinator would then have to merge it with an old read far back in its transcript and its own writes since. What's different is that the conversation is back. So the coordinator also has to spot what the conversation never heard about. The main case is candidates a worker saved before a restart cut off the turn ([persistence design](../design/persistence.md), section 7). #147 asks whether to give it a list of changes as well, once an evaluation shows it needs one |
| **"What's left to decide?"** | Which stops and lodging are empty or proposed, the open warnings, and the approved exceptions |

None of the three needs every candidate's name and short line:

- For an item that's picked, the picked place is what matters.
- For an item that isn't picked yet, the coordinator needs to know it's undecided, and how many options it has. To talk through the options, it reads that stop or stay.
- After a resume, it needs to notice new candidates, not read them. A count by set shows that a stop that was empty now has a set, or that a picked stop has a new one.

### 2.2 What the read carries for later

The read at the start of a session is also the coordinator's background for the rest of the session. Today it carries four things for that, each in case the user asks about it:

| What | Why it's in the read | Where the user sees it without asking | Size in the busy read |
|---|---|---|---|
| The candidates not picked, with their short lines | So the coordinator can follow along when the user names one, such as "let's do the Desert Pearl instead" (technical spec 7.2) | The option cards, shown for every stop and stay with nothing selected (functional spec 7.5) | 20,813 characters, 31% (section 3) |
| The picked place's rationale | To answer "why did we pick that?" (technical spec 7.2) | The itinerary view (functional spec 7.6) | About 2,900 tokens (version G in section 4) |
| Each stay's weather and clothing text | To answer what to pack | The itinerary view (functional spec 9.6) | About 700 tokens (version E) |
| The rejected places, with their reasons | To answer about a place the user turned down | Not in the view. But `find_place` marks a rejected place with the user's reason | 4 lines |

The itinerary view sits next to the chat (functional spec section 9). #57 builds it, and #62 builds the option cards. So the user can see the first three without asking the coordinator.

That suggests a rule for what a whole read carries:

- What the coordinator needs for the three cases in 2.1.
- Enough to recognize what the user is talking about.

Details the view already shows would come from a scoped read, when the user asks about them. Version L follows the rule for candidates. It still carries the rationale and the weather text. Dropping both would save about 3,600 more tokens, going by versions E and G, but that wasn't measured on L.

**The hard part is recognizing what the user means.** The user is looking at the view, so they'll name things they see there, such as "the Desert Pearl," "Tuesday's dinner," or "why Whiptail?" The coordinator has to work out which stop or stay is meant, and then read it. A day or a picked place is easy to find in the read. A candidate that isn't picked is not, once the read has no candidate names. That's an open question in #129.

---

## 3. Where the characters go

The busy trip's whole read is 66,260 characters, and the API counts it as 34,498 tokens. That's 1.92 characters a token, close to the 1.89 that #54 measured.

| Part | Characters | Share |
|---|---|---|
| Candidate lines for places not picked | 20,813 | 31% |
| Candidate lines for the picked places | 17,181 | 26% |
| Everything else: stays, days, legs, schedules, stop lines, check results | 28,266 | 43% |

The picked places' candidate lines mostly repeat the stop line. The stop line already says "Selected: Whiptail Grill (place_…), visit time 1 h." The candidate line then says the name and ID again, and adds the short line and the rationale.

The nothing-picked read is 51,047 characters, and its candidate lines are 29,474 of them, or 58%.

---

## 4. What each change saves

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
| J. B, keeping the picked place's detour time, and counting the others by set | 41,710 | 21,000 | −39% |
| K. B, keeping the detour time, and listing in full any set newer than the picked one | 46,598 | 23,023 | −33% |
| **L. J, and counting by set the candidates of items with nothing picked too. The current proposal** | **41,444** | **20,860** | **−40%** |

Short dates means "Sun Sep 12" instead of "Sunday, September 12, 2027". It and dropping "the usual start time" each save about 1% of the characters. Their tokens weren't counted on their own.

L saves little over J on the busy trip, since only one of its stops has candidates and nothing picked. It matters on the trip with nothing picked:

| State | Today | J | L |
|---|---|---|---|
| Nothing picked, one set for each item | 47,064 characters, 24,078 tokens | the same as today | not measured |
| Nothing picked, with the second sets | 51,047 characters, 26,324 tokens | the same as today | 22,806 characters, 10,820 tokens |

Versions A to K don't make the nothing-picked read smaller. With no place picked, every candidate stays, and with no times known, the schedule has no drive lines to drop.

---

## 5. The current proposal (version L)

It changes only the whole read. Reads of a day, stay, or stop stay as they are. `itinerary-read-size/slim-read-proposed.txt` is the busy trip in this format.

**What changes:**

- No candidate is listed. A line on each stop and stay gives the count of its candidates, by set.
- On a stop or stay with a picked place, the picked place's own candidate line goes away. Its short line, its detour time, and its rationale move onto the stop line, or onto the stay's "Lodging:" line. The count line then covers only the other candidates.
- A picked place with no other candidates gets no count line, such as a place the user named.

A picked stop today:

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

A stop with nothing picked, proposed:

```
- 6:30 p.m.: Stop 4 (stop_…), meal: "dinner". Near the Springdale stay. Set time: 6:30 p.m. Tier: value, from the rule "the trip default". No place selected yet.
  - Candidates: 3 in set 1, 3 in set 2.
```

**What stays:**

- Each of the three cases in section 2.1 still has what it needs. "What's left to decide?" sees every stop and stay with no place picked, and how many options each has.
- The schedule's drive lines, each meal's tier, and each stay's weather text.
- Everything outside candidates: the trip's dates and ends, stays, legs, approvals, rejected places, and check results. So the parts that only a whole read shows stay in reach. These are the check results about the trip itself, such as its length, plus the start and end places, the dates, and the rejected places. Reading a stay at a time loses them (#129, last open question).
- A read scoped to a stop or stay still gives every candidate in full. So the coordinator can always get them with a call it already has.

---

## 6. What the review found, and how the proposal changed

The review looked at version F. It found four problems. They led to version J, and version L keeps all four fixes. The review didn't look at L.

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

## 7. Trade-offs that remain

- **In a new session, the coordinator doesn't know any candidate's name.** Now some requests take one extra stop or stay read each:
  - Picking an option by name in chat, such as "let's do the Desert Pearl" (functional spec 7.5). In version L this includes the first pick on an item, not only a change of pick. A Select click on an option card isn't affected, since its message carries the place's line and IDs (technical spec 7.2).
  - "What else was offered?", or recommending one of an item's options.
  - Offering again a place passed over for a date reason (technical spec 5.2).
  - Checking whether another candidate is open on the stop's date (technical spec 7.2).

  If the coordinator uses `find_place` instead of reading the stop, it may call `select_user_place` on a place that's already a candidate. The error tells it to use `select_candidate`, so it recovers after one wasted call.
- **"More options", "Higher tier", and "Lower tier" need a stop read first.** A worker brief lists the candidates already offered, as places to leave out (technical spec 5.3). If the coordinator writes the brief from the count alone, the worker will likely find the same top places again. Code refuses a repeat ("…is already one of the candidates"), so the cost is a wasted worker call, not a broken trip. The instructions for the refine round should say to read the stop first. Those instructions aren't written yet.
- **A whole read and a day read of the same day will look different.** The day read still lists every candidate. That makes traces harder to compare, and a model might think something changed between the two reads. In code, both use `dayLines(…, "short")` in `src/tools/itinerary-lines.ts`, so this needs a third level of detail, not a change to "short".

---

## 8. A trip that's partly picked

The fill round sends workers for the whole trip at once (technical spec 4.2, step 4). So every long trip passes through a state with almost nothing picked, right after the fill. A person isn't likely to leave a trip that way for long. But a session can end partway through the picking, and the next one then starts with a whole read of a trip that's partly picked.

In version J, a partly picked trip lies between 21,000 tokens (busy) and 26,324 (nothing picked), so it's near or over the limit. In version L, it lies between 10,820 and 20,860. A partly picked trip wasn't measured, but each pick makes the read longer in L, since the picked place's line is longer than a count. So the busy trip is close to the largest a whole read gets.

The tool still needs its refusal for a read that's too large, for a trip denser than this one. Today its error says to read the trip a stay at a time. But a stay read is the largest scoped read, since it gives every candidate's full details. #54 measured a 3-night stay at 28,104 characters. Day reads are smaller, at about 5,200 characters each at most. So the error could point to day reads instead.

---

## 9. The tool's character limit

The tool can't count tokens, so it refuses a reply over 40,000 characters, which is about 21,000 tokens at 1.89 characters a token (tool design 2.1). Version L is 41,444 characters but only 20,860 tokens, so the tool would refuse it.

Fewer IDs means more characters per token. The measured reads ran from 1.83 to 2.11 characters a token, and the densest one is version I, with the most IDs for its length. At 1.83, a limit of about 45,000 characters stays under 25,000 tokens. J and L would fit. K, at 46,598 characters, would not.

---

## 10. What in the design and code would change

- **Tool design 2.1, the `read_itinerary` row.** It says a read gives "every stored property of each item it covers", and for each stop and stay "every candidate, in the order offered, each with its set number and its visit and detour times." It also says a scoped read returns "the same details for its part only". A day read would now return more than the whole read does.
- **Tool design 2.1, the size paragraphs.** "A whole read of a long trip is refused" would no longer be true of a trip like this one. The 40,000-character limit would change (section 9). So would the fallback, if it points to day reads (section 8).
- **Technical spec 7.2, "Reading the itinerary".** It says the read returns "the name and short line for every selected place and every candidate," and that in a new session this is all the coordinator knows about the trip's places. In version L, the read gives only the selected places, and counts for the rest.
- **Technical spec 5.2.** It could say what each whole read is for, as in section 2.1, so the instructions don't lean on the read for candidates.
- **The tool's description, `READ_ITINERARY_DESCRIPTION` in `src/tools/itinerary-tools.ts`.** "Candidates are listed in the order offered, with their set" would be wrong for a whole read, and the count lines need explaining. `src/agent/coordinator.view.md` is a snapshot of it, so `npm run agent-views` updates it.
- **The coordinator's instructions.** They should say to read the stop or stay before picking an option by name, recommending one, or "More options", "Higher tier", or "Lower tier" (section 7).
- **Tests.** `src/tools/itinerary-read-marks.test.ts` has a test that a whole read of `fourteenDayExample` is refused as too large. In the new format it would probably fit, and the test would fail. A new test should pin both count lines and the folded stop line.

---

## 11. Fine as is

The review checked these for version F, and found they don't change. Each still holds for version L:

- Fill briefs (technical spec 4.2): the stops they cover are still empty, so there are no candidates to hide.
- The weather worker's brief (technical spec 5.3): it needs only stay IDs, town names, and place IDs, which stay.
- Open warnings and forecast notes at the start of a session: check results don't change.
- Rejected places, approvals, waypoints, leg lines, and arrival lines.
- Functional spec S7.
- Write replies, which don't use the read's line builders.

---

## 12. Not measured

- **Fewer IDs.** Version B has 191 IDs, at about 5 tokens each, so about 1,000 tokens. The coordinator needs each one to act on its item, so there isn't much to cut.
- **JSON instead of text.** Repeating each key and its quotes on every item would likely cost more.
- **A partly picked trip.** It lies between the busy and nothing-picked reads (section 8).
- **The largest busy trip.** Since 14 days is the longest trip allowed (technical spec section 10), a trip like this one is close to the largest a whole read gets once most items are picked.
