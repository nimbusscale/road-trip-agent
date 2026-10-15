import { useEffect, useState } from "react";

import { healthResponseSchema } from "../../src/shared/health.schema";

type Status = "checking" | "apiUnreachable" | "reachable" | "unreachable";

const MESSAGES: Record<Status, string> = {
  checking: "Checking the API and the database…",
  apiUnreachable: "The API can't be reached.",
  reachable: "The API and the database are reachable.",
  unreachable: "The API is reachable, but the database isn't.",
};

// Shows whether the API and the database can be reached, from GET /api/health.
export function HealthStatus() {
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    const controller = new AbortController();
    void fetchStatus(controller.signal).then((fetched) => {
      if (!controller.signal.aborted) {
        setStatus(fetched);
      }
    });
    return () => {
      controller.abort();
    };
  }, []);

  return <p role="status">{MESSAGES[status]}</p>;
}

async function fetchStatus(signal: AbortSignal): Promise<Status> {
  try {
    const response = await fetch("/api/health", { signal });
    // Any reply that isn't the health shape, such as a proxy's error page, means the
    // API itself didn't answer.
    const result = healthResponseSchema.safeParse(await response.json());
    return result.success ? result.data.database : "apiUnreachable";
  } catch {
    return "apiUnreachable";
  }
}
