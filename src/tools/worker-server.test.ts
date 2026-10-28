import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";

import { createWorkerServer } from "./worker-server.js";

// A client connected to the server the Agent SDK is handed, so a call goes through the
// SDK's own handling of the schema, as the model's does.
async function connectedClient(): Promise<Client> {
  const server = createWorkerServer();
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.instance.connect(serverSide);
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(clientSide);
  return client;
}

describe("createWorkerServer", () => {
  // The Agent SDK leaves out a tool whose input schema it can't turn into JSON Schema,
  // with only a warning. It also drops unknown keys, unless the schema is strict.
  it("lists report_result, with both lists required and no other keys", async () => {
    const client = await connectedClient();
    const { tools } = await client.listTools();
    expect(tools.map((each) => each.name)).toEqual(["report_result"]);
    expect(tools[0]?.inputSchema.additionalProperties).toBe(false);
    expect(tools[0]?.inputSchema.required).toEqual([
      "problems",
      "questionsForUser",
    ]);
  });

  it("tells the worker it's done", async () => {
    const client = await connectedClient();
    const reply = await client.callTool({
      name: "report_result",
      arguments: { problems: [], questionsForUser: [] },
    });
    expect(reply.content).toEqual([
      { type: "text", text: "Result recorded. You're done." },
    ]);
  });
});
