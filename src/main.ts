import { serve } from "@hono/node-server";

import { coordinatorAccessFor } from "./agent/coordinator-access.js";
import { CoordinatorTurns } from "./agent/coordinator-turns.js";
import { runTurnWithSdk } from "./agent/coordinator.js";
import { createApi } from "./api/api.js";
import type { ChatDependencies } from "./api/chat-dependencies.js";
import { createSupabaseTokenVerifier } from "./auth/token-verifier.js";
import { ConfigError } from "./config/config-error.js";
import type { Env } from "./config/env.schema.js";
import { parseEnv } from "./config/env.js";
import type { Settings } from "./config/settings.schema.js";
import { loadSettings, SETTINGS_PATH } from "./config/settings.js";
import { createPool, isDatabaseReachable } from "./db/connection.js";
import type { Connectable, Queryable } from "./persistence/queryable.js";
import { sessionAccessFor } from "./persistence/session-access.js";

// Vite's proxy and Caddy both pass /api to this port.
const APP_PORT = 3000;

function start(): void {
  const env = parseEnv(process.env);
  // Loaded now so a bad file stops the app before it serves anything.
  const settings = loadSettings(SETTINGS_PATH);

  const pool = createPool(env);
  const api = createApi({
    isDatabaseReachable: () => isDatabaseReachable(pool),
    verifyToken: createSupabaseTokenVerifier(env.supabaseUrl),
    chat: chatDependencies(env, pool, settings),
  });
  const server = serve(
    { fetch: api.fetch, hostname: env.appHost, port: APP_PORT },
    (info) => {
      console.log(
        `The app is listening on ${info.address}:${String(info.port)}`,
      );
    },
  );

  // Docker stops a container with SIGTERM. Node ignores it by default when it's the
  // container's first process, so Docker would wait 10 seconds and then kill it.
  const stop = (): void => {
    server.close();
    void pool.end();
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
}

function chatDependencies(
  env: Env,
  pool: Connectable & Queryable,
  settings: Settings,
): ChatDependencies {
  const coordinator = coordinatorAccessFor({
    env,
    pool,
    settings,
    processEnv: process.env,
  });
  const now = (): Date => new Date();
  return {
    trips: { reader: coordinator.trip.reader, writer: coordinator.trip.writer },
    sessions: sessionAccessFor(pool),
    memory: {
      reader: coordinator.memory.reader,
      writer: coordinator.memory.writer,
    },
    turns: new CoordinatorTurns({ coordinator, runTurn: runTurnWithSdk, now }),
    transcripts: coordinator.transcripts,
    now,
  };
}

try {
  start();
} catch (error) {
  if (!(error instanceof ConfigError)) {
    throw error;
  }
  console.error(error.message);
  process.exitCode = 1;
}
