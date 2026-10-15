import { supabase } from "./supabase";

// Calls our API with the signed-in user's token. getSession() renews the token first
// if it has expired.
export async function fetchApi(
  path: string,
  signal: AbortSignal,
): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const headers = new Headers();
  if (data.session !== null) {
    headers.set("Authorization", `Bearer ${data.session.access_token}`);
  }
  return fetch(path, { headers, signal });
}
