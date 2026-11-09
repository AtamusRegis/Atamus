#!/usr/bin/env bash
# The task workflow (owner, 2026-11-08): every change reaches main through a short-lived branch and a pull request that
# merges itself (squash) once the required "check" passes on it merged with the current main. See CLAUDE.md.
#
#   scripts/task.sh start <you>/<task>              a fresh worktree beside this folder, on a new branch from origin/main
#   scripts/task.sh finish "<title>" <body-file> [<commit-message-file>]
#        in the task's folder, with the task's changes committed: merge origin/main, run the checks, push, open (or
#        update) the pull request, wait for "check", squash-merge, and verify the result is on origin/main. If main moves
#        meanwhile it merges it again and repeats. Exit 2: a merge conflict to resolve (then commit and run it again).
#   scripts/task.sh checks                          the checks only (what "check" runs)
#
# GitHub is used through its REST API only (gh api), so it also works where gh's GraphQL commands are unavailable.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
REMOTE_URL="$(git remote get-url origin)"
REPO="$(printf '%s' "$REMOTE_URL" | sed -E 's#^(https://github\.com/|git@github\.com:)##; s#\.git$##')"
OWNER="${REPO%%/*}"
say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31m%s\033[0m\n' "$*" >&2; exit "${2:-1}"; }

checks() {
  bash scripts/check.sh
  (cd packages/server && { [ -d node_modules ] || npm ci --no-audit --no-fund >/dev/null; } && npm run -s smoke)
}

case "${1:-}" in
  checks) checks ;;

  start)
    name="${2:?usage: scripts/task.sh start <you>/<task>}"
    git fetch -q origin
    dir="$(cd .. && pwd)/$(basename "$PWD")-${name//\//-}"
    [ -e "$dir" ] && die "$dir already exists"
    git worktree add -q -b "$name" "$dir" origin/main
    git -C "$dir" branch -q --unset-upstream 2>/dev/null || true
    say "Task branch $name in $dir (from origin/main $(git rev-parse --short origin/main))"
    echo "$dir"
    ;;

  finish)
    title="${2:?usage: scripts/task.sh finish \"<title>\" <body-file> [<commit-message-file>]}"; body_file="${3:?body file}"; msg_file="${4:-$3}"
    branch="$(git branch --show-current)"
    [ -n "$branch" ] && [ "$branch" != main ] || die "run it on a task branch, not main"
    [ -z "$(git status --porcelain)" ] || die "commit (or set aside) the task's changes first: the folder must be clean"
    pr=""
    for round in 1 2 3 4 5 6; do
      say "Round $round: bring in the latest main"
      git fetch -q origin
      if ! git merge --no-edit origin/main; then die "Merge conflict with main: resolve it keeping both sides' behavior, commit, then run finish again." 2; fi
      say "Checks"; checks
      say "Push"; git push -q -u origin "HEAD:$branch"
      sha="$(git rev-parse HEAD)"
      if [ -z "$pr" ]; then pr="$(gh api "repos/$REPO/pulls?head=$OWNER:$branch&state=open" --jq '.[0].number // empty')"; fi
      if [ -z "$pr" ]; then
        pr="$(gh api -X POST "repos/$REPO/pulls" -f title="$title" -f head="$branch" -f base=main -F body=@"$body_file" --jq .number)"
        say "Opened pull request #$pr"
      fi
      say "Waiting for the required check on $(git rev-parse --short HEAD)"
      state=""
      for _ in $(seq 1 120); do
        state="$(gh api "repos/$REPO/commits/$sha/check-runs?check_name=check" --jq '[.check_runs[] | .conclusion // .status] | first // "none"')"
        case "$state" in success|failure|cancelled|timed_out|action_required) break ;; esac
        sleep 5
      done
      [ "$state" = success ] || die "check ended: $state (see the pull request #$pr); fix it, commit, and run finish again"
      say "Squash-merge #$pr"
      if out="$(gh api -X PUT "repos/$REPO/pulls/$pr/merge" -f merge_method=squash -f sha="$sha" -f commit_title="$title (#$pr)" -F commit_message=@"$msg_file" 2>&1)"; then :
      elif printf '%s' "$out" | grep -q "not permitted through this proxy"; then
        # where direct merges aren't allowed, ask GitHub to merge it automatically once it can (needs auto-merge enabled)
        gh api -X PUT "repos/$REPO/pulls/$pr/ccr/auto_merge" -f merge_method=SQUASH >/dev/null || die "can't merge from here: $out"
        for _ in $(seq 1 60); do [ "$(gh api "repos/$REPO/pulls/$pr" --jq .merged)" = true ] && break; sleep 5; done
      elif printf '%s' "$out" | grep -qiE "head branch was modified|not mergeable|base branch|out of date|405|409"; then
        say "main moved on: again"; continue
      else die "merge refused: $out"; fi
      merged="$(gh api "repos/$REPO/pulls/$pr" --jq '.merged')"
      [ "$merged" = true ] || { say "not merged yet: again"; continue; }
      mc="$(gh api "repos/$REPO/pulls/$pr" --jq .merge_commit_sha)"
      git fetch -q origin
      git merge-base --is-ancestor "$mc" origin/main || die "PR #$pr says merged but $mc isn't on origin/main"
      say "On main: #$pr as $(git rev-parse --short "$mc")"
      git push -q origin --delete "$branch" 2>/dev/null || echo "(the branch $branch stays on GitHub: delete it there, or enable 'Automatically delete head branches')"
      exit 0
    done
    die "main kept moving: run finish again"
    ;;

  *) sed -n 2,13p "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
