# Road Trip Planner: Data Sources Index (Design)

This index maps each data need in the [functional spec](functional-spec.md) to the source that covers it and the design doc that describes it. Each design doc covers one integration and everything we use it for.

**"Not decided"** means no source has been chosen. Don't add one during implementation without a design decision.

| Need | Spec | Source | Doc |
|---|---|---|---|
| Find cities, towns, and named places | 5.2, 5.3 | Mapbox search | [Maps](data-sources-maps.md) |
| Drive time and distance per leg | 6.1, 9.4 | TomTom routing | [Maps](data-sources-maps.md) |
| Scenic routes | 5.2 | TomTom routing, with waypoints the agent picks | [Maps](data-sources-maps.md) |
| Best stop order on a loop | 5.3 | Mapbox optimization | [Maps](data-sources-maps.md) |
| Route line for the map | 9.2 | TomTom routing | [Maps](data-sources-maps.md) |
| Hotels near a stop | 7.2 | Mapbox category search and place details | [Maps](data-sources-maps.md) |
| Restaurants near a stop | 7.3 | Mapbox category search and place details | [Maps](data-sources-maps.md) |
| Attractions near a stop | 7.4 | Mapbox category search. Other sources not decided | [Maps](data-sources-maps.md) |
| Notable stops along a leg | 7.4 | TomTom search along route. Other sources not decided | [Maps](data-sources-maps.md) |
| Price level, for budget tiers | 7.1 | Mapbox place details, for some places only. A fuller source is not decided | [Maps](data-sources-maps.md) |
| Weekly opening hours | 7.4 | Mapbox place details | [Maps](data-sources-maps.md) |
| Ratings and review counts | 7.5 | Not decided | — |
| Source link for option cards | 7.5 | Mapbox place details gives the business website. A review link is not decided | [Maps](data-sources-maps.md) |
| Seasonal hours and closures | 6.1 | Not decided | — |
| Seasonal risks (heat, snow, hurricanes) | 6.1 | Not decided | — |
| Weather forecast | 8 | Not decided | — |
| Seasonal weather averages | 8 | Not decided | — |
| UI map | 9.2 | Not decided | — |
