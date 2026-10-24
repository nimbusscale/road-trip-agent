import { register } from "@arizeai/phoenix-otel";

// Spike (#132): local Phoenix, from docker compose --profile evals up -d phoenix. It
// listens only on this machine, with no sign-in.
export const PHOENIX_URL = "http://127.0.0.1:6006";

export type TracerProvider = ReturnType<typeof register>;

// Sends the coordinator's spans to Phoenix, under one project. Dev only: npm run chat
// calls it, the app doesn't. Spans are sent in batches, so call forceFlush() before the
// process ends.
export function startTracing(projectName: string): TracerProvider {
  return register({ projectName, url: PHOENIX_URL });
}
