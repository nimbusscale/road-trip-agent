import { z } from "zod";

// The part of .claude/settings.json that the fix job reads: the ask rules for the
// config files (DEVELOPMENT.md section 6).
export const askRulesSchema = z
  .object({
    permissions: z.object({ ask: z.array(z.string()) }),
  })
  .transform((settings) => settings.permissions.ask);
