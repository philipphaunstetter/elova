# Product Requirements Document (PRD)

Product name: Elova - Automation Workflow Observability (provider-agnostic)
Version: 2.0 (v2-develop branch) - IN ACTIVE DEVELOPMENT
Last Updated: December 23, 2024

Summary
- Build a provider-agnostic web application that gives users visibility into their automation workflows: overview of running workflows, execution status, analytics, and instance health.
- Version 2.0 focuses on n8n (self-hosted or cloud) with a modernized architecture featuring a database-first configuration approach, automated sync engine, and enhanced analytics.
- Future versions will support additional platforms (Zapier, Make.com) through an adapter pattern.

1. Problem Statement
Teams running automations across tools lack a single, actionable view to monitor reliability, debug failures, and understand performance. Each platform exposes partial data with differing models. Users need one place to see workflow health, investigate issues, and confirm endpoints and instances are healthy.

2. Goals (Objectives)
- Provide a unified, easy-to-understand view of automation health across providers.
- Reduce time to detect and resolve failed runs (MTTD/MTTR).
- Offer drill-down from aggregate metrics to per-execution detail.
- Visualize workflow structure (flowchart) to understand where issues occur.
- Check external endpoints and platform instance health from the same UI.

3. Non-Goals (for MVP)
- Full workflow editing/authoring or deployment.
- General-purpose BI/ELT data warehousing.
- Multi-tenant organization/RBAC beyond basic access control.
- Complex alerting/notifications (stretch for post-MVP).

4. Target Users and Personas

**Primary (MVP Focus):**
- **Automation Ops Engineer** (self-hosted n8n or mixed stack): Maintains critical automations; needs reliability monitoring, quick failure triage, and visual debugging through flowcharts.
- **Maker/Developer** (project owner, smaller teams): Owns several workflows; wants quick insight, step-level debugging, and performance tracking without enterprise complexity.

**Secondary (Post-MVP):**
- **Team Lead/Stakeholder**: Monitors uptime, success rate, SLA adherence, and needs executive dashboard views.
- **Multi-Platform Teams**: Users running n8n + Zapier + Make who need unified observability.

**User Type Adaptability** (inspired by competitive analysis):
- **Developer Mode**: Console-style logs, JSON viewers, technical details (Pipedream pattern)
- **Operations Mode**: Timeline views, incident correlation, audit trails (Tines pattern)
- **Executive Mode**: Summary cards, trend indicators, governance dashboards (Workato/Tray pattern)

5. Key Use Cases and User Journeys
- Monitor health: View success rate, failures, durations across time; filter by provider, workflow, status, time range.
- Debug failures: Find failed executions; inspect metadata and errors; identify problematic step/node in the flowchart.
- Validate endpoints: Periodically check key HTTP endpoints that workflows depend on; see uptime/latency.
- Instance health: Confirm platform instance connectivity and status (e.g., n8n self-hosted), including auth validity and version info.

6. Scope

6.1 Version 2.0 (Current - v2-develop) - IMPLEMENTED FEATURES

**Setup & Authentication:**
- Multi-step setup wizard (Account → Connect → Workflows → Summary)
- Database-first configuration (no .env required for n8n credentials)
- JWT-based authentication with session management
- SQLite database with automated schema initialization
- Support for demo mode with synthetic data

**Core Data Infrastructure:**
- One provider adapter (n8n) behind a provider-agnostic domain model
- Automated sync engine with configurable intervals
- Comprehensive execution tracking (status, mode, duration, AI metrics)
- Workflow tracking with activity indicators and archival state
- Cron job detection and management
- Safe startup behavior (syncs only after first setup)

**Dashboard & Analytics:**
- Executive summary cards: Total executions, success rate, failed executions
- Time range selector (1h, 24h, 7d, 30d, 90d, all, custom date range)
- Time-series charts for execution trends
- Success rate visualization over time
- Status distribution charts
- Recent activity feed with execution details
- Recent failures list with error messages
- AI cost and token usage tracking
- Multi-provider support (prepared for multiple n8n instances)

**Executions Management:**
- Paginated execution list with advanced filtering
- Filter by status (success, error, running, canceled, waiting)
- Filter by workflow, time range, and search
- Execution grouping (automatic grouping of trigger/webhook/cron executions)
- Execution detail view with metadata and error information
- Mode tracking (manual, trigger, webhook, cron)
- AI metrics per execution (tokens, cost, provider, model)

**Workflows:**
- List workflows with activity indicators
- Per-workflow statistics (total executions, success/failure counts, success rate)
- Last execution status and timestamp
- Active/inactive/archived state management
- Tag support for organization
- Cron schedule detection and display
- Average duration tracking
- Node count metadata

**Sync & Data Management:**
- Automated background sync (executions, workflows, backups)
- Manual sync trigger via API
- Configurable batch sizes for sync operations
- Safe startup (no auto-sync until after setup)
- Provider connection status monitoring
- Sync status endpoint (GET /api/sync)

**User Experience:**
- Dark mode support with theme toggle
- Responsive design for different screen sizes
- Loading states and skeleton screens
- Toast notifications for user actions
- Breadcrumb navigation
- Profile dropdown with user info and logout
- About section with version information

**Container & Deployment:**
- Docker-first architecture (ghcr.io/philipphaunstetter/n8n-analytics:latest)
- Multi-architecture support (amd64/arm64)
- Volume persistence for SQLite database
- Environment-based configuration (timezone, demo mode)
- Health check endpoint
- Automated CI/CD pipeline with GitHub Actions
- Local testing script (./scripts/test-local.sh)

6.2 Version 2.1+ (Planned)

