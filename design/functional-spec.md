# Road Trip Planner: Functional Specification (MVP)

Functional behavior only. No models, harness, tools, or data sources are specified here.

**Convention.** Items marked **Assumption** are defaults filled in during drafting. Confirm or change them before development.

---

## 1. Purpose

A web application where a signed-in user plans a road trip within the contiguous United States by talking with an AI agent. The agent turns anything from a vague idea ("barbecue in Texas, a week") to a fixed route ("Pacific Coast Highway, San Francisco to Los Angeles") into a feasible, day-by-day itinerary with lodging, dining, attractions, expected weather, and clothing guidance.

Planning only. The application never books, reserves, or purchases anything.

---

## 2. Scope

### MVP

- Account sign-up, sign-in, sign-out
- Conversational trip planning with the agent
- Feasibility checking (driving time, seasonality, must-sees vs days)
- Recommendations for lodging, restaurants, and attractions, presented as selectable option cards
- Budget tiers (value, mid-range, posh), with differentiated rules per stop. Prices are not shown
- Weather (forecast or seasonal averages) and clothing guidance
- Itinerary view: summary, map, stops, legs, daily schedule in time blocks
- Save trips, list trips, reopen trips
- Resume previous chat sessions, or start a new session on an existing trip
- User memory (across trips) and trip memory (within a trip), viewable and forgettable by the user
- Trips of up to 14 days

### MVP+1

- Multiple saved versions of a trip, and side-by-side alternatives with an agent comparison

### Out of scope

- Booking, reservations, payments
- Rental cars, flights, or any travel to or from the start and end points
- Travel outside the contiguous US (no Canada, Mexico, Alaska, Hawaii)
- In-trip mode (live changes on the road, location awareness, proactive alerts)
- Sharing trips or collaborating with travel companions
- Kids, pets, and accessibility planning
- Trips longer than 14 days
- Avoid-tolls or avoid-highways routing
- Direct manual editing of the itinerary
- Exports (PDF, calendar, map links)
- Showing prices or nightly rates. Recommendations show a budget tier only
- Seasonal road and pass closures

---

## 3. Users and accounts

- One account per person. Each trip belongs to exactly one user and is visible only to that user.
- A trip covers one travel party of one or more adults.
- **Home screen:** list of the user's trips (name, region, dates or duration, last updated), a "New trip" action, and the ability to open any trip.

---

## 4. Core concepts

| Term | Meaning |
|---|---|
| Trip | The persistent plan. Owns one itinerary, one trip memory, and many sessions |
| Itinerary | The structured plan the agent builds: stops, legs, days, selections |
| Stop | An overnight location. Either a **destination** (multi-night, to explore) or a **waystation** (usually one night, to break up driving). One hotel per stop regardless of nights |
| Leg | The drive between two stops, with duration, distance, and points of interest along the way |
| Day | One calendar day of the trip, split into morning, afternoon, and evening time blocks |
| Recommendation | A suggested hotel, restaurant, or attraction, with its rationale and source |
| Option card | The UI element presenting a set of recommendations for one slot, with selection actions |
| Budget tier | Value, mid-range, or posh. A relative price level the agent infers. Shown instead of prices |
| Session | One conversation with the agent about one trip |
| User memory | Durable facts and preferences about the user, applied to every trip |
| Trip brief | The structured facts about what the user wants from one trip: the items in section 5.2 |
| Trip memory | Facts and decisions about one trip that do not belong in the trip brief or the itinerary |

**Relationships.** A user has many trips. A trip has one itinerary, one trip brief, one trip memory, and many sessions. User memory spans all of that user's trips.

---

## 5. Planning conversation

### 5.1 Entry points

The agent handles all of these:

- **Specific route:** "Pacific Coast Highway from San Francisco to Los Angeles over five days."
- **Theme and region:** "I want to explore highly rated barbecue in Texas over seven days."
- **Loose idea:** "Somewhere warm with good hiking in March, about a week."

### 5.2 Trip brief

