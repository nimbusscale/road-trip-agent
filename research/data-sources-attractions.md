# Road Trip Planner: Attractions Evaluation (NPS, Wikivoyage, Atlas Obscura, Web Search)

> **This is a research document, not a design document.** It records what each attractions source did when called by hand. It does not make design decisions.

This evaluates the attractions candidates from [data-sources.md](data-sources.md), section 4.5. It also compares general web search with web search limited to Atlas Obscura, since web search is the fallback for both Wikivoyage and Atlas Obscura.

All testing was done on 2026-10-10. API calls were plain `curl` requests from the shell, using an honest User-Agent (`road-trip-agent-learning/0.1` plus a contact email). Web searches used the `WebSearch` and `WebFetch` tools in a Claude Code session. This tests the sources, not the agent's reasoning over them.

---

## 1. Summary

| Source | What worked | What didn't | Fit |
|---|---|---|---|
| **NPS Data API** | Dated seasonal closures for visitor centers and campgrounds. Current alerts. 245 named places in Yosemite with coordinates. Park lookup by coordinates | Park-level hours have no seasonal exceptions. "Things to do" durations are filled for some parks and empty for others. Keyword search needs a sort option to work | **Good.** The only source tested with dated seasonal closures. Parks only |
| **Wikivoyage** | Free, no key, structured listings with coordinates. Coordinate search finds the right page | Coverage gaps (Lockhart, Texas has no page). Same-name towns collide. Big cities split into district pages. Some listings are years old | **Dropped.** Web search covered every town tested, including the one Wikivoyage missed |
| **Atlas Obscura (unofficial library)** | Nothing. Every request was blocked | Cloudflare blocks all non-browser requests, even `robots.txt`. The library gets through by pretending to be a browser | **Don't use.** It depends on getting around a block the site put up on purpose |
| **Web search, general** | Mainstream picks for every town tested, including Lockhart's barbecue | Results include spam pages. Few hours or visit times | **Good** as the general "what to see" source |
| **Web search, Atlas Obscura only** | Unusual places for Boston, Moab, and Tonopah, with no overlap with mainstream lists in big cities | The agent can't open Atlas Obscura pages, so it only gets what the search returns. Small towns may have nothing | **Good** as the "unusual places" source, in place of the library |

**What the research suggests:** wrap NPS as a custom tool. Use web search for both general picks and Atlas Obscura picks, as two different kinds of search. Drop Wikivoyage.

**Outcome (2026-10-10):** NPS and web search were chosen. Wikivoyage and the Atlas Obscura library were dropped. See the [NPS](../design/data-sources-nps.md) and [web search](../design/data-sources-web-search.md) design docs.

---

## 2. NPS Data API

### 2.1 Access

- Base URL `https://developer.nps.gov/api/v1/`. The key goes in the `X-Api-Key` header.
- Response headers show the limit: `x-ratelimit-limit: 1000` and `x-ratelimit-remaining`. That is 1,000 requests per hour.
- About 30 calls were made in this session.

### 2.2 Seasonal hours

This was the main open question from the last session. The test cases were Tioga Road in Yosemite and Going-to-the-Sun Road in Glacier.

**Park-level hours have no seasonal exceptions.** Both Yosemite and Glacier say "open 24 hours a day, 365 days a year", with an empty exceptions list. That is true, but it doesn't help with closed roads or visitor centers.

**Visitor centers and campgrounds do have dated seasonal closures.** Each has standard weekly hours plus a list of dated exceptions.

| Place | Standard hours | Exceptions |
|---|---|---|
| Apgar Visitor Center (Glacier) | 8:00 AM to 5:30 PM | 10 AM to 4 PM from Oct 5 to Oct 11. Closed from Oct 12, 2026 to May 8, 2027 |
| Logan Pass Visitor Center (Glacier) | 9:00 AM to 7:00 PM | Closed from Sep 28, 2026 to Jun 26, 2027 |
| Tuolumne Meadows Visitor Center (Yosemite) | 9:00 AM to 5:00 PM | Closed from Sep 29, 2026 to Jun 5, 2027 |
| Wawona Visitor Center (Yosemite) | 8:00 AM to 5:00 PM | Closed from Oct 12, 2026 to Apr 18, 2027 |
| Yosemite Valley Welcome Center | 9:00 AM to 5:00 PM | None (open all year) |
| Tuolumne Meadows Campground (Yosemite) | — | Closed from Sep 28, 2026 to Jul 1, 2027 |

