// A tool's name as the model sees it, such as mcp__trip__read_trip_brief (tool design,
// section 1). Each agent's definition lists its tools by these names (technical spec
// 6.5).
export function toolsOn(serverName: string, toolNames: string[]): string[] {
  return toolNames.map((toolName) => `mcp__${serverName}__${toolName}`);
}
