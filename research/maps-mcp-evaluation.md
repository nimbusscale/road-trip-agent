# Road Trip Planner: Maps Evaluation (Mapbox, TomTom, and Google)

> **This is a research document, not a design document.** It records what map MCP servers and APIs did when called by hand. It does not make design decisions.

This evaluates MCP servers and plain APIs for routing and points of interest, as candidates for the [data sources](data-sources.md) the agent needs. Rounds 1 to 3 tested MCP servers. Round 4 tested two Google APIs that the agent's own code would wrap as custom tools. The file name still says "mcp" so links to it keep working.

All calls are made by hand, not from the agent. Rounds 1 and 2 used a Claude Code session. Rounds 3 and 4 used plain requests from the shell (section 7.1). This tests the tools, not the agent's reasoning over them.

---

## 1. Status

**Last updated 2026-10-10 (round 4).** This section is the hand-off between sessions. Read it first, then update it at the end of each session.

| Round | Server or API | Version | Status |
|---|---|---|---|
| 1 | Mapbox, local (`@mapbox/mcp-server`) | 0.2.0 (8 tools) | **Done.** Results in section 5 |
| 2 | Mapbox, local | 0.15.1 (29 tools) | **Done.** Results in section 6 |
| 2 | TomTom, local (`@tomtom-org/tomtom-mcp`) | 1.6.12 (11 tools) | **Done.** Results in section 6 |
| 3 | Google Maps Grounding Lite, hosted (`mapstools.googleapis.com/mcp`) | Hosted, no version shown (5 tools) | **Done.** Results in section 7 |
| 4 | Google Routes API (`computeRoutes`) and Places API Text Search, called directly | `directions/v2`, `places/v1` | **Done.** Results in section 8 |
| — | Mapbox hosted (`mcp.mapbox.com/mcp`), TomTom remote (`mcp.tomtom.com/maps`) | — | Not planned. Only test if the local servers behave differently from what the docs describe |

**Why round 3 was added.** Research on listings found that Apify's free plan stops at $5 a month, with no pay-as-you-go. Google became the main candidate for ratings and review counts. Grounding Lite was tested first because it is Google's own hosted MCP server.

**Why round 4 was added.** Grounding Lite was weak on routing and had no way to search along a route line (sections 7.6 and 7.7). Google's plain Routes and Places APIs cover both. They would be custom tools, so the agent's code would control their descriptions and trim their output.

**Why round 1 used an old version.** Mapbox server versions after 0.2.0 need Node 22 or newer. The shell was on Node 20. When `npx` gets a package with no version, it quietly installs the newest release that supports the current Node, which was 0.2.0. Round 1 results describe 0.2.0 only.

