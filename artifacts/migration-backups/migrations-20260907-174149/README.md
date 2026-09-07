# Migration SQL backup

This archive is a read-only backup of the repository's `supabase/migrations/*.sql`
files captured on 2026-09-07.

- `manifest.json` contains the SHA-256 hash and size of every SQL file.
- `lowcode-risk.csv` lists files that reference `lowcode_pages` or contain a full-schema upsert.
- The SQL files are source backups only; they are not a database dump.

Before applying any SQL from this backup, review the file and its affected page codes.
Do not replay the whole directory against a database containing user-edited low-code pages.
