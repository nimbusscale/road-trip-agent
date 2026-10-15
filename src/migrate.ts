import { runner } from "node-pg-migrate";

import { ConfigError } from "./config/config-error.js";
import { parseEnv } from "./config/env.js";
import { connectionConfigOf } from "./db/connection.js";

// Runs every migration in migrations/ that hasn't run yet. A deploy runs this from the
// new app image before the new app starts (systems design section 7).
async function migrate(): Promise<void> {
  const env = parseEnv(process.env);
  await runner({
    databaseUrl: connectionConfigOf(env),
    dir: "migrations",
    direction: "up",
    migrationsTable: "pgmigrations",
    checkOrder: true,
  });
}

try {
  await migrate();
} catch (error) {
  if (!(error instanceof ConfigError)) {
    throw error;
  }
  console.error(error.message);
  process.exitCode = 1;
}
