# Road Trip Planner: Technical Specification (MVP)

This document covers how the app works under the hood. So far it covers the agents: which agents exist, what each one does, which tools each one gets, and what goes in each agent's instructions. Sessions, memory, and other parts will be added as they are designed. It is written at the level of design, not of any one SDK's configuration. For the planning behavior it implements, see the [functional spec](functional-spec.md). For the tools' data sources, see the [data sources index](data-sources.md).

---

## 1. Overview

One **coordinator** agent talks to the user for the whole trip. It sends research to **worker** subagents and keeps the conversation, the itinerary, and memory to itself.

| Agent | Talks to the user | Writes the itinerary | Writes memory | Runs |
|---|---|---|---|---|
| Coordinator | Yes | Yes | Yes | For the whole session |
| Stop researcher | No | No | No | Once per stop, in parallel |
| Leg scout | No | No | No | Once per leg, in parallel |
| Weather and clothing | No | No | No | Once per trip, after the fill round |

A worker is called like a tool. It gets a brief, does its work, and returns one result. It can't ask the user anything. If it needs a decision, it says so in its result, and the coordinator asks.

---

## 2. Decisions

- **No separate interview agent, for now.** We considered an agent that scopes the trip with the user, then hands a summary to the coordinator once and ends. Discovery and refinement mix too often for a split to pay off yet (functional spec 5.3: the user can jump around). Revisit it if the coordinator's discovery turns out weak. If it is added later, the summary it hands over is the trip brief in section 4.3, so the coordinator doesn't change.
- **Workers save candidates to a store and return a short summary.** Full place details go to the store and from there to the option cards. The coordinator sees only IDs and one line per option (section 6).
- **Mechanical feasibility checks run in code.** The itinerary write tool checks every change and returns any broken rules (section 7). The agent handles the judgment: which trade-offs to offer.
- **The coordinator resolves budget rules into a tier before briefing a worker.** A worker gets "mid-range, from rule: 2+ nights", never the rule text (section 8).

---

## 3. How a trip is planned

### 3.1 Anchors and stretches

Every trip has **anchors**: start, end, must-sees, and sometimes a named road. Between two anchors is a **stretch**. On each stretch, one of two things is fixed:

- **The road is fixed.** Example: Pacific Coast Highway. The agent finds stops along it, using the along-leg place search.
- **The places are fixed.** Example: Texas barbecue. The agent picks the towns first, then works out the route, using region place search and the routing tool's stop ordering.

The coordinator decides which kind each stretch is during discovery and records it in trip memory. One trip can mix both.

### 3.2 Rounds

Planning goes from broad to narrow. This is the usual order in which the coordinator works through the planning activities in functional spec 5.3. The user can still move to any of them at any time.

1. **Discovery.** The coordinator establishes the items in functional spec 5.2, a few questions at a time.
2. **Shape.** The coordinator offers two or three sketches of the trip in plain chat. Each sketch is a name, the rough path, and a few sentences on why someone would pick it. Example: "A loop out of Austin through the Hill Country, 7 days" vs "One-way from Dallas to Houston, through Lockhart and Taylor."
   - Sketches come from the model's own knowledge, not from research. The coordinator makes one routing call per sketch to get a rough total drive time, so it doesn't pitch a trip that can't work.
   - Seasonal closures and hazards at this stage also come from the model's own knowledge. Workers confirm them later with real data.
   - Skip this round when the user already gave a fixed route.
3. **Skeleton.** For the chosen shape: stops, destination or waystation, nights per stop, legs with drive times, and dates if only a window was given. The coordinator builds this itself with the routing and place tools, and writes it to the itinerary.
4. **Fill.** The coordinator briefs one stop researcher per stop and one leg scout per leg, all at once. When they return, it attaches their candidate sets to itinerary slots as proposed options.
5. **Weather and clothing.** After the fill, because clothing advice depends on the planned activities.
6. **Refine.** Changes from chat or option card actions. "More options", "Higher tier", and "Lower tier" each send one stop researcher for that one slot.

