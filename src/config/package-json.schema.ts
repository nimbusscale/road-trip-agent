import { z } from "zod";

// The parts of a package.json that the dependency test reads: the app's own, and each
// installed package's.
export const packageJsonSchema = z.object({
  dependencies: z.record(z.string(), z.string()).optional(),
  peerDependencies: z.record(z.string(), z.string()).optional(),
  peerDependenciesMeta: z
    .record(z.string(), z.object({ optional: z.boolean().optional() }))
    .optional(),
});

export type PackageJson = z.infer<typeof packageJsonSchema>;
