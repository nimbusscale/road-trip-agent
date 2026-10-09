# Road Trip Planner: Data Sources

> **This is a research document, not a design document.** It records options found during research, with the recommendations the research suggested. It does not make design decisions or give design guidance, and it should not be read as doing so. Design decisions belong in a separate design document.

Desk research done on 2026-10-09. Nothing here was signed up for or called. Prices and terms come from public docs pages read on that date. Items marked **(unverified)** could not be confirmed from a primary source and should be checked during evaluation.

This document lists the data the agent needs to deliver the [functional spec](../design/functional-spec.md), the options for each, and a recommended starting set.

**Follow-up testing:** [maps-mcp-evaluation.md](maps-mcp-evaluation.md) records hands-on tests of the Mapbox and TomTom MCP servers. Some of its results differ from what this document expected. For example, Mapbox's MCP server can't search along a route line, which section 4.2 assumes it can.

---

## 1. Ground rules for choosing sources

- **Quality is secondary.** Stale or incomplete data is fine. The goal is to watch the agent call a source, reason over the result, and present options.
- **Cost must be metered.** Free tiers and per-call pricing (around $1 per 1,000 calls) are fine. Monthly subscriptions and minimums are not.
- **Mix of integration styles.** Use at least one or two **third-party remote MCP servers** (hosted by someone else, reached over HTTP). Also wrap some plain REST APIs as **custom tools** defined in the agent's own code.
- **Web search is expected.** The agent uses general web search for anything without a good structured source.

---

## 2. Recommended starting set

| Need | Source | How it plugs in | Cost for a dev month |
|---|---|---|---|
| Geocoding, routes, drive times, route line | **Mapbox** | Remote MCP (`mcp.mapbox.com/mcp`, official) | Free. 100k routes and 100k geocodes per month |
| Points of interest along a leg | **Mapbox** Search Box `category` search along a route | Same remote MCP | Free. 25k–50k per month |
| Restaurants and hotels with rating, review count, "$$" | **Apify** Google Maps Scraper | Remote MCP (`mcp.apify.com`, official) | $5 free credit per month, then about $1.50–2 per 1,000 results |
| Web search (attraction hours, "best barbecue in Lockhart") | Claude's built-in **`WebSearch`** | Built-in SDK tool | No separate charge on the Max plan. Counts against plan usage (see 4.8) |
| Weather forecast (within 7 days) | **NWS** api.weather.gov | Custom tool | Free, no key |
| Seasonal averages | **Open-Meteo** Historical API | Custom tool | Free, no key |
| National parks: alerts, closures, things to do | **NPS Data API** | Custom tool | Free key |
| Curated local picks: what to see, do, and eat | **Wikivoyage** | Custom tool | Free, no key |
| Unusual places near a stop or along a leg | **Atlas Obscura** (unofficial endpoints) | Custom tool | Free, no key |
| UI map | **Mapbox GL JS** | Front end | Free. 50k map loads per month |

**Why this set:**
- It gives you two official third-party remote MCP servers (Mapbox and Apify) and five sources to wrap yourself as custom tools (NWS, Open-Meteo, NPS, Wikivoyage, Atlas Obscura). Web search uses the tool already built into the SDK.
- None of them need a credit card to start. Mapbox's full free tier does need a card, but its no-card trial (10k routes, 5k searches per month) is enough for development.
- Expected data cost is under $1 per test trip. Model usage, including web search, runs on your Max plan (see 4.8).

**Good optional additions, if you want more MCP practice:**
- **Exa** remote MCP for web search (see 4.8). Running it next to the built-in tool shows how the agent picks between two tools that do the same job.
- **NPS and Open-Meteo hosted MCP servers** (community, see 4.5 and 4.6). Each one lets you compare a remote MCP and your own wrapper of the same API side by side.
- **TomTom** remote MCP as a second mapping provider (see 4.1).

---

## 3. Data needs from the spec

