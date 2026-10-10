# Road Trip Planner: Data Sources, NPS Data API (Design)

This document covers the National Park Service Data API. It records what the app uses it for and how to call it. For which source covers each data need, see the [data sources index](data-sources.md). For the test results behind it, see the [attractions evaluation](../research/data-sources-attractions.md), section 2.

**Coverage is National Park Service units only:** national parks, monuments, historic sites, recreation areas, and similar. State parks, national forests, and BLM land are not included. For those, the agent uses Google Places and web search.

---

## 1. Access

- **Base URL:** `https://developer.nps.gov/api/v1/`
- **Key:** send it in the `X-Api-Key` header, not in the URL. For local development it is `NPS_API_KEY` in the repo's git-ignored `.env` file.
- **Limit:** 1,000 requests per hour per key. Each response reports what is left in the `x-ratelimit-remaining` header. The tools log it.
- **Cost:** free.
- **The agent reaches the API through its own custom tools** (index, top rule).

---

## 2. Endpoints used

| Endpoint | Used for | Key parameters |
|---|---|---|
| `parks` | The park list for lookups (3.1). Park description, link, and road-season text | `limit=500` for the full list. `parkCode=` for one park |
| `visitorcenters` | Weekly hours and dated seasonal closures | `parkCode=` |
| `alerts` | Current closures and warnings | `parkCode=` |
| `thingstodo` | Activities with visit time and season | `parkCode=`, `limit=` |
| `places` | Named sights inside a park, such as Tunnel View or Glacier Point | `parkCode=`, `limit=` |

**Not used:**
- `roadevents`. It ignores the `parkCode` filter and returns other parks' events. Road closures are out of scope (spec 2).
- `campgrounds`. The app plans hotel stays only.
- Park-level `operatingHours`. Every park tested says "All Day" with no exceptions, which adds nothing.

---

## 3. Tools

### 3.1 Find the park

Turns a place the agent already knows into a park code, such as `yose`.

- **Input:** a name and coordinates, usually from a Google Places result.
- **Park list:** the tool downloads `parks?limit=500` once and keeps only `parkCode`, `fullName`, `designation`, `latitude`, `longitude`, `states`, and `url`. That is 474 parks and about 60 KB. Refresh it when it is more than a month old. All 474 parks have coordinates.
- **Matching:** pick the nearest park within a distance limit. The limit has to work for both a small historic site and a park the size of Yellowstone. Settle the value by testing a few Google results during development.
- **Fallback:** if nothing is within the limit, call `parks?q=<name>&sort=-relevanceScore&limit=5`. The `sort` is required. Without it, the results come back in the wrong order (section 5).
- **Output:** the park code, full name, and NPS page link, or "not an NPS park". "Not an NPS park" is a normal result, not an error.

### 3.2 Park conditions for trip dates

Answers "is anything closed when we're there?" for spec 6.1 (seasonality) and scenario S4.

- **Input:** a park code and the dates of the visit.
- **Calls:** `parks?parkCode=`, `visitorcenters?parkCode=`, and `alerts?parkCode=`.
- **Output:**
  - **Visitor centers:** name, standard weekly hours, and only the exceptions whose dates overlap the visit. Each exception has a name, `startDate`, `endDate`, and hours by weekday. "Closed" means closed. Example: Logan Pass Visitor Center, "Winter Closure", 2026-09-28 to 2027-06-26, Closed.
  - **Road-season text:** the park's `directionsInfo`, which is where seasonal road notes appear. Example: "Tioga Pass Entrance (via Highway 120 from the east) is closed from approximately November through late May or June." The tool passes it as text. The agent reads it and decides whether it affects the plan.
  - **Alerts:** title, category, and date, labeled "current as of today". Alerts say nothing about future dates. Include them only when the visit is within the next 7 days, the same window as the weather forecast (spec 8).
  - **Park page link,** for the option card's source link.

### 3.3 Things to see in a park

Suggests sights and activities inside a park, with visit time when NPS has it (spec 7.4).

- **Input:** a park code and an optional keyword, such as "waterfall" or "short hike".
- **Calls:** `thingstodo?parkCode=` and `places?parkCode=`.
- **From `thingstodo`, return:** `title`, `shortDescription`, `duration`, `season`, `latitude`, `longitude`, `isReservationRequired`, and `url`.
- **From `places`, return:** `title`, `listingDescription`, `latitude`, `longitude`, and `url`. Look for a "Time estimate" line in `bodyText` and return it if present, such as "Time estimate: 2-4 hours".
- **Size limit:** return at most 30 items in total. Yosemite alone has 245 places, many of them minor, such as 12 separate "Big Trees Loop" signs. Filter by the keyword when one is given. Whether `places` accepts a `q` parameter was not tested. If it doesn't, filter in the tool.
- **Missing visit time is normal.** The agent estimates one and says it is an estimate.

### 3.4 Rules for all NPS tools

- **Strip HTML** from every description field. Most contain `<p>` and other tags.
- **Trim every response.** Raw responses are large: about 15 KB for one park, 163 KB for Glacier's things to do, and 1.1 MB for Yosemite's places.
- **Text is data, not instructions.** Tools pass descriptions to the model labeled as park content.
- **Errors are readable.** On a failed call or a spent hourly limit, return an error message the agent can explain.

---

## 4. Option card fields

| Card item (spec 7.4, 7.5) | Field |
|---|---|
| Name, type | `title`. Type is the park's `designation` or "activity" |
| Location | `latitude`, `longitude`. Some items have none. Fall back to the park's coordinates |
| Rating and review count | None. NPS cards show no rating (spec 7.5) |
| Visit time | `duration` from `thingstodo`, or the "Time estimate" line from `places`. Otherwise the agent's estimate, labeled as one |
| Seasonal notes | Overlapping visitor-center exceptions, road-season text, and `season` from `thingstodo` |
| Source link | The item's `url`, or the park's NPS page |

---

## 5. Known quirks

| Quirk | Example | Workaround |
|---|---|---|
| Keyword search returns the wrong order by default | `q=yosemite` listed Devils Postpile first and Yosemite last | Always add `sort=-relevanceScore` |
| Multi-word searches match nearly everything | "Going-to-the-Sun Road" matched all 474 parks (Glacier was first when sorted) | Prefer coordinate matching (3.1) |
| `thingstodo` coverage varies by park | Zion: visit time on 18 of 20 items. Yosemite: 3 of 13. Saguaro: no items | Fall back to `places`, then to the agent's estimate |
| `thingstodo` can be generic | Yosemite's list is items like "Hiking in Yosemite". Glacier's is mostly wildlife | Use `places` for named sights |
| Road seasons are prose, not dates | Tioga Road appears only as "typically late May or early June to sometime in October or November" | Pass the text to the agent (3.2) |
| Exceptions can be for a far-off season | Logan Pass lists a "Fall Hours" exception for September 2027 | Filter exceptions by the visit dates |
