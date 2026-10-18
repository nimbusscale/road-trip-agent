import { describe, expect, it } from "vitest";
import { z } from "zod";

import { NoDrivingRouteError } from "../google/routes-client.js";
import { setUp } from "../persistence/trip-writer.fake.js";
import { writeReplyOrReadableError } from "./tool-reply.js";
import { UPDATE_TRIP_BRIEF_INPUT } from "./trip-brief-tools.js";
import { createTripServer, TRIP_SERVER_NAME } from "./trip-server.js";

describe("createTripServer", () => {
  it("makes the trip server for one session's trip", () => {
    const server = createTripServer({ ...setUp(), tripId: "trip_a" });
    expect(server.type).toBe("sdk");
    expect(server.name).toBe(TRIP_SERVER_NAME);
  });

  // The Agent SDK leaves out a tool whose input schema it can't turn into JSON Schema,
  // with only a warning.
  it("has an input schema that converts to JSON Schema, refuses other keys, and requires no item", () => {
    const schema = z.toJSONSchema(UPDATE_TRIP_BRIEF_INPUT);
    expect(Object.keys(schema.properties ?? {})).toHaveLength(11);
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toBeUndefined();
  });
});

describe("writeReplyOrReadableError", () => {
  it("turns a failed Google call into a message the agent can read", async () => {
    const reply = await writeReplyOrReadableError(() =>
      Promise.reject(
        new NoDrivingRouteError("Google found no way to drive it."),
      ),
    );
    expect(reply).toEqual({
      content: [
        {
          type: "text",
          text: "Nothing was saved. Google found no way to drive it.",
        },
      ],
      isError: true,
    });
  });
});
