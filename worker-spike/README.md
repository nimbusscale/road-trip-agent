# Worker spike (#182)

The code behind [research/agent-evaluations.md](../research/agent-evaluations.md) section 2.8. It lives only on the `spike/worker-182` branch, which is never merged. It doesn't pass `npm run check`, and isn't meant to.

It runs a coordinator on `claude-opus-5-5` and one fake worker, `stay-researcher`, on `claude-haiku-5-5`, with the hooks from section 2.8. The worker's tools keep their state in memory. There's no trip data, Postgres, or Google.

## Running it

It reads `CLAUDE_CODE_OAUTH_TOKEN` from the repo's `.env`, and signs in the way the app does.

```sh
cd worker-spike
npm install
npx tsx proxy.ts &        # logs each Messages API request body to proxy-log.jsonl
./run.sh <label> [options]
```

`run.sh` runs `spike.ts` once, saves its output to `runs/<label>.txt` and `runs/<label>.jsonl`, copies the proxy's log to `runs/<label>.proxy.jsonl`, and prints each model call's tool list. The session store writes transcripts to `store/`.

## Options

| Option | Does |
|---|---|
| `--message "<text>"` | The user's message. The default is "Fill the stops for the Moab stay." |
| `--bg-env` | Sets `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` |
| `--def-bg-false` | Sets `background: false` in the worker's definition |
| `--no-builtin` | Sets `CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS=1` |
| `--deny-fork` | Adds an `Agent(fork)` deny rule |
| `--worker-server <where>` | `ref` (default): in-process on the query, named in the definition. `ref-deny`: the same, with `mcp__worker` denied for the coordinator. `inline`: in-process in the definition. `http`: an HTTP server named in the definition |
| `--guard` | A `PreToolUse` hook refuses worker tool calls with no `agent_id` |
| `--worker-tools-list <list>` | `own` (default), `own+coordinator`, or `none` (left out) |
| `--coordinator-tools <set>` | `agent` (default) or `agent+trip` |
| `--worker-knows-report` | The worker's instructions say to call `report_result` |
| `--worker-skips-report` | The worker's instructions say not to call it unless told to |
| `--shape <shape>` | What the `Agent` hook returns: `object` (default), `string`, or `blocks` |
| `--crash-after-add` | Kills Claude Code and the spike 1.5 seconds after the first `add_stop_candidates` call |
| `--resume --session <id>` | Resumes that session from `store/` |
| `--drop-unfinished` | On resume, leaves out tool calls that have no result |
| `--wait <seconds>` | How long to wait after a result message for another one. The default is 3 |

## Examples

```sh
./run.sh sendback --bg-env --worker-skips-report
./run.sh two-env --bg-env --worker-knows-report --wait 90 --message "Fill the meal stops for the Moab stay and the Torrey stay."
./run.sh builtin-off --bg-env --worker-server http --no-builtin --message "Start general-purpose, Explore, Plan, claude, and fork."
./run.sh crash --bg-env --worker-knows-report --worker-server http --crash-after-add
./run.sh resume --bg-env --worker-knows-report --worker-server http --resume --session "$(cat runs/crash.session)" --message "We got cut off. Where are we with the Moab stay?"
```
