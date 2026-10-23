import { createTestSigner } from "../auth/test-tokens.js";
import { createTokenVerifier } from "../auth/token-verifier.js";
import { ChatEventParser } from "../shared/chat-event-parser.js";
import type { ChatEvent } from "../shared/session.schema.js";
import { createApi } from "./api.js";
import { type ChatSetUp, chatSetUp } from "./chat.fake.js";

// The API with the chat's fakes, and two signed-in users, for tests.

export const OTHER_USER_ID = "9d8c7b6a-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

export type Caller = (
  method: string,
  path: string,
  body?: unknown,
) => Promise<Response>;

export interface ChatApi extends ChatSetUp {
  // The test user, and a second user who owns nothing.
  asUser: Caller;
  asOtherUser: Caller;
}

export async function chatApi(now: Date): Promise<ChatApi> {
  const signer = await createTestSigner();
  const setUp = chatSetUp(now);
  const api = createApi({
    isDatabaseReachable: () => Promise.resolve(true),
    verifyToken: createTokenVerifier(signer.verifierOptions),
    chat: setUp.chat,
  });
  const callerFor =
    (token: string): Caller =>
    (method, path, body) =>
      Promise.resolve(
        api.request(path, {
          method,
          headers: [
            ["Authorization", `Bearer ${token}`],
            ["Content-Type", "application/json"],
          ],
          body: body === undefined ? null : JSON.stringify(body),
        }),
      );
  return {
    ...setUp,
    asUser: callerFor(await signer.sign()),
    asOtherUser: callerFor(await signer.sign({ sub: OTHER_USER_ID })),
  };
}

// Every event of a streamed reply, read to its end.
export async function eventsOf(response: Response): Promise<ChatEvent[]> {
  return new ChatEventParser().push(await response.text());
}

// The trip and session a "New trip" or "start a new session" reply opened with.
export function openedSession(events: readonly ChatEvent[]): {
  tripId: string;
  sessionId: string;
} {
  const [first] = events;
  if (first?.name !== "session") {
    throw new Error("The reply didn't open with its session.");
  }
  return first.data;
}
