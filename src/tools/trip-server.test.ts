import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";

import { NoDrivingRouteError } from "../google/routes-client.js";
import { setUp } from "../persistence/trip-writer.fake.js";
import { writeReplyOrReadableError } from "./tool-reply.js";
import { createTripServer, TRIP_SERVER_NAME } from "./trip-server.js";

const OWNER = { id: "4f6c1d0e-2a8b-4c3d-9e7f-1a2b3c4d5e6f" };

// A client connected to the server the Agent SDK is handed, so a call goes through the
// SDK's own handling of the schema, as the model's does.
async function connectedClient(): Promise<{
  client: Client;
  reader: ReturnType<typeof setUp>["reader"];
  tripId: string;
}> {
  const fixture = setUp();
  const { id: tripId } = await fixture.writer.startTrip(OWNER);
  const server = createTripServer({ ...fixture, tripId });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.instance.connect(serverSide);
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(clientSide);
  return { client, reader: fixture.reader, tripId };
}

describe("createTripServer", () => {
  it("makes the trip server for one session's trip", () => {
    const server = createTripServer({ ...setUp(), tripId: "trip_a" });
    expect(server.type).toBe("sdk");
    expect(server.name).toBe(TRIP_SERVER_NAME);
  });

  // The Agent SDK leaves out a tool whose input schema it can't turn into JSON Schema,
  // with only a warning. It also drops unknown keys, unless the schema is strict.
  it("lists every tool, with schemas that refuse other keys, and no brief item required", async () => {
    const { client } = await connectedClient();
    const { tools } = await client.listTools();
    expect(tools.map((each) => each.name)).toEqual([
      "read_trip_brief",
      "update_trip_brief",
      "read_itinerary",
      "find_in_trip",
      "update_itinerary",
      "add_stay",
      "update_stay",
      "remove_stay",
      "update_day",
      "add_stops",
      "update_stop",
      "move_stop",
      "remove_stops",
      "set_waypoints",
      "select_candidate",
      "select_user_place",
      "reject_places",
    ]);
    expect(
      tools.every((each) => each.inputSchema.additionalProperties === false),
    ).toBe(true);
    const update = tools.find((each) => each.name === "update_trip_brief");
    expect(Object.keys(update?.inputSchema.properties ?? {})).toHaveLength(11);
    expect(update?.inputSchema.additionalProperties).toBe(false);
    expect(update?.inputSchema.required).toBeUndefined();
  });

  // The limits are settings, so they're filled in, never written into the text.
  it("gives the trip length and driving limits from the settings, in update_trip_brief and update_day", async () => {
    const fixture = setUp();
    const server = createTripServer({
      ...fixture,
      tripId: "trip_a",
      settings: {
        ...fixture.settings,
        maximumTripLengthDays: 10,
        maximumDailyDrivingHours: 9,
      },
    });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await server.instance.connect(serverSide);
    const client = new Client({ name: "test", version: "1.0.0" });
    await client.connect(clientSide);
    const { tools } = await client.listTools();
    const update = tools.find((each) => each.name === "update_trip_brief");
    expect(update?.inputSchema.properties).toMatchObject({
      tripLengthInDays: { description: "A whole number, from 1 to 10." },
      comfortableDrivingInHours: {
        description: "Hours, such as 5 or 6.5. At most 9.",
      },
    });
    const updateDay = tools.find((each) => each.name === "update_day");
    expect(updateDay?.inputSchema.properties).toMatchObject({
      approveDriveHours: {
        properties: {
          hours: {
            description: "Hours of driving, such as 7 or 7.5. At most 9.",
          },
        },
      },
    });
  });

  // A misnamed item once vanished, and the tool still said it saved.
  it("refuses a call with an item it doesn't know, and saves nothing", async () => {
    const { client, reader, tripId } = await connectedClient();
    const reply = await client.callTool({
      name: "update_trip_brief",
      arguments: { focus: "Utah", tripLength: 5 },
    });
    expect(reply.isError).toBe(true);
    expect(JSON.stringify(reply.content)).toMatch(
      /Unrecognized key.*tripLength/,
    );
    expect((await reader.read(tripId)).tripBrief.focus).toBeNull();
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
          text: "Nothing was changed. Google found no way to drive it.",
        },
      ],
      isError: true,
    });
  });
});
