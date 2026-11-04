import { z } from "zod";

function requiredText(): z.ZodString {
  return z.string({ error: "is missing" }).min(1, { error: "is empty" });
}

function missingOr(message: string) {
  return (issue: { input?: unknown }) =>
    issue.input === undefined ? "is missing" : message;
}

// What npm run live-chat signs in with, and where (#251). The site is the local stack,
// http://localhost:5173 with npm run dev, or the live site. Both sign in to the same
// Supabase project (systems design section 6), whose address and publishable key the
// web page uses too. The password comes only from the environment, since a harness
// shows each command it runs.
export const liveChatEnvSchema = z.object({
  site: z
    .url({
      protocol: /^https?$/,
      error: missingOr("must be an address, such as http://localhost:5173"),
    })
    // The client adds paths such as /api/trips, so a trailing slash would double up.
    .transform((url) => url.replace(/\/+$/, "")),
  email: z.email({ error: missingOr("must be an email address") }),
  password: requiredText(),
  supabaseUrl: z.url({ error: missingOr("must be an address") }),
  supabasePublishableKey: requiredText(),
});

export type LiveChatEnv = z.infer<typeof liveChatEnvSchema>;

// Each value's environment variable. The Supabase ones are the web page's own.
export const LIVE_CHAT_ENV_NAMES = {
  site: "LIVE_CHAT_SITE",
  email: "LIVE_CHAT_EMAIL",
  password: "LIVE_CHAT_PASSWORD",
  supabaseUrl: "VITE_SUPABASE_URL",
  supabasePublishableKey: "VITE_SUPABASE_PUBLISHABLE_KEY",
} as const satisfies Record<keyof LiveChatEnv, string>;
