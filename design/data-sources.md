# Road Trip Planner: Data Sources Index (Design)

This index maps each data need in the [functional spec](functional-spec.md) to the source that covers it and the design doc that describes it. Each design doc covers one integration and everything we use it for.

**"Not decided"** means no source has been chosen. Don't add one during implementation without a design decision.

**Every source is called through the agent's own custom tools.** The agent does not connect to third-party MCP servers, local or remote. Our tools control the tool descriptions, the fields returned, and how results are presented to the model. If a source is ever only available as an MCP server, wrap it behind one of our tools. The one exception is web search, which uses Claude Code's built-in tools ([web search](data-sources-web-search.md), section 1).

| Need | Spec | Source | Doc |
|---|---|---|---|
| Find cities, towns, and named places | 5.2, 5.3 | Google Places Text Search | [Google](data-sources-google.md) |
| Drive time and distance per leg | 6.1, 9.4 | Google Routes API | [Google](data-sources-google.md) |
| Scenic routes | 5.2 | Google Routes API, with waypoints the agent picks | [Google](data-sources-google.md) |
| Best stop order on a loop | 5.3 | Google Routes API, stop ordering option | [Google](data-sources-google.md) |
| Route line for the map | 9.2 | Google Routes API, sent to the UI, not the model | [Google](data-sources-google.md) |
| Hotels near a stop | 7.2 | Google Places Text Search | [Google](data-sources-google.md) |
| Restaurants near a stop | 7.3 | Google Places Text Search | [Google](data-sources-google.md) |
| Attractions near a stop | 7.4 | Google Places Text Search. General web search for mainstream sights. Web search limited to Atlas Obscura for unusual places | [Google](data-sources-google.md), [Web search](data-sources-web-search.md) |
| Notable stops along a leg | 7.4 | Google Places Text Search along the route line. Web search limited to Atlas Obscura for towns the leg passes through | [Google](data-sources-google.md), [Web search](data-sources-web-search.md) |
| Sights and activities inside a national park | 7.4 | NPS Data API, things to do and places | [NPS](data-sources-nps.md) |
| Visit time for attractions | 7.4 | NPS, for national parks where it is filled in. Otherwise the agent's own estimate, labeled as one | [NPS](data-sources-nps.md) |
| Price level, for budget tiers | 7.1 | Google Places, for restaurants. Hotels have no price level, so their tier comes from the summary text | [Google](data-sources-google.md) |
| Weekly opening hours | 7.4 | Google Places | [Google](data-sources-google.md) |
| Ratings and review counts | 7.5 | Google Places. Restaurants and hotels, and attractions only where a rating means something | [Google](data-sources-google.md) |
| Source link for option cards | 7.5 | Google Places: Google Maps link and reviews link. NPS page links. Web search result links | [Google](data-sources-google.md), [NPS](data-sources-nps.md), [Web search](data-sources-web-search.md) |
| Seasonal hours and closures | 6.1 | NPS Data API for national parks: dated visitor-center closures and road-season text. Everything else: the agent's own knowledge and web search. The agent says plainly when hours are unconfirmed | [NPS](data-sources-nps.md), [Web search](data-sources-web-search.md) |
| Current park closures and alerts | 6.1 | NPS Data API, for visits within 7 days | [NPS](data-sources-nps.md) |
| Seasonal risks (heat, snow, hurricanes) | 6.1 | Heat, freezing, and snow: counts from the Open-Meteo seasonal averages tool. Hazard seasons such as hurricanes: the agent's own knowledge | [Open-Meteo](data-sources-open-meteo.md) |
| Weather forecast, within 7 days | 8 | Google Weather API | [Google](data-sources-google.md) |
| Seasonal weather averages | 8 | Open-Meteo Historical Weather API | [Open-Meteo](data-sources-open-meteo.md) |
| UI map | 9.2 | Google Maps JavaScript API | [Google](data-sources-google.md) |
