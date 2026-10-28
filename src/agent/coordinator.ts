import {
  getSubagentMessages,
  type Options,
  query,
  type SDKMessage,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";

import type { Settings } from "../config/settings.schema.js";
import type { Session } from "../persistence/session.js";
import type { TranscriptAdapter } from "../persistence/transcript-adapter.js";
import type { MemorySession } from "../tools/memory-session.js";
import {
  createMemoryServer,
  MEMORY_SERVER_NAME,
} from "../tools/memory-server.js";
import {
  createPlacesServer,
  PLACES_SERVER_NAME,
} from "../tools/places-server.js";
import type { PlacesSession } from "../tools/places-session.js";
import {
  createRoutingServer,
  ROUTING_SERVER_NAME,
} from "../tools/routing-server.js";
import type { RoutingSession } from "../tools/routing-session.js";
import type { TripSession } from "../tools/trip-session.js";
import { createTripServer, TRIP_SERVER_NAME } from "../tools/trip-server.js";
import {
  createWorkerServer,
  WORKER_SERVER_NAME,
} from "../tools/worker-server.js";
import {
  COORDINATOR_AGENT_TYPE,
  coordinatorDefinition,
} from "./coordinator-definition.js";
import { coordinatorPrompt } from "./coordinator-prompt.js";
import { sdkUserMessage } from "./sdk-user-message.schema.js";
import { type TurnEvent, turnEventsOf } from "./turn-event.js";
import { TurnTrace } from "./turn-trace.js";
import { workerHooks } from "./worker-hooks.js";
import type { ReadWorkerTranscript } from "./worker-trace.js";

// The coordinator: the agent the user talks to (technical spec 1). For now it has the
// trip brief and memory tools, read_itinerary, the tools that build the skeleton,
// find_place, read_place, and compute_route. The session holds the workers' tools too,
// and the hooks that build a worker's result (technical spec 6.5).

export interface CoordinatorGiven {
  settings: Settings;
  // The environment for the Claude Code process, from claudeProcessEnv().
  processEnv: Record<string, string | undefined>;
  trip: Omit<TripSession, "tripId">;
  memory: Omit<MemorySession, "userId" | "tripId">;
  places: Omit<PlacesSession, "tripId">;
  routing: Omit<RoutingSession, "tripId">;
  transcripts: TranscriptAdapter;
}

// The session's only built-in tools (tool design, section 1).
const BUILT_IN_TOOLS = ["Agent", "WebSearch", "WebFetch"] as const;

// One conversation: a session, and the user it's for.
export interface Conversation {
  session: Session;
  userId: string;
}

// `hasTranscript` says whether the session has had a turn before. Each turn starts its
// own Claude Code process, which ends with the turn (systems design section 2). So
// every turn after the first resumes the conversation from the stored transcript.
export function coordinatorOptions(
  given: CoordinatorGiven,
  conversation: Conversation,
  hasTranscript: boolean,
): Options {
  const { settings, processEnv, trip, memory, places, routing, transcripts } =
    given;
  const { session, userId } = conversation;
  const tripId = session.tripId;
  const prompt = coordinatorPrompt(settings);
  const model = settings.coordinatorModel;
  return {
    model,
    systemPrompt: prompt,
    // The coordinator runs as a named agent, so its definition's tools are what it's
    // sent. The servers below can hold tools that only workers get (technical spec 6.5).
    agent: COORDINATOR_AGENT_TYPE,
    agents: {
      [COORDINATOR_AGENT_TYPE]: coordinatorDefinition({ prompt, model }),
    },
    // Adaptive is the SDK's default for the model. Asking for a summary changes only
    // what comes back, so the turn's trace shows the summaries (technical spec 5.4).
    thinking: { type: "adaptive", display: "summarized" },
    // The stream events give each model call's start and its final tokens, for the
    // turn's trace (systems design section 10). turnEventsOf() leaves them out.
    includePartialMessages: true,
    env: processEnv,
    // No settings files, CLAUDE.md, or MCP servers but ours. These are the tools that
    // exist in the session: the built-in Agent, to start workers, the web tools, which
    // only workers are sent, and our servers. Each agent's definition picks the ones it's
    // sent (technical spec 6.5).
    settingSources: [],
    strictMcpConfig: true,
    tools: [...BUILT_IN_TOOLS],
    mcpServers: {
      [TRIP_SERVER_NAME]: createTripServer({ ...trip, tripId }),
      [MEMORY_SERVER_NAME]: createMemoryServer({ ...memory, userId, tripId }),
      [PLACES_SERVER_NAME]: createPlacesServer({ ...places, tripId }),
      [ROUTING_SERVER_NAME]: createRoutingServer({ ...routing, tripId }),
      [WORKER_SERVER_NAME]: createWorkerServer(),
    },
    // These tools run without asking. Anything else is refused, since nobody is there to
    // answer a permission prompt. The list covers every agent in the session, so it
    // can't refuse a tool to one agent and allow it to another. Only the definitions do
    // that. Every tool in the session is some agent's, so the list names each whole
    // server, and the built-in tools by name (technical spec 6.5).
    allowedTools: [
      ...BUILT_IN_TOOLS,
      `mcp__${TRIP_SERVER_NAME}`,
      `mcp__${MEMORY_SERVER_NAME}`,
      `mcp__${PLACES_SERVER_NAME}`,
      `mcp__${ROUTING_SERVER_NAME}`,
      `mcp__${WORKER_SERVER_NAME}`,
    ],
    permissionMode: "dontAsk",
    hooks: workerHooks({ ...trip, tripId }),
    // The transcript goes to Postgres line by line as it's written (persistence design,
    // section 6).
    sessionStore: transcripts,
    sessionStoreFlush: "eager",
    ...(hasTranscript
      ? { resume: session.agentSessionId }
      : { sessionId: session.agentSessionId }),
  };
}

// Runs one turn: the user's message, with the app's lines already added, and the
// coordinator's reply. The user's ID goes on the turn's trace. Tests pass a fake in its
// place.
export type RunTurn = (
  message: string,
  options: Options,
  userId: string,
) => AsyncIterable<TurnEvent>;

// Runs the turn with the Agent SDK. The process ends when the turn does.
export const runTurnWithSdk: RunTurn = async function* (
  message,
  options,
  userId,
) {
  const turnEnded = Promise.withResolvers<undefined>();
  // The message is held open until the turn ends. A prompt that ends at once could end
  // the input before the reply.
  async function* prompt(): AsyncGenerator<SDKUserMessage> {
    yield sdkUserMessage(message);
    await turnEnded.promise;
  }
  const agentSessionId = options.sessionId ?? options.resume ?? "";
  const turnTrace = new TurnTrace({
    message,
    agentSessionId,
    userId,
    readWorkerTranscript: workerTranscriptReader(options),
  });
  try {
    yield { kind: "traced", spanId: turnTrace.spanId };
    for await (const sdkMessage of query({ prompt: prompt(), options })) {
      logMirrorError(sdkMessage, agentSessionId);
      turnTrace.record(sdkMessage);
      if (sdkMessage.type === "result") {
        turnEnded.resolve(undefined);
      }
      yield* turnEventsOf(sdkMessage);
    }
  } catch (error) {
    // The caller still ends the turn with the error (coordinator-turns.ts).
    turnTrace.recordThrown(error);
    throw error;
  } finally {
    turnEnded.resolve(undefined);
    await turnTrace.end();
  }
};

// A worker's transcript is in the same session store as the coordinator's.
function workerTranscriptReader(options: Options): ReadWorkerTranscript {
  const { sessionStore } = options;
  return (agentSessionId, agentId) =>
    sessionStore === undefined
      ? Promise.reject(new Error("The turn has no session store."))
      : getSubagentMessages(agentSessionId, agentId, { sessionStore });
}

// The SDK drops transcript lines after 3 failed tries to save them, and sends this
// (persistence design, section 6). The turn goes on, so it's only logged.
function logMirrorError(message: SDKMessage, agentSessionId: string): void {
  if (message.type === "system" && message.subtype === "mirror_error") {
    console.error(
      `Transcript lines for agent session ${agentSessionId} weren't saved: ${message.error}`,
    );
  }
}
