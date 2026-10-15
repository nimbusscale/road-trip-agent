#!/usr/bin/env bash
# Claude Code runs this after each Edit or Write (DEVELOPMENT.md section 6).
# It formats and lints the changed file. Exit code 2 sends stderr back to Claude Code.
set -uo pipefail

file_path=$(jq -r '.tool_input.file_path // empty')
case "$file_path" in
  *.ts | *.tsx) ;;
  *) exit 0 ;;
esac

cd "$CLAUDE_PROJECT_DIR" || exit 1

if ! output=$(node_modules/.bin/prettier --write "$file_path" 2>&1); then
  printf 'Prettier failed on %s:\n%s\n' "$file_path" "$output" >&2
  exit 2
fi

if ! output=$(node_modules/.bin/eslint --max-warnings 0 --no-warn-ignored "$file_path" 2>&1); then
  printf 'ESLint failed on %s:\n%s\n' "$file_path" "$output" >&2
  exit 2
fi
