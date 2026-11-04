// The name the chat's "Working" line shows for a tool the coordinator calls, such as
// update_trip_brief, from mcp__trip__update_trip_brief. npm run live-chat prints it too.
export function shortToolName(name: string): string {
  return name.replace(/^mcp__[^_]+__/, "");
}