---

## 4. Coordinator

### 4.1 Tools

- **Itinerary:** read the itinerary. Write changes to stops, legs, days, slot assignments, and selections. Every write returns the feasibility check results (section 7).
- **Trip brief:** read the trip brief, and update an item in it. Every update returns the feasibility check results (section 7), since items like max driving hours affect them.
- **Memory:** read, add, update, and forget items in user memory and trip memory.
- **Candidate store:** read a candidate's full record by ID, when the short line isn't enough (6.2).
- **Places:** find a named place (to resolve a town or a must-see).
- **Routing:** compute a route, with stop ordering. Returns times and distances only. The route line goes to the UI.
- **Workers:** call the stop researcher, leg scout, and weather and clothing workers.

The coordinator has no place search for hotels, restaurants, or attractions, and no web search. That work belongs to workers, which keeps place results out of the coordinator's context.

### 4.2 Instructions

The coordinator's instructions cover:

- **Conduct** (functional spec 5.4): explain trade-offs plainly, never say or imply anything is booked, stay on trip planning.
- **What to establish** (functional spec 5.2), and to confirm values from user memory instead of asking again.
- **Memory precedence** (functional spec 10.4): the current conversation, then trip memory, then user memory. When the user contradicts user memory, ask whether it applies to this trip only.
- **The planning method:** anchors and stretches (3.1) and the rounds (3.2).
- **When to send work to a worker,** and how to write a brief (4.3).
- **How to handle broken feasibility rules** (functional spec 6.2): say which rule fails and by how much, then offer two or three trade-offs.
- **Budget tiers:** how to turn the user's rules into a tier per slot (section 8).

### 4.3 Trip brief and worker briefs

The coordinator keeps the **trip brief** (functional spec 5.2) current with the trip brief tools (4.1).

A **worker brief** is the part of the trip brief one worker needs:

- The stop or leg, dates, nights, and stop type
- The slots to fill, each with its resolved tier and the rule that produced it
- Interests, must-sees, and meal preferences that apply here
- Places to leave out: options already shown for the slot, and rejected options with the reason ("no parking")
- The worker's tool-call limit (section 5.4)

Workers never see raw user memory or anything about the user beyond the brief.

---

## 5. Workers

### 5.1 Stop researcher

Finds candidates for one stop's hotel, meals, and attractions.

- **Tools:** place search (hotels, restaurants, attractions near a point), the NPS tools (find the park, park conditions, things to see), and web search, both general and limited to Atlas Obscura.
- **Instructions:** fit candidates to the brief's interests and tiers. Three options per slot (functional spec 7.5). Attractions carry a visit time, labeled as an estimate when it doesn't come from NPS. Check hours against the dates, and say plainly when hours are unconfirmed. The web search rules from the [web search design](data-sources-web-search.md) apply.
- **Returns:** per slot, the candidate IDs with one line each, plus any problems found. Example: "Must-see is closed on these dates."

### 5.2 Leg scout

Finds notable stops along one leg.

- **Tools:** the along-leg place search, and web search limited to Atlas Obscura for towns the leg passes through.
- **Instructions:** fit stops to the brief's interests. Give each one's detour time, labeled as a rough figure.
- **Returns:** candidate IDs with one line each.

### 5.3 Weather and clothing

Writes weather and clothing guidance per stop (functional spec 8).

- **Tools:** the Google Weather forecast for dates within 7 days, the Open-Meteo seasonal averages tool otherwise, and NPS park conditions for alerts within 7 days.
- **Instructions:** label each stop as forecast or seasonal averages. Tie clothing advice to the planned activities in the brief. Short advice, not a packing list.
- **Returns:** the per-stop weather and clothing text, which is small. The coordinator writes it to the itinerary.

### 5.4 Rules for all workers

- **A tool-call limit per brief.** Google's free tier is about 33 rated place searches a day (Google design, section 5). The limit is a setting.
- **No user contact and no memory access.** A question for the user goes in the result.
- **Candidates go to the store, not into the result** (section 6).

