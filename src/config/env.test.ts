import { describe, expect, it } from "vitest";

import { ConfigError } from "./config-error.js";
import { parseEnv } from "./env.js";

// Built from pairs, since variable names such as APP_HOST aren't camelCase.
const GOOD_ENV: readonly (readonly [string, string])[] = [
  ["APP_HOST", "127.0.0.1"],
  ["POSTGRES_HOST", "127.0.0.1"],
  ["POSTGRES_USER", "roadtrip"],
  ["POSTGRES_PASSWORD", "secret"],
  ["POSTGRES_DB", "roadtrip"],
  ["SUPABASE_URL", "https://abc.supabase.co"],
];

function envWith(name: string, value: string): Record<string, string> {
  return Object.fromEntries([...GOOD_ENV, [name, value]]);
}

function envWithout(name: string): Record<string, string> {
  return Object.fromEntries(GOOD_ENV.filter(([key]) => key !== name));
}

describe("parseEnv", () => {
  it("returns the values under their code names", () => {
    expect(parseEnv(Object.fromEntries(GOOD_ENV))).toEqual({
      appHost: "127.0.0.1",
      postgresHost: "127.0.0.1",
      postgresUser: "roadtrip",
      postgresPassword: "secret",
      postgresDb: "roadtrip",
      supabaseUrl: "https://abc.supabase.co",
    });
  });

  it("drops a trailing slash from the Supabase address", () => {
    expect(
      parseEnv(envWith("SUPABASE_URL", "https://abc.supabase.co/")).supabaseUrl,
    ).toBe("https://abc.supabase.co");
  });

  it("refuses a Supabase address that isn't https", () => {
    expect(() =>
      parseEnv(envWith("SUPABASE_URL", "http://abc.supabase.co")),
    ).toThrow("- SUPABASE_URL must be an https address");
  });

  it("ignores variables the app doesn't read", () => {
    expect(parseEnv(envWith("PATH", "/usr/bin"))).not.toHaveProperty("PATH");
  });

  it("names a missing variable", () => {
    const env = envWithout("POSTGRES_PASSWORD");
    expect(() => parseEnv(env)).toThrow(ConfigError);
    expect(() => parseEnv(env)).toThrow("- POSTGRES_PASSWORD is missing");
  });

  it("names an empty variable", () => {
    expect(() => parseEnv(envWith("POSTGRES_DB", ""))).toThrow(
      "- POSTGRES_DB is empty",
    );
  });

  it("names a variable with a bad value", () => {
    expect(() => parseEnv(envWith("APP_HOST", "localhost"))).toThrow(
      "- APP_HOST must be an IPv4 address",
    );
  });

  it("names every bad variable at once", () => {
    expect(() => parseEnv({})).toThrow(
      /APP_HOST is missing\n.*POSTGRES_HOST is missing\n.*POSTGRES_USER is missing/,
    );
  });
});
