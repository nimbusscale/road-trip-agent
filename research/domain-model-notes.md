# Domain model notes

Prep for technical spec open question 4, gathered on 2026-10-12. The open question calls it "a full object model." We've since settled on "domain model" as the name. This file holds the plan, the open items, and the starting material for writing it.

**Status, 2026-10-13:** `design/domain-model.md` has every object written and reviewed, in three rounds: the Trip (with Session and the places registry), Trip brief, Check result, Itinerary, Stay, Day, Stop, Leg, Candidate, and Place. Section 4 has the calendar and the services, including the `LegsService` from round 3. The domain model is finished. Technical spec section 3 now points to it (273350b), the example trips moved into it (domain model section 5), and technical spec open question 4 is closed. The persistence design, technical spec open question 6, was written on 2026-10-13 in `design/persistence.md`, and the question is closed. Decisions are under "Settled in round 3," "Settled in the services review," "Settled in round 1," and "Settled in the Trip review" below. The domain model's section 1 replaces the naming and type guidance in "What each object gets."

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

- **A day's location.** Functional spec 9.5 shows each day with a location, but nothing defines it. It's likely worked out, not stored: a driving day shows "Monterey → San Luis Obispo," and a day that stays put shows the stay's town. (Run 6, F12) **(Settled: the calendar's `locationOf()`, domain model 4.1.)**

From the sweep of runs 1 to 5, checked against the docs as of 2026-10-12:

