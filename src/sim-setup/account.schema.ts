import { z } from "zod";

import { LIVE_CHAT_ENV_NAMES } from "../live-chat/live-chat-env.schema.js";

// A bot user's account file, ~/tmp/road-trip-sims/accounts/<bot user>.env (#66). Joe
// writes it by hand, outside the repo, so the password can't be committed. Its names
// are the ones npm run live-chat reads.
export const accountSchema = z.object({
  email: z.email({ error: "must be an email address" }),
  password: z.string({ error: "is missing" }).min(1, { error: "is empty" }),
});

export type Account = z.infer<typeof accountSchema>;

// Each value's name in the file.
export const ACCOUNT_NAMES = {
  email: LIVE_CHAT_ENV_NAMES.email,
  password: LIVE_CHAT_ENV_NAMES.password,
} as const satisfies Record<keyof Account, string>;
