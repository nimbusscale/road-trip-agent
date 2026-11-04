# Simulated users

A **simulated user** is a coding agent harness, such as Claude Code, Codex, or opencode, running a chosen model, that plays a user planning a trip. It chats with the app through `npm run live-chat`, the terminal client that does what the browser does. Its sessions are recorded like any other, for the agent evaluations (#53).

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

## Which site

`road-trip-agent-local`, the local Phoenix project, is for development, and its traces are throwaway. `road-trip-agent`, the server's project, holds the sessions to be evaluated (systems design, section 10). So a run that tries out a change to a trip file, a persona, or these instructions plays against the local stack. A run recorded for the evaluations plays against the live site.

For the local stack, start Postgres, the Phoenix tunnel, and `npm run dev` first (DEVELOPMENT.md section 2).

## Add a bot user

Do this once for each harness and model pair.

1. In the Supabase dashboard, add a user with a password (systems design, section 3). Name its email for the harness and model, such as `codex-gpt-5@jjk3.com`.
2. Write its email and password in `~/tmp/road-trip-sims/accounts/<bot user>.env`, outside the repo, so they can't be committed. The bot user's name is the email's part before the `@`, such as `codex-gpt-5`.

   ```sh
   LIVE_CHAT_EMAIL=codex-gpt-5@jjk3.com
   LIVE_CHAT_PASSWORD=<its password>
   ```

3. Get its user ID. Set up any run for it (below), and in the run folder, run `./chat.sh whoami`. It prints the user ID and email.
4. Add a line for it to `bot-users.md`, and commit it. Phoenix shows only the user's ID, so this list is how a session is traced back to who played it. No passwords in it.

## Set up a run

```sh
npm run sim-setup -- <bot user> <trip> <persona> <local | live>
```

Example: `npm run sim-setup -- claude-code-sonnet san-francisco easygoing local`. The trip and persona are file names in `trips/` and `personas/`, without `.md`. The last argument is the site: `local` for `npm run dev`, or `live` for the live site.

It makes the run folder `~/tmp/road-trip-sims/<bot user>-<trip>-<persona>/`, such as `~/tmp/road-trip-sims/claude-code-sonnet-san-francisco-easygoing/`. It stops if that folder is already there, so an old run's files never mix with a new one. Remove the old folder first to play the same three again. The folder gets:

- `instructions.md`, and copies of the trip file and the persona file, named plainly `trip.md` and `persona.md`, so nothing hints at other trips.
- `account.env`, the bot user's email and password, plus `LIVE_CHAT_SITE` for the site.
- `chat.sh`, which loads `account.env` and runs `npm run live-chat` in the repo, passing its arguments and standard input through. Values set in the shell win over the repo's `.env`, so the bot user's values are the ones used. It also refuses to start while another `chat.sh` command in the run is still going, since a harness can run several at once, but a person clicks one thing at a time. It uses `flock`, which Linux has.

## Start a harness

Start each harness in the run folder. A folder inside the repo would load the repo's `CLAUDE.md`, which talks about the app's design. Some harnesses also load Joe's own `~/.claude/CLAUDE.md`, so each start command below keeps it out.

| Harness | Start command, in the run folder |
|---|---|
| Claude Code | `CLAUDE_CONFIG_DIR=~/tmp/road-trip-sims/.claude claude --model <model>`. Its own config folder keeps out Joe's `CLAUDE.md`, settings, and memory. Sign in once in that config folder |
| Codex | `codex -m <model>`. It reads only `AGENTS.md`, and Joe has none |
| opencode | `OPENCODE_DISABLE_CLAUDE_CODE=1 opencode -m <model>`. Without the variable, opencode falls back to `~/.claude/CLAUDE.md` when it has no `AGENTS.md` of its own |

Give every harness the same opening prompt:

```
Read instructions.md, trip.md, and persona.md, then plan the trip.
```

The simulated user stops when the trip file says the trip is planned. Its final answer gives the trip ID and each session ID. Look the sessions up in Phoenix by the bot user's ID.

**Claude Code can run headless,** with no one at the keyboard. Give the opening prompt on standard input, since `--allowedTools` takes a list, and would read a prompt after it as one more tool:

```sh
echo "Read instructions.md, trip.md, and persona.md, then plan the trip." \
  | CLAUDE_CONFIG_DIR=~/tmp/road-trip-sims/.claude claude -p --model sonnet \
      --allowedTools "Bash(./chat.sh:*)" --output-format stream-json --verbose \
  > run.jsonl
```

`--allowedTools` lets it run `./chat.sh` and nothing else that needs permission. `--output-format stream-json --verbose` writes each step to `run.jsonl` as it happens, so the run can be watched. Write `run.jsonl` outside the run folder, or the simulated user can read its own log.

## Check a new harness's command timeout

A turn with workers can take about 4 minutes, so the harness has to let a shell command it waits on run at least 5 minutes. Check this once for each new harness. Ask it to run this in the foreground, without setting a timeout itself:

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

## Add a trip or a persona

A trip file goes in `trips/`, and has these sections: what the user knows, what they haven't decided, the changes to make along the way, and when the trip is planned. Changes happen in one sitting. A change may start a new session right away, but never on a later day, since nothing fakes the date. `trips/san-francisco.md` is the example.

A persona file goes in `personas/`. It holds only how the user talks and acts, with nothing about any one trip. `personas/easygoing.md` is the example.
