# Road Trip Planner: Maps MCP Evaluation (Mapbox and TomTom)

> **This is a research document, not a design document.** It records what map MCP servers did when called by hand. It does not make design decisions.

This evaluates MCP servers for routing and points of interest, as candidates for the [data sources](data-sources.md) the agent needs. All calls are made by hand from a Claude Code session, not from the agent. This tests the tools, not the agent's reasoning over them.

---

## 1. Status

**Last updated 2026-10-09 (round 2).** This section is the hand-off between sessions. Read it first, then update it at the end of each session.

| Round | Server | Version | Status |
|---|---|---|---|
| 1 | Mapbox, local (`@mapbox/mcp-server`) | 0.2.0 (8 tools) | **Done.** Results in section 5 |
| 2 | Mapbox, local | 0.15.1 (29 tools) | **Done.** Results in section 6 |
| 2 | TomTom, local (`@tomtom-org/tomtom-mcp`) | 1.6.12 (11 tools) | **Done.** Results in section 6 |
| — | Mapbox hosted (`mcp.mapbox.com/mcp`), TomTom remote (`mcp.tomtom.com/maps`) | — | Not planned. Only test if the local servers behave differently from what the docs describe |

**Why round 1 used an old version.** Mapbox server versions after 0.2.0 need Node 22 or newer. The shell was on Node 20. When `npx` gets a package with no version, it quietly installs the newest release that supports the current Node, which was 0.2.0. Round 1 results describe 0.2.0 only.

**Still open:**
- **Usage.** Check both account dashboards for the round 1 and round 2 calls (section 6.10). The 37 round 1 Mapbox calls had not shown up on the Mapbox statistics page later the same day. This answers whether MCP calls count against the normal free tier ([data-sources.md](data-sources.md#8-to-check-during-evaluation), item 3). The user has to do this.
- **Mapbox place details quota.** The tool description says the place details lookup is a Public Preview with a default quota of 1,000 requests a month. Find out whether that can be raised, and what it costs.
- **`permanent` geocoding.** Geocoding responses say results "may not be retained" unless `permanent=true` is set. Find its price and whether saved stop coordinates need it.
- **Mid-call prompts.** Mapbox 0.15.1 can stop a tool call and ask the human to pick a result (section 6.1). The agent runs with no human watching, so its MCP client has to decline these prompts or not offer to show them. Check that whatever client the agent uses does one of those.

**Closed:**
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
2. Fill in the comparison table in section 7.
3. Update section 1 with the new status and anything still open.
4. Check the Mapbox and TomTom account dashboards for call counts. The user has to do this.

**Done when:** sections 1, 6, and 7 are current.

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

## 7. Comparison

| Need | Mapbox 0.15.1 | TomTom 1.6.12 |
|---|---|---|
| Drive time per leg, with waypoints | **Not from directions.** 0.15.1 returns totals only. Per-leg times need the matrix or optimization tool | **Yes.** Every leg, by default |
| Scenic route option | No. Waypoints needed | `thrilling` exists but went inland. Waypoints still needed |
| Route line detailed enough to draw | **No, in practice.** Full lines over 50 KB are held back. Simplified line from optimization: 31 points for Big Sur | **Yes.** Up to 1,000 points, about 22,000 characters for Big Sur |
| Places by type near a stop | Yes. Sorted by distance, no distance limit. Austin hotels still have junk | Yes. Hard radius, distance on each result, clean hotels. Barbecue tagging misses famous places |
| Places along a leg | Five- or six-step recipe, about 60,000 characters. Found 3 of 5 known stops | **One call.** About 12,000 to 14,000 characters. Found 3 of 5, plus McWay Falls' park |
| Named place lookup | **Good.** 5 of 6. Failed on "Smitty's Market" | Good. 4 of 5. Failed on "Franklin Barbecue" |
| Ratings and review counts | No. Popularity score only | No |
| Price level | **Sometimes.** Place details, 2 of 5 places | No |
| Hours | Weekly schedule. No seasons | Next seven days, opt-in. No seasons. Hearst Castle hours differ from Mapbox's |
| Listing link for option cards | Business website. No review site link | Business website |
| Response size | Large. About 1,500 characters per place, 2,000 to 4,500 per place details call | Compact. About 600 to 700 per place, 1,000 to 4,000 per route |
| Pauses to ask the user | **Yes.** Text search with 2 to 10 results, directions with alternatives | None seen |
| Free tier and access | Calls worked. Place details is capped at 1,000 a month by default. Dashboard check pending | Calls worked, including the routing and along-route search. Dashboard check pending |

**Neither server covers ratings or review counts.** Both give a business website, but neither gives a link to reviews. Option cards would need another source for those, as [data-sources.md](data-sources.md) already expects.