| Spec section | Data needed |
|---|---|
| 5.3 Skeleton, 9.4 Legs | Geocoding of cities and places. Drive time and distance between stops. Scenic vs fastest route |
| 6.1 Daily driving | Drive time per leg, matched against max hours per day |
| 6.1 Seasonality | Attraction hours and off-season closures. Road closures are out of scope |
| 6.1 Seasonal risks | Hurricane season, extreme heat, snow |
| 7.2 Lodging | Hotels near a point, with rating, review count, price level, source link |
| 7.3 Dining | Restaurants by cuisine near a point, with rating, review count, price level, hours, source link |
| 7.4 Attractions | Attractions by interest near a stop and along a leg, with hours and estimated visit time |
| 7.1 Budget tiers | A price-level signal, such as "$" to "$$$$" or hotel star class. Used only to judge the tier. Prices are not shown |
| 8 Weather | 7-day forecast. Monthly average highs, lows, and precipitation for any place |
| 9.2 Map | Map tiles, a drawable route line, coordinates for every marker |

---

## 4. Options by area

### 4.1 Geocoding, routing, and drive times

| Provider | Free tier | Metered price | Card needed | MCP server |
|---|---|---|---|---|
| **Mapbox** | 100k routes, 100k geocodes per month | Routes $2 per 1k. Geocoding $0.75 per 1k | No for the trial. Yes for the full free tier | **Official, hosted remote** plus local |
| **Google Routes + Geocoding** | 10k routes, 10k geocodes per month | $5 per 1k each | Yes (except the Maps Demo Key, see section 5) | **Official, hosted remote** (Grounding Lite) |
| **TomTom** | 2,500 calls per day (moving to monthly tiers in July 2026) | About $0.75 per 1k routes (old rate) | No | **Official, hosted remote** (`mcp.tomtom.com/maps`, public preview) |
| **Geoapify** | 3,000 credits per day | Subscriptions only past the free tier | No | **Official, hosted remote** (`api.geoapify.com/v1/mcp`) |
| **OpenRouteService** | 2,000 routes per day | No paid tier | No | Community, local only |
| OSRM / Valhalla demo servers | 1 request per second, fair use | None | No | No |
| GraphHopper | 500 credits per day | Subscription from €69 per month | No | No |

**Notes:**
- No provider has a true "scenic" route option. The agent can approximate one by excluding motorways (Mapbox `exclude=motorway`), by adding scenic waypoints, or by both. This is a good place for the agent to explain its reasoning.
- Mapbox allows up to 25 waypoints per route. OpenRouteService allows 50 and handles coast-to-coast distances.
- Self-hosting OSRM for the whole US needs tens of GB of RAM. Not worth it here.

**Recommendation:** Mapbox through its remote MCP. OpenRouteService is the best free REST API if you want to wrap a router yourself.

### 4.2 Points of interest along a leg

- **Mapbox Search Box `category` search** takes the route line and a maximum detour in minutes. It returns places of a category (restaurant, viewpoint, museum) along the drive. This fits "notable stops along legs" directly.
- **TomTom** has a `search-along-route` tool in its remote MCP.
- **Overpass API** (OpenStreetMap) is free and can find `tourism=viewpoint`, `tourism=attraction` and similar tags inside a box. It has no ratings. The public server allows about 100 regular queries per day and needs a User-Agent.
- **OpenTripMap** gives attractions by radius and category, built from OSM and Wikipedia. It is free (5,000 per day, non-commercial). Its main domain (opentripmap.io) now redirects to a parked page, but the developer site (dev.opentripmap.org) still loads. Status is uncertain.

**Recommendation:** Mapbox category search. Add Overpass as a custom tool only if Mapbox results are thin.

### 4.3 Restaurants and hotels (listings, ratings, price level)

This is the hardest area. The big review sites have mostly closed off cheap API access.

