import type {
  HookCallback,
  HookInput,
  HookJSONOutput,
} from "@anthropic-ai/claude-agent-sdk";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { plannedMoab } from "../tools/skeleton-tools.fake.js";
import {
  agentCall,
  agentCallDone,
  type Caller,
  subagentStop,
  toolCall,
} from "./fake-hook-inputs.schema.js";
import { MAX_SEND_BACKS, SEND_BACK_TEXT, workerHooks } from "./worker-hooks.js";

// The worker hooks over the Moab example as planned (domain model 5.2), fed the hook
// inputs the Agent SDK sends (technical spec 6.5).

const READ_FACTS = "mcp__trip__read_worker_brief_facts";
const ADD_STOP = "mcp__trip__add_stop_candidates";
const SET_STAY_WEATHER = "mcp__trip__set_stay_weather";
const REPORT_RESULT = "mcp__worker__report_result";

const RESEARCHER = { agentId: "a1", agentType: "stay-researcher" };

async function moabHooks() {
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
    // The result the coordinator sees, or undefined when the hook leaves the output as
    // it is.
    result: async (agentType: string, agentId: string) =>
      contentOf(await run(agentHook, agentCallDone(agentType, agentId))),
    agentOutput: (agentType: string, output: unknown) =>
      run(agentHook, agentCall(agentType, output)),
    stop: (agentType: string, agentId: string) =>
      run(stopHook, subagentStop(agentType, agentId)),
  };
}

function run(hook: HookCallback, input: HookInput): Promise<HookJSONOutput> {
  return hook(input, undefined, { signal: new AbortController().signal });
}

// The whole Agent output, with the fields the hook keeps, and its content replaced.
const replacedOutputSchema = z.object({
  status: z.literal("completed"),
  totalTokens: z.literal(3844),
  content: z.tuple([z.object({ type: z.literal("text"), text: z.string() })]),
});

// The replaced output's text, after checking it's the whole output object.
function contentOf(output: HookJSONOutput): string | undefined {
  if (
    !("hookSpecificOutput" in output) ||
    output.hookSpecificOutput.hookEventName !== "PostToolUse"
  ) {
    return undefined;
  }
  const replaced = replacedOutputSchema.parse(
    output.hookSpecificOutput.updatedToolOutput,
  );
  return replaced.content[0].text;
}

