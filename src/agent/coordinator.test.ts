import { describe, expect, it } from "vitest";

import { EXAMPLE_SETTINGS } from "../domain/example-trip-parts.fake.js";
import { coordinatorOptions } from "./coordinator.js";
import {
  AGENT_SESSION_ID,
  conversation,
  coordinatorGiven,
} from "./coordinator.fake.js";

// Each agent's model and effort unlike the other's, so a setting that reached the wrong
// agent would show up.
const SETTINGS = {
  ...EXAMPLE_SETTINGS,
  coordinatorModel: "claude-test-1-2",
  coordinatorEffort: "xhigh",
  stayResearcherModel: "claude-test-3-4",
  stayResearcherEffort: "low",
  legScoutModel: "claude-test-5-6",
  legScoutEffort: "high",
} as const;

const NEW_SESSION = { hasTranscript: false, timeZone: "UTC" };

function given(): ReturnType<typeof coordinatorGiven> {
  return coordinatorGiven(SETTINGS);
}

describe("coordinatorOptions", () => {
  it("runs the query on the coordinator's model and effort from the settings", () => {
    const options = coordinatorOptions(given(), conversation(), NEW_SESSION);
    expect(options.model).toBe("claude-test-1-2");
    expect(options.effort).toBe("xhigh");
  });

  it("gives only our servers and three built-in tools, and lets each run without asking, with no settings files", () => {
    const options = coordinatorOptions(given(), conversation(), NEW_SESSION);
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
    const options = coordinatorOptions(given(), conversation(), NEW_SESSION);
    expect(options.agent).toBe("coordinator");
  });

  it("gives the coordinator's definition the same prompt, model, and effort as the query", () => {
    const options = coordinatorOptions(given(), conversation(), NEW_SESSION);
    const definition = options.agents?.coordinator;
    expect(definition?.prompt).toBe(options.systemPrompt);
    expect(definition?.model).toBe("claude-test-1-2");
    expect(definition?.effort).toBe("xhigh");
  });

  it("runs the stay researcher on its own model and effort from the settings", () => {
    const options = coordinatorOptions(given(), conversation(), NEW_SESSION);
    const definition = options.agents?.["stay-researcher"];
    expect(definition?.model).toBe("claude-test-3-4");
    expect(definition?.effort).toBe("low");
  });

  it("runs the leg scout on its own model and effort from the settings", () => {
    const options = coordinatorOptions(given(), conversation(), NEW_SESSION);
    const definition = options.agents?.["leg-scout"];
    expect(definition?.model).toBe("claude-test-5-6");
    expect(definition?.effort).toBe("high");
  });

  it("asks for a summary of the model's thinking", () => {
    expect(
      coordinatorOptions(given(), conversation(), NEW_SESSION).thinking,
    ).toEqual({
      type: "adaptive",
      display: "summarized",
    });
  });

  it("starts a session with no transcript under the ID the app chose", () => {
    const options = coordinatorOptions(given(), conversation(), NEW_SESSION);
    expect(options.sessionId).toBe(AGENT_SESSION_ID);
    expect(options.resume).toBeUndefined();
  });

  it("resumes a session that has a transcript from it", () => {
    const options = coordinatorOptions(given(), conversation(), {
      ...NEW_SESSION,
      hasTranscript: true,
    });
    expect(options.resume).toBe(AGENT_SESSION_ID);
    expect(options.sessionId).toBeUndefined();
    expect(options.sessionStoreFlush).toBe("eager");
  });
});
