import type {
  Options,
  SDKMessage,
  SDKUserMessage,
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
import { claudeAgentSdk } from "./claude-agent-sdk.js";
import { coordinatorPrompt } from "./coordinator-prompt.js";
import { sdkUserMessage } from "./sdk-user-message.schema.js";
import { type TurnEvent, turnEventsOf } from "./turn-event.js";

// The coordinator: the agent the user talks to (technical spec 1). For now it has the
// trip brief and memory tools, read_itinerary, the tools that build the skeleton,
// find_place, read_place, and compute_route.

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
  return {
    model: settings.coordinatorModel,
    systemPrompt: coordinatorPrompt(settings),
    // Adaptive is the SDK's default for the model. Asking for a summary changes only
    // what comes back, for the browser chat's raw view (technical spec 5.4).
    thinking: { type: "adaptive", display: "summarized" },
    env: processEnv,
    // No settings files, CLAUDE.md, or MCP servers but ours, and no built-in tools. Each
    // agent sees only its own tools (technical spec section 2).
    settingSources: [],
    strictMcpConfig: true,
    tools: [],
    mcpServers: {
      [TRIP_SERVER_NAME]: createTripServer({ ...trip, tripId }),
      [MEMORY_SERVER_NAME]: createMemoryServer({ ...memory, userId, tripId }),
      [PLACES_SERVER_NAME]: createPlacesServer({ ...places, tripId }),
      [ROUTING_SERVER_NAME]: createRoutingServer({ ...routing, tripId }),
    },
    // Every tool on these servers runs without asking. Anything else is refused, since
    // nobody is there to answer a permission prompt. The places server will hold tools
    // only workers get, so the coordinator's are named one by one (tool design 3).
    allowedTools: [
      `mcp__${TRIP_SERVER_NAME}`,
      `mcp__${MEMORY_SERVER_NAME}`,
      `mcp__${PLACES_SERVER_NAME}__find_place`,
      `mcp__${PLACES_SERVER_NAME}__read_place`,
      `mcp__${ROUTING_SERVER_NAME}`,
    ],
    permissionMode: "dontAsk",
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
// coordinator's reply. Tests pass a fake in its place.
export type RunTurn = (
  message: string,
  options: Options,
) => AsyncIterable<TurnEvent>;

// Runs the turn with the Agent SDK. The process ends when the turn does.
export const runTurnWithSdk: RunTurn = async function* (message, options) {
  const turnEnded = Promise.withResolvers<undefined>();
  // The message is held open until the turn ends. A prompt that ends at once could end
  // the input before the reply.
  async function* prompt(): AsyncGenerator<SDKUserMessage> {
    yield sdkUserMessage(message);
    await turnEnded.promise;
  }
  const agentSessionId = options.sessionId ?? options.resume ?? "";
  try {
    for await (const sdkMessage of claudeAgentSdk.query({
      prompt: prompt(),
      options,
    })) {
      logMirrorError(sdkMessage, agentSessionId);
      if (sdkMessage.type === "result") {
        turnEnded.resolve(undefined);
      }
      yield* turnEventsOf(sdkMessage);
    }
  } finally {
    turnEnded.resolve(undefined);
  }
};

// The SDK drops transcript lines after 3 failed tries to save them, and sends this
// (persistence design, section 6). The turn goes on, so it's only logged.
function logMirrorError(message: SDKMessage, agentSessionId: string): void {
  if (message.type === "system" && message.subtype === "mirror_error") {
    console.error(
      `Transcript lines for agent session ${agentSessionId} weren't saved: ${message.error}`,
    );
  }
}
