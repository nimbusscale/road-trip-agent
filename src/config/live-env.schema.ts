import { z } from "zod";

// The live database, reached through an SSH tunnel to the server's Postgres (systems
// design, section 2). Only dev tools that read a recorded session use it, such as the
// trip versions rebuild (#244) and a run from a recorded turn (#245), so it's not in the
// app's env.
const liveEnvSchema = z.object({
  port: z.coerce.number().int().positive(),
  user: z.string().min(1),
  password: z.string().min(1),
  database: z.string().min(1),
});

// Each value's environment variable.
const LIVE_ENV_NAMES = {
  port: "LIVE_POSTGRES_PORT",
  user: "LIVE_POSTGRES_USER",
  password: "LIVE_POSTGRES_PASSWORD",
  database: "LIVE_POSTGRES_DB",
} as const;

// The tunnel's end on this machine (DEVELOPMENT.md section 2).
const TUNNEL_HOST = "127.0.0.1";

// What pg's Pool takes to reach the live database.
export function livePoolConfigOf(
  source: Readonly<Record<string, string | undefined>>,
): z.infer<typeof liveEnvSchema> & { host: string } {
  const values = liveEnvSchema.parse(
    Object.fromEntries(
      Object.entries(LIVE_ENV_NAMES).map(([key, name]) => [key, source[name]]),
    ),
  );
  return { host: TUNNEL_HOST, ...values };
}
