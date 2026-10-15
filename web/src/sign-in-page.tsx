import { useState, type SubmitEvent } from "react";

import { supabase } from "./supabase";

// Email and password only. Users are added in the Supabase dashboard, so there's no
// sign-up (functional spec section 3).
export function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  async function signIn(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSigningIn(true);
    const result = await supabase.auth.signInWithPassword({ email, password });
    setSigningIn(false);
    // On success, the app sees the new session and leaves this page.
    setError(result.error === null ? null : result.error.message);
  }

  return (
    <form onSubmit={(event) => void signIn(event)}>
      <h2>Sign in</h2>
      <p>
        <label>
          Email{" "}
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
            }}
          />
        </label>
      </p>
      <p>
        <label>
          Password{" "}
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
            }}
          />
        </label>
      </p>
      {error === null ? null : <p role="alert">{error}</p>}
      <button type="submit" disabled={signingIn}>
        Sign in
      </button>
    </form>
  );
}
