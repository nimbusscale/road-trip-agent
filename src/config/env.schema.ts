import { z } from "zod";

function requiredText(): z.ZodString {
  return z.string({ error: "is missing" }).min(1, { error: "is empty" });
}

export const envSchema = z.object({
  appHost: z.ipv4({
    error: (issue) =>
      issue.input === undefined
        ? "is missing"
        : "must be an IPv4 address, such as 127.0.0.1",
  }),
  postgresHost: requiredText(),
  postgresUser: requiredText(),
  postgresPassword: requiredText(),
  postgresDb: requiredText(),
});

export type Env = z.infer<typeof envSchema>;

// Each variable's name in .env and in Docker Compose. Code uses the camelCase key.
export const ENV_NAMES = {
  appHost: "APP_HOST",
  postgresHost: "POSTGRES_HOST",
  postgresUser: "POSTGRES_USER",
  postgresPassword: "POSTGRES_PASSWORD",
  postgresDb: "POSTGRES_DB",
} as const satisfies Record<keyof Env, string>;
