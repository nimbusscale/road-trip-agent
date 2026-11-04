import type { ZodType } from "zod";
import { describe, expect, it } from "vitest";

import type {
  ItineraryResponse,
  ShownOption,
  ShownPlace,
} from "../shared/itinerary.schema.js";
import type {
  ChatEvent,
  MessageRequest,
  SessionResponse,
} from "../shared/session.schema.js";
import { askOnCard, selectOption, sendMessage } from "./live-chat-actions.js";
import { LiveChatError, type SiteApi } from "./site-api.js";

function place(id: string, name: string): ShownPlace {
  return {
    id,
    name,
    address: `${name}, UT`,
    latitude: 38.5,
    longitude: -109.5,
  };
}

function option(id: string, name: string): ShownOption {
  return {
    place: place(id, name),
    type: "Hotel",
    location: "Moab",
    rating: "4.5 stars, 1,000 reviews",
    tier: "Mid-range",
    namedByUser: false,
    rationale: `Why ${name}.`,
    notes: null,
    sourceLink: "https://maps.google.com/?cid=1",
    visitTime: null,
    detourTime: null,
  };
}

const MOAB = place("place_moab", "Moab");

// A lodging card that's already at the top tier, then a dinner card on Day 1.
const VIEW: ItineraryResponse = {
  summary: {
    name: "Moab",
    startDate: null,
    endDate: null,
    startPlace: null,
    endPlace: null,
    totalDriveTime: "0 m",
    dayCount: 1,
    stayCount: 1,
  },
  stays: [
    {
      id: "stay_moab",
      number: 1,
      place: MOAB,
      nightCount: 1,
      arriveDate: null,
      leaveDate: null,
      lodging: {
        status: "proposed",
        candidateCount: 2,
        selection: null,
        card: {
          options: [option("place_gonzo", "Gonzo Inn")],
          higherTier: false,
          lowerTier: true,
        },
      },
      weather: null,
    },
  ],
  days: [
    {
      id: "day_1",
      number: 1,
      date: null,
      location: "Moab",
      startTime: "8:00 a.m.",
      isRestDay: false,
      isLastDay: true,
      leg: null,
      arrival: null,
      schedule: [
        {
          kind: "stop",
          startTime: null,
          endTime: null,
          duration: null,
          stop: {
            id: "stop_dinner",
            number: 1,
            kind: "meal",
            purpose: "dinner",
            setTime: null,
            checkInPlace: null,
            choice: {
              status: "proposed",
              candidateCount: 2,
              selection: null,
              card: {
                options: [
                  option("place_desert_bistro", "Desert Bistro"),
                  option("place_quesadilla", "Quesadilla Mobilla"),
                ],
                higherTier: true,
                lowerTier: true,
              },
            },
          },
        },
      ],
    },
  ],
};

const SESSION: SessionResponse = {
  sessionId: "session_1",
  agentSessionId: "agent-session-1",
  tripId: "trip_1",
  messages: [],
  turnRunning: false,
};

// Answers the session and itinerary reads, and replies to a message with the events
// given. Keeps each message sent.
class FakeSiteApi implements SiteApi {
  readonly sent: { path: string; message: MessageRequest }[] = [];
  readonly #reply: ChatEvent[];

  constructor(reply: ChatEvent[]) {
    this.#reply = reply;
  }

  get<T>(path: string, schema: ZodType<T>): Promise<T> {
    const body = path.endsWith("/itinerary") ? VIEW : SESSION;
    return Promise.resolve(schema.parse(body));
  }

  post<T>(path: string, schema: ZodType<T>): Promise<T> {
    expect(path).toBe("/api/sessions/session_1/resume");
    return Promise.resolve(schema.parse(SESSION));
  }

  async *send(path: string, message: MessageRequest): AsyncIterable<ChatEvent> {
    this.sent.push({ path, message });
    await Promise.resolve();
    yield* this.#reply;
  }
}

const REPLY: ChatEvent[] = [
  { name: "traced", data: { spanId: "0123456789abcdef" } },
  { name: "toolCall", data: { name: "mcp__trip__read_itinerary" } },
  { name: "text", data: { text: "Here are dinner ideas." } },
  { name: "ended", data: { failure: null } },
];

function printed(): { lines: string[]; print: (text: string) => void } {
  const lines: string[] = [];
  return { lines, print: (text) => lines.push(text) };
}

describe("npm run live-chat", () => {
  it("prints only the reply, the tools' names, and how many cards are open", async () => {
    const api = new FakeSiteApi(REPLY);
    const { lines, print } = printed();
    expect(await sendMessage(api, print, "session_1", "Dinner ideas?")).toBe(
      true,
    );
    expect(lines).toEqual([
      "Working: read_itinerary…",
      "\nHere are dinner ideas.\n",
      "2 option cards are open.",
    ]);
  });

  it("selects an option by its card's ID and its own number, as a click on Select does", async () => {
    const api = new FakeSiteApi(REPLY);
    const { print } = printed();
    await selectOption(api, print, "session_1", {
      card: "stop_dinner",
      option: 2,
    });
    expect(api.sent).toEqual([
      {
        path: "/api/sessions/session_1/messages",
        message: {
          text: 'Select Quesadilla Mobilla for the meal "dinner" on Day 1.',
          optionCard: { holderId: "stop_dinner", placeId: "place_quesadilla" },
        },
      },
    ]);
  });

  it("refuses a tier button the card doesn't show, and sends nothing", async () => {
    const api = new FakeSiteApi(REPLY);
    const { print } = printed();
    await expect(
      askOnCard(api, print, "session_1", {
        card: "stay_moab",
        label: "Higher tier",
      }),
    ).rejects.toThrow(LiveChatError);
    expect(api.sent).toEqual([]);
  });

  // A simulated user that clicks from an old list of cards, after a card before it
  // closed, would hit the wrong card if cards were numbered by place in the list (#66).
  it("refuses a card that has closed, and sends nothing", async () => {
    const api = new FakeSiteApi(REPLY);
    const { print } = printed();
    await expect(
      selectOption(api, print, "session_1", {
        card: "stop_breakfast",
        option: 1,
      }),
    ).rejects.toThrow(
      "Option card stop_breakfast isn't open. The open cards are stay_moab, stop_dinner.",
    );
    expect(api.sent).toEqual([]);
  });

  it("says when the reply didn't finish, and returns false", async () => {
    const api = new FakeSiteApi([
      { name: "ended", data: { failure: "The model's limit was reached." } },
    ]);
    const { lines, print } = printed();
    expect(await sendMessage(api, print, "session_1", "Hi")).toBe(false);
    expect(lines[0]).toBe(
      "The reply didn't finish. Try sending your message again.",
    );
  });
});
