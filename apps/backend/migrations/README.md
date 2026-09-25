# Backend migrations

Ordered, forward-only PostgreSQL migrations are the sole vNext durable-state authority.

`0001_postgres_authority.sql` creates owner/session, immutable n8n provider, sanitized workflow/execution, cursor and sync evidence tables. `0002_workspaces.sql` adds distinct workspaces and fixed many-to-many membership roles, retains legacy owners as ordinary users and initial workspace owners, requires at least one designated owner per workspace, assigns providers to dedicated workspaces, and preserves existing sessions and sanitized evidence. A separate protected bootstrap enrolls the only global super administrator. Runtime code never creates or migrates SQLite state. Applying ordered migrations to a live database remains a separately authorized operator action; do not reset or drop existing data.
