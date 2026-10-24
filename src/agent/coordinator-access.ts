import type { Env } from "../config/env.schema.js";
import type { Settings } from "../config/settings.schema.js";
import type { Connectable, Queryable } from "../persistence/queryable.js";
import { TranscriptAdapter } from "../persistence/transcript-adapter.js";
import { TranscriptRepository } from "../persistence/transcript-repository.js";
import { memoryAccessFor } from "../tools/memory-server.js";
import { placesAccessFor } from "../tools/places-server.js";
import { routingAccessFor } from "../tools/routing-server.js";
import { tripAccessFor } from "../tools/trip-access.js";
import { claudeProcessEnv } from "./claude-env.js";
import type { CoordinatorGiven } from "./coordinator.js";

export interface CoordinatorAccessGiven {
  env: Env;
  pool: Connectable & Queryable;
  settings: Settings;
  // The app's environment, which the Claude Code process starts from.
  processEnv: Readonly<Record<string, string | undefined>>;
}

// What every coordinator turn is given, made once when the app or the terminal chat
// starts.
export function coordinatorAccessFor(
  given: CoordinatorAccessGiven,
): CoordinatorGiven {
  const { env, pool, settings, processEnv } = given;
  return {
    settings,
    processEnv: claudeProcessEnv(processEnv, env.claudeCodeOauthToken),
    trip: tripAccessFor({ env, pool, settings }),
    memory: memoryAccessFor({ pool, settings }),
    places: placesAccessFor({ env, pool }),
    routing: routingAccessFor({ env, pool, settings }),
    transcripts: new TranscriptAdapter({
      pool,
      makeStore: (connection) => new TranscriptRepository(connection),
    }),
  };
}
