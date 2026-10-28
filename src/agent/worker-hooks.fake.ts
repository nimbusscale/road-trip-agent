import type {
  HookCallback,
  HookInput,
  HookJSONOutput,
} from "@anthropic-ai/claude-agent-sdk";
import { vi } from "vitest";

import { plannedMoab } from "../tools/skeleton-tools.fake.js";
import {
  agentCall,
  agentCallDone,
  type Caller,
  subagentStop,
  toolCall,
  webSearchCall,
} from "./fake-hook-inputs.schema.js";
import { workerHooks } from "./worker-hooks.js";

// The worker hooks over the Moab example as planned (domain model 5.2), fed the hook
// inputs the Agent SDK sends (technical spec 6.5), for worker-hooks.test.ts.

export const READ_FACTS = "mcp__trip__read_worker_brief_facts";
export const ADD_STOP = "mcp__trip__add_stop_candidates";
export const SET_STAY_WEATHER = "mcp__trip__set_stay_weather";
const REPORT_RESULT = "mcp__worker__report_result";

export const RESEARCHER = { agentId: "a1", agentType: "stay-researcher" };
export const LEG_SCOUT = { agentId: "a2", agentType: "leg-scout" };

export async function moabHooks() {
  const planned = await plannedMoab();
  const hooks = workerHooks({
    ...planned.fixture,
    tripId: planned.example.trip.id,
  });
  // Each test feeds a hook only the calls its matcher lets through.
  const hookFor = (
    event: "PostToolUse" | "SubagentStop",
    isMatcher: (matcher: string | undefined) => boolean,
  ) => {
    const hook = hooks[event]?.find((each) => isMatcher(each.matcher))
      ?.hooks[0];
    if (hook === undefined) {
      throw new Error(`No ${event} hook.`);
    }
    return hook;
  };
  const recordHook = hookFor("PostToolUse", (matcher) => matcher !== "Agent");
  const agentHook = hookFor("PostToolUse", (matcher) => matcher === "Agent");
  const stopHook = hookFor("SubagentStop", () => true);
  const { moab, torrey, stops } = planned.example;
  return {
    moab,
    torrey,
    stops,
    // A worker's call that succeeded.
    call: (caller: Caller, tool: string, input: unknown, reply?: string) =>
      run(recordHook, toolCall(caller, tool, input, reply)),
    report: (caller: Caller, problems: string[], questionsForUser: string[]) =>
      run(
        recordHook,
        toolCall(caller, REPORT_RESULT, { problems, questionsForUser }),
      ),
    // The Agent hook's output once the worker is done.
    resultOutput: (agentType: string, agentId: string) =>
      run(agentHook, agentCallDone(agentType, agentId)),
    agentOutput: (agentType: string, output: unknown) =>
      run(agentHook, agentCall(agentType, output)),
    stop: (agentType: string, agentId: string) =>
      run(stopHook, subagentStop(agentType, agentId)),
    // Every later read of the trip fails, such as when the database is down.
    failTripReads: (message: string) =>
      vi
        .spyOn(planned.fixture.reader, "read")
        .mockRejectedValue(new Error(message)),
  };
}

// The hook on WebSearch, which runs before each search. It reads nothing from the trip.
export async function webSearchHook() {
  const planned = await plannedMoab();
  const hooks = workerHooks({
    ...planned.fixture,
    tripId: planned.example.trip.id,
  });
  const hook = hooks.PreToolUse?.find((each) => each.matcher === "WebSearch")
    ?.hooks[0];
  if (hook === undefined) {
    throw new Error("No PreToolUse hook on WebSearch.");
  }
  return (
    caller: Caller,
    query: string,
    allowedDomains: string[] | undefined,
  ) => run(hook, webSearchCall(caller, query, allowedDomains));
}

function run(hook: HookCallback, input: HookInput): Promise<HookJSONOutput> {
  return hook(input, undefined, { signal: new AbortController().signal });
}
