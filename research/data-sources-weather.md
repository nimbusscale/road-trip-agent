# Road Trip Planner: Seasonal Weather Evaluation (Open-Meteo Historical)

> **This is a research document, not a design document.** It records what the Open-Meteo Historical Weather API did when called by hand. It does not make design decisions.

This tests the seasonal averages option from [data-sources.md](data-sources.md), section 4.6. Spec section 8 wants typical highs, lows, and precipitation for each stop when the dates are more than 7 days out.

All testing was done on 2026-10-10 with plain `curl` requests from the shell, using an honest User-Agent. A small script averaged the daily values. Official normals for comparison came from the NOAA 1991–2020 tables reproduced on Wikipedia.

---

## 1. Summary

- **It works with no key and no signup.** One request per year returns clean JSON in about half a second.
- **Temperatures are close enough for clothing advice, but not exact.** In humid lowlands they match NOAA within 1 to 2 °F. In deserts and mountains, highs come out 2 to 6 °F too low and lows 3 to 5 °F too high.
- **Precipitation runs high and snowfall runs low** compared with NOAA. A "chance of rain on a given day" holds up better than a monthly total.
- **Heat and cold signals come through clearly.** Death Valley in July showed 31 of 31 days at 90 °F or above, even though its average high was 6 °F low.
- **Long date ranges cost more.** A request longer than two weeks counts as several calls. Fetching only the weeks needed, year by year, keeps it cheap.

---

## 2. Access and limits

- **Endpoint:** `GET https://archive-api.open-meteo.com/v1/archive`
- **Parameters used:** `latitude`, `longitude`, `start_date`, `end_date`, `daily=temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum`, `temperature_unit=fahrenheit`, `precipitation_unit=inch`, `timezone=auto`.
- **No key.** Free for non-commercial use.
- **Limits:** 600 calls a minute, 5,000 an hour, 10,000 a day.
- **How calls are counted:** a request with more than 10 variables, or more than 2 weeks of data, counts as several calls, in fractions. A 31-day request counts as about 2.2 calls. A 10-year request counts as about 260.
- **What happened:** five 10-year requests in a row hit the per-minute limit. The error was `{"error":true,"reason":"Minutely API request limit exceeded. Please try again in one minute."}`, returned with the normal JSON shape and no `daily` field.
- **License:** CC BY 4.0. Attribution to Open-Meteo is required wherever the data is shown.
- **Data delay:** the default model is up to date within a day. ERA5 runs about 5 days behind. Neither matters for averages over past years.

### 2.1 Two ways to fetch 10 years

| Approach | Requests | Size | Time | Counted as |
|---|---|---|---|---|
| One request, every day for 10 years, filtered in code | 1 | 128 KB | 1.3 s | About 260 calls |
| One request per year, October only | 10 | 1.5 KB each | About 0.5 s each, 5 s in total | About 22 calls |

---

## 3. Accuracy against NOAA normals

Open-Meteo values are averages for 2016–2025, using the default model. NOAA values are 1991–2020 normals for the town's main station.

| Place, month | High (OM / NOAA) | Low (OM / NOAA) | Precip in/month (OM / NOAA) | Snow in/month (OM / NOAA) |
|---|---|---|---|---|
| Savannah, September | 85 / 86.4 | 70 / 69.0 | 5.86 / 4.35 | — |
| Phoenix, July | 106 / 106.5 | 85 / 84.5 | 1.92 / 0.91 | — |
| Moab, October | 69 / 73.5 | 45 / 41.7 | 1.24 / 1.03 | 0.6 / 0.1 |
| Flagstaff, January | 40 / 43.4 | 22 / 17.6 | 1.86 / 2.05 | 11.4 / 20.9 |
| Death Valley, July | 111 / 117.4 | 93 / 91.0 | 0.03 / 0.10 | — |

Three places had no NOAA table to compare against. Their results look plausible:

| Place, month | High | Low | Notes |
|---|---|---|---|
| San Francisco, July | 66 | 56 | No rain days. Matches the cool foggy summer |
| Yosemite Valley, January | 50 | 28 | 37 in of snow a month looks high. 2016–2025 includes two record snow years. Not checked |
| Tuolumne Meadows, May | 48 | 27 | 26 nights at or below freezing. 22 °F colder than the Valley 15 miles away, so elevation is handled |

**Why the desert and mountain numbers are off.** The data comes from weather models on a grid of cells 9 to 25 km wide, not from a thermometer in town. The model smooths out the swing between afternoon heat and night cold, which is biggest in dry places. Open-Meteo adjusts for the elevation of the exact point asked for, which is why Tuolumne and Yosemite Valley differ correctly.

### 3.1 Other models

The API takes a `models` option. Three were tried for Moab, Death Valley, and Flagstaff, for 2017–2025:

| Model | Grid | Moab Oct high / low | Death Valley Jul high / low | Flagstaff Jan high / low |
|---|---|---|---|---|
| Default (`best_match`) | 9 km | 69 / 45 | 111 / 93 | 40 / 22 |
| `ecmwf_ifs` | 9 km, from 2017 | 68 / 45 | 111 / 93 | 40 / 22 |
| `era5` | 25 km | 72 / 48 | 115 / 93 | 42 / 24 |
| `era5_land` | 11 km | 70 / 46 | 113 / 94 | 42 / 25 |
| NOAA normal | Station | 73.5 / 41.7 | 117.4 / 91.0 | 43.4 / 17.6 |

None of them fixes the problem. ERA5 gets the highs closer but the lows further off. ERA5-Land returned no precipitation or snowfall at all, only temperatures.

---

## 4. Hazard signals

The same daily data can be counted for heat, cold, and snow:

| Place, month | Days ≥ 90 °F | Days ≥ 100 °F | Nights ≤ 32 °F | Days with rain (≥ 0.04 in) | Snow in/month |
|---|---|---|---|---|---|
| Death Valley, July | 31.0 | 30.7 | 0 | 0.3 | 0 |
| Phoenix, July | 30.6 | 25.9 | 0 | 4.7 | 0 |
| Savannah, September | 3.2 | 0.1 | 0 | 13.3 | 0 |
| Flagstaff, January | 0 | 0 | 29.0 | 6.4 | 11.4 |
| Tuolumne Meadows, May | 0 | 0 | 26.4 | 7.8 | 9.3 |
| Moab, October | 0.1 | 0 | 1.7 | 4.5 | 0.6 |

These are averages per month over 10 years. They show heat and freezing risk clearly. They say nothing about hurricanes, since one storm is rare in any one place.

---

## 5. Alternatives not tested

- **NOAA NCEI Climate Normals:** the official 1991–2020 numbers, as in the comparison column. Each lookup needs a nearby weather station found first, and stations can be at a different elevation from the stop. Worth a look only if a few degrees matters.
- **Google Weather API:** keeps only 24 hours of history, so it can't give averages ([data-sources.md](data-sources.md), section 4.6).

---

## 6. Sources

- https://open-meteo.com/en/docs/historical-weather-api
- https://open-meteo.com/en/pricing
- https://en.wikipedia.org/wiki/Moab,_Utah (climate table, NOAA 1991–2020)
- https://en.wikipedia.org/wiki/Flagstaff,_Arizona (climate table, NOAA 1991–2020)
- https://en.wikipedia.org/wiki/Furnace_Creek,_California (climate table, NOAA 1991–2020)
- https://en.wikipedia.org/wiki/Savannah,_Georgia (climate table, NOAA 1991–2020)
- https://en.wikipedia.org/wiki/Phoenix,_Arizona (climate table, NOAA 1991–2020)
