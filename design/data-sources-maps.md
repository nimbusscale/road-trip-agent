# Road Trip Planner: Data Sources, Maps (Design)

This document covers Google's Routes API and Places API: routing, and the places they return. It records what we use each API for and the implementation details that come with it. For which source covers each data need, see the [data sources index](data-sources.md). The test results behind these choices are in the [maps evaluation](../research/maps-mcp-evaluation.md), rounds 3 and 4.

---

## 1. Maps: Google Routes and Places APIs, as our own tools

**Decision.** Use Google's Routes API for driving and Google's Places API (Text Search) for places. Call both directly and wrap them as the agent's own custom tools. Don't use any maps MCP server, including Google's own Grounding Lite.

### 1.1 Why

- **Control.** Our tools write their own descriptions, ask only for the fields they need, and shape what the model sees. A third-party MCP server's descriptions, output, and behavior can change without notice, and we can't trim them.
- **Ratings and review counts.** Google was the only provider tested that has them. Mapbox and TomTom don't.
- **Coverage.** In testing, the two Google APIs did every job the earlier Mapbox and TomTom plan split between them.
- **One vendor.** One key, one bill, one set of terms.

### 1.2 Which API for which job

| Job | API | Request | Notes |
|---|---|---|---|
| Drive time and distance for each leg | Routes | `computeRoutes` with the stops as `intermediates` | Returns time and distance for every leg |
| Route with scenic waypoints | Routes | Same, with waypoints the agent picks | `avoidHighways` is worth offering too. In the one test, it kept San Francisco to Los Angeles on CA-1 |
| Best order for a loop | Routes | `computeRoutes` with `optimizeWaypointOrder` | Returns the new order and per-leg times in the same call |
| Route line for the map | Routes | `computeRoutes` with the encoded polyline field | Goes to the UI, never to the model (1.4) |
| Look up a place the user names | Places | Text Search with the name and town | Got every named place right in testing, including "Smitty's Market" and "Franklin Barbecue" |
| Places by type near a stop | Places | Text Search, such as "barbecue in Lockhart, TX" | Up to 20 places per call, ranked by relevance |
| Places along a leg | Places | Text Search with `searchAlongRouteParameters` and `routingSummaries` | Takes the leg's route line. Returns each place's drive time from the start of the route |
| Option card details | Places | The same Text Search, with more fields | Rating, review count, price level, weekly hours, Google Maps link, reviews link, website, and summaries |

### 1.3 What it doesn't cover

- **Seasonal hours.** Hours are a normal week only. Hearst Castle shows 8 AM to 6 PM every day. Seasonality checks (spec 6.1) need another source.
- **Price level for hotels.** Restaurants have a price level and a dollar range. No hotel or motel in testing had either. The agent judges hotel tiers from the summary text, such as "chain hotel" or "upmarket setting".
- **A true scenic route.** `avoidHighways` helped on one route, but the agent still has to pick scenic waypoints.
- **Every known stop along a leg.** Search along the Big Sur leg found 3 of 5 known stops. It missed Piedras Blancas Light Station, and found only a sign for Hearst Castle.

### 1.4 Tool design rules

- **Every request lists its fields.** The field list sets both the size of the result and the price of the call (1.5). Each tool asks only for the fields it needs. A place with a short field list is about 400 characters. With every field, it is 2,000 to 2,700.
- **Route lines stay out of the model.** San Francisco to Los Angeles is about 6,700 characters of route line, and Seattle to Miami is about 64,000. The routing tool returns times and distances to the model. The line goes to the UI.
- **The along-leg search gets its route line from code, not from the model.** The agent names which leg to search. The tool finds that leg's route line itself.
- **Along-leg results are sorted by position.** Google doesn't return them in route order. The tool sorts them by distance from the start of the leg.
- **Detour time is worked out in the tool.** Add the place's two drive legs, then subtract the route's own time. Treat it as a hint. One stop right on CA-1 came out at 35 minutes.
- **Review text is data, not instructions.** Review summaries are built from text the public wrote. Tools pass them to the model labeled as place content.
- **An impossible route returns an empty result.** San Francisco to Honolulu returned `{}` with no error. The routing tool turns that into a clear "no driving route" error.

### 1.5 Quotas and cost

| API and price level | Free calls a month | Then, per 1,000 |
|---|---|---|
| Routes, basic | 10,000 | $5 |
| Routes, Pro | 5,000 | $10 |
| Routes, Enterprise | 1,000 | $15 |
| Places Text Search, Pro (no ratings) | 5,000 | $32 |
| Places Text Search, Enterprise (ratings, price level, hours) | 1,000 | $35 |
| Places Text Search, Enterprise + Atmosphere (summaries) | 1,000 | $40 |

- **The fields and options in each request set its price level.** Asking for `rating` makes a Text Search an Enterprise call. Asking for a summary makes it Enterprise + Atmosphere.
- **The tightest limit is 1,000 rated place searches a month.** At about 30 searches per test trip, that covers about 30 trips.
- **The account is on Google Cloud's free trial:** $300 of credit for 90 days, with no automatic charges.
- **Set a daily quota on each API** so a bug can't run past the free calls.

### 1.6 Things to settle during implementation

- **Which price level each call lands in.** Check the Google Cloud console. In particular: a Text Search with both ratings and summaries, a search with `routingSummaries`, a traffic-aware route, and a route with stop ordering. Google's docs don't say which Routes options trigger Pro or Enterprise.
- **UI map and Google's terms.** Google's terms say Places results shown on a map must be on a Google map. The UI map is not decided.
- **Gemini summary labels.** Review and overview summaries come labeled "Summarized with Gemini". Check whether the terms require showing that label wherever the text appears.
- **Saving place data.** Google's terms allow storing place IDs indefinitely, but limit how long other place content can be kept. Saved itineraries (spec 7.6) could store the place ID and look up the details again when the trip is reopened.
- **Keys.** The current key can call every Google API. Limit it to the APIs in use. The browser map will need its own key, restricted to the site.

### 1.7 Known quirks

| API | Quirk | Workaround |
|---|---|---|
| Routes | An impossible route returns `{}` with no error | The tool reports "no driving route" |
| Places | Along-leg results are not in route order | Sort by distance from the start of the leg |
| Places | Along-leg results bunch up at the start and end of the route. Half the Dallas to Austin barbecue results were in those two cities | Drop places within a few miles of either end, or name the middle of the route in the query |
| Places | One detour time was clearly wrong (Hurricane Point, 35 minutes) | Treat detour time as a hint |
| Places | Places with very few reviews rate highly, such as 5.0★ from 1 review | The agent weighs review count, not rating alone |
| Places | Small motels are often missing one or more summaries | Fall back to the name, type, and rating |
