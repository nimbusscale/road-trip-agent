# Road Trip Planner: Domain Model (MVP)

This document lists the objects in the trip planner, such as trip, stay, day, and stop. For each one it gives its properties, how it relates to the others, the operations on it, and the rules that always hold. It stays at the level of design. It has no code types and no database tables. Those come from the code during development. It's kept by hand, and when development finds something it needs, it goes here.

For the planning behavior, see the [functional spec](functional-spec.md). For the agents, workers, and feasibility checks, see the [technical spec](technical-spec.md). For each tool's inputs, see the [tool design](tool-design.md).

**Left out on purpose:**

- **Memory.** Memory design is technical spec open question 5. Memory joins this model once it's designed.
- **Worker briefs and option cards.** Neither is stored. A worker brief is written fresh for each worker call (technical spec 5.3). An option card is how the UI shows the newest candidate set of one stop or stay (functional spec 7.5). The rules they depend on, such as which candidate set a card shows, are on the objects here.

**Draft status.** Rounds 1 and 2 are written and reviewed: the Trip, Trip brief, Check result, Itinerary, Stay, Day, and Stop. That includes the move of rules that need other objects into services, a places registry, and a calendar (sections 1 and 4). The diagram shows the Leg, Candidate, and Place as technical spec section 3 has them. They're round 3, and each gets its own section as it's reviewed.

---

## 1. How to read this

**Names.** Classes are in PascalCase, such as `TripBrief`. Properties and operations are in camelCase, such as `startDate` and `rejectPlaces()`. Names have no spaces or dashes. Property names follow these rules:

- **A plural name means a list, and every list has a plural name,** such as `stops` or `lodgingCandidates`.
- **A count ends in `Count`,** such as `nightCount` or `reviewCount`.
- **A measure ends in `In` and its unit,** such as `tripLengthInDays`, `visitTimeInMinutes`, or `distanceInMiles`. A plural unit doesn't make the name plural.
- **Text about several things ends in `Text`,** such as `mustSeesText` or `notesText`. It's one string in the user's or an agent's words, not a list, because only the agents read it. Other text has a plain singular name, such as `purpose` or `rationale`.
- **A yes-or-no property starts with `is` or `has`,** such as `isRestDay`.

**Stored or worked out.** A stored property is saved. A worked-out property is looked up from other stored data when it's read, and never saved. Examples: a stay's nights and a stop's status. Storing these would add a second copy that can go stale. A worked-out property needs only its object's own data, or data the object holds. A value that needs more, such as a day's date, which needs the days before it, is a calendar function instead (section 4.1). Values that need a call to an outside service, such as a leg's drive time, are different. They're computed once and stored. In the diagram, a worked-out property starts with a slash, such as `/nightCount`.

**Types.** Each property gives the type of value it holds:

| Type | Holds | Example |
|---|---|---|
| `string` | Text | A stop's `purpose`, "dessert" |
| `integer` | A whole number | A candidate's `setNumber`, 0 |
| `decimal` | A number that can have a fraction | A place's `rating`, 4.6 |
| `boolean` | Yes or no | A day's `isRestDay` |
| `date` | A calendar date, with no time | The itinerary's `startDate`, May 13, 2027 |
| `time` | A time of day, with no date | A day's `ownStartTime`, 5:30 a.m. |
| `scheduleTime` | A time in a day's schedule. It's a time of day, plus whether it falls after midnight, on the next calendar date | A stop's `setTime`, 1:00 a.m., next day |
| `dateTime` | A date and a time together | A trip's `lastUpdatedDateTime` |
| An enumeration, such as `Tier` | One value from a fixed list. The second diagram in section 2 lists them | `value`, `midRange`, or `posh` |
| A class name, such as `Place` | A link to one object of that class | A worked-out leg's `from` |
| `List<X>` | A list of X. The notes say whether it's in order | `List<date>` for a weather text's `writtenForDates` |

A `?` after the type means the property can be empty, such as `setTime : scheduleTime?`. The notes say what empty means. Example: a stop's `setTime` is empty when the stop follows the one before it.

A value after `=` is the property's default, the value it has when its object is created, such as `usualStartTime : time = 8:00 a.m.`

**How an object is held.** An object with an `id` is an **entity**. The `id` is one we create (technical spec 7.1). An object with no `id` is **held by** the one object whose property holds it, such as a leg held by its day's `leg`. It exists only inside that object and goes away with it. An entity can be held too: a day holds its `stops`, and they go away with it. IDs from outside sources, such as Google's place ID, are ordinary properties.

**Order.** A list in order stores the order. An item's number is its position in that list. The calendar's `orderOf()` works it out when it's read (section 4.1). Numbers start at 0. The UI counts from 1 for people, so the day stored as 0 shows as Day 1. The examples use the people-facing labels.

**Who creates and changes it.** The coordinator, a worker, code, or the app itself, outside any agent. Each object says which.

**What this model holds.** The rules about the objects themselves. It isn't all of the app's logic. Code built on top of it adds more, and the agents' tools sit above that. One tool can use several operations here, or set properties directly. A tool's inputs don't have to match an operation's arguments. Example: the tool `add_stay` takes "first" where `StaysService.addStay()` takes an empty `after`.

**Three layers hold the rules.** The agents' tools are only one way to change the data. A later version might let the user edit the trip brief in a web form, and it has to hit the same rules. So the rules can't live in the tools. Each rule has one home, in one of three layers:

- **Objects** hold the data, and its integrity rules. An integrity rule looks only at the object's own properties and the items in its own lists. It doesn't look inside those items' own lists. Examples: a visit time is more than 0, a meal stop needs a tier when it's created, and a stop's selected place is one of its candidates. A stop can check its candidates' places for a repeat, since it's managing its candidates. A stay checking whether its days still hold stops looks one list deeper, so that's a business rule. An object never reads the object that holds it.
- **Services** hold the business rules. A business rule is any rule that needs a setting, the trip brief, or another object, including one inside the items of a list. Examples: a trip is at most the maximum trip length, a candidate isn't a rejected place, and a stop's search area fits its day. See section 4.
- **The tools and persistence** hold one rule: a started trip can't be changed. A tool refuses a write to a started trip before it changes anything. Persistence refuses it again when the trip is saved. Objects and services don't check it (see Trip).

A tool can add its own checks on what an agent passes in, but it never holds a rule about the data, except the started-trip lock.

**Hard and soft rules.** A hard rule refuses the change. A soft rule lets the change through, and the `FeasibilityChecker` gives a warning (section 4.7). Soft rules are kept to a minimum. Today there's one: a stop's search area has to fit its day. It's hard when the stop is added. It's soft after a move or a change to the stays, so the coordinator can sort stops out in steps. The other checks, such as daily driving and opening hours, aren't rules about the data. They describe problems with the plan.

**Setting properties.** A stored property can be set directly, unless it's marked `{readOnly}` or `{viaService}`. The value has to fit its type and the property's own rules, such as a range. Setting the property runs those rules, and refuses a value that breaks one. The properties table and the object's rules say what they are. How code runs them, such as with a setter, is settled during development. Worked-out properties can't be set.

**Three markers** go after a property's type. In the diagram's source, each is written with `#123;` and `#125;` for the braces, because Mermaid can't take braces there.

- **`{readOnly}`:** the property is never set directly. Either it never changes once its object exists, such as a stop's `kind`, or it changes only through the object's own operation, which its notes name. Example: the trip's `checkResults` changes only through `Trip.replaceCheckResults()`.
- **`{viaService}`:** the property changes only through a service operation, which its notes name. Example: a stop's `setTime` changes only through `StopsService.setStopTime()`, since a rest day's stops each need a set time. A property is `{viaService}` when any change to it needs a business rule. Then every change to it goes through a service, even one that needs no business rule, so there's one way to change it. Example: adding a stay needs the maximum trip length, so moving one goes through `StaysService` too. In TypeScript, the object's change method for the property is kept out of the domain package's public API, so only services can reach it. That change method still runs the object's own rules. It isn't listed as an operation.
- **`{keepsValue}`:** the property starts empty, and can't be emptied once it has a value. Setting it to empty is refused. Example: the itinerary's `startPlace`.

A property has at most one of `{readOnly}` and `{viaService}`. `{keepsValue}` can go with either, such as the trip brief's `tripLengthInDays`. Reading a read-only or via-service list gives a copy that can't be changed, frozen where the language allows. So changing the copy can never change the stored list. In the properties tables, the type says "read only," "via service," or "keeps its value" instead.

**Operations** are listed only for a change that goes beyond setting one property: one that creates or removes objects, changes a list, or has to change other stored data with it. An operation on an object runs only that object's integrity rules, and is named for what it changes, such as `PlacesRegistry.addPlaces()`. A change that needs a business rule is a service operation instead (section 4). An object never creates itself. Code outside it does, such as a service, or the object that holds it, such as `Trip.createSession()`. An object's own rules also run when it's created, and creating one that breaks them is refused. Example: a meal stop needs a tier. For each operation, the object's or service's section says what it changes, what follows on from it, and what it refuses.

**Arguments and returns.** Each operation gives its arguments and what it returns, such as `addPlaces(places : List<Place>) : List<Place>`. An argument that can be empty has a `?` after its type. An operation with nothing after its parentheses returns nothing. These are guidance for development. Development can change them, but each change is flagged and written back here.

**Services** hold the business rules, and no data. There's one for each kind of object with business rules: `TripBriefService`, `PlacesService`, `StaysService`, `DaysService`, and `StopsService`. The `FeasibilityChecker` is one too. Each is created for one trip, and its operations take the itinerary and the objects to change. Services never call each other. Each section says what its service is given. A refused call changes nothing, because the write it's part of is thrown away (below). They hold no stored data, so they aren't in the diagram. See section 4.

**The places registry** holds the trip's places and rejected places. It holds stored data, so it's in the diagram. The trip holds it, and code passes it into the services that need it. Example: `StopsService` asks it whether a place is rejected before adding a candidate. Its operations run only its own integrity rules. See Trip (section 3.1) and section 4.

**The calendar** is a set of lookup functions over the itinerary, such as a day's date, the day before it, or the stay it starts from. It holds no data, so it isn't in the diagram. It's there because an object can't see the object that holds it, or the one beside it. Example: San Francisco Day 2 starts at the Monterey stay only because the day before it sleeps there, and only the itinerary sees which day comes before. So "where Day 2 starts" is the calendar's `startStayOf()`, not a property of the day. Code passes the calendar into the services that need it. See section 4.1.

**At the end of every write.** Some follow-ons come from a whole write, not from one property or operation. A write is one set of changes saved together. Three are known:

- **Re-route legs.** Every leg whose start, end, selected places in order, or waypoints changed is re-routed (technical spec 3.5).
- **Check results.** After a coordinator write, the `FeasibilityChecker` works out the current check results, compares them with the trip's saved list, and replaces the list (section 4.7). A worker's write doesn't run the checks (technical spec section 8).
- **Last updated.** The trip's `lastUpdatedDateTime` is set to now.

