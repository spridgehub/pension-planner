#!/bin/bash
# Twice-daily refresh (launchd com.spridge.pension-planner, 06:20 and 21:30): fetch market data,
# check it, test, rebuild, publish with ~/bin/ship and confirm the live site serves the new build.
# On any failure the last good data stays live and an alert goes to the netwatch ntfy topic
# (once per problem per 12 hours, plus a "fixed" message when it recovers).
set -uo pipefail
cd "$(dirname "$0")/.."
export PATH="/opt/homebrew/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
STATE="$HOME/Library/Logs/pension-planner-refresh.json"
SITE="https://spridgehub.github.io/pension-planner"
echo "=== refresh $(date '+%F %T')"

alert() {  # alert <status ok|fail> <message>
  local status="$1" msg="$2" topic last_status last_msg last_at now
  topic=$(cat "$HOME/projects/netwatch/ntfy-topic.txt" 2>/dev/null)
  now=$(date +%s)
  last_status=$(/usr/bin/python3 -c "import json;print(json.load(open('$STATE')).get('status',''))" 2>/dev/null)
  last_msg=$(/usr/bin/python3 -c "import json;print(json.load(open('$STATE')).get('msg',''))" 2>/dev/null)
  last_at=$(/usr/bin/python3 -c "import json;print(json.load(open('$STATE')).get('alerted',0))" 2>/dev/null || echo 0)
  local send=""
  if [ "$status" = fail ] && { [ "$last_status" != fail ] || [ "$msg" != "$last_msg" ] || [ $((now - ${last_at:-0})) -gt 43200 ]; }; then send="Pension Planner update FAILED: $msg"; fi
  if [ "$status" = ok ] && [ "$last_status" = fail ]; then send="Pension Planner update fixed: $msg"; fi
  local alerted="${last_at:-0}"
  if [ -n "$send" ] && [ -n "$topic" ]; then
    curl -s -m 20 -H "Title: Pension Planner" -H "Tags: chart_with_upwards_trend" -d "$send" "https://ntfy.sh/$topic" >/dev/null && alerted=$now
    echo "alert sent: $send"
  fi
  /usr/bin/python3 - "$STATE" "$status" "$msg" "$alerted" <<'PY'
import json, sys, time
p, status, msg, alerted = sys.argv[1:5]
json.dump({"status": status, "msg": msg, "alerted": int(alerted), "at": time.strftime("%Y-%m-%d %H:%M:%S")}, open(p, "w"))
PY
}
fail() { echo "FAILED: $1"; git checkout -q -- data/ docs/ dist/ 2>/dev/null; alert fail "$1"; exit 1; }

git pull -q --rebase origin main 2>/dev/null || echo "pull skipped"

problems=""
node scripts/fetch-market.js || problems="$problems BoE/ONS fetch;"
node scripts/fetch-assets.js || problems="$problems market prices fetch;"
stale=$(node -e "const a=JSON.parse(require('fs').readFileSync('data/assets.json'));process.stdout.write((a.stale||[]).join(', '))")
[ -n "$stale" ] && problems="$problems Yahoo series kept from last run ($stale);"
node scripts/check-data.js || fail "data check failed:$problems (kept yesterday's data live)"
npm test --silent >/tmp/pension-planner-test.log 2>&1 || fail "tests failed after refresh, see /tmp/pension-planner-test.log"

# Runs are timed outside Citrix hours; a catch-up run during a work day commits but holds the push.
if [ -x ~/bin/workhold ] && ~/bin/workhold -q; then
  ~/bin/ship . --hold -m "Data refresh $(date '+%Y-%m-%d %H:%M')" || fail "commit (ship --hold) failed"
  echo "work hours: push held until the next run"; exit 0
fi
~/bin/ship . -m "Data refresh $(date '+%Y-%m-%d %H:%M')" || fail "publish (ship) failed"

want=$(cat docs/build.txt)
for i in $(seq 1 40); do
  got=$(curl -s -m 15 "$SITE/build.txt?r=$RANDOM")
  [ "$got" = "$want" ] && break
  sleep 15
done
[ "$got" = "$want" ] || fail "live site not serving the new build after 10 minutes"
echo "live: $want"

if [ -n "$problems" ]; then alert fail "partly stale:$problems published with the last good data"; exit 1; fi
alert ok "published $(date '+%d %b %H:%M')"
