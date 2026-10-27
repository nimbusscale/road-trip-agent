import { z } from "zod";

// The values Vite builds into the front end, from .env locally and from GitHub repo
// variables in the web image (systems design section 7).
export const webEnvSchema = z.object({
  supabaseUrl: z.url(),
  supabasePublishableKey: z.string().min(1),
  // For the itinerary map (Google design sections 1 and 4).
  googleMapsBrowserKey: z.string().min(1),
});

export type WebEnv = z.infer<typeof webEnvSchema>;
