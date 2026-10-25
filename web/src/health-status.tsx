import { useEffect, useState } from "react";

import {
  type HealthResponse,
  healthResponseSchema,
} from "../../src/shared/health.schema";

type Status = "checking" | "apiUnreachable" | HealthResponse["database"];

interface Health {
  status: Status;
  // null until the API answers, or when it doesn't.
  phoenix: HealthResponse["phoenix"] | null;
}

const MESSAGES: Record<Status, string> = {
  checking: "Checking the API and the database…",
  apiUnreachable: "The API can't be reached.",
  reachable: "The API and the database are reachable.",
  unreachable: "The API is reachable, but the database isn't.",
};

// Shows whether the API and the database can be reached, from GET /api/health. Next to
// it, a check or an X shows whether the app can send traces to Phoenix (functional spec
// 10.1).
export function HealthStatus() {
  const [health, setHealth] = useState<Health>({
    status: "checking",
    phoenix: null,
  });

  useEffect(() => {
    const controller = new AbortController();
    void fetchHealth(controller.signal).then((fetched) => {
      if (!controller.signal.aborted) {
        setHealth(fetched);
      }
    });
    return () => {
      controller.abort();
    };
  }, []);

  return (
    <p role="status">
      {MESSAGES[health.status]}
      {health.phoenix === null ? null : (
        <PhoenixMark reachable={health.phoenix === "reachable"} />
      )}
    </p>
  );
}

function PhoenixMark({ reachable }: { reachable: boolean }) {
  return reachable ? (
    <span className="phoenix reachable"> ✓ Traces reach Phoenix.</span>
  ) : (
    <span className="phoenix unreachable">
      {" "}
      ✗ Phoenix can't be reached, so traces are lost.
    </span>
  );
}

async function fetchHealth(signal: AbortSignal): Promise<Health> {
  try {
    const response = await fetch("/api/health", { signal });
    // Any reply that isn't the health shape, such as a proxy's error page, means the
    // API itself didn't answer.
    const result = healthResponseSchema.safeParse(await response.json());
    return result.success
      ? { status: result.data.database, phoenix: result.data.phoenix }
      : { status: "apiUnreachable", phoenix: null };
  } catch {
    return { status: "apiUnreachable", phoenix: null };
  }
}
