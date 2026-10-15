import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

import { HealthStatus } from "./health-status";
import { SignedInPage } from "./signed-in-page";
import { SignInPage } from "./sign-in-page";
import { supabase } from "./supabase";

// Shows the sign-in page until a user signs in, and again after they sign out.
export function App() {
  // undefined until Supabase has read any saved session from the browser.
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    // Called at once with the saved session, then on each sign-in, sign-out, and
    // token renewal.
    const { data } = supabase.auth.onAuthStateChange((event, changed) => {
      setSession(changed);
    });
    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  return (
    <>
      <h1>Road Trip Planner</h1>
      {session === undefined ? null : session === null ? (
        <SignInPage />
      ) : (
        <SignedInPage key={session.user.id} />
      )}
      <HealthStatus />
    </>
  );
}
