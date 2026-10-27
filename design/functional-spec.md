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

- Sign-in and sign-out. There's no sign-up: the admin adds each account (section 3)
- Conversational trip planning with the agent
- Feasibility checking (driving time, seasonality, must-sees vs days)
- Recommendations for lodging, restaurants, and attractions, presented as selectable option cards
- Budget tiers (value, mid-range, upscale), which say what each recommended hotel or restaurant is like. Prices are not shown
- Weather (forecast or seasonal averages) and clothing guidance
- Itinerary view: summary, map, stays, legs, daily schedule with times
- Save trips, list trips, reopen trips, delete trips
- Download a trip's brief and itinerary as a text file (10.1)
- Resume previous chat sessions, or start a new session on an existing trip
- User memory (across trips) and trip memory (within a trip), viewable and forgettable by the user, in the chat and in the chat view's memory list
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
- Exports other than the text downloads (PDF, calendar, map links)
- Showing prices or nightly rates. Recommendations show a budget tier only
- Seasonal road and pass closures
- Taking back a place the user rejected, within the same trip
- Carrying a dislike of one specific place to later trips. The agent keeps the reason instead, when it applies beyond that place (section 10.3)
- Changing a trip, or talking to the agent about it, once it has started. From its start date on, the chat is closed: no session can be started or resumed. The user can still open the trip and view its itinerary, read only. A trip still unfinished by then stays as it is

---

## 3. Users and accounts

- One account per person. Each trip belongs to exactly one user and is visible only to that user.
- The admin adds each account, with a password. Nobody can sign up on their own. A user signs in with their email and password.
- **Home screen:** list of the user's trips (name, dates, last updated), a "New trip" action, the ability to open any trip, and "Delete trip" next to each one (10.1). Under the list, the line that says whether turn traces reach Phoenix (10.1).

---

## 4. Core concepts

