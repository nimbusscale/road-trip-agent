import {
  type AgentDefinition,
  getSubagentMessages,
  type McpServerConfig,
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
  createWeatherServer,
  WEATHER_SERVER_NAME,
} from "../tools/weather-server.js";
import type { WeatherSession } from "../tools/weather-session.js";
import {
  createWorkerServer,
  WORKER_SERVER_NAME,
} from "../tools/worker-server.js";
import {
  COORDINATOR_AGENT_TYPE,
  coordinatorDefinition,
} from "./coordinator-definition.js";
import { inTimeZone } from "./claude-env.js";
import { coordinatorPrompt } from "./coordinator-prompt.js";
import { legScoutDefinition } from "./leg-scout-definition.js";
import { sdkUserMessage } from "./sdk-user-message.schema.js";
import { stayResearcherDefinition } from "./stay-researcher-definition.js";
import { type TurnEvent, turnEventsOf } from "./turn-event.js";
import { TurnTrace } from "./turn-trace.js";
import { workerHooks } from "./worker-hooks.js";
import type { ReadWorkerTranscript } from "./worker-trace.js";
import { weatherWorkerDefinition } from "./weather-worker-definition.js";
import { WORKER_TYPE } from "./worker-types.js";

// The coordinator: the agent the user talks to (technical spec 1). For now it has the
// trip brief and memory tools, read_itinerary, the tools that build the skeleton,
// find_place, read_place, compute_route, and Agent, to start the stay researcher, the
// leg scout, and the weather worker. The session holds the workers' tools too, the hooks
// that build a worker's result, and the hook that limits the leg scout's web search
// (technical spec 6.5).

export interface CoordinatorGiven {
  settings: Settings;
  // The environment for the Claude Code process, from claudeProcessEnv().
  processEnv: Record<string, string | undefined>;
  trip: Omit<TripSession, "tripId">;
  memory: Omit<MemorySession, "userId" | "tripId">;
  places: Omit<PlacesSession, "tripId">;
  routing: Omit<RoutingSession, "tripId">;
  weather: Omit<WeatherSession, "tripId">;
  transcripts: TranscriptAdapter;
}

// The session's only built-in tools (tool design, section 1).
const BUILT_IN_TOOLS = ["Agent", "WebSearch", "WebFetch"] as const;

// One conversation: a session, and the user it's for.
export interface Conversation {
  session: Session;
  userId: string;
}

// What a turn's options depend on besides the session.
export interface TurnStart {
  // Whether the session has had a turn before. Each turn starts its own Claude Code
  // process, which ends with the turn (systems design section 2). So every turn after
  // the first resumes the conversation from the stored transcript.
  hasTranscript: boolean;
  // The time zone of the app's date line, from tripTimeZone().
  timeZone: string;
}

export function coordinatorOptions(
  given: CoordinatorGiven,
  conversation: Conversation,
  turn: TurnStart,
): Options {
  const { settings, processEnv, trip, transcripts } = given;
  const { session } = conversation;
  const { hasTranscript, timeZone } = turn;
  const tripId = session.tripId;
  const prompt = coordinatorPrompt(settings);
  const servers = serversFor(given, conversation);
  return {
    // The same model and effort as the coordinator's definition (technical spec 6.5).
    model: settings.coordinatorModel,
    effort: settings.coordinatorEffort,
    systemPrompt: prompt,
    // The coordinator runs as a named agent, so its definition's tools are what it's
    // sent. The servers below can hold tools that only workers get (technical spec 6.5).
    agent: COORDINATOR_AGENT_TYPE,
    agents: agentsFor(prompt, settings),
    // Adaptive is the SDK's default for the model. Asking for a summary changes only
    // what comes back, so the turn's trace shows the summaries (technical spec 5.4).
    thinking: { type: "adaptive", display: "summarized" },
    // The stream events give each model call's start and its final tokens, for the
    // turn's trace (systems design section 10). turnEventsOf() leaves them out.
    includePartialMessages: true,
    env: inTimeZone(processEnv, timeZone),
    // No settings files, CLAUDE.md, or MCP servers but ours. These are the tools that
    // exist in the session: the built-in Agent, to start workers, the web tools, which
    // only workers are sent, and our servers. Each agent's definition picks the ones it's
    // sent (technical spec 6.5).
    settingSources: [],
    strictMcpConfig: true,
    tools: [...BUILT_IN_TOOLS],
    mcpServers: servers,
    // These tools run without asking. Anything else is refused, since nobody is there to
    // answer a permission prompt. The list covers every agent in the session, so it
    // can't refuse a tool to one agent and allow it to another. Only the definitions do
    // that. Every tool in the session is some agent's, so the list names each whole
    // server, and the built-in tools by name (technical spec 6.5).
    allowedTools: [
      ...BUILT_IN_TOOLS,
      ...Object.keys(servers).map((name) => `mcp__${name}`),
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

// Our servers, made for this turn with its trip. Every server is in the session, and each
// agent's definition picks the tools it's sent (technical spec 6.5).
function serversFor(
  given: CoordinatorGiven,
  conversation: Conversation,
): Record<string, McpServerConfig> {
  const { trip, memory, places, routing, weather } = given;
  const { userId } = conversation;
  const tripId = conversation.session.tripId;
  return {
    [TRIP_SERVER_NAME]: createTripServer({ ...trip, tripId }),
    [MEMORY_SERVER_NAME]: createMemoryServer({ ...memory, userId, tripId }),
    [PLACES_SERVER_NAME]: createPlacesServer({ ...places, tripId }),
    [ROUTING_SERVER_NAME]: createRoutingServer({ ...routing, tripId }),
    [WEATHER_SERVER_NAME]: createWeatherServer({ ...weather, tripId }),
    [WORKER_SERVER_NAME]: createWorkerServer(),
  };
}

// The coordinator's definition, and each worker's, each with its own model and effort
// settings. The coordinator's are the same as the query's (technical spec 6.5).
function agentsFor(
  prompt: string,
  settings: Settings,
): Record<string, AgentDefinition> {
  return {
    [COORDINATOR_AGENT_TYPE]: coordinatorDefinition({
      prompt,
      model: settings.coordinatorModel,
      effort: settings.coordinatorEffort,
    }),
    [WORKER_TYPE.stayResearcher]: stayResearcherDefinition({
      model: settings.stayResearcherModel,
      effort: settings.stayResearcherEffort,
    }),
    [WORKER_TYPE.legScout]: legScoutDefinition({
      model: settings.legScoutModel,
      effort: settings.legScoutEffort,
    }),
    [WORKER_TYPE.weatherWorker]: weatherWorkerDefinition({
      model: settings.weatherWorkerModel,
      effort: settings.weatherWorkerEffort,
    }),
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

// Runs each turn with the Agent SDK. The process ends when the turn does. The commit,
// from appCommit(), goes on each turn's trace.
export function sdkTurnRunner(commit: string): RunTurn {
  return (message, options, userId) =>
    runTurnWithSdk(message, options, { userId, commit });
}

async function* runTurnWithSdk(
  message: string,
  options: Options,
  traced: { userId: string; commit: string },
): AsyncGenerator<TurnEvent> {
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
    ...traced,
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
}

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