- **Every stored property, in one list.** `read_itinerary` in tool design 2.1 says a read returns "every stored property of each item" and that the object model lists them. That list doesn't exist yet. The domain model is where it goes. (Run 4, F7) **(Settled: the domain model's properties tables list them. Tool design 2.1 still points to "technical spec, open question 4" and needs its cross-reference updated when section 3 shrinks.)**
- **A user-named place's visit time, if picked again.** `select_user_place` gives the user's visit time to the stop. It doesn't say whether the candidate it adds keeps that time. If the user picks something else, then goes back to it with `select_candidate`, the tool copies the candidate's estimate, which may not exist. Example: the user names Hangar One at 2 hours. (Run 3) **(Settled: the candidate keeps the user's visit time, domain model 3.7.)**
- **The year range on seasonal averages.** The label reads "based on 2016–2025," counted back from today (Open-Meteo design 2.3). If the years are worked out at read time rather than stored with the text, the label changes a year later though the text doesn't. (Run 3) **(Settled: `WeatherText.writtenOnDate`, domain model 3.5.)**
- **Small confirm: "as of when offered."** A candidate's detour time is labeled "as of when it was offered." Run 5 read this as fixed wording with nothing stored, and that seems right. The model should say so. (Runs 4 and 5) **(Settled: fixed wording, nothing stored, domain model 3.9.)**

From round 1, for later rounds:

- **Day, StayDay, and LastDay.** Round 2 settles what each holds. The last day can't be a rest day, and is the only day that can have stops near the end place. **(Settled: `StayDay` adds `isRestDay`, `LastDay` adds nothing, domain model 3.6.)**
- **A drive hours approval over the maximum daily driving.** Should the setting cap an approval too, or only the trip brief's max? (Round 2, with Approval.) **(Settled: the setting caps it, in `DaysService.approveDriveHours()`, domain model 4.5.)**
- **"At the end of every write."** Domain model section 1 lists re-routing legs, saving check results, and setting the last-updated time there. The user sees "a write" as a tool idea, a layer above the domain model. The services rewrite didn't settle it. Look at where each belongs when the Leg is written (round 3). It's the same unit as the transaction in the persistence item below, so settle them together. **(Settled: domain model section 1, "A write." See "Settled in round 3.")**
- **Must not lose: the persistence design.** Discussed 2026-10-13 after the services rewrite. Round 3 settled the first item, a write as a transaction (domain model section 1). The other two are still open, and are now technical spec open question 6. Three things need it:
  - **A write as a transaction.** The leaning: each tool call is one write. Code loads the trip, runs the service calls on that copy, and saves only if nothing was refused. A refusal throws the copy away, so nothing is left half changed. Example: `StopsService.moveStop()` takes a stop off Day 2, then Day 3 refuses because `after` isn't on Day 3. The copy is thrown away, so Day 2 never lost the stop. This replaced an earlier draft idea where each service asked objects ahead of time whether they'd accept a change. The user agreed to drop that. A transaction also covers tool calls that make several changes, such as `update_trip_brief` setting five items when one is refused. And it's the natural home for the end-of-write follow-ons.
  - **Parallel worker writes.** A transaction alone doesn't stop two writes from losing each other's work. If each write loads the whole trip and saves it whole, two stay researchers writing at once can each save a copy without the other's candidates. Example: the Moab and Torrey researchers run in parallel, and Torrey's save overwrites Moab's new lodging set. Two options came up. **One write at a time per trip:** a write waits until the one before it finishes. It's simple, since all tools run inside our app (tool design section 1). The cost is that workers wait on each other, including during Google calls such as detour times. **Save only if nothing changed since loading:** the trip keeps a version number, a save fails if someone else saved first, and code reruns the tool call on fresh data. Workers don't wait. The cost is repeated Google calls on a conflict. I leaned toward one write at a time for the MVP, since conflicts would be rare. The user wondered whether a transaction could fail, roll back, and try again. The answer: a conflict between workers is rerun by code on fresh data, with no agent involved. A refusal by a rule isn't retried. Its error goes back to the coordinator, which decides what to change.
  - **The started-trip lock at save.** The lock is checked when the trip is saved (domain model 3.1). That save has to refuse plan changes but still allow new sessions and places saved from searches on a started trip.
  - **(Settled 2026-10-13:** `design/persistence.md`. The plan is one JSON document in the trip's row, and places, sessions, and transcript lines are rows of their own, with places kept per trip. Writes to one trip take turns, with a Postgres row lock; saving places from a search takes no lock. Persistence refuses to save the plan of a started trip, checked on the trip as loaded. Transcripts go in Postgres through the SDK's `sessionStore` adapter, sending lines eagerly; object storage isn't used. The session holds `agentSessionId` in place of `transcript`. Today's time zone comes from the start place's coordinates. A resumed coordinator reads the itinerary again. Settings live in a config file.)
- **Is `PlacesService` only about rejections?** Today its one operation is `rejectPlaces()`. The user expected a places service to hold the places registry, and noted this one is really about rejections. Once the rest of the design is done, check whether it gains anything else. If not, rename it, such as to `RejectionsService`. **(Settled: renamed `RejectionsService` in round 3.)**
- **The Leg reads its holder.** `Leg./from`, `/to`, and `/routeType` need the day before, the stay that holds the day, the day's approvals, and the trip brief. A leg can't see those, so they likely become calendar functions in round 3, the same way the day's worked-out properties did. **(Settled: see "Settled in round 3.")**

## Settled in round 3

Agreed 2026-10-13 (domain model 3.8 to 3.10, 4.7, and section 1). Doc changes outside the domain model are in 0309a4a.

- **Leg.** `/from` and `/to` are the calendar's `fromPlaceOf()` and `toPlaceOf()`. `/routeType` is dropped, since nothing reads it: it changes nothing in the call to Google, no check reads it, and the view reads the route type approval. The leg is only Google's answer: all read only, replaced whole on a re-route, no operations. Drive time is worked out from the segment times.
- **Waypoints are on the day,** with `Day.setWaypoints()`, refused while the day has no leg. A day has waypoints only while it has a leg, so they still go with it.
- **A leg remembers what it was routed for:** `routedFromPlace`, `routedToPlace`, `routedStopPlaces`, `routedWaypoints`. `LegsService.updateLegs(itinerary)` compares them with the day now and re-routes only on a difference. The user chose this over comparing a loaded copy with a changed copy, so a write needs only one copy. It returns a `LegChange` per day changed (day, old leg, new leg), not stored, for the tool's "2 h 10 m → 1 h 30 m."
- **`LegsService`** (4.7): `updateLegs()` and `detourTimesOf()`. Given the calendar and a route finder (the Google Routes code, outside the model). A leg exists when the day isn't a rest day, both its ends are known, and it moves or has a selected stop. So the last day has no leg until the start and end places are set.
- **A write** (section 1): load, change, finish (legs, then check results for coordinator writes, then last updated), save. Any refusal, including a failed or impossible Google route, means the trip isn't saved. A places-only write skips the finish.
- **`isStayingPut()` is false on the first and last days.** Fixed a bug: a day trip's only day compared two empty stays as the same.
- **`PlacesService` is now `RejectionsService`.**
- **Candidate.** Its tier and rule are copied from its stop or stay when its set is added. Workers no longer pass them. `visitTimeEstimateInMinutes` is now `visitTimeInMinutes`, since it also holds the user's time. Rules about which candidates fit which holder (visit time, detour time) are on the stop and the stay. "As of when offered" is fixed wording.
- **Place.** `googlePlaceId` is required. The type is Google's readable type, set when the place is created. Tools no longer take a type. The name is Google's, or the first name an agent gives when Google has none, with `fillName()`. Renaming a place isn't in the MVP; the tool reply says when a name wasn't used, which is a useful test of the coordinator. A place found again keeps its first record, and every lookup, `find_place` included, asks for the same fields so that record is complete. The short line ends with the town. `PriceLevel` is a fixed list. An always-open place has one opening period with no close.
- **To check in development:** whether Google really gives no name for an address. If it returns the street as the name, "Mike's house" never fills in.
- **RejectedPlace** needed no change.

## Settled in the services review

Agreed 2026-10-13 (domain model sections 1 and 4). These replace "Rules live on the objects" under round 1.

- **Three layers.** Objects hold data and integrity rules: rules that need only the object's own data, or data it holds, such as more than 0, `{keepsValue}`, or a meal stop needing a tier. Services hold business rules: any rule that needs a setting, the trip brief, or another object. The started-trip lock is checked by the tools, and by persistence when the trip is saved, not by objects or services. That reverses an earlier idea that services check it, since this is a learning project.
- **No child reads its parent.** Child-to-parent links were rejected, since they make circular references. Pushing operations up into the itinerary was rejected too, since it passes references down a chain of objects.
- **Services.** Stateless, one per kind: `TripBriefService`, `PlacesService`, `StaysService`, `DaysService`, `StopsService`, plus the `FeasibilityChecker`. Each is created for one trip, with its places registry, its trip brief, the settings, and the calendar. Operations take the itinerary and the objects to change. Services never call each other. A service checks every rule before changing anything. They aren't in the class diagram.
- **Places registry.** `PlacesRegistry` holds the trip's `places` and `rejectedPlaces`, moved off the Trip, and is in the diagram. The trip holds it as `placesRegistry`. Its operations are `addPlaces()`, `addRejections()`, and `isRejected()`.
- **Calendar.** Stateless lookups over the itinerary, passed into the services: positions, neighbors, dates, where a day runs, times and the schedule, and weather. It replaces worked-out properties that need a holder or a sibling. Worked-out values that need only the object's own data stay on the object, such as `Stop.status` and `Stay.nightCount`.
- **Markers.** `{readOnly}` now means never set directly: it never changes, or changes only through the object's own operation. `{viaService}` is new: the property changes only through a service operation. A property is `{viaService}` when any change to it needs a business rule, and then every change goes through a service. In TypeScript, the object's change method is kept out of the domain package's public API.
- **Hard and soft rules.** Keep soft rules to a minimum. The rest-day set time rule is hard. A stop's search area is hard when it's added, and soft (`searchAreaDoesNotFitDay`) after a move or a change to the stays. The warning checks describe problems with the plan, not broken data.
- **Follow-up decisions on the rewrite** (same day, after the user's first read):
  - **`rejectedPlaces` is `{viaService}`.** Otherwise code could record a rejection with the registry and skip taking the place out of candidates. Only `PlacesService.rejectPlaces()` changes it.
  - **`rejectPlaces()` stays one call.** Splitting it across `PlacesService`, `StopsService`, and `StaysService` would leave the tool to make all three calls, so the rule "a rejected place is never a candidate" would live in the tool. It stays in `PlacesService` for now (see the rename item under carried forward).
  - **`Trip.placesRegistry` stays.** It loads and saves the registry with the trip, and it's how code finds the registry to hand to services when a session starts. The registry is more than a cache: rejections and coordinator-given names, such as "Mike's house," can't be fetched again from Google.
  - **Integrity rules look one list deep.** An object's rules look at its own properties and the items in its own lists, not inside those items' own lists. Reading is fine. Reaching into held objects to judge or change them isn't. A stop checking its candidates' places for a repeat is the stop managing its candidates. A stay checking whether its days hold stops is managing days, so that stays in `StaysService`, in `setNightCount()` and `removeStay()`. The itinerary's "every stay holds a day" rule was dropped, since the stay holds it.
  - **Each service and the calendar say what they're given,** in a "Given" line at the top of each section 4 subsection.
  - **Accepted additions:** the calendar's `dayOf()` and `openTimeInMinutesOf()`, and a set time on `moveStop()`. Dropped: services checking object rules ahead of time, in favor of the transaction (see the persistence item).
- **Kept from the round 2 draft:** the `scheduleTime` type, the drive hours approval cap, the meal visit time setting, stays holding their days, `CheckKind` as an enum, a user-named candidate keeping the user's visit time, `WeatherText.writtenOnDate`, and `ActivityRecord.stopId`.

## Settled in round 1

- **Rules live on the objects, not in the tools** (domain model section 1; replaced by the three layers in the services review). The tools are one way in. A web form must hit the same rules. A rule on one property runs when it's set. Operations are only for changes past one property. When a rule covers several objects, the operation sits on the object that holds them all.
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
  - **(Changed 2026-10-14:** sessions left the domain model, since a session is a conversation about the trip, not part of it. `Trip.sessions`, `Trip.createSession()`, and `Session.resume()` are gone. Persistence section 8.4 now holds the Session class, with `SessionWriter.start()` and `SessionReader`'s `listForTrip()` and `get()`. A new trip takes two steps: `TripWriter.startTrip()`, then `SessionWriter.start()`.)
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

### Leg (written: domain model 3.8)

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

### Candidate (written: domain model 3.9)

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

### Place (written: domain model 3.10)

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