**Flowchart Visualization:**
- Native n8n workflow graph rendering (using @n8n_io/n8n-demo-component)
- Failed node highlighting with error annotations
- Interactive node inspection with execution data
- Execution path overlay showing data flow
- Export capabilities (PNG, PDF) for documentation

**Endpoint Monitoring:**
- Configure HTTP endpoint checks (URL, method, headers, interval)
- Periodic health checks with status/latency tracking
- Uptime percentage calculation
- Manual recheck capability
- Alert integration for endpoint failures

**Enhanced Analytics:**
- Duration percentiles (P50, P95, P99) per workflow
- Execution heatmaps by time of day/day of week
- Workflow dependency mapping
- Cost optimization insights for AI usage
- Performance bottleneck identification

**Multi-Provider Support:**
- Multiple n8n instance connections (dev, staging, prod)
- Provider-switching in UI
- Cross-provider analytics and comparison
- Zapier adapter (future)
- Make.com adapter (future)

**Alerting & Notifications:**
- Email notifications on failures
- Slack integration for real-time alerts
- Webhook notifications for external systems
- Custom alert rules and thresholds
- Alert escalation policies

**Advanced Features:**
- Export capabilities (CSV/JSON) for executions
- Saved views and custom dashboards
- Advanced query builder for complex analytics
- Real-time streaming logs (WebSocket-based)
- Timeline execution views
- Multi-user support with RBAC
- Team workspaces and environment isolation
- Audit trails for compliance
- SSO/SAML authentication for enterprise

6.3 Competitive Differentiation (Key Market Advantages)
- **Provider-Agnostic Architecture**: Unlike vendor-specific solutions, supports multiple platforms through unified adapters.
- **Visual Workflow Debugging**: Flowchart-based failure analysis not available in existing tools.
- **Integrated Infrastructure Monitoring**: Built-in endpoint checks + workflow observability in one tool.
- **Flexible User Experience**: Adaptable interface supporting developer, ops, and executive personas.
- **Self-Hosted + Cloud Ready**: Deployment flexibility not offered by SaaS-only competitors.

7. Functional Requirements
7.1 Provider Connectors (Adapter Interface)
- Authenticate: Manage credentials securely; validate connectivity.
- List Workflows: id, name, active, updatedAt (mapped to a common schema).
- Get Workflow Graph: Return a graph representation (nodes, edges, metadata) mapped to a common graph schema.
- List Executions: Pagination/cursor support; filter by workflow and status; return unified execution fields.
- Get Execution Detail: Metadata; provider-specific status and error info; timestamps; optional step-level results if available.
- Instance Health: Connectivity probe; latency; version; provider-specific health info.

7.2 Dashboard

**Implemented Features (v2.0):**
- **Executive Summary Cards**: Total Executions, Success Rate, Failed Executions, AI Cost, Total Tokens
- **Time Range Selector**: 1h, 24h, 7d, 30d, 90d, all, custom date picker
- **Interactive Time-Series Charts**:
  - Execution volume over time
  - Success rate trends
  - Status distribution (stacked bar chart)
  - Multi-provider comparison (prepared)
- **Recent Activity Feed**: Latest 5 executions with status, workflow name, timestamp
- **Recent Failures List**: Last 5 failed executions with error messages
- **AI Metrics Dashboard**: Track token usage and costs across executions
- **Real-time Updates**: Dashboard auto-refreshes with configurable intervals
- **Provider Filtering**: Filter all metrics by specific provider instance

**Planned Enhancements (v2.1+):**
- Sparkline charts on summary cards
- Customizable card layouts and positions
- Saved dashboard views per user
- Workflow health scores
- Performance anomaly detection
- Developer Mode Toggle: Console-style logs, JSON data inspection
- Executive Mode Toggle: High-level KPIs, governance focus

7.3 Executions

**Implemented Features (v2.0):**
- Paginated table (2000 default limit, up to 5000 max) with columns:
  - Status badge (color-coded: success, error, running, canceled, waiting)
  - Started at timestamp
  - Stopped at timestamp
  - Workflow name (linked)
  - Duration (milliseconds, formatted)
  - Mode (manual, trigger, webhook, cron)
  - Provider name
- **Advanced Filtering**:
  - Provider filter (multi-instance support)
  - Workflow filter (dropdown with all workflows)
  - Status filter (multi-select)
  - Time range filter (1h, 24h, 7d, 30d, 90d, all, custom)
  - Search filter (by execution ID, workflow name)
- **Smart Grouping**: Automatic grouping of consecutive executions from same workflow/status/mode (trigger/webhook/cron)
- **Details View**:
  - Full metadata display
  - Error message and stack trace (when available)
  - AI metrics: tokens (input/output/total), cost, provider, model
  - Retry tracking (retry_of, retry_success_id)
  - Finished status indicator
- **Performance**: SQL-based filtering and pagination for large datasets

**Planned Enhancements (v2.1+):**
- Link to workflow flowchart with highlighted failed node
- Execution comparison (side-by-side)
- Bulk operations (retry, cancel)
- Export selected executions to CSV/JSON
- Execution replay capability

7.4 Workflows

**Implemented Features (v2.0):**
- Paginated list (20 per page) with real-time statistics:
  - Workflow name and tags
  - Active/inactive/archived status badges
  - Total executions count
  - Success count and failure count
  - Success rate percentage (calculated)
  - Average duration
  - Last executed timestamp
  - Last execution status badge
- **Filtering & Organization**:
  - Filter by active status (active/inactive)
  - Filter by archived status (automatically computed: inactive + not updated in 90 days)
  - Filter by provider
  - Track/untrack workflows (is_tracked flag)
  - Tag-based organization
- **Metadata**:
  - Node count from workflow structure
  - Provider workflow ID reference
  - Created/updated timestamps
  - Connections metadata
