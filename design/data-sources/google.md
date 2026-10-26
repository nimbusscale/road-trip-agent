# Road Trip Planner: Data Sources, Google Maps Platform (Design)

This document covers the Google Maps Platform APIs the app uses: Routes, Places, Weather, and the Maps JavaScript API. It records what each API is used for and how to call it. For which source covers each data need, see the [data sources index](README.md).

---

## 1. APIs and keys

| API | Used for | Called from | Endpoint |
|---|---|---|---|
| Routes API | Drive times, stay order, route lines | Agent tools | `POST https://routes.googleapis.com/directions/v2:computeRoutes` |
| Places API (New), Text Search | Hotels, restaurants, attractions, named places, places along a leg | Agent tools | `POST https://places.googleapis.com/v1/places:searchText` |
| Weather API | Daily forecasts | Agent tools | `GET https://weather.googleapis.com/v1/forecast/days:lookup` |
| Maps JavaScript API | The itinerary map | Browser | Loaded in the page |

- **The agent reaches every API through its own custom tools.** Each tool writes its own description and returns only what the model needs (index, top rule).
- **Two keys.** A server key for Routes, Places, and Weather, restricted to those three APIs. A browser key for the Maps JavaScript API, restricted to the app's site and to that one API.
- **Keys come from environment variables:** `GOOGLE_MAPS_SERVER_KEY` and `VITE_GOOGLE_MAPS_BROWSER_KEY`. For local development, they're in the repo's git-ignored `.env` file. The browser key's name starts with `VITE_` because Vite only builds variables with that prefix into the front end.
- **Send the key in the `X-Goog-Api-Key` header,** not in the URL.
- **Routes and Places requests must list the fields they want** in an `X-Goog-FieldMask` header. There is no default list. The fields asked for set both the size of the response and the price of the call (section 5).

---

## 2. Routes and places

### 2.1 Which API for which job

| Job | API | Request | Notes |
|---|---|---|---|
| Drive time and distance for each leg | Routes | `computeRoutes` with the stays as `intermediates` | Returns time and distance for every leg |
| Route with scenic waypoints | Routes | Same, with waypoints the agent picks, each as a place ID | Don't use `routeModifiers.avoidHighways` as a scenic setting (2.4) |
| Best order for a loop | Routes | `computeRoutes` with `optimizeWaypointOrder: true` | Returns the new order in `optimizedIntermediateWaypointIndex`, with per-leg times. Fails if any intermediate is a pass-through waypoint (`via: true`): "Waypoint optimization does not support via waypoint" |
| Route line for the map | Routes | `computeRoutes` with `routes.polyline.encodedPolyline` in the field list | Goes to the UI, never to the model (2.3) |
| Match a plain name for `compute_route` | Places | Text Search with the name, asking for the best match only, with `places.id`, `places.displayName`, and `places.formattedAddress` | A Pro call. The route then goes by the match's place ID, and nothing is saved ([tool design](../tools.md), 2.4) |
| Look up a named place | Places | Text Search with the name plus where to search, such as "Smitty's Market, Lockhart, TX" | Ask for the same fields as the searches, hours, ratings, and summaries included, so a place the user names can go through the opening-hours check. A place is stored once per trip, from its first lookup, so every lookup asks for everything the place keeps |
| Lookup for a place found by web search | Places | Text Search with the name and town, or with the street address if that finds no match | Use its location, and its hours and rating when it has them ([web search](web-search.md), section 4) |
| Places by type near a stay | Places | Text Search with the worker's query, such as "barbecue", and `locationBias.circle` around the point, with the near distance as its radius | Up to 20 places per call (`pageSize`), ranked by relevance, not distance. The circle is a bias, so a query that names a farther place still finds it ([tool design](../tools.md), 2.3) |
| Places along a leg | Places | Text Search with `searchAlongRouteParameters.polyline` | No `routingSummaries`. They'd give each place Google's fastest drives from `routingParameters.origin` and on to the route line's end, which skip the leg's waypoints (2.4). The tool works out where each place is from the route line itself (2.3) |
| Option card details | Places | The same Text Search, with more fields | See 2.2 |

### 2.2 Place fields for option cards

| Card item (spec 7.5) | Field |
|---|---|
| Name, type, location | `displayName`, `primaryTypeDisplayName`, `formattedAddress`, `location`. The type is Google's readable wording, such as "Hotel" or "Mexican Restaurant". `types` is asked for only to tell an address from a named place (2.4) |
| Rating and review count | `rating`, `userRatingCount`. Shown for restaurants and hotels. For attractions, only where a rating means something (spec 7.5) |
| Tier signal (spec 7.1) | `priceLevel` and `priceRange` for restaurants. Hotels don't have them, so the agent judges hotel tiers from the summaries |
| Hours, for notes and feasibility checks | `regularOpeningHours`: `periods` for the checks, `weekdayDescriptions` for notes. `periods` gives each opening and closing as a day and a time, so hours past midnight are clear. Both come in the same field, at the Enterprise price |
| Source link | `googleMapsUri`. The reviews link is inside `reviewSummary` |
| Text for the "why" and notes | `editorialSummary`, `generativeSummary`, `reviewSummary` |