The trip brief holds the items below. The agent establishes each one, whether or not the user volunteers it. When user memory already holds a value, the agent confirms it instead of asking from scratch.

| Item | Required | Notes |
|---|---|---|
| Region, route, or theme | Yes | |
| Start and end points | Yes | One-way or loop. Agent suggests if the user has no preference |
| Dates | Yes | Exact dates, a window ("sometime in May"), or duration only. Maximum 14 days. No limit on how far ahead |
| Party | Yes | Number of adults and who they are ("my wife and me", "us plus another couple"). Defaults from user memory; can differ per trip |
| Interests and must-sees | Yes | Includes why they matter to the user. Asked even when the user gives a precise route |
| Max driving hours per day | Yes | Expressed in hours, not miles. A default for the trip, not a hard limit. A day can go over it when the user agrees |
| Route preference | Yes | Scenic or fastest. A default for the trip. A leg can differ when the user agrees |
| Rest days | No | Days with no driving |
| Budget posture | Yes | Default tier plus any rules (section 7.1) |
| Meal preferences | Yes | Hotel breakfast vs local food scene, cuisines, food interests |

### 5.3 Planning activities

Planning a trip involves the activities below. They are not steps in a fixed order, and not every trip needs all of them. The agent moves between them as the conversation needs. The user can return to any of them at any time.

| Activity | What the user gets |
|---|---|
| Discovery | The agent establishes the items in 5.2. It asks a few questions at a time, and doesn't hold back a first proposal until every item is answered |
| Shape | When the route is open, two or three short sketches of the trip to choose from. Each has a name, the rough path, and a few sentences on why someone would pick it. Not offered when the user gives a fixed route |
| Skeleton | Start, end, stops (destination or waystation), nights per stop, legs with drive times, and recommended dates if only a window was given |
| Feasibility | The checks in section 6, with conflicts resolved with the user |
| Fill | Lodging, attractions, and dining for each stop and day, through option cards |
| Weather and clothing | Section 8 |
| Refine | Changes through chat or option card actions |

After any change, the agent re-checks feasibility for the affected days.

### 5.4 Agent conduct

- Suggests trip length, start and end points, and nights per stop when the user has no preference, and explains why.
- Explains trade-offs in plain language rather than making silent choices.
- Never states or implies that anything is booked or reserved.
- Stays on the topic of trip planning; politely redirects unrelated requests.

---

## 6. Feasibility checking

### 6.1 Checks

- **Daily driving:** each driving day's road time fits within the user's max hours, unless the user has agreed to a longer day. **Assumption:** the agent adds a buffer for fuel, meals, and short stops rather than treating max hours as pure road time.
- **Must-sees vs days:** all must-sees fit within the trip, given drive time and time needed at each.
- **Seasonality:** attractions closed off-season, and operating days and hours that conflict with the scheduled time block. Seasonal road closures are out of scope.
- **Seasonal risks:** for example, hurricane season, extreme heat, or snow.
- **Date windows:** when the user gives a window, the agent recommends specific dates within it, considering the checks above.
- **Trip length:** the trip is 14 days or fewer. When the user asks for more, the agent explains the limit and proposes a 14-day version (fewer stops, or a shorter route).

### 6.2 When a plan is infeasible

The agent:

1. States which constraint fails and by how much (for example, "Day 3 needs about 9 hours of driving against your 6-hour daily preference").
2. Proposes two or three trade-offs, such as adding a day, dropping or reordering stops, accepting a longer driving day, or switching from scenic to fastest for one leg.
3. Lets the user pick, through option cards or chat.
4. When the user accepts an exception, such as a longer driving day or the fastest route on one leg, records it on that day or leg, with the reason. It doesn't raise it again unless a later change makes that day longer than the user agreed to. For example, the user agrees to 6 hours on the last day. If a later change makes that day 7 hours, the agent asks again.

---

## 7. Recommendations

### 7.1 Budget tiers and rules

