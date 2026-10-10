# Road Trip Planner: Data Sources Index (Design)

This index maps each data need in the [functional spec](functional-spec.md) to the source that covers it and the design doc that describes it. Each design doc covers one integration and everything we use it for.

**"Not decided"** means no source has been chosen. Don't add one during implementation without a design decision.

**Every source is called through the agent's own custom tools.** The agent does not connect to third-party MCP servers, local or remote. Our tools control the tool descriptions, the fields returned, and how results are presented to the model. If a source is ever only available as an MCP server, wrap it behind one of our tools.

| Need | Spec | Source | Doc |
|---|---|---|---|
| Find cities, towns, and named places | 5.2, 5.3 | Google Places Text Search | [Maps](data-sources-maps.md) |
| Drive time and distance per leg | 6.1, 9.4 | Google Routes API | [Maps](data-sources-maps.md) |
| Scenic routes | 5.2 | Google Routes API, with waypoints the agent picks | [Maps](data-sources-maps.md) |
| Best stop order on a loop | 5.3 | Google Routes API, stop ordering option | [Maps](data-sources-maps.md) |
| Route line for the map | 9.2 | Google Routes API, sent to the UI, not the model | [Maps](data-sources-maps.md) |
| Hotels near a stop | 7.2 | Google Places Text Search | [Maps](data-sources-maps.md) |
| Restaurants near a stop | 7.3 | Google Places Text Search | [Maps](data-sources-maps.md) |
| Attractions near a stop | 7.4 | Google Places Text Search. Other sources not decided | [Maps](data-sources-maps.md) |
| Notable stops along a leg | 7.4 | Google Places Text Search along the route line. Other sources not decided | [Maps](data-sources-maps.md) |
| Price level, for budget tiers | 7.1 | Google Places, for restaurants. Hotels have no price level, so their tier comes from the summary text | [Maps](data-sources-maps.md) |
| Weekly opening hours | 7.4 | Google Places | [Maps](data-sources-maps.md) |
| Ratings and review counts | 7.5 | Google Places | [Maps](data-sources-maps.md) |
| Source link for option cards | 7.5 | Google Places: Google Maps link and reviews link | [Maps](data-sources-maps.md) |
| Seasonal hours and closures | 6.1 | Not decided | — |
| Seasonal risks (heat, snow, hurricanes) | 6.1 | Not decided | — |
| Weather forecast | 8 | Not decided | — |
| Seasonal weather averages | 8 | Not decided | — |
| UI map | 9.2 | Not decided | — |
