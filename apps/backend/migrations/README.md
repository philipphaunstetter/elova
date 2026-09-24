# Backend migrations

Ordered, forward-only PostgreSQL migrations are the sole vNext durable-state authority.

`0001_postgres_authority.sql` creates the initial owner/session, immutable n8n provider, sanitized workflow/execution, synchronization cursor, and synchronization evidence tables. Runtime code never creates or migrates SQLite state. Existing legacy data is not imported or deleted by this repository change; any live-data migration remains an explicit operator action after separate review.
