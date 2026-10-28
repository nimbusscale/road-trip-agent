import type { Options } from "@anthropic-ai/claude-agent-sdk";

import type { CalendarDate } from "../domain/calendar-date.js";
import type { Trip } from "../domain/trip.js";
import { startedToday, tripTimeZone, tripToday } from "../domain/today.js";
import { AppLines } from "./app-lines.js";
import {
  type Conversation,
  type CoordinatorGiven,
  coordinatorOptions,
  type RunTurn,
} from "./coordinator.js";
import { Turn } from "./turn.js";

export interface CoordinatorTurnsGiven {
  coordinator: CoordinatorGiven;
  runTurn: RunTurn;
  now: () => Date;
}

// The chat closes on the trip's start date (functional spec 2). Written for the user.
export class ChatClosedError extends Error {
  override name = "ChatClosedError";

  constructor(today: CalendarDate) {
    super(
      `The trip has started, so its chat is closed. Today is ${today.longText} at its start place.`,
    );
  }
}

// From the trip's start date on, no session can be started or resumed, and no message
// is taken (functional spec 2).
export function refuseIfChatClosed(trip: Trip, now: Date): void {
  const { startDate, startPlace } = trip.itinerary;
  const startedOn = startedToday(startDate, startPlace, now);
  if (startedOn !== null) {
    throw new ChatClosedError(startedOn);
  }
}

// Sessions take one message at a time. Written for the user.
export class TurnRunningError extends Error {
  override name = "TurnRunningError";

  constructor() {
    super("The reply to your last message isn't finished yet.");
  }
}

// Runs the coordinator's turns, for the browser chat and the terminal chat. Each turn
// starts its own Claude Code process, which ends with the turn (systems design section
// 2). So between turns nothing runs, and a restart loses nothing a resume can't restore.
//
// It keeps two things per session in memory: the turn running now, and the app's lines
// (technical spec 5.2). A restart loses the app's lines, so the next message gets the
// date and the resumed line again, as after a resume.
export class CoordinatorTurns {
  readonly #running = new Map<string, Turn>();
  readonly #appLines = new Map<string, AppLines>();

  constructor(private readonly given: CoordinatorTurnsGiven) {}

  // The user opened the session again, such as after a reload. The next message says
  // it was resumed.
  markResumed(sessionId: string): void {
    this.#appLines.set(sessionId, new AppLines(true));
  }

  // The user forgot memory items in the chat view, so the next message tells the
  // coordinator to read memory again. A session with no lines kept here gets the resumed
  // line on its next message, which says that already.
  markMemoryForgotten(sessionId: string): void {
    this.#appLines.get(sessionId)?.markMemoryForgotten();
  }

  isRunning(sessionId: string): boolean {
    return this.#running.has(sessionId);
  }

  // Starts a turn with the user's message, and returns it once it's running. Refuses a
  // message while the session's last turn is still running, and once the trip has
  // started. The trip is read before each message, since a tool may have changed its
  // start date or start place.
  async begin(conversation: Conversation, text: string): Promise<Turn> {
    const sessionId = conversation.session.id;
    if (this.#running.has(sessionId)) {
      throw new TurnRunningError();
    }
    // Held before the first await, so a second message sent at once is refused.
    const turn = new Turn();
    this.#running.set(sessionId, turn);
    let started: { message: string; options: Options };
    try {
      started = await this.#prepare(conversation, text);
    } catch (error) {
      this.#running.delete(sessionId);
      throw error;
    }
    void this.#run(turn, conversation, started);
    return turn;
  }

  async #prepare(
    conversation: Conversation,
    text: string,
  ): Promise<{ message: string; options: Options }> {
    const { coordinator, now } = this.given;
    const { session } = conversation;
    const trip = await coordinator.trip.reader.read(session.tripId);
    const moment = now();
    refuseIfChatClosed(trip, moment);
    const hasTranscript =
      (await coordinator.transcripts.load({
        projectKey: "",
        sessionId: session.agentSessionId,
      })) !== null;
    // A session with a transcript and no lines kept here was last open before a
    // restart, so it counts as resumed.
    const appLines =
      this.#appLines.get(session.id) ?? new AppLines(hasTranscript);
    this.#appLines.set(session.id, appLines);
    const { startPlace } = trip.itinerary;
    return {
      message: appLines.addTo(text, tripToday(startPlace, moment)),
      options: coordinatorOptions(coordinator, conversation, {
        hasTranscript,
        timeZone: tripTimeZone(startPlace),
      }),
    };
  }

  // Never throws: a failed turn ends with a failed "ended" event, and is logged.
  async #run(
    turn: Turn,
    conversation: Conversation,
    started: { message: string; options: Options },
  ): Promise<void> {
    const sessionId = conversation.session.id;
    const { message, options } = started;
    try {
      for await (const event of this.given.runTurn(
        message,
        options,
        conversation.userId,
      )) {
        if (event.kind === "ended" && event.failure !== null) {
          console.error(
            `The turn in session ${sessionId} failed: ${event.failure}`,
          );
        }
        turn.add(event);
      }
    } catch (error) {
      console.error(`The turn in session ${sessionId} failed:`, error);
      turn.add({
        kind: "ended",
        failure: String(error),
        durationMs: 0,
        usage: null,
      });
    } finally {
      this.#running.delete(sessionId);
      turn.end();
    }
  }
}