- **Cron Jobs View**:
  - Dedicated endpoint for workflows with cron schedules
  - Display cron expressions with human-readable descriptions
  - Filter by status (all, active, inactive, archived)
  - Node-level cron schedule details

**Planned Enhancements (v2.1+):**
- Workflow detail page with comprehensive analytics
- View Flowchart button (launch n8n demo component)
- Execution history chart per workflow
- Performance trends over time
- Dependency visualization (which workflows trigger others)
- Workflow templates and cloning

7.5 Flowchart Viewer (Planned for v2.1)

**Implementation Status**: NOT YET IMPLEMENTED in v2.0

**Planned Core Features:**
- **Native n8n Rendering**: Use `@n8n_io/n8n-demo-component` for high-fidelity n8n workflow visualization
- **Failure Highlighting**: Visual indicators for failed nodes with error annotations
- **Interactive Node Inspection**: Click nodes to view:
  - Step properties and configuration
  - Execution data (input/output)
  - Error messages and stack traces
  - Timing information (start, duration)
- **Execution Context Overlay**: Highlight execution path through workflow

**Advanced Features (Competitive Edge):**
- **Multi-Execution Comparison**: Overlay paths from multiple runs to identify patterns
- **Performance Visualization**: Node-level timing heatmap
- **Error Drill-Down**: Navigate from failed node to full execution details
- **Data Flow Visualization**: Show data transformations between nodes

**Technical Requirements:**
- Provider-agnostic graph schema for future adapters (Zapier, Make)
- Responsive layout for different screen sizes
- Export capabilities (PNG, PDF) for documentation
- Real-time execution overlay during workflow runs

**Dependencies:**
- CSS file already created: `/src/styles/n8n-demo.css`
- Workflow graph data structure defined in types
- Workflow metadata stored in database (workflow_data field)

7.6 Endpoint Monitoring (Planned for v2.1)

**Implementation Status**: NOT YET IMPLEMENTED in v2.0

**Planned Features:**
- **Configuration Interface**:
  - Add/edit/delete endpoint checks
  - Fields: name, URL, method, headers, interval, timeout, expected status range
  - Enable/disable checks individually
- **Monitoring Engine**:
  - Periodic HTTP requests from server
  - Configurable check intervals (1min, 5min, 15min, 30min, 1h)
  - Timeout handling and retry logic
- **Data Storage**:
  - Recent results in SQLite (last 1000 checks per endpoint)
  - Historical uptime data for reporting
- **Display & Alerts**:
  - Uptime percentage over selected period
  - Last check timestamp and latency
  - Last error reason and response code
  - Manual recheck button
  - Downtime alerts (email/Slack integration)
- **Integration**:
  - Link endpoint checks to specific workflows
  - Correlate endpoint failures with workflow errors
  - Dashboard widget for endpoint status

**Database Schema** (Defined but not implemented):
- `endpoint_checks` table: configuration and metadata
- `endpoint_results` table: check history and results

7.7 Instance Status & Health

**Implemented Features (v2.0):**
- **Connection Testing**:
  - Test n8n connection during setup wizard
  - Validates URL accessibility and API key
  - Tests actual API call to /workflows endpoint
  - Minimum 5-second validation window for UX
- **Health Endpoint**: `GET /api/health`
  - Returns application health status
  - Database connectivity check
  - Demo mode indicator
- **Provider Status Tracking**:
  - Database field for `is_connected` status
  - Last checked timestamp
  - Connection status (healthy, warning, error, unknown)
  - Version metadata (stored but not actively monitored yet)

**Planned Enhancements (v2.1+):**
- Automatic periodic connectivity probes
- Round-trip latency measurement
- Provider version tracking with upgrade notifications
- Detailed misconfiguration guidance
- Provider health dashboard widget
- Multi-instance health comparison

7.8 Settings & Configuration

**Implemented Features (v2.0):**
- **Setup Wizard** (Multi-step onboarding):
  - Step 1 (Account): Create admin user with email and password
  - Step 2 (Connect): Configure n8n instance (name, URL, API key)
  - Step 3 (Workflows): Fetch and preview available workflows
  - Step 4 (Summary): Review configuration and complete setup
- **Database-First Configuration**:
  - All settings stored in SQLite `config` table
  - No .env files required for n8n credentials
  - Secure credential storage (encrypted API keys)
  - Configuration versioning and history
- **Demo Mode**:
  - Environment variable: `NEXT_PUBLIC_ENABLE_DEMO_MODE=true`
  - Synthetic data generation for testing
  - Pre-populated demo providers, workflows, executions
  - Toggleable via environment (not runtime yet)
- **User Management**:
  - JWT-based authentication
  - Session management with secure cookies
  - Password hashing (bcrypt)
  - User profile in database
- **Timezone Configuration**:
  - Global timezone setting (`GENERIC_TIMEZONE`)
  - Affects all timestamp displays

**Planned Enhancements (v2.1+):**
- Settings UI page (post-setup configuration)
- Multiple provider management
- Endpoint monitoring configuration
- User preferences (theme, refresh interval, notifications)
- API key rotation
- Backup/restore configuration
- Runtime demo mode toggle
- Multi-user management with roles

8. Data Model (Provider-Agnostic)

**Implemented Database Schema (v2.0):**

**Providers Table:**
- id (TEXT, PRIMARY KEY)
- user_id (TEXT, FOREIGN KEY)
- name (TEXT) - Display name
- base_url (TEXT) - n8n instance URL
- api_key_encrypted (TEXT) - Encrypted API key
- is_connected (INTEGER) - Boolean connection status
- status (TEXT) - 'healthy' | 'warning' | 'error' | 'unknown'
- version (TEXT) - n8n version
- last_checked (TEXT) - ISO timestamp
- metadata (TEXT) - JSON for provider-specific data
- created_at (TEXT)
- updated_at (TEXT)

