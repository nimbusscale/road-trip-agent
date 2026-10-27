import { createClient } from "@supabase/supabase-js";

import { webEnv } from "./web-env";

// Signs in with Supabase, keeps the session in the browser, and renews the token
// before it expires (systems design section 3).
export const supabase = createClient(
  webEnv.supabaseUrl,
  webEnv.supabasePublishableKey,
);