**Still open:**
- **Usage.** Check both account dashboards for the round 1 and round 2 calls (section 6.10). The 37 round 1 Mapbox calls had not shown up on the Mapbox statistics page later the same day. This answers whether MCP calls count against the normal free tier ([data-sources.md](data-sources.md#8-to-check-during-evaluation), item 3). The user has to do this.
- **Mapbox place details quota.** The tool description says the place details lookup is a Public Preview with a default quota of 1,000 requests a month. Find out whether that can be raised, and what it costs.
- **`permanent` geocoding.** Geocoding responses say results "may not be retained" unless `permanent=true` is set. Find its price and whether saved stop coordinates need it.
- **Mid-call prompts.** Mapbox 0.15.1 can stop a tool call and ask the human to pick a result (section 6.1). The agent runs with no human watching, so its MCP client has to decline these prompts or not offer to show them. Check that whatever client the agent uses does one of those.
- **Google usage.** Check the Google Cloud console for the 25 round 3 calls and the 18 round 4 calls. Confirm they count against each API's free monthly calls, and not against the $300 trial credit. The user has to do this.
- **Google price levels per call.** Each Places and Routes request is billed by the fields and options it asks for. Check in the console which price level each round 4 call landed in. In particular: a Text Search asking for both ratings and Gemini summaries, a search with `routingSummaries`, a traffic-aware route, and an optimized route.
- **Google key restrictions.** The key can call every Google API. Once the APIs in use are decided, limit the key to those.
- **Gemini summary labels.** Places returns review and overview summaries labeled "Summarized with Gemini" (section 8.3). Check whether Google's terms require showing that label wherever the text appears.

**Closed:**
- **Google search along a route.** Places Text Search takes a route line and returns detour times (section 8.4).
- **Day numbering in `open_hours`.** Day 0 is Sunday. Place details prints days by name, and it matches the numbered periods from category search. For example, Kreuz Market closes at 18:00 on "Su" and on day 0, and at 20:00 every other day.

---

## 2. How to start a test session

1. Check that the shell runs Node 22.12 or newer: `node -v`. TomTom needs 22.12. Mapbox needs 22.
2. Check that both keys are exported in the shell: `MAPBOX_ACCESS_TOKEN` and `TOMTOM_API_KEY`.
3. Start Claude Code with the project's MCP config. The file is `scratch/maps-mcp.json`, which is git-ignored. It runs both servers locally through `npx ...@latest`.
   ```
   claude --mcp-config scratch/maps-mcp.json
   ```
4. In the session, confirm both servers connected (`/mcp`). Mapbox should list about 29 tools, not 8.
5. Record the versions actually installed, because `@latest` can change between sessions:
   ```
   for p in ~/.npm/_npx/*/node_modules/@mapbox/mcp-server/package.json ~/.npm/_npx/*/node_modules/@tomtom-org/tomtom-mcp/package.json; do echo "$p: $(grep -m1 '"version"' "$p")"; done
   ```
   Several cached versions may be listed. The running one can be found with `ps -eo pid,args | grep -E 'mcp-server|tomtom-mcp'`, which shows the cache folder it was started from.
6. When Mapbox shows a prompt asking you to pick a result or a route, choose **Decline**. The tool then returns every result, which is what the agent would get. If you pick one, the tool returns only that one.

---

## 3. Round 2 test plan

Run every phase in order. Use the fixed inputs in section 4, so results can be compared with round 1. For each call, note the result, the fields returned, and the rough response size in characters.

### Phase A: Read the tool schemas

Load the schemas for every Mapbox and TomTom tool. Write down any parameter that touches a known gap from round 1:
- **Route line detail.** Is there an option for a full route line (such as `overview=full`)?
- **Along-route search.** Does any search tool take a route line or a detour limit?
- **Ratings and price.** Does any tool claim to return ratings, review counts, or price level?
- **Scenic routing.** TomTom's Routing API has a `thrilling` route type for winding, hilly roads. Does `tomtom-routing` expose it?

**Done when:** each question has a yes or no for each server.

### Phase B: Mapbox 0.15.1

1. **Place details.** Call `place_details_tool` for Franklin Barbecue, Smitty's Market, Hearst Castle, and The Driskill hotel in Austin. Get the place IDs from `search_and_geocode_tool` or `category_search_tool` first. Record whether ratings, review counts, price level, hours, and a listing link come back.
2. **Text search.** Run `search_and_geocode_tool` for Franklin Barbecue, Hearst Castle, Bixby Bridge, and Kreuz Market. Compare with round 1's POI search results in section 5.4.
3. **Corridor search along a leg.** Follow the repo's own recipe (`examples/search-along-route.md` in `mapbox/mcp-server`):
   1. Get directions from Carmel to San Simeon as GeoJSON.
   2. Buffer the route line with `buffer_tool`. Try a width of about 2 km.
   3. Run `category_search_tool` for `tourist_attraction` inside the buffer's bounding box.
   4. Drop results outside the buffer with `points_within_polygon_tool`.

   Check whether the results include the known stops: Bixby Bridge, McWay Falls, Piedras Blancas Light Station, and the elephant seal vista. Count how many calls and how many characters the whole chain took.
4. **Directions.** Re-run San Francisco to Los Angeles, fastest and with the coastal waypoints. Note any change from round 1, especially in route line detail.
5. **Optimization.** Run `optimization_tool` on the five Texas stops. Compare the order it picks with what the round 1 matrix suggests.
6. **Ground location.** Call `ground_location_tool` on one Big Sur sample point. See whether it names the area and nearby places in one call.
7. **Category search.** Re-run the Austin `hotel` search. Check whether the junk entries ("Jennifer walter" and others) are still there.

**Done when:** each step has a recorded result, and section 6 says which round 1 gaps 0.15.1 closes.

### Phase C: TomTom

1. **Access check first.** Call `tomtom-search-along-route` for `tourist_attraction`, or the closest TomTom category, along San Francisco to Los Angeles via the coastal waypoints. A 403 "missing permissions" error means the key lacks Orbis Maps access. If that happens, stop Phase C and note the error. The fix is to request access in the TomTom developer portal.
2. **Categories.** Call `tomtom-poi-categories` and find the IDs for barbecue, hotel, motel, viewpoint or scenic spot, and tourist attraction.
3. **Routing.** Run San Francisco to Los Angeles fastest, then with the coastal waypoints, then with `thrilling` if it's exposed. Run Seattle to Miami for response size.
4. **Search along a route.** Run the Big Sur leg (Carmel to San Simeon) for tourist attractions and for viewpoints. Check for the same known stops as in Phase B.
5. **POI search near stops.** Search barbecue near Austin and Lockhart, hotels near Austin, and lodging and restaurants near Tucumcari. Record fields, especially ratings, price level, hours, and links.
6. **Named places.** Use `tomtom-fuzzy-search` for Franklin Barbecue, Hearst Castle, Bixby Bridge, and Kreuz Market.

**Done when:** each step has a recorded result, or a recorded error that explains why it stopped.

### Phase D: Write it up

1. Add round 2 results to section 6, in the same style as section 5.
2. Fill in the comparison table (now section 9).
3. Update section 1 with the new status and anything still open.
4. Check the Mapbox and TomTom account dashboards for call counts. The user has to do this.

**Done when:** sections 1, 6, and the comparison (now section 9) are current.

---

## 4. Fixed test inputs

Coordinates are longitude, latitude. They come from round 1 geocoding.

**Cities and towns**

| Place | Longitude | Latitude |
|---|---|---|
| San Francisco, CA | -122.419359 | 37.779238 |
| Los Angeles, CA | -118.254187 | 34.048051 |
| Seattle, WA | -122.330286 | 47.603243 |
| Miami, FL | -80.1919 | 25.773357 |
| Austin, TX | -97.742806 | 30.268072 |
| Lockhart, TX | -97.671405 | 29.884862 |
| San Antonio, TX | -98.4936 | 29.4241 |
| Dallas, TX | -96.797 | 32.7767 |
| Fredericksburg, TX | -98.872 | 30.2752 |
| Tucumcari, NM | -103.724876 | 35.178036 |

**Coastal waypoints, San Francisco to Los Angeles on CA-1** (in order): Santa Cruz (-122.0308, 36.9741), Carmel (-121.9233, 36.5552), Bixby Bridge (-121.9018, 36.3715), San Simeon (-121.1863, 35.6436), Morro Bay (-120.8496, 35.3658), Santa Barbara (-119.6982, 34.4208).

**Big Sur search points**, taken from the Carmel to San Simeon route line: near Bixby Bridge (-121.902701, 36.356964), Big Sur village (-121.794976, 36.263898), McWay Falls (-121.678397, 36.167736), Gorda (-121.469416, 35.935281), and Piedras Blancas (-121.28307, 35.674574).

**Known stops along Big Sur**, used to judge along-route search: Bixby Bridge, McWay Falls, Piedras Blancas Light Station, the elephant seal vista near San Simeon, and Hearst Castle.

**Round 1 reference numbers (Mapbox `driving` profile)**

| Route | Distance | Time |
|---|---|---|
| San Francisco → Los Angeles, fastest | 382 mi | 6h39m |
| Same, coastal waypoints | 456 mi | 10h05m |
| Same, motorways excluded | 444 mi | 13h29m |
| Seattle → Miami | 3,340 mi | 50h47m |

---

## 5. Round 1 results: Mapbox 0.2.0

Tested 2026-10-09. 37 calls.

### 5.1 Summary

| Tool | Fit | Main reason |
|---|---|---|
| `DirectionsTool` | **Good** | Accurate drive times per leg, small responses, up to 25 waypoints |
| `CategorySearchTool` | **Partial** | Finds real places by type, sorted by distance. No ratings or price level. Cannot search along a route |
| `PoiSearchTool` | **Good** | Resolves named must-sees correctly |
| `ForwardGeocodeTool` | **Good** | Cities and towns resolve correctly. Not for landmarks or businesses |
| `MatrixTool` | **Good** | Drive times between every pair of stops in one compact call |
| `ReverseGeocodeTool` | **Partial** | Names the nearest town to a point, which may be off the route |
| `IsochroneTool` | **Poor** | 60-minute cap and a large polygon response |
| `StaticMapImageTool` | Not tested | The UI map uses Mapbox GL JS instead |

**Main finding:** the research doc assumed category search could take a route line and a maximum detour. The underlying Mapbox Search Box API can do this, but the 0.2.0 tool does not expose it. It only accepts a point (`proximity`) or a box (`bbox`). Finding places along a leg means picking points on the route and searching near each one.

**What 0.2.0 does not cover:** ratings, review counts, price level, seasonal hours, and a listing link for the option card.

### 5.2 Directions

| Run | Profile | Result |
|---|---|---|
| San Francisco → Los Angeles | `driving` | 382 mi, 6h39m, via I-580 and I-5 |
| Same, `exclude=motorway` | `driving` | 444 mi, 13h29m, inland via CA-25 and CA-33. Two notices said motorway avoidance was not possible on short stretches |
| Same, 6 coastal waypoints | `driving` | 456 mi, 10h05m, on CA-1. One duration per leg |
| Same, `depart_at=2027-03-15T09:00`, `alternatives=true` | `driving` | 389 mi, 5h58m via I-5. Second route via CA-99, 6h40m. Adds time zones to waypoints |
| Seattle → Miami | `driving` | 3,340 mi, 50h47m |
| San Francisco → Honolulu | `driving` | `{"code":"NoRoute","message":"No route found"}` |

- **Excluding motorways does not make a scenic route.** It sent the route inland on back roads, not down the coast, and doubled the drive time. Scenic routes need scenic waypoints chosen by the agent.
- **Waypoints work well.** Each waypoint pair comes back as its own leg, with distance, duration, and a road summary such as "CA 1, Cabrillo Highway". That maps directly to the spec's legs and daily driving checks.
- **Use the `driving` profile.** The default, `driving-traffic`, uses current traffic, which doesn't help for a trip weeks or months away. `depart_at` works with `driving` and adjusts for typical traffic at that time.
- **Responses are small.** The server returns a simplified route line and no turn-by-turn steps. San Francisco to Los Angeles was about 600 characters. Seattle to Miami was about 5,000 characters, mostly state-border and tunnel notices.
- **The route line is too rough to draw.** San Francisco to Los Angeles came back as 18 points for 390 miles. A map would show straight lines cutting across hills and coastline. The tool has no option for the full route line.
- **The rough route line is still useful for picking search points.** Carmel to San Simeon came back as 25 points, enough to choose spots near Bixby Bridge, McWay Falls, and Piedras Blancas by reading the coordinates.
- **Errors are clean.** An impossible route returns `NoRoute` with a readable message.

### 5.3 Category search

| Search | Location | Result |
|---|---|---|
| `barbeque_restaurant` | Downtown Austin | 10 results, all real: Franklin, Terry Black's, Stubb's, Iron Works, Cooper's, and others |
| `barbeque_restaurant` (JSON) | Lockhart, TX | Barbs B Q, Smitty's Market, Black's Barbecue. Kreuz Market was not in the top 3 |
| `hotel` | Downtown Austin | 10 results. 5 were junk: "Jennifer walter", "Sandeep Skyadav", "Nataly", "Petfriendly", "Better Help" |
| `tourist_attraction` | Downtown Austin | 10 results, all within a few blocks: walking tours, murals, a statue, the visitor center. No Capitol, no Barton Springs |
| `lodging` | Tucumcari, NM | 10 real motels, including Blue Swallow Motel and Motel Safari |
| `restaurant` | Tucumcari, NM | 10 real restaurants, including Del's and Kix On 66 |

- **Results are sorted by distance only.** There is no ranking by popularity or quality.
- **No ratings, review counts, or price level.** Confirmed in the JSON output.
- **Opening hours, phone, and website come back in the JSON format.** Hours are a weekly schedule with no seasonal information. Hearst Castle shows 08:00–18:00 every day.
- **The text format drops hours and website.** It keeps name, address, coordinates, and category.
- **The JSON format is about 25 times larger.** Each result is roughly 1,500 characters of JSON, against about 60 characters as text.
- **Data quality varies by category.** Austin hotels had junk entries mixed in. Small-town Tucumcari lodging and restaurants were clean and complete.

### 5.4 POI search

| Query | Proximity | Result |
|---|---|---|
| Franklin Barbecue | None | Correct first result. Results 2 and 3 were streets named Franklin in Ohio |
| Hearst Castle | None | Correct, single result |
| Hearst Castle (JSON) | San Simeon | Correct. Includes website, phone, and hours |
| Bixby Bridge | None | Correct first result. Also "Bixby Bridge Vista Point" and a bank in Illinois |
| Kreuz Market | Lockhart | Correct, single result |
| Elephant Seal Vista Point | San Simeon | "Friends of the Elephant Seal", about 0.3 miles from the actual vista |

- **POI search is the right tool for must-sees the user names.** Every query found the intended place first.
- **Set `proximity` to keep out unrelated matches.**
- **POI search and category search fit together.** Category search finds candidates of a type near a stop. POI search pins down a specific place. The geocoder can't do the second job.

### 5.5 Points of interest along a leg

Searched near the 5 Big Sur search points in section 4.

| Category | Result |
|---|---|
| `viewpoint` near each point | The same 5 results each time, from up to 100 miles away, including a pier in Sunnyvale and a bird blind in Merced |
| `viewpoint` in a box around all of Big Sur | Only 2 results |
| `tourist_attraction` near McWay Falls | McWay Falls View Point, Andersen Canyon Bridge, Seaview School, Blue Whale Mural, and a radio beacon ("BSR VORTAC") |
| `tourist_attraction` near Piedras Blancas | Piedras Blancas Light Station, a vista point, Hearst Castle Visitor Center, and two more nearby |

- **`viewpoint` is too sparsely tagged to use.**
- **`proximity` biases results but does not limit distance.** When nearby results run out, the tool fills the list with distant places. The text format does not show distance. The JSON format includes `distance` in meters.
- **`tourist_attraction` near route points works,** with some noise.
- **Bixby Bridge is tagged as `bridge, transportation`.** No sightseeing category finds it.

### 5.6 Other tools

- **Matrix:** Five Texas stops returned drive times and distances for every pair in about 1,000 characters. Useful for choosing stop order on a loop.
- **Reverse geocode:** A point near the Texas–New Mexico line on I-40 returned Adrian, TX, about 20 miles east. It names the nearest town, which may not be on the route.
- **Isochrone:** Contours are capped at 60 minutes. A 60-minute polygon was about 8,000 characters.
- **Forward geocode:** All 7 cities resolved correctly. The text format prints latitude first, but tool inputs take a longitude and latitude object, so a model could swap them.

### 5.7 Call log

| Tool | Calls |
|---|---|
| `ForwardGeocodeTool` | 7 |
| `DirectionsTool` | 7 |
| `CategorySearchTool` | 14 |
| `PoiSearchTool` | 6 |
| `MatrixTool` | 1 |
| `ReverseGeocodeTool` | 1 |
| `IsochroneTool` | 1 |
| **Total** | **37** |

---

## 6. Round 2 results: Mapbox 0.15.1 and TomTom 1.6.12

Tested 2026-10-09. 24 Mapbox calls and 19 TomTom calls. Response sizes are rough character counts of what the tool returned.

### 6.1 Things that affect every call

- **Mapbox can pause a call to ask the human a question.** `search_and_geocode_tool` asks the user to pick one result whenever a search returns 2 to 10 results. `directions_tool` does the same when it gets back two or more routes. If the user picks one, only that one comes back. If the user declines, or the client can't show the prompt, all results come back. Three of the first six text searches triggered a prompt. No TomTom call prompted.
- **This client showed the structured copy of each result, not the text copy.** MCP tools can return a text version and a structured (JSON) version of the same result. Claude Code showed the JSON one. So Mapbox's `formatted_text` option had no effect here: a `hotel` search with the default text format still came back as full JSON. Round 1 found the text format about 25 times smaller. Whether the agent gets that saving depends on which copy its client reads.
- **Large Mapbox directions results are cut down.** When a directions response is over 50 KB, the server stores the full result on its side for 30 minutes and returns only a summary. The only pointer to the stored copy is in the text version, which this client did not show. The stored copy was not in the server's resource list either.
- **Keys.** The servers read `MAPBOX_ACCESS_TOKEN` and `TOMTOM_API_KEY` from the environment of the shell that starts Claude Code. A server left over from a closed session still had the literal placeholder `${MAPBOX_ACCESS_TOKEN}` as its token.

### 6.2 Schema questions (Phase A)

| Question | Mapbox 0.15.1 | TomTom 1.6.12 |
|---|---|---|
| Option for a full route line? | **Yes, but limited.** `directions_tool` with `geometries=geojson` asks for the full line, but anything over 50 KB comes back without it (6.1). `optimization_tool` has `overview=full` or `simplified` | **Yes.** `response_detail=geometry` returns the line, simplified to at most 1,000 points |
| Search along a route line or with a detour limit? | **No.** Search tools take a point or a box. The repo's recipe chains five tools (6.5) | **Yes.** `tomtom-search-along-route` takes start, end, and a corridor width |
| Ratings, review counts, or price level? | **Price level only, sometimes.** `place_details_tool` returns `price_level` for some places. No ratings or review counts anywhere | **No.** Not in the schema, and not in a `full` response either |
| `thrilling` route type? | Not applicable | **Yes.** `routeType=thrilling` |

### 6.3 Mapbox: place details

| Place | Price level | Hours | Website | Other |
|---|---|---|---|---|
| Franklin Barbecue | Expensive | Tu–Su 11:00–16:00 | Yes | Phone, popularity 0.998, about 50 attribute flags |
| Kreuz Market | None | Mo–Sa 10:30–20:00, Su 10:30–18:00 | Yes | Phone, popularity 0.997 |
| Smitty's Market | None | Daily 07:00–18:00, Sa to 18:30 | Yes | Phone, popularity 0.996 |
| The Driskill | Moderate | Hours of its bar or restaurant, not the hotel | Yes | Two photo links, "reservations required" |
| Hearst Castle | None | Daily 08:00–18:00 | Yes | Phone, popularity 1.0 |

- **This is the closest Mapbox gets to option card data.** Each call returned about 2,000 to 4,500 characters.
- **Price level came back for 2 of 5 places.** Values look like "Expensive" and "Moderate", which could map onto the spec's value, mid-range, and posh tiers.
- **No ratings or review counts.** The `score.popularity` field (0 to 1) is the only quality signal. All four restaurants scored between 0.996 and 0.998, so it doesn't separate well-known places from each other.
- **The attribute flags are rich.** Examples: `wait_expected`, `reservations_required`, `environment_upscale`, `known_for_local_specialty`, `tourist_friendly`. Some could feed the "Notes" field on an option card.
- **Hours are still a plain weekly schedule.** Hearst Castle shows 08:00–18:00 every day, the same as round 1. TomTom has 09:00–16:00 (6.8).
- **There is a quota.** The tool description says this lookup is a Public Preview with a default of 1,000 requests a month.

### 6.4 Mapbox: text search

| Query | Proximity | Result |
|---|---|---|
| Franklin Barbecue | None | Correct first result. Then places named Franklin in Chile and Argentina |
| Hearst Castle | None | Correct, single result |
| Bixby Bridge | None | Correct first result, then the Vista Point. Also a bank in Illinois and streets in Florida and Nevada |
| Kreuz Market | Lockhart | Correct, single result |
| Smitty's Market | Lockhart | **Wrong.** One result: the town of Saint-Marcet, France |
| The Driskill hotel | Austin | A bare "Driskill Hotel" entry with no category, then the correct hotel listing |

- **Same results as round 1's POI search where they overlap.** The new tool merges POI search and geocoding.
- **The apostrophe in Smitty's probably broke the match.** Category search found Smitty's easily (6.7).
- **One Bixby result had a `mapbox_id` of about 5,000 characters.** That one field was over half the response.

### 6.5 Mapbox: corridor search along Big Sur

Followed the repo's recipe for Carmel to San Simeon.

| Step | Tool | Result | Size |
|---|---|---|---|
| 1. Route line | `directions_tool`, `geometries=geojson` | **No line returned.** The full Big Sur line was over 50 KB, so only the summary came back (6.1) | ~800 |
| 1b. Route line, retry | `optimization_tool`, `overview=simplified` | 31 points | ~2,500 |
| 2. Buffer by 2 km | `buffer_tool` | A polygon of about 170 points | ~9,000 |
| 3. Search the buffer's box | `category_search_tool`, `tourist_attraction`, limit 25 | 25 places | ~37,000 |
| 4. Keep points inside the buffer | `points_within_polygon_tool` | 18 of 25 kept | ~1,700 |

The bounding box in step 3 was worked out by hand. An agent would add a `bbox_tool` call. The buffer polygon also has to be sent back in as input to step 4, which is another 9,000 characters.

**Known stops:**

| Stop | Result |
|---|---|
| Bixby Bridge | **Missed.** Tagged as a bridge, not an attraction |
| McWay Falls | Found ("McWay Falls View Point") |
| Piedras Blancas Light Station | Found, with its tour hours (Tu, Th, Sa 10:00–12:00) |
| Elephant seal vista | Found as a generic "Vista Point". TomTom calls the same spot "Elephant Seals Vista Point" |
| Hearst Castle | **Found, then dropped.** It is about 5 km from CA-1, outside the 2 km buffer |

- **It works, but it is costly.** Five or six calls and about 60,000 characters in and out, for one leg.
- **The box was much wider than the road.** It pulled in two inland missions and two Pinnacles National Park entries. The filter step removed them.
- **Useful finds besides the known stops:** Point Sur Lighthouse, Big Creek Cove Vista Point, and Big Sur Station.

### 6.6 Mapbox: directions, optimization, and ground location

| Run | Result |
|---|---|
| San Francisco → Los Angeles, fastest | 382 mi, 6h39m, via I-580 and I-5. Same as round 1 |
| Same, 6 coastal waypoints | 456 mi, 10h05m. Same as round 1. **No time or distance per leg** |
| Optimization, 5 Texas stops, `overview=false` | **Error.** The server rejected its own response: "expected nonoptional, received undefined at trips[0].geometry" |
| Same, `overview=simplified` | Austin → Fredericksburg → San Antonio → Lockhart → Dallas → Austin. 640 mi, 11h01m, with time and distance per leg |
| Matrix, same 5 stops | Used to check the optimizer by hand. Its loop beat the obvious alternatives. The reverse direction was within a minute |
| Ground location, Big Sur village, `tourist attraction` | Names the place ("Big Sur") and lists 10 nearby places with distances in meters. About 4,000 characters |

- **0.15.1 lost the per-leg times that 0.2.0 had.** The server now deletes the `legs` array and keeps only road names per leg, such as "CA 1, Cabrillo Highway". Daily driving checks need per-leg times. The options are one directions call per leg, the matrix tool, or the optimization tool, which keeps them.
- **The optimizer is useful for loops.** It answers "what order should the stops go in" in one call, with per-leg times. It takes up to 12 stops.
- **`overview=false` on optimization is broken.** Use `simplified`.
- **Ground location is a good one-call summary of a point.** It is better than round 1's reverse geocode for "what is near this spot". It makes three API calls on the server side (geocoding, isochrone, and search).

### 6.7 Mapbox: category search

- **Austin hotels: the junk is still there.** The same five fake entries as round 1 ("Jennifer walter", "Sandeep Skyadav", "Nataly", "Petfriendly", "Better Help"), plus a new doubtful one, "Noble Crest Luxury Hotels", at a 6th Street address with a Philadelphia phone number. That is at least 5 junk entries out of 10.
- **Lockhart barbecue, JSON:** Barbs B Q, Smitty's Market, Black's Barbecue, Kreuz Market, Terry Black's. All five are real and correctly tagged.
- **Each result is about 1,500 characters,** whatever format is asked for (6.1).

### 6.8 TomTom: routing

| Run | Result | Size |
|---|---|---|
| San Francisco → Los Angeles, fast | 388 mi, 6h11m, via I-580 and I-5 | ~1,800 |
| Same, 6 coastal waypoints | 443 mi, 9h04m, on CA-1. **Time and distance for each of the 7 legs** | ~3,800 |
| Same, `thrilling`, no waypoints | 466 mi, 13h16m. The only main road it listed was CA-35, not CA-1 | ~900 |
| Seattle → Miami | 3,298 mi, 46h08m, via I-90 | ~3,500 |
| Carmel → San Simeon, `response_detail=geometry` | 91 mi, 2h22m. Route line of 1,000 points, simplified from 2,970, within 8 m of the original | ~22,000 |

- **Per-leg times come back by default.** Each leg has length, time, and departure and arrival times. This maps straight onto the spec's legs and daily driving checks.
- **TomTom's drive times are shorter than Mapbox's.** San Francisco to Los Angeles is 28 minutes shorter on the fast route and about an hour shorter on the coast. One test can't say which is closer to real driving.
- **`thrilling` doesn't make a coast route.** Like round 1's "avoid motorways" test, it went inland. It added 3 hours over the fast route. Scenic routes still need waypoints chosen by the agent.
- **The route line is good enough to draw.** At 1,000 points for Big Sur, it follows the coast curves. A longer route also gets at most 1,000 points, so it would be coarser per mile. That wasn't tested.
- **Responses list current incidents even with `traffic=historical`.** Road works and jams show up for today's date. Planning a trip months out would need `departAt`.

### 6.9 TomTom: places

**Search along a route** (Carmel to San Simeon, one call each)

| Search | Result | Size |
|---|---|---|
| `tourist attraction`, 5 km corridor, limit 25 | 25 of 100 matches. Found Piedras Blancas, Point Sur ("Faro de Point Sur"), Limekiln Falls, Big Creek Cove Vista Point, and Castle Rock Viewpoint, which overlooks Bixby Bridge. Some noise: "Rocky Point Restaurant Sign", "Carmel Boho Picnics" | ~14,000 |
| `VIEWPOINT` category, 2 km corridor | 22 results, nearly all good: Bixby Creek Bridge Viewpoint, Elephant Seal Vista Point and Viewing Area, Julia Pfeiffer Burns Vista Point, Point Lobos, Hurricane Point | ~12,000 |

| Known stop | Result |
|---|---|
| Bixby Bridge | Found ("Bixby Creek Bridge Viewpoint") |
| McWay Falls | **Partly.** "Julia Pfeiffer Burns Vista Point", in the park where the falls are, but not McWay Falls by name |
| Piedras Blancas Light Station | Found |
| Elephant seal vista | Found, three entries |
| Hearst Castle | **Missed** in both searches |

- **One call does what took Mapbox five or six.** It also used about a third of the characters.
- **TomTom's `VIEWPOINT` category is well tagged on this coast.** Mapbox's `viewpoint` was too sparse to use in round 1.
- **Results are not in route order.** The agent would sort them by position along the leg.
- **The route line in this tool is just the two end points** unless `response_detail=geometry` is set.

**Search near stops** (`tomtom-nearby`, sorted by distance, with a hard radius)

| Search | Result |
|---|---|
| `BARBECUE_RESTAURANT`, 5 km from downtown Austin | 10 of 22 shown. **No Franklin, Terry Black's, or Stubb's.** Includes Gyu-Kaku, a Korean barbecue chain, and a sausage beer garden |
| `BARBECUE_RESTAURANT`, 3 km from Lockhart | **Only 2:** Barbs B Q and Terry Black's |
| `HOTEL`, 1 km from downtown Austin | 10 of 53. All real, no junk. The Driskill is listed twice |
| `HOTEL_OR_MOTEL`, Tucumcari | 10 of 29, all real, including Blue Swallow Motel and Motel Safari |
| `RESTAURANT`, Tucumcari | 10 of 30, all real. Del's was not in the first 10 |

- **TomTom's barbecue tagging misses the famous places.** Franklin, Kreuz Market, and Smitty's are tagged `AMERICAN_RESTAURANT`. For the spec's barbecue trip (scenario S2), a category search alone would miss the places the trip is about.
- **Hotel data was cleaner than Mapbox's.** No fake entries in Austin.
- **The radius is a hard limit,** unlike Mapbox's `proximity`. Each result includes its distance.
- **Each result is about 600 to 700 characters,** less than half of Mapbox's 1,500.

**Named places** (`tomtom-fuzzy-search`)

| Query | Result |
|---|---|
| Franklin Barbecue | **Not found.** First result "Cranklin's", then barbecue places 75 and 146 km away. The place is listed as "Franklin BBQ"; a search for "Franklin" at its address found it |
| Hearst Castle | Correct. Two entries: one at the visitor center, one at the castle. Hours 09:00–16:00 daily |
| Bixby Bridge | Correct, tagged as a tourist attraction. Then the Vista Point |
| Kreuz Market | Correct, single result |
| Smitty's Market | Correct |

- **Name matching is weaker than Mapbox's.** "Barbecue" did not match "BBQ".
- **No ratings, review counts, or price level,** even with `response_detail=full`. The full response adds entry points, a search score, and an ID, but nothing for option card quality.
- **Hours are opt-in.** `openingHours=nextSevenDays` returns dated time ranges for the next seven days, not a weekly schedule. There is no seasonal information.
- **Each place has a website link** (`url`) when TomTom has one.

### 6.10 Call log

| Server | Tool | Calls |
|---|---|---|
| Mapbox | `search_and_geocode_tool` | 6 |
| Mapbox | `place_details_tool` | 5 |
| Mapbox | `category_search_tool` | 3 |
| Mapbox | `directions_tool` | 3 |
| Mapbox | `optimization_tool` | 3 (1 failed) |
| Mapbox | `matrix_tool` | 1 |
| Mapbox | `ground_location_tool` | 1 (3 API calls on the server) |
| Mapbox | `buffer_tool`, `points_within_polygon_tool` | 2 (run locally, no API call) |
| | **Mapbox total** | **24** |
| TomTom | `tomtom-routing` | 5 |
| TomTom | `tomtom-nearby` | 5 |
| TomTom | `tomtom-fuzzy-search` | 5 |
| TomTom | `tomtom-search-along-route` | 2 |
| TomTom | `tomtom-poi-search` | 1 |
| TomTom | `tomtom-poi-categories` | 1 |
| | **TomTom total** | **19** |

---

## 7. Round 3 results: Google Maps Grounding Lite

Tested 2026-10-10. 25 tool calls. Response sizes are character counts of the text the server returned.

### 7.1 How it was called

- **Server:** Google's hosted MCP server at `https://mapstools.googleapis.com/mcp`. Nothing runs locally.
- **Key:** a Google Maps Platform API key, sent in the `X-Goog-Api-Key` header. It is `GOOGLE_MAPS_API_KEY` in the repo's git-ignored `.env`. The key belongs to a new Google Cloud account with a $300, 90-day trial credit. It currently allows every Google API.
- **Client:** plain MCP requests sent with curl, not Claude Code's MCP client. The server answered `tools/call` directly, with no `initialize` step and no session.
- **The text and structured copies match.** Each result has both, and they hold the same JSON. So, unlike Mapbox (6.1), it doesn't matter which copy a client shows.
- **Argument names.** The schemas use camelCase, such as `textQuery`. Snake case, such as `text_query`, also worked.
- **No mid-call prompts.**
- **Fast.** Route and weather calls took 0.2 to 1.1 seconds. Place searches took 0.7 to 2.0 seconds.

### 7.2 Tools

| Tool | Takes | Returns |
|---|---|---|
| `search_places` | A text query. Optional location bias and `includeExtendedDetails` | 1 to 5 places, each with an ID, coordinates, Google Maps links, and attribution. Plus a written summary of all of them |
| `compute_routes` | One origin and one destination, as an address, coordinates, or place ID | Distance in meters and duration in seconds. No waypoints, no route line, no route options |
| `lookup_weather` | A location. Optional date and hour | Current conditions, or one day's or one hour's forecast, up to 10 days out |
| `resolve_names` | Up to 20 place names or addresses | One place ID per query, with a confidence level. No names or coordinates |
| `resolve_maps_urls` | Up to 20 Google Maps links | Not tested |

- **Tool descriptions are long and written as orders to the model.** They run 1,100 to 3,000 characters each. For example, `search_places` says that for a vague location, "*you must* specify it in the `text_query`". These descriptions will shape how the agent uses the tools.
- **Ratings, price, and hours are not fields.** They appear only inside the written summary (7.3).

### 7.3 Places: ratings, price, and hours

| Query | Places | Result |
|---|---|---|
| Highly rated barbecue in Lockhart, TX | 3 | Terry Black's, Barbs B Q, Black's Barbecue |
| Mid-range hotels in Monterey, CA | 5 | The Monterey Hotel, Monterey Bay Lodge, InterContinental the Clement, Seven Gables Inn, Monterey Bay Inn |
| Upscale hotel in Savannah, GA | 5 | Perry Lane Hotel, JW Marriott Plant Riverside, Hotel Orielle, Hotel Bardo, Bellwether House |
| Cheap motel near Van Horn, TX | 5 | Taylor Motel, Desert Inn, Motel 6, Super 8, Sands Motel |
| Barbs B Q Lockhart TX opening hours | 1 | "open from 11 AM to 3 PM on Fridays through Sundays and is closed Monday through Thursday" |
| Price level of barbecue restaurants in Lockhart, TX | 5 | A dollar range for each place, such as "between twenty and thirty dollars" |

- **Every place has a rating and review count.** They appear in the summary in a fixed format, such as "**Terry Black's Barbecue Lockhart** (4.8★ (2410))". This is the only server of the three that returns them.
- **Price and hours come back only when the query asks for them.** Prices are dollar ranges, not "$" to "$$$$".
- **The summaries carry tier hints even without asking.** Examples: "upmarket setting", "straightforward budget property", "affordable option", "free breakfast".
- **The small waystation town worked.** Van Horn returned five real places.
- **Each place has a Google Maps place link and a reviews link.** Either could be the option card's source link.
- **Extended details changed the results.** The Lockhart barbecue query with `includeExtendedDetails=true` returned 5 places instead of 3, adding Kreuz Market and Smitty's Market. Summaries added menu items and atmosphere. It took 2.0 seconds instead of 1.4. Each version was run once, so the extra places might not come from the flag.
- **Each place is about 1,300 characters.** The summary is under a fifth of the response. The five Google Maps links per place are most of the rest.

### 7.4 Places: named lookups

| Query | Result |
|---|---|
| Franklin Barbecue, Austin, TX | Correct, single result. 4.7★ (7297) |
| Hearst Castle | Correct, single result. 4.6★ (13782) |
| Bixby Bridge | Correct, single result. 4.8★ (3021) |
| Smitty's Market, Lockhart, TX | Correct, single result. Mapbox failed on this one (6.4) |
| `resolve_names`, 6 names in one call | 6 place IDs. Confidence was "HIGH" for 5 and "MEDIUM" for Bixby Bridge. The 4 IDs above matched what `search_places` returned. Kreuz Market and the elephant seal vista were not checked |

- **Named lookup was the best of the three servers.** All 4 correct, including the two that tripped Mapbox and TomTom.
- **`resolve_names` returns IDs only.** It needs another call to be useful. `search_places` alone does the job.

### 7.5 Places near stops

| Search | Result |
|---|---|
| Hotels in downtown Austin, TX | 5 real hotels, no junk. Mostly chains: Holiday Inn Express, Hilton Garden Inn, La Quinta, Holiday Inn, Cambria. Ratings from 2.8★ to 4.7★ |
| Barbecue restaurants in Austin, TX | Terry Black's, Franklin, Stiles Switch, Black's, Iron Works. All real barbecue places. TomTom missed Franklin and Terry Black's (6.9) |
| Motels in Tucumcari, NM | 5 real places, all chains or plain motels. **No Blue Swallow Motel or Motel Safari**, the Route 66 motels that Mapbox and TomTom both found |
| Restaurants in Tucumcari, NM | Del's first, then SideKix on 66 and La Cita. Two entries had 1 and 11 reviews, rated 5.0★ and 4.9★ |

- **Results are not sorted by distance.** The order looks like Google's own relevance ranking.
- **Only 5 places per call.** More options need a reworded query.
- **The agent has to weigh review counts.** A 5.0★ rating from 1 review came back next to places with thousands.
- **Small-town results lean toward chains.** For Tucumcari, the well-known local motels didn't make the top 5.

### 7.6 Places along a leg

Grounding Lite can't take a route line, so this used text queries for the Big Sur leg.

| Query | Result |
|---|---|
| Scenic stops and attractions along Highway 1 between Carmel and San Simeon, CA | A "Big Sur National Scenic Byway" marker near Carmel, Point Lobos, Seal Beach Overlook, Limekiln State Park, Hearst Castle |
| Viewpoints along Highway 1 in Big Sur, CA | The same byway marker, Seal Beach Overlook, Buzzards Roost Viewpoint, Willow Creek View Point, Big Sur Lookout |

**Known stops:**

| Stop | Result |
|---|---|
| Bixby Bridge | **Missed.** A direct search found it (7.4) |
| McWay Falls | **Missed** |
| Piedras Blancas Light Station | **Missed** |
| Elephant seal vista | **Missed.** Seal Beach Overlook is a different spot, about 45 miles north |
| Hearst Castle | Found |

- **Found 1 of 5 known stops,** the fewest of the three servers. The places it did find were real and worth a stop.
- **A text query is not a corridor.** There is no detour limit, results are not in route order, and two of the first five were at the Carmel end.
- **Google's plain Places API can search along a route line.** Grounding Lite doesn't expose it.

### 7.7 Routes

| Run | Google | Mapbox round 1 | TomTom |
|---|---|---|---|
| San Francisco → Los Angeles, by coordinates | 383 mi, 6h00m | 382 mi, 6h39m | 388 mi, 6h11m |
| Seattle → Miami, by address | 3,297 mi, 48h12m | 3,340 mi, 50h47m | 3,298 mi, 46h08m |
| Carmel → San Simeon, by address | 91 mi, 2h19m | — | 91 mi, 2h22m |
| San Francisco → Honolulu | `{}`, an empty result with no error | `NoRoute` with a message | Not tested |

- **One leg per call.** That matches a leg in the spec. A trip with 6 stops needs 5 calls. The coastal waypoint test couldn't be run.
- **No route options at all.** There's no way to avoid highways or pick a scenic route. Scenic routes would come only from the agent choosing stops.
- **Responses are tiny,** about 280 characters.
- **An impossible route returns an empty result, not an error.** The agent would have to read `{}` as "no route".

### 7.8 Weather

| Call | Result | Size |
|---|---|---|
| Moab, UT, no date | Current conditions: 63°F, partly cloudy, 3% chance of rain, wind | ~1,300 |
| Moab, UT, 2026-10-15 (5 days out) | High 61°F, low 40°F, mostly sunny, 15% chance of rain, sunrise and sunset | ~1,700 |
| Moab, UT, 2027-03-15 | Error: "Forecasts exceeding 10 days or 240 hours are not currently available." | ~200 |

- **Forecasts reach 10 days.** NWS reaches 7.
- **One day per call.** A forecast for a 3-night stop is 3 calls.
- **No seasonal averages.** Dates past 10 days return a clean error. Open-Meteo is still needed for averages.

### 7.9 Call log

| Tool | Calls |
|---|---|
| `search_places` | 17 |
| `compute_routes` | 4 |
| `lookup_weather` | 3 |
| `resolve_names` | 1 |
| **Total** | **25** |

Two `tools/list` calls were also made. The free tier is 10,000 calls a month.

---

## 8. Round 4 results: Google Routes API and Places Text Search

Tested 2026-10-10. 18 calls: 9 to the Routes API and 9 to Places Text Search. These are plain APIs, not MCP servers. The agent's code would wrap them as custom tools.

### 8.1 How it was called

- **Endpoints:** `routes.googleapis.com/directions/v2:computeRoutes` and `places.googleapis.com/v1/places:searchText`. Both take a POST with a JSON body.
- **Key:** the same key as round 3, in the `X-Goog-Api-Key` header.
- **Every request lists the fields it wants,** in an `X-Goog-FieldMask` header. There is no default list. The fields asked for also set the price of the call. For example, asking for `rating` makes a Text Search an "Enterprise" call.
- **Fast.** Every call took 0.2 to 1.3 seconds.

### 8.2 Routes API

Fields asked for: total and per-leg distance and time, road summary, route line, and warnings.

| Run | Google | Compare |
|---|---|---|
| San Francisco → Los Angeles, fastest | 383 mi, 5h59m, via I-5. Route line of 1,655 points in 6,739 characters | Mapbox 382 mi, 6h39m. TomTom 388 mi, 6h11m |
| Same, 6 coastal waypoints | 445 mi, 8h45m. **Time and distance for each of the 7 legs** | Mapbox 456 mi, 10h05m. TomTom 443 mi, 9h04m |
| Same, `avoidHighways` | 468 mi, 10h46m, **on CA-1** | Mapbox's "exclude motorways" and TomTom's `thrilling` both went inland |
| Same, traffic-aware, leaving 9 AM on 2027-03-15 | 5h58m. Barely different from the plain run | — |
| Seattle → Miami | 3,297 mi, 48h12m. Route line of 16,307 points in 63,964 characters. Warnings for tolls and a time zone change | Mapbox 3,340 mi. TomTom 3,298 mi |
| Carmel → San Simeon | 91 mi, 2h19m. Route line of 2,301 points in 7,811 characters | TomTom 91 mi, 2h22m, 1,000 points in about 22,000 characters |
| Texas loop, 5 stops, `optimizeWaypointOrder` | Austin → Dallas → Lockhart → San Antonio → Fredericksburg → Austin. 640 mi, 10h00m, with per-leg times | Mapbox's optimizer picked the same loop in reverse, 640 mi, 11h01m |
| San Francisco → Honolulu | `{}`, an empty result with no error | Same as Grounding Lite (7.7) |

- **Per-leg times come back with waypoints.** This maps straight onto the spec's legs and daily driving checks.
- **Avoiding highways kept to the coast.** It is the only "avoid" option of the three providers that produced the Pacific Coast Highway. This is one route, so it may not hold elsewhere.
- **The route line is full detail in a compact format.** Google encodes it as a short string of characters. Big Sur came back at more than twice TomTom's detail in about a third of the characters.
- **Long routes are still too big for the model.** Seattle to Miami's line was 64,000 characters. The line should go to the map, not into the agent's context.
- **Warnings are plain English,** such as "This route has tolls." and "Your destination is in a different time zone."
- **Ordering stops is a flag on the same call.** No separate optimizer tool is needed.
- **An impossible route returns an empty result,** not an error.

### 8.3 Places Text Search near stops

Fields asked for: name, address, location, type, rating, review count, price level, price range, weekly hours, Google Maps link, website, business status, and three kinds of summary.

| Query | Places | Price level | Result |
|---|---|---|---|
| barbecue in Lockhart, TX | 7 | **All 7.** "Moderate" or "inexpensive", plus a dollar range like $20–30 | The five famous places, plus Lockhart Chisholm Trail BBQ and Riley's Pit BBQ |
| hotels in downtown Austin, TX | 10 | **None** | All real hotels, all chains. No junk |
| motels in Tucumcari, NM (asked for 20) | 20 | **None** | Motel Safari and Blue Swallow Motel came 7th and 8th. Grounding Lite's top 5 missed both (7.5) |
| Hearst Castle | 1 | None | Correct. Hours 8 AM to 6 PM daily, with no seasonal changes, the same as Mapbox |

- **Ratings and review counts are fields,** not text. For example, `"rating": 4.8, "userRatingCount": 2410`.
- **Price level came back for restaurants only.** No hotel or motel had one. A hotel's tier would have to come from the summary text, such as "chain hotel" or "vintage rooms".
- **Up to 20 places per call,** against Grounding Lite's 5.
- **Hours are a weekly schedule.** For example, Barbs B Q is "Monday: Closed" through Thursday, then 11 AM to 3 PM.

**Three kinds of summary.** Here they are for Kreuz Market:

| Field | Source | Example |
|---|---|---|
| `editorialSummary` | Google's own one-liner | "Landmark serving sausage & BBQ without sauce or forks in a sprawling, cafeterialike setting." |
| `generativeSummary` | Gemini overview | "Lively Texas barbecue venue serving smoked brisket and sausage." |
| `reviewSummary` | Gemini summary of reviews | "People say this barbecue restaurant serves delicious brisket, sausage, and ribs. They also highlight the friendly staff, the historic atmosphere, and the live music. Some reviews mention the food can be dry." |

- **The review summary is the only text that mentions downsides.** For example, "the food can be dry" and "despite the small dining area".
- **Coverage varies.** In Lockhart, all 7 places had a review summary and an overview, but only 3 had an editorial summary. In Tucumcari, the smaller motels were more often missing one or more summaries. Buckaroo Motel had none.
- **Gemini summaries come labeled.** Each includes the text "Summarized with Gemini" and a link to report the content.
- **Size depends on the fields.** With all fields, each place was 2,000 to 2,700 characters. With only name, rating, review count, price level, and link, each was about 400.

### 8.4 Text Search along a route line

The search takes a route line from the Routes API. With `routingSummaries`, each place also comes back with two drive legs: start of the route to the place, and the place to the end. Fields asked for: name, location, type, rating, review count, and the routing summaries.

| Query | Route | Places | Result |
|---|---|---|---|
| tourist attraction | Carmel → San Simeon | 16 | McWay Falls View Point, Elephant Seal Vista Point (13,842 reviews), Ragged Point, China Vista Point, Whale Peak, Hearst Castle Welcome Sign. Some noise: "Village of Fae", "Mission ranch" (2 reviews), Blue Whale Mural |
| scenic viewpoint | Carmel → San Simeon | 18 | Nearly all real viewpoints: Bixby Bridge Vista Point, Hurricane Point, Notleys Landing, Ragged Point, Big Sur Lookout |
| restaurant for lunch | Carmel → San Simeon | 10 | Nepenthe, Big Sur River Inn, Big Sur Roadhouse, The Restaurant at Ragged Point. 5 of the 10 were in Carmel, at the start |
| barbecue | Dallas → Austin | 20 | 10 of the 20 were within 2 miles of Dallas or Austin. The rest were spread along I-35, including Terry Black's in Waco |

**Known stops:**

| Stop | Result |
|---|---|
| Bixby Bridge | Found ("Bixby Bridge Vista Point", viewpoint search) |
| McWay Falls | Found ("McWay Falls View Point", attraction search) |
| Piedras Blancas Light Station | **Missed** |
| Elephant seal vista | Found ("Elephant Seal Vista Point") |
| Hearst Castle | **Partly.** Only "Hearst Castle Welcome Sign". The castle sits about 5 km from CA-1, the same reason Mapbox dropped it (6.5) |

- **Found 3 of 5 known stops in two calls,** the same count as Mapbox and TomTom. Each call was about 11,000 to 12,000 characters.
- **The detour time can be worked out.** Add the two legs, then subtract the route's own time. Most Big Sur stops came out at 0 to 2 minutes, which is right for pull-outs on CA-1.
- **One detour looked wrong.** Hurricane Point sits on CA-1 but came out at 35 minutes. Detour times are a hint, not a fact.
- **Results are not in route order.** The first leg's distance gives each place's position along the route, so the tool can sort them.
- **Results bunch up at the ends.** Half of the Dallas to Austin barbecue and half of the Big Sur lunch spots were at the start or end. The tool may need to drop places near the ends, or the query may need to name the middle of the route.
- **The route line goes into the request.** Big Sur's was 7,800 characters. The tool's code should pass it from the route call, so the model never handles it.
- **Each place was about 690 characters** with this field list.

### 8.5 Call log

| API | Calls |
|---|---|
| Routes `computeRoutes` | 9 (1 traffic-aware, 1 with stop ordering) |
| Places Text Search near stops | 5 |
| Places Text Search along a route | 4 |
| **Total** | **18** |

Free calls per month, from Google's price list: Routes at the basic level, 10,000. Text Search with ratings, 1,000. Text Search with ratings and Gemini summaries, 1,000. Which level each call landed in is still to be checked (section 1).

---

## 9. Comparison

| Need | Mapbox 0.15.1 | TomTom 1.6.12 | Google Grounding Lite | Google Routes and Places APIs |
|---|---|---|---|---|
| Drive time per leg, with waypoints | **Not from directions.** 0.15.1 returns totals only. Per-leg times need the matrix or optimization tool | **Yes.** Every leg, by default | One leg per call. No waypoints | **Yes.** Every leg |
| Scenic route option | No. Waypoints needed | `thrilling` exists but went inland. Waypoints still needed | No route options of any kind | `avoidHighways` kept to CA-1 in the one test |
| Route line detailed enough to draw | **No, in practice.** Full lines over 50 KB are held back. Simplified line from optimization: 31 points for Big Sur | **Yes.** Up to 1,000 points, about 22,000 characters for Big Sur | **No.** No route line at all | **Yes.** Full detail. About 7,800 characters for Big Sur, 64,000 for Seattle to Miami |
| Ordering stops on a loop | Optimization tool, up to 12 stops | Not tested | No | A flag on the route call |
| Places by type near a stop | Yes. Sorted by distance, no distance limit. Austin hotels still have junk | Yes. Hard radius, distance on each result, clean hotels. Barbecue tagging misses famous places | Yes. 5 per call, ranked by relevance. Clean hotels, famous barbecue found. Small towns lean toward chains | Yes. Up to 20 per call, ranked by relevance. Found the Tucumcari motels Grounding Lite missed |
| Places along a leg | Five- or six-step recipe, about 60,000 characters. Found 3 of 5 known stops | **One call.** About 12,000 to 14,000 characters. Found 3 of 5, plus McWay Falls' park | No route input. Text queries found 1 of 5 | **One call per query.** About 11,000 to 12,000 characters. Found 3 of 5, plus a Hearst Castle sign. Detour time per place |
| Named place lookup | **Good.** 5 of 6. Failed on "Smitty's Market" | Good. 4 of 5. Failed on "Franklin Barbecue" | **Best.** 4 of 4, including both of those | Hearst Castle correct. Only one test |
| Ratings and review counts | No. Popularity score only | No | **Yes.** Every place, inside the summary text | **Yes.** As separate fields |
| Price level | **Sometimes.** Place details, 2 of 5 places | No | When the query asks. Dollar ranges in the text | Restaurants: a level and a dollar range. Hotels: none |
| Hours | Weekly schedule. No seasons | Next seven days, opt-in. No seasons. Hearst Castle hours differ from Mapbox's | When the query asks. Weekly schedule in the text. Seasons not tested | Weekly schedule field. No seasons |
| Descriptive text | Attribute flags | None | One written paragraph per place | Up to three summaries per place, including downsides from reviews |
| Listing link for option cards | Business website. No review site link | Business website | Google Maps place link and reviews link | Google Maps link, reviews link, and website |
| Weather | Not tested | Not tested | Current conditions and daily forecast up to 10 days. No averages | Not tested. The Weather API exists |
| Response size | Large. About 1,500 characters per place, 2,000 to 4,500 per place details call | Compact. About 600 to 700 per place, 1,000 to 4,000 per route | About 1,300 per place, mostly links. About 280 per route | Set by the field list. 400 to 2,700 per place. The tool can trim it |
| Pauses to ask the user | **Yes.** Text search with 2 to 10 results, directions with alternatives | None seen | None seen | Not applicable. Not MCP |
| Free tier and access | Calls worked. Place details is capped at 1,000 a month by default. Dashboard check pending | Calls worked, including the routing and along-route search. Dashboard check pending | Calls worked. 10,000 free calls a month. Dashboard check pending | Calls worked. 10,000 routes and 1,000 rated place searches free a month. Dashboard check pending |

**Only Google returns ratings and review counts.** Grounding Lite puts them in a written summary. The plain Places API returns them as fields.

**Grounding Lite is the weakest for routing and along-leg search.** It has no waypoints, no route line, and no route input for place search.

**Google's plain APIs covered every row that Mapbox or TomTom covered.** They matched TomTom on along-leg search and beat it on route line size. They are not MCP servers, so the agent's code writes their tool descriptions and decides what to return.