**Workflows Table:**
- id (TEXT, PRIMARY KEY)
- provider_id (TEXT, FOREIGN KEY)
- provider_workflow_id (TEXT) - Original n8n workflow ID
- name (TEXT)
- is_active (INTEGER) - Boolean active status
- is_archived (INTEGER) - Boolean archived status
- is_tracked (INTEGER) - Boolean tracking flag (default 1)
- tags (TEXT) - JSON array of tags
- workflow_data (TEXT) - JSON workflow structure
- node_count (INTEGER)
- cron_schedules (TEXT) - JSON array of cron configs
- created_at (TEXT)
- updated_at (TEXT)

**Executions Table:**
- id (TEXT, PRIMARY KEY)
- provider_id (TEXT, FOREIGN KEY)
- workflow_id (TEXT, FOREIGN KEY)
- provider_execution_id (TEXT) - Original n8n execution ID
- provider_workflow_id (TEXT) - Original n8n workflow ID
- status (TEXT) - 'success' | 'error' | 'running' | 'canceled' | 'waiting'
- mode (TEXT) - 'manual' | 'trigger' | 'webhook' | 'cron'
- started_at (TEXT) - ISO timestamp
- stopped_at (TEXT) - ISO timestamp (nullable)
- duration (INTEGER) - Milliseconds
- finished (INTEGER) - Boolean
- retry_of (TEXT) - Execution ID this is a retry of
- retry_success_id (TEXT) - Successful retry execution ID
- metadata (TEXT) - JSON for additional data
- total_tokens (INTEGER) - AI total tokens
- input_tokens (INTEGER) - AI input tokens
- output_tokens (INTEGER) - AI output tokens
- ai_cost (REAL) - AI cost in USD
- ai_provider (TEXT) - AI provider name
- ai_model (TEXT) - AI model name
- created_at (TEXT)
- updated_at (TEXT)

**Users Table:**
- id (TEXT, PRIMARY KEY)
- email (TEXT, UNIQUE)
- password_hash (TEXT)
- created_at (TEXT)
- updated_at (TEXT)

**Config Table:**
- key (TEXT, PRIMARY KEY)
- value (TEXT) - JSON or plain text
- updated_at (TEXT)

**Planned Tables (v2.1+):**
- **endpoint_checks**: Configuration for HTTP endpoint monitoring
- **endpoint_results**: Historical check results
- **alert_rules**: User-defined alerting rules
- **alert_history**: Alert trigger history
- **user_preferences**: Per-user settings
- **sync_logs**: Detailed sync operation history

9. Integration Notes (Initial: n8n)
- API base: configurable (N8N_HOST). Auth via API key (X-N8N-API-KEY).
- Endpoints typically used: /api/v1/executions, /api/v1/workflows, and any available workflow read/graph endpoint.
- Map provider fields to domain model. Use server-side proxy routes to avoid exposing secrets to the browser.
- Zapier/Make (future): Define connectors that map their data structures (Zaps/Steps; Scenarios/Modules) into the same domain shape.

10. Non-Functional Requirements
- Security: Secrets never sent to the browser; stored server-side. Do not log secrets.
- Privacy: No telemetry by default; if enabled, aggregate only non-sensitive usage metrics with opt-out.
- Performance: Initial dashboard load under 2s with typical data; table pagination for large result sets.
- Reliability: Endpoint checks resilient to transient failures; backoff and timeouts.
- Accessibility: Keyboard navigation and basic ARIA for tables, dialogs, and the flowchart viewer.
- Browser support: Latest two versions of major browsers.

11. Telemetry and Analytics (Optional, opt-in)
- Track feature usage (view dashboard, open execution, render flowchart, add endpoint check) without storing sensitive payloads.
- Error tracking on the client and server with PII safe-guards.

12. Risks and Mitigations
- CORS and secret exposure: Always proxy provider API via server; never call with API key from client.
- Provider API variability: Encapsulate in adapters; version guard and capability flags.
- Data completeness: Some providers may not expose detailed node-level errors; surface gracefully.
- Rate limits: Respect provider limits; use pagination and intervals; document constraints.

13. Release Plan

**Version History:**
- v0.1.0 (Dec 2024): Initial release with basic monitoring
- v0.2.0 (Dec 2024): Automated release management, UI improvements
- v0.3.0 (Dec 2024): About section, enhanced profile dropdown

**Current Version:**
- **v2.0 (v2-develop branch) - IN ACTIVE DEVELOPMENT**: Complete rewrite with:
  - Database-first configuration (SQLite)
  - Setup wizard with multi-step onboarding
  - JWT authentication system
  - Automated sync engine
  - Advanced analytics dashboard
  - Time-series charts and trends
  - Execution grouping and smart filtering
  - Cron job management
  - AI metrics tracking (tokens, costs)
  - Dark mode support
  - Multi-architecture Docker builds
  - Comprehensive API layer

**Upcoming Releases:**

- **v2.1 (Q1 2025)**: Flowchart viewer
  - Native n8n workflow visualization
  - Failed node highlighting
  - Interactive node inspection
  - Export to PNG/PDF

- **v2.2 (Q1 2025)**: Endpoint monitoring
  - HTTP endpoint checks
  - Uptime tracking
  - Alert integration
  - Manual recheck capability

- **v2.3 (Q2 2025)**: Multi-provider support
  - Multiple n8n instances
  - Provider-level analytics
  - Cross-provider comparison

