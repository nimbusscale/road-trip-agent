import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";

import {
  FAKE_POOL,
  FakeMemoryStore,
} from "../persistence/fake-memory-store.js";
import { MemoryReader } from "../persistence/memory-reader.js";
import { MemoryWriter } from "../persistence/memory-writer.js";
import { createMemoryServer, MEMORY_SERVER_NAME } from "./memory-server.js";
import type { MemorySession } from "./memory-session.js";

const USER = "2f6c1d3e-8a4b-4c5d-9e6f-7a8b9c0d1e2f";
const LIMITS = { maximumMemoryItems: 50, maximumMemoryItemCharacters: 300 };

function sessionWith(store: FakeMemoryStore): MemorySession {
  return {
    userId: USER,
    tripId: "trip_aaaaaaaa",
    writer: new MemoryWriter({
      pool: FAKE_POOL,
      makeStore: () => store,
      hasTripStarted: () => Promise.resolve(null),
      limits: LIMITS,
    }),
    reader: new MemoryReader({ pool: FAKE_POOL, makeStore: () => store }),
    limits: LIMITS,
  };
}

// A client connected to the server the Agent SDK is handed, so a call goes through the
// SDK's own handling of the schema, as the model's does.
async function connectedClient(store: FakeMemoryStore): Promise<Client> {
  const server = createMemoryServer(sessionWith(store));
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.instance.connect(serverSide);
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(clientSide);
  return client;
}

describe("createMemoryServer", () => {
  it("makes the memory server for one session", () => {
    const server = createMemoryServer(sessionWith(new FakeMemoryStore()));
    expect(server.type).toBe("sdk");
    expect(server.name).toBe(MEMORY_SERVER_NAME);
  });

  // The Agent SDK leaves out a tool whose input schema it can't turn into JSON Schema,
  // with only a warning. It also drops unknown keys, unless the schema is strict.
  it("lists the four tools, with no user or trip ID, and schemas that refuse other keys", async () => {
    const client = await connectedClient(new FakeMemoryStore());
    const { tools } = await client.listTools();
    expect(tools.map((each) => each.name)).toEqual([
      "read_memory",
      "add_memory_item",
      "update_memory_item",
      "forget_memory_item",
    ]);
    expect(
      tools.map((each) => Object.keys(each.inputSchema.properties ?? {})),
    ).toEqual([[], ["memory", "text"], ["itemId", "text"], ["itemId"]]);
    for (const each of tools) {
      expect(each.inputSchema.additionalProperties).toBe(false);
    }
  });

  it("gives the limits in the descriptions the model sees", async () => {
    const client = await connectedClient(new FakeMemoryStore());
    const { tools } = await client.listTools();
    const add = tools.find((each) => each.name === "add_memory_item");
    expect(add?.description).toContain("at most 50 items");
    expect(JSON.stringify(add?.inputSchema)).toContain(
      "at most 300 characters",
    );
  });

  it("refuses an add that names a user ID, and saves nothing", async () => {
    const store = new FakeMemoryStore();
    const client = await connectedClient(store);
    const reply = await client.callTool({
      name: "add_memory_item",
      arguments: {
        memory: "user",
        text: "Upscale hotels only.",
        userId: "7d1e2f3a-4b5c-4d6e-8f9a-0b1c2d3e4f5a",
      },
    });
    expect(reply.isError).toBe(true);
    expect(JSON.stringify(reply.content)).toMatch(/Unrecognized key.*userId/);
    expect(store.rows).toEqual([]);
  });
});
