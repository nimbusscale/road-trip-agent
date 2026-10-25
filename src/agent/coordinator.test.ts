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
      "Agent",
    ]);
    expect(options.tools).toEqual(["Agent"]);
    expect(options.settingSources).toEqual([]);
    expect(options.strictMcpConfig).toBe(true);
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
