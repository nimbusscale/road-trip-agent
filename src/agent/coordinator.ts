import {
  type Options,
  query,
  type SDKMessage,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";

import type { Settings } from "../config/settings.schema.js";
import { tripToday } from "../domain/today.js";
import type { Session } from "../persistence/session.js";
import type { TripReader } from "../persistence/trip-reader.js";
import type { TranscriptAdapter } from "../persistence/transcript-adapter.js";
import type { MemorySession } from "../tools/memory-session.js";
import {
  createMemoryServer,
  MEMORY_SERVER_NAME,
} from "../tools/memory-server.js";
import type { TripSession } from "../tools/trip-session.js";
import { createTripServer, TRIP_SERVER_NAME } from "../tools/trip-server.js";
import { AppLines } from "./app-lines.js";
import { coordinatorPrompt } from "./coordinator-prompt.js";
import { sdkUserMessage } from "./sdk-user-message.schema.js";

// The coordinator: the agent the user talks to (technical spec 1). For now it has only
// the trip brief and memory tools.

export interface CoordinatorGiven {
  settings: Settings;
  // The environment for the Claude Code process, from claudeProcessEnv().
  processEnv: Record<string, string | undefined>;
  trip: Omit<TripSession, "tripId">;
  memory: Omit<MemorySession, "userId" | "tripId">;
  transcripts: TranscriptAdapter;
}

// One conversation: a new session, or one being resumed.
export interface Conversation {
  session: Session;
  userId: string;
  resumed: boolean;
}

export function coordinatorOptions(
  given: CoordinatorGiven,
  conversation: Conversation,
): Options {
  const { settings, processEnv, trip, memory, transcripts } = given;
  const { session, userId, resumed } = conversation;
  const tripId = session.tripId;
  return {
    model: settings.coordinatorModel,
    systemPrompt: coordinatorPrompt(settings),
    env: processEnv,
    // No settings files, CLAUDE.md, or MCP servers but ours, and no built-in tools. Each
    // agent sees only its own tools (technical spec section 2).
    settingSources: [],
    strictMcpConfig: true,
    tools: [],
    mcpServers: {
      [TRIP_SERVER_NAME]: createTripServer({ ...trip, tripId }),
      [MEMORY_SERVER_NAME]: createMemoryServer({ ...memory, userId, tripId }),
    },
    // Every tool on both servers runs without asking. Anything else is refused, since
    // nobody is there to answer a permission prompt.
    allowedTools: [`mcp__${TRIP_SERVER_NAME}`, `mcp__${MEMORY_SERVER_NAME}`],
    permissionMode: "dontAsk",
    // The transcript goes to Postgres line by line as it's written (persistence design,
    // section 6).
    sessionStore: transcripts,
    sessionStoreFlush: "eager",
    ...(resumed
      ? { resume: session.agentSessionId }
      : { sessionId: session.agentSessionId }),
  };
}

export interface ConverseGiven {
  options: Options;
  conversation: Conversation;
  // The user's messages, in order. The next one is read only once the last turn ends.
  userTexts: AsyncIterable<string>;
  // For the trip's start place, which gives today's date. It's read before each
  // message, since a tool may have changed it.
  tripReader: TripReader;
  now: () => Date;
}

// Runs the conversation, and hands back every message the SDK sends. Each user message
// waits for the turn before it to end, so the app's lines go on the message they're
// worked out for.
export async function* converse(
  given: ConverseGiven,
): AsyncGenerator<SDKMessage> {
  const { options, conversation, userTexts, tripReader, now } = given;
  const appLines = new AppLines(conversation.resumed);
  let turnEnded = Promise.withResolvers<undefined>();

  async function* userMessages(): AsyncGenerator<SDKUserMessage> {
    for await (const text of userTexts) {
      // The app also checks here that the trip hasn't started, and closes the chat once
      // it has (technical spec 5.2). #52 adds that check, with the browser chat.
      const trip = await tripReader.read(conversation.session.tripId);
      const today = tripToday(trip.itinerary.startPlace, now());
      turnEnded = Promise.withResolvers<undefined>();
      yield sdkUserMessage(appLines.addTo(text, today));
      await turnEnded.promise;
    }
  }

  for await (const message of query({
    prompt: userMessages(),
    options,
  })) {
    logMirrorError(message, conversation.session.id);
    if (message.type === "result") {
      turnEnded.resolve(undefined);
    }
    yield message;
  }
}

// The SDK drops transcript lines after 3 failed tries to save them, and sends this
// (persistence design, section 6). The turn goes on, so it's only logged.
function logMirrorError(message: SDKMessage, sessionId: string): void {
  if (message.type === "system" && message.subtype === "mirror_error") {
    console.error(
      `Transcript lines for session ${sessionId} weren't saved: ${message.error}`,
    );
  }
}
