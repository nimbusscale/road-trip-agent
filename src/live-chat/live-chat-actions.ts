import { setTimeout as wait } from "node:timers/promises";

import { itineraryResponseSchema } from "../shared/itinerary.schema.js";
import {
  type ChatEvent,
  type MessageRequest,
  type SessionResponse,
  sessionResponseSchema,
} from "../shared/session.schema.js";
import { shortToolName } from "../shared/tool-name.js";
import { itineraryText } from "./itinerary-print.js";
import {
  askRequest,
  cardCountText,
  cardsText,
  type OpenCard,
  openCardsOf,
  selectRequest,
} from "./option-cards.js";
import type { SiteApi } from "./site-api.js";

// What each npm run live-chat action does through the API (#251). Each prints only what
// the web page shows: the reply text, and the name of each tool the coordinator calls
// while the turn runs, as the chat's "Working" line does. Never its thinking, the tool
// inputs, or the tool replies. After each reply, it says how many option cards are open,
// as a web user sees a card appear. Each returns false when the turn didn't finish.

export type Print = (text: string) => void;

// How often opening a session asks again while a turn it didn't see the end of is
// still running, as the browser does.
const STILL_RUNNING_WAIT_MS = 5000;

// "New trip": the first message starts the trip and its first session.
export async function startTrip(
  api: SiteApi,
  print: Print,
  text: string,
): Promise<boolean> {
  return sendAndPrint(api, print, {
    path: "/api/trips",
    message: typed(text),
    tripId: null,
  });
}

// "Start a new session" on a trip, with its first message.
export async function startSession(
  api: SiteApi,
  print: Print,
  tripId: string,
  text: string,
): Promise<boolean> {
  return sendAndPrint(api, print, {
    path: `/api/trips/${encodeURIComponent(tripId)}/sessions`,
    message: typed(text),
    tripId,
  });
}

export async function sendMessage(
  api: SiteApi,
  print: Print,
  sessionId: string,
  text: string,
): Promise<boolean> {
  const { tripId } = await readSession(api, sessionId);
  return sendAndPrint(api, print, {
    path: messagesPath(sessionId),
    message: typed(text),
    tripId,
  });
}

// Opens an old session, as a user does who comes back another day. The server counts
// it as a resume (technical spec 5.2). Prints the conversation so far.
export async function openSession(
  api: SiteApi,
  print: Print,
  sessionId: string,
): Promise<boolean> {
  let session = await api.post(
    `${sessionPath(sessionId)}/resume`,
    sessionResponseSchema,
  );
  while (session.turnRunning) {
    await wait(STILL_RUNNING_WAIT_MS);
    session = await readSession(api, sessionId);
  }
  print(`Trip ${session.tripId}, session ${session.sessionId}.`);
  for (const message of session.messages) {
    print(
      message.role === "user"
        ? `\n${userLines(message.text)}`
        : `\n${message.text}`,
    );
  }
  print(`\n${cardCountText((await openCards(api, session.tripId)).length)}`);
  return true;
}

export async function printItinerary(
  api: SiteApi,
  print: Print,
  sessionId: string,
): Promise<void> {
  const { tripId } = await readSession(api, sessionId);
  const view = await api.get(
    `/api/trips/${encodeURIComponent(tripId)}/itinerary`,
    itineraryResponseSchema,
  );
  print(itineraryText(view, openCardsOf(view)));
}

export async function printCards(
  api: SiteApi,
  print: Print,
  sessionId: string,
): Promise<void> {
  const { tripId } = await readSession(api, sessionId);
  print(cardsText(await openCards(api, tripId)));
}

// Select on an option of an open card, by the numbers the cards action prints.
export async function selectOption(
  api: SiteApi,
  print: Print,
  sessionId: string,
  numbers: { card: number; option: number },
): Promise<boolean> {
  const { tripId } = await readSession(api, sessionId);
  const cards = await openCards(api, tripId);
  const message = selectRequest(cards, numbers.card, numbers.option);
  return sendClick(api, print, { sessionId, tripId, message });
}

// More options, Higher tier, or Lower tier, on an open card.
export async function askOnCard(
  api: SiteApi,
  print: Print,
  sessionId: string,
  ask: { card: number; label: string },
): Promise<boolean> {
  const { tripId } = await readSession(api, sessionId);
  const cards = await openCards(api, tripId);
  const message = askRequest(cards, ask.card, ask.label);
  return sendClick(api, print, { sessionId, tripId, message });
}

interface Send {
  path: string;
  message: MessageRequest;
  // Null for a new trip, whose ID comes in the reply's session event.
  tripId: string | null;
}

// A click shows in the chat as the user's message, so it's printed as one.
async function sendClick(
  api: SiteApi,
  print: Print,
  click: { sessionId: string; tripId: string; message: MessageRequest },
): Promise<boolean> {
  print(userLines(click.message.text));
  return sendAndPrint(api, print, {
    path: messagesPath(click.sessionId),
    message: click.message,
    tripId: click.tripId,
  });
}

// The card count comes from the itinerary after the turn, as the page reads it again
// when a turn ends.
async function sendAndPrint(
  api: SiteApi,
  print: Print,
  send: Send,
): Promise<boolean> {
  const turn = await printTurn(api.send(send.path, send.message), print);
  const tripId = send.tripId ?? turn.tripId;
  if (turn.ended && tripId !== null) {
    print(cardCountText((await openCards(api, tripId)).length));
  }
  return turn.ended && turn.failure === null;
}

interface PrintedTurn {
  // From the session event, when the message started a trip or a session.
  tripId: string | null;
  // False when the stream closed before the turn's end event.
  ended: boolean;
  failure: string | null;
}

async function printTurn(
  events: AsyncIterable<ChatEvent>,
  print: Print,
): Promise<PrintedTurn> {
  let tripId: string | null = null;
  for await (const event of events) {
    switch (event.name) {
      case "session":
        tripId = event.data.tripId;
        print(`Trip ${tripId}, session ${event.data.sessionId}.`);
        break;
      case "text":
        print(`\n${event.data.text}\n`);
        break;
      case "toolCall":
        print(`Working: ${shortToolName(event.data.name)}…`);
        break;
      case "ended":
        if (event.data.failure !== null) {
          print("The reply didn't finish. Try sending your message again.");
        }
        return { tripId, ended: true, failure: event.data.failure };
      case "traced":
        break;
    }
  }
  print(
    "The connection closed before the reply finished. Open the session again to see the rest.",
  );
  return { tripId, ended: false, failure: null };
}

async function openCards(api: SiteApi, tripId: string): Promise<OpenCard[]> {
  const view = await api.get(
    `/api/trips/${encodeURIComponent(tripId)}/itinerary`,
    itineraryResponseSchema,
  );
  return openCardsOf(view);
}

// Without marking a resume, as the browser's own reads are.
function readSession(
  api: SiteApi,
  sessionId: string,
): Promise<SessionResponse> {
  return api.get(sessionPath(sessionId), sessionResponseSchema);
}

function sessionPath(sessionId: string): string {
  return `/api/sessions/${encodeURIComponent(sessionId)}`;
}

function messagesPath(sessionId: string): string {
  return `${sessionPath(sessionId)}/messages`;
}

// A message typed by the user, which has no option card.
function typed(text: string): MessageRequest {
  return { text, optionCard: null };
}

// The user's message, set apart from the replies.
function userLines(text: string): string {
  return text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}