**A write is likely a transaction.** Code loads the trip, makes the changes on that copy, and saves only if nothing was refused. A refusal throws the copy away, so nothing is left half changed. Example: `StopsService.moveStop()` takes a stop off Day 2, then Day 3 refuses it. The copy is thrown away, so Day 2 never lost the stop. This is also where the follow-ons above would run, and where parallel worker writes are kept from losing each other's work. None of it is settled. It's carried to the persistence design and round 3, with the Leg. Until then, the sections below say a follow-on happens "at the end of the write."

---

## 2. Class diagram

The diagram shows only classes that hold stored data. The services and the calendar hold none, so they're in section 4 instead.

How to read the lines: a filled diamond means the object at that end holds the other one, which goes away with it. An arrow means the object points to another one it doesn't hold. An open triangle means the object below is one kind of the object above. The label on a line is the property, in the box at the line's start, that holds the link. The numbers say how many: `1` is exactly one, `0..1` is zero or one, `*` is any number, and `1..*` is one or more. Operations end in `()`.

```mermaid
classDiagram
    direction TB

    class User {
        id : string #123;readOnly#125;
    }

    class Trip {
        id : string #123;readOnly#125;
        lastUpdatedDateTime : dateTime
        owner : User #123;readOnly#125;
        tripBrief : TripBrief #123;readOnly#125;
        itinerary : Itinerary #123;readOnly#125;
        placesRegistry : PlacesRegistry #123;readOnly#125;
        checkResults : List~CheckResult~ #123;readOnly#125;
        sessions : List~Session~ #123;readOnly#125;
        /name : string?
        /hasStarted : boolean
        createSession(firstUserMessage : string) Session
        replaceCheckResults(checkResults : List~CheckResult~)
    }

    class Session {
        id : string #123;readOnly#125;
        createdDateTime : dateTime #123;readOnly#125;
        title : string #123;readOnly#125;
        transcript : Transcript
        resume()
    }

    class PlacesRegistry {
        places : List~Place~ #123;readOnly#125;
        rejectedPlaces : List~RejectedPlace~ #123;viaService#125;
        addPlaces(places : List~Place~) List~Place~
        isRejected(place : Place) boolean
    }

    class RejectedPlace {
        place : Place #123;readOnly#125;
        reason : string #123;readOnly#125;
    }

    class TripBrief {
        id : string #123;readOnly#125;
        focus : string? #123;keepsValue#125;
        tripLengthInDays : integer? #123;keepsValue#125; #123;viaService#125;
        interestsText : string? #123;keepsValue#125;
        mustSeesText : string? #123;keepsValue#125;
        maxDrivingInHours : decimal? #123;keepsValue#125; #123;viaService#125;
        routePreference : RouteType? #123;keepsValue#125;
        restDaysText : string? #123;keepsValue#125;
        usualStartTime : time = 8:00 a.m.
        defaultTier : Tier? #123;keepsValue#125;
        budgetRulesText : string? #123;keepsValue#125;
        mealPreferencesText : string? #123;keepsValue#125;
    }

    class Itinerary {
        id : string #123;readOnly#125;
        startDate : date? #123;keepsValue#125;
        startPlace : Place? #123;keepsValue#125;
        endPlace : Place? #123;keepsValue#125;
        stays : List~Stay~ #123;viaService#125;
        lastDay : LastDay #123;readOnly#125;
        /days : List~Day~
        /endDate : date?
        /dayCount : integer
        /totalDriveTimeInMinutes : integer
    }

    class Stay {
        id : string #123;readOnly#125;
        place : Place
        lodging : Place? #123;readOnly#125;
        lodgingCandidates : List~Candidate~ #123;viaService#125;
        tier : Tier #123;readOnly#125;
        tierRule : string #123;readOnly#125;
        tierSetForNightCount : integer #123;readOnly#125;
        days : List~StayDay~ #123;viaService#125;
        weatherText : WeatherText? #123;viaService#125;
        /nightCount : integer
        /sleepsAt : Place
        setTier(tier : Tier, tierRule : string)
        selectCandidate(place : Place)
    }

    class WeatherText {
        guidance : string #123;readOnly#125;
        label : WeatherLabel #123;readOnly#125;
        writtenOnDate : date #123;readOnly#125;
        writtenForPlace : Place #123;readOnly#125;
        writtenForDates : List~date~ #123;readOnly#125;
        writtenForActivities : List~ActivityRecord~ #123;readOnly#125;
    }

    class ActivityRecord {
        stopId : string #123;readOnly#125;
        selectedPlace : Place? #123;readOnly#125;
    }

    class Day {
        id : string #123;readOnly#125;
        ownStartTime : time?
        stops : List~Stop~ #123;viaService#125;
        leg : Leg? #123;readOnly#125;
        approvals : List~Approval~ #123;viaService#125;
    }

    class StayDay {
        isRestDay : boolean = false #123;viaService#125;
    }

    class LastDay {
    }

    class Leg {
        driveTimeInMinutes : integer
        distanceInMiles : decimal
        routeLine : string
        segmentDriveTimesInMinutes : List~integer~
        stopsInBestOrder : List~Stop~
        timeSavedInMinutes : integer?
        waypoints : List~Place~
        /from : Place
        /to : Place
        /routeType : RouteType
        setWaypoints()
        reRoute()
    }

    class Stop {
        id : string #123;readOnly#125;
        kind : StopKind #123;readOnly#125;
        purpose : string #123;readOnly#125;
        searchArea : SearchArea #123;readOnly#125;
        searchAreaStay : Stay? #123;readOnly#125;
        setTime : scheduleTime? #123;viaService#125;
        visitTimeInMinutes : integer?
        tier : Tier? #123;readOnly#125;
        tierRule : string? #123;readOnly#125;
        selectedPlace : Place? #123;viaService#125;
        candidates : List~Candidate~ #123;viaService#125;
        approvals : List~Approval~ #123;viaService#125;
        /status : StopStatus
        setTier(tier : Tier, tierRule : string)
    }

    class Candidate {
        rationale : string #123;readOnly#125;
        tier : Tier? #123;readOnly#125;
        tierRule : string? #123;readOnly#125;
        howFound : HowFound #123;readOnly#125;
        sourceLink : string? #123;readOnly#125;
        notesText : string? #123;readOnly#125;
        visitTimeEstimateInMinutes : integer? #123;readOnly#125;
        detourTimeInMinutes : integer? #123;readOnly#125;
        setNumber : integer #123;readOnly#125;
        place : Place #123;readOnly#125;
    }

    class Place {
        id : string #123;readOnly#125;
        googlePlaceId : string?
        latitude : decimal
        longitude : decimal
        address : string
        name : string
        type : string?
        rating : decimal?
        reviewCount : integer?
        priceLevel : string?
        weekdayHoursLines : List~string~
        summaries : List~string~
        links : List~string~
        openingPeriods : List~OpeningPeriod~
        /shortLine : string
    }

    class OpeningPeriod {
        openDay : Weekday
        openTime : time
        closeDay : Weekday
        closeTime : time
    }

    class Approval {
        reason : string #123;readOnly#125;
    }

    class DriveHoursApproval {
        approvedDrivingInHours : decimal #123;readOnly#125;
    }

    class RouteTypeApproval {
        approvedRouteType : RouteType #123;readOnly#125;
    }

    class OpeningHoursApproval {
        approvedOpenTimeInMinutes : integer #123;readOnly#125;
    }

    class CheckResult {
        check : CheckKind #123;readOnly#125;
        subjectId : string #123;readOnly#125;
        text : string #123;readOnly#125;
        isApproved : boolean #123;readOnly#125;
        hasEmptyStopBefore : boolean #123;readOnly#125;
        /level : CheckLevel
    }

    Trip --> "1" User : owner
    Trip *-- "*" Session : sessions
    Trip *-- "1" TripBrief : tripBrief
    Trip *-- "1" Itinerary : itinerary
    Trip *-- "1" PlacesRegistry : placesRegistry
    Trip *-- "*" CheckResult : checkResults
    PlacesRegistry *-- "*" Place : places
    PlacesRegistry *-- "*" RejectedPlace : rejectedPlaces
    RejectedPlace --> "1" Place : place

    Itinerary --> "0..1" Place : startPlace
    Itinerary --> "0..1" Place : endPlace
    Itinerary *-- "*" Stay : stays
    Itinerary *-- "1" LastDay : lastDay

    Stay --> "1" Place : place
    Stay --> "0..1" Place : lodging
    Stay *-- "1..*" StayDay : days
    Stay *-- "*" Candidate : lodgingCandidates
    Stay *-- "0..1" WeatherText : weatherText

    WeatherText --> "1" Place : writtenForPlace
    WeatherText *-- "*" ActivityRecord : writtenForActivities
    ActivityRecord --> "0..1" Place : selectedPlace

    Day *-- "*" Stop : stops
    Day *-- "0..1" Leg : leg
    Day *-- "*" Approval : approvals

    Leg --> "*" Place : waypoints

    Stop --> "0..1" Place : selectedPlace
    Stop --> "0..1" Stay : searchAreaStay
    Stop *-- "*" Candidate : candidates
    Stop *-- "*" Approval : approvals

    Candidate --> "1" Place : place

    Place *-- "*" OpeningPeriod : openingPeriods

    Day <|-- StayDay
    Day <|-- LastDay

    Approval <|-- DriveHoursApproval
    Approval <|-- RouteTypeApproval
    Approval <|-- OpeningHoursApproval
```

The fixed lists that properties above use:

```mermaid
classDiagram
    class Tier {
        <<enumeration>>
        value
        midRange
        posh
    }
    class RouteType {
        <<enumeration>>
        scenic
        fastest
    }
    class StopKind {
        <<enumeration>>
        meal
        attraction
    }
    class SearchArea {
        <<enumeration>>
        nearStay
        alongLeg
        nearStartPlace
        nearEndPlace
    }
    class StopStatus {
        <<enumeration>>
        empty
        proposed
        selected
    }
    class HowFound {
        <<enumeration>>
        google
        webSearch
        specifiedByUser
    }
    class WeatherLabel {
        <<enumeration>>
        forecast
        seasonalAverages
    }
    class Weekday {
        <<enumeration>>
        sunday
        monday
        tuesday
        wednesday
        thursday
        friday
        saturday
    }
    class ApprovalKind {
        <<enumeration>>
        driveHours
        routeType
        openingHours
    }
    class CheckLevel {
        <<enumeration>>
        warning
        note
    }
    class CheckKind {
        <<enumeration>>
        tripLengthVsBrief
        dailyDriving
        openingHoursNotLongEnough
        openingHoursClosed
        openingHoursNotKnown
        lateForSetTime
        stopOrder
        searchAreaDoesNotFitDay
        weatherOutOfDate
        forecastNowAvailable
        stayTierSetForDifferentNights
    }
```

