import type { Connectable, Queryable } from "./queryable.js";
import { SessionReader } from "./session-reader.js";
import { SessionRepository } from "./session-repository.js";
import { SessionWriter } from "./session-writer.js";

// The app's reader and writer for sessions, made once when the app or the terminal
// chat starts.
export function sessionAccessFor(pool: Connectable & Queryable): {
  reader: SessionReader;
  writer: SessionWriter;
} {
  const makeStore = (connection: Queryable): SessionRepository =>
    new SessionRepository(connection);
  return {
    reader: new SessionReader({ pool, makeStore }),
    writer: new SessionWriter({ pool, makeStore }),
  };
}
