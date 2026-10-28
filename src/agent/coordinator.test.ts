import { describe, expect, it } from "vitest";

import { EXAMPLE_SETTINGS } from "../domain/example-trip-parts.fake.js";
import { coordinatorOptions } from "./coordinator.js";
import {
  AGENT_SESSION_ID,
  conversation,
  coordinatorGiven,
} from "./coordinator.fake.js";

const SETTINGS = {
  ...EXAMPLE_SETTINGS,
  coordinatorModel: "claude-test-1-2",
  workerModel: "claude-test-3-4",
};

function given(): ReturnType<typeof coordinatorGiven> {
  return coordinatorGiven(SETTINGS);
}

describe("coordinatorOptions", () => {
  it("uses the exact model ID from the settings", () => {
    expect(coordinatorOptions(given(), conversation(), false).model).toBe(
      "claude-test-1-2",
    );
  });

  it("gives only our servers and three built-in tools, and lets each run without asking, with no settings files", () => {
    const options = coordinatorOptions(given(), conversation(), false);
    expect(Object.keys(options.mcpServers ?? {})).toEqual([
      "trip",
      "memory",
      "places",
      "routing",
      "worker",
    ]);
    expect(options.tools).toEqual(["Agent", "WebSearch", "WebFetch"]);
    expect(options.allowedTools).toEqual([
      "Agent",
      "WebSearch",
      "WebFetch",
      "mcp__trip",
      "mcp__memory",
      "mcp__places",
      "mcp__routing",
      "mcp__worker",
    ]);
    expect(options.permissionMode).toBe("dontAsk");
    expect(options.settingSources).toEqual([]);
    expect(options.strictMcpConfig).toBe(true);
  });

  // The tools the definition lists show in the coordinator's view file, so they aren't
  // listed again here.
  it("runs as the coordinator agent", () => {
    const options = coordinatorOptions(given(), conversation(), false);
    expect(options.agent).toBe("coordinator");
  });

  it("gives the coordinator's definition the same prompt and model as the query", () => {
    const options = coordinatorOptions(given(), conversation(), false);
    const definition = options.agents?.coordinator;
    expect(definition?.prompt).toBe(options.systemPrompt);
    expect(definition?.model).toBe("claude-test-1-2");
  });

  it("runs the stay researcher on the worker model from the settings", () => {
    const options = coordinatorOptions(given(), conversation(), false);
    expect(options.agents?.["stay-researcher"]?.model).toBe("claude-test-3-4");
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