| Source | Rating and reviews | Price signal | Free tier | Metered cost | MCP server |
|---|---|---|---|---|---|
| **Apify** (Google Maps and Tripadvisor scrapers) | Yes | "$$", hotel price ranges | $5 credit per month, no card | About $1.50–2 per 1k results | **Official, hosted remote** |
| **Google Places API (New)** | Yes | `priceLevel`, `priceRange` | 1,000 searches with ratings per month | $35 per 1k searches with ratings, $20 per 1k details | Grounding Lite (remote) gives summaries. Ratings in its output are **(unverified)** |
| **Foursquare Places** | Premium fields only | Price 1–4 (Premium) | 500 Pro calls | $18.75 per 1k Premium calls | Community only |
| **SerpApi** (Google Maps, Yelp, Tripadvisor engines) | Yes | "$$", hotel nightly rates | 250 searches per month | Subscription only ($25 per month and up) | **Official, hosted remote** |
| **Tripadvisor Terra** (new API) | Yes | Price level | 1,000 calls (monthly or one-time is unclear) | About $9–15 per 1k **(unverified)** | **Official, hosted remote** (tools undocumented) |
| **Yelp Places API** | Yes | "$" to "$$$$" | 30-day trial, 5k calls | **$229 per month minimum** | Official, local only |
| OpenStreetMap (Overpass) | No | Hotel `stars` tag only (often missing) | Free | Free | Community, local |
| Wikivoyage "Eat" and "Sleep" sections | No | Price tiers in prose | Free | Free | — |

**Notes:**
- **Apify** runs scrapers ("Actors") that read public Google Maps and Tripadvisor pages. Scraping is a gray area under those sites' terms. For a private learning project the risk is low. A scraper run probably takes tens of seconds, not milliseconds **(unverified)**. The agent may need to wait, and that is worth seeing.
- **Google Places** is the cleanest source, but the price jumps sharply past the free cap. The fields you need (rating, review count, price level, hours) all fall into Google's top "Enterprise" price tier. The first 1,000 such searches each month are free, which may be enough for development.
- **Yelp** is out because of the monthly minimum. **Tripadvisor's legacy Content API** is deprecated, and its terms only allow AI use for internal, non-customer-facing purposes.

Price fields in this table are only for judging the budget tier. The spec does not show prices to the user.

**Recommendation:** Apify remote MCP. Google Places is the fallback if you go with the all-Google option in section 5.

### 4.4 Hotel nightly prices (out of scope)

The functional spec puts price display out of scope, so no source for nightly rates is needed. For reference, LiteAPI (official hosted remote MCP) and SerpApi Google Hotels were the best options found.

### 4.5 Attractions and parks

| Source | What it gives | Cost | MCP server |
|---|---|---|---|
| **NPS Data API** | Parks, alerts (closures), things to do (with duration and season), hours, campgrounds, events | Free key, 1,000 requests per hour | Community, **hosted remote** (`national-parks.caseyjhand.com/mcp`), plus local options |
| Recreation.gov RIDB | Facilities on federal land (USFS, BLM) | Free key | None found |
| Wikivoyage / Wikipedia | "See" and "Do" sections, general summaries (see below) | Free. 200 requests per minute with a User-Agent | — |
| Atlas Obscura | Unusual places by location (see below) | Unofficial endpoints only | None |
| Wikidata SPARQL | Structured landmark lists | Free | Community |
| FHWA America's Byways | 184 scenic byways | No API or bulk download | — |

**Notes:**
- The hosted NPS MCP server is one person's hobby project. It was updated 2026-10-08 but has only two GitHub stars and no uptime promise.
- For scenic byways, the model's own knowledge plus web search is the practical answer.

**Recommendation:** Wrap the NPS API as a custom tool. Optionally connect the hosted NPS MCP too, and compare the two.

#### Curated and unusual places

The sources above lean toward parks and nature. Map and review sources (Mapbox, Apify) rank places by category and popularity. They will find the Mapparium in Boston if the agent searches for it by name, but they won't suggest it unprompted. Two sources fill that gap: Wikivoyage for places a local editor thought worth a visit, and Atlas Obscura for odd and unusual places.

**Wikivoyage** is a free travel guide written by volunteers. It runs on MediaWiki, the same software as Wikipedia.
- **Access:** the standard MediaWiki API at `https://en.wikivoyage.org/w/api.php`. No key is needed. Requests need an identifying User-Agent and are limited to 200 per minute.
- **Useful calls:** `action=parse&page=<town>&prop=wikitext` returns a page. `prop=sections` lists its sections, and `section=N` returns just one, such as "See" or "Eat". `action=query&list=search` finds pages by keyword.
- **Data shape:** the API returns page markup, not JSON. Each listing in the markup is a template (`see`, `do`, `eat`, `drink`, `sleep`) with named fields: name, address, lat, long, hours, price, url, and a short description. The tool has to parse these templates into records before returning them.
- **Limits:** coverage is uneven, and small towns often have few listings. There are no ratings. Prices are free text like "mains around $25". Some listings are years out of date.
- **Bulk option:** full Wikivoyage database dumps are published at `dumps.wikimedia.org`.