- **v2.4 (Q2 2025)**: Alerting & notifications
  - Email notifications
  - Slack integration
  - Webhook notifications
  - Custom alert rules

- **v3.0 (Q3 2025)**: Enterprise features
  - Additional provider adapters (Zapier, Make)
  - Multi-user with RBAC
  - Team workspaces
  - SSO/SAML support
  - Audit trails
  - Advanced analytics (percentiles, heatmaps)

14. Acceptance Criteria

**Version 2.0 (Current - PASSING):**
- ✅ Setup wizard completes successfully with valid n8n credentials
- ✅ User authentication works (login, logout, session management)
- ✅ Dashboard counters accurately reflect execution data for all time ranges
- ✅ Time-series charts display execution trends correctly
- ✅ Executions page filters work (status, workflow, time range, search)
- ✅ Execution grouping correctly groups trigger/webhook/cron runs
- ✅ Workflow list shows accurate statistics (success rate, avg duration, last execution)
- ✅ Cron jobs are detected and displayed with human-readable schedules
- ✅ Sync engine successfully fetches data from n8n API
- ✅ AI metrics (tokens, costs) are tracked and displayed correctly
- ✅ Dark mode toggle works across all pages
- ✅ No provider secrets (API keys) are exposed in client requests or logs
- ✅ Database schema initializes correctly on first run
- ✅ Docker container builds and runs on amd64 and arm64
- ✅ Local testing script works for development

**Version 2.1 (Planned - Future):**
- ⏳ Flowchart viewer renders n8n workflows correctly
- ⏳ Failed nodes are highlighted in flowchart view
- ⏳ Node inspection shows execution data and errors
- ⏳ Endpoint monitors can be created, edited, and deleted
- ⏳ Endpoint checks run periodically and display results
- ⏳ Uptime percentage calculates correctly

**Version 2.2+ (Planned - Future):**
- ⏳ Multiple n8n instances can be configured
- ⏳ Email/Slack notifications send on workflow failures
- ⏳ Alert rules can be configured per workflow
- ⏳ CSV/JSON export works for executions
- ⏳ Multi-user access with role-based permissions
- ⏳ Zapier adapter successfully fetches data
- ⏳ Make.com adapter successfully fetches data

15. Market Position and Competitive Landscape

**Direct Competitors (Provider-Specific Solutions):**
- Native platform analytics (n8n Cloud, Zapier insights, Make.com reports)
- Enterprise iPaaS monitoring (Workato Insights, Tray.io dashboards)
- Security automation platforms (Tines case management)

**Indirect Competitors (General Observability):**
- APM tools (Datadog, New Relic) with custom dashboards
- Log aggregation (ELK, Grafana) with manual setup
- Custom Prometheus + Grafana monitoring stacks

**Market Gaps We Address:**
1. **Cross-Platform Visibility**: No existing tool provides unified observability across n8n, Zapier, and Make.
2. **Visual Workflow Debugging**: Flowchart-based failure analysis is missing from current solutions.
3. **Integrated Infrastructure**: Combining endpoint monitoring with workflow observability.
4. **Self-Hosted Option**: Many enterprise teams prefer on-premises deployment.

**Competitive Advantages:**
- Provider-agnostic architecture from day one
- Visual debugging through flowcharts (unique differentiator)
- Integrated endpoint monitoring (not available elsewhere)
- Flexible deployment (self-hosted + cloud)
- Adaptable UI for different user personas

16. Open Questions
- Primary deployment targets (self-hosted vs. Vercel) and secret management approach for production.
- Do we need to support multiple provider instances concurrently in MVP?
- Preferred branding: Elova (finalized).
- Scope of demo mode: synthetic data only or shared read-only demo instance (e.g., n8n-demo)?
- Should we include workspace/environment isolation in MVP for enterprise appeal?
- What level of real-time capabilities should be included in MVP vs. post-MVP?

17. Feature List (Licensing Consideration)

**17.1 Core Monitoring Features**
- Dashboard with executive summary (executions, success rate, failures)
- Execution list and filtering (by status, workflow, time range)
- Execution detail view with error synopsis
- Workflow list with activity indicators
- Basic workflow metrics (success rate, execution count)
- Time range selection (24h, 7d, 30d, custom)
- Provider connection management (single instance)
- Instance health check and connectivity probe

**17.2 Analytics Features**
- Per-workflow success rate calculation
- Execution duration tracking
- AI Token usage and cost tracking (input/output tokens, provider)
- Basic filtering and search
- Export executions (CSV/JSON) [POST-MVP]
- Trend charts and time-series visualization [POST-MVP]
- Duration percentiles (P95/P99) [POST-MVP]
- Advanced query builder [POST-MVP]
- Saved views and custom filters [POST-MVP]

**17.3 Visual Debugging (Key Differentiator)**
- Flowchart viewer with provider-agnostic rendering
- Failed node highlighting
- Interactive node inspection
- Execution context overlay [POST-MVP]
- Multi-execution comparison [POST-MVP]
- Performance visualization per node [POST-MVP]
- Flowchart export (PNG, PDF) [POST-MVP]

**17.4 Infrastructure Monitoring**
- HTTP endpoint monitoring (URL, method, headers, interval)
- Uptime tracking and latency measurement
- Expected status code configuration
- Manual recheck capability
- Endpoint check history [POST-MVP]
- Advanced alerting for endpoint failures [POST-MVP]

**17.5 Multi-Provider Support**
- n8n adapter (MVP)
- Multiple n8n instance support [PLANNED]
- Zapier adapter [PLANNED]
- Make.com adapter [PLANNED]
- Custom provider adapters [PLANNED]

