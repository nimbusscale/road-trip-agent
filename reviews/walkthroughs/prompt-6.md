> **Snapshot, out of date.** This is the prompt for design walk-through 6, from 2026-10-12. It describes the design as it was then. The design changed after it, so much of this no longer matches. The current design is in `design/`. Anything still open is in `research/domain-model-notes.md`. See `reviews/walkthroughs/README.md`.

We're designing a road trip planner. It's a learning project, and it's still in the design phase. There is no code yet. The design lives in `design/`. I want you to test that design by walking two example trips through it, step by step, before we write a full object model. The goal is to find holes now, while they're cheap to fix.

A full object model (technical spec open question 4) comes after this, and your findings feed it.

The repository is at `/home/jjk3/PycharmProjects/personal/road-trip-agent`. All paths below are relative to it.

## What to read

Read every file in `design/` in full before you start:

- `functional-spec.md`: what the app does
- `technical-spec.md`: agents, data model, planning rounds, feasibility checks. The two example trips are in technical spec section 3.1
- `tool-design.md`: every tool, what it takes, and which agent gets it
- `data-sources.md` and the `data-sources-*.md` files: where data comes from and the limits we found in testing

Work only from these docs. Read the files in `design/` and nothing else. That rules out everything outside `design/`, including but not limited to `research/`, `scratch/` (apart from writing your results), the git history, past session transcripts, and any memory files. Part of the test is whether the design docs stand on their own. If you need something the docs don't say, that is a finding.

This is a walk-through on paper. Don't call any APIs, run web searches, or write code. When a step calls a tool, make up a plausible reply that fits the tool's description in `tool-design.md`. Drive times and place details can be rough.

## What to walk

Walk both examples in technical spec section 3.1: San Francisco to Mike's house in Los Angeles, and Grand Junction to Salt Lake City through Moab. Start each one from an empty trip and end at the finished itinerary shown in the example.

Go through the planning rounds in technical spec section 4.2: discovery, shape (only if the route is open), skeleton, fill, weather and clothing, and refine. You play the user as well as the agents. Make up user replies that fit the example's trip brief. Where the example says a stop was named by the user, the user names it. Don't have a worker fill it.

At each step, write down:

- **Who acts:** the coordinator, a worker (which one), code inside a tool, or the UI
- **The tool call:** the tool name from `tool-design.md` and the inputs it gets. Use made-up IDs in the format from technical spec section 7.1, such as `stop_k7m2x9qa`
- **What changes in storage:** what is created, changed, removed, re-routed, or marked out of date
- **What comes back:** the tool's reply, including any check results, with their level and whether they are new or already known (technical spec section 8)
- **What the user sees:** the chat message, option card, or itinerary change, including the day's schedule with times

Unless a change below says otherwise, today is March 1, 2027. The coordinator gets today's date at the start of each session (technical spec section 5.2).

Hours marked "assume" in the examples are planted for this test. Use them as if they came from Google, as each comment says.

## Changes to make along the way

The examples show only the finished state. Run these changes during the walk, at the point that makes sense, and trace everything each one sets off (technical spec section 3.5):

**San Francisco**

1. During discovery, the user says the trip ends at a friend's house and gives an address in Silver Lake.
2. Before the Monterey stay is filled, the user says, "No Sardine Factory, we didn't like it last time."
3. On the SLO hotel's option card, the user clicks "Higher tier," then selects one of the new options. Later, the user asks what the other hotels were, and says, "Take the second one."
4. After Day 1 is laid out, the user wants five hours at the Boardwalk instead of two.
5. After stops and lodging are selected, the user adds a night in Big Sur between Monterey and San Luis Obispo. They agree to move Point Lobos and Bixby Creek to the new day. Then they change their mind and remove the Big Sur night.
6. Later, the user says, "Let's try the Sardine Factory after all."
7. On May 8, 2027, the user opens the trip again in a new session.

**Moab**

1. During discovery, the user gives the start date, October 10, 2027, and a five-day trip.
2. During the fill, the user wants breakfast in Grand Junction before leaving on Day 1, and asks the agent to suggest a place.
3. The opening-hours check returns its check results for Fisher Towers, Delicate Arch, Milt's, and Gifford Homestead. Handle each one the way the docs say. For Milt's, the user asks to move it to the morning. For Gifford Homestead, the user first wants to keep it, then changes their mind and asks for a substitute. They don't remember the other pie places offered.
4. Day 4 goes over the 4-hour default. The user agrees to a longer day.
5. After the weather worker has run, the user moves the whole trip one day later, to start October 11.
6. The user drops Moab from 3 nights to 2, and accepts the shorter trip. Then they ask for a 5-hour hike in Arches on the morning of Day 2.
7. The user returns the next day and starts a new session (functional spec section 10.1). They ask "why did we pick that Moab hotel?" and "what's left to decide?"
8. On October 6, 2027, the user opens the trip again in a new session.
9. On October 12, 2027, the user opens the trip in a new session. They ask what time dinner is tonight, then ask to swap Desert Bistro for somewhere else.

