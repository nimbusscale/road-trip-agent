# Domain model notes

Prep for technical spec open question 4, gathered on 2026-10-12. The open question calls it "a full object model." We've since settled on "domain model" as the name. This file holds the plan, the open items, and the starting material for writing it.

**Status, 2026-10-13:** `design/domain-model.md` has its conventions (section 1), the class diagram, and the Trip written and reviewed, including Session and RejectedPlace. Round 1 (Trip brief, Check result, Itinerary) is written and reviewed. Round 2 (Stay, Day, Stop) is a first draft, unresolved: rules that need data from outside their object led to a planned move to services, on its own branch. The other objects are still drafts in the diagram. Decisions are under "Settled in the Trip review" and "Settled in round 1" below. The domain model's section 1 replaces the naming and type guidance in "What each object gets."

## What we're making

**A domain model, drawn as a class diagram.** It covers the objects in the trip planner, such as trip, stay, day, and stop: their properties and the kind of value each holds, how they relate, the operations on them, and their rules. It stays implementation agnostic. It has no TypeScript types, no plain getters and setters, and no database tables. Operations do give their arguments and returns, as guidance for development (decided in the Trip review). Those come from the code during development.

**It's kept by hand and updated during development.** It stays the design's source of truth. When development finds something it needs, the domain model gets it. A diagram of the code itself, if we ever want one, can be generated from the TypeScript. That's separate and optional.

**Memory is left out.** The docs already make some decisions about memory. Memory items have a `mem_` ID and are kept for the user or for the trip, and the ERD shows them. Memory still stays out of the domain model: no memory objects, and no memory properties or links on other objects. Memory design is technical spec open question 5, and memory joins the model once it's designed. When technical spec section 3 shrinks, its memory item rows stay there.

**It replaces the ERD in technical spec 3.1.** The ERD shows only entities, the objects with their own IDs. It leaves out candidates, legs, approvals, and check results, because other objects hold them. Most walk-through findings came from those, and the ERD alone didn't catch them. Keeping both would mean two drawings of the same objects, which would drift apart.

**One model, not two.** On a larger team, a business-facing domain model and a developer-facing class model can be worth separating. Here there's one reader, so one model is enough.

## What each object gets

