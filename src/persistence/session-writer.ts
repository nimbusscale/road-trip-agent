import { randomUUID } from "node:crypto";

import { RuleError } from "../domain/rule-error.js";
import { newId } from "../ids/new-id.js";
import type { Connectable, Queryable } from "./queryable.js";
import type { SessionRowStore } from "./session-repository.js";
import { Session } from "./session.js";
import { inTransaction } from "./transaction.js";

export interface SessionWriterOptions {
  pool: Connectable;
  makeStore: (connection: Queryable) => SessionRowStore;
}

// A title is cut to about this many characters, at a word break (persistence design,
// section 8.5).
export const TITLE_CHARACTERS = 60;

// Starts sessions (persistence design, section 8.5). Starting one adds a row. It takes no
// row lock and doesn't touch the plan, so it works on a started trip (section 6).
export class SessionWriter {
  constructor(private readonly options: SessionWriterOptions) {}

  async start(tripId: string, firstMessage: string): Promise<Session> {
    const session = new Session({
      id: newId("session"),
      tripId,
      createdDateTime: new Date(),
      title: titleOf(firstMessage),
      // Chosen here and passed to the SDK, so it's known before the first message.
      agentSessionId: randomUUID(),
    });
    await inTransaction(this.options.pool, async (client) => {
      await this.options.makeStore(client).add(session);
    });
    return session;
  }
}

// The first message, cut to about TITLE_CHARACTERS at a word break. Example: "Can we add
// a night in Big Sur and drop one in…"
export function titleOf(firstMessage: string): string {
  const text = firstMessage.trim().replace(/\s+/g, " ");
  if (text === "") {
    throw new RuleError("A session's first message can't be empty.");
  }
  if (text.length <= TITLE_CHARACTERS) {
    return text;
  }
  // Cut at the last space that leaves at least one word. A first word longer than the
  // limit is cut where the limit falls.
  const cut = text.slice(0, TITLE_CHARACTERS + 1);
  const lastSpace = cut.lastIndexOf(" ");
  const kept = lastSpace > 0 ? cut.slice(0, lastSpace) : cut.slice(0, -1);
  return `${kept.trimEnd()}…`;
}
