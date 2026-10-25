import { register } from "@arizeai/phoenix-otel";

import type { Env } from "../config/env.schema.js";

// A Phoenix that's down, or a tunnel that isn't up, fails the health check in this
// time, rather than holding up the page.
const CHECK_TIMEOUT_MILLISECONDS = 2000;

export type TracerProvider = ReturnType<typeof register>;

// Sends each turn's spans to Phoenix, under the project in the environment (systems
// design section 10). Spans are sent in batches, so call forceFlush() before the
// process ends. Spans that can't be sent are dropped, with no retry, and the turn
// goes on.
export function startTracing(env: Env): TracerProvider {
  return register({ projectName: env.phoenixProject, url: env.phoenixUrl });
}

// Whether the app can reach Phoenix, from Phoenix's own health check. It doesn't say
// whether a turn's spans arrived.
export async function isPhoenixReachable(phoenixUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${phoenixUrl}/healthz`, {
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MILLISECONDS),
    });
    return response.ok;
  } catch {
    return false;
  }
}
