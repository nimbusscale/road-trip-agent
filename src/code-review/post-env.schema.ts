import { z } from "zod";

// What the posting step needs from the workflow's environment: which PR, at which
// commit, and the job's GitHub token.
export const postEnvSchema = z.object({
  repository: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
  pullNumber: z.coerce.number().int().positive(),
  commitId: z.string().regex(/^[0-9a-f]{40}$/),
  token: z.string().min(1),
});

export type PostEnv = z.infer<typeof postEnvSchema>;

// A PR number given on the command line.
export const pullNumberSchema = z.coerce
  .number({ error: "Give the PR's number." })
  .int()
  .positive();