## Make sure you cover

Walk these areas carefully rather than assuming they fit together:

- **The day's schedule:** start times from the trip brief and a day's own start time, set times and stops that follow, where free time goes, each stop's arrival and end, the drive after the last stop, a stop with no place selected yet, the stops after it, and a day that runs past midnight
- **Visit times:** where each stop's visit time comes from, and how it changes
- **The opening-hours check:** all four results, tested from the worked-out arrival, and the opening-hours approval, including when it stops applying
- **The "late for a set time" warning:** when it fires, and how the coordinator settles it without an approval
- **The stop-order check:** when it runs, which routes it compares, where its result is stored, and what the coordinator does with its note
- **Route preference and waypoints:** who sets waypoints and when, and how the route preference applies when the user's own stops choose the road, as on San Francisco Day 1
- **Worker briefs:** what each worker's brief holds, including how a worker learns roughly when an empty stop happens, and a purpose that says how long
- **The leg scout:** how its along-leg search behaves when few stops on the leg are selected yet, which places near the ends it drops, and how detour times are worked out
- **Which worker fills which stop,** how each stop's search area decides it, stops near the start or end place, and when a stay or leg needs no worker at all
- **Kinds of day:** a day that stays put, a rest day with a stop, and the last day with no stay
- **Approvals on days and stops:** drive hours, route type, and opening hours
- **Trip length and tiers:** the "trip length vs the brief" warning and the "stay tier set for different nights" note, when each fires and how the coordinator settles it
- **Check results:** warning or note, new or already known, what a write returns about parts of the trip it didn't change, a warning whose approval stops applying, the list saved with the trip, when the coordinator raises them, what it mentions at the start of a new session, and what it says when asked "what's left to decide?"
- **Must-sees:** single places selected before the fill, what the coordinator checks for a place the user names, and must-sees that are areas, roads, or activities
- **Adding, moving, or removing a stay or a night** that still has stops on it, including moving a stop along the leg to another day, and undoing a new stay after stops were moved onto it
- **What re-routes a leg,** and what only changes the schedule
- **Rejecting places:** a selected place, a place never offered, a reason about the date rather than the place, looking up a rejected place again, and what the next option card shows
- **Option cards after a pick:** what happens to the card, and how the user sees and picks earlier options
- **A trip that has started:** what the coordinator can still do, and what it says when asked for a change
- **Reads scoped to a day, stay, or stop,** and what each write returns
- **Budget tiers:** how the coordinator turns the user's rules into a tier for each lodging and meal stop, and what a place the user named shows
- **Weather:** when the weather round runs, what the weather text records, when it goes out of date, a stay added after the weather round, and the "forecast now available" note

Memory design is deferred. Note where the coordinator would read or write memory, but don't design how memory works.

## When the docs don't say

Don't fill a gap quietly. When the docs are silent, contradict each other, or a tool can't express what's needed:

1. Log it as a finding.
2. Pick the most plausible assumption, label it as an assumption, and keep walking.

Don't edit anything in `design/`. I sign off on design changes before they go in. Propose changes in your findings instead.

## What to write

Write your results to `scratch/walkthrough-findings-6.md`. The `scratch/` folder isn't committed. Use three sections:

1. **Findings.** Most important first. For each one: what happened in the walk, with a concrete example; which doc and section it touches, by document name and section number; and two or three options with your recommendation. Tag each one as **needs a decision**, **wording fix**, or **for the object model**.
2. **Properties and rules touched.** A plain list of every property and rule the walk relied on, grouped by object, such as trip, itinerary, stay, day, leg, stop, candidate, place, approval, check result, and trip brief. Mark any that the docs don't mention. This is the starting material for the object model.
3. **Step log.** The step-by-step walk for each trip, kept short. A numbered list or a table is fine.

Write in plain language. Name the document with every section number, such as "technical spec section 8," and use the docs' own terms, such as "check results" and "candidate set."

When you're done, tell me in chat what the five most important findings are, in plain language. I'll go through the rest in the file. Also say whether any tool call you tried was denied.
