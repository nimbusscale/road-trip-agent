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
import { stayResearcherPrompt } from "./stay-researcher-prompt.js";
import { toolsOn } from "./tool-names.js";

// The stay researcher's tools from tool design section 3, each by name. A worker's
// definition must always list them: without a list, it gets every tool in the session,
// Agent included (technical spec 6.5). The tools are on the query's servers, so the
// definition names no server.
export const STAY_RESEARCHER_TOOLS: readonly string[] = [
  ...toolsOn(TRIP_SERVER_NAME, [
    "read_worker_brief_facts",
    "add_lodging_candidates",
    "add_stop_candidates",
  ]),
  ...toolsOn(PLACES_SERVER_NAME, ["find_place", "search_near"]),
  ...toolsOn(WORKER_SERVER_NAME, [REPORT_RESULT_NAME]),
  "WebSearch",
  "WebFetch",
];

// The stay researcher's own model and effort settings (technical spec section 10).
export interface StayResearcherDefinitionGiven {
  model: string;
  effort: EffortLevel;
}

// The description is what the coordinator is told about the worker type, with its tools.
export function stayResearcherDefinition(
  given: StayResearcherDefinitionGiven,
): AgentDefinition {
  return {
    description:
      "Finds candidates for one stay: its lodging, and the stops whose search area is that stay. Its prompt is a worker brief.",
    prompt: stayResearcherPrompt(),
    model: given.model,
    effort: given.effort,
    tools: [...STAY_RESEARCHER_TOOLS],
  };
}
