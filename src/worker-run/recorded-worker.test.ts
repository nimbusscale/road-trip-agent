import { describe, expect, it } from "vitest";

import {
  agentCall,
  toolResult,
  toolUse,
  userMessage,
} from "../version-rebuild/fake-recorded-lines.schema.js";
import { recordedWorkerOf } from "./recorded-worker.js";

const ADD_STOPS = "mcp__trip__add_stops";
const ADD_CANDIDATES = "mcp__trip__add_stop_candidates";

// Turn 2 adds a stop, sends a weather worker that saves its weather, then the stay
// researcher, and then adds another stop while the stay researcher runs.
const COORDINATOR = [
  userMessage("2026-11-04T20:00:00.000Z", "Plan Moab."),
  toolUse("2026-11-04T20:00:01.000Z", "turn-1-stop", ADD_STOPS),
  toolResult("2026-11-04T20:00:02.000Z", "turn-1-stop", "Added 1 stop"),
  userMessage("2026-11-04T20:05:00.000Z", "Fill it in."),
  toolUse("2026-11-04T20:05:01.000Z", "breakfast", ADD_STOPS),
  toolResult("2026-11-04T20:05:02.000Z", "breakfast", "Added 1 stop"),
  agentCall(
    "2026-11-04T20:05:03.000Z",
    "weather",
    "weather-worker",
    "Moab's weather.",
  ),
  toolResult("2026-11-04T20:05:20.000Z", "weather", "done"),
  agentCall(
    "2026-11-04T20:05:21.000Z",
    "stay",
    "stay-researcher",
    "Fill Moab.",
  ),
  toolUse("2026-11-04T20:05:22.000Z", "dinner", ADD_STOPS),
  toolResult("2026-11-04T20:05:23.000Z", "dinner", "Added 1 stop"),
  toolResult("2026-11-04T20:06:00.000Z", "stay", "done"),
];

const WEATHER = [
  toolUse("2026-11-04T20:05:04.000Z", "set-weather", "mcp__trip__set_weather"),
  toolResult("2026-11-04T20:05:10.000Z", "set-weather", "Saved"),
];

const STAY = [
  toolUse("2026-11-04T20:05:30.000Z", "candidates", ADD_CANDIDATES),
  toolResult("2026-11-04T20:05:31.000Z", "candidates", "Added 3"),
];

const WORKERS = new Map([
  ["subagents/agent-weather", WEATHER],
  ["subagents/agent-stay", STAY],
]);

describe("recordedWorkerOf", () => {
  it("gives the worker's turn, its worker brief, and the turn's calls that reached the trip before it was sent", () => {
    const worker = recordedWorkerOf(COORDINATOR, WORKERS, "stay");

    expect(worker).toMatchObject({
      turn: 2,
      workerType: "stay-researcher",
      workerBrief: "Fill Moab.",
      sentAt: new Date("2026-11-04T20:05:21.000Z"),
    });
    expect(worker.callsBefore.map((call) => call.toolUseId)).toEqual([
      "breakfast",
      "set-weather",
    ]);
  });

  it("refuses an Agent call the coordinator never made", () => {
    expect(() => recordedWorkerOf(COORDINATOR, WORKERS, "nope")).toThrow(
      "The coordinator's transcript has no Agent call nope.",
    );
  });
});