10 of Yosemite's 16 campgrounds list a winter closure with dates.

**Road seasons are in prose only.** Tioga Road does not appear in the hours data. It shows up as text in two places:
- The park record's `directionsInfo`: "Tioga Pass Entrance (via Highway 120 from the east) is closed from approximately November through late May or June."
- The `places` record for each trailhead on the road: "This trailhead is only reachable by vehicle when Tioga Road is open, typically late May or early June to sometime in October or November."

The agent could read these sentences and reason over them. A tool can't turn them into dates. Road closures are out of scope in the spec anyway, but an attraction that can only be reached by a closed road is in scope (spec 6.1, scenario S4).

**The `roadevents` endpoint ignores the park filter.** Asking for `parkCode=yose,glac` returned 63 events, including Grand Teton's. The Yosemite entries were current (Glacier Point Road closed for smoke until Oct 11). This is live road status, which is out of scope.

### 2.3 Things to do

The spec wants a visit time for each attraction (7.4). The `thingstodo` endpoint has a `duration` field, such as "1-2 Hours". How often it is filled varies a lot by park.

| Park | Items | Duration filled | Season filled | Coordinates |
|---|---|---|---|---|
| Zion | 20 | 18 | 19 | 15 |
| Acadia | 89 | 51 | 85 | 61 |
| Craters of the Moon | 11 | 8 | 9 | 9 |
| White Sands | 8 | 5 | 8 | 6 |
| Arches | 10 | 4 | 4 | 3 |
| Glacier | 41 | 6 | 41 | 14 |
| Yosemite | 13 | 3 | 5 | 5 |
| Big Bend | 19 | 2 | 15 | 8 |
| Grand Canyon | 3 | 2 | 3 | 3 |
| Mesa Verde | 2 | 1 | 2 | 1 |
| Great Smoky Mountains | 45 | 1 | 0 | 45 |
| Saguaro | 0 | 0 | 0 | 0 |

Yosemite's 13 items are mostly general, such as "Hiking in Yosemite" and "Scenic Driving in Yosemite". Glacier's list is mostly wildlife ("Beavers", "Mountain Goats"). Half Dome, Glacier Point, and Tunnel View are not in Yosemite's list.

**The `places` endpoint is richer.** Yosemite has 245 places. 242 have coordinates. Glacier Point and Tunnel View are there, with a description. Some trailhead descriptions include a time estimate in the text, such as "Time estimate: 2-4 hours" for Harden Lake. Many entries are minor, such as 12 separate "Big Trees Loop" signs.

### 2.4 Alerts

Alerts describe current conditions only. On test day there were two for Yosemite and Glacier:
- Yosemite, "Park Closure": "Glacier Point Road is closed due to the Dome Fire until 10/10 at 7 am."
- Glacier, "Information": "Going-to-the-Sun Road is Open for 2026 Season", dated June 22.

These help for trips in the next few days. They say nothing about a trip next spring.

### 2.5 Finding a park code

The agent will usually have a place name and coordinates from Google. It needs a code like `yose`.

**Keyword search works only when sorted by relevance.** Without a sort, `q=yosemite` returned Devils Postpile first and Yosemite last. With `sort=-relevanceScore`, the right park came first in every test:

| Query | Top result | Total matches |
|---|---|---|
| `yosemite` | Yosemite National Park | 3 |
| `arches` | Arches National Park (Gateway Arch second) | 31 |
| `mesa verde` | Mesa Verde National Park | 5 |
| `Going-to-the-Sun Road` | Glacier National Park | 474 (every park) |

