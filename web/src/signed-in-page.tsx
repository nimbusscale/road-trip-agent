import { useEffect, useState } from "react";

import { meResponseSchema } from "../../src/shared/me.schema";
import { fetchApi } from "./fetch-api";
import { supabase } from "./supabase";

// For now, shows who the API says is signed in, from GET /api/me.
export function SignedInPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetchUserId(controller.signal).then((fetched) => {
      if (!controller.signal.aborted) {
        setUserId(fetched);
        setFailed(fetched === null);
      }
    });
    return () => {
      controller.abort();
    };
  }, []);

  return (
    <>
      <p>
        {failed
          ? "The API didn't accept the sign-in."
          : `Signed in as ${userId ?? "…"}`}
      </p>
      <button type="button" onClick={() => void signOut()}>
        Sign out
      </button>
    </>
  );
}

async function fetchUserId(signal: AbortSignal): Promise<string | null> {
  try {
    const response = await fetchApi("/api/me", signal);
    const result = meResponseSchema.safeParse(await response.json());
    return result.success ? result.data.userId : null;
  } catch {
    return null;
  }
}

// Drops the session in this browser only (systems design section 3).
async function signOut(): Promise<void> {
  await supabase.auth.signOut({ scope: "local" });
}
