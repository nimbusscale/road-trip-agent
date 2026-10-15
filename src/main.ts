import { serve } from "@hono/node-server";

import { createApi } from "./api/api.js";
import { createSupabaseTokenVerifier } from "./auth/token-verifier.js";
import { ConfigError } from "./config/config-error.js";
import { parseEnv } from "./config/env.js";
import { loadSettings, SETTINGS_PATH } from "./config/settings.js";
import { createPool, isDatabaseReachable } from "./db/connection.js";

// Vite's proxy and Caddy both pass /api to this port.
const APP_PORT = 3000;

function start(): void {
  const env = parseEnv(process.env);
  // Loaded now so a bad file stops the app before it serves anything.
  // Later phases hand the settings to the code that uses them.
  loadSettings(SETTINGS_PATH);

  const pool = createPool(env);
  const api = createApi({
    isDatabaseReachable: () => isDatabaseReachable(pool),
    verifyToken: createSupabaseTokenVerifier(env.supabaseUrl),
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

try {
  start();
} catch (error) {
  if (!(error instanceof ConfigError)) {
    throw error;
  }
  console.error(error.message);
  process.exitCode = 1;
}
