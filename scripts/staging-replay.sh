#!/usr/bin/env bash
# Rebuilds the STAGING database from the repo's migration history.
#
# Order: STAGING_BOOTSTRAP_ALL.sql (covers migrations up to 20260731000011),
# then every later file in supabase/migrations/ in filename order. The first
# error stops the run (ON_ERROR_STOP), so a failed migration never leaves a
# half-built staging schema without a clear message.
#
# Safety:
#   - Needs STAGING_DB_URL in the environment. Never commit it, never paste it.
#   - Refuses unless the URL names the STAGING project and not production.
#   - Drops and rebuilds the public schema ONLY when RESET_PUBLIC=yes is set.
#
# Usage:
#   STAGING_DB_URL=... RESET_PUBLIC=yes scripts/staging-replay.sh
set -euo pipefail

STAGING_REF="vogjbkgmqanjeaxnpzqs"
PRODUCTION_REF="dijggrafwdznescbuypi"

: "${STAGING_DB_URL:?Set STAGING_DB_URL to the staging connection string. Do not commit it.}"

case "$STAGING_DB_URL" in
  *"$PRODUCTION_REF"*) echo "Refusing: this URL points at PRODUCTION."; exit 1 ;;
esac
case "$STAGING_DB_URL" in
  *"$STAGING_REF"*) ;;
  *) echo "Refusing: URL does not name the staging project ($STAGING_REF)."; exit 1 ;;
esac

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ "${RESET_PUBLIC:-}" = "yes" ]; then
  echo "== Resetting public schema on staging"
  psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
SQL
fi

echo "== Bootstrap (covers migrations up to 20260731000011)"
psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/migrations_staging_clean/STAGING_BOOTSTRAP_ALL.sql"

# Ordering exception. 20260731000017 queries public.reviews, but reviews is
# only created by 20260828000009 (which also re-applies the view and the
# accept_bid/counter_bid functions). Production has reviews from its baseline,
# so this only bites on a rebuild from history. Run 20260828000009 right
# before 20260731000017 and skip its normal position, so it runs exactly once.
EARLY_FILE="20260828000009_missing_reviews_and_verification_sessions.sql"
BEFORE_FILE="20260731000017_fix_provider_stats_and_bid_rpcs.sql"

run_migration() {
  echo "== $1"
  psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/migrations/$1"
}

for f in $(ls "$ROOT"/supabase/migrations/*.sql | sort); do
  name="$(basename "$f")"
  if [[ "$name" > "20260731000011_" ]]; then
    if [ "$name" = "$EARLY_FILE" ]; then
      continue
    fi
    if [ "$name" = "$BEFORE_FILE" ]; then
      run_migration "$EARLY_FILE"
    fi
    run_migration "$name"
  fi
done

echo "== Replay complete. Next: run the advisors and review what remains."
