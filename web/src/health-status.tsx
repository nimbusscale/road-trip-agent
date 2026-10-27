import { useEffect, useState } from "react";

import {
  type HealthResponse,
  healthResponseSchema,
} from "../../src/shared/health.schema";

// Whether the app can send turn traces to Phoenix, from GET /api/health, as a check or
// an X (functional spec 10.1). The chat works the same either way, so without this line
// lost traces would go unnoticed. Nothing shows until the API answers, or when it
// doesn't, since the trips list fails then too.
export function HealthStatus() {
  const [phoenix, setPhoenix] = useState<HealthResponse["phoenix"] | null>(
    null,
  );

  useEffect(() => {
    const controller = new AbortController();
    void fetchPhoenix(controller.signal).then((fetched) => {
      if (!controller.signal.aborted) {
        setPhoenix(fetched);
      }
    });
    return () => {
      controller.abort();
    };
  }, []);

  if (phoenix === null) {
    return null;
  }
  return (
    <p role="status">
      {phoenix === "reachable" ? (
        <span className="phoenix reachable">✓ Traces reach Phoenix.</span>
      ) : (
        <span className="phoenix unreachable">
          ✗ Phoenix can&apos;t be reached, so traces are lost.
        </span>
      )}
    </p>
  );
}

async function fetchPhoenix(
  signal: AbortSignal,
): Promise<HealthResponse["phoenix"] | null> {
  try {
    const response = await fetch("/api/health", { signal });
    // Any reply that isn't the health shape, such as a proxy's error page, means the
    // API itself didn't answer.
    const result = healthResponseSchema.safeParse(await response.json());
    return result.success ? result.data.phoenix : null;
  } catch {
    return null;
  }
}
