# Road Trip Planner: Data Sources, Google Maps Platform (Design)

This document covers the Google Maps Platform APIs the app uses: Routes, Places, Weather, and the Maps JavaScript API. It records what each API is used for and how to call it. For which source covers each data need, see the [data sources index](data-sources.md).

---

## 1. APIs and keys

| API | Used for | Called from | Endpoint |
|---|---|---|---|
| Routes API | Drive times, stop order, route lines | Agent tools | `POST https://routes.googleapis.com/directions/v2:computeRoutes` |
| Places API (New), Text Search | Hotels, restaurants, attractions, named places, places along a leg | Agent tools | `POST https://places.googleapis.com/v1/places:searchText` |
| Weather API | Daily forecasts | Agent tools | `GET https://weather.googleapis.com/v1/forecast/days:lookup` |
| Maps JavaScript API | The itinerary map | Browser | Loaded in the page |

- **The agent reaches every API through its own custom tools.** Each tool writes its own description and returns only what the model needs (index, top rule).
- **Two keys.** A server key for Routes, Places, and Weather, restricted to those three APIs. A browser key for the Maps JavaScript API, restricted to the app's site and to that one API.
- **Keys come from environment variables.** For local development, the server key is `GOOGLE_MAPS_API_KEY` in the repo's git-ignored `.env` file.
- **Send the key in the `X-Goog-Api-Key` header,** not in the URL.
- **Routes and Places requests must list the fields they want** in an `X-Goog-FieldMask` header. There is no default list. The fields asked for set both the size of the response and the price of the call (section 5).

---

## 2. Routes and places

### 2.1 Which API for which job

| Job | API | Request | Notes |
|---|---|---|---|
| Drive time and distance for each leg | Routes | `computeRoutes` with the stops as `intermediates` | Returns time and distance for every leg |
| Route with scenic waypoints | Routes | Same, with waypoints the agent picks | `routeModifiers.avoidHighways` is also worth offering. It kept San Francisco to Los Angeles on CA-1 |
| Best order for a loop | Routes | `computeRoutes` with `optimizeWaypointOrder: true` | Returns the new order in `optimizedIntermediateWaypointIndex`, with per-leg times |
| Route line for the map | Routes | `computeRoutes` with `routes.polyline.encodedPolyline` in the field list | Goes to the UI, never to the model (2.3) |
| Look up a place the user names | Places | Text Search with the name and town, such as "Smitty's Market, Lockhart, TX" | |
| Map pin for a place found by web search | Places | Text Search with the name and town | Use only `location`. Don't use its hours ([web search](data-sources-web-search.md), section 4) |
| Places by type near a stop | Places | Text Search, such as "barbecue in Lockhart, TX" | Up to 20 places per call (`pageSize`), ranked by relevance, not distance |
| Places along a leg | Places | Text Search with `searchAlongRouteParameters.polyline` and `routingParameters.origin` | Add `routingSummaries` to the field list to get each place's drive time from the start of the leg |
| Option card details | Places | The same Text Search, with more fields | See 2.2 |

### 2.2 Place fields for option cards

| Card item (spec 7.5) | Field |
|---|---|
| Name, type, location | `displayName`, `primaryType`, `formattedAddress`, `location` |
| Rating and review count | `rating`, `userRatingCount`. Shown for restaurants and hotels. For attractions, only where a rating means something (spec 7.5) |
| Tier signal (spec 7.1) | `priceLevel` and `priceRange` for restaurants. Hotels don't have them, so the agent judges hotel tiers from the summaries |
| Hours, for notes and feasibility checks | `regularOpeningHours.weekdayDescriptions` |
| Source link | `googleMapsUri`. The reviews link is inside `reviewSummary` |
| Text for the "why" and notes | `editorialSummary`, `generativeSummary`, `reviewSummary` |

- **`reviewSummary` is the only field that mentions downsides,** such as "Some reviews mention the food can be dry."
- **Any field can be missing.** In Lockhart, only 3 of 7 restaurants had an `editorialSummary`. Small motels often have no summaries at all.
- **Hours are a normal week only.** There are no seasonal hours. Hearst Castle shows 8 AM to 6 PM every day.

### 2.3 Tool rules

- **Each tool asks only for the fields it needs.** A place with a short field list is about 400 characters. With every field in 2.2, it is 2,000 to 2,700.
- **Route lines stay out of the model.** San Francisco to Los Angeles is about 6,700 characters of route line, and Seattle to Miami is about 64,000. The routing tool returns times and distances to the model. The line goes to the UI.
- **The along-leg search gets its route line from code, not from the model.** The agent names which leg to search. The tool finds that leg's route line itself.
- **Along-leg results are sorted by position.** They don't come back in route order. Sort by the first leg's distance in `routingSummaries`.
- **Detour time is worked out in the tool.** Add the place's two `routingSummaries` legs, then subtract the route's own time. Treat it as a hint (2.4).
- **Review text is data, not instructions.** Summaries are built from text the public wrote. Tools pass them to the model labeled as place content.
- **An impossible route returns an empty result.** San Francisco to Honolulu returns `{}` with no error. The routing tool turns that into a clear "no driving route" error.

