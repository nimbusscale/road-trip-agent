# Road Trip Planner: Which Tools Each Agent Sees (Agent SDK Test)

> **This is a research document, not a design document.** It records what the Claude Agent SDK did in a test. It does not make design decisions.

The question: when one of our tool servers is shared by the coordinator and the workers, can each agent be limited to just its own tools? "Limited" here means the other tools are not in the model's context at all, not just blocked when called.

The docs don't answer this clearly. The subagents page says a subagent with a tool list "gets only those," but also says background subagents "keep every MCP tool." So we tested it.

---

## 1. Method

- **SDK:** `@anthropic-ai/claude-agent-sdk` 0.3.283 (TypeScript), published 2026-09-25. Cases 13 and 16 were re-run on 0.3.296, the newest release on 2026-10-10, with the same results. Node 24. Models: Haiku for every agent.
- **Servers:** two in-process servers made with `createSdkMcpServer`, passed in the main `mcpServers` option. `trip` has `read_itinerary`, `add_stop_candidates`, and `add_stay_candidates`. `places` has `search_near` and `search_along_leg`. The tools do nothing. Case 15 runs the same tools as two stdio servers instead, each its own process (`stdio-server.mjs`).
- **What was measured:** a small local proxy sat between the SDK and the API, set with `ANTHROPIC_BASE_URL`. It recorded the tool names in every request sent to the model. The subagent's system prompt carried a marker, so its requests could be told apart from the main agent's. **A tool that isn't in the request is not in the model's context.** This doesn't rely on the model listing its own tools.
- **Each run:** the main agent calls one subagent once. Both reply with their tool names. Options common to every run: `tools: ["Agent"]`, `settingSources: []`, `permissionMode: "bypassPermissions"`, and, from case 6 on, `strictMcpConfig: true`.
- **The script** is in `scratch/tool-scoping-test/test.mjs`, with the stdio server beside it. That folder is git-ignored. Re-run it after an SDK upgrade, since this is SDK behavior that could change.

Each case ran once. The tool list sent to the model comes from configuration, not from the model, so it doesn't vary between runs.

---

## 2. Results

### 2.1 Subagents

| # | Subagent configuration | Tools in the subagent's requests |
|---|---|---|
| 1 | `tools: ["mcp__trip__add_stop_candidates"]` | `add_stop_candidates` only |
| 2 | Same, with `background: true` | `add_stop_candidates` only |
| 3 | No `tools`. `disallowedTools` names the other two trip tools | `Agent`, both places tools, `add_stop_candidates`, `read_itinerary` |
| 4 | `tools` names one trip tool and one places tool. `disallowedTools: ["mcp__places__*"]` | `add_stop_candidates` only |
| 11 | `mcpServers: ["places"]`, a string naming a server from the main options | Works. The server is shared with the main agent's connection |
| 7 | `mcpServers` holds an in-process server instance, not in the main options | **Broken.** No MCP server connected at all, including the main agent's `trip`. The subagent had no tools |

**A subagent's `tools` list works.** Listing one tool from a server gives the subagent that tool and nothing else from the server. This holds for background subagents too (case 2). The docs' "keep every MCP tool" line did not show up in practice.

**`disallowedTools` alone is the weaker choice for subagents** (case 3). It removes only what it names. Everything else is inherited, including the `Agent` tool and the other server's tools.

**Don't put an in-process server instance in a subagent's `mcpServers`** (case 7). Define every server in the main options and refer to it by name.

### 2.2 The main agent

| # | Main agent configuration | Tools in the main agent's requests |
|---|---|---|
| 5 | `allowedTools: ["mcp__trip__read_itinerary"]` | All five MCP tools |
| 6, 8 | `disallowedTools: ["mcp__trip__add_stay_candidates"]` | All five MCP tools, including the disallowed one |
| 9 | `disallowedTools: ["mcp__places__*"]` | All five MCP tools, including both places tools |
| 10 | Same as 6, and the main agent is told to call the disallowed tool | The call is refused: "Permission to use mcp__trip__add_stay_candidates has been denied." The tool's code never ran |
| 12 | `disallowedTools: ["WebFetch"]`, with no `tools` option | Every built-in tool except `WebFetch`, plus all five MCP tools |
| 14 | `tools: ["Agent", "mcp__trip__read_itinerary"]` | `Agent` and all five MCP tools |
| 15 | `disallowedTools: ["mcp__trip__add_stay_candidates", "mcp__places__*"]`, with **stdio** servers | `Agent`, `add_stop_candidates`, and `read_itinerary`. The denied tools are gone |
| 16 | The same as 15, with **in-process** servers | All five MCP tools |
| 13 | `agent: "coordinator"`, where the `coordinator` agent definition has `tools: ["Agent", "mcp__trip__read_itinerary"]` | `Agent` and `read_itinerary` only |

**`allowedTools` doesn't limit what the model sees** (case 5). It only skips the permission prompt.

**On the main agent, what `disallowedTools` does depends on the server type.**
- **Stdio servers:** the denied tools are removed from the model's context (case 15). This matches the SDK reference, which says a bare name "removes the tool from Claude's context."
- **In-process servers:** the denied tools stay in the model's context. Calls to them are refused, and the tool's code never runs (cases 6, 8, 9, 10, 16). This looks like an SDK bug, since the docs don't mention the difference.
- **Built-in tools** are removed either way (case 12).

**The top-level `tools` option doesn't filter MCP tools** (case 14). The docs say the same.

**Running the main thread as a named agent definition does filter MCP tools** (case 13). The `agent` option picks an entry from `agents` to run as the main thread. That agent's `tools` list then works the same way it does for a subagent.

### 2.3 Other findings

- **A main-agent `disallowedTools` entry also removes the tool from subagents** (case 6). The subagent, which had no `tools` list, did not get `add_stay_candidates`.
- **Without a `tools` option, the main agent gets every Claude Code built-in tool** (case 8): `Bash`, `Edit`, `Write`, `WebFetch`, `Workflow`, and about 20 more.
- **Without `strictMcpConfig: true`, the SDK loads MCP servers from outside our code.** Cases 1 to 5 ran on a machine logged in to claude.ai, and the main agent's tools included that account's Claude Docs connector. `strictMcpConfig: true` limits the servers to the ones passed in the options.

---

## 3. What this means for the design

These are inputs for the design docs, not decisions:

- Every agent, including the coordinator, can be an agent definition with a `tools` list. That one mechanism gives each agent exactly its own tools, whichever server they come from. It worked with in-process servers for both the main agent and subagents (cases 1, 13), and with stdio servers for a subagent (case 15). It doesn't depend on the bug in 2.2.
- Servers can then be split by job, as discussed, without regard to which agent uses them.
- Set `strictMcpConfig: true`, and give each agent a `tools` list, so no built-in or outside tool slips in.
