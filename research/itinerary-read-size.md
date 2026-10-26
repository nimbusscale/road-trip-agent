# Road Trip Planner: Making a Whole Itinerary Read Smaller

> **This is a research document, not a design document.** It records what was measured for #129, on how to fit a whole `read_itinerary` of a long trip under Claude Code's limit. It does not make design decisions. Those go in tool design 2.1 once Joe agrees to one.

The problem: Claude Code gives the model at most 25,000 tokens of a tool result. A whole read of a busy 14-day trip is well over that, so `read_itinerary` refuses it (tool design 2.1). This doc measures how much smaller each change to the read's format would make it, and what each one costs the coordinator.

---

## 1. Method

- **The trip measured** is a realistic version of the 14-day loop from Las Vegas that #54 measured. It has 8 stays, 3 to 6 stops a day, and 275 candidates. The places have real names, such as The Narrows and Cliff Palace, with types, ratings, and towns that read like Google's. Each selected place has its own rationale. It has one stop with candidates but no place picked, one stop with no candidates, four rejected places, and three open warnings. Its whole read is `itinerary-read-size/full-read-14-realistic.txt`.
- **How the read was made:** a script builds the trip through the services, like the example trips, and prints it with `wholeLines`, the code `read_itinerary` uses. It skips the tool's size limit. The script is `scratch/realistic-itinerary.ts`, which is git-ignored.
- **How each change was measured:** `itinerary-read-size/variants.py` rewrites the read's text into each slimmer version. So these are mockups of the formats, not code changes. Each version keeps the same IDs and places.
- **How tokens were counted:** the same way as in tool design 2.1. The text goes to `claude-opus-5-5`, the coordinator's model, through the Agent SDK. The count is its input tokens less those of a one-word prompt.

---

## 2. Where the characters go

The whole read is 66,260 characters, and the API counts it as 34,498 tokens. That's 1.92 characters a token, close to the 1.89 that #54 measured.

| Part | Characters | Share |
|---|---|---|
| Candidate lines for places not picked | 20,813 | 31% |
| Candidate lines for the picked places | 17,181 | 26% |
| Everything else: stays, days, legs, schedules, stop lines, check results | 28,266 | 43% |

The picked places' candidate lines mostly repeat the stop line. The stop line already says "Selected: Whiptail Grill (place_…), visit time 1 h." The candidate line says the name and ID again, then adds the short line and the rationale.

---

## 3. What each change saves

| Version | Characters | Tokens | Change in tokens |
|---|---|---|---|
| Today | 66,260 | 34,498 | — |
| A. Drop the candidates not picked, on stops and stays with a picked place | 47,711 | 23,944 | −31% |
| B. A, and fold the picked place into the stop or lodging line | 40,177 | 20,194 | −41% |
| C. B, without the "drive" lines | 37,378 | 18,186 | −47% |
| D. B, with a meal's tier only when it isn't the trip default | 38,297 | 19,554 | −43% |
| E. B, without each stay's weather text | 38,275 | 19,458 | −44% |
| F. B, with C and D | 35,498 | 17,546 | −49% |
| G. B, without the picked place's rationale | 32,377 | 17,268 | −50% |
| H. B, with C, D, E, short dates, and no "the usual start time" | 32,480 | 16,422 | −52% |
| I. H, and G | 24,680 | 13,496 | −61% |

Short dates means "Sun Sep 12" instead of "Sunday, September 12, 2027". It and dropping "the usual start time" each save about 1% of the characters. Their tokens weren't counted on their own.

`itinerary-read-size/slim-read-recommended.txt` is version F, to show what a slimmer read looks like.

---

## 4. Dropping the candidates not picked (A and B)

**How it works.** On a stop or stay with a picked place, the read names that place once. In B, the stop line carries the place's short line and rationale, and a count follows:

```
- 8:14 a.m. to 9:14 a.m.: Stop 1 (stop_…), meal: "breakfast". Near the start place. Tier: value, from the rule "the trip default". Selected: The Egg & I (place_…), Breakfast restaurant, 4.6 stars, $$, Las Vegas, visit time 1 h. Why: "…"
  - 2 other candidates.
```

A stop or stay with nothing picked keeps every candidate, so "what's left to decide?" (technical spec 5.2) still has what it needs. A read scoped to a stop or stay still gives every candidate in full. So the coordinator can always get the rest with a call it already has.

**What it costs:**

- **In a new session, the coordinator doesn't know the other options.** Technical spec 7.2 says the read gives every candidate, and that in a new session it's all the coordinator knows about the trip's places. If the user says "switch to the other place for Day 6 dinner," the coordinator first reads that stop. That's one extra call, and a small one.
- **"More options" needs a stop read first.** A worker brief lists the candidates already offered (technical spec 5.3). If the coordinator writes the brief without that read, code still refuses a repeat: "…is already one of the candidates." So the cost is a wasted worker turn, not a broken trip.
- **The saving depends on how much is decided.** A trip with every stop full of candidates and nothing picked would be about as big as today. That's unlikely, since the user picks as workers report back.
- **Tool design 2.1 and technical spec 7.2 would change.** Both say a whole read gives every candidate.

**What it keeps.** The whole read still works on a long trip. So the parts that only a whole read shows stay in reach: the check results about the trip itself, such as its length, the start and end places, the dates, and the rejected places. Reading a stay at a time loses those (#129, last open question).

---

## 5. The smaller cuts

Each is measured on top of B.

- **No "drive" lines (C): about 2,000 tokens.** A line such as "8:00 a.m. to 8:14 a.m.: drive." follows from the stop times around it. Free time lines stay. Each leg's total drive time stays in the leg line.
- **A meal's tier only when it isn't the trip default (D): about 640 tokens.** Most meals say "Tier: value, from the rule "the trip default"." The trip brief already has the default tier. A worker brief needs the tier, but only for a stop being filled, which is usually one with nothing picked.
- **No weather text (E): about 740 tokens.** The line would keep the label, the date it was written, and the out-of-date mark, which are what the start of a session needs (technical spec 5.2). A question such as "what should we pack for Moab?" would need a read of that stay.
- **No rationale for the picked place (G): about 2,900 tokens.** Technical spec 7.2 keeps it in the whole read on purpose, so the coordinator can answer "why did we pick that?" without another call. Without it, that question takes a stop read.

---

## 6. The tool's character limit

The tool can't count tokens, so it refuses a reply over 40,000 characters, which is about 21,000 tokens at 1.89 characters a token (tool design 2.1). Version B is 40,177 characters. So B alone would still be refused, even though it's only 20,194 tokens. Version F is 35,498 characters and fits.

The slimmer versions have about 2.0 characters a token, since they hold fewer IDs. At that rate, 25,000 tokens is about 50,000 characters, so the limit could also be looked at again.

---

## 7. Not measured

- **Fewer IDs.** Version B has 191 IDs, at about 5 tokens each, so about 1,000 tokens. The coordinator needs each one to act on the item, so there isn't much to cut.
- **JSON instead of text.** Not measured. Repeating each key and its quotes on every item would likely cost more.
- **A trip with more decided.** This trip has nearly every stop decided. Since 14 days is the longest trip allowed (technical spec section 10), a trip like this is close to the largest a whole read can get.
