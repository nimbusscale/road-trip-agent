import { z } from "zod";

// The contents of a Supabase sign-in token, parsed after its signature is checked
// (systems design section 3). The app only needs the user's ID, which is the token's
// `sub` claim.
export const signedInUserSchema = z
  .object({ sub: z.uuid() })
  .transform((claims) => ({ userId: claims.sub }));

export type SignedInUser = z.infer<typeof signedInUserSchema>;
