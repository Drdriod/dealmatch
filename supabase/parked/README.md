# Parked migrations

Files here are **not** part of the migration order and must not be run. The README in
`supabase/migrations/` says to run every file in that folder, so anything that must not run lives here.

- `20261011010000_place_people_taxonomy.sql`: re-parents live listings. Superseded by
  `20261012000000_taxonomy_blueprint_v2.sql`, which is applied. Kept for reference only.
