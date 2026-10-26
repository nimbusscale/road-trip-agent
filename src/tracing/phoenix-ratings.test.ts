import { afterEach, describe, expect, it, vi } from "vitest";

import { phoenixRatings, RatingNotSavedError } from "./phoenix-ratings.js";

const PHOENIX_URL = "http://127.0.0.1:6006";
const USER_ID = "00000000-0000-4000-8000-000000000001";
const SPAN_ID = "0123456789abcdef";
const AGENT_SESSION_ID = "4b9e2c1a-7d3f-4e8a-9b6c-5f1d2e3a4b7c";

// fetch is faked, so the ratings make no outside call (DEVELOPMENT.md section 5).
function fakeFetch(answer: () => Promise<Response>) {
  const fetch = vi.fn<typeof globalThis.fetch>(answer);
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

const ACCEPTED = () =>
  Promise.resolve(new Response('{"data":[]}', { status: 200 }));

function sentBody(fetch: ReturnType<typeof fakeFetch>): unknown {
  const body = fetch.mock.calls[0]?.[1]?.body;
  return typeof body === "string" ? JSON.parse(body) : undefined;
}

// Phoenix's own field names are snake_case, which only schema files may write as
// property names (DEVELOPMENT.md section 4).
function phoenixFields(fields: [string, unknown][]): Record<string, unknown> {
  return Object.fromEntries(fields);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("phoenixRatings", () => {
  // Without ?sync=true, so Phoenix waits for a span it doesn't have yet.
  it("posts a turn's rating as a span annotation, with the user's ID as its identifier", async () => {
    const fetch = fakeFetch(ACCEPTED);
    await phoenixRatings(PHOENIX_URL).rateTurn(SPAN_ID, {
      rating: "up",
      note: "Good pick.",
      userId: USER_ID,
    });
    expect(fetch.mock.calls[0]?.[0]).toBe(
      "http://127.0.0.1:6006/v1/span_annotations",
    );
    expect(sentBody(fetch)).toEqual({
      data: [
        phoenixFields([
          ["span_id", SPAN_ID],
          ["name", "rating"],
          ["annotator_kind", "HUMAN"],
          ["identifier", USER_ID],
          ["result", { label: "up", score: 1, explanation: "Good pick." }],
        ]),
      ],
    });
  });

  it("posts a session's rating as a session annotation, leaving out an empty note", async () => {
    const fetch = fakeFetch(ACCEPTED);
    await phoenixRatings(PHOENIX_URL).rateSession(AGENT_SESSION_ID, {
      rating: "down",
      note: "",
      userId: USER_ID,
    });
    expect(fetch.mock.calls[0]?.[0]).toBe(
      "http://127.0.0.1:6006/v1/session_annotations",
    );
    expect(sentBody(fetch)).toEqual({
      data: [
        phoenixFields([
          ["session_id", AGENT_SESSION_ID],
          ["name", "rating"],
          ["annotator_kind", "HUMAN"],
          ["identifier", USER_ID],
          ["result", { label: "down", score: 0 }],
        ]),
      ],
    });
  });

  it("says the rating wasn't saved when nothing answers, such as when the tunnel is down", async () => {
    fakeFetch(() => Promise.reject(new TypeError("fetch failed")));
    await expect(
      phoenixRatings(PHOENIX_URL).rateTurn(SPAN_ID, {
        rating: "up",
        note: "",
        userId: USER_ID,
      }),
    ).rejects.toBeInstanceOf(RatingNotSavedError);
  });

  // A refused body is a bug, not something the user can fix.
  it("fails with Phoenix's reply when Phoenix refuses the rating", async () => {
    fakeFetch(() =>
      Promise.resolve(new Response("Invalid body", { status: 422 })),
    );
    const saving = phoenixRatings(PHOENIX_URL).rateTurn(SPAN_ID, {
      rating: "up",
      note: "",
      userId: USER_ID,
    });
    await expect(saving).rejects.toThrow(
      "Phoenix refused the rating with 422: Invalid body",
    );
    await expect(saving).rejects.not.toBeInstanceOf(RatingNotSavedError);
  });
});