---

## 6. Candidate store

Workers write each candidate to the store. Each record holds:

- A unique candidate ID (6.1)
- The full place details the tool returned (Google design, section 6), including Google's place ID when there is one
- Tier, and the rule that produced it
- **Rationale:** one or two sentences on why it was picked, tied to the user's preferences. The UI shows it as a tooltip on the option card. The coordinator reads it when the user asks "why that one?"
- Source link and notes (functional spec 7.5)

The coordinator attaches a candidate set to an itinerary slot. The UI reads the full records from the store to draw the option cards. Selected candidates keep their rationale and source (functional spec 7.6).

### 6.1 Candidate IDs

- **The store gives each candidate a unique ID,** such as a UUID. It is unique across all trips, so Austin's hotel options can never be confused with Dallas's.
- **A candidate ID is not a place ID.** A candidate is one place offered for one slot, with its own tier and rationale. The same hotel can be a candidate on two trips. Google's place ID stays in the record, and is used to leave out places the user has already seen.
- **Users never see IDs.** They refer to a place by name ("the Van Zandt") or position ("the second one"). The coordinator maps that to an ID. Each slot keeps its options in order, so "the second one" has one meaning.
- **Tools reject bad IDs.** An ID that doesn't exist, or that belongs to a different slot, returns an error. The tool never guesses.

### 6.2 What the coordinator sees

The coordinator never sees full place records, such as hours tables, coordinates, review links, and long summaries. It does see each place's name and a short line about it, so it can follow the conversation when the user names a place.

- **Worker results:** each option's line includes its ID, name, and gist. Example: "Hotel Van Zandt, mid-range, 4.6 stars, on Rainey Street, walkable to the barbecue spots."
- **Option card actions:** a Select click reaches the coordinator as a message with the same line, not only the ID. Example: "User selected Hotel Van Zandt for the Austin hotel." The coordinator then calls the select tool and confirms in chat (functional spec 7.5).
- **Reading the itinerary:** the read tool returns the name and line for every selected and proposed item, with proposed options in card order. In a new session (functional spec 10.1) this is all the coordinator knows about the trip's places.
- **Anything more,** such as "is it open Mondays?", comes from reading the full record from the store by ID.

---

## 7. Feasibility checks in code

The itinerary write tool runs these checks after every change and returns a list of broken rules:

- **Trip length:** 14 days or fewer. A hard limit, with no exceptions.
- **Daily driving:** road time plus a buffer for fuel, meals, and stops fits the user's max hours. The buffer is a setting. Max hours is a preference, so a day can have an exception (below).
- **Opening hours:** each scheduled attraction and meal is open during its time block, using the weekly hours stored with the candidate. This is not a preference. A closed place is always flagged.

**Exceptions** (functional spec 6.2). When the user agrees to a longer driving day, the coordinator records an exception on that day with the hours the user agreed to and the reason. The driving check skips that day unless its drive time goes over the agreed hours. A leg that uses the fastest route against a scenic default records the same way, on the leg, with the reason. Route choice has no check of its own.

The checks that need judgment stay with the agent: must-sees vs days, seasonal risks, and choosing dates in a window.

---

## 8. Budget tiers

The coordinator turns the user's natural-language rules into a tier for each slot before briefing a worker. Example: the user says "value by default, mid-range for stops of 2+ nights." A 2-night stop's hotel slot is briefed as "mid-range, from rule: 2+ nights." The worker searches at that tier and stores the tier and rule with each candidate. That is where the card's "which rule produced it" comes from (functional spec 7.1).

---

## 9. Open questions

1. **Brief and result formats.** Section 4.3 lists the contents, not the exact fields. Settle them during development.
2. **Tool-call limits.** The numbers per worker, given the daily Google limits.
3. **A reviewer.** A later worker that reads the finished itinerary with fresh eyes and checks it against the trip brief. Not in the MVP.
4. **An interview agent.** See section 2.
