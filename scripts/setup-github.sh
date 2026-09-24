#!/usr/bin/env bash
# One-time repository setup with the GitHub CLI (https://cli.github.com), run from the repo root:
#   gh auth login
#   ./scripts/setup-github.sh            # uses the current repo
# Creates the "Protect main" ruleset (PR + review + "CI passed" + "PR title" required,
# squash only, linear history, no force-push), the deploy environments, and squash-merge defaults.
set -euo pipefail
REPO=${1:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}
echo "Configuring $REPO"

gh api -X PATCH "repos/$REPO" \
  -F allow_squash_merge=true -F allow_merge_commit=false -F allow_rebase_merge=false \
  -F delete_branch_on_merge=true -f squash_merge_commit_title=PR_TITLE -f squash_merge_commit_message=PR_BODY >/dev/null
echo "  merge settings: squash only, PR title as commit message, delete merged branches"

existing=$(gh api "repos/$REPO/rulesets" -q '.[] | select(.name=="Protect main") | .id' || true)
if [ -n "$existing" ]; then
  gh api -X PUT "repos/$REPO/rulesets/$existing" --input .github/rulesets/main.json >/dev/null
else
  gh api -X POST "repos/$REPO/rulesets" --input .github/rulesets/main.json >/dev/null
fi
echo "  ruleset: Protect main (requires: CI passed, PR title, 1 approval)"

for env in preview production; do
  gh api -X PUT "repos/$REPO/environments/$env" >/dev/null
done
echo "  environments: preview, production (add required reviewers to production in Settings → Environments)"

cat <<'NEXT'

Now add these in Settings → Secrets and variables → Actions:
  Secrets:   VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID, PRODUCTION_DIRECT_URL
  Variables: PRODUCTION_API_URL   (e.g. https://api.communiti.app)
NEXT
