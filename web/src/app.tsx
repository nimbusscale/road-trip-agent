import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

import { ChatPage } from "./chat-page";
import { HealthStatus } from "./health-status";
import { HomePage } from "./home-page";
import { pathOf, type Route, useRoute } from "./route";
import { SignInPage } from "./sign-in-page";
import { supabase } from "./supabase";
import { TripPage } from "./trip-page";

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
        <SignedIn key={session.user.id} />
      )}
      <HealthStatus />
    </>
  );
}

function SignedIn() {
  const route = useRoute();
  return (
    <>
      <button type="button" onClick={() => void signOut()}>
        Sign out
      </button>
      <Page key={pathOf(route)} route={route} />
    </>
  );
}

function Page({ route }: { route: Route }) {
  switch (route.page) {
    case "home":
      return <HomePage />;
    case "trip":
      return <TripPage tripId={route.tripId} />;
    case "newTrip":
    case "newSession":
    case "session":
      return <ChatPage start={route} />;
  }
}

// Drops the session in this browser only (systems design section 3).
async function signOut(): Promise<void> {
  await supabase.auth.signOut({ scope: "local" });
}
