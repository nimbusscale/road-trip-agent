import { z } from "zod";

// Which app the token script makes a token for.
export const appAgentSchema = z.enum(["reviewer", "fixer"], {
  error: "Usage: app-token.ts <reviewer|fixer>",
});

// One GitHub App's ID and the path to its private key, from .env (systems design
// section 8). The key stays in a folder outside the repo.
export const appEnvSchema = z.object({
  appId: z.string().regex(/^\d+$/),
  privateKeyPath: z.string().min(1),
});

// The parts of GitHub's replies that the token script reads.

export const installationSchema = z.object({ id: z.int() });

export const accessTokenSchema = z
  .object({ token: z.string().min(1), expires_at: z.string() })
  .transform((access) => ({
    token: access.token,
    expiresAt: access.expires_at,
  }));

export const appSchema = z.object({ slug: z.string().min(1) });

export const userSchema = z.object({ id: z.int() });