---

## 3. Objects

### 3.1 Trip

The trip is one planned road trip. Everything else in this model belongs to a trip, except the user.

**Held as:** an entity. Its `id` is one we create. It has the prefix `trip_` (technical spec 7.1). Agents never see it: each session's tools are made with the trip already set, so no tool takes a trip ID (tool design section 4).

**Created and changed by:** the app creates it when the user starts a new conversation from the home screen (functional spec 10.1), and creates its sessions. Code replaces its check results and sets when it was last updated. Everything else changes through the objects it holds, or through the services (section 4).

| Property | Stored or worked out | Type | Notes |
|---|---|---|---|
| `id` | Stored | `string`, read only | Never shown to agents or users |
| `owner` | Stored | `User`, read only | Set when the trip is created. A user holds nothing else in this model yet: sign-in details are settled during development, and memory is left out |
| `tripBrief` | Stored | `TripBrief`, an entity held by the trip, read only | Created with the trip, empty except for its usual start time |
| `itinerary` | Stored | `Itinerary`, an entity held by the trip, read only | Created holding only its last day |
| `placesRegistry` | Stored | `PlacesRegistry`, held by the trip, read only | The trip's places and rejected places. Created with the trip, empty. Code passes it into the services that need it. See below |
| `checkResults` | Stored | `List<CheckResult>`, in no order, read only | The check results that applied after the last coordinator write. Only replaced as a whole, never added to. See `replaceCheckResults()` |
| `sessions` | Stored | `List<Session>`, in the order created, read only | Only `createSession()` adds to it, and nothing removes from it. See Session, below |
| `lastUpdatedDateTime` | Stored | `dateTime` | Set at the end of every write. See below |
| `name` | Worked out | `string?` | The trip brief's `focus` and the start month, such as "Pacific Coast Highway, May 2027." See below |
| `hasStarted` | Worked out | `boolean` | True when today's date is on or after the itinerary's `startDate`. False while the itinerary has no `startDate`. Today's date is looked up when needed, in the start place's time zone (see Rules) |

**`name`.** It's built from the trip brief's `focus` and the itinerary's start month, such as "Pacific Coast Highway, May 2027" (functional spec 10.1). While `focus` is empty, the name is empty, and the home screen shows "New trip." While the itinerary has no `startDate`, the name is `focus` alone. Renaming a trip isn't in the MVP.

**`lastUpdatedDateTime`.** Code sets it at the end of every write (section 1): to the trip brief, the itinerary, candidates, weather text, or rejected places. That includes worker writes. A refused write changes nothing, so it doesn't count. Neither does a read, or saving places from a search, since the plan doesn't change. The home screen shows it (functional spec 3).

**Session.** One conversation with the agent about this trip (functional spec 10.1). It's an entity held by the trip. Its `id` has the prefix `session_`, and agents never see it.

| Property | Stored or worked out | Type | Notes |
|---|---|---|---|
| `id` | Stored | `string`, read only | Never shown to agents or users |
| `createdDateTime` | Stored | `dateTime`, read only | The trip's session list shows its date |
| `title` | Stored | `string`, read only | A few words for the trip's session list. Set when the session is created, from the user's first message, cut to about 60 characters at a word break. Example: "Can we add a night in Big Sur and drop one in…" |
| `transcript` | Stored | `Transcript` | The conversation, restored when the user resumes the session. The Agent SDK may keep it, so its shape isn't part of this model |

A session is created and begins at the same moment, so it has no separate "start." It's never closed. The user just leaves, and can resume it later.

- **`resume()`.** The app runs it when the user picks a session from the trip's list. It restores the transcript, and the coordinator continues with that conversation's context. It works on a started trip too.

**PlacesRegistry.** Every place found for the trip, and the places the user rejected. It's held by the trip in `placesRegistry`, with no `id`, and created with the trip. The trip holds it so that it's saved with the trip. Code passes it into the services that need it, such as `StopsService`, which refuses a rejected place as a candidate (section 4). Its operations run only its own rules.

| Property | Stored or worked out | Type | Notes |
|---|---|---|---|
| `places` | Stored | `List<Place>`, in no order, read only | Every place a tool has returned for this trip, including search results never offered. Each is stored once. Only `addPlaces()` adds to it, and nothing removes from it |
| `rejectedPlaces` | Stored | `List<RejectedPlace>`, in the order rejected, via service | Only `PlacesService.rejectPlaces()` adds to it, and nothing removes from it: taking a rejection back is out of scope (functional spec 2). It's via service so that a rejection is never recorded without the place also leaving every stop's and stay's candidates (section 4.3) |

**RejectedPlace.** Held by the places registry, with no `id` of its own. It holds `place : Place` and `reason : string`, both read only. The reason is the user's, such as "too kitschy for us." Creating one with an empty reason is refused. The place itself stays in `places`, so the tool `find_place` can still return it, marked rejected with the reason (technical spec 3.2).

The registry's operations:

- **`addPlaces(places : List<Place>) : List<Place>`** (code, whenever a search or lookup returns places). Takes one or more places and adds each to `places`. A place the registry already has, matched by `googlePlaceId`, isn't added again: the stored record is reused (see Place). Returns the stored places in the order given, so the caller gets the existing record's `id` for a place the trip already had.
- **`isRejected(place : Place) : boolean`.** True when the place is in `rejectedPlaces`. The services use it to refuse a rejected place as a candidate. The search tools use it to leave rejected places out of their results.

The registry keeps a change method for `rejectedPlaces` that only services reach (section 1). It runs the registry's own rules:

- **A place already rejected is skipped** without a word, like adding to a set. It keeps its first reason, and the new one is dropped.
- **A rejection whose place isn't in `places` is refused,** and so is the whole call.

**A new trip** is created by code outside the trip, when the user starts a new conversation from the home screen. It starts with a trip brief that holds only its usual start time, an itinerary holding only its last day, an empty places registry, and empty `checkResults`. Then `createSession()` creates its first session.

**Operations:**

- **`createSession(firstUserMessage : string) : Session`.** The app runs it when the user sends the first message of a new trip, or of a new session on a trip. It creates a session, sets its `title` from `firstUserMessage`, adds it to `sessions`, and returns it. The coordinator gets no earlier transcripts. It begins by reading the itinerary, the trip brief, and memory (technical spec 5.2). It works on a started trip too.
- **`replaceCheckResults(checkResults : List<CheckResult>)`** (the `FeasibilityChecker`, at the end of every write that runs the checks). Takes the full list of current check results, which can be empty. Replaces the whole of `checkResults` in one step. Nothing can add to the list or remove one result from it. The trip only stores the list. Working out the results and comparing them with the saved list is the `FeasibilityChecker`'s job (section 4.7).
  - **Refused:** the whole call, when two check results have the same `check` and `subjectId`. Example: a stop can have an `openingHoursClosed` result and a `lateForSetTime` result, but not two of either.

**Rejecting places** is `PlacesService.rejectPlaces()` (section 4.3), the tool `reject_places`. It changes stops and stays all over the itinerary, as well as the registry.

**Rules:**

- **A trip belongs to one user.** Only that user, and the agents in that user's sessions, can reach it (functional spec 10.4).
- **A started trip can't be changed.** Once `hasStarted` is true, every write that changes the plan is refused, and the error says the trip has started (technical spec section 8). That covers the trip brief, the itinerary, candidates, weather text, and rejected places. Objects and services don't check this. The tools check it before a write, and persistence checks it again when the trip is saved (section 1). Persistence still saves a started trip's new sessions, and places saved from searches, since neither changes the plan. Reads still work, and sessions can still be created and resumed.
- **Today's date is the date in the start place's time zone,** since that's where the trip begins. It isn't a property of the trip. Code looks it up when a rule needs it, with the calendar's `today()` (section 4.1). The start-date check, the started-trip lock, and the forecast rules all use it (technical spec 5.2).
- **All of a trip's times are in the start place's time zone.** A trip that crosses into another time zone shows times off by the difference after the border. That's a known limit of this version.
- **The trip brief holds what the user wants. The itinerary holds the plan.** No fact is stored in both. Changing the brief never changes the itinerary. The checks compare them, and the coordinator changes the plan with the user (technical spec 3.1).
- **Places are kept per trip.** Each trip has its own places registry. A place found for one trip, such as a friend's address, is never visible from another trip (functional spec 10.4).

### 3.2 Trip brief

The trip brief holds what the user wants from the trip: the items in functional spec 5.2. The itinerary holds the plan, and the checks compare the two (see Trip).

**Held as:** an entity held by the trip. Its `id` has the prefix `brief_` (technical spec 7.1). Agents never see it: a trip has one brief, so the tools find it from the trip.

**Created and changed by:** the app creates it with the trip, empty except for `usualStartTime`. Each item is set directly, except `tripLengthInDays` and `maxDrivingInHours`. Their limits are settings, so they change through `TripBriefService` (section 4.2). Today only the coordinator sets them, through the tool `update_trip_brief`. Workers never read it. Each gets the parts it needs in its worker brief (technical spec 5.3).

| Property | Stored or worked out | Type | Notes |
|---|---|---|---|
| `id` | Stored | `string`, read only | Never shown to agents or users |
| `focus` | Stored | `string?`, keeps its value | What the trip is about: a region, a route, or a theme, such as "Pacific Coast Highway" or "Texas barbecue." The trip's `name` starts with it |
| `tripLengthInDays` | Stored | `integer?`, keeps its value, via service | How many days the user wants. At least 1. Changes only through `TripBriefService.setTripLength()`, which also refuses more than the maximum trip length (section 4.2). The trip length check compares the itinerary's `dayCount` with it |
| `interestsText` | Stored | `string?`, keeps its value | In the user's words, with why they matter |
| `mustSeesText` | Stored | `string?`, keeps its value | In the user's words, with why they matter. A must-see can be one place, an area, a road, or an activity. It records no kind and links to no place. A must-see that is one place is linked through the stop the coordinator selects for it |
| `maxDrivingInHours` | Stored | `decimal?`, keeps its value, via service | The most driving the user wants in one day. More than 0. Changes only through `TripBriefService.setMaxDriving()`, which also refuses more than the maximum daily driving (section 4.2). The daily driving check compares each day with it. It's a default, not a hard limit: a day can go over it with a drive hours approval |
| `routePreference` | Stored | `RouteType?`, keeps its value | Scenic or fastest. Each leg's route type, unless its day holds a route type approval (see Leg) |
| `restDaysText` | Stored | `string?`, keeps its value | In the user's words, such as "one day off in Moab." The coordinator decides which days, and marks them on the days |
| `usualStartTime` | Stored | `time`, 8:00 a.m. by default | When the party usually gets going. A day without a start time of its own starts at this time |
| `defaultTier` | Stored | `Tier?`, keeps its value | The tier for lodging and meals when no budget rule covers them. The coordinator reads it when it resolves each stay's and meal stop's tier (technical spec section 9). Code doesn't read it |
| `budgetRulesText` | Stored | `string?`, keeps its value | In the user's words, such as "mid-range for stays of 2+ nights" |
| `mealPreferencesText` | Stored | `string?`, keeps its value | In the user's words, such as "local cafés over hotel breakfast" |

