import { createClient } from "@supabase/supabase-js";

import { webEnvSchema } from "./web-env.schema";

// Vite types each value as any, so it's read as unknown and parsed.
const viteEnv: Readonly<Record<string, unknown>> = import.meta.env;
const env = webEnvSchema.parse({
  supabaseUrl: viteEnv.VITE_SUPABASE_URL,
  supabasePublishableKey: viteEnv.VITE_SUPABASE_PUBLISHABLE_KEY,
});

// Signs in with Supabase, keeps the session in the browser, and renews the token
// before it expires (systems design section 3).
export const supabase = createClient(
  env.supabaseUrl,
  env.supabasePublishableKey,
);
