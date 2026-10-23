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

  it("gives only the trip and memory servers, with no built-in tools and no settings files", () => {
    const options = coordinatorOptions(given(), conversation(), false);
    expect(Object.keys(options.mcpServers ?? {})).toEqual(["trip", "memory"]);
    expect(options.allowedTools).toEqual(["mcp__trip", "mcp__memory"]);
    expect(options.tools).toEqual([]);
    expect(options.settingSources).toEqual([]);
    expect(options.strictMcpConfig).toBe(true);
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
