import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { NoDrivingRouteError } from "../google/routes-client.js";
import { setUp } from "../persistence/trip-writer.fake.js";
import { writeReplyOrReadableError } from "./tool-reply.js";
import { UPDATE_TRIP_BRIEF_SCHEMA } from "./trip-brief-tools.js";
import { createTripServer, TRIP_SERVER_NAME } from "./trip-server.js";

describe("createTripServer", () => {
  it("makes the trip server for one session's trip", () => {
    const server = createTripServer({ ...setUp(), tripId: "trip_a" });
    expect(server.type).toBe("sdk");
    expect(server.name).toBe(TRIP_SERVER_NAME);
  });

  // The Agent SDK leaves out a tool whose input schema it can't turn into JSON Schema,
  // with only a warning.
  it("has an input schema that converts to JSON Schema, with no item required", () => {
    const schema = z.toJSONSchema(UPDATE_TRIP_BRIEF_SCHEMA);
    expect(Object.keys(schema.properties ?? {})).toHaveLength(11);
    expect(schema.required).toBeUndefined();
  });
});

describe("update_trip_brief, called through the trip server", () => {
  it("refuses an item name it doesn't know, names it, and saves nothing", async () => {
    const fixture = setUp();
    const { id: tripId } = await fixture.writer.startTrip({
      id: "4f6c1d0e-2a8b-4c3d-9e7f-1a2b3c4d5e6f",
    });
    const client = await clientOf(createTripServer({ ...fixture, tripId }));
    const reply = await client.callTool({
      name: "update_trip_brief",
      arguments: { focus: "Utah", tripLength: 5 },
    });
    expect(reply.isError).toBe(true);
    expect(JSON.stringify(reply.content)).toContain("tripLength");
    const brief = await fixture.reader.read(tripId);
    expect(brief.tripBrief.focus).toBeNull();
  });
});

// An MCP client connected to the server object, as the Agent SDK's is, so each call's
// input is checked by the server, as it is in a session.
async function clientOf(
  server: McpSdkServerConfigWithInstance,
): Promise<Client> {
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
  await server.instance.connect(serverSide);
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(clientSide);
  return client;
}

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