describe("the result in place of a worker's last message", () => {
  it("gives each candidate reply in call order, what got no candidates, and the problems and questions", async () => {
    const trip = await moabHooks();
    const { moab, stops } = trip;
    await trip.call(RESEARCHER, READ_FACTS, {
      stopOrStayIds: [moab.id, stops.milts.id, stops.delicateArch.id],
    });
    await trip.call(
      RESEARCHER,
      ADD_STOP,
      { stopId: stops.milts.id },
      "Set 2 for the burgers stop: 1 candidate.\n- Milt's Stop & Eat",
    );
    await trip.call(
      RESEARCHER,
      ADD_STOP,
      { stopId: stops.milts.id },
      "Set 3 for the burgers stop: 1 candidate.\n- Moab Grill",
    );
    await trip.report(
      RESEARCHER,
      ["Only one burger place in Moab fits.", "  "],
      ["Should the Day 2 lunch be a picnic, since the day is all hiking?"],
    );
    expect(await trip.result("stay-researcher", "a1")).toBe(
      [
        "Set 2 for the burgers stop: 1 candidate.\n- Milt's Stop & Eat",
        "Set 3 for the burgers stop: 1 candidate.\n- Moab Grill",
        [
          "No candidates added for:",
          `- Lodging for Stay 1, Moab (${moab.id})`,
          `- Day 2, Stop 1 (${stops.delicateArch.id}), attraction: "a sunrise hike"`,
        ].join("\n"),
        [
          "Problems:",
          "- Only one burger place in Moab fits.",
          "Questions for the user:",
          "- Should the Day 2 lunch be a picnic, since the day is all hiking?",
        ].join("\n"),
      ].join("\n\n"),
    );
  });

  it('says "none" when there are no problems or questions, and leaves out the line for what got nothing when every stop got candidates', async () => {
    const trip = await moabHooks();
    const { stops } = trip;
    await trip.call(RESEARCHER, READ_FACTS, {
      stopOrStayIds: [stops.milts.id],
    });
    await trip.call(RESEARCHER, ADD_STOP, { stopId: stops.milts.id }, "Set 2.");
    await trip.report(RESEARCHER, [], []);
    expect(await trip.result("stay-researcher", "a1")).toBe(
      "Set 2.\n\nProblems: none\nQuestions for the user: none",
    );
  });

  it("uses the last report_result call when there are two", async () => {
    const trip = await moabHooks();
    await trip.report(RESEARCHER, ["First problem."], ["First question?"]);
    await trip.report(RESEARCHER, ["Second problem."], []);
    expect(await trip.result("stay-researcher", "a1")).toBe(
      "Problems:\n- Second problem.\nQuestions for the user: none",
    );
  });

  it("says the worker stopped without reporting, in place of the problems and questions", async () => {
    const trip = await moabHooks();
    const { stops } = trip;
    await trip.call(RESEARCHER, READ_FACTS, {
      stopOrStayIds: [stops.milts.id],
    });
    await trip.call(RESEARCHER, ADD_STOP, { stopId: stops.milts.id }, "Set 2.");
    expect(await trip.result("stay-researcher", "a1")).toBe(
      "Set 2.\n\nThe worker stopped without reporting its problems and questions.",
    );
  });

  it("gives the weather worker's saves, and the stays it saved no weather for", async () => {
    const trip = await moabHooks();
    const { moab, torrey } = trip;
    const weatherWorker = { agentId: "w1", agentType: "weather-worker" };
    await trip.call(weatherWorker, READ_FACTS, {
      stopOrStayIds: [moab.id, torrey.id],
    });
    await trip.call(
      weatherWorker,
      SET_STAY_WEATHER,
      { stayId: moab.id, text: "Warm days, cool nights." },
      "Saved the weather for Stay 1, Moab: seasonal averages.",
    );
    await trip.report(
      weatherWorker,
      ["No forecast for Torrey's last date."],
      [],
    );
    expect(await trip.result("weather-worker", "w1")).toBe(
      [
        "Saved the weather for Stay 1, Moab: seasonal averages.",
        `No weather saved for:\n- Stay 2, Torrey (${torrey.id})`,
        "Problems:\n- No forecast for Torrey's last date.\nQuestions for the user: none",
      ].join("\n\n"),
    );
  });

  it("gives each of two workers only its own calls", async () => {
    const trip = await moabHooks();
    const legScout = { agentId: "l1", agentType: "leg-scout" };
    await trip.call(RESEARCHER, ADD_STOP, { stopId: "stop_aaaaaaaa" }, "Moab.");
    await trip.call(legScout, ADD_STOP, { stopId: "stop_bbbbbbbb" }, "Leg.");
    await trip.report(legScout, [], []);
    expect(await trip.result("leg-scout", "l1")).toBe(
      "Leg.\n\nProblems: none\nQuestions for the user: none",
    );
  });

  it("leaves out a call made by the coordinator, or by an agent type that isn't one of our workers", async () => {
    const trip = await moabHooks();
    await trip.call(
      { agentType: "coordinator" },
      ADD_STOP,
      { stopId: "x" },
      "C",
    );
    await trip.call(
      { agentId: "a1", agentType: "general-purpose" },
      ADD_STOP,
      { stopId: "x" },
      "G",
    );
    await trip.report(RESEARCHER, [], []);
    expect(await trip.result("stay-researcher", "a1")).toBe(
      "Problems: none\nQuestions for the user: none",
    );
  });

  it("leaves the output alone for an agent type that isn't one of our workers", async () => {
    const trip = await moabHooks();
    expect(await trip.result("general-purpose", "a1")).toBeUndefined();
  });

  it("leaves the output alone when the worker isn't done, such as one in the background", async () => {
    const trip = await moabHooks();
    const launched = await trip.agentOutput("stay-researcher", {
      status: "async_launched",
      agentId: "a1",
      description: "Fill the Moab stay",
      prompt: "Fill the stops for the Moab stay.",
      outputFile: "",
    });
    expect(launched).toEqual({});
  });
});

describe("sending back a worker that hasn't called report_result", () => {
  it(`sends it back at most ${String(MAX_SEND_BACKS)} times`, async () => {
    const trip = await moabHooks();
    const sendBack = { decision: "block", reason: SEND_BACK_TEXT };
    expect(await trip.stop("stay-researcher", "a1")).toEqual(sendBack);
    expect(await trip.stop("stay-researcher", "a1")).toEqual(sendBack);
    expect(await trip.stop("stay-researcher", "a1")).toEqual({});
    // Each worker has its own count.
    expect(await trip.stop("stay-researcher", "a2")).toEqual(sendBack);
  });

  it("lets a worker that called it stop", async () => {
    const trip = await moabHooks();
    await trip.report(RESEARCHER, [], []);
    expect(await trip.stop("stay-researcher", "a1")).toEqual({});
  });

  it("ignores agent types that aren't our workers", async () => {
    const trip = await moabHooks();
    expect(await trip.stop("general-purpose", "a1")).toEqual({});
    expect(await trip.stop("coordinator", "a1")).toEqual({});
  });
});