- **Properties,** each marked **stored** or **worked out.** Worked out means computed from other stored data when read, such as a day's date or a stay's nights. The stored versus worked-out split was behind many walk-through findings, such as times, dates, and a day's location.
- **The kind of value each property holds,** in plain terms: text, a whole number, a date, a time of day, a length of time, yes or no, one of a fixed list (such as meal or attraction), a link to another object (such as a place), or a list of other objects (such as a day's stops, in order). Say when it can be empty. Example: a stop's set time is a time of day, or empty when the stop follows the one before it.
- **Operations,** named in plain terms, such as "select a candidate" or "set the tier." For each one, say what it changes, what it refuses, and what follows on. Example: selecting a candidate for a stop sets its visit time, and sets the stored tier to the candidate's when they differ. It removes any opening-hours approval if the place changed, and re-routes the leg. It's refused for a rejected place. A plain read or write with no rule doesn't need listing. Mermaid class diagrams have a section for these in each class.
- **Rules:** what must always be true of the object, whatever operation runs. Example: a rest day's stops each need a set time.
- **Similar operations that behave differently.** Spell these out, because a properties list hides them. Three "add" operations differ today:
  - **Check results:** after every coordinator write, code works out the current results and compares them with the list saved on the trip. A result already on the list is marked already known, and the coordinator stays quiet about it. One not on the list is new. One that disappeared is reported as gone.
  - **Places:** adding a place already stored for the trip quietly reuses the existing record, matched by Google's place ID.
  - **Candidates:** adding a candidate already offered for that stop or stay, or a rejected place, refuses the whole set with an error.
- **How it's held:** an entity with its own ID, or a value object held inside another object, such as a leg inside its day. Which object holds it.
- **Who creates and changes it:** the coordinator, a worker, or code inside a tool (technical spec 3.4).

## Plan

1. **Write the domain model.** Create `design/domain-model.md` from technical spec section 3 and this file. Replace the ERD with a Mermaid class diagram. Mermaid renders on GitHub and lives next to the text.
2. **Review it one object at a time,** the same way the tool design was reviewed. Settle the open items below as each object comes up. Changes to `design/` need sign-off before they go in.
3. **Shrink technical spec section 3** to point at the new doc, once the new doc covers it. Update the cross-references in the other docs. Many say "technical spec 3.1," "3.2," or "3.3."
4. **Close technical spec open question 4.**

## Decided while preparing

- **A day keeps its ID when its number or date changes.** A day is an entity, with its own `day_` ID (technical spec 7.1). Removing a night deletes that stay's last day. Every later day keeps its ID and moves up one. Check results are matched by "the same check about the same thing," and approvals sit on days, so both depend on this. The docs imply it but never say it. The domain model should. (Run 3)
- **Settings are configuration, not part of the domain model** (changed in the Trip review). All five are listed in technical spec section 10, loaded when the app starts and read-only while it runs. The near distance for `search_near` starts at 15 miles. (Run 1)

## Open items to settle in the domain model

From the sixth walk-through and earlier review sessions:

- **A day's location.** Functional spec 9.5 shows each day with a location, but nothing defines it. It's likely worked out, not stored: a driving day shows "Monterey → San Luis Obispo," and a day that stays put shows the stay's town. (Run 6, F12)

From the sweep of runs 1 to 5, checked against the docs as of 2026-10-12:

- **Every stored property, in one list.** `read_itinerary` in tool design 2.1 says a read returns "every stored property of each item" and that the object model lists them. That list doesn't exist yet. The domain model is where it goes. (Run 4, F7)
- **A user-named place's visit time, if picked again.** `select_user_place` gives the user's visit time to the stop. It doesn't say whether the candidate it adds keeps that time. If the user picks something else, then goes back to it with `select_candidate`, the tool copies the candidate's estimate, which may not exist. Example: the user names Hangar One at 2 hours. (Run 3)
- **The year range on seasonal averages.** The label reads "based on 2016–2025," counted back from today (Open-Meteo design 2.3). If the years are worked out at read time rather than stored with the text, the label changes a year later though the text doesn't. (Run 3)
- **Small confirm: "as of when offered."** A candidate's detour time is labeled "as of when it was offered." Run 5 read this as fixed wording with nothing stored, and that seems right. The model should say so. (Runs 4 and 5)

From round 1, for later rounds:

- **Day, StayDay, and LastDay.** Round 2 settles what each holds. The last day can't be a rest day, and is the only day that can have stops near the end place.
- **A drive hours approval over the maximum daily driving.** Should the setting cap an approval too, or only the trip brief's max? (Round 2, with Approval.)
- **"At the end of every write."** Domain model section 1 lists re-routing legs, saving check results, and setting the last-updated time there. The user sees "a write" as a tool idea, a layer above the domain model. Look at where each belongs when the Leg is written (round 3).

## Settled in round 1

- **Rules live on the objects, not in the tools** (domain model section 1). The tools are one way in. A web form must hit the same rules. A rule on one property runs when it's set. Operations are only for changes past one property. When a rule covers several objects, the operation sits on the object that holds them all.
- **Markers.** `{readOnly}` means can't be set directly: it never changes, or changes only through a named operation. Reading a read-only list gives a frozen copy. `{keepsValue}` means it starts empty and can't be emptied once set. `=` shows a default.
- **Trip brief.** No operations; `TripBrief.update()` was tried and dropped. Every item but `usualStartTime` keeps its value. `usualStartTime` defaults to 8:00 a.m. Trip length is from 1 to the maximum trip length. Max driving hours is more than 0 and at most the maximum daily driving. Both limits are settings in technical spec section 10 (c071c85), which now says what each setting is, with no links out.
- **Itinerary.** `startPlace`, `endPlace`, and `startDate` keep their value. A start date is refused with no start place, or when it isn't after today. `Itinerary.update()` was tried and dropped. Nothing checks that places are in the US; that risk is accepted. `totalDriveTimeInMinutes` is worked out, without the buffer.
- **Stays hold their days** (run 6 and the second review's open item). Each stay holds the days that end with a night there. The itinerary holds `lastDay` on its own, a `LastDay` class under a `Day` base, next to `StayDay`. `Itinerary.days` is worked out. `Day.sleepsAtStay` is gone. A next-morning breakfast near the previous stay is a link through the stop's search area, so ownership doesn't affect it. `setStayNightCount()` stays on the itinerary, which owns the trip length limit.
- **Settings by name only.** The domain model says "a setting (technical spec section 10)" and never repeats its value, so changing a setting changes one doc.
- **Tool inputs and operation arguments can differ.** Example: the tool `add_stay` takes "first" where `addStay()` takes an empty `after`. Domain model section 1.
- **Night and last day** are defined in functional spec section 4 (3b7dbad). The functional spec owns domain terms.
- **Check result.** Saved fields: `check`, `subjectId` (an ID, since a write can remove the subject before the compare), `text` (to describe one that went away), `isApproved`, and `hasEmptyStopBefore` (was "may be too early"). `level` is worked out from the check. The `FeasibilityChecker` has `workOut()` and `compare()`. `Trip.replaceCheckResults()` refuses two results with the same check and subject. `CheckKind` stays an enum, not 11 subclasses with 10 of them empty. Instead, a check result is refused when it's created with `hasEmptyStopBefore` true on any check but the two opening-hours warnings. A late or driving warning while a stop is empty is real, since an empty stop can only push times later.

## Settled in the Trip review

Each of these is now in the design docs. The pointer says where.

- **Sessions and last updated** (run 6, F12). A session has `createdDateTime`, a `title` set from the user's first message, cut to about 60 characters, and a transcript. `Trip.createSession(firstUserMessage)` creates one, and `Session.resume()` resumes it. `Trip.lastUpdatedDateTime` is set at the end of every write. Domain model 3.1.
- **Must-sees are text** (run 3). No code reads the trip brief's text items, so must-sees, interests, rest days, budget rules, and meal preferences are each one string in the user's words: `mustSeesText` and so on. A must-see records no kind and links to no place. A one-place must-see is linked through the stop the coordinator selects for it. Budget posture is split into `defaultTier` and `budgetRulesText`. Domain model diagram, and tool design 2.1 (`update_trip_brief`).
- **"Region, route, or theme" is now "focus."** The home screen no longer shows a region, since the trip's name starts with the focus. Functional spec 3, 5.2, and 10.1, and technical spec 3.1.
- **Today's date isn't a property.** Code looks it up in the start place's time zone. A start date is refused until the itinerary has a start place, or the same write sets one. Technical spec section 8, and tool design 2.1 (`update_itinerary`).
- **Rejections.** Rejecting a place already rejected skips it and keeps its first reason. A rejection undoes picks, meaning candidates and selections. It leaves the trip's structure alone: a stay's town, the start and end places, and waypoints. Tool design 2.1 (`reject_places`).
- **IDs.** The trip, trip brief, itinerary, and session have the prefixes `trip_`, `brief_`, `itin_`, and `session_`. A user's ID comes from the sign-in service. Technical spec 7.1.
- **`add_stay_candidates` is now `add_lodging_candidates`.** Tool design 2.1.
- **Worker briefs and option cards are left out of the domain model,** since neither is stored. Domain model intro.

## Starting material: properties and rules from the sixth walk-through

Copied from the sixth walk-through's properties list, grouped by object. Items it marked as missing or unclear that were settled on 2026-10-12 now show the decision. The rest are as the walk found them, and still need checking against the docs when each object is written.

### Trip (written: domain model 3.1)

- Owner (one user)
- Trip brief, itinerary, places: one each, or a list of places
- Rejected places, each a place and the user's reason
- Saved check results list, each marked approved or not. Only the coordinator's writes save it
- Name, worked out from the brief's focus and the start month
- Last updated, shown on the home screen **(settled: domain model 3.1)**
- Sessions, each with a date, short title, and transcript **(settled: domain model 3.1)**
- Rule: refuses every write to the trip from its start date on
- Rule: "today" for the start-date, lock, and forecast rules is the date in the start place's time zone
- Rule: all of a trip's times are in the start place's time zone. Crossing a time zone is a known limit

### Trip brief

- Focus (was "region, route, or theme")
- Trip length in days, at most 14
- Interests and must-sees, with why. Each is one string in the user's words (settled in the Trip review). A must-see can be one place, an area, a road, or an activity
- Max driving hours per day
- Route preference: scenic or fastest
- Rest days, in the user's words. The agent decides which days
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
- Activities, worked out: attraction stops near it, plus attraction stops along its days' legs. For the first stay, also stops near the start place. For the last stay, also stops along the last day's leg and near the end place
- Rule: where the party sleeps is the lodging once selected, else the town
- Rule: removal refused while stops are on its days or use it as their search area
- Rule: selecting a candidate at a different tier sets the stored tier to the candidate's
- Rule: a started trip keeps its weather text as it was. Nothing records how old a forecast is

### Day

- Order. Date, worked out
- Stay where the party sleeps. The last day has none
- Rest day or not. Only a day that stays put can be one
- Own start time, or none
- Stops in order
- Leg, if any
- Approvals: drive hours, route type
- Location, shown in functional spec 9.5 **(open: not defined)**
- Schedule, worked out: start, each stop's arrival and end, free time, drives with buffer, arrival where the party sleeps
- Rule: a day runs past midnight until the party reaches where it sleeps. A rest day runs until its last stop ends
- Rule: a rest day's stops each need a set time
- Rule: an empty stop with a set time holds its spot. The stop after it can't arrive before that set time

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
- Purpose: what, never when. May say how long. Fixed. An activity tied to a time of day, such as a sunrise hike, is a what. A meal name is a when
- Search area: a stay ID, along the leg, near the start place, or near the end place. Fixed
- Order in the day
- Set time or none. Can be "next day" for after midnight
- Visit time. Set on selection. Cleared when the place is cleared
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
- Rule: the card shows the newest set still present. It comes back only with new options or after a rejection
- Rule: workers offer only places at the briefed tier

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
- Rule: only the coordinator's writes run the checks and save the list. Worker writes return no check results
- Rule: a write returns the already-known results only for what it stored a change to, the days whose legs it re-routed, and the trip

### Worker brief (not stored)

- Stop or stay IDs, with their day, dates, and nights. The leg scout also gets the day ID
- Resolved tier and rule for lodging and meals
- Each stop's purpose, set time, and rough expected time in plain words
- The day's other stops in order, with times, purposes, and selected names
- Interests, must-sees, meal preferences
- Places to leave out: earlier candidates, plus any the coordinator adds
- Weather worker: only the stay IDs

### Option card (UI)

- Shows one stop's or stay's newest set
- Actions: Select, More options, Higher tier, Lower tier. No tier actions on attractions. Higher tier hidden at posh, Lower tier hidden at value
- Closes once a pick is made. Comes back only with new options or after a rejection
