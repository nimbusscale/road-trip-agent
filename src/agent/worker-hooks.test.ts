import type { HookJSONOutput } from "@anthropic-ai/claude-agent-sdk";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  ADD_STOP,
  moabHooks,
  READ_FACTS,
  RESEARCHER,
  SET_STAY_WEATHER,
} from "./worker-hooks.fake.js";
import { MAX_SEND_BACKS, SEND_BACK_TEXT } from "./worker-hooks.js";

// The worker hooks over the Moab example as planned (domain model 5.2), fed the hook
// inputs the Agent SDK sends (technical spec 6.5).

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

// The Moab hooks, with the result the coordinator sees, or undefined when the hook
// leaves the output as it is.
async function moabTrip() {
  const trip = await moabHooks();
  return {
    ...trip,
    result: async (agentType: string, agentId: string) =>
      contentOf(await trip.resultOutput(agentType, agentId)),
  };
}

describe("the result in place of a worker's last message", () => {
  it("gives each candidate reply in call order, what got no candidates, and the problems and questions", async () => {
    const trip = await moabTrip();
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
    const trip = await moabTrip();
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

  it("lists a stop once when one read_worker_brief_facts call names it twice", async () => {
    const trip = await moabTrip();
    const { stops } = trip;
    await trip.call(RESEARCHER, READ_FACTS, {
      stopOrStayIds: [
        stops.milts.id,
        stops.delicateArch.id,
        stops.delicateArch.id,
      ],
    });
    await trip.call(RESEARCHER, ADD_STOP, { stopId: stops.milts.id }, "Set 2.");
    await trip.report(RESEARCHER, [], []);
    expect(await trip.result("stay-researcher", "a1")).toBe(
      [
        "Set 2.",
        `No candidates added for:\n- Day 2, Stop 1 (${stops.delicateArch.id}), attraction: "a sunrise hike"`,
        "Problems: none\nQuestions for the user: none",
      ].join("\n\n"),
    );
  });

  it("uses the last report_result call when there are two", async () => {
    const trip = await moabTrip();
    await trip.report(RESEARCHER, ["First problem."], ["First question?"]);
    await trip.report(RESEARCHER, ["Second problem."], []);
    expect(await trip.result("stay-researcher", "a1")).toBe(
      "Problems:\n- Second problem.\nQuestions for the user: none",
    );
  });

  it("says the worker stopped without reporting, in place of the problems and questions", async () => {
    const trip = await moabTrip();
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
    const trip = await moabTrip();
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
    const trip = await moabTrip();
    const legScout = { agentId: "l1", agentType: "leg-scout" };
    await trip.call(RESEARCHER, ADD_STOP, { stopId: "stop_aaaaaaaa" }, "Moab.");
    await trip.call(legScout, ADD_STOP, { stopId: "stop_bbbbbbbb" }, "Leg.");
    await trip.report(legScout, [], []);
    expect(await trip.result("leg-scout", "l1")).toBe(
      "Leg.\n\nProblems: none\nQuestions for the user: none",
    );
  });

  it("leaves out a call made by the coordinator, or by an agent type that isn't one of our workers", async () => {
    const trip = await moabTrip();
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

  it("says code failed to build the result, with the error, in place of the worker's own message", async () => {
    const trip = await moabTrip();
    await trip.call(RESEARCHER, READ_FACTS, {
      stopOrStayIds: [trip.stops.delicateArch.id],
    });
    await trip.report(RESEARCHER, [], []);
    // Naming the stop that got nothing reads the trip.
    trip.failTripReads("The database is down.");
    const logged = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    try {
      expect(await trip.result("stay-researcher", "a1")).toBe(
        "Code failed to build this worker's result, so the result isn't available. The error: The database is down.",
      );
      expect(logged).toHaveBeenCalledOnce();
    } finally {
      logged.mockRestore();
    }
  });

  it("leaves the output alone when it isn't the shape a result needs, such as one with no agentId", async () => {
    const trip = await moabTrip();
    const logged = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    try {
      const output = await trip.agentOutput("stay-researcher", {
        status: "completed",
        content: [{ type: "text", text: "All done!" }],
      });
      expect(output).toEqual({});
      expect(logged).toHaveBeenCalledOnce();
    } finally {
      logged.mockRestore();
    }
  });

  it("leaves the output alone for an agent type that isn't one of our workers", async () => {
    const trip = await moabTrip();
    expect(await trip.result("general-purpose", "a1")).toBeUndefined();
  });

  it("leaves the output alone when the worker isn't done, such as one in the background", async () => {
    const trip = await moabTrip();
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
    const trip = await moabTrip();
    const sendBack = { decision: "block", reason: SEND_BACK_TEXT };
    expect(await trip.stop("stay-researcher", "a1")).toEqual(sendBack);
    expect(await trip.stop("stay-researcher", "a1")).toEqual(sendBack);
    expect(await trip.stop("stay-researcher", "a1")).toEqual({});
    // Each worker has its own count.
    expect(await trip.stop("stay-researcher", "a2")).toEqual(sendBack);
  });

  it("lets a worker that called it stop", async () => {
    const trip = await moabTrip();
    await trip.report(RESEARCHER, [], []);
    expect(await trip.stop("stay-researcher", "a1")).toEqual({});
  });

  it("ignores agent types that aren't our workers", async () => {
    const trip = await moabTrip();
    expect(await trip.stop("general-purpose", "a1")).toEqual({});
    expect(await trip.stop("coordinator", "a1")).toEqual({});
  });
});
