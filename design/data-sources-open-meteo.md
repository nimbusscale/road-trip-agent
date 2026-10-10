# Road Trip Planner: Data Sources, Open-Meteo Historical Weather (Design)

This document covers the Open-Meteo Historical Weather API. The app uses it for seasonal weather averages and hazard counts at each stop, for dates beyond the 7-day forecast (spec 8). It records how to call it and what the tool returns. For which source covers each data need, see the [data sources index](data-sources.md). For the test results behind it, see the [seasonal weather evaluation](../research/data-sources-weather.md).

---

## 1. Access

- **Endpoint:** `GET https://archive-api.open-meteo.com/v1/archive`
- **No key.** Send an identifying User-Agent.
- **Free for non-commercial use.** This app qualifies.
- **Limits:** 600 calls a minute, 5,000 an hour, 10,000 a day.
- **Long requests count as several calls.** Anything over 2 weeks, or over 10 variables, counts as more than one call, in fractions. A 3-week request counts as 1.5 calls. A 10-year request counts as about 260. Section 2 keeps each request short.
- **The agent reaches the API through its own custom tool** (index, top rule).

---

## 2. Seasonal averages tool

### 2.1 Input

- **Coordinates of the stop.** Use the stop's own coordinates, or an attraction's when it is far from the stop, such as Tuolumne Meadows on a Yosemite stop. Open-Meteo adjusts for the elevation of the exact point. Tuolumne came out 22 °F colder than Yosemite Valley, 15 miles away.
- **Dates.** Either exact dates for the stop, or a month when the user gave only a window, such as "sometime in May".

### 2.2 Requests

- **One request per year for the last 10 complete years.** For a trip in 2026, that is 2016 to 2025.
- **Each request covers the stop's dates plus 7 days on each side.** For a stop on October 10 to 12, each year's request covers October 3 to 19. For a month, it covers that calendar month.
- **Parameters:**
  ```
  latitude=38.5733&longitude=-109.5498
  &start_date=2025-10-03&end_date=2025-10-19
  &daily=temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum
  &temperature_unit=fahrenheit&precipitation_unit=inch&timezone=auto
  ```
- **Don't set `models`.** Use the default. The `era5_land` model returns no precipitation or snowfall.
- **Cost per stop:** 10 requests of about 1 to 2.2 calls each, so 10 to 22 calls. A 14-day trip with 8 stops uses at most about 180 of the 10,000 daily calls.

### 2.3 What the tool returns

The tool combines all the days from all 10 years and returns one small summary per stop:

| Field | How it is worked out |
|---|---|
| Label | "Typical for <dates>, based on <first year>–<last year>". The itinerary shows this so averages are never mistaken for a forecast (spec 8) |
| Average high and low, °F | Mean of the daily highs and lows |
| Chance of rain on a given day | Share of days with at least 0.04 in (1 mm) of precipitation |
| Chance of snow on a given day | Share of days with at least 0.4 in (1 cm) of snowfall |
| Hot days | Share of days at or above 90 °F, and at or above 100 °F |
| Freezing nights | Share of nights at or below 32 °F |
| Warmest and coldest seen | Highest high and lowest low in the data |

**Don't return rain or snow totals.** In testing, monthly rain totals ran up to twice NOAA's and snow totals ran at about half. Shares of days held up better.

### 2.4 Errors

- **A spent limit doesn't look like an error at first.** The response is normal JSON with `"error": true`, a `reason`, and no `daily` field. Example reason: "Minutely API request limit exceeded. Please try again in one minute." Check for `error`, not just the HTTP status.
- **Return a readable error** the agent can explain, such as "Seasonal averages are unavailable right now. Try again in a minute."

---

## 3. How the agent uses the results

- **These are typical conditions, not a forecast.** The agent says "typical highs around 70 °F", not "it will be 70 °F". Some years run warmer and some colder.
- **Deserts and mountains swing wider than the numbers show.** In testing, highs came out 2 to 6 °F too low and lows 3 to 5 °F too high in places like Moab, Flagstaff, and Death Valley. Snow can be undercounted. In dry or high places, the agent assumes afternoons are hotter and nights colder than shown. When a value is near freezing or near 90 °F, it gives the warning rather than skipping it.
- **The hazard fields feed seasonal-risk advice (spec 6.1).** For example, many days at 100 °F or above means planning hikes for early morning. Many freezing nights means warm layers. Hazards that the numbers don't show, such as hurricane season, come from the agent's own knowledge.

---

## 4. Attribution

The data is licensed CC BY 4.0. The UI shows "Weather data by Open-Meteo.com", linked to `https://open-meteo.com/`, wherever seasonal averages appear.