**Required items can still be empty.** Functional spec 5.2 marks most items as required. That means the coordinator establishes each one during discovery. It doesn't mean the brief refuses to be empty while discovery is still going.

**Code reads only a few items.** It reads `focus` for the trip's name, and `tripLengthInDays`, `maxDrivingInHours`, `routePreference`, and `usualStartTime` for the checks and the schedule. Only the agents read the rest. That's why each text item is one string, not a list.

**Operations:** none. Each item is set directly, or through `TripBriefService`, and its own rules run when it's set. When the tool `update_trip_brief` sets several items in one write and one is refused, the whole write is refused, and nothing changes. The error names the item and the rule.

**Rules:**

- **An item can be changed, but never emptied** (functional spec 10.5: trip brief items can be changed but not forgotten). Every item but `usualStartTime` is `{keepsValue}`, and `usualStartTime` is never empty. The coordinator needs every item it has to plan.
- **`tripLengthInDays` is at least 1.** The maximum trip length is a setting, so `TripBriefService` holds that limit (section 4.2).
- **`maxDrivingInHours` is more than 0.** The maximum daily driving is a setting, so `TripBriefService` holds that limit (section 4.2).
- **A check that compares against an empty item is skipped** (technical spec section 8). Example: during discovery, setting the start and end places routes the last day's leg before the user has given max driving hours, so the daily driving check doesn't run yet.
- **Changing the brief never changes the itinerary** (see Trip). Example: if the user shortens the trip from five days to four, nothing in the itinerary moves. The trip length check warns, and the coordinator removes a night with the user.

### 3.3 Check result

A check result is one finding from the feasibility checks in technical spec section 8, such as a day that drives longer than the user's max. Each one is a warning or a note. A check that refuses a write, such as a trip over the maximum length, gives an error, not a check result.

**Held as:** held by the trip's `checkResults`, with no `id`. That list holds the check results that applied after the last coordinator write. It's kept only so later writes and reads can tell which check results are new.

**Created and changed by:** the `FeasibilityChecker`, in code (section 4.7). A saved check result never changes. The whole list is replaced instead (`Trip.replaceCheckResults()`).

| Property | Stored or worked out | Type | Notes |
|---|---|---|---|
| `check` | Stored | `CheckKind`, read only | Which check found it. Each kind is one row of the table in technical spec section 8 |
| `subjectId` | Stored | `string`, read only | The ID of what it's about: the trip, a stay, a day, or a stop. It's an ID, not a link, because a write can remove the stop or stay before the compare runs (below) |
| `text` | Stored | `string`, read only | What the check found, such as "Day 4 needs about 5 h 20 m of driving. You agreed to 5." A current check result always has current text. The saved text is used only to describe a check result that went away |
| `isApproved` | Stored | `boolean`, read only | True when an approval that covers it applies (see Approval, and `FeasibilityChecker.isApplying()` in section 4.7). Always false for a check no approval covers |
| `hasEmptyStopBefore` | Stored | `boolean`, read only | For `openingHoursNotLongEnough` and `openingHoursClosed` only: true when an earlier stop on the same day is still empty, so the time checked may be too early (technical spec section 8). False for every other check. See the rules |
| `level` | Worked out | `CheckLevel` | Warning or note. It comes from `check`, in the table below |

**The checks.** Each `CheckKind` has one level and one kind of subject:

| `check` | Technical spec section 8 row | Level | About | Approval that covers it |
|---|---|---|---|---|
| `tripLengthVsBrief` | Trip length vs the brief | Warning | The trip | None |
| `dailyDriving` | Daily driving | Warning | A day | Drive hours |
| `openingHoursNotLongEnough` | Opening hours: open, but not long enough | Warning | A stop | Opening hours |
| `openingHoursClosed` | Opening hours: closed for the whole visit | Warning | A stop | Opening hours |
| `openingHoursNotKnown` | Opening hours: not known | Note | A stop | None |
| `lateForSetTime` | Late for a set time | Warning | A stop | None |
| `stopOrder` | Stop order | Note | A day | None |
| `searchAreaDoesNotFitDay` | Search area doesn't fit the day | Warning | A stop | None |
| `weatherOutOfDate` | Weather out of date | Note | A stay | None |
| `forecastNowAvailable` | Forecast now available | Note | A stay | None |
| `stayTierSetForDifferentNights` | Stay tier set for different nights | Note | A stay | None |

**The `FeasibilityChecker`** works out the check results, compares them with the saved list, and decides which are new. It's a service, so it's in section 4.7, with when it runs and which check results count as new.

**Rules:**

- **At most one check result per check and subject.** `Trip.replaceCheckResults()` refuses a list that breaks this.
- **Only the two opening-hours warnings can have an empty stop before.** A check result with `hasEmptyStopBefore` true and any other `check` is refused when it's created. An empty stop takes no time, so the stops after it may really come later. A place that looks closed at 1:10 may be open by 2:00, so an opening-hours warning may go away. A late or driving warning would only get worse, so it's real. `openingHoursNotKnown` doesn't depend on the time at all (technical spec section 8).

### 3.4 Itinerary

The itinerary is the plan: where the trip starts and ends, when it starts, its stays, and its days.

**Held as:** an entity held by the trip. Its `id` has the prefix `itin_` (technical spec 7.1). Agents never see it: a trip has one itinerary, so the tools find it from the trip.

**Created and changed by:** the app creates it with the trip, and code creates its last day at the same time. The coordinator sets the start place, end place, and start date directly, with the tool `update_itinerary`. It adds, moves, and removes stays, and sets their nights, through `StaysService`, with the tools `add_stay`, `update_stay`, and `remove_stay` (section 4.4). `StaysService` adds and removes a stay's days as its nights change. Nothing else adds or removes a day.

| Property | Stored or worked out | Type | Notes |
|---|---|---|---|
| `id` | Stored | `string`, read only | Never shown to agents or users |
| `startPlace` | Stored | `Place?`, keeps its value | Where the trip starts. Empty until the coordinator sets it during discovery. See below |
| `endPlace` | Stored | `Place?`, keeps its value | Where the trip ends. The same place as `startPlace` on a loop trip. Empty until the coordinator sets it during discovery. See below |
| `startDate` | Stored | `date?`, keeps its value | The first day's date. Empty until the coordinator sets it during discovery. See below |
| `stays` | Stored | `List<Stay>`, in order, via service | The shape of the trip. Each stay is an entity held by the itinerary, and holds its own days. Changes only through `StaysService.addStay()`, `moveStay()`, and `removeStay()` (section 4.4) |
| `lastDay` | Stored | `LastDay`, an entity held by the itinerary, read only | Created with the itinerary. Never replaced or removed |
| `days` | Worked out | `List<Day>`, in order | Each stay's days, in the stays' order, then `lastDay`. The calendar works out a day's date and number from its place in this list (section 4.1) |
| `endDate` | Worked out | `date?` | The last day's date: `startDate` plus `dayCount` minus one day. Empty while there's no `startDate` |
| `dayCount` | Worked out | `integer` | How many days the trip has, counting the last day. This is the trip's length. At least 1. `StaysService` holds the maximum (section 4.4) |
| `totalDriveTimeInMinutes` | Worked out | `integer` | The sum of every leg's `driveTimeInMinutes`, without the drive buffer. The trip summary shows it (functional spec 9.1). A leg with no route yet adds nothing |

**Stays hold their days.** Each stay holds the days that end with a night there, so a stay's nights are the days it holds (functional spec 4, Night). The last day ends at the end place with no night, so the itinerary holds it on its own (functional spec 4, Last day). The stays are the shape of the trip, and are what the user and coordinator change. `days` puts all the days together in order.

A day touches two stays: it starts where the party slept and ends where it sleeps. It's held by the stay where it sleeps. Where it starts is worked out from the day before in `days`, or from the start place on the first day. The day can't see the day before it, so the calendar works that out (`startStayOf()`, section 4.1). Example: San Francisco Day 2 is held by the San Luis Obispo stay, and starts from the Monterey stay. A stop on Day 2 can still be near the Monterey stay, such as breakfast before the drive. That's a link from the stop to the stay, not ownership (see Stop).

**Total drive time leaves out the buffer.** It adds up the drive times Google gave, the same figure each leg shows (functional spec 9.4). The buffer for fuel and short breaks is part of the daily driving check and the day's schedule, where it spaces out the times (technical spec section 8).

**Start and end places.** Each is set directly, and can't be emptied once set. When Google has no name for the place, such as "Mike's house," the place takes the name the coordinator gives it (see Place). A new start or end place re-routes the first or last day's leg at the end of the write. Stops near the start or end place keep their candidates and selection. Nothing checks that a place is in the contiguous US (functional spec 1). That check is hard to do well at this level, so the risk is accepted. The coordinator keeps the trip in the US.

**Start date.** Set directly, and can't be emptied once set. A new start date moves every day's date, since dates are worked out. Nothing is re-routed. The checks at the end of the write see the new dates, such as a stop that now falls on a day its place is closed. Setting it is refused:

- **While `startPlace` is empty,** since today's date comes from the start place's time zone. When the tool `update_itinerary` gets a start place and a start date in one call, it sets the place first.
- **When the date isn't after today.**

**Operations:** none of its own. Its `stays` change only through `StaysService`, because adding a stay or changing its nights needs the maximum trip length, a setting. The itinerary keeps a change method for `stays` that only services reach (section 1). It runs the itinerary's own rules: a stay is in the list once, and `after` is one of its stays and isn't the stay being placed. The operations that were drafted here moved to services:

- **Adding, moving, and removing a stay** are `StaysService.addStay()`, `moveStay()`, and `removeStay()` (section 4.4).
- **Setting a stay's nights** is `StaysService.setNightCount()` (section 4.4). It changes one stay's days, and the trip length limit is a setting.
- **Moving a stop** is `StopsService.moveStop()` (section 4.6). It can take a stop off one day and put it on another.

**Rules:**

- **A trip has at least 1 day,** since it always has its last day. The maximum trip length is a setting, so `StaysService` refuses a change that would go over it (section 4.4).
- **The last day is created with the itinerary and never removed.** It has no stay: the party drives to the end place and doesn't sleep anywhere on the trip. A day trip is just the last day. Example: on the San Francisco trip, the Monterey stay holds Day 1, the San Luis Obispo stay holds Day 2, and Day 3 is the last day.
- **A day keeps its ID when its number or date changes.** Removing a night removes that stay's last day. Every later day keeps its ID and moves up one. Check results match by their subject's ID, and approvals sit on days, so both depend on this.
- **The start date is after today when it's set.** Once today reaches it, the trip has started and can't change (see Trip).

