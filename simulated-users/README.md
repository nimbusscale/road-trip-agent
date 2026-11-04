# Simulated users

A **simulated user** is a coding agent harness, such as Claude Code, Codex, or opencode, running a chosen model, that plays a user planning a trip. It chats with the app through `npm run live-chat`, the terminal client that does what the browser does. Its sessions are recorded like any other, for the agent evaluations (#53).

Run a simulated user only when Joe asks for one, or an issue does. A run plays a whole trip on the app's Claude plan, and on the live site its sessions go into the corpus the evaluations use.

Terms:

- **Harness:** the coding agent program that runs the model, such as Claude Code, Codex, or opencode.
- **Bot user:** a Supabase user made for one harness and model pair. Its email is named harness-model, such as `claude-code-sonnet@jjk3.com`. Each turn's span in Phoenix has the user's ID (`user.id`), so the bot user tells which harness and model played a session.
- **Trip file:** what the user knows and does on one trip: the facts, what's not decided yet, the changes partway through, and when the trip counts as planned. The facts are also an answer key, to check what the coordinator saved to the trip brief.
- **Persona file:** how the user talks and acts, on any trip, such as curt or easygoing. A run pairs one trip file with one persona file, so any persona can play any trip.
- **Run folder:** a folder outside the repo, made for one run of one bot user on one trip with one persona. The harness starts there, and the folder holds only what that run needs.

This folder holds:

| File | What it is |
|---|---|
| `instructions.md` | What every simulated user gets: how to use `./chat.sh`, and how to act |
| `trips/` | One trip file per trip |
| `personas/` | One persona file per persona |
| `bot-users.md` | Each bot user's ID with its email |

This README has two parts. Joe does the first, since it needs his accounts and passwords. Claude Code does the second. When a step in Joe's part hasn't been done, such as a new harness with no bot user yet, stop and ask Joe.

---

# What Joe does

## Add a bot user

Do this once for each harness and model pair.

1. In the Supabase dashboard, add a user with a password (systems design, section 3). Name its email for the harness and model, such as `codex-gpt-5@jjk3.com`.
2. Write its email and password in `~/tmp/road-trip-sims/accounts/<bot user>.env`, outside the repo, so they can't be committed. The bot user's name is the email's part before the `@`, such as `codex-gpt-5`.

   ```sh
   LIVE_CHAT_EMAIL=codex-gpt-5@jjk3.com
   LIVE_CHAT_PASSWORD=<its password>
   ```

3. Sign the harness in, if it's new. Claude Code signs in once in its own config folder, `~/tmp/road-trip-sims/.claude/` (Start a harness, below). Codex uses Joe's own sign-in, in `~/.codex/`, so it needs nothing here.

Then Claude Code adds the bot user to `bot-users.md`, and checks the harness.

---

# What Claude Code does

## Add a bot user to the list

Set up any run for the bot user (below). In the run folder, run `./chat.sh whoami`. It prints the user ID and email. Add a line for it to `bot-users.md`, with the harness and model. Phoenix shows only the user's ID, so this list is how a session is traced back to who played it. No passwords in it.

## Check a new harness

Do these once for each new harness, before its first full run.

**It can run `chat.sh`.** Start the harness in a run folder, and ask it to run `./chat.sh whoami`. It should print the bot user's ID. Some harnesses run commands in a sandbox that can block the network, or keep them inside the working folder. `chat.sh` needs both the network and `npm` in the repo. If it fails, find the harness's setting that allows them.

**Its command timeout is long enough.** A turn with workers can take about 4 minutes, so the harness has to let a shell command it waits on run at least 5 minutes. Ask it to run this in the foreground, without setting a timeout itself:

```sh
python3 -c 'import time; time.sleep(330)'; echo done
```

If it doesn't print "done", raise the harness's command timeout in its settings, and try again. Don't use `sleep` for the check: Claude Code refuses a foreground `sleep`, and runs it in the background, where there's no limit to test.

Claude Code cuts a command off after 2 minutes by default. Its config folder's `settings.json`, `~/tmp/road-trip-sims/.claude/settings.json`, raises that:

```json
{
  "env": { "BASH_DEFAULT_TIMEOUT_MS": "600000", "BASH_MAX_TIMEOUT_MS": "600000" }
}
```

Checked on 2026-11-04 with Claude Code 2.1.318.

Codex needs no setting. It let the command run the whole 5½ minutes, and checked on it a few times while it waited. Checked on 2026-11-04 with Codex CLI 0.166.0.

**It leaves a log of the run.** Checking a run needs each command the simulated user ran, and what came back (Check a run, below). Find the harness's way to write that log, such as Claude Code's `--output-format stream-json`, and add it to "Start a harness". Without a log, `./chat.sh open <session ID>` prints a session's chat, but not what the simulated user read from `cards` and `itinerary`, or the commands the harness refused.

## Pick the site

`road-trip-agent-local`, the local Phoenix project, is for development, and its traces are throwaway. `road-trip-agent`, the server's project, holds the sessions to be evaluated (systems design, section 10). So a run that tries out a change to a trip file, a persona, or the instructions plays against the local stack. A run recorded for the evaluations plays against the live site.

For the local stack, start Postgres, the Phoenix tunnel, and `npm run dev` first (DEVELOPMENT.md section 2).

## Set up a run

```sh
npm run sim-setup -- <bot user> <trip> <persona> <local | live>
```

Example: `npm run sim-setup -- claude-code-sonnet san-francisco easygoing local`. The trip and persona are file names in `trips/` and `personas/`, without `.md`. The last argument is the site: `local` for `npm run dev`, or `live` for the live site.

It makes the run folder `~/tmp/road-trip-sims/<bot user>-<trip>-<persona>/`, such as `~/tmp/road-trip-sims/claude-code-sonnet-san-francisco-easygoing/`. The name doesn't include the site, so a local run and a live run of the same three use the same folder. It stops if that folder is already there, so an old run's files never mix with a new one. Remove the old folder first, such as one left from a local run, or from a run that failed. The folder gets:

- `instructions.md`, and copies of the trip file and the persona file, named plainly `trip.md` and `persona.md`, so nothing hints at other trips.
- `account.env`, the bot user's email and password, plus `LIVE_CHAT_SITE` for the site.
- `chat.sh`, which loads `account.env` and runs `npm run live-chat` in the repo, passing its arguments and standard input through. Values set in the shell win over the repo's `.env`, so the bot user's values are the ones used. It also refuses to start while another `chat.sh` command in the run is still going, since a harness can run several at once, but a person clicks one thing at a time. It uses `flock`, which Linux has.

## Start a harness

Start each harness in the run folder. A folder inside the repo would load the repo's `CLAUDE.md`, which talks about the app's design. Some harnesses also load Joe's own `~/.claude/CLAUDE.md`, so each start command below keeps it out.

| Harness | Start command, in the run folder |
|---|---|
| Claude Code | `CLAUDE_CONFIG_DIR=~/tmp/road-trip-sims/.claude claude --model <model>`. Its own config folder keeps out Joe's `CLAUDE.md`, settings, and memory |
| Codex | `codex --ignore-user-config --ignore-rules -m <model> -s workspace-write -c sandbox_workspace_write.network_access=true`. It reads only `AGENTS.md`, and Joe has none. The flags are explained under its headless start, below |
| opencode | `OPENCODE_DISABLE_CLAUDE_CODE=1 opencode -m <model>`. Without the variable, opencode falls back to `~/.claude/CLAUDE.md` when it has no `AGENTS.md` of its own |

Give every harness the same opening prompt:

```
Read instructions.md, trip.md, and persona.md, then plan the trip.
```

The simulated user stops when the trip file says the trip is planned. Its final answer gives the trip ID and each session ID, and anything that went wrong.

**Claude Code can run headless,** with no one at the keyboard. Give the opening prompt on standard input, since `--allowedTools` takes a list, and would read a prompt after it as one more tool:

```sh
echo "Read instructions.md, trip.md, and persona.md, then plan the trip." \
  | CLAUDE_CONFIG_DIR=~/tmp/road-trip-sims/.claude claude -p --model sonnet \
      --allowedTools "Bash(./chat.sh:*)" --output-format stream-json --verbose \
  > run.jsonl
```

`--allowedTools` lets it run `./chat.sh` and nothing else that needs permission. `--output-format stream-json --verbose` writes each step to `run.jsonl` as it happens, so the run can be watched, and each command it ran and what came back can be read afterward. Write `run.jsonl` outside the run folder, or the simulated user can read its own log.

**Codex can run headless too,** with `codex exec`. The `-` at the end reads the opening prompt from standard input:

```sh
echo "Read instructions.md, trip.md, and persona.md, then plan the trip." \
  | codex exec --ignore-user-config --ignore-rules --skip-git-repo-check \
      -m gpt-6.1-terra -s workspace-write \
      -c sandbox_workspace_write.network_access=true --json - \
  > run.jsonl
```

- `--ignore-user-config` and `--ignore-rules` leave out Joe's `~/.codex/config.toml` and its rules, which turn on plugins and an MCP server a simulated user shouldn't have, such as a browser. Codex still signs in with Joe's account.
- `-s workspace-write` lets commands write only in the run folder. Network access is off in that sandbox by default, and `chat.sh` needs it, so the `-c` setting turns it on.
- `--skip-git-repo-check` lets it start in the run folder, which isn't a Git repo.
- `--json` writes each step to `run.jsonl` as it happens.

Codex can't be limited to `./chat.sh` the way Claude Code is. It reads files with shell commands, such as `cat trip.md`, so it has to be allowed to run them. The sandbox keeps it from changing anything outside the run folder, but not from reading outside it. So when checking a Codex run, look in the log for any command other than `./chat.sh` that reads a file outside the run folder.

**Other harnesses may have a headless mode too,** such as `opencode run`. Check it the first time it's used, and add its command here. It needs the same three things: only `./chat.sh` is allowed, or failing that, nothing outside the run folder can be changed. Each command and its output goes to a log. The log is outside the run folder.

**Run up to two at a time, each as a different bot user,** such as a Claude Code run and a Codex run. "Check a run" finds a run's turns in Phoenix by the bot user's ID, so two runs as the same bot user would mix their turns. Someone else may be using the live site during a run, such as Joe planning a real trip. That's fine. Their turns are kept apart from the run's by user ID.

## Check a run

**Read the run's log first.** It shows each message the simulated user sent, each card it clicked, and what came back, so the first two checks below are judged on it. In Claude Code's `run.jsonl`, each line is one JSON event. The commands are the `tool_use` items in `assistant` events, and their output is the `tool_result` items in the `user` events after them. The last line, of type `result`, holds the simulated user's final note, its number of turns, and its cost. In Codex's `run.jsonl`, the commands are the `item.completed` events whose item is a `command_execution`, with the command and its `aggregated_output`. The simulated user's own words are the `agent_message` items, and the last one is its final note. Codex logs tokens, not a cost. A short script that prints the commands and their output in order makes the log easy to read.

The final note is the simulated user's own account, so check it against the log. It can be wrong, such as blaming the planner for a mix-up that was its own.

**Find its sessions in Phoenix by the bot user's ID.** Bring up the Phoenix tunnel (DEVELOPMENT.md section 2). Then read the spans from Phoenix's REST API, from the time the run started, such as:

```sh
curl -s "http://127.0.0.1:6006/v1/projects/road-trip-agent/spans?start_time=2026-11-04T19:59:00Z&limit=1000"
```

For a local run, the project is `road-trip-agent-local`. A reply with a `next_cursor` has more pages: pass it back as `cursor`. Each span has a `name`, a `status_code`, and a `context.trace_id`. Its `attributes` hold `user.id`, `session.id`, `input.value`, and `output.value`.

- Keep only the traces whose `coordinator.turn` span has the bot user's `user.id`, from `bot-users.md`. Other people's turns are in the same project. A worker's spans, such as `stay-researcher.turn`, have no `user.id`, but they're in the same trace as the coordinator turn that started them.
- Phoenix's `session.id` is the agent session ID, not the session ID `chat.sh` prints. To match them, go by time: a new session's turns start after the last turn of the session before it.

**Judge the run against the trip file, not against an earlier run.** Live places and the coordinator's choices change from run to run, so two good runs can end with different hotels. What to check:

- **The simulated user stuck to the trip file.** It didn't make up a fact that contradicts it, such as a different budget. Where the trip file has no answer, a made-up one that fits the trip is fine.
- **It acted like a user, as its persona says.** It made the trip file's changes at the right points. Unless the persona says otherwise, it gave one or two facts at a time, and answered only what was asked.
- **The trip brief matches the trip file's facts.** Read the brief as it ended, from the last `mcp__trip__read_trip_brief` span, whose `output.value` holds the whole brief. A trip file whose last change starts a new session gives one: the coordinator reads the brief on a session's first turn. Don't check it from an earlier turn, since a change can move an item and move it back, such as a trip length that goes up a day and back down. Some facts are kept in the itinerary instead, such as the start date and the end place. Check those in the last itinerary in the log, or run `./chat.sh itinerary <session ID>` in the run folder. When a fact is missing from the brief, check the log for whether the simulated user gave it, and as what. Example: a must-see it only asked for as a dessert stop becomes a stop, not a must-see.

**Expect the coordinator to handle a change in more than one good way.** The same request can get different good answers. Example: asked to spend longer at a stop, it may trim the time a little to keep dinner on time, or ask first. Either is fine.

**Expect small slips from the simulated user too.** A slip it recovers from isn't a failure, such as a command the harness refused, or a fact it held back and gave later. Note it in the results. A run fails a check only when the simulated user broke the trip file or the instructions, or the brief doesn't match.

**Look at the refused tool calls,** the spans whose `status_code` is `ERROR`. When an agent fixes its call and goes on, that's agent behavior, not an app bug. If the same refusal comes up again and again, it's worth a Triage issue.

**File an app bug when it matters to the app:** it changes what the agents see or do, or what a real user sees on the page. A flaw only in what `live-chat` prints, which no agent reads, is worth filing only if it misled the simulated user.

**Mark a run that fails a check** with a session annotation in Phoenix, saying it isn't for evaluation, since a failed run stays in Phoenix. If it failed because of the setup, fix the setup, the trip file, the persona file, or the instructions, and run again.

**Write the results in the run's issue,** as a comment. Give the trip and session IDs, the Phoenix session IDs, each check's result with any slips, and the issues filed. Don't add a run's details to this README, or to any other file used across runs. A run needs a PR only when the setup, a trip file, a persona file, or the instructions change.

## Add a trip or a persona

A trip file goes in `trips/`, and has these sections: what the user knows, what they haven't decided, the changes to make along the way, and when the trip is planned. `trips/san-francisco.md` is the example.

- **Write each change as something the user does, or a reaction to what the coordinator says.** Never count on a check result or a place the live data may not give. Example: "If the planner says a place is closed when you'd get there, ask to move it to the morning," not "Milt's is closed when you arrive."
- **Changes happen in one sitting.** A change may start a new session right away, but never on a later day, since nothing fakes the date.
- **End with a new session that asks what's left to decide.** It shows what the coordinator says at the start of a session, and gives a final read of the trip brief to check.
- **Give the simulated user a limit,** such as stopping after 80 messages, so a stuck run can't go on and on.
- **Leave how the user gives facts to the persona,** such as one at a time or most at once. A trip file says which facts the user has, not how fast it gives them, so any persona can play it.

A persona file goes in `personas/`. It holds only how the user talks and acts, with nothing about any one trip. `personas/easygoing.md` is the example. Give each new persona something the others don't make the coordinator do, such as the over-sharer's first message, which gives most of the trip at once.