**17.6 Collaboration & Management**
- Demo mode (synthetic data or read-only instance)
- Settings management (connections, endpoints)
- Multi-user support with basic authentication [PLANNED]
- Role-based access control (RBAC) [PLANNED]
- Team workspaces/environments [PLANNED]
- Audit trails and compliance logs [PLANNED]

**17.7 Alerting & Notifications**
- Email notifications on failures [PLANNED]
- Slack integration [PLANNED]
- Webhook notifications [PLANNED]
- Custom alert rules [PLANNED]
- Alert escalation policies [PLANNED]
- On-call scheduling [PLANNED]

**17.8 Developer Experience**
- Developer mode UI toggle [POST-MVP]
- Console-style logs [POST-MVP]
- JSON data inspection [POST-MVP]
- API access for programmatic queries [PLANNED]
- Webhook integration for external tools [PLANNED]
- CLI for configuration management [PLANNED]

**17.9 Enterprise Features**
- SSO/SAML authentication [PLANNED]
- Advanced RBAC with custom roles [PLANNED]
- White-labeling [PLANNED]
- Custom data retention policies [PLANNED]
- SLA tracking and reporting [PLANNED]
- Priority support channels [PLANNED]

18. Technical Constraints (Licensing Considerations)

**18.1 Resource-Intensive Features**

*High Storage Impact:*
- Execution history retention (grows linearly with execution volume)
- Endpoint check history (periodic polling creates significant data)
- Flowchart caching (large graph structures for complex workflows)
- Export file generation (temporary storage for CSV/JSON exports)
- Audit trails (full history of user actions and changes)

*High Compute Impact:*
- Real-time streaming logs (WebSocket connections, continuous processing)
- Multi-execution comparison (graph diff algorithms, memory-intensive)
- Advanced query builder (complex aggregations and joins)
- Trend chart generation (time-series calculations across large datasets)
- Duration percentile calculations (statistical processing)

*High Network Impact:*
- Multiple provider instance polling (concurrent API calls)
- Real-time notifications (persistent connections, push infrastructure)
- Webhook delivery (retry logic, queue management)

**18.2 Features with Ongoing Costs**

*External Service Dependencies:*
- Email notifications (SendGrid, SES, or similar - cost per email)
- Slack integration (API rate limits, potential premium features)
- SMS alerts (Twilio or similar - high cost per message)
- SSO/SAML providers (Auth0, Okta - per-user licensing)

*Infrastructure Scaling:*
- Real-time streaming requires WebSocket infrastructure
- Multi-tenant workspaces need isolation (separate databases or strict RLS)
- Alerting requires background job processing (queue systems, workers)
- Advanced analytics may need dedicated analytics database (ClickHouse, TimescaleDB)

**18.3 Implementation Complexity**

*Easy to Gate (Technical Perspective):*
- Instance count limits (simple configuration check)
- Time range restrictions (UI + API validation)
- Export format availability (feature flag)
- UI mode toggles (frontend-only feature flags)
- Endpoint monitoring count limits (simple quota check)
- Data retention periods (scheduled cleanup jobs)

*Moderate Complexity to Gate:*
- Multi-provider support (requires adapter infrastructure)
- Advanced filtering/saved views (needs additional data models)
- Alerting channels (requires integration architecture)
- User/team management (authentication/authorization layer)

*Hard to Gate (Significant Technical Overhead):*
- RBAC (requires complete permission system redesign)
- Multi-tenant workspaces (data isolation, complex migrations)
- SSO integration (enterprise identity provider setup)
- White-labeling (theming system, build pipeline changes)
- Audit trails (comprehensive event tracking infrastructure)
- SLA tracking (complex time-based calculations, uptime metrics)

**18.4 Performance Considerations by Feature**
- Basic dashboard: <100ms response time, minimal compute
- Execution list (1000s records): Requires pagination, indexing
- Flowchart rendering: Client-side compute, scales with workflow complexity
- Real-time streaming: Requires persistent connections, high memory usage
- Multi-execution comparison: Memory-intensive, can be resource-limited
- Advanced analytics: May require pre-computation, caching strategies

19. User Personas (Detailed for Licensing)

**19.1 Solo Developer / Maker (Community Tier Target)**

*Profile:*
- Individual developer or small side project owner
- 1-5 workflows in production
- Self-hosted n8n instance (single server)
- Limited budget (free or <$10/month)
- Technical capability: Medium to high

*Pain Points:*
- Needs basic visibility into workflow health
- Wants to know when things break (simple alerts)
- No budget for enterprise monitoring tools
- Doesn't need team collaboration features
- Occasional debugging, not 24/7 operations

*Key Features Needed:*
- Single n8n instance connection
- Basic dashboard and execution history
- Flowchart viewer for debugging
- Simple endpoint monitoring (2-3 URLs)
- 7-day data retention sufficient

*Acceptable Limitations:*
- No team features
- Limited data retention
- No advanced alerting
- Community support only

**19.2 Small Team / Startup (Pro Tier Target)**

*Profile:*
- 2-10 person team
- 10-50 workflows across multiple projects
- 2-3 n8n instances (dev, staging, production)
- Budget: $50-200/month for tools
- Mix of technical and operational roles

*Pain Points:*
- Need reliable monitoring across environments
- Multiple team members need access
- Require alerting (Slack, email) for failures
- Want better analytics for optimization
- Need to justify automation ROI to stakeholders

*Key Features Needed:*
- Multiple n8n instances (2-5)
- Extended data retention (30-90 days)
- Slack/email notifications
- Basic team access (5-10 users)
- Trend charts and analytics
- Export capabilities for reporting
- Endpoint monitoring (10-20 URLs)

*Willing to Pay For:*
- Reliable alerting
- Multi-instance support
- Better analytics/reporting
- Email support

