# Backend migrations

Ordered, forward-only PostgreSQL migrations are the sole vNext durable-state authority.

`0001_postgres_authority.sql` creates owner/session, immutable n8n provider, sanitized workflow/execution, cursor and sync evidence tables. `0002_workspaces.sql` adds distinct workspace/membership records, assigns existing owners and providers to dedicated workspaces, and preserves existing sessions and sanitized evidence. Runtime code never creates or migrates SQLite state. Applying ordered migrations to a live database remains a separately authorized operator action; do not reset or drop existing data.