- Three tiers: **value**, **mid-range**, **posh**. The agent infers a place's tier from descriptions, reviews, and listing signals, such as a "$$" price level when the data includes one.
- Option cards show the tier only. They never show prices or nightly rates.
- Tiers apply to lodging and dining. **Assumption:** attractions have no tier.
- The user sets a **default tier** for the trip early in the conversation.
- The user can add **rules** in natural language, and the agent applies its judgment. Examples:
  - "One-night waystations: value. Cities where we stay two or more nights: mid-range."
  - "Posh in Savannah, value everywhere else."
  - "One special dinner on the last night."
- Each recommendation shows which tier it is and which rule produced it.

### 7.2 Lodging

- One hotel per stop, regardless of nights.
- Location matters: for destinations, near what the user wants to see; for waystations, convenient to the route.

### 7.3 Dining

- Restaurants are placed into time blocks on each day.
- The agent asks about breakfast (hotel or local) and other meal habits, and applies the answer.
- Interest-driven trips (for example, barbecue) treat restaurants as attractions in their own right.
- **Open question:** whether every meal gets a recommendation, depending on data availability (section 12).

### 7.4 Attractions and stops

- Driven by stated interests and must-sees.
- Includes scenic or notable stops along legs, not only at overnight stops.
- Each attraction carries an estimated time to spend and any seasonal or operating-hour notes.

### 7.5 Option cards