- **`reviewSummary` is the only field that mentions downsides,** such as "Some reviews mention the food can be dry."
- **Any field can be missing.** In Lockhart, only 3 of 7 restaurants had an `editorialSummary`. Small motels often have no summaries at all.
- **Hours are a normal week only.** There are no seasonal hours. Hearst Castle shows 8 AM to 6 PM every day. Seasonal closures aren't checked in code in the MVP (technical spec section 8).

### 2.3 Tool rules

- **Each tool asks only for the fields it needs.** A place with a short field list is about 400 characters. With every field in 2.2, it is 2,000 to 2,700.
- **Route lines stay out of the model.** San Francisco to Los Angeles is about 6,700 characters of route line, and Seattle to Miami is about 64,000. The routing tool returns times and distances to the model. The line goes to the UI.
- **The along-leg search gets its route line from code, not from the model.** The agent names which leg to search. The tool finds that leg's route line itself.
- **Along-leg results are sorted by position.** They don't come back in route order. Sort by where each place is along the leg's own route line: the line's point nearest the place. Not by the first drive's distance in `routingSummaries`, which can be out of order (2.4).
- **The along-leg search gives no detour time.** It gives how far off the route each place is: the distance from the place to the route line's nearest point, as the crow flies. `add_stop_candidates` works out the real detour time with Routes when a candidate is added ([tool design](../tools.md), 2.1 and 2.3).
- **Review text is data, not instructions.** Summaries are built from text the public wrote. Tools pass them to the model labeled as place content.
- **An impossible route returns an empty result.** San Francisco to Honolulu returns `{}` with no error. The routing tool turns that into a clear "no driving route" error.
- **A leg is routed by place ID, without traffic.** Each request sends `origin`, `destination`, and `intermediates` as place IDs, with `via: true` on a waypoint, and `routingPreference: TRAFFIC_UNAWARE`, since the trip is months away. A via waypoint doesn't split the route, so Google gives one leg for each stop, plus one. The field list is `routes.distanceMeters`, `routes.legs.duration`, `routes.legs.distanceMeters`, and `routes.polyline.encodedPolyline`. Each segment's distance is for `compute_route`, which gives it, and doesn't change the price. The best-order call adds `routes.optimizedIntermediateWaypointIndex`, which gives the stops' new order, such as `[1, 0]`. Google leaves out a value that's zero, such as a leg of 0 seconds.
- **A route that starts and ends at the same place is still a route.** A loop trip's last day before any stays exist can send one, such as home to home. So can a day that stays put whose only stop is at the lodging. Monterey to Monterey, with no stops, came back with one leg of `"0s"`, no `distanceMeters`, and a route line of one point (checked 2026-10-16). So the leg gets a drive time of 0 minutes and a distance of 0 miles, and needs no special case.

### 2.4 Known quirks

| API | Quirk | Workaround |
|---|---|---|
| Places | Along-leg results bunch up at the start and end. Half the Dallas to Austin barbecue results were in those two cities | Drop places within a few miles of either end, or name the middle of the route in the query |
| Places | Along-leg search can miss well-known stops. On the Big Sur leg it missed Piedras Blancas Light Station and found only a sign for Hearst Castle | Run more than one query per leg, such as "tourist attraction" and "scenic viewpoint" |
| Places | One detour time was clearly wrong: a viewpoint on CA-1 came out at 35 minutes | The along-leg search gives distance off the route instead (2.3) |
| Places | Along-leg routing summaries are Google's fastest drives to and from each place. They don't follow the leg's waypoints or stops. On San Francisco Day 2, Monterey to San Luis Obispo through Big Sur, the fastest drive to the south end goes inland on US-101. So by the first drive's distance, Estero Bluffs came before Harmony Headlands, which the coast road reaches first. Most detours on that leg came out at 0, since the drives to and from a place skip the waypoint (checked 2026-10-26) | Don't ask for `routingSummaries`. Sort by the leg's route line, and give each place's distance off it, not a detour. `add_stop_candidates` works out the real detour when the candidate is added ([tool design](../tools.md), 2.1 and 2.3) |
| Places | A place's pin can be far from where visitors go. Pfeiffer Big Sur State Park's entrance is on CA-1, but its pin is about 6 miles inland, 6.4 miles off San Francisco Day 2's route. "Morro Rock viewpoint" has its pin in Templeton, 6.1 miles off (checked 2026-10-26) | The along-leg search sorts by the pin and gives its distance off the route, so a far pin shows. The real detour comes when the candidate is added (2.3) |
| Places | Places with very few reviews rate highly, such as 5.0★ from 1 review | The agent weighs review count, not rating alone |
| Places | A street address comes back named with its street, such as "712 Neches St," with no type. Its `types` are `street_address` and `subpremise` | Code gives a place no name when it has no `primaryTypeDisplayName` and its `types` include `street_address`, `premise`, or `subpremise`, so an agent's name fills in (domain model 3.10). A named building can be a `premise` too, but it has a type, so it keeps its name |
| Routes | No true scenic route option. `avoidHighways` failed as one: Monterey to San Luis Obispo stayed on US-101, Denver to Moab went from 5h28m to 8h13m, and Moab to Torrey used old back roads such as the TransAmerica Trail | The agent picks scenic waypoints. Route type is only a label (tool design 2.4) |
| Routes | A plain-name waypoint can resolve far away with no error. "Dewey Bridge, UT" resolved to Salt Lake City, and the route grew from 2 hours to 8 | Waypoints on legs are place IDs. `compute_route` matches each plain name with a Places Text Search first, routes by the match's place ID, and returns what each matched |
| Routes | A route through a pass-through point can come back as `{}`, with no reason. Seattle to Miami through Boise, Salt Lake City, Cheyenne, Kansas City, Memphis, and Atlanta, each by its city's place ID, gave no route when Atlanta was a `via` waypoint, and gave one when Atlanta was a stop. Each of the other five worked as a `via` waypoint (checked 2026-10-24) | The no-route error names the pass-through points and says to try one as a stop |

