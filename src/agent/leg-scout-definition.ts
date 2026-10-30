import type {
  AgentDefinition,
  EffortLevel,
} from "@anthropic-ai/claude-agent-sdk";

import { PLACES_SERVER_NAME } from "../tools/places-server.js";
import { TRIP_SERVER_NAME } from "../tools/trip-server.js";
import {
  REPORT_RESULT_NAME,
  WORKER_SERVER_NAME,
} from "../tools/worker-server.js";
import { legScoutPrompt } from "./leg-scout-prompt.js";
import { toolsOn } from "./tool-names.js";

// The leg scout's tools from tool design section 3, each by name, as for the stay
// researcher (technical spec 6.5). It gets both web tools, as the stay researcher does, to
// check what it finds on Atlas Obscura (technical spec 6.2).
export const LEG_SCOUT_TOOLS: readonly string[] = [
  ...toolsOn(TRIP_SERVER_NAME, [
    "read_worker_brief_facts",
    "add_stop_candidates",
  ]),
  ...toolsOn(PLACES_SERVER_NAME, [
    "find_place",
    "search_along_leg",
    "search_near",
  ]),
  ...toolsOn(WORKER_SERVER_NAME, [REPORT_RESULT_NAME]),
  "WebSearch",
  "WebFetch",
];

// The leg scout's own model and effort settings (technical spec section 10).
export interface LegScoutDefinitionGiven {
  model: string;
  effort: EffortLevel;
}

// The description is what the coordinator is told about the worker type, with its tools.
export function legScoutDefinition(
  given: LegScoutDefinitionGiven,
): AgentDefinition {
  return {
    description:
      "Finds candidates for the stops along one day's drive, and on the first and last days, the stops near the start or end place. Its prompt is a worker brief.",
    prompt: legScoutPrompt(),
    model: given.model,
    effort: given.effort,
    tools: [...LEG_SCOUT_TOOLS],
  };
}
