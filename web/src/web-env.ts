import { webEnvSchema } from "./web-env.schema";

// Vite types each value as any, so it's read as unknown and parsed.
const viteEnv: Readonly<Record<string, unknown>> = import.meta.env;

export const webEnv = webEnvSchema.parse({
  supabaseUrl: viteEnv.VITE_SUPABASE_URL,
  supabasePublishableKey: viteEnv.VITE_SUPABASE_PUBLISHABLE_KEY,
  googleMapsBrowserKey: viteEnv.VITE_GOOGLE_MAPS_BROWSER_KEY,
});
