#!/usr/bin/env bash
# ABOUTME: Reads .env.local (gitignored) and pushes each non-empty var to the linked Vercel
# ABOUTME: project's Production environment. Run this yourself — it's the only thing that ever
# ABOUTME: touches the real secret values, so it must not run inside an agent session.
set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE=".env.local"
[ -f "$ENV_FILE" ] || { echo "no $ENV_FILE found, nothing to push" >&2; exit 1; }

if [ ! -f ".vercel/project.json" ]; then
  echo "Project not linked yet. Run this first:"
  echo "  vercel link --yes --project appfolio-mcp --scope brets-projects-ea090dc4"
  exit 1
fi

# Only push keys the app actually reads (per .env.example), so unrelated local-only
# entries the Vercel CLI adds to this file (e.g. VERCEL_OIDC_TOKEN) never get pushed.
KNOWN_KEYS=$(grep -oE '^[A-Z_]+=' .env.example | sed 's/=$//')

pushed=0
skipped=0

while IFS='=' read -r key value; do
  # skip comments, blank lines, and lines with no '='
  case "$key" in
    ''|'#'*) continue ;;
  esac
  # IFS='=' disables read's usual whitespace trimming, so a stray space after '=' (e.g.
  # "KEY= value") would otherwise get pushed to Vercel as part of the value verbatim,
  # silently corrupting a credential in a way that's invisible in normal editors. Trim it
  # explicitly rather than relying on the file never containing one.
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  if ! grep -qx "$key" <<< "$KNOWN_KEYS"; then
    echo "skip $key (not a known app config var)"
    skipped=$((skipped + 1))
    continue
  fi
  [ -z "${value:-}" ] && { echo "skip $key (empty)"; skipped=$((skipped + 1)); continue; }

  # drop this var from Production first (no-op if it doesn't exist yet), then add the real value
  vercel env rm "$key" production --yes >/dev/null 2>&1 || true
  printf '%s' "$value" | vercel env add "$key" production >/dev/null
  echo "pushed $key"
  pushed=$((pushed + 1))
done < "$ENV_FILE"

echo ""
echo "$pushed pushed, $skipped skipped (empty)."
