#!/bin/bash
# Publish Pension Planner to GitHub + GitHub Pages from a laptop on the tailnet.
# Copies the repo from the Mac mini over Tailscale SSH, then creates/pushes with the
# laptop's own GitHub login (the Mac mini's keychain can't be read by Claude sessions).
#
#   bash publish-github.sh
#
# Needs: Tailscale connected, the GitHub CLI (installed below via Homebrew if missing).
set -euo pipefail

MINI="ianspridgeon@100.122.51.100"                       # Mac mini on the tailnet
SRC="/Users/ianspridgeon/projects/retirement-engine"     # repo on the Mac mini
DEST="$HOME/pension-planner"                             # copy on this laptop
REPO="spridgehub/pension-planner"

echo "1/4  Fetching the project from the Mac mini over Tailscale…"
if [ -d "$DEST/.git" ]; then
  git -C "$DEST" pull --ff-only "ssh://$MINI$SRC" main
else
  git clone --origin mini "ssh://$MINI$SRC" "$DEST"
fi
cd "$DEST"

echo "2/4  Checking the GitHub CLI and login…"
command -v gh >/dev/null || { command -v brew >/dev/null && brew install gh; }
command -v gh >/dev/null || { echo "Install the GitHub CLI first: https://cli.github.com"; exit 1; }
gh auth status >/dev/null 2>&1 || gh auth login --hostname github.com --git-protocol https --web
gh auth setup-git

echo "3/4  Creating the public repo (if needed) and pushing…"
if gh repo view "$REPO" >/dev/null 2>&1; then
  gh repo edit "$REPO" --visibility public --accept-visibility-change-consequences >/dev/null 2>&1 || true
else
  gh repo create "$REPO" --public --description "UK retirement income engine and dashboard: annuities, drawdown, 125 years of backtests"
fi
git remote get-url origin >/dev/null 2>&1 || git remote add origin "https://github.com/$REPO.git"
git remote set-url origin "https://github.com/$REPO.git"
git push -u origin main

echo "4/4  Turning on GitHub Pages (main branch, /docs folder)…"
gh api -X POST "repos/$REPO/pages" -f "source[branch]=main" -f "source[path]=/docs" >/dev/null 2>&1 \
  || gh api -X PUT "repos/$REPO/pages" -f "source[branch]=main" -f "source[path]=/docs" >/dev/null
echo
echo "Done. Repo:  https://github.com/$REPO"
echo "Site (live in a minute or two):  https://spridgehub.github.io/pension-planner/"