### 3.5 Stay

A stay is an overnight location, for one or more nights (functional spec 4). It holds the days that end with a night there.

**Held as:** an entity held by the itinerary, in `stays`. Its `id` has the prefix `stay_` (technical spec 7.1).

**Created and changed by:** `StaysService.addStay()` creates it when the coordinator adds a stay with the tool `add_stay`, with its place, its nights, and its tier and rule, and puts it in the itinerary. The coordinator changes its place and tier with the tool `update_stay`, and selects its lodging. A stay researcher adds lodging candidates, and the weather worker sets its weather text, both through `StaysService`. `StaysService` also moves and removes stays, and changes their nights (section 4.4).

| Property | Stored or worked out | Type | Notes |
|---|---|---|---|
| `id` | Stored | `string`, read only | Agents see it. Users never do |
| `place` | Stored | `Place` | Where it is, usually a town, such as Moab. Set directly. See below |
| `lodging` | Stored | `Place?`, read only | Where the party sleeps, such as a hotel, a campground, or a friend's house. Empty until selected. Always one of `lodgingCandidates`. Changes only through `selectCandidate()`, or when its candidate is removed by a rejection (`PlacesService.rejectPlaces()`, section 4.3) |
| `lodgingCandidates` | Stored | `List<Candidate>`, in the order offered, via service | Every lodging candidate offered and not rejected. Changes only through `StaysService.addLodgingCandidates()`, or when `PlacesService.rejectPlaces()` removes one |
| `tier` | Stored | `Tier`, read only | The lodging's budget tier (technical spec section 9). Changes only through `setTier()` and `selectCandidate()` |
| `tierRule` | Stored | `string`, read only | The user's rule that produced the tier, such as "mid-range for stays of 2+ nights" |
| `tierSetForNightCount` | Stored | `integer`, read only | The stay's nights when its tier was last set. See below |
| `days` | Stored | `List<StayDay>`, in order, via service | One for each night. Created with the stay. Changes only through `StaysService.setNightCount()` |
| `weatherText` | Stored | `WeatherText?`, via service | Weather and clothing guidance. Empty until the weather worker writes it. Changes only through `StaysService.setWeatherText()` |
| `nightCount` | Worked out | `integer` | How many days it holds |
| `sleepsAt` | Worked out | `Place` | `lodging` once one is selected, and `place` until then. Legs start and end here (see Leg) |

**Worked out by the calendar.** A stay's position, its dates, its activities, and whether its weather text is out of date need the itinerary, so the calendar works them out: `orderOf()`, `datesOf()`, `activitiesOf()`, and `isWeatherOutOfDate()` (section 4.1).

**Creating a stay.** `StaysService.addStay()` creates it with its place, its nights, and its tier and rule, and the stay creates its days. So a stay always has at least one day and a tier. Creating one is refused when the night count is less than 1 or the rule is empty.

**Place.** Set directly. Moving a stay to a different town leaves its lodging and the stops on its days alone, because whether they still fit is a judgment call. The coordinator talks it through with the user. Then it removes the stops that no longer fit, and rejects the hotel if it no longer fits (technical spec 3.5). The legs on either side are re-routed at the end of the write, and the weather text goes out of date (`isWeatherOutOfDate()`, section 4.1). Example: moving from Monterey to Carmel keeps every stop and the hotel.

**Tier and nights.** A rule like "mid-range for stays of 2+ nights" depends on the nights. So setting the tier records the current nights in `tierSetForNightCount`. When `nightCount` no longer matches, the checks give the `stayTierSetForDifferentNights` note (see Check result). Setting the tier again, even to the same one, records the current nights and clears the note.

**WeatherText.** Held by its stay, with no `id`. A new one replaces the old one whole, so its properties never change. `StaysService.setWeatherText()` creates it (section 4.4). Creating one with empty guidance is refused.

| Property | Stored or worked out | Type | Notes |
|---|---|---|---|
| `guidance` | Stored | `string`, read only | The weather worker's text: conditions, and short clothing advice tied to the activities. It names no clock times. Seasonal-averages text also names no dates or weekdays (technical spec 6.3) |
| `label` | Stored | `WeatherLabel`, read only | Forecast or seasonal averages. `StaysService.setWeatherText()` sets it from the stay's dates. The worker doesn't |
| `writtenOnDate` | Stored | `date`, read only | Today's date when it was written. The seasonal-averages label's years come from it. See below |
| `writtenForPlace` | Stored | `Place`, read only | The stay's `place` when it was written |
| `writtenForDates` | Stored | `List<date>`, in order, read only | The stay's dates when it was written |
| `writtenForActivities` | Stored | `List<ActivityRecord>`, in no order, read only | The stay's activities when it was written |

Whether the text is out of date needs the stay's current dates and activities, which the stay can't work out itself. So it's the calendar's `isWeatherOutOfDate()` (section 4.1).

**ActivityRecord.** Held by a weather text, with no `id`. It holds `stopId : string` and `selectedPlace : Place?`, both read only. The selected place is empty for a stop with no place yet. It records no date or time: the stay's dates cover dates, and times move with every visit-time change. It's a stop ID, not a link, because the stop can be removed later. A removed stop is one way the activities change.

**The seasonal-averages years come from `writtenOnDate`.** The label reads "Typical for this time of year, based on 2016–2025": the 10 complete years before the date it was written (Open-Meteo design 2.3). Working the years out from today instead would change the label a year later, though the text doesn't change.

**Operations:**

- **`setTier(tier : Tier, tierRule : string)`** (the tool `update_stay`). Sets `tier` and `tierRule`, and records the current `nightCount` in `tierSetForNightCount`.
  - **Refused:** when the rule is empty.
- **`selectCandidate(place : Place)`** (the tools `select_candidate` and `select_user_place`). Sets `lodging` to the candidate's place. When the candidate has a tier that differs from the stay's, it sets the tier to the candidate's, with the rule "the user picked a mid-range option" (or whichever tier), the same way `setTier()` does. A place the user named has no tier, so the stay's tier stays.
  - **Follows on:** every leg that starts or ends at the stay is re-routed at the end of the write. For a three-night stay, that's the day in, the days that stay put, and the day out.
  - **Refused:** when the place isn't one of the stay's candidates.

**Changed through `StaysService`** (section 4.4): adding lodging candidates, setting weather text, setting the nights, and moving and removing the stay. The stay keeps change methods for `lodgingCandidates`, `days`, and `weatherText` that only services reach (section 1). They run the stay's own rules, below.

**There is no "select a place the user named."** The tool `select_user_place` makes a candidate for the place, marked "specified by the user," and adds it as a set of one with `StaysService.addLodgingCandidates()`. Then it selects it with `selectCandidate()`. Both operations' rules apply.

**Rules:**

- **The lodging is always one of the stay's candidates.** When its candidate is removed, the stay clears its lodging. Only a rejection removes a candidate (section 4.3).
- **A stay always has a tier,** set when it's created.
- **A stay holds at least one day,** so it has at least one night.
- **A set of lodging candidates holds 1 to 3, with no place already among the stay's candidates.** Each candidate in a set gets the set number: one more than the highest set the stay still has, or 0 when it has none (see Candidate). A set that breaks this is refused whole, so a set is never partly written. A selection the stay already has stays selected.

### 3.6 Day

A day is one day of the trip, with a schedule (functional spec 4). There are two kinds. A **stay day** ends with a night at a stay, and the stay holds it. The **last day** ends at the end place, and the itinerary holds it.

**Held as:** an entity. Its `id` has the prefix `day_` (technical spec 7.1). A stay day is held by its stay's `days`. The last day is held by the itinerary's `lastDay`. `Day` is the base, with `StayDay` and `LastDay` below it. In code, this is likely a tagged union.

**Created and changed by:** `StaysService` creates a stay's days with the stay, and adds and removes them as the stay's nights change. The itinerary creates the last day. The coordinator sets a day's start time directly, and its rest day and approvals through `DaysService`, with the tool `update_day` (section 4.5). It adds, moves, and removes stops through `StopsService`, with the tools `add_stops`, `move_stop`, and `remove_stops` (section 4.6). Code adds, re-routes, and removes its leg (see Leg).

| Property | Stored or worked out | Type | Notes |
|---|---|---|---|
| `id` | Stored | `string`, read only | Agents see it. Users never do. It never changes, even when the day's number or date does (see Itinerary) |
| `ownStartTime` | Stored | `time?` | A start time the user agreed to for this day, such as 5:30 a.m. for a sunrise hike. Empty means the trip brief's `usualStartTime`. Set directly |
| `stops` | Stored | `List<Stop>`, in order, via service | The day's stops, in the order the coordinator set. Code never reorders them. Changes only through `StopsService.addStops()`, `moveStop()`, and `removeStops()` |
| `leg` | Stored | `Leg?`, held by the day, read only | The day's drive, if it has one (see Leg) |
| `approvals` | Stored | `List<Approval>`, in no order, via service | Drive hours and route type approvals, at most one of each. Changes only through `DaysService.approveDriveHours()`, `approveRouteType()`, and `removeApproval()` |

**StayDay** adds one property:

| Property | Stored or worked out | Type | Notes |
|---|---|---|---|
| `isRestDay` | Stored | `boolean`, via service, false by default | A day with no driving (functional spec 5.2). The coordinator decides which days, from the trip brief's `restDaysText`. Changes only through `DaysService.setRestDay()` |

**LastDay** adds nothing. It's its own kind so that it can't be a rest day, and so that only the itinerary can hold it.

**Worked out by the calendar.** A day doesn't know the stay that holds it, or the day before it. So its position, date, start time, the stays it runs between, whether it stays put, its location, and its schedule are calendar functions (section 4.1). Example: on San Francisco Day 2, `startStayOf()` gives the Monterey stay and `endStayOf()` gives the San Luis Obispo stay.

**Operations:** none of its own. The day keeps change methods for `stops` and `approvals`, and a stay day for `isRestDay`, that only services reach (section 1). They run the day's own rules, below. Adding, moving, and removing stops are in `StopsService` (section 4.6). Rest days and approvals are in `DaysService` (section 4.5).

**Rules:**

- **The last day can't be a rest day.** Only a `StayDay` has `isRestDay`.
- **A day's stops stay in the order the coordinator set.** Code never reorders them, even when the stop-order check finds a faster order (see Leg).
- **A day holds each stop once.** An `after` given to place stops has to be one of the day's stops, and not a stop being placed.
- **When a day is marked a rest day, it removes its own leg,** with its waypoints. Its approvals stay.
- **Rules that need other objects are in the services.** A rest day's stops each have a set time, and only a day that stays put can be a rest day (sections 4.5 and 4.6).

### 3.7 Stop

A stop is a place the party visits during a day: a meal or an attraction (functional spec 4).

**Held as:** an entity held by its day's `stops`. Its `id` has the prefix `stop_` (technical spec 7.1).