Each card set presents recommendations for one slot (a stop's hotel, a meal, an attraction choice). **Assumption:** three options per set.

Each option shows:

- Name, type, tier, and location
- Rating and review count, for restaurants and hotels. Attractions show them only where a rating means something. A national park or a historic plaque, for example, shows none. Which attractions qualify is settled during development
- Why it was recommended, tied to the user's stated preferences
- Source link for the underlying listing or review data
- Notes (seasonal hours, reservations advised)

Actions on the card set:

- **Select** an option
- **More options** in the same tier
- **Higher tier** / **Lower tier**

Selecting an option updates the itinerary, and the agent acknowledges the change in chat. The user can also select by chat ("take the second one").

### 7.6 Item status and rationale

- Every itinerary slot is either **proposed** (options shown, nothing chosen) or **selected**.
- Selected items keep their rationale and source, viewable from the itinerary later. This serves both the user ("why did we pick this?") and the developer reviewing agent choices.

---

## 8. Weather and clothing guidance

- **Forecast** for dates within 7 days, subject to what forecast data is available.
- **Seasonal averages** for each stop and time of year otherwise. The itinerary labels which one is shown.
- Per stop: typical highs and lows, precipitation likelihood, and notable risks.
- **Clothing guidance:** short, condition-specific advice on how to dress and what to bring, tied to the planned activities. For example, layers and a warm jacket for mountains in November; rain gear for a wet season; sun protection and water for desert hikes. This is guidance, not a full packing checklist.
- **Assumption:** when a user reopens a trip that has moved into the forecast range, the agent offers to replace averages with the forecast.

---

## 9. Itinerary view

Displayed alongside the chat. Read-only: only the agent changes it, in response to chat or option card actions.

### 9.1 Trip summary

Trip name, dates or duration, start and end, party, total driving time, number of stops, default budget posture and rules.

### 9.2 Map

- One overall view of the whole trip. No per-day filtering.
- Shows the route line, overnight stops, attractions, and restaurants, with distinguishable markers.
- Selecting a marker shows that item's details.

### 9.3 Stops

For each stop: type (destination or waystation), dates, nights, and lodging (proposed or selected).

### 9.4 Legs

For each leg: from, to, drive duration, distance, scenic or fastest, and notable stops along the way.

### 9.5 Daily itinerary

For each day: day number, date, location, and morning, afternoon, and evening blocks containing driving, attractions, and meals. Rest days are marked.

### 9.6 Weather and clothing

Section 8 content, per stop.

### 9.7 Units

Miles, Fahrenheit, and US date formats.

---

## 10. Sessions and memory

### 10.1 Sessions

- **Assumption:** every session belongs to a trip. Starting a new conversation from the home screen creates a new trip, which the agent names once the destination or theme is clear.
- From a trip, the user sees its sessions (date and short title) and can:
  - **Resume** a previous session. The transcript is restored and the agent continues with that conversation's context.
  - **Start a new session.** The agent starts from the current itinerary, trip memory, and user memory, without the earlier transcripts.

### 10.2 Trip memory

Trip memory holds what the user says that doesn't fit the trip brief or the itinerary. The agent carries it between sessions of one trip. Examples:

- Rejected options and why ("skipped Hotel X: no parking")
- Soft intentions ("wants one nice dinner in Austin")
- Open items to revisit ("decide whether to add Big Sur day")
- Personal history ("ate at this diner as a kid and wants to go back")
- Places to avoid ("stay out of this town")

### 10.3 User memory

Durable preferences that apply to every trip. Examples:

- Usual party makeup (for example, "usually my wife and me")
- Typical max driving hours and route preference
- Default budget posture and rules
- Meal habits ("prefer the local food scene over hotel breakfast")
- Recurring interests

The agent uses user memory to prefill section 5.2 and confirms rather than re-asks.

### 10.4 Isolation and precedence

- Trips, itineraries, sessions, user memory, and trip memory are strictly isolated per user. When user A is signed in, neither the agent nor the UI has access to user B's trips, itineraries, sessions, or memories.
- Precedence: the current conversation, then trip memory, then user memory. When the user says something that contradicts user memory, the agent asks whether it applies to this trip only or should update the user's standing preference.

### 10.5 Memory visibility

- The user can ask the agent what it remembers, at both the user level and the trip level, and the agent answers from its stored memory.
- The user can ask the agent to forget specific items. Forgotten items no longer influence recommendations.
- When the user asks what the agent knows about a trip, the agent gives both the trip brief and trip memory. Memory items can be forgotten. Trip brief items can be changed but not forgotten, because the agent needs them to plan.

---

## 11. Acceptance scenarios

**S1. Specific route.** User asks for the Pacific Coast Highway, San Francisco to Los Angeles. The agent still asks about interests, must-sees, dates, party, driving hours, and budget posture before proposing stops and nights.

**S2. Theme and region.** User wants Texas barbecue over seven days with no start or end in mind. The agent proposes a start and end (loop or one-way), stops, and drive times, with barbecue restaurants treated as primary attractions.

**S3. Infeasible plan.** User wants Seattle to Miami in five days at four hours of driving per day. The agent states the shortfall and offers trade-offs.

**S4. Seasonal conflict.** User wants a trip "sometime in January" that includes an attraction open only in summer. The agent flags that the attraction is typically closed then and proposes later dates or a substitute.

**S5. Differentiated tiers.** User sets value as the default and mid-range for any stop of two or more nights. Waystation hotel cards show value options; destination hotel cards show mid-range, with the applied rule visible.

**S6. Option card navigation.** On a hotel card, the user picks "Higher tier," then selects an option. The itinerary updates and the agent confirms in chat.

**S7. Resume and new session.** The user returns the next day. Resuming the prior session restores the conversation. Starting a new session, the agent knows the itinerary, the trip's open items, and the user's standing preferences.

**S8. User isolation.** User B signs in and starts a trip. The agent shows no knowledge of user A's preferences or trips.

**S9. Cross-trip memory.** On a second trip, the agent opens by confirming the user's usual driving hours and meal preferences rather than asking from scratch.

**S10. Per-trip override.** User memory says the usual party is the user and their spouse. On a new trip, the user says "just me this time." The agent plans for one adult, asks whether this changes the usual party, and leaves user memory unchanged when the user says it is a one-off. On the user's next trip, the agent again proposes the usual party.

---

## 12. Open questions

1. **Meal coverage.** Recommend every meal, or only lunch and dinner by default? Depends on data quality.
2. **Trip-level states.** Not included. Item-level proposed or selected status (7.6) covers the need. Revisit with versioning in MVP+1.
