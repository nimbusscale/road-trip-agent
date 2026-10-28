import type { AgentDefinition } from "@anthropic-ai/claude-agent-sdk";

import { MEMORY_SERVER_NAME } from "../tools/memory-server.js";
import { PLACES_SERVER_NAME } from "../tools/places-server.js";
import { ROUTING_SERVER_NAME } from "../tools/routing-server.js";
import { TRIP_SERVER_NAME } from "../tools/trip-server.js";

// The coordinator's agent type (technical spec section 1). The query runs it as the
// session's main agent (technical spec 6.5).
export const COORDINATOR_AGENT_TYPE = "coordinator";

// A tool's name as the model sees it, such as mcp__trip__read_trip_brief (tool design,
// section 1).
function toolsOn(serverName: string, toolNames: string[]): string[] {
  return toolNames.map((toolName) => `mcp__${serverName}__${toolName}`);
}

// The coordinator's tools from tool design section 3 that exist so far, each by name.
// The definition's list is what the coordinator is sent, so a tool on the same server
// that only workers get, such as search_near, stays out of its sight.
export const COORDINATOR_TOOLS: readonly string[] = [
  ...toolsOn(TRIP_SERVER_NAME, [
    "read_trip_brief",
    "update_trip_brief",
    "read_itinerary",
    "find_in_trip",
    "update_itinerary",
    "add_stay",
    "update_stay",
    "remove_stay",
    "update_day",
    "add_stops",
    "update_stop",
    "move_stop",
    "remove_stops",
    "set_waypoints",
    "select_candidate",
    "select_user_place",
    "reject_places",
  ]),
  ...toolsOn(MEMORY_SERVER_NAME, [
    "read_memory",
    "add_memory_item",
    "update_memory_item",
    "forget_memory_item",
  ]),
  ...toolsOn(PLACES_SERVER_NAME, ["find_place", "read_place"]),
  ...toolsOn(ROUTING_SERVER_NAME, ["compute_route"]),
];

export interface CoordinatorDefinitionGiven {
  // The coordinator's instructions, the same text as the query's systemPrompt.
  prompt: string;
  model: string;
}

// The main agent gets the query's systemPrompt, not this prompt. Its model is this one,
// though, and without it the agent could get a default subagent model. Both are set to
// the query's values, so nothing depends on which one the SDK uses (technical spec 6.5).
export function coordinatorDefinition(
  given: CoordinatorDefinitionGiven,
): AgentDefinition {
  return {
    description:
      "Talks to the user and plans the trip. It's the session's main agent, so it's never started as a worker.",
    prompt: given.prompt,
    model: given.model,
    tools: [...COORDINATOR_TOOLS],
  };
}