**19.3 Agency / Consultancy (Business Tier Target)**

*Profile:*
- Manages workflows for 5-20 clients
- 50-200+ workflows across client projects
- Multiple n8n instances per client
- Budget: $200-500/month
- Need client isolation and reporting

*Pain Points:*
- Managing many client environments
- Need to demonstrate value to clients
- Require per-client reporting and analytics
- Want white-labeling for professional image
- Need workspace isolation for security/compliance

*Key Features Needed:*
- Unlimited or high instance limits (20-50)
- Workspace/environment isolation
- Extended data retention (6-12 months)
- White-labeling options
- Advanced analytics and custom reports
- Multi-user with basic RBAC
- Priority support

*Willing to Pay For:*
- Professional appearance (white-labeling)
- Client isolation features
- Advanced reporting
- Priority support

**19.4 Enterprise (Enterprise Tier Target)**

*Profile:*
- Large organization (50+ employees in ops/automation)
- 200+ critical workflows
- Multiple providers (n8n, Zapier, Make)
- Complex compliance requirements
- Budget: $500-2000+/month
- Dedicated automation/ops team

*Pain Points:*
- Need complete visibility across all automation platforms
- Strict security and compliance requirements
- Require audit trails and governance
- Need SSO integration with existing identity provider
- Want SLA tracking and uptime guarantees
- Require dedicated support and SLAs

*Key Features Needed:*
- Unlimited instances across multiple providers
- SSO/SAML authentication
- Advanced RBAC with custom roles
- Audit trails and compliance logging
- Unlimited data retention or custom policies
- SLA tracking and reporting
- Dedicated support, custom onboarding
- API access for integration
- On-premises deployment options

*Willing to Pay For:*
- Enterprise security features
- Compliance and audit capabilities
- Multi-provider support
- Dedicated support and SLAs
- Custom integrations

20. Current Thinking on Tiering Structure

**20.1 Community Tier (Free)**

*Philosophy:*
- Enable solo developers and hobbyists to use core features
- Showcase the product's value proposition
- Create a pipeline for paid conversions
- Limit features that have ongoing operational costs

*Proposed Limitations:*
- 1 n8n instance connection only
- 7-day data retention
- 3 endpoint monitors maximum
- No alerting/notifications (email, Slack)
- No export capabilities
- No advanced analytics (trends, percentiles)
- Community support only (GitHub issues, Discord)
- No team collaboration features

*Included Features:*
- Full dashboard access
- Execution list and detail views
- Workflow list and metrics
- Flowchart viewer with failure highlighting
- Basic filtering and search
- Instance health monitoring
- Demo mode

*Reasoning:*
- Single instance limit is easy to enforce and drives upgrades
- 7-day retention reduces storage costs significantly
- Core debugging features remain available (flowchart viewer)
- No alerting avoids ongoing notification costs
- Creates clear upgrade path when scaling

**20.2 Pro Tier ($29-49/month)**

*Philosophy:*
- Target small teams and growing startups
- Unlock operational features needed for production use
- Enable basic collaboration

*Proposed Limitations:*
- 5 n8n instance connections
- 30-day data retention
- 20 endpoint monitors
- 5 team members
- Email support (48h response time)

*Included Features (beyond Community):*
- Multiple instance support
- Email + Slack notifications
- Export to CSV/JSON
- Trend charts and basic analytics
- Extended data retention
- Basic team access
- Priority bug fixes

*Reasoning:*
- 5 instances covers dev/staging/prod + small expansion
- 30-day retention balances storage vs. value
- Alerting justifies monthly fee (high perceived value)
- Price point attractive to small teams with budget

**20.3 Business Tier ($149-249/month)**

*Philosophy:*
- Target agencies and mid-size companies
- Enable client management and professional presentation
- Provide advanced analytics for ROI justification

*Proposed Limitations:*
- 50 n8n instance connections
- 90-day data retention
- 100 endpoint monitors
- 20 team members
- Email + chat support (24h response time)

*Included Features (beyond Pro):*
- Workspace/environment isolation
- White-labeling (logo, colors)
- Advanced analytics (percentiles, duration analysis)
- Custom saved views and filters
- Webhook notifications
- Basic RBAC (admin, member, viewer roles)
- Priority support

*Reasoning:*
- 50 instances supports agency client management
- White-labeling has high perceived value for agencies
- Workspace isolation enables secure client separation
- Price point aligns with agency tool budgets

**20.4 Enterprise Tier (Custom Pricing)**

*Philosophy:*
- No artificial limits on scale
- Full security and compliance features
- Multi-provider support
- Dedicated support and custom integration

*Proposed Features:*
- Unlimited instances across n8n, Zapier, Make
- Custom data retention (1 year+)
- Unlimited endpoint monitors
- Unlimited team members
- SSO/SAML authentication
- Advanced RBAC with custom roles
- Audit trails and compliance logging
- SLA tracking and reporting
- API access for programmatic integration
- On-premises deployment option
- Dedicated support with SLA
- Custom onboarding and training
- Priority feature requests

*Reasoning:*
- Custom pricing allows for scale-based pricing
- Enterprise features (SSO, RBAC, audit) justify premium
- Multi-provider support is key differentiator at this level
- Dedicated support is expected by enterprise buyers
- On-premises option critical for compliance-heavy industries

**20.5 Additional Tier Considerations**

*Feature Gating Decisions:*
1. **Cron Job Management** → Business tier and above (reasoning: critical for production operations, moderate implementation complexity)
2. **Multi-execution comparison** → Pro tier and above (reasoning: debugging tool, technically resource-intensive)
3. **Real-time streaming logs** → Business tier and above (reasoning: high infrastructure cost, WebSocket overhead)
4. **Developer mode UI** → Pro tier and above (reasoning: appeals to technical users willing to pay)
5. **Flowchart export** → Pro tier and above (reasoning: professional documentation need)

