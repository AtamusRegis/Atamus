#!/usr/bin/env bash
# One-time GitHub settings for the task workflow (CLAUDE.md, "Working together": "GitHub settings this relies on"),
# then a verification.
# Needs admin on the repository: run it as the owner with gh authenticated. Safe to rerun.
#   scripts/protect-main.sh            apply and verify
#   scripts/protect-main.sh --verify   verify only (works with write access)
# main: changes only through pull requests, 0 approvals, the required "check" job must pass on a branch that is up
# to date with main, no force pushes or deletion, and the same rules for admins. Merging: squash only
# (title and body from the PR), auto-merge on, "Update branch" offered, branches deleted after merge.
set -euo pipefail
REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
if [ "${1:-}" != "--verify" ]; then
  gh api -X PATCH "repos/$REPO" --silent \
    -F allow_squash_merge=true -F allow_merge_commit=false -F allow_rebase_merge=false -F allow_auto_merge=true \
    -F allow_update_branch=true -F delete_branch_on_merge=true \
    -f squash_merge_commit_title=PR_TITLE -f squash_merge_commit_message=PR_BODY
  gh api -X PUT "repos/$REPO/branches/main/protection" --silent --input - <<'JSON'
{
  "required_status_checks": { "strict": true, "checks": [{ "context": "check", "app_id": 15368 }] },
  "enforce_admins": true,
  "required_pull_request_reviews": { "required_approving_review_count": 0, "dismiss_stale_reviews": false, "require_code_owner_reviews": false },
  "restrictions": null,
  "required_linear_history": false,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": false
}
JSON
  echo "applied"
fi
fail=0
want() { if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1: is '$2', want '$3'"; fail=1; fi; }
q() { gh api "$1" --jq "$2" 2>/dev/null || echo "?"; }
want "squash merging on" "$(q "repos/$REPO" .allow_squash_merge)" true
want "auto-merge on" "$(q "repos/$REPO" .allow_auto_merge)" true
want "main protected" "$(q "repos/$REPO/branches/main" .protected)" true
want "check required" "$(q "repos/$REPO/branches/main" '[.protection.required_status_checks.contexts[]?] | index("check") != null')" true
P="repos/$REPO/branches/main/protection"
if gh api "$P" --silent 2>/dev/null; then   # the full rules need admin to read
  want "up to date with main" "$(q "$P" .required_status_checks.strict)" true
  want "pull requests required, 0 approvals" "$(q "$P" .required_pull_request_reviews.required_approving_review_count)" 0
  want "applies to admins" "$(q "$P" .enforce_admins.enabled)" true
  want "no force pushes" "$(q "$P" .allow_force_pushes.enabled)" false
  want "no deletion" "$(q "$P" .allow_deletions.enabled)" false
else echo "note: the full protection rules can only be read with admin access"; fi
exit $fail
