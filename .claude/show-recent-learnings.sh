#!/bin/sh
# SessionStart hook — surfaces the tail of LEARNINGS.md so every new
# session (and every subagent spawn) sees the most recent gotchas
# without having to remember to open the file.
#
# Output is injected as additional context at session start.

set -e

FILE="${CLAUDE_PROJECT_DIR:-.}/LEARNINGS.md"
[ -f "$FILE" ] || exit 0

# How many most-recent dated entries to surface. Each entry is prefixed
# by `## YYYY-MM-DD`. Four entries keeps the injection small (~1-2KB).
ENTRIES=4

# Reverse-scan the file to find the start byte of the Nth-from-last
# `## YYYY-MM-DD` line, then print from that line to EOF. awk-only; no
# tac dependency (macOS doesn't ship tac by default).
START_LINE=$(
  awk '/^## [0-9]{4}-[0-9]{2}-[0-9]{2}/ { push(NR) }
       END { for (i = n - '"$ENTRIES"' + 1; i <= n; i++) if (i >= 1) { print lines[i]; exit } }
       function push(ln) { n++; lines[n] = ln }' "$FILE"
)

echo ""
echo "## Recent learnings (from LEARNINGS.md)"
echo ""
if [ -n "$START_LINE" ]; then
  awk -v start="$START_LINE" 'NR >= start' "$FILE"
else
  cat "$FILE"
fi
echo ""
echo "— Full log in LEARNINGS.md. When you hit something non-obvious, append a new entry there before moving on."