**Matching by coordinates is simpler.** The full park list is 474 entries, and every one has coordinates. Trimmed to code, name, coordinates, and states, the whole list is about 60 KB. A tool could download it once, keep it, and pick the nearest park to Google's coordinates. Large parks would need a distance limit that scales with park size.

### 2.6 Response sizes

The raw responses are large and full of HTML. A tool must trim them.

| Call | Raw size |
|---|---|
| One park record | About 15 KB |
| Glacier things to do (41 items) | 163 KB |
| Yosemite places (245 items) | 1.1 MB. About 4,600 characters per place |
| All 474 parks | 3.9 MB |

Description fields contain HTML tags, which the tool should strip.

### 2.7 Fit

NPS is a good custom tool for this project, for three reasons:
- It fills a gap no other tested source fills: dated seasonal closures, for parks.
- The tool has real work to do: find the park by coordinates, strip HTML, and pick out which closures overlap the trip dates. That is a good learning exercise.
- It is free, and 1,000 calls an hour is far more than needed.

The limit is coverage. It covers National Park Service sites only. State parks, national forests, and BLM land are not included.

---

## 3. Wikivoyage

### 3.1 Access

Standard MediaWiki API at `https://en.wikivoyage.org/w/api.php`. No key. About 30 calls were made. One call returned an error with no `query` field. The same call worked on retry.

### 3.2 Coverage

Each page was fetched with `action=parse&prop=wikitext|sections`. A small script parsed the listing templates into records.

| Page | See | Do | Eat | Sleep | With coordinates | With hours |
|---|---|---|---|---|---|---|
| Savannah | 44 | 1 | 24 | 31 | 87 of 118 | 9 |
| Boston (Back Bay–Beacon Hill district) | 26 | 7 | 26 | 19 | 109 of 112 | 89 |
| Austin (Downtown district) | 5 | 14 | 14 | 10 | 48 of 50 | 14 |
| Kingman, AZ | 5 | 12 | 8 | 16 | 51 of 58 | 27 |
| Big Sur | 7 | 5 | 4 | 16 | 38 of 38 | 8 |
| Tucumcari, NM | 8 | 7 | 5 | 10 | 1 of 33 | 3 |
| Moab, UT | 4 | 8 | 2 | 9 | 5 of 27 | 4 |
| Ely, NV | 4 | 3 | 2 | 6 | 17 of 17 | 5 |
| Tonopah, NV | 3 | 4 | 0 | 6 | 16 of 18 | 3 |
| Marfa, TX | 4 | 0 | 2 | 5 | 9 of 15 | 3 |
| Gallup, NM | 3 | 2 | 2 | 3 | 10 of 11 | 4 |
| Lone Pine, CA | 4 | 0 | 1 | 2 | 4 of 11 | 2 |
| Baker, CA | 1 | 0 | 3 | 0 | 7 of 7 | 2 |
| **Lockhart, TX** | — | — | — | — | No page | — |

