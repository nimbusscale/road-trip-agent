import { randomUUID } from "node:crypto";

import {
  type EffortLevel,
  type Options,
  query,
  type SDKMessage,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";

import type { Settings } from "../config/settings.schema.js";
import { inTimeZone } from "./claude-env.js";
import { agentsFor, type CoordinatorGiven, serversFor } from "./coordinator.js";
import { coordinatorPrompt } from "./coordinator-prompt.js";
import { sdkUserMessage } from "./sdk-user-message.schema.js";
import { TurnTrace } from "./turn-trace.js";
import { WORKER_TYPE, type WorkerType } from "./worker-types.js";

// One worker run on its own, at the top of the query, for an agent evaluation (#266).
// The test stands in for the coordinator: it sends the worker brief the coordinator
// sent, and nothing reads the worker's result. The worker hooks are left out, since
// they only build that result (technical spec 6.5).

// The built-in tools a worker can be sent. A worker can't start another one.
const WORKER_BUILT_IN_TOOLS = ["WebSearch", "WebFetch"] as const;

export interface SoloWorker {
  workerType: WorkerType;
  tripId: string;
  // The user the worker's memory tools would act for. No worker has them today.
  userId: string;
  // The time zone of the trip's start place, from tripTimeZone(), as for the
  // coordinator's turn.
  timeZone: string;
}

// The worker's own definition, from the same settings the coordinator's session gives
// it, run as the query's named agent, as the coordinator runs as its own. The SDK
// applies the definition's prompt, tools, and model to the main thread. Its transcript
// isn't kept, since nothing resumes it.
export function soloWorkerOptions(
  given: CoordinatorGiven,
  worker: SoloWorker,
): Options {
  const { settings, processEnv } = given;
  const definition = agentsFor(coordinatorPrompt(settings), settings)[
    worker.workerType
  ];
  if (definition === undefined) {
    throw new Error(`There's no definition for ${worker.workerType}.`);
  }
  const servers = serversFor(given, worker);
  return {
    // The same model and effort as the worker's definition, as for the coordinator.
    ...modelOf(settings, worker.workerType),
    systemPrompt: definition.prompt,
    agent: worker.workerType,
    agents: { [worker.workerType]: definition },
    thinking: { type: "adaptive", display: "summarized" },
    includePartialMessages: true,
    env: inTimeZone(processEnv, worker.timeZone),
    settingSources: [],
    strictMcpConfig: true,
    tools: [...WORKER_BUILT_IN_TOOLS],
    mcpServers: servers,
    allowedTools: [
      ...WORKER_BUILT_IN_TOOLS,
      ...Object.keys(servers).map((name) => `mcp__${name}`),
    ],
    permissionMode: "dontAsk",
    persistSession: false,
    sessionId: randomUUID(),
  };
}

function modelOf(
  settings: Settings,
  workerType: WorkerType,
): { model: string; effort: EffortLevel } {
  switch (workerType) {
    case WORKER_TYPE.stayResearcher:
      return {
        model: settings.stayResearcherModel,
        effort: settings.stayResearcherEffort,
      };
    case WORKER_TYPE.legScout:
      return { model: settings.legScoutModel, effort: settings.legScoutEffort };
    case WORKER_TYPE.weatherWorker:
      return {
        model: settings.weatherWorkerModel,
        effort: settings.weatherWorkerEffort,
      };
  }
}

export interface SoloWorkerTraced {
  workerType: WorkerType;
  userId: string;
  // The commit of the code that ran, from appCommit().
  commit: string;
}

// Runs the worker on its worker brief, and hands each of the SDK's messages to the
// caller. Its trace is a turn span named for the worker, such as stay-researcher.turn,
// with its model calls and tool calls under it. Returns the span's ID.
export async function runSoloWorker(
  workerBrief: string,
  options: Options,
  traced: SoloWorkerTraced,
  onMessage: (message: SDKMessage) => void,
): Promise<string> {
  const ended = Promise.withResolvers<undefined>();
  // The brief is held open until the run ends, as a coordinator turn's message is.
  async function* prompt(): AsyncGenerator<SDKUserMessage> {
    yield sdkUserMessage(workerBrief);
    await ended.promise;
  }
  const turnTrace = new TurnTrace({
    agentName: traced.workerType,
    message: workerBrief,
    agentSessionId: options.sessionId ?? "",
    userId: traced.userId,
    commit: traced.commit,
    readWorkerTranscript: () =>
      Promise.reject(new Error("A worker run on its own starts no workers.")),
  });
  try {
    for await (const message of query({ prompt: prompt(), options })) {
      turnTrace.record(message);
      if (message.type === "result") {
        ended.resolve(undefined);
      }
      onMessage(message);
    }
  } catch (error) {
    turnTrace.recordThrown(error);
    throw error;
  } finally {
    ended.resolve(undefined);
    await turnTrace.end();
  }
  return turnTrace.spanId;
}