**Created and changed by:** code creates it when the coordinator lays out a day with the tool `add_stops`, with its kind, purpose, search area, set time, and, for a meal, its tier and rule. Then `StopsService.addStops()` puts it on the day. The coordinator changes its visit time directly, and its tier with `setTier()`, both with the tool `update_stop`. Its set time, selection, approvals, moves, and removal go through `StopsService` (section 4.6). Workers add its candidates, also through `StopsService`.

| Property | Stored or worked out | Type | Notes |
|---|---|---|---|
| `id` | Stored | `string`, read only | Agents see it. Users never do |
| `kind` | Stored | `StopKind`, read only | Meal or attraction |
| `purpose` | Stored | `string`, read only | What the stop is for, never when, such as "dessert" or "stargazing." It can say how long, such as "a long hike in Arches, about 5 hours." See below |
| `searchArea` | Stored | `SearchArea`, read only | Where its candidates are searched: near a stay, along the leg, or near the start or end place. It decides which worker fills the stop (technical spec section 6) |
| `searchAreaStay` | Stored | `Stay?`, read only | The stay, for a stop near a stay. Empty for every other search area |
| `setTime` | Stored | `scheduleTime?`, via service | "Not before," such as dinner at 7 or a sunrise hike at 6. Empty means it follows the stop before it. Most stops have none. Changes only through `StopsService.setStopTime()` and `moveStop()`, since a stop on a rest day needs one |
| `visitTimeInMinutes` | Stored | `integer?` | How long the party spends there. Has a value exactly when a place is selected. `StopsService.selectCandidate()` sets it. It can also be set directly, when the user asks, such as "plan five hours for that hike." More than 0 |
| `tier` | Stored | `Tier?`, read only | For a meal, its budget tier (technical spec section 9). Empty for an attraction. Changes only through `setTier()`, which `StopsService.selectCandidate()` also uses |
| `tierRule` | Stored | `string?`, read only | For a meal, the user's rule that produced the tier. Empty for an attraction |
| `selectedPlace` | Stored | `Place?`, via service | Empty until selected. Always one of `candidates`. Changes only through `StopsService.selectCandidate()`, or when its candidate is removed by a rejection (`PlacesService.rejectPlaces()`, section 4.3) |
| `candidates` | Stored | `List<Candidate>`, in the order offered, via service | Every candidate offered and not rejected. Changes only through `StopsService.addCandidates()`, or when `PlacesService.rejectPlaces()` removes one |
| `approvals` | Stored | `List<Approval>`, in no order, via service | An opening hours approval, at most one. Changes only through `StopsService.approveOpeningHours()` and `removeApproval()`, or when the place changes (see Rules) |
| `status` | Worked out | `StopStatus` | Empty, proposed, or selected. See below |

A stop's position in its day, and the day that holds it, are the calendar's `orderOf()` and `dayOf()` (section 4.1).

**Creating a stop.** Code creates it with its kind, purpose, search area, set time, and, for a meal, its tier and rule. A meal gets a tier even when the user will name its place, in case they later ask for more options. Creating one is refused when:

- The purpose is empty.
- `searchAreaStay` is empty for a stop near a stay, or set for any other search area.
- A meal has no tier or rule, or an attraction has one.

Whether it fits its day is checked when `StopsService.addStops()` adds it (section 4.6).

**Kind, purpose, and search area never change.** The stop's candidates were found for them. A stop with a different kind, purpose, or search area is a different stop, so the coordinator removes it and adds a new one.

**A purpose says what, never when.** A stop can move to another time or day, and its purpose never changes. A meal has no type, such as breakfast or dinner. Its time says when, and its purpose says what, such as "burgers and shakes." An activity tied to a time of day, such as a sunrise hike or stargazing, says what. Nothing in code checks this. The coordinator writes purposes this way (technical spec 5.2).

**A time describes a stop. It doesn't judge it.** No rule says when a place belongs in the day. A speakeasy that opens at 7 p.m. only works at night. Whether a place is open then is the opening-hours check's job.

**Status** comes from two properties, so it isn't stored:

| `selectedPlace` | `candidates` | `status` |
|---|---|---|
| Empty | Empty | `empty` |
| Empty | Some | `proposed` |
| Set | Some | `selected` |

**Operations:**

- **`setTier(tier : Tier, tierRule : string)`** (the tool `update_stop`, and `StopsService.selectCandidate()`). Sets `tier` and `tierRule`.
  - **Refused:** for an attraction, or when the rule is empty.

**Changed through `StopsService`** (section 4.6): its set time, candidates, selection, and approvals, and moving and removing it. The stop keeps change methods for those properties that only services reach (section 1). They run the stop's own rules, below.

**There is no "select a place the user named."** The tool `select_user_place` makes a candidate for the place, marked "specified by the user." For an attraction, the candidate holds the visit time the user gave. It adds it as a set of one with `StopsService.addCandidates()`, then selects it with `StopsService.selectCandidate()`. The candidate keeps the user's visit time, so selecting it again later gives the same time. Example: the user names Hangar One at 2 hours, picks something else, then goes back to it. It gets 2 hours again.

**Rules:**

- **The selected place is always one of the stop's candidates.** When its candidate is removed, the stop clears its selected place. Only a rejection removes a candidate (section 4.3).
- **A stop has a visit time exactly when it has a selected place.** Setting a visit time on a stop with no place is refused. Clearing the place clears it.
- **A set of candidates holds 1 to 3, with no place already among the stop's candidates.** Each candidate in a set gets the set number, the same way as a stay's lodging candidates (see Stay). A set that breaks this is refused whole. A selection the stop already has stays selected.
- **An opening hours approval goes when the stop's selected place changes or is cleared.** It was for that place. So the coordinator never has to clear one.
- **Rules that need other objects are in `StopsService`.** A stop's search area fits its day, and a stop on a rest day has a set time (section 4.6).

**Approval.** An exception the user agreed to, recorded with their reason (functional spec 6.2). It's held by a day or a stop, in `approvals`, with no `id`. Its properties never change. Setting a new one of the same kind replaces it.

| Property | Stored or worked out | Type | Notes |
|---|---|---|---|
| `reason` | Stored | `string`, read only | The user's reason, such as "we want Goblin Valley and Capitol Reef on the way." Never empty |

Whether an approval still applies needs the day's driving or the stop's place in the schedule, which the approval can't see. So it's `FeasibilityChecker.isApplying()` (section 4.7).

Each kind is its own class below `Approval`, because each holds a different value:

| Kind | Held by | Value | Covers |
|---|---|---|---|
| `DriveHoursApproval` | Day | `approvedDrivingInHours : decimal`: the hours the user agreed to. More than 0 | `dailyDriving` |
| `RouteTypeApproval` | Day | `approvedRouteType : RouteType`: the route type the user agreed to, such as fastest | No warning. See below |
| `OpeningHoursApproval` | Stop | `approvedOpenTimeInMinutes : integer`: how many minutes of the visit fell within opening hours. 0 or more | `openingHoursNotLongEnough` and `openingHoursClosed` |

`ApprovalKind` names a kind without an approval, for `removeApproval()`.

**Each records an amount, not yes or no.** Then nothing has to be reset. Example: Moab Day 4 is approved for 5 hours. If a later change makes it 5 hours 20 minutes, the approval stops applying, and the warning comes back as new. If a change makes the day shorter, nothing is said. An opening hours approval works the same way, in minutes. Approving a closed place records 0 minutes, so it applies as long as that place stays selected. A time of day wouldn't work: any change earlier in the day moves every later time.

**A route type approval covers no warning.** It records the user's choice, so the coordinator doesn't raise it again, in this session or a later one, and adds no scenic waypoints that day. The leg's route type comes from it (see Leg).

**Approval rules:**

- **A day or stop holds at most one approval of each kind.** A new one replaces the old.
- **Every approval has a reason.** Creating one with an empty reason is refused. Removing one doesn't need a reason.
- **A day holds drive hours and route type approvals. A stop holds opening hours approvals.** The day holds them, not its leg, so they survive when the leg goes away, such as on a rest day.

---

## 4. Services

A service holds business rules: any rule that needs a setting, the trip brief, or another object (section 1). It holds no data, so it isn't in the diagram.

- **One service for each kind of object:** `TripBriefService`, `PlacesService`, `StaysService`, `DaysService`, and `StopsService`. The `FeasibilityChecker` is a service too.
- **Each is created for one trip.** Code gives it what it needs from that trip's places registry, its trip brief, the settings, and the calendar. Each section below starts with what its service is given. Its operations take the itinerary and the objects to change.
- **Services never call each other.** A lookup that two services need, such as a day's date, is in the calendar, which each of them is given.
- **A refused call changes nothing.** The service and the objects each run their own rules as the call goes. When one refuses partway, the write the call is part of is thrown away whole (section 1, "A write is likely a transaction").
- **A service doesn't check the started-trip lock.** The tools and persistence do (section 1).

Each operation is written the same way as in section 3: its arguments and return, the tool or code that uses it, what it changes, what follows on, and what it refuses. A refusal that comes from an object's own rule names the object.

### 4.1 Calendar

**Given:** the trip brief, for the usual start time, and the settings, for the drive buffer.

The calendar is a set of lookup functions over the itinerary. It holds no data. Like a service, it's created for one trip. Its functions take the itinerary. The services use it, and so does code that reads the itinerary, such as the tool `read_itinerary`, which shows each day's date and schedule.

It's there because an object can't see the object that holds it, or the ones beside it. A day doesn't know which stay holds it, or which day comes before it. The itinerary holds both, so a function over the itinerary can work them out.

| Function | Returns | Notes |
|---|---|---|
| `orderOf(itinerary, stay)` | `integer` | The stay's position in the itinerary's `stays` |
| `orderOf(itinerary, day)` | `integer` | The day's position in the itinerary's `days` |
| `orderOf(itinerary, stop)` | `integer` | The stop's position in its day's `stops` |
| `dayOf(itinerary, stop)` | `Day` | The day whose `stops` holds it. The services use it to find a stop's day |
| `previousDay(itinerary, day)` | `Day?` | The day before it in the itinerary's `days`. Empty on the first day |
| `nextDay(itinerary, day)` | `Day?` | The day after it. Empty on the last day |
| `today(itinerary)` | `date?` | Today's date in the start place's time zone (see Trip). Empty while there's no start place |
| `dateOf(itinerary, day)` | `date?` | The itinerary's `startDate` plus the day's order, in days. Empty while there's no start date |
| `datesOf(itinerary, stay)` | `List<date>`, in order | The dates of its nights, plus the morning the party leaves. Example: a three-night Moab stay from October 10 has October 10 to 13. Empty while there's no start date |
| `startStayOf(itinerary, day)` | `Stay?` | Where the party slept the night before: the stay that holds the day before. Empty on the first day, which starts at the start place |
| `endStayOf(itinerary, day)` | `Stay?` | Where the party sleeps: the stay that holds this day. Empty on the last day, which ends at the end place |
| `isStayingPut(itinerary, day)` | `boolean` | True when `startStayOf()` and `endStayOf()` are the same stay. See below |
| `locationOf(itinerary, day)` | `string?` | Where the day is, for the daily itinerary (functional spec 9.5). See below |
| `startTimeOf(itinerary, day)` | `time` | The day's `ownStartTime`, or the trip brief's `usualStartTime` when it's empty |
| `scheduleOf(itinerary, day)` | `List<ScheduleEntry>`, in time order | The day's schedule. See below |
| `openTimeInMinutesOf(itinerary, stop)` | `integer?` | How many minutes of the stop's visit fall within its selected place's opening hours, from its arrival and end in `scheduleOf()`. Empty when it has no selected place, or its place's hours aren't known. `StopsService.approveOpeningHours()` records it, and the `FeasibilityChecker` compares with it |
| `activitiesOf(itinerary, stay)` | `List<Stop>` | The attraction stops the stay's weather text is written for. See below |
| `isWeatherOutOfDate(itinerary, stay)` | `boolean` | True when the stay's weather text no longer matches what it was written for. See below |

