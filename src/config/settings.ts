import { readFileSync } from "node:fs";

import { ConfigError } from "./config-error.js";
import { settingsSchema, type Settings } from "./settings.schema.js";

// Relative to the working directory: the repo locally, /app in the container.
export const SETTINGS_PATH = "settings.json";

// Loaded once, when the app starts (technical spec section 10).
export function loadSettings(path: string): Settings {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    throw new ConfigError(`Can't read the settings file ${path}.`, {
      cause: error,
    });
  }
  return parseSettings(text, path);
}

export function parseSettings(text: string, path: string): Settings {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new ConfigError(`The settings file ${path} isn't valid JSON.`, {
      cause: error,
    });
  }
  const result = settingsSchema.safeParse(raw);
  if (result.success) {
    return result.data;
  }
  const problems = result.error.issues
    .map((issue) => `- ${[...issue.path.map(String), issue.message].join(" ")}`)
    .join("\n");
  throw new ConfigError(`The settings file ${path} isn't valid:\n${problems}`);
}