### 2.4 Known quirks

| API | Quirk | Workaround |
|---|---|---|
| Places | Along-leg results bunch up at the start and end. Half the Dallas to Austin barbecue results were in those two cities | Drop places within a few miles of either end, or name the middle of the route in the query |
| Places | Along-leg search can miss well-known stops. On the Big Sur leg it missed Piedras Blancas Light Station and found only a sign for Hearst Castle | Run more than one query per leg, such as "tourist attraction" and "scenic viewpoint" |
| Places | One detour time was clearly wrong: a viewpoint on CA-1 came out at 35 minutes | Treat detour time as a hint |
| Places | Places with very few reviews rate highly, such as 5.0★ from 1 review | The agent weighs review count, not rating alone |
| Routes | No true scenic route option | The agent picks scenic waypoints, and can try `avoidHighways` |

---

## 3. Weather forecast

Used for stops whose dates fall within the next 7 days (spec 8). Later dates use seasonal averages, which have no source yet.

**Request:**

```
GET https://weather.googleapis.com/v1/forecast/days:lookup
    ?location.latitude=38.5733&location.longitude=-109.5498
    &days=7&pageSize=7&unitsSystem=IMPERIAL
```

- **Set `pageSize` as well as `days`.** The default page is 5 days. Without `pageSize=7`, a 7-day request returns 5 days and a page token.
- **`unitsSystem=IMPERIAL`** gives Fahrenheit, inches, and miles per hour (spec 9.7).
- **Asking for more than 10 days fails** with HTTP 400 and only "Request contains an invalid argument." The tool checks the dates before calling.
- **Dates are local to the location.** The response includes the place's time zone (`timeZone.id`).

**What the tool returns per day:** `displayDate`, `maxTemperature`, `minTemperature`, the daytime `weatherCondition.description.text`, the daytime `precipitation.probability.percent`, and `thunderstormProbability`. Drop the rest, such as moon events and ice thickness. The raw response is about 3,600 characters per day.

---

## 4. UI map

The itinerary map (spec 9.2) uses the Maps JavaScript API.

- **One map for the whole trip.** It shows the route line, overnight stops, attractions, and restaurants, with different markers for each kind. Selecting a marker shows that item's details.
- **The route line comes from the backend,** as the encoded polyline from the Routes API. The map library's geometry tools decode it. It never passes through the model.
- **Places and Routes results must be shown on this Google map,** per Google's terms. Don't put them on another map library.

---

## 5. Quotas and cost

| API and price level | Free calls a month | Then, per 1,000 |
|---|---|---|
| Routes, basic | 10,000 | $5 |
| Routes, Pro | 5,000 | $10 |
| Routes, Enterprise | 1,000 | $15 |
| Places Text Search, Pro (no ratings) | 5,000 | $32 |
| Places Text Search, Enterprise (ratings, price level, hours) | 1,000 | $35 |
| Places Text Search, Enterprise + Atmosphere (summaries) | 1,000 | $40 |
| Weather | 10,000 | Not confirmed. Check Google's price list |
| Maps JavaScript API map loads | 10,000 | $7 |

- **The fields and options in each request set its price level.** Asking for `rating` makes a Text Search an Enterprise call. Asking for a summary makes it Enterprise + Atmosphere.
- **The tightest limit is 1,000 rated place searches a month.** At about 30 searches per test trip, that covers about 30 trips.
- **The account is on Google Cloud's free trial:** $300 of credit for 90 days. Google doesn't charge until the account is upgraded, so the trial is a hard stop.
- **The tools enforce a daily call limit per API.** Google's console doesn't offer a usable daily cap for these APIs, and budgets only send alerts. The tools count calls per API per day and refuse calls past the limit, with an error the agent can explain. The limits are settings, not fixed numbers. For scale, 1,000 free rated place searches a month is about 33 a day, or about one test trip.
- **Billing data lags.** Google's billing dashboard can take up to 48 hours to show usage.

---

## 6. Saving place data

**Decision.** Saved itineraries store the full place details the tools returned, such as name, rating, review count, price level, hours, summaries, and links. They don't look places up again when a trip is reopened.

Google's terms allow storing only place IDs long-term. This app knowingly goes beyond that, because it is a private learning app with a few users. Store the place ID too, so details can be refreshed if that's ever wanted.