*Growth Path:*
- Community → Pro: Triggered by hitting instance limit or needing alerts
- Pro → Business: Triggered by client management needs or team growth
- Business → Enterprise: Triggered by compliance requirements or multi-provider needs

21. Competitive Analysis (Pricing & Features)

**21.1 Direct Competitors**

*n8n Cloud (Native Platform):*
- Pricing: $20-240/month based on executions
- Strengths: Native integration, execution-based pricing
- Weaknesses: Only n8n, no cross-platform visibility
- Our Advantage: Multi-provider support, better visualization

*Zapier Analytics (Native Platform):*
- Pricing: Included in plans ($19.99-$103.50+/month)
- Strengths: Built-in, no setup
- Weaknesses: Basic analytics, limited debugging tools
- Our Advantage: Visual debugging, endpoint monitoring integration

*Make.com Reports (Native Platform):*
- Pricing: Included in plans ($9-$29+/month)
- Strengths: Visual execution logs
- Weaknesses: Only Make.com, limited analytics
- Our Advantage: Cross-platform, advanced analytics

**21.2 Indirect Competitors**

*Datadog (APM):*
- Pricing: $15-31+/user/month + infrastructure costs
- Strengths: Comprehensive monitoring, mature platform
- Weaknesses: Complex setup, expensive, overkill for workflows
- Our Advantage: Purpose-built for automation workflows, lower cost, easier setup

*Grafana + Prometheus (Self-Hosted):*
- Pricing: Free (self-hosted) or $8-50+/user/month (Cloud)
- Strengths: Highly customizable, open source
- Weaknesses: Requires manual setup, steep learning curve, generic
- Our Advantage: Out-of-box workflow monitoring, no configuration needed

*ELK Stack (Log Aggregation):*
- Pricing: Free (self-hosted) or $95-175+/month (Elastic Cloud)
- Strengths: Powerful search, flexible
- Weaknesses: Complex setup, resource-intensive, generic
- Our Advantage: Workflow-specific, easier to use, visual debugging

**21.3 Pricing Positioning**

*Market Positioning Strategy:*
- Community: Free (vs. competitors: N/A or trial-only)
- Pro: $29-49/month (vs. competitors: $15-50/month)
- Business: $149-249/month (vs. competitors: $100-300/month)
- Enterprise: Custom (vs. competitors: $500-2000+/month)

*Value Proposition by Tier:*
- Community: Better than native free tiers, demonstrates value
- Pro: Comparable to single-platform solutions, but cross-platform
- Business: Less than APM tools, more than native analytics
- Enterprise: Competitive with enterprise monitoring, unique capabilities

*Price Sensitivity Analysis:*
- Solo developers: Very price sensitive, free is critical
- Small teams: Moderate sensitivity, $50/month threshold
- Agencies: Lower sensitivity, value-focused, $200/month acceptable
- Enterprise: Price insensitive, focused on capabilities and support

22. Target Pricing Ranges

**22.1 Recommended Pricing Strategy**

*Community Tier: $0*
- Goal: User acquisition, product validation
- Target: 70% of total users
- Conversion goal: 10-15% to Pro within 6 months

*Pro Tier: $39/month (or $390/year with 17% discount)*
- Goal: Monetize small teams and power users
- Target: 25% of total users
- Justification: Priced between native analytics ($20) and full APM ($50+)

*Business Tier: $199/month (or $1990/year with 17% discount)*
- Goal: Capture agencies and mid-market
- Target: 4% of total users
- Justification: Significantly cheaper than enterprise APM, includes white-labeling

*Enterprise Tier: Custom ($500-2000+/month)*
- Goal: High-value customers with specific needs
- Target: 1% of total users, 40-50% of revenue
- Pricing factors: Instance count, users, providers, support SLA, deployment

**22.2 Alternative Pricing Models to Consider**

*Execution-Based Pricing:*
- Pros: Aligns cost with usage, familiar model
- Cons: Unpredictable billing, complex to calculate, harder to gate features
- Verdict: Not recommended for MVP; consider for future

*Per-Instance Pricing:*
- Pros: Simple to understand, scales with customer growth
- Cons: May discourage multi-environment best practices
- Verdict: Use as add-on ($10/instance above tier limit)

*Hybrid Model (Base + Usage):*
- Example: Pro $39/month + $5 per additional instance
- Pros: Predictable base, flexible scaling
- Cons: More complex to communicate
- Verdict: Consider for v2.0

23. User Flow & Screenshots (To Be Created)

**23.1 Key User Flows to Document**
1. Initial setup and provider connection
2. Dashboard overview and health check
3. Investigating a failed execution (click through to flowchart)
4. Setting up endpoint monitoring
5. Configuring Slack notifications (Pro tier)
6. Creating a workspace (Business tier)
7. Setting up SSO (Enterprise tier)

**23.2 Critical Screenshots Needed**
- Dashboard with executive summary
- Execution list with filters active
- Execution detail view with error
- Flowchart viewer with failed node highlighted
- Endpoint monitoring configuration
- Settings page with tier upgrade CTA
- Workspace management (Business tier)

24. Glossary
- Provider: An automation platform (e.g., n8n, Zapier, Make.com).
- Adapter: Implementation that maps provider APIs to the app's domain model.
- Flowchart: A visual representation of a workflow graph (nodes/edges) across providers.
- Instance: A single provider installation or account connection (e.g., one n8n server).
- Workspace: Isolated environment for organizing workflows and teams (Business tier+).
- Execution: A single run of a workflow with a defined start and end state.