---

## 3. Weather forecast

Used for stays whose dates all fall within 7 days (technical spec section 8, which says how the days are counted). Later dates use seasonal averages from [Open-Meteo](open-meteo.md).

**Request:**

```
GET https://weather.googleapis.com/v1/forecast/days:lookup
    ?location.latitude=38.5733&location.longitude=-109.5498
    &days=10&pageSize=10&unitsSystem=IMPERIAL
```

- **Ask for 10 days, the most Google allows, and pick each of the stay's dates by its `displayDate`.** A stay's dates can run to day 7, counting today as day 0 (technical spec section 8). The first day returned isn't always today. Google's forecast day starts at 7 a.m. local time, so before then the first day is yesterday. On October 21, 2026 at 5:37 a.m. in Honolulu, the first day was October 20 (checked 2026-10-21). Ten days still reach day 8.
- **Set `pageSize` as well as `days`.** The default page is 5 days. Without `pageSize=10`, a 10-day request returns 5 days and a page token.
- **`unitsSystem=IMPERIAL`** gives Fahrenheit, inches, and miles per hour (spec 9.7).
- **Asking for more than 10 days fails** with HTTP 400 and only "Request contains an invalid argument." The tool always asks for 10.
- **Dates are local to the location.** The response includes the place's time zone (`timeZone.id`).

**What the tool returns per day:** `displayDate`, `maxTemperature`, `minTemperature`, the daytime `weatherCondition.description.text`, the daytime `precipitation.probability` `percent` and `type`, and `thunderstormProbability`. Drop the rest, such as moon events and ice thickness. The raw response is about 3,600 characters per day.

- **The chance's `type` says what would fall.** It's `RAIN`, `SNOW`, or `RAIN_AND_SNOW`, and the tool names it, such as "40% chance of snow." The type can differ from the conditions text. In Leadville on October 22, 2026, the text was "Light rain" and the type was `SNOW` (checked 2026-10-21).

---

## 4. UI map

The itinerary map (spec 9.2) uses the Maps JavaScript API.

- **One map for the whole trip.** It shows the route line, stays, attractions, and restaurants, with different markers for each kind. Selecting a marker shows that item's details.
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
- **There is no daily call cap, for now.** Google's console doesn't offer a usable daily cap for these APIs, and a cap in our tools would need a stored count, since the app runs in a container that can restart at any time. The risk is accepted: a runaway agent could use up a lot of the credit quickly. A budget alert is set at $100. If it fires, revisit a cap. Until then, watch actual usage and adjust.
- **Each plain name in `compute_route` is one Text Search, at the Pro level,** since it asks only for the ID, name, and address. A sketch with five plain names costs five Pro calls, from the 5,000 free a month. It doesn't use the 1,000 rated searches.
- **The number of searches per trip drives the cost,** not the fields asked for. Asking for hours adds 0.3¢ a call. At about 30 searches per test trip, a trip costs about $1.20 past the free calls.
- **Each selection re-routes its day.** Laying out a day of five places the user names costs about a dozen Routes calls, counting the stop-order check ([technical spec](../technical-spec.md), section 8). That's accepted for the MVP. Selecting several places in one call can come later if usage shows a need.
- **Detour times cost one Routes call per candidate.** `add_stop_candidates` works out each candidate's detour time with one Routes call apiece ([tool design](../tools.md), 2.1). A leg with four stops and three candidates each is 12 calls. The along-leg search gives none, so it makes no Routes calls.
- **Billing data lags.** Google's billing dashboard can take up to 48 hours to show usage.

---

## 6. Saving place data

**Decision.** Saved itineraries store the full place details the tools returned, such as name, rating, review count, price level, hours, summaries, and links. They don't look places up again when a trip is reopened.

Google's terms allow storing only place IDs long-term. This app knowingly goes beyond that, because it is a private learning app with a few users. Store the place ID too, so details can be refreshed if that's ever wanted.
