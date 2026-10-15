import { Pool, type ClientConfig } from "pg";

import type { Env } from "../config/env.schema.js";

const POSTGRES_PORT = 5432;
// A stopped database fails the health check in this time, rather than hanging.
const CONNECT_TIMEOUT_MILLISECONDS = 2000;

export function connectionConfigOf(env: Env): ClientConfig {
  return {
    host: env.postgresHost,
    port: POSTGRES_PORT,
    user: env.postgresUser,
    password: env.postgresPassword,
    database: env.postgresDb,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MILLISECONDS,
  };
}

export function createPool(env: Env): Pool {
  const pool = new Pool(connectionConfigOf(env));
  // An idle connection fails when Postgres stops. With no listener, that error stops the app.
  pool.on("error", (error) => {
    console.error(`An idle database connection failed: ${error.message}`);
  });
  return pool;
}

export async function isDatabaseReachable(pool: Pool): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}
