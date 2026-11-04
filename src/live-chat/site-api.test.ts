import { createServer, type Server } from "node:http";

import { afterEach, describe, expect, it } from "vitest";

import { sendMessage, startTrip } from "./live-chat-actions.js";
import { HttpSiteApi, LiveChatError } from "./site-api.js";

let server: Server | null = null;

// A site that starts a trip's reply, then drops the connection partway through the
// turn, as a restart or a network blip does.
async function siteThatDropsTheReply(): Promise<string> {
  const started = createServer((request, response) => {
    request.resume();
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    response.write(
      'event: session\ndata: {"tripId":"trip_1","sessionId":"session_1","agentSessionId":"a"}\n\n',
    );
    response.write(
      'event: toolCall\ndata: {"name":"mcp__trip__find_place"}\n\n',
    );
    setTimeout(() => response.socket?.destroy(), 50);
  });
  server = started;
  await new Promise<void>((resolve) => {
    started.listen(0, "127.0.0.1", resolve);
  });
  const address = started.address();
  if (address === null || typeof address === "string") {
    throw new Error("The test server has no port.");
  }
  return `http://127.0.0.1:${String(address.port)}`;
}

// The address of a port nothing listens on, as when npm run dev isn't running.
async function siteThatIsDown(): Promise<string> {
  const site = await siteThatDropsTheReply();
  await closeServer();
  return site;
}

async function closeServer(): Promise<void> {
  const running = server;
  server = null;
  if (running !== null) {
    await new Promise((resolve) => {
      running.close(resolve);
    });
  }
}

afterEach(closeServer);

describe("HttpSiteApi", () => {
  it("says the connection closed when a reply is cut off partway through a turn", async () => {
    const api = new HttpSiteApi(await siteThatDropsTheReply(), "token");
    const lines: string[] = [];
    const print = (text: string): void => {
      lines.push(text);
    };
    expect(await startTrip(api, print, "Moab")).toBe(false);
    expect(lines).toEqual([
      "Trip trip_1, session session_1.",
      "Working: find_place…",
      "The connection closed before the reply finished. Open the session again to see the rest.",
    ]);
  });

  it("says it couldn't reach a site that's down", async () => {
    const api = new HttpSiteApi(await siteThatIsDown(), "token");
    const print = (): void => undefined;
    await expect(sendMessage(api, print, "session_1", "Hi")).rejects.toThrow(
      LiveChatError,
    );
    await expect(startTrip(api, print, "Hi")).rejects.toThrow(LiveChatError);
  });
});
