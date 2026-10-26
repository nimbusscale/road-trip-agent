// Phoenix's UI, through Joe's SSH tunnel (DEVELOPMENT.md section 2). The browser opens
// it at this address from the local and the live site alike, so the links work only on
// his machine, with the tunnel up (systems design section 10).
const PHOENIX_UI = "http://127.0.0.1:6006";

// Phoenix finds the trace, and its project, from the turn span's ID.
export function traceLink(spanId: string): string {
  return `${PHOENIX_UI}/redirects/spans/${spanId}`;
}

export function sessionLink(agentSessionId: string): string {
  return `${PHOENIX_UI}/redirects/sessions/${agentSessionId}`;
}
