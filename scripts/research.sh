#!/bin/bash
# Monthly research refresh (launchd com.spridge.pension-planner.research, 1st of the month 05:15):
# headless Claude updates data/markets-research.json from published sources; scripts/check-data.js
# must pass or the old file is restored. Then the normal refresh publishes it.
set -uo pipefail
cd "$(dirname "$0")/.."
export PATH="/opt/homebrew/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
LOG="logs/research-$(date +%Y-%m).md"
mkdir -p logs
echo "=== research $(date '+%F %T')"
cp data/markets-research.json /tmp/markets-research.backup.json
TODAY=$(date +%Y-%m-%d)
PROMPT=$(sed "s/{{TODAY}}/$TODAY/g" scripts/research-prompt.md)

notify() { local topic; topic=$(cat "$HOME/projects/netwatch/ntfy-topic.txt" 2>/dev/null); [ -n "$topic" ] && curl -s -m 20 -H "Title: Pension Planner research" -d "$1" "https://ntfy.sh/$topic" >/dev/null; echo "$1"; }
restore() { cp /tmp/markets-research.backup.json data/markets-research.json; git checkout -q -- . ':!data/markets-research.json' 2>/dev/null; notify "Monthly research refresh rejected: $1. Kept last month's figures."; exit 1; }

claude -p "$PROMPT" --allowedTools "Read" "Edit(data/markets-research.json)" "Write(data/markets-research.json)" "WebSearch" "WebFetch" \
  --permission-mode dontAsk > "$LOG" 2>&1 || restore "claude exited with an error (see $LOG)"

# Only the research file may change.
other=$(git status --porcelain | grep -v ' data/markets-research.json$' | grep -v '^?? logs/' || true)
[ -z "$other" ] || restore "it changed other files: $other"
node scripts/check-data.js research || restore "the new file failed the data checks"
git diff --quiet data/markets-research.json && { echo "no changes"; exit 0; }

git add data/markets-research.json && git commit -q -m "Monthly research refresh $TODAY" && echo "committed"
notify "Monthly research refresh done: $(git diff --stat HEAD~1 -- data/markets-research.json | tail -1). Summary in $LOG."
scripts/daily.sh
