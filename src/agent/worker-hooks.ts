import type {
  HookCallback,
  HookCallbackMatcher,
  HookEvent,
  HookJSONOutput,
  HookInput,
} from "@anthropic-ai/claude-agent-sdk";

import { calendarAndServicesFor } from "../domain/trip-services.js";
import type { Positions } from "../tools/spot-names.js";
import type { TripSession } from "../tools/trip-session.js";
import { RECORDED_TOOLS, WorkerCalls } from "./worker-calls.js";
import {
  agentInputSchema,
  agentStatusSchema,
  completedAgentOutputSchema,
} from "./worker-hook-input.schema.js";
import { legScoutWebSearchHook } from "./web-search-hook.js";
import { buildFailedText, workerResultText } from "./worker-result.js";
import { isWorkerType } from "./worker-types.js";

// The hooks that build the result the coordinator sees from a worker (technical spec
// 6.5). Made with each turn's options, so what they record lasts one turn.

// Without a limit, a worker that can't call report_result is sent back again and again.
export const MAX_SEND_BACKS = 2;

export const SEND_BACK_TEXT =
  "You haven't called report_result. Call it now, with any problems and questions, to end your work.";

// What the result needs to name a stop or stay: the turn's trip.
export type WorkerHooksGiven = Pick<
  TripSession,
  "tripId" | "reader" | "settings" | "now"
>;

export type WorkerHooks = Partial<Record<HookEvent, HookCallbackMatcher[]>>;

// The SDK's names for the hook events, which aren't camelCase.
const POST_TOOL_USE = "PostToolUse" satisfies HookEvent;
const SUBAGENT_STOP = "SubagentStop" satisfies HookEvent;
const PRE_TOOL_USE = "PreToolUse" satisfies HookEvent;

export function workerHooks(given: WorkerHooksGiven): WorkerHooks {
  const calls = new WorkerCalls();
  const sendBacks = new Map<string, number>();
  return {
    [POST_TOOL_USE]: [
      // A matcher lists tool names with "|" between them.
      {
        matcher: RECORDED_TOOLS.join("|"),
        hooks: [logged("recording a call", recordCall(calls))],
      },
      {
        matcher: "Agent",
        hooks: [logged("building the result", replaceResult(calls, given))],
      },
    ],
    [SUBAGENT_STOP]: [
      { hooks: [logged("sending back a worker", sendBack(calls, sendBacks))] },
    ],
    // Not logged(), since a hook that fails would let the search through. It never
    // throws: an input it can't read is refused.
    [PRE_TOOL_USE]: [{ matcher: "WebSearch", hooks: [legScoutWebSearchHook] }],
  };
}

// Records each call by one of our workers, under its agent_id. A call by the
// coordinator, on the main thread, has no agent_id.
function recordCall(calls: WorkerCalls): HookCallback {
  return (input) => {
    if (
      input.hook_event_name === "PostToolUse" &&
      input.agent_id !== undefined &&
      isWorkerType(input.agent_type)
    ) {
      calls.record(
        input.agent_id,
        input.tool_name,
        input.tool_input,
        input.tool_response,
      );
    }
    return Promise.resolve({});
  };
}

// Replaces one of our workers' last message with the result code builds, once the
// worker is done.
function replaceResult(
  calls: WorkerCalls,
  given: WorkerHooksGiven,
): HookCallback {
  return async (input) => {
    if (input.hook_event_name !== "PostToolUse") {
      return {};
    }
    const agentType = agentInputSchema.parse(input.tool_input);
    if (
      !isWorkerType(agentType) ||
      agentStatusSchema.parse(input.tool_response) !== "completed"
    ) {
      return {};
    }
    const output = completedAgentOutputSchema.parse(input.tool_response);
    const text = await resultOrFailure(input, () =>
      workerResultText(calls.of(output.agentId), agentType, () =>
        positionsOf(given),
      ),
    );
    return {
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        updatedToolOutput: { ...output, content: [{ type: "text", text }] },
      },
    };
  };
}

// A build that fails still replaces the worker's last message, so the worker's own text
// never reaches the coordinator, and the coordinator can tell the user what failed.
async function resultOrFailure(
  input: HookInput,
  build: () => Promise<string>,
): Promise<string> {
  try {
    return await build();
  } catch (error) {
    logFailure("building the result", input, error);
    return buildFailedText(error);
  }
}

async function positionsOf(given: WorkerHooksGiven): Promise<Positions> {
  const trip = await given.reader.read(given.tripId);
  const { calendar } = calendarAndServicesFor(trip, given.settings, given.now);
  return { itinerary: trip.itinerary, calendar };
}

// Sends back one of our workers that tries to finish without calling report_result, at
// most MAX_SEND_BACKS times.
function sendBack(
  calls: WorkerCalls,
  sendBacks: Map<string, number>,
): HookCallback {
  return (input) => {
    if (
      input.hook_event_name !== "SubagentStop" ||
      !isWorkerType(input.agent_type) ||
      calls.hasReported(input.agent_id)
    ) {
      return Promise.resolve({});
    }
    const sentBack = sendBacks.get(input.agent_id) ?? 0;
    if (sentBack >= MAX_SEND_BACKS) {
      return Promise.resolve({});
    }
    sendBacks.set(input.agent_id, sentBack + 1);
    return Promise.resolve({ decision: "block", reason: SEND_BACK_TEXT });
  };
}

// A hook that fails is logged, and changes nothing. A failed build is caught before
// this, in resultOrFailure(). What gets here is a hook input that isn't the shape the
// hook needs, such as an Agent output with no agentId.
function logged(doing: string, hook: HookCallback): HookCallback {
  return async (input, toolUseId, options): Promise<HookJSONOutput> => {
    try {
      return await hook(input, toolUseId, options);
    } catch (error) {
      logFailure(doing, input, error);
      return {};
    }
  };
}

function logFailure(doing: string, input: HookInput, error: unknown): void {
  console.error(
    `The worker hook failed while ${doing} (${describe(input)}):`,
    error,
  );
}

function describe(input: HookInput): string {
  return input.hook_event_name === "PostToolUse"
    ? `${input.tool_name}, tool use ${input.tool_use_id}`
    : input.hook_event_name;
}