**Atlas Obscura** catalogs unusual places, such as the Mapparium or the first Dunkin' Donuts.
- **No official API and no MCP server.** Searches for an Atlas Obscura MCP server only found unrelated products with similar names.
- **Unofficial library:** `atlas-obscura-api` on npm ([GitHub](https://github.com/bartholomej/atlas-obscura-api)) calls the site's internal endpoints. It can search for places near a latitude and longitude, get one place's full details, and list every place with its coordinates. It describes itself as an unofficial scraper. Version 5.1.0 was published in May 2026. A tool could use the library directly, or call the same endpoints the library calls.
- **Risks:** the endpoints are undocumented and could change or be blocked at any time. The terms of use page returned "403 Forbidden" to an automated fetch, so what it says about automated access is **(unverified)**. That 403 also suggests the site blocks some automated readers, so the agent's `WebFetch` may not be able to open Atlas Obscura pages.
- **Apify:** search results list two Atlas Obscura Actors (crawlergang and crawlerbros). Both pages returned "404 Not Found" on 2026-10-09, so they seem to have been removed.
- **Fallback:** web search with `site:atlasobscura.com` in the query. Result titles and snippets are often enough to suggest a place.

**Recommendation:** Add both as custom tools. Wikivoyage suggests curated "See", "Do", and "Eat" picks for each stop. Atlas Obscura suggests unusual places near each stop and along each leg. Use web search as the Atlas Obscura fallback if its endpoints stop working.

### 4.6 Weather forecast and seasonal averages

| Source | What it gives | Cost | MCP server |
|---|---|---|---|
| **NWS** api.weather.gov | 7-day forecast, hourly forecast, active alerts. US only | Free, no key. User-Agent required | Official MCP quickstart example (local only) |
| **Open-Meteo** Forecast | Up to 16 days | Free for non-commercial use, 10k calls per day, no key | Community, **hosted remote** (`open-meteo.caseyjhand.com/mcp`) |
| **Open-Meteo** Historical (ERA5) | Daily highs, lows, and precipitation from 1940 to about 5 days ago | Same as above | Same server |
| NOAA NCEI Climate Normals | Official 1991–2020 monthly normals per weather station | Free. Needs a station lookup first | None |
| Visual Crossing | Forecast and historical summaries | 1,000 records per day free, then $0.0001 per record | Not checked |
| OpenWeatherMap One Call 3.0 | 8-day forecast, alerts | 1,000 calls per day free, then $0.0015 per call. Card likely needed | Community |

**How to get seasonal averages:** Call Open-Meteo Historical once for, say, October 1–31 across the last 10 years at Moab's coordinates. Average the highs and lows in the tool's code. Count days with more than 1 mm of rain. That is one request, with no key and no station lookup. This makes a good custom tool, because the tool does real work before handing a small summary to the model.

**Recommendation:** NWS for forecasts within 7 days. Open-Meteo Historical for seasonal averages. Both as custom tools.

### 4.7 Seasonal hazards

The functional spec puts seasonal road closures out of scope. Research found no national API for them anyway. State feeds each work differently and mostly cover work zones.

- **Hazard seasons** (hurricane season June 1 to November 30, desert heat, mountain snow) are stable facts the model already knows. No API is needed.
- **NWS alerts** cover live warnings inside the 7-day forecast window.
- **Attraction closures** are still in scope. NPS alerts and park "things to do" data cover parks. Web search covers everything else.

**Recommendation:** Rely on the model's knowledge for hazard seasons. Use NWS alerts for trips within 7 days.

### 4.8 General web search

| Provider | Price per 1,000 searches | Free tier | Card | Remote MCP |
|---|---|---|---|---|
| **Claude's built-in `WebSearch`** | Max plan: no separate charge. API key: $10, plus tokens | Included in the plan | No | Built in, not MCP |
| **Exa** | $7 (standard), $4 (instant) | $10 credit per month | No | **Official, hosted** (`mcp.exa.ai/mcp`, `x-api-key` header) |
| **Tavily** | $8 basic, $16 advanced | 1,000 credits per month | No | **Official, hosted** (`mcp.tavily.com/mcp/`, key in URL or header) |
| Perplexity | $5 (Search API) | Unclear | Yes, prepaid | Official, hosted |
| Brave | $5 | $5 credit per month | Yes | Local only |
| SerpApi, Firecrawl | — | Small | — | Hosted, but paid tiers are subscriptions |

**Recommendation:** Use Claude's built-in `WebSearch`. It needs no setup, no extra key, and no extra bill. Add Exa later if you want to compare a search MCP against it. Tavily is a fine alternative to Exa.

**How the built-in tool behaves:**
- It returns result titles and links. The agent usually follows up with `WebFetch` to read a page.
- It has no settings you can change in the SDK, such as allowed domains or result count. Exa does.
- One `WebSearch` call may run up to eight searches behind the scenes.

**Running on the Max plan:**
- The Claude Code costs page says "Claude Max and Pro subscribers have usage included in their subscription." With your Max login, the SDK has no per-search dollar charge.
- Searches still use up your plan's 5-hour and weekly allowance. The results go into the conversation as tokens, so a search-heavy session hits the limits sooner. You pay extra only if you turn on usage credits and go past the limits.
- No doc says this specifically for web search. It is a reading of the general rule. Confirm it by checking the usage bars before and after a test run.
- The Agent SDK overview says: "Unless previously approved, Anthropic does not allow third party developers to offer claude.ai login or rate limits for their products, including agents built on the Claude Agent SDK." That rule covers letting other people use an app through a subscription. Running your own learning project on your own machine, with test accounts you own, is a different case. If real users ever sign in, switch to an API key.

### 4.9 UI map

| Option | Cost | Notes |
|---|---|---|
| **Mapbox GL JS** with Mapbox tiles | 50k map loads per month free, then $5 per 1k | Safest choice if routes and places come from Mapbox (see 6.4) |
| MapLibre GL JS with Stadia Maps or MapTiler tiles | Stadia: no key on localhost. MapTiler: 5k sessions per month free | Free, open source. Fits OSM-based data (OpenRouteService, Overpass) |
| Leaflet with OSM's public tiles | Free | Light use only. Needs attribution and a User-Agent. Access can be cut |
| Google Maps JavaScript API | 10k loads per month free, then $7 per 1k | **Required** if you show Google Places or Routes results on a map |

**Drawing the route:** Ask the routing API for GeoJSON, or decode the encoded polyline in the backend. Then add it as a GeoJSON line layer. Send the route geometry straight to the UI. Do not pass it through the model, because a long route line is thousands of tokens of noise.

**Recommendation:** Mapbox GL JS, to match the recommended Mapbox routing.

---

## 5. Should you use Google Maps?

**Short answer: it works, but it is not the best fit for this project.** Google covers every need in the spec, and it now has an official remote MCP server. Three things count against it.

1. **Price past the free cap.** Ratings, review counts, price level, and hours are all "Enterprise" fields. A search that returns them costs $35 per 1,000 after the first 1,000 each month. That is about 20 times the Apify cost.
2. **Billing account.** Normal API keys need a Google Cloud billing account with a card. Budgets only send alerts. They do not stop spending. Per-API quotas do set a hard limit, so set those if you use Google.
3. **Map lock-in.** Google's terms say Places and Routes results shown on a map must be on a Google map. That rules out a Mapbox or Leaflet map for Google data.

**What Google offers for MCP:**
- **Maps Grounding Lite** is Google's official hosted MCP server at `https://mapstools.googleapis.com/mcp`. It takes an API key in the `X-Goog-Api-Key` header. Its tools are `search_places`, `compute_routes`, `lookup_weather`, `resolve_names`, and `resolve_maps_urls`. It costs $7 per 1,000 calls with 10k free per month.
- Its limits matter. `compute_routes` takes only an origin and a destination, with no waypoints and no route line. Whether `search_places` returns ratings and price level is **(unverified)**. You would still call the REST Places and Routes APIs for those.
- The old reference server `@modelcontextprotocol/server-google-maps` is archived and deprecated. Avoid it.

**A no-card way to try it:** Google's **Maps Demo Key** needs no billing account. It covers Maps JS, Places, Geocoding, Routes, Weather, and Grounding Lite. It excludes reviews and photos. When it hits its daily limit, it pauses until the next day with no charges. It is meant for prototyping only.

**An all-Google stack is a reasonable alternative** if you prefer one vendor: Grounding Lite as the remote MCP, Places and Routes as custom tools, and Maps JS for the UI. Stay under the free caps and set quotas.

---

## 6. Integration notes

The Agent SDK exists for both Python and TypeScript. The language is not decided yet. The notes below describe SDK features, not a design. Option names differ slightly between the two SDKs (for example, `mcp_servers` in Python and `mcpServers` in TypeScript).

### 6.1 Remote MCP servers in the Agent SDK

- Configure each one in the SDK's MCP servers option with `"type": "http"`, a `url`, and `headers`.
- **The SDK won't run a browser login for you, but it can use OAuth tokens your code gets.** Pass a token in static `headers`, or add a `headersHelper` command to the server config. The SDK runs the helper on each connection and again after a 401, and uses the JSON headers it prints. This works well with a client credentials setup on an auth server you control, such as Keycloak.
- **The catch with third-party servers is getting the first token.** Hosted MCP servers that offer OAuth usually expect a person to log in once in a browser (the authorization code flow). They don't usually let an unknown machine client get tokens on its own. To use OAuth with them, you'd run that browser login once yourself and save the refresh token. Then the `headersHelper` swaps it for a fresh access token each time. Whether each provider issues refresh tokens to outside clients is **(unverified)**.
- **API keys are the simpler path for this project.** A server that wants OAuth and gets no token shows the status `needs-auth`, and the agent runs without its tools. Mapbox, Apify, Exa, TomTom, and Google Grounding Lite all accept a static API key in a header.
- Prefer a header over a key in the URL. Keys in URLs (Tavily, SerpApi) can end up in logs.
- Check that each server connected. Read the `init` system message, or ask the SDK client for MCP server status, and look for `failed` or `needs-auth`.

The config has the same shape in both SDKs:

```json
{
  "mapbox": {"type": "http", "url": "https://mcp.mapbox.com/mcp",
             "headers": {"Authorization": "Bearer <MAPBOX_TOKEN>"}},
  "apify":  {"type": "http", "url": "https://mcp.apify.com",
             "headers": {"Authorization": "Bearer <APIFY_TOKEN>"}}
}
```

### 6.2 Custom tools

- The SDK wraps custom tools as an MCP server that runs inside the agent's own process. To the agent, a custom tool looks the same as a tool from a remote MCP server.
- Each tool has a name, a description, and an input schema. Tool names become `mcp__<server>__<tool>`.
- MCP tools are not approved by default. List them in the SDK's allowed tools option. Wildcards like `mcp__apify__*` work.
- Mark the result as an error, with a readable message, when an API call fails. The agent can then recover.

### 6.3 Scoping sources to subagents

- Each subagent definition takes its own `tools` list, which can include MCP tool names. A tool left off the list does not exist for that subagent.
- A subagent definition can also attach an MCP server to that subagent only. The parent never sees that server's tool descriptions. For example, the Apify server could be attached to a dining subagent only.
- Only the subagent's final report reaches the parent. Pushing search-heavy work into subagents keeps the parent's context small.

### 6.4 Keep tool results small

- A tool result over 25,000 tokens is saved to a file, and the agent gets a file path instead.
- Trim API responses inside your custom tools before returning them. For example, return name, rating, review count, price level, address, and URL. Drop photos, raw reviews, and route geometry.
- Use provider limits where they exist, such as a result limit on the Apify actor.
- You cannot trim a third-party MCP server's output yourself. That is a real trade-off to watch for.

### 6.5 Terms that affect the design

- **Google:** Places and Routes results on a map must be on a Google map. Place IDs can be stored forever. Other Places content cannot be cached beyond short limits. Photos and reviews need author credit.
- **Mapbox:** Some Mapbox docs say results must be shown on Mapbox maps. The full product terms could not be confirmed. Using Mapbox GL JS avoids the question.
- **OpenStreetMap data** (Overpass, OpenRouteService, Nominatim): needs ODbL attribution only.
- **Option cards need a source link** (spec 7.5). Apify and Google return a Google Maps URL. NPS returns park page URLs. `WebSearch` returns result URLs.

### 6.6 API keys

One shared server-side key per provider is fine for this project. Keep the keys in environment variables. If you use Google, set API restrictions on each key. Use a separate, referrer-restricted key for the browser map.

---

## 7. Ruled out

| Source | Why |
|---|---|
| Yelp Places API | $229 per month minimum after a 30-day trial |
| Amadeus Self-Service | Shut down 2026-07-17 |
| Tripadvisor legacy Content API | Deprecated. Terms limit AI use to internal purposes |
| Expedia Rapid, Booking.com | Partner approval required |
| SerpApi, Firecrawl, GraphHopper, Geoapify (paid) | Monthly subscriptions past the free tier. Free tiers alone are usable |
| `@modelcontextprotocol/server-google-maps` | Archived and deprecated |
| Self-hosted OSRM, Valhalla, Nominatim | Too heavy to run for the whole US |

---

## 8. To check during evaluation

1. Whether Google Grounding Lite's `search_places` returns ratings, review counts, and price level.
2. How long an Apify Google Maps Scraper run takes, and what one run really costs, including any per-run charge.
3. Whether Mapbox's remote MCP accepts a bearer token from the Agent SDK, and whether MCP calls count against the normal API free tiers.
4. How much of the Max plan allowance a search-heavy planning session uses. Check the usage bars before and after a test run.
5. Whether the community-hosted NPS and Open-Meteo MCP servers are up and responsive.
6. Whether the Atlas Obscura endpoints used by `atlas-obscura-api` still work, and what Atlas Obscura's terms of use say about automated access.
7. How many Wikivoyage listings small waystation towns have, compared with cities.

---

## 9. Sources

**Google Maps Platform**
- https://developers.google.com/maps/billing-and-pricing/pricing
- https://developers.google.com/maps/documentation/places/web-service/data-fields
- https://developers.google.com/maps/billing-and-pricing/manage-costs
- https://developers.google.com/maps/demo-key
- https://developers.google.com/maps/ai/grounding-lite
- https://developers.google.com/maps/documentation/places/web-service/policies

**Maps and routing**
- https://www.mapbox.com/pricing
- https://github.com/mapbox/mcp-server
- https://docs.mapbox.com/api/search/search-box/
- https://openrouteservice.org/plans/
- https://docs.tomtom.com/pricing
- https://github.com/tomtom-international/tomtom-mcp
- https://apidocs.geoapify.com/docs/mcp/
- https://wiki.openstreetmap.org/wiki/Overpass_API
- https://operations.osmfoundation.org/policies/tiles/

**Listings and reviews**
- https://apify.com/pricing
- https://docs.apify.com/platform/integrations/mcp
- https://apify.com/compass/crawler-google-places
- https://business.yelp.com/data/resources/pricing/
- https://foursquare.com/pricing/
- https://docs.terra.tripadvisor.com/reference/mcp
- https://serpapi.com/pricing
- https://www.phocuswire.com/amadeus-shut-down-self-service-apis-portal-developers

**Weather and attractions**
- https://www.weather.gov/documentation/services-web-api
- https://open-meteo.com/en/pricing
- https://open-meteo.com/en/docs/historical-weather-api
- https://github.com/cyanheads/open-meteo-mcp-server
- https://github.com/cyanheads/national-parks-mcp-server
- https://www.nps.gov/subjects/developer/guides.htm
- https://dev.opentripmap.org/product
- https://en.wikivoyage.org/w/api.php
- https://www.npmjs.com/package/atlas-obscura-api
- https://github.com/bartholomej/atlas-obscura-api

**Web search and Agent SDK**
- https://code.claude.com/docs/en/costs
- https://code.claude.com/docs/en/agent-sdk/overview
- https://exa.ai/pricing
- https://exa.ai/docs/reference/exa-mcp
- https://docs.tavily.com/documentation/mcp
- https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool
- https://code.claude.com/docs/en/agent-sdk/mcp
- https://code.claude.com/docs/en/agent-sdk/custom-tools
- https://code.claude.com/docs/en/agent-sdk/subagents
- https://github.com/anthropics/claude-agent-sdk-python
- https://github.com/anthropics/claude-agent-sdk-typescript
