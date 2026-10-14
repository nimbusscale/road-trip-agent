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
- Budget tiers (value, mid-range, posh), with differentiated rules per stay. Prices are not shown
- Weather (forecast or seasonal averages) and clothing guidance
- Itinerary view: summary, map, stays, legs, daily schedule with times
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
- Taking back a place the user rejected, within the same trip
- Changing a trip once it has started. From its start date on, the user can still open it and ask the agent about it, but nothing in it changes. A trip still unfinished by then stays as it is

---

## 3. Users and accounts

- One account per person. Each trip belongs to exactly one user and is visible only to that user.
- **Home screen:** list of the user's trips (name, dates, last updated), a "New trip" action, and the ability to open any trip.

---

## 4. Core concepts

| Term | Meaning |
|---|---|
| Trip | The persistent plan. Owns one itinerary, one trip memory, and many sessions |
| Itinerary | The structured plan of the road trip that the agent builds |
| Stay | An overnight location, for one or more nights. One lodging per stay regardless of nights, usually a hotel |
| Stop | A place the party visits during a day, such as a meal, an attraction, or a quick look along the way |
| Leg | The drive on one day, with duration, distance, and the day's stops along the way. It runs from where the party slept to where it sleeps that night. On a day that stays put, it starts and ends at the same stay |
| Day | One day of the trip, with a schedule: a start time, and a time for each stop and drive. A day can run past midnight, such as for stargazing |
| Night | A night the party spends at a stay. Every day but the last ends with one. A stay's nights are the days that end there. So a three-night stay in Moab covers three days, and the party leaves on the morning of a fourth |
| Last day | The final day of the trip. The party drives to the end point and doesn't spend a night anywhere on the trip. Every trip has one. A day trip is only the last day |
| Candidate | A hotel, restaurant, or attraction offered for a stay's lodging or a stop, with its rationale and source |
| Status | Where a stop, or a stay's lodging, is in being decided: **empty** (no options yet), **proposed** (options shown, nothing chosen), or **selected**. An empty or proposed stop has **no selected place**. It has no place to drive to, so it takes no time in the day's schedule. The timing rules say "no selected place" so they cover both |
| Option card | The UI element presenting a set of candidates for one choice (a stay's lodging or a stop), with selection actions |
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
| Focus | Yes | What the trip is about, such as a region, a route, or a theme. Examples: "Pacific Coast Highway," "Texas barbecue," "somewhere warm with good hiking" |
| Trip length | Yes | Number of days. Maximum 14 days |
| Interests and must-sees | Yes | Includes why they matter to the user. Asked even when the user gives a precise route |
| Max driving hours per day | Yes | Expressed in hours, not miles. A default for the trip, not a hard limit. A day can go over it when the user agrees |
| Route preference | Yes | Scenic or fastest. A default for the trip. A leg can differ when the user agrees |
| Rest days | No | Days with no driving, in the user's words, such as "one day off in Moab." The agent decides which days |
| Usual start time | No | When the party usually gets going each day. Defaults to 8 a.m. A day can start at another time when the user agrees, such as for a sunrise hike |
| Budget posture | Yes | Default tier plus any rules (section 7.1) |
| Meal preferences | Yes | Hotel breakfast vs local food scene, cuisines, food interests |

Discovery also settles the start and end points (one-way or loop, and the agent suggests them if the user has no preference) and an exact start date. It must be after today, with no limit on how far ahead. These go in the itinerary, not the trip brief. The trip brief holds what the user wants. The itinerary holds the plan. No fact is kept in both. The user must give a start date before the agent builds the skeleton. Planning without dates is out of the MVP.

### 5.3 Planning activities

Planning a trip involves the activities below. They are not steps in a fixed order, and not every trip needs all of them. The agent moves between them as the conversation needs. The user can return to any of them at any time.

| Activity | What the user gets |
|---|---|
| Discovery | The agent establishes the items in 5.2. It asks a few questions at a time, and doesn't hold back a first proposal until every item is answered |
| Shape | When the route is open, two or three short sketches of the trip to choose from. Each has a name, the rough path, and a few sentences on why someone would pick it. Not offered when the user gives a fixed route |
| Skeleton | Start, end, stays, nights per stay, and legs with drive times |
| Feasibility | The checks in section 6, with conflicts resolved with the user |
| Fill | Lodging, attractions, and dining for each stay and day, through option cards |
| Weather and clothing | Section 8 |
| Refine | Changes through chat or option card actions |

After any change, the agent re-checks feasibility for the affected days.

### 5.4 Agent conduct

- Suggests trip length, start and end points, and nights per stay when the user has no preference, and explains why.
- Explains trade-offs in plain language rather than making silent choices.
- Never states or implies that anything is booked or reserved.
- Stays on the topic of trip planning; politely redirects unrelated requests.

---

## 6. Feasibility checking

### 6.1 Checks

- **Daily driving:** each driving day's road time fits within the user's max hours, unless the user has agreed to a longer day. **Assumption:** the agent adds a buffer for fuel, meals, and short stops rather than treating max hours as pure road time.
- **Must-sees vs days:** all must-sees fit within the trip, given drive time and time needed at each.
- **Opening hours:** operating days and hours that conflict with the scheduled time of a visit. Code checks weekly hours only. Attractions closed off-season are left to the agent's judgment in the MVP. Seasonal road closures are out of scope.
- **Seasonal risks:** for example, hurricane season, extreme heat, or snow.
- **Trip length:** the itinerary has the number of days the user asked for. A different number is a warning. The trip is 14 days or fewer. When the user asks for more, the agent explains the limit and proposes a 14-day version (fewer stays, or a shorter route).

### 6.2 When a plan is infeasible

The agent:

1. States which constraint fails and by how much (for example, "Day 3 needs about 9 hours of driving against your 6-hour daily preference").
2. Proposes two or three trade-offs, such as adding a day, dropping or reordering stays or stops, accepting a longer driving day, or switching from scenic to fastest for one leg.
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
  - "One-night stays: value. Cities where we stay two or more nights: mid-range."
  - "Posh in Savannah, value everywhere else."
  - "One special dinner on the last night."
- Each candidate shows which tier it is and which rule produced it. A place the user named shows "your choice" instead.

### 7.2 Lodging

- One lodging per stay, regardless of nights.
- The agent recommends hotels only. The user can name any lodging instead, such as a friend's house or a campground (7.6).
- Location matters: for a stay of several nights, near what the user wants to see; for a one-night stay, convenient to the route.

### 7.3 Dining

- Restaurants are placed in each day's schedule.
- The agent asks about breakfast (hotel or local) and other meal habits, and applies the answer.
- Interest-driven trips (for example, barbecue) treat restaurants as attractions in their own right.
- **Open question:** whether every meal gets a recommendation, depending on data availability (section 12).

### 7.4 Attractions and stops

- Driven by stated interests and must-sees.
- Includes scenic or notable stops along legs, not only near where the party stays.
- Each attraction carries an estimated time to spend and any seasonal or operating-hour notes.

### 7.5 Option cards

Each card set presents candidates for one choice (a stay's lodging, or a meal or attraction stop). **Assumption:** three options per set.

Each option shows:

- Name, type, tier, and location
- Rating and review count, for restaurants and hotels. Attractions show them only where a rating means something. A national park or a historic plaque, for example, shows none. Which attractions qualify is settled during development
- Why it was recommended, tied to the user's stated preferences
- Source link for the underlying listing or review data
- Notes (seasonal hours, reservations advised)

Actions on the card set:

- **Select** an option
- **More options** in the same tier
- **Higher tier** / **Lower tier**, on lodging and meal cards only. Attractions have no tier. "Higher tier" is hidden at posh, and "Lower tier" at value

Selecting an option updates the itinerary, and the agent acknowledges the change in chat. The user can also select by chat ("take the second one"). Once an option is selected, the card closes. Later changes go through chat: the user can ask what else was offered, pick another option by name, ask for more options, or turn the pick down. A new card appears only when new options are offered, or when the user turns down the pick and other options are left. It shows the newest options. When the user passes on the pick only because of the date, such as "it's closed that day," the place isn't turned down, so no card appears. The agent lists the other options in chat instead.

### 7.6 Item status and rationale

- Every stop, and every stay's lodging, is **empty** (no options yet), **proposed** (options shown, nothing chosen), or **selected** (section 4, Status).
- The user can also name a place directly, such as a restaurant they already want or a friend's house to stay at. The agent looks it up and marks it selected, with no option cards. Its rationale is that the user chose it.
- Selected items keep their rationale and source, viewable from the itinerary later. This serves both the user ("why did we pick this?") and the developer reviewing agent choices.

---

## 8. Weather and clothing guidance

- **Forecast** for dates within 7 days, subject to what forecast data is available.
- **Seasonal averages** for each stay and time of year otherwise. The itinerary labels which one is shown.
- Per stay: typical highs and lows, precipitation likelihood, and notable risks.
- **Clothing guidance:** short, condition-specific advice on how to dress and what to bring, tied to the planned activities. For example, layers and a warm jacket for mountains in November; rain gear for a wet season; sun protection and water for desert hikes. This is guidance, not a full packing checklist.
- **Assumption:** when a user reopens a trip that has moved into the forecast range, the agent offers to replace averages with the forecast.

---

## 9. Itinerary view

Displayed alongside the chat. Read-only: only the agent changes it, in response to chat or option card actions.

### 9.1 Trip summary

Trip name, dates, start and end, total driving time, number of stays, default budget posture and rules.

### 9.2 Map

- One overall view of the whole trip. No per-day filtering.
- Shows the route line, stays, attractions, and restaurants, with distinguishable markers.
- Selecting a marker shows that item's details.

### 9.3 Stays

For each stay: dates, nights, and lodging (proposed or selected).

### 9.4 Legs

For each leg: from, to, drive duration, distance, and notable stops along the way. A leg shows scenic or fastest only when the user chose a different route for that day than for the trip, with the reason.

### 9.5 Daily itinerary

For each day: day number, date, location, start time, and its schedule: drives, attractions, and meals, each with a time, and the free time between them. Rest days are marked. The times are a plan, worked out from average drive times and estimated visit times.

### 9.6 Weather and clothing

Section 8 content, per stay.

### 9.7 Units

Miles, Fahrenheit, and US date formats.

---

## 10. Sessions and memory

### 10.1 Sessions

- **Assumption:** every session belongs to a trip. Starting a new conversation from the home screen creates a new trip, which is named once the trip's focus is clear. The name is built from the trip brief's focus and the start month, such as "Pacific Coast Highway, May 2027." Renaming a trip is not in the MVP.
- From a trip, the user sees its sessions (date and short title) and can:
  - **Resume** a previous session. The transcript is restored and the agent continues with that conversation's context.
  - **Start a new session.** The agent starts from the current itinerary, the trip brief, trip memory, and user memory, without the earlier transcripts.
- **Not supported:** two sessions of one trip open at the same time, such as in two browser tabs or on two devices. Nothing stops it, but a session that stays open doesn't learn about changes made in the other one. Only the trip's owner can see it (10.4), so this is one user with two sessions open, never two users.

### 10.2 Trip memory

Trip memory holds what the user says that doesn't fit the trip brief or the itinerary. The agent carries it between sessions of one trip. Examples:

- Rejections that aren't about one place ("no chain restaurants"). A rejected place is kept with the trip itself and never offered again
- Why the user chose an option, when they say ("picked the one with the pool")
- Soft intentions ("wants one nice dinner in Austin")
- Open items to revisit ("decide whether to add Big Sur day")
- Personal history ("ate at this diner as a kid and wants to go back")
- Places to avoid ("stay out of this town")

### 10.3 User memory

Durable preferences that apply to every trip. Examples:

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

**S1. Specific route.** User asks for the Pacific Coast Highway, San Francisco to Los Angeles. The agent still asks about interests, must-sees, dates, driving hours, and budget posture before proposing stays and nights.

**S2. Theme and region.** User wants Texas barbecue over seven days with no start or end in mind. The agent proposes a start and end (loop or one-way), stays, and drive times, with barbecue restaurants treated as primary attractions.

**S3. Infeasible plan.** User wants Seattle to Miami in five days at four hours of driving per day. The agent states the shortfall and offers trade-offs.

**S4. Seasonal conflict.** User plans a trip starting January 15 that includes an attraction open only in summer. The agent flags that the attraction is typically closed then and proposes later dates or a substitute. In the MVP this comes from the agent's judgment, not a code check (technical spec section 8).

**S5. Differentiated tiers.** User sets value as the default and mid-range for any stay of two or more nights. Hotel cards for one-night stays show value options; cards for longer stays show mid-range, with the applied rule visible.

**S6. Option card navigation.** On a hotel card, the user picks "Higher tier," then selects an option. The itinerary updates and the agent confirms in chat.

**S7. Resume and new session.** The user returns the next day. Resuming the prior session restores the conversation. Starting a new session, the agent knows the itinerary, the trip's open items, and the user's standing preferences.

**S8. User isolation.** User B signs in and starts a trip. The agent shows no knowledge of user A's preferences or trips.

**S9. Cross-trip memory.** On a second trip, the agent opens by confirming the user's usual driving hours and meal preferences rather than asking from scratch.

**S10. Per-trip override.** User memory says the user usually drives up to 6 hours a day. On a new trip, the user says "only 4 hours a day this time." The agent plans for 4 hours, asks whether this changes their usual limit, and leaves user memory unchanged when the user says it is a one-off. On the user's next trip, the agent again proposes 6 hours.

---

## 12. Open questions

1. **Meal coverage.** Recommend every meal, or only lunch and dinner by default? Depends on data quality.
2. **Trip-level states.** Not included. Item-level proposed or selected status (7.6) covers the need. Revisit with versioning in MVP+1.
