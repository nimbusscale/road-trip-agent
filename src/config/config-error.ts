// A missing or bad value in the environment or the settings file.
// The app prints the message and stops before it starts serving.
export class ConfigError extends Error {
  override name = "ConfigError";
}
