import type {
  AgentDefinition,
  EffortLevel,
} from "@anthropic-ai/claude-agent-sdk";

import { TRIP_SERVER_NAME } from "../tools/trip-server.js";
import { WEATHER_SERVER_NAME } from "../tools/weather-server.js";
import {
  REPORT_RESULT_NAME,
  WORKER_SERVER_NAME,
} from "../tools/worker-server.js";
import { toolsOn } from "./tool-names.js";
import { weatherWorkerPrompt } from "./weather-worker-prompt.js";

// The weather worker's tools from tool design section 3, each by name. A worker's
// definition must always list them: without a list, it gets every tool in the session,
// Agent included (technical spec 6.5). Only this definition lists look_up_stay_weather,
// so no other agent is sent it.
export const WEATHER_WORKER_TOOLS: readonly string[] = [
  ...toolsOn(TRIP_SERVER_NAME, ["read_worker_brief_facts", "set_stay_weather"]),
  ...toolsOn(WEATHER_SERVER_NAME, ["look_up_stay_weather"]),
  ...toolsOn(WORKER_SERVER_NAME, [REPORT_RESULT_NAME]),
];

// The weather worker's own model and effort settings (technical spec section 10).
export interface WeatherWorkerDefinitionGiven {
  model: string;
  effort: EffortLevel;
}

// The description is what the coordinator is told about the worker type, with its tools.
export function weatherWorkerDefinition(
  given: WeatherWorkerDefinitionGiven,
): AgentDefinition {
  return {
    description:
      "Writes each stay's weather and clothing text, from a forecast or seasonal averages, tied to the stay's activities. Its prompt is a worker brief with only stay IDs.",
    prompt: weatherWorkerPrompt(),
    model: given.model,
    effort: given.effort,
    tools: [...WEATHER_WORKER_TOOLS],
  };
}
