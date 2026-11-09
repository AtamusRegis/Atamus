#!/usr/bin/env bash
# Land the current task branch on main (CLAUDE.md, "Getting changes into main"): merge the latest main in, check, push,
# open or reuse the branch's pull request, wait for the required Check, squash-merge it (auto-merge when the repository
# allows it), repeat whenever main moves first, then confirm the squash commit is on origin/main and its Check passed.
#   scripts/land.sh "PR title" [body-file]      (title and body are used when the PR is first opened)
#   scripts/land.sh --draft "PR title" [body-file]   push and open a draft PR to show work in progress, then stop
# Needs gh authenticated (gh auth login, or GH_TOKEN). Never rebases, force-pushes or uses an admin override.
# Exit: 0 merged and verified; 2 merging main conflicted (resolve, commit, rerun); 3 Check failed (fix, commit, rerun);
#       1 anything else (the message says what).
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
DRAFT=0; [ "${1:-}" = "--draft" ] && { DRAFT=1; shift; }
TITLE="${1:-}"; BODY_FILE="${2:-}"
die() { echo "land: $*" >&2; exit "${2:-1}"; }
BR="$(git branch --show-current)"
[ -n "$BR" ] && [ "$BR" != main ] || die "run it on a task branch, not '${BR:-detached HEAD}'"
[ -z "$(git status --porcelain)" ] || die "commit this task's changes first (the worktree isn't clean)"
REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
AUTO="$(gh api "repos/$REPO" -q .allow_auto_merge)"

pr_field() { gh pr view "$BR" --json "$1" -q ".$1" 2>/dev/null || true; }
sync_main() {   # merge the latest main into the branch (never rebase); conflicts are left for the agent to resolve
  git fetch -q origin main
  if ! git merge-base --is-ancestor origin/main HEAD; then
    echo "land: merging origin/main into $BR"
    git merge --no-edit origin/main || die "merging origin/main conflicted: resolve each section keeping both sides' intent, commit, rerun" 2
    bash scripts/check.sh
  fi
}
verify_merged() {
  local oid; oid="$(gh pr view "$BR" --json mergeCommit -q .mergeCommit.oid)"
  git fetch -q origin main
  git merge-base --is-ancestor "$oid" origin/main || die "PR says merged but $oid isn't on origin/main yet"
  echo "land: merged as $oid ($(git log -1 --format=%s "$oid"))"
  local run=""
  for _ in $(seq 1 30); do run="$(gh run list --commit "$oid" --workflow Check --json databaseId -q '.[0].databaseId' 2>/dev/null || true)"; [ -n "$run" ] && break; sleep 5; done
  if [ -n "$run" ]; then timeout 15m gh run watch "$run" --exit-status >/dev/null && echo "land: Check passed on main" || die "Check on main failed for $oid: fix it with a new corrective PR" 3
  else echo "land: no Check run found on main for $oid (not verified)"; fi
}

for attempt in $(seq 1 20); do
  sync_main
  git push -q -u origin "HEAD:refs/heads/$BR"
  STATE="$(pr_field state)"
  if [ -z "$STATE" ] || [ "$STATE" = CLOSED ]; then
    [ -n "$TITLE" ] || die "no open PR for $BR: give a title"
    args=(--base main --head "$BR" --title "$TITLE"); [ -n "$BODY_FILE" ] && args+=(--body-file "$BODY_FILE") || args+=(--body "")
    [ $DRAFT = 1 ] && args+=(--draft)
    gh pr create "${args[@]}" >/dev/null; echo "land: opened $(pr_field url)"
  elif [ "$STATE" = MERGED ]; then
    die "$BR was already squash-merged: start a new task branch from origin/main"
  fi
  [ $DRAFT = 1 ] && { echo "land: draft PR is up to date: $(pr_field url)"; exit 0; }
  [ "$(pr_field isDraft)" = true ] && gh pr ready "$BR" >/dev/null
  # wait for the PR's checks to appear, then to finish
  for _ in $(seq 1 24); do [ -n "$(gh pr checks "$BR" 2>/dev/null || true)" ] && break; sleep 5; done
  if ! timeout 20m gh pr checks "$BR" --watch --interval 10 >/dev/null 2>&1; then
    git fetch -q origin main
    git merge-base --is-ancestor origin/main HEAD || { echo "land: main moved during the check; updating"; continue; }
    gh pr checks "$BR" || true
    die "Check failed on the PR: fix it, commit, rerun" 3
  fi
  git fetch -q origin main
  git merge-base --is-ancestor origin/main HEAD || { echo "land: main moved; updating"; continue; }
  # merge now when every requirement passes; otherwise let GitHub merge it when they do
  gh pr merge "$BR" --squash >/dev/null 2>&1 || { [ "$AUTO" = true ] && gh pr merge "$BR" --squash --auto >/dev/null; } || true
  for _ in $(seq 1 36); do
    [ "$(pr_field state)" = MERGED ] && { verify_merged; exit 0; }
    git fetch -q origin main; git merge-base --is-ancestor origin/main HEAD || break
    sleep 5
  done
  echo "land: not merged yet (state $(pr_field state), merge state $(pr_field mergeStateStatus)); going round again"
done
die "gave up after 20 rounds: $(pr_field url) is $(pr_field mergeStateStatus)"