Worked-out values that need only an object's own data, or data it holds, stay on the object. Examples: a stop's `status`, a stay's `nightCount` and `sleepsAt`, and the itinerary's `days`, `dayCount`, and `endDate`.

**A day touches two stays.** It starts where the party slept, `startStayOf()`, and ends where it sleeps, `endStayOf()`. On the first day, the start place stands in for the start stay. On the last day, the end place stands in for the end stay. Example: San Francisco Day 2 starts at the Monterey stay and ends at the San Luis Obispo stay. The leg's from and to, the stops' search areas, and rest days all depend on these.

**Which days stay put.** A stay's first day always arrives from somewhere else, and so does the last day. Every later day of a stay starts and ends at that stay, so it stays put. Adding, moving, or removing stays, or changing their nights, never changes which of a stay's days is its first. So `isStayingPut()` never changes for a day, and a rest day or a stop along the leg never stops fitting its day.

**Location.** The towns the day runs between, by the stays' places, not their lodging. A day that moves shows both, such as "Monterey → San Luis Obispo". A day that stays put shows one, such as "Moab". The first day starts at the start place, and the last day ends at the end place, such as "San Luis Obispo → Mike's house". It's empty while a place it needs is empty.

**ScheduleEntry.** One item in a day's schedule: a drive, a stop, or free time. `scheduleOf()` works it out when the day is read, and it's never stored. Each one holds:

- `kind : ScheduleEntryKind`: `drive`, `stop`, or `freeTime`.
- `stop : Stop?`: the stop, for a stop entry. Empty for the others.
- `startTime : scheduleTime?` and `endTime : scheduleTime?`: empty when the time isn't known yet. The UI shows "time set once a place is picked."

**How the schedule is worked out.** It's a plan, not a promise: drive times are averages, and visit times are estimates. Every time comes from stored data, so nothing new is stored.

- **The day starts at `startTimeOf()`.** On a day with a leg, the party leaves where it slept at that time.
- **Stops run in the day's order.** A stop's arrival is when the stop before it ends plus the drive to it, or its set time if that's later. The party waits before driving, not after, so the wait shows as free time before the drive. The schedule doesn't say where the party spends it. A stop ends after its visit time.
- **Each drive is the leg's stored segment drive time plus the buffer** for fuel and short breaks, a setting (technical spec section 10). Example: on Moab Day 4, Capitol Gorge ends at 4:40 p.m., then free time until 12:35 a.m., then the drive to Panorama Point for stargazing at 1:00 a.m.
- **A stop with no selected place takes no time.** It has no drive and no visit time, so the drive to the next selected stop starts from the selected stop before it. An empty stop with a set time shows at its set time and holds its spot: the stop after it can't arrive before that time. Example: on San Francisco Day 2, dinner is set for 6:30 and still empty, so dessert shows at 6:30, not 4:35. An empty stop with no set time has no times. So the stops after an empty stop can show times that are too early (see Check result).
- **After the last stop comes the drive to where the party sleeps,** or to the end place. Its times are unknown when an empty stop comes after the last selected stop.
- **A rest day has no drives.** Each of its stops has a set time, and the day ends when its last stop ends.
- **A day can run past midnight.** It runs until the party reaches where it sleeps, or the end place. A stop after midnight stays on the day it follows, and its times are on the next calendar day. Example: stargazing at 1 a.m. after Moab Day 4 is the last stop on Day 4, not the first on Day 5. Nothing compares a day's end with the next day's start.

**Activities.** The attraction stops the stay's clothing advice should cover (technical spec 6.3). Meals don't count, since clothing doesn't depend on which café the party picks. A stay's activities are:

- Attraction stops whose search area is this stay, on any day.
- Attraction stops along the leg on this stay's days.
- For the first stay, attraction stops near the start place.
- For the last stay, attraction stops along the last day's leg or near the end place, since the last day has no stay.

Example: Panorama Point at 1 a.m. is near the Torrey stay, so Torrey's weather text covers freezing-night stargazing.

**When weather text is out of date.** The stay's `place` differs from `writtenForPlace`, or `activitiesOf()` differs from `writtenForActivities`, or `datesOf()` has moved from `writtenForDates`:

- **Activities differ** when an attraction stop is added, removed, or moves in or out of the stay's activities, or when one's place is selected, changed, or cleared. That includes its first selection. They're compared as pairs of stop ID and selected place, in any order.
- **For a forecast,** any change to the dates.
- **For seasonal averages,** only a date outside the window the averages were built from: the written dates plus 7 days on each side (Open-Meteo design 2.2). So moving the trip by a day or two doesn't make it out of date.
- **A stay with no weather text is out of date once any stay has some.** That covers a stay added after the weather round.

The text is kept, and the UI labels it out of date. The checks give the `weatherOutOfDate` note. A forecast isn't refreshed as it ages, and nothing marks it old (technical spec 3.5).

### 4.2 TripBriefService

**Given:** the settings, for the maximum trip length and the maximum daily driving.

The two trip brief items whose limits are settings. Every other item is set directly (see Trip brief).

- **`setTripLength(brief : TripBrief, tripLengthInDays : integer)`** (the tool `update_trip_brief`). Sets `tripLengthInDays`.
  - **Refused:** when it's more than the maximum trip length, a setting (technical spec section 10). The coordinator explains the limit and offers a trip of the maximum length (functional spec 6.1). By the brief's own rules: when it's less than 1, or empty.
- **`setMaxDriving(brief : TripBrief, maxDrivingInHours : decimal)`** (the tool `update_trip_brief`). Sets `maxDrivingInHours`.
  - **Refused:** when it's more than the maximum daily driving, a setting (technical spec section 10). By the brief's own rules: when it isn't more than 0, or is empty.

### 4.3 PlacesService

**Given:** the places registry, to record rejections.

- **`rejectPlaces(itinerary : Itinerary, rejections : List<RejectedPlace>)`** (the tool `reject_places`, used by the coordinator). Takes one or more rejections, each a place and the user's reason. It records them in the places registry's `rejectedPlaces`. Then it removes each place from every stop's candidates and every stay's lodging candidates. Where the place was selected, removing the candidate clears the selection, by the stop's or stay's own rule. A rejection undoes picks, meaning candidates and the selections made from them. It doesn't change the trip's structure.
  - **Follows on:** a stop whose selection is cleared also loses its visit time and its opening hours approval, by the stop's own rules. A stay whose lodging is cleared has the party sleep in its town again (`sleepsAt`). Every leg whose selected places, start, or end changed is re-routed at the end of the write (technical spec 3.5). A stay whose activities changed has its weather text go out of date (`isWeatherOutOfDate()`, section 4.1).
  - **Leaves alone:** the trip's structure, meaning a stay's town, the start and end places, and waypoints. None of them is picked from candidates. Changing them needs a conversation with the user, such as which days move when a stay's town goes, so the coordinator does that afterward. The rejection still keeps the place out of later searches and candidates.
  - **Already rejected:** the registry skips it, and keeps its first reason (see Trip).
  - **Refused:** the whole call, by the registry's rule when a place isn't in its `places`. A rejection with an empty reason is refused when it's created (see Trip).

### 4.4 StaysService

**Given:** the places registry, to refuse rejected places. The settings, for the maximum trip length. The calendar, for a stay's dates, today, and its activities.

- **`addStay(itinerary : Itinerary, place : Place, nightCount : integer, tier : Tier, tierRule : string, after : Stay?) : Stay`** (the tool `add_stay`). Creates the stay, with its place, its nights, and its tier and rule, and the stay creates its days (see Stay). Puts it after the stay `after`, or first when `after` is empty. Returns the new stay.
  - **Follows on:** every later day moves back, and keeps its ID. Every leg whose start or end changed is re-routed at the end of the write. The tool lists the stops on every day whose start or end changed (technical spec 3.5).
  - **Refused:** until the itinerary has a `startPlace`, an `endPlace`, and a `startDate` (technical spec 4.2). When the trip would be longer than the maximum trip length, a setting (technical spec section 10). The error gives the limit. By the stay's own rules: when `nightCount` is less than 1, or the rule is empty. By the itinerary's own rule: when `after` isn't one of its stays.
- **`moveStay(itinerary : Itinerary, stay : Stay, after : Stay?)`** (the tool `update_stay`). Moves the stay to after the stay `after`, or first when `after` is empty. Its days move with it, since the stay holds them, with their stops, rest-day marks, start times, and approvals. It needs no business rule. It's here because `stays` is via service (section 1).
  - **Follows on:** every leg whose start or end changed is re-routed at the end of the write. A day keeps its stops, but where it starts or ends can change. The tool lists those stops for the coordinator (technical spec 3.5). A stop near a stay can end up on a day that doesn't start or end there. The move goes through, and the checks give the `searchAreaDoesNotFitDay` warning.
  - **Refused:** by the itinerary's own rule, when `after` is the stay itself or isn't one of its stays.
- **`setNightCount(itinerary : Itinerary, stay : Stay, nightCount : integer) : List<StayDay>`** (the tool `update_stay`). Adds or removes days at the end of the stay's days until it has `nightCount` of them. A new day isn't a rest day, and has no start time, stops, or approvals. A removed day goes with its leg and approvals. Returns the days added, or an empty list when nights were removed.
  - **Follows on:** every later day moves, and keeps its ID. Every leg whose start or end changed is re-routed at the end of the write. The stay's tier still records the nights it was set for, so the checks add a note when they differ (see Stay).
  - **Refused:** when the trip would be longer than the maximum trip length. When a day it would remove holds stops. The refusal lists those stops. By the stay's own rule: when `nightCount` is less than 1. Removing a stay's last night means removing the stay.
