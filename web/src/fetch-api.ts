import { supabase } from "./supabase";

export interface ApiRequest {
  signal?: AbortSignal;
  method?: "GET" | "POST";
  // Sent as JSON.
  body?: unknown;
}

// Calls our API with the signed-in user's token. getSession() renews the token first
// if it has expired.
export async function fetchApi(
  path: string,
  request: ApiRequest = {},
): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const headers = new Headers();
  if (data.session !== null) {
    headers.set("Authorization", `Bearer ${data.session.access_token}`);
  }
  if (request.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(path, {
    method: request.method ?? "GET",
    headers,
    body: request.body === undefined ? null : JSON.stringify(request.body),
    signal: request.signal ?? null,
  });
}