Small waystation towns have a few listings each. That answers the open question in [data-sources.md](data-sources.md#8-to-check-during-evaluation), item 3: small towns have pages more often than expected, with 5 to 15 listings.

### 3.3 Finding the right page

**Page titles collide.** The page titled "Lockhart" is Lockhart, New South Wales, Australia. Its listings have Australian addresses and phone numbers. The Texas barbecue town has no Wikivoyage page at all, and no page mentions Kreuz Market. A tool that looks pages up by town name would have returned Australian results with no error.

**Coordinate search fixes this.** `list=geosearch` takes coordinates and a radius (up to 10 km) and returns nearby pages. With Google's coordinates for each town:
- 11 of 12 towns returned the right page first, within 1.3 km.
- Lockhart, Texas returned nothing, which is the right answer.
- Big Sur returned nothing. Big Sur is a stretch of coast, and its page's coordinates are more than 10 km from the point used.
- Austin returned the main page plus two district pages.

### 3.4 Big cities

Big city pages hold no listings of their own. They link to district pages.
- Austin's main "See" section has a comment: "Please place individual entries under the appropriate districts, not here." Its 65 parsed listings are all festivals and events.
- Boston's main page has no "See" listings. The Back Bay–Beacon Hill district page alone has 112 listings.

A tool would need to follow district links, or use coordinate search to pick the district nearest the hotel.

### 3.5 Data quality

- **Listings are uneven.** Moab's "See" and "Do" listings are mostly tour companies and jeep rentals. Arches National Park is mentioned 8 times on the page but has no listing of its own.
- **Some listings are old.** Moab's "Jeep trail" listing was last edited in 2018.
- **Descriptions can be empty.** All 7 listings on the Australian Lockhart page had empty descriptions.
- **Coordinates can be missing.** Tucumcari has coordinates on 1 of 33 listings.
- **The Mapparium is there,** on the Boston Back Bay–Beacon Hill district page.

### 3.6 Size

Trimmed to type, name, coordinates, hours, price, link, description, and last-edit date, a "See" or "Do" record is 300 to 500 characters. Moab's 12 records come to about 3,800 characters. Savannah's 45 come to about 22,000.

### 3.7 Fit

Wikivoyage gives the agent something web search doesn't: a short list of places with coordinates, picked by an editor. The tool also has real work to do: find the page by coordinates, parse nested templates, follow districts, and trim.

But web search covered every town tested, including Lockhart, where Wikivoyage has nothing (section 5). For a learning project, Wikivoyage is worth adding only if the extra parsing work is itself the point.

---

## 4. Atlas Obscura (unofficial library)

### 4.1 What the library does

`atlas-obscura-api` version 5.1.0 was published on 2026-05-18. Its source (read, not run) calls four Atlas Obscura URLs:

| Call | URL | How it reads the result |
|---|---|---|
| Places near a point | `/search?nearby=true&lat=...&lng=...` | Pulls a JSON object out of a script tag in the HTML |
| One place, short | `/places/<id>.json?place_only=1` | JSON |
| One place, full | The place's web page | Reads HTML elements, such as the "Know Before You Go" section |
| Every place | `/articles/all-places-in-the-atlas-on-one-map` | Pulls a JSON list out of a script tag |

It sends every request through `got-scraping`, a library that makes requests look like they come from a desktop Chrome or Firefox browser. The code comment next to its error handling says "Better error logging to debug 403s".

### 4.2 What happened

Each URL was called once with an honest User-Agent:

| URL | Result |
|---|---|
| `/robots.txt` | 403. Cloudflare page: "Sorry, you have been blocked" |
| `/terms` | 403, same page |
| Places near Boston | 403, same page |
| `/places/1.json` | 403, same page |
| All places page | 403, same page |

The agent's own `WebFetch` tool also got a 403 on the Mapparium's page.

**The endpoints were not tested past the block.** The library only works by disguising itself as a browser to get past a block the site set up on purpose. Doing that was not tried. The terms of use are still unread, because the terms page is blocked too.

### 4.3 Fit

Don't use the library. Two reasons:
- It works only by getting around the site's bot block. That is not something a learning project should be built on.
- Even ignoring that, it can break whenever Atlas Obscura or Cloudflare changes something.

Web search limited to Atlas Obscura does the same job (section 5).

---

## 5. Web search: general vs Atlas Obscura

### 5.1 How it was tested

Four places: a big city (Boston), a destination town (Moab), a waystation town (Tonopah, NV), and a small town on a theme trip (Lockhart, TX). Each place got two searches:
- **General:** "must-see things to do in Boston", and similar.
- **Atlas Obscura:** `site:atlasobscura.com Boston Massachusetts`, and similar.

Lockhart and Boston then got a third search using the tool's `allowed_domains` setting set to `atlasobscura.com`, instead of `site:` in the query.

In this session, `WebSearch` returned a list of titles and links plus a short written summary of the results. The summaries below come from that.

### 5.2 Results

| Place | General search | Atlas Obscura search | Wikivoyage |
|---|---|---|---|
| **Boston** | Freedom Trail, Museum of Fine Arts, Fenway Park, Public Garden, USS Constitution | Mapparium, Skinny House, Molasses Flood plaque, old burying grounds, Trophy Room under the Longfellow Bridge, Bodega (shop behind a fake Snapple machine) | 26 "See" listings in one district. A mix of both kinds |
| **Moab** | Arches, Canyonlands, Dead Horse Point, river rafting, Slickrock Trail | Potash evaporation ponds, Upheaval Dome, Tusher Tunnel, Gemini Bridges, Moab Rock Shop, Fisher Towers | Mostly tour companies. Arches only in prose |
| **Tonopah** | Mining park, Clown Motel, Mizpah Hotel, stargazing, Central Nevada Museum | Clown Motel, cemetery, mining park, Mizpah Hotel, "McFarthest Spot", Crescent Dunes solar plant | Museum, mining park, cemetery, stargazing |
| **Lockhart** | Four barbecue joints, 1894 courthouse, clock museum (with its Saturday-only hours), state park | Nothing in Lockhart. With `allowed_domains`: Texas-wide lists, plus an article mentioning a Lockhart barbecue place | No page |

### 5.3 What the comparison shows

- **In big places, the two searches find different things.** Boston's two lists share only Old North Church and Faneuil Hall. Moab's share nothing. This supports treating Atlas Obscura as its own source.
- **In small towns, they converge.** Tonopah's two lists are nearly the same. In a small town, the odd places are the main attractions.
- **Atlas Obscura search can come back empty.** Lockhart has no Atlas Obscura entries. The agent should treat that as a normal result.
- **`site:` in the query is leaky.** The Lockhart `site:` search returned Wikipedia and other sites, with no Atlas Obscura pages. Boston's returned mostly user profile pages. With `allowed_domains`, every result came from Atlas Obscura, and they were mostly city guide and category pages ("14 Places to Experience Unusual History in Boston").
- **General search includes spam.** Results for Lockhart included pages hosted on `presentationbuilder.internationaltrucks.com` and `iris.londoncouncils.gov.uk` with unrelated titles. The summaries flagged them as low quality, but the agent should not use them as source links.
- **Search rarely gives hours or visit times.** One result gave the clock museum's hours. None gave visit durations.
- **The agent can't open Atlas Obscura pages.** `WebFetch` gets a 403. So the agent gets the place name, a one-line description, and a link, but nothing from the page itself. That is enough to suggest a place and give a source link. Hours would need a Google Places lookup by name.

---

## 6. Still open

1. **Atlas Obscura's terms of use.** The terms page returns 403 to automated reads. Read it in a browser if the question matters.
2. **NPS park matching by coordinates.** Pick a distance limit that works for both small sites and large parks. Test it on a few Google results.
3. **NPS "things to do" coverage.** It can't be predicted per park. A tool should fall back to `places` and then to web search when durations are missing.

---

## 7. Sources

- https://www.nps.gov/subjects/developer/guides.htm
- https://developer.nps.gov/api/v1/ (endpoints `parks`, `visitorcenters`, `campgrounds`, `thingstodo`, `places`, `alerts`, `roadevents`)
- https://en.wikivoyage.org/w/api.php (`action=parse`, `list=geosearch`, `list=search`)
- https://www.npmjs.com/package/atlas-obscura-api (version 5.1.0, source read from the published package)
- https://www.atlasobscura.com/things-to-do/boston-massachusetts/
- https://atlasobscura.com/things-to-do/moab-utah
- https://assets.atlasobscura.com/things-to-do/tonopah-nevada
- https://www.atlasobscura.com/articles/in-texas-barbecue-has-gone-global
- https://redfin.com/blog/things-to-do-in-boston-ma
- https://fullsuitcase.com/best-things-moab-utah/
- https://www.tonopahnevada.com/things-to-do/
- https://www.lonestartravelguide.com/?p=7711