- **`removeStay(itinerary : Itinerary, stay : Stay)`** (the tool `remove_stay`). Removes the stay, which takes its days, lodging candidates, and weather text with it. The places stay in the registry.
  - **Follows on:** the next day now starts from the stay before, or from the start place, and its leg is re-routed at the end of the write.
  - **Refused:** while any stop is on the stay's days, or while any stop on any day has the stay as its `searchAreaStay`. The service finds them by going through the itinerary's days. The refusal lists those stops by name and ID. Code never removes a stop the coordinator didn't name. The coordinator asks the user what to do with each one, then moves or removes it (technical spec 3.5).
- **`addLodgingCandidates(stay : Stay, candidates : List<Candidate>)`** (the tool `add_lodging_candidates`, used by a stay researcher, and the tool `select_user_place`). Adds one set of candidates to the stay's `lodgingCandidates`. The stay gives each its set number (see Stay).
  - **Refused:** the whole call, when a place is rejected (the registry's `isRejected()`). By the stay's own rules: when the set has fewer than 1 or more than 3 candidates, or a place is already one of the stay's candidates. So a set is never partly written.
- **`setWeatherText(itinerary : Itinerary, stay : Stay, guidance : string) : WeatherText`** (the tool `set_stay_weather`, used by the weather worker). Creates weather text and replaces any the stay had. It labels it a forecast when every one of the stay's dates, from `datesOf()`, is within 7 days of `today()`, counting today as day 0, and seasonal averages otherwise (technical spec section 8). It records today's date, the stay's current `place`, its dates, and its activities from `activitiesOf()`, each as an `ActivityRecord`. Returns the new text.
  - **Refused:** by the weather text's own rule, when the guidance is empty.

### 4.5 DaysService

**Given:** the settings, for the maximum daily driving. The calendar, for whether a day stays put.

- **`setRestDay(itinerary : Itinerary, day : StayDay, isRestDay : boolean)`** (the tool `update_day`). Marks or unmarks the day as a rest day. Marking it makes the day remove its leg, with its waypoints, by the day's own rule. The day's approvals stay.
  - **Follows on:** unmarking it gives the day a leg again when it's re-routed at the end of the write, through its selected stops and without the old waypoints (see Leg).
  - **Refused:** marking a day that doesn't stay put (`isStayingPut()`), since a day that moves has to drive. Marking a day while a stop on it has no set time, since nothing would place that stop in the day. The error lists those stops.
- **`approveDriveHours(day : Day, drivingInHours : decimal, reason : string)`** (the tool `update_day`). Adds a drive hours approval, replacing any the day has.
  - **Refused:** when the hours are more than the maximum daily driving, a setting (technical spec section 10). By the approval's own rules: when the reason is empty, or the hours aren't more than 0.
- **`approveRouteType(day : Day, routeType : RouteType, reason : string)`** (the tool `update_day`). Adds a route type approval, replacing any the day has. It needs no business rule. It's here because a day's `approvals` is via service.
  - **Refused:** by the approval's own rule, when the reason is empty.
- **`removeApproval(day : Day, kind : ApprovalKind)`** (the tool `update_day`). Removes the day's approval of that kind. It does nothing when the day has none. No reason is needed.
  - **Refused:** by the day's own rule, for an opening hours approval, which only stops hold.

### 4.6 StopsService

**Given:** the places registry, to refuse rejected places. The settings, for the meal visit time. The calendar, for where a day runs, a stop's day, and opening hours.

- **`addStops(itinerary : Itinerary, day : Day, stops : List<Stop>, after : Stop?)`** (the tool `add_stops`). Code creates the stops first, with their own rules (see Stop). This adds them to the day's `stops` in list order, after the stop `after`, or first when `after` is empty. They're empty stops, so no leg is re-routed. An added attraction stop can change a stay's activities.
  - **Refused:** the whole call, when a stop doesn't fit the day. Here the search area rule is hard:
    - Near a stay that isn't the day's `startStayOf()` or `endStayOf()`.
    - Along the leg, on a day that stays put (`isStayingPut()`).
    - Near the start place, except on the first day. Near the end place, except on the last day.
    - With no set time, on a rest day.
  - **Also refused,** by the day's own rule, when `after` isn't on the day.
- **`moveStop(itinerary : Itinerary, stop : Stop, toDay : Day, after : Stop?, setTime : scheduleTime?)`** (the tool `move_stop`). Moves the stop to after the stop `after` on `toDay`, or first on it when `after` is empty, and sets its `setTime`. `toDay` can be the stop's own day. The set time is part of the move for two reasons. The tool always restates it, so an old time never carries over. And the rest-day rule needs the new day and the new time together. The stop keeps its candidates, selection, visit time, and approvals. An opening hours approval stays, since the place is the same. It applies or not at the new time.
  - **Follows on:** the legs of the day it left and the day it joined are re-routed at the end of the write, when their selected places changed. A stop near a stay, or near the start or end place, can land on a day that doesn't start or end there. Here the search area rule is soft: the move goes through, and the checks give the `searchAreaDoesNotFitDay` warning. A moved attraction can change a stay's activities.
  - **Refused:** when a stop along the leg would land on a day that stays put, since it has no leg to be along. The error says to remove the stop and add a new one. When `setTime` is empty and `toDay` is a rest day. By the day's own rule: when `after` isn't on `toDay`, or is the stop itself.
- **`removeStops(itinerary : Itinerary, stops : List<Stop>)`** (the tool `remove_stops`). Removes the stops, with their candidates and approvals. They can be on several days. It finds each one's day with `dayOf()`. The places stay in the registry.
  - **Follows on:** when a selected stop goes, the leg is re-routed at the end of the write. A day that stays put loses its leg with its last selected stop (see Leg).
  - **Refused:** the whole call, when a stop isn't in the itinerary.
- **`setStopTime(itinerary : Itinerary, stop : Stop, setTime : scheduleTime?)`** (the tool `update_stop`). Sets the stop's `setTime`. Empty means it follows the stop before it.
  - **Refused:** when `setTime` is empty and the stop's day is a rest day. The service finds the day with `dayOf()`.
- **`addCandidates(stop : Stop, candidates : List<Candidate>)`** (the tool `add_stop_candidates`, used by a stay researcher or leg scout, and the tool `select_user_place`). Adds one set of candidates to the stop's `candidates`. The stop gives each its set number (see Stop). For a stop along the leg, the tool works out each candidate's detour time before this runs, since it takes a call to Google (see Candidate).
  - **Refused:** the whole call, when a place is rejected (the registry's `isRejected()`). By the stop's own rules: when the set has fewer than 1 or more than 3 candidates, or a place is already one of the stop's candidates.
- **`selectCandidate(stop : Stop, place : Place)`** (the tools `select_candidate` and `select_user_place`). Sets the stop's `selectedPlace` to the candidate's place. Selecting the place that's already selected changes nothing. Otherwise:
  - **Visit time:** for an attraction, the candidate's visit time. For a meal, the meal visit time, a setting (technical spec section 10).
  - **Tier:** when a meal's candidate has a tier that differs from the stop's, it sets the tier to the candidate's with `Stop.setTier()`, with the rule "the user picked a mid-range option" (or whichever tier).
  - **Approvals:** the stop removes any opening hours approval, by its own rule, since it was for the old place.
  - **Follows on:** the day's leg is re-routed at the end of the write. A day that stays put, and isn't a rest day, gains a leg with its first selected stop (see Leg). A selected attraction can change a stay's activities.
  - **Refused:** by the stop's own rule, when the place isn't one of its candidates.
- **`approveOpeningHours(itinerary : Itinerary, stop : Stop, reason : string)`** (the tool `update_stop`). Adds an opening hours approval, replacing any the stop has. It records how many minutes of the visit now fall within the selected place's opening hours, from `openTimeInMinutesOf()`.
  - **Refused:** when the stop has no selected place, or its place's hours aren't known, so there's no warning to approve. By the approval's own rule: when the reason is empty.
- **`removeApproval(stop : Stop, kind : ApprovalKind)`** (the tool `update_stop`). Removes the stop's approval of that kind. It does nothing when the stop has none. It's here because a stop's `approvals` is via service.
  - **Refused:** by the stop's own rule, for a drive hours or route type approval, which only days hold.

### 4.7 FeasibilityChecker

The `FeasibilityChecker` runs the feasibility checks in technical spec section 8, and gives the check results (section 3.3). Like the other services, it's created for one trip.

**Given:** the trip brief, for the items the checks compare against. The settings, for the drive buffer, late allowance, and stop-order minimum saving. The calendar, for dates, today, the schedule, and opening hours.

- **`workOut(itinerary : Itinerary) : List<CheckResult>`.** Runs every check in technical spec section 8 over the whole itinerary, and returns the check results that apply now. It saves nothing. A check that compares against an empty trip brief item is skipped. `forecastNowAvailable` is skipped once the trip has started, since nothing can be rewritten then. A check result's `isApproved` is true when `isApplying()` is true for an approval that covers it.
- **`compare(current : List<CheckResult>, saved : List<CheckResult>) : CheckComparison`.** Matches the current check results with the saved ones. Two check results match when they have the same `check` and the same `subjectId`, whatever their text says. It returns three lists, which aren't stored:
  - **New:** a current check result with no match. Also one whose match was approved and that isn't approved now.
  - **Already known:** every other current check result.
  - **Gone:** a saved check result with no current match. Its saved `text` describes it, since its subject may no longer exist.
- **`isApplying(itinerary : Itinerary, day : Day, kind : ApprovalKind) : boolean`,** and the same with a stop in place of the day. Whether the holder's approval of that kind still covers the plan as it is now. False when it has none. The tool `read_itinerary` uses it to mark each approval as applying or not.

| Kind | Applies while |
|---|---|
| `DriveHoursApproval` | The day's driving, its leg's road time plus the drive buffer setting, is at most `approvedDrivingInHours` |
| `RouteTypeApproval` | Always |
| `OpeningHoursApproval` | `openTimeInMinutesOf()` for the stop is at least `approvedOpenTimeInMinutes` |

**When it runs.** At the end of every coordinator write, code runs `workOut()`, compares the result with the trip's `checkResults`, and then saves the current list with `Trip.replaceCheckResults()`. A worker's write runs none of this. A read runs `workOut()` and `compare()`, but saves nothing. Which check results a tool's reply includes is a rule of the tools, not of this model (tool design 2.1, and technical spec section 8). Where the end of a write runs is carried to round 3 (section 1).

**Rules:**

- **A warning whose approval stops applying is new.** Example: Moab Day 4 is approved for 5 hours of driving. A change makes it 5 hours 20 minutes. The approval no longer applies, so the daily driving warning is new, and the coordinator asks the user again.
- **A check result that goes away and comes back is new.** The write where it went away saved the list without it. If a day that was fixed goes over its driving hours again, the user should hear about it.
- **Only the coordinator's writes save the list.** A worker can't act on a check result. One saved during a worker's write would be marked already known without ever reaching the coordinator.
