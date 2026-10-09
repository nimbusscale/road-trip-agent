# Road Trip Planner: Data Sources, Maps (Design)

This document covers the Mapbox and TomTom MCP servers: routing, and the places they return. It records what we use each server for and the implementation details that come with it. For which source covers each data need, see the [data sources index](data-sources.md).

---

## 1. Maps: use both Mapbox and TomTom, split by job

**Decision.** Use the TomTom MCP server for driving and the Mapbox MCP server for places. Each one is clearly better at its own job, and the jobs split cleanly.

### 1.1 Which server for which job

| Job | Server | Tool | Why |
|---|---|---|---|
| Drive time and distance for each leg | TomTom | `tomtom-routing` | Returns time and distance for every leg by default. Mapbox 0.15.1's directions tool returns only totals |
| Route with scenic waypoints | TomTom | `tomtom-routing` | Same as above. Takes the waypoints the agent picks |
| Route line for the map | TomTom | `tomtom-routing` with `response_detail=geometry` | Up to 1,000 points, accurate within a few meters. Mapbox holds back full lines over 50 KB |
| Places along a leg | TomTom | `tomtom-search-along-route` | One call with a corridor width. Mapbox needs a five- or six-call workaround with about four times the text |
| Look up a place the user names | Mapbox | `search_and_geocode_tool` | More reliable name matching. TomTom missed "Franklin Barbecue" because it lists it as "Franklin BBQ" |
| Places by type near a stop | Mapbox | `category_search_tool` | Tags places correctly more often. TomTom tags Franklin, Kreuz, and Smitty's as American restaurants, so a barbecue search misses them |
| Option card details for one place | Mapbox | `place_details_tool` | Price level (for some places), hours, website, and flags like "reservations required". TomTom has no price level |
| Best order for a loop | Mapbox | `optimization_tool` | Picks the stop order in one call, with time per leg. Up to 12 stops |
| Quick summary of a spot | Mapbox | `ground_location_tool` | Names the area and lists nearby places in one call |

### 1.2 What neither server covers

- **Ratings and review counts.** Option cards (spec 7.5) need another source. Not yet decided.
- **A link to reviews.** Both servers give the business's own website, not a review page.
- **Seasonal hours.** Both give hours for a normal week only. Seasonality checks (spec 6.1) need another source. The two servers also disagreed on Hearst Castle's hours, so treat hours as a hint.
- **A real scenic route option.** TomTom's `thrilling` route type and Mapbox's "avoid motorways" both sent San Francisco to Los Angeles inland, not down the coast. The agent has to choose scenic waypoints itself.

### 1.3 Moving a place from TomTom to Mapbox

A place found by TomTom has no Mapbox ID. To get option card details for it, the agent has to search Mapbox by name near the place's coordinates, then call place details. That is one or two extra calls per place.

- **Skip this for viewpoints and pull-offs** found along a leg. They rarely need option card details.
- **Do it for restaurants and hotels** that will appear on an option card.

### 1.4 Things to settle during implementation

- **Local or hosted servers.** This document describes the local servers, `@mapbox/mcp-server` 0.15.1 and `@tomtom-org/tomtom-mcp` 1.6.12. Both providers also host remote servers. The hosted ones may run different versions with different behavior, including the Mapbox prompts in section 2 below. Test whichever one the agent uses.
- **Route line for the UI map.** A route line through the MCP server goes into the model's context: about 22,000 characters for one Big Sur leg. Better to send route lines straight to the UI instead of through the model. One way is for the backend to call TomTom's routing API directly for drawing.
- **UI map and provider terms.** The UI map is not decided. If it uses another provider's map, check whether TomTom's terms allow showing its routes there.
- **Response size.** Mapbox returns about 1,500 characters per place, and a third-party server's output can't be trimmed. Consider running place searches in a subagent so only its summary reaches the main agent.

### 1.5 Quotas

| Provider | Free monthly limit | Notes |
|---|---|---|
| Mapbox | 100,000 requests a month, per the Mapbox account page, with a card on file | Adding a card lifts the default 1,000-a-month cap on place details |
| TomTom | 2,500 search calls and 20,000 routing calls | **The tightest limit.** A search along a route appears to count against both. Keep most place searches on Mapbox |

### 1.6 Known quirks

| Server | Quirk | Workaround |
|---|---|---|
| Mapbox | `optimization_tool` with `overview=false` fails with a validation error | Use `overview=simplified` |
| Mapbox | `directions_tool` drops per-leg times and holds back route lines over 50 KB | Use TomTom for both |
| Mapbox | A name with an apostrophe ("Smitty's Market") returned a town in France | Fall back to a category search near the stop |
| Mapbox | Austin hotel searches include fake listings ("Jennifer walter", "Petfriendly") | The agent should treat listings with no street address and no website as suspect |
| TomTom | Along-route results are not in route order | Sort by position along the leg before presenting |
| TomTom | Routes list today's traffic incidents even with `traffic=historical` | Set `departAt` to the trip date |

---

## 2. Mapbox prompts (elicitation)

**Decision.** The agent must never let a Mapbox call wait for a person. Unanswered prompts are declined, and Mapbox then returns all results.

### 2.1 What happens

Mapbox 0.15.1 uses MCP elicitation, a protocol feature that lets a server ask the person a question in the middle of a tool call. The server sends an `elicitation/create` request with a short form, and the call waits for an answer.

- `search_and_geocode_tool` asks the person to pick one result whenever a search returns 2 to 10 results.
- `directions_tool` asks the person to pick a route when it gets two or more routes back.
- **If the answer is decline or cancel,** Mapbox returns all results. That is what the agent should get.
- **If the client never said it supports elicitation,** the server can't send the prompt, and Mapbox returns all results.

The model never sees these prompts. They travel between the MCP client and the server, so instructions in the agent's prompt can't answer them. They also can't be turned off in the MCP server JSON config. Mapbox has no setting for this.

TomTom's server has not been seen to send these prompts.

### 2.2 How to handle it in the Agent SDK

| SDK | Default behavior | Status |
|---|---|---|
| TypeScript | The docs say an elicitation that no hook or `onElicitation` callback handles is declined automatically | Likely fine with no code. Confirm with a test |
| Python | Not documented. The SDK's hook input types don't list the elicitation events | **Unknown.** Test before relying on it |

To decline explicitly, add an `Elicitation` hook with the matcher `mapbox` that returns:

```json
{"hookSpecificOutput": {"hookEventName": "Elicitation", "action": "decline"}}
```

The docs list this hook for Claude Code and in the TypeScript SDK's types. They don't say outright that it fires in SDK sessions.

**Test once the language is chosen.** Run a Mapbox search that returns several results, such as "Franklin Barbecue" with no location bias. Confirm the call returns quickly with all results.

### 2.3 Sampling

`ground_location_tool` uses a related feature, sampling, which lets the server ask the client's model a question. If the client doesn't offer sampling, the tool uses a default and still works. No action needed.
