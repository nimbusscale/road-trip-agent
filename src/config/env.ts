import type { z } from "zod";

import { ConfigError } from "./config-error.js";
import { ENV_NAMES, envSchema, type Env } from "./env.schema.js";

// Parsed once, when the app or the migrations start (DEVELOPMENT.md section 4).
export function parseEnv(
  source: Readonly<Record<string, string | undefined>>,
): Env {
  const input = Object.fromEntries(
    Object.entries(ENV_NAMES).map(([key, name]) => [key, source[name]]),
  );
  const result = envSchema.safeParse(input);
  if (result.success) {
    return result.data;
  }
  const problems = result.error.issues.map(describeIssue).join("\n");
  throw new ConfigError(`The environment isn't valid:\n${problems}`);
}

function describeIssue(issue: z.core.$ZodIssue): string {
  const entry = Object.entries(ENV_NAMES).find(
    ([key]) => key === issue.path[0],
  );
  const name = entry?.[1] ?? "An environment variable";
  return `- ${name} ${issue.message}`;
}