| Term | Meaning |
|---|---|
| Trip | The persistent plan. Owns one itinerary, one trip memory, and many sessions |
| Itinerary | The structured plan of the road trip that the agent builds |
| Stay | An overnight location, for one or more nights. One lodging per stay regardless of nights, usually a hotel |
| Stop | A place the party visits during a day, such as a meal, an attraction, or a quick look along the way. Checking in at the stay before a later stop, such as an evening event, is a stop too |
| Leg | The drive on one day, with duration, distance, and the day's stops along the way. It runs from where the party slept to where it sleeps that night. On a day that stays put, it starts and ends at the same stay |
| Day | One day of the trip, with a schedule: a start time, and a time for each stop and drive. A day can run past midnight, such as for stargazing |
| Night | A night the party spends at a stay. Every day but the last ends with one. A stay's nights are the days that end there. So a three-night stay in Moab covers three days, and the party leaves on the morning of a fourth |
| Last day | The final day of the trip. The party drives to the end point and doesn't spend a night anywhere on the trip. Every trip has one. A day trip is only the last day |
| Candidate | A hotel, restaurant, or attraction offered for a stay's lodging or a stop, with its rationale and source |
| Status | Where a stop, or a stay's lodging, is in being decided: **empty** (no options yet), **proposed** (options shown, nothing chosen), or **selected**. An empty or proposed stop has **no selected place**. It has no place to drive to, so it takes no time in the day's schedule. The timing rules say "no selected place" so they cover both |
| Option card | The UI element presenting a set of candidates for one choice (a stay's lodging or a stop), with selection actions |
| Budget tier | Value, mid-range, or upscale. What a hotel or restaurant is like, which the agent judges for each place it recommends (section 7.1). Shown instead of prices |
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
| Comfortable driving hours per day | Yes | Expressed in hours, not miles. A default for the trip, not a hard limit. A day can go over it when the user agrees. The app has a daily driving maximum that no day can go over, even with the user's agreement. The agent also has a recommended figure. When the user gives more than that, the agent checks that they mean it, and pushes back, since more means most of the day in the car, with little time to see anything |
| Route preference | Yes | Scenic or fastest. A default for the trip. A leg can differ when the user agrees |
| Rest days | No | Days with no driving, in the user's words, such as "one day off in Moab." The agent decides which days |
| Usual start time | No | When the party usually gets going each day. Defaults to 8 a.m. A day can start at another time when the user agrees, such as for a sunrise hike |
| Meal preferences | Yes | Hotel breakfast vs local food scene, cuisines, food interests, and how much the user likes to spend on food. In the user's words, such as "foodies, willing to splurge on good food, especially lobster" |
| Lodging preferences | Yes | What the user wants from places to stay, in their words, such as "something mid-tier in Bar Harbor, upscale OK in Camden and Portland, a B&B could be a good option in one of them" (section 7.2) |

There's no item for a total trip budget, such as "under $3,000." The app never shows prices (7.1), so the agent says it can't plan to one. A preference for free activities goes in interests, since attractions have no tier. A lodging wish that comes up later in the chat, after discovery, goes in trip memory, or in user memory when it's a standing preference (section 10).

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

- **Daily driving:** each driving day's road time fits within the user's comfortable driving hours, unless the user has agreed to a longer day. **Assumption:** the agent adds a buffer for fuel, meals, and short stops rather than treating those hours as pure road time.
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

### 7.1 Budget tiers

- Three tiers: **value**, **mid-range**, **upscale**. A tier says what a place is like, not how it compares with the places around it:
  - **Value** is simple and clean: a budget chain motel, such as a Super 8, or a basic independent motel. For food, counter service, a diner, or a food truck.
  - **Mid-range** is comfortable, with more service: a mainstream chain hotel, such as a Hampton Inn or a Courtyard, or a well-reviewed independent inn. For food, a typical sit-down restaurant.
  - **Upscale** is a boutique hotel, a resort, or a top-rated inn or B&B. For food, a chef-driven restaurant where a reservation is wise.
- The agent judges each place's tier from its description, reviews, and listing. For restaurants, the price level is a guide, not a rule: $ usually means value, $$ mid-range, and $$$ or more upscale. When it's missing, or disagrees with what the place is like, the description decides.
- Tiers apply to lodging and dining. **Assumption:** attractions have no tier.
- **A tier is a label, not a target.** What the agent looks for comes from the user's own words: their meal and lodging preferences (5.2), and what they say later. Real budget wishes don't fit three boxes. Examples:
  - "We're foodies, willing to splurge on good food" is about quality, not how fancy a place is. The best lobster roll in Maine may come from a shack with counter service, which is value.
  - "Mid-range for stays of two or more nights, value otherwise."
  - "A B&B could be a good option in Camden or Portland" means one of the two towns, not both.
- Option cards show each option's tier. They never show prices or nightly rates. A place the user named shows "your choice" instead.

### 7.2 Lodging

- One lodging per stay, regardless of nights.
- The agent recommends hotels only: lodging businesses listed on Google, B&Bs and inns included. That rules out private rentals and campgrounds. The user can still name any lodging instead, such as a friend's house, a rental, or a campground (7.6).
- What the agent looks for in each stay's lodging comes from the user's lodging preferences (5.2).
- Location matters: for a stay of several nights, near what the user wants to see; for a one-night stay, convenient to the route.

### 7.3 Dining

- Restaurants are placed in each day's schedule.
- The agent asks about breakfast (hotel or local) and other meal habits, and applies the answer.
- Interest-driven trips (for example, barbecue) treat restaurants as attractions in their own right.

### 7.4 Attractions and stops

- Driven by stated interests and must-sees.
- Includes scenic or notable stops along legs, not only near where the party stays.
- Each attraction carries an estimated time to spend and any seasonal or operating-hour notes.

### 7.5 Option cards

Each card set presents candidates for one choice (a stay's lodging, or a meal or attraction stop). **Assumption:** three options per set.

Each option shows:

- Name, type, and location, and the tier for hotels and restaurants (7.1)
- Rating and review count, for restaurants and hotels. Attractions show them only where a rating means something. A national park or a historic plaque, for example, shows none. Which attractions qualify is settled during development
- Why it was recommended, tied to the user's stated preferences
- Source link for the underlying listing or review data
- Notes (seasonal hours, reservations advised)

Actions on the card set:

- **Select** an option
- **More options** like these
- **Higher tier** / **Lower tier**, on lodging and meal cards only. Attractions have no tier. Each asks the agent for options nicer, or simpler, than the ones shown, such as "something nicer than these." Nothing is changed in the trip until the user selects one. "Higher tier" is hidden when every option shown is upscale, and "Lower tier" when every option shown is value

Selecting an option updates the itinerary, and the agent acknowledges the change in chat. The user can also select by chat ("take the second one"). Once an option is selected, the card closes. Later changes go through chat: the user can ask what else was offered, pick another option by name, ask for more options, or turn the pick down. A new card appears only when new options are offered, or when the user turns down the pick and other options are left. It shows the newest options. When the user passes on the pick only because of the date, such as "it's closed that day," the place isn't turned down, so no card appears. The agent lists the other options in chat instead.

Whether a card is open belongs to the screen, and isn't saved with the trip. When the user opens a trip, starts a session, or reloads the page, a card shows for every stop, and every stay's lodging, with nothing selected yet. It shows the newest options. A card that opened for new options on an item that's already selected doesn't come back after a reload. The user can still ask in chat what else was offered.

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

Trip name, dates, start and end, total driving time, and number of stays.

### 9.2 Map

- One overall view of the whole trip. No per-day filtering.
- Shows the route line, stays, attractions, and restaurants, with distinguishable markers.
- Selecting a marker shows that item's details.
- A stay's marker sits at its lodging once one is selected, and in its town until then. An attraction or restaurant is on the map only once its place is selected. Places only proposed aren't shown.
- The map zooms to fit the trip's places again only when they change, so a map the user moved stays put while the plan is the same.

### 9.3 Stays

For each stay: dates, nights, and lodging (proposed or selected).

### 9.4 Legs

For each leg: from, to, drive duration, distance, and notable stops along the way. A leg shows scenic or fastest only when the user chose a different route for that day than for the trip, with the reason.

### 9.5 Daily itinerary

For each day: day number, date, location, start time, and its schedule: drives, attractions, meals, and check-ins, each with a time, and the free time between them. A check-in shows where the party sleeps that night. Rest days are marked. The times are a plan, worked out from average drive times and estimated visit times.

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
- **Once the trip has started,** no session can be started or resumed (section 2).
- **"Delete trip"** removes the trip: its itinerary, its sessions, and its trip memory. It's on the home screen, next to each trip, not on the trip's own page, since it's about the trip as a whole, the way a file is deleted from its folder. The app asks first, naming the trip, since it can't be undone. User memory stays. A trip can be deleted at any time, even once it has started, but not while a reply in one of its sessions is still coming in. Then the trip leaves the list.
- **The chat view shows the conversation as cards,** as other chat apps do. The user's messages are on the right, and the coordinator's replies are on the left. A reply's formatting, such as bold text and numbered lists, shows as formatting, not as marks.
- **Each turn's steps are saved as a trace, outside the app,** for Joe to look at later, such as each tool call and its reply (systems design section 10). The chat shows only the conversation, and while a reply comes in, the name of the tool the coordinator is waiting on. The chat works the same whether the traces are saved or not, so a line under the home screen's trip list says which, with a green check or a red X. The check says the turn traces can be saved. The X says they can't, and are lost. It's on no other page, and not on the sign-in page, since traces matter only once the user is signed in and chatting. Until the app answers, or if it doesn't, the line is left out, since the trip list fails then too. Whether the app and the database can be reached isn't shown: a problem there is plain anyway, since sign-in or the trip list fails.
- **Each reply has a thumbs up and a thumbs down, and so does the whole session.** Either one opens a box for a note, and the rating is saved with it in the turn's trace, or the session's (systems design section 10). Good turns get rated as well as bad ones. Rating again replaces the user's last rating, such as a thumbs up turned to a thumbs down, but a rating can't be taken back. Each user's ratings are their own. Only replies the page streamed have thumbs, since only those carry their trace's ID. After a reload, the earlier replies have none, and can be rated in Phoenix. That way a reply rated earlier never shows blank thumbs that would overwrite its rating. The session's thumbs start with the user's last rating of it, and the note box with its note. The thumbs sit in a row under the turn's last card, which is the user's message when the turn failed with no reply. A failed turn's row also says "The reply didn't finish."
- **Each reply's row has a "View trace" link, and the session has a "View session" link,** which open the turn's trace, or the session's turns, in Phoenix, in a new tab. Every user sees them, but they open only on Joe's machine, with his SSH tunnel up. For anyone else, they lead nowhere.
- **A "Memory" toggle shows user memory and trip memory,** each item with "Forget." The app asks first. Forgetting an item here works like asking the agent to forget it (10.5). The list is read again after each reply, since the agent may have changed memory. It's shown once the session exists, after the first message.
- **"Download plan" and "Download full plan" save the trip brief and the itinerary as a text file, as the coordinator reads them,** so Joe can trace why the coordinator did something. Each starts with the trip brief, then the whole itinerary, as the coordinator's own reads give them (tool design 2.1). Both are shown once the session exists.
  - **"Download plan"** gives the itinerary exactly as a whole read returns it, the read the coordinator gets at the start of each session. So it matches the whole read in that session's trace, as long as nothing changed since.
  - **"Download full plan"** gives the same layout, but each stay and day as a read of that stay gives them: every candidate, with its rationale, and each stay's weather text. The coordinator never reads the whole trip at this detail at once, but each stay and its days match what it sees when it reads that stay.
  - **A download has no size limit.** A whole read too large for the coordinator is refused, but a download never is.
  - **A download saves nothing.** It marks each check result new or already known, as a read does, and like a read, it doesn't change what's saved. So the coordinator's next read is the same.
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

- Typical comfortable driving hours and route preference
- Lodging preferences ("B&Bs over chain hotels")
- Meal habits ("prefer the local food scene over hotel breakfast")
- Recurring interests

The agent uses user memory to prefill section 5.2 and confirms rather than re-asks.

User memory doesn't hold a dislike of one specific place, since it means nothing on a trip somewhere else. When the user says they didn't like a place, the agent asks why. It keeps the reason if it applies elsewhere, such as "prefers local spots over restaurants in tourist areas." A chain or a kind of place is fine, such as "never suggest McDonald's for dinner unless I ask."

### 10.4 Isolation and precedence

- Trips, itineraries, sessions, user memory, and trip memory are strictly isolated per user. When user A is signed in, neither the agent nor the UI has access to user B's trips, itineraries, sessions, or memories.
- Precedence: the current conversation, then trip memory, then user memory. When the user says something that contradicts user memory, the agent asks whether it applies to this trip only or should update the user's standing preference.

### 10.5 Memory visibility

- The user can ask the agent what it remembers, at both the user level and the trip level, and the agent answers from its stored memory.
- The user can ask the agent to forget specific items. Forgotten items no longer influence recommendations.
- The user can also see both memories in the chat view's memory list, and forget any item there (10.1). The app tells the agent on the next message, so it reads memory again and stops using the item.
- When the user asks what the agent knows about a trip, the agent gives both the trip brief and trip memory. Memory items can be forgotten. Trip brief items can be changed but not forgotten, because the agent needs them to plan.

---

## 11. Acceptance scenarios

**S1. Specific route.** User asks for the Pacific Coast Highway, San Francisco to Los Angeles. The agent still asks about interests, must-sees, dates, driving hours, and lodging preferences before proposing stays and nights.

**S2. Theme and region.** User wants Texas barbecue over seven days with no start or end in mind. The agent proposes a start and end (loop or one-way), stays, and drive times, with barbecue restaurants treated as primary attractions.

**S3. Infeasible plan.** User wants Seattle to Miami in five days at four hours of driving per day. The agent states the shortfall and offers trade-offs.

**S4. Seasonal conflict.** User plans a trip starting January 15 that includes an attraction open only in summer. The agent flags that the attraction is typically closed then and proposes later dates or a substitute. In the MVP this comes from the agent's judgment, not a code check (technical spec section 8).

**S5. Tiers as labels.** The user says they're foodies, willing to splurge on good food, and wants mid-range hotels, with a B&B in one of two towns. Restaurant cards show the places that fit best, at whatever tier they are, such as a value lobster shack, each with its tier. Hotel cards show mid-range options. Both towns' cards include a B&B, until the user picks a B&B in one of them.

**S6. Option card navigation.** On a hotel card, the user picks "Higher tier." The agent offers options nicer than the ones shown. The user selects one, the itinerary updates, and the agent confirms in chat.

**S7. Resume and new session.** The user returns the next day. Resuming the prior session restores the conversation. Starting a new session, the agent knows the itinerary, the trip's open items, and the user's standing preferences.

**S8. User isolation.** User B signs in and starts a trip. The agent shows no knowledge of user A's preferences or trips.

**S9. Cross-trip memory.** On a second trip, the agent opens by confirming the user's usual driving hours and meal preferences rather than asking from scratch.

**S10. Per-trip override.** User memory says the user usually drives up to 6 hours a day. On a new trip, the user says "only 4 hours a day this time." The agent plans for 4 hours, asks whether this changes their usual limit, and leaves user memory unchanged when the user says it is a one-off. On the user's next trip, the agent again proposes 6 hours.

**S11. Forget.** The user asks what the agent remembers about them, then asks it to forget that they like breweries. In the next session, the agent doesn't mention breweries or suggest them because of that preference.

**S12. Trip memory stays with its trip.** On a Texas trip, the user says "stay off I-35 this time." On the user's next trip, the agent doesn't know it.

**S13. A changed preference.** User memory says the user prefers hotel breakfast. On a new trip, the user says "from now on, local cafés for breakfast." The agent replaces the old preference, so user memory doesn't hold both.
