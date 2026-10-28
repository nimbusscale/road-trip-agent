import { z } from "zod";

function requiredText(): z.ZodString {
  return z.string({ error: "is missing" }).min(1, { error: "is empty" });
}

export const envSchema = z.object({
  appHost: z.ipv4({
    error: (issue) =>
      issue.input === undefined
        ? "is missing"
        : "must be an IPv4 address, such as 127.0.0.1",
  }),
  postgresHost: requiredText(),
  postgresUser: requiredText(),
  postgresPassword: requiredText(),
  postgresDb: requiredText(),
  supabaseUrl: z
    .url({
      protocol: /^https$/,
      error: (issue) =>
        issue.input === undefined
          ? "is missing"
          : "must be an https address, such as https://abc.supabase.co",
    })
    // The code adds paths such as /auth/v1, so a trailing slash would double up.
    .transform((url) => url.replace(/\/+$/, "")),
  // The Claude plan's token, from claude setup-token (systems design section 8).
  claudeCodeOauthToken: requiredText(),
  // Google's server key, for Routes, Places, and Weather (Google design section 1).
  googleMapsServerKey: requiredText(),
  // Where each turn's trace is sent, and where the page's check looks for Phoenix
  // (systems design section 10). http, since it's on the Compose network or through an
  // SSH tunnel.
  phoenixUrl: z
    .url({
      protocol: /^https?$/,
      error: (issue) =>
        issue.input === undefined
          ? "is missing"
          : "must be an http address, such as http://127.0.0.1:6006",
    })
    // The code adds paths such as /healthz, so a trailing slash would double up.
    .transform((url) => url.replace(/\/+$/, "")),
  // The Phoenix project the traces go to: road-trip-agent on the server, and
  // road-trip-agent-local on Joe's machine.
  phoenixProject: requiredText(),
  // The commit the app image was built from, for each turn's trace (systems design
  // section 10). The deploy builds it into the image. Locally there's none, and git gives
  // it instead (appCommit()).
  appCommit: requiredText().optional(),
});

export type Env = z.infer<typeof envSchema>;

// Each variable's name in .env and in Docker Compose. Code uses the camelCase key.
export const ENV_NAMES = {
  appHost: "APP_HOST",
  postgresHost: "POSTGRES_HOST",
  postgresUser: "POSTGRES_USER",
  postgresPassword: "POSTGRES_PASSWORD",
  postgresDb: "POSTGRES_DB",
  supabaseUrl: "SUPABASE_URL",
  claudeCodeOauthToken: "CLAUDE_CODE_OAUTH_TOKEN",
  googleMapsServerKey: "GOOGLE_MAPS_SERVER_KEY",
  phoenixUrl: "PHOENIX_URL",
  phoenixProject: "PHOENIX_PROJECT",
  appCommit: "APP_COMMIT",
} as const satisfies Record<keyof Env, string>;
