import { describe, expect, it } from "vitest";

import { EXAMPLE_SETTINGS } from "../domain/example-trip-parts.fake.js";
import { coordinatorOptions } from "./coordinator.js";
import {
  AGENT_SESSION_ID,
  conversation,
  coordinatorGiven,
} from "./coordinator.fake.js";

const SETTINGS = { ...EXAMPLE_SETTINGS, coordinatorModel: "claude-test-1-2" };

function given(): ReturnType<typeof coordinatorGiven> {
  return coordinatorGiven(SETTINGS);
}

describe("coordinatorOptions", () => {
  it("uses the exact model ID from the settings", () => {
    expect(coordinatorOptions(given(), conversation(), false).model).toBe(
      "claude-test-1-2",
    );
  });

  it("gives only the trip, memory, places, and routing servers, with no built-in tools and no settings files", () => {
    const options = coordinatorOptions(given(), conversation(), false);
    expect(Object.keys(options.mcpServers ?? {})).toEqual([
      "trip",
      "memory",
      "places",
      "routing",
    ]);
    // The places server will hold the workers' searches too (tool design 3).
    expect(options.allowedTools).toEqual([
      "mcp__trip",
      "mcp__memory",
      "mcp__places__find_place",
      "mcp__places__read_place",
      "mcp__routing",
    ]);
    expect(options.tools).toEqual([]);
    expect(options.settingSources).toEqual([]);
    expect(options.strictMcpConfig).toBe(true);
  });

  it("runs as the coordinator agent, whose definition lists each tool allowedTools lets it use", () => {
    const options = coordinatorOptions(given(), conversation(), false);
    expect(options.agent).toBe("coordinator");
    const definition = options.agents?.coordinator;
    // Every tool on the trip, memory, and routing servers, and the places server's
    // find_place and read_place: what allowedTools lets the coordinator use.
    expect(definition?.tools).toEqual([
      "mcp__trip__read_trip_brief",
      "mcp__trip__update_trip_brief",
      "mcp__trip__read_itinerary",
      "mcp__trip__find_in_trip",
      "mcp__trip__update_itinerary",
      "mcp__trip__add_stay",
      "mcp__trip__update_stay",
      "mcp__trip__remove_stay",
      "mcp__trip__update_day",
      "mcp__trip__add_stops",
      "mcp__trip__update_stop",
      "mcp__trip__move_stop",
      "mcp__trip__remove_stops",
      "mcp__trip__set_waypoints",
      "mcp__trip__select_candidate",
      "mcp__trip__select_user_place",
      "mcp__trip__reject_places",
      "mcp__memory__read_memory",
      "mcp__memory__add_memory_item",
      "mcp__memory__update_memory_item",
      "mcp__memory__forget_memory_item",
      "mcp__places__find_place",
      "mcp__places__read_place",
      "mcp__routing__compute_route",
    ]);
  });

  it("gives the coordinator's definition the same prompt and model as the query", () => {
    const options = coordinatorOptions(given(), conversation(), false);
    const definition = options.agents?.coordinator;
    expect(definition?.prompt).toBe(options.systemPrompt);
    expect(definition?.model).toBe("claude-test-1-2");
  });

  it("asks for a summary of the model's thinking", () => {
    expect(coordinatorOptions(given(), conversation(), false).thinking).toEqual(
      {
        type: "adaptive",
        display: "summarized",
      },
    );
  });

  it("starts a session with no transcript under the ID the app chose", () => {
    const options = coordinatorOptions(given(), conversation(), false);
    expect(options.sessionId).toBe(AGENT_SESSION_ID);
    expect(options.resume).toBeUndefined();
  });

  it("resumes a session that has a transcript from it", () => {
    const options = coordinatorOptions(given(), conversation(), true);
    expect(options.resume).toBe(AGENT_SESSION_ID);
    expect(options.sessionId).toBeUndefined();
    expect(options.sessionStoreFlush).toBe("eager");
  });
});
