# Elova native frontend/backend operations

Status: historical native artifact packaging plus reviewed host templates; the VPS native frontend install was not run. The selected but unactivated frontend direction is the [separate Docker-provider plan](vps-frontend-container.md), not these service activation steps. Packaging runs only in the build workspace. **Nothing in `ops/` is installed or executed on the VPS or GX10 by this repository change.** This change does not create users, install packages, deploy releases, run migrations, start or restart services, or alter the VPS, GX10, Tailnet, DNS, firewall, PostgreSQL, Docker Hub, credentials, n8n, or any external system.

The first vNext slice runs without containers:

| Host | Unix user (non-login) | Package identity | Unit | Bind | Readiness |
| --- | --- | --- | --- | --- | --- |
| Public VPS | `elova-frontend` | `@elova/frontend` | `elova-frontend.service` | `127.0.0.1:43180` only | `http://127.0.0.1:43180/api/v1/health/ready` |
| Private GX10 | `elova-backend` | `@elova/backend` | `elova-backend.service` | the address in `ELOVA_BACKEND_HOST` on `tailscale0`, port `43181` | `http://<tailnet-address>:43181/v1/health/ready` |

The frontend's public TLS reverse proxy is outside this slice. It must proxy browser requests to the loopback frontend; it must never expose GX10 directly. PostgreSQL is reachable only on GX10 by authorized backend and operator processes. Tailnet transport identity does not replace the signed owner session required by product endpoints.

## Day-one operator checklist (not an authorization to deploy)

**Repository provides:** the PostgreSQL-only `0001_postgres_authority.sql` and additive `0002_workspaces.sql` schema migrations, the ordered migration command, one-time `bootstrap-owner` command, native backend/frontend builds and install-free archives, SHA-256 files, root-operated guarded release helper, systemd templates, example environment *keys*, and synthetic/ephemeral CI verification. Pulling this repository onto either host alone installs nothing and does not configure PostgreSQL. The current public Docker artifact is unaffected.

**Supply/approve separately before the window:** a dedicated backed-up *empty* GX10 PostgreSQL database and local-only role/connection with permission to create the initial schema and write application tables (the current migration unit and runtime share `DATABASE_URL`; do not mistake this for a read-only runtime role); independent protected keys and owner bootstrap credentials; approved GX10 `tailscale0` address, VPS-to-GX10 Tailnet policy and firewall; supported host packages, non-login service users, protected env files and installed units; VPS DNS/TLS/reverse proxy to loopback; trusted archive transfer and digest; a backup/restore and incident owner. The repository does **not** provision any of these. Separating migration and runtime database roles would require a reviewed design change; do not silently grant database superuser or remote-access privileges. For an existing database or legacy-data import, stop for a separately reviewed migration plan rather than applying the initial schema blindly.

**Safe order (on approved hosts only):**

1. In a clean, locked checkout on a trusted **build workspace**, run `npm ci`, then follow the [release artifact build command](#release-artifact-contract). The synthetic build URL is not the runtime target. Record the commit SHA and transfer each archive **with its independently checked SHA file** and reviewed helper/templates. A host-side `git pull` is only source checkout, not an activation; do not run a build as root or from a dirty checkout. Verify the transferred digest against the trusted build record before continuing.
2. On GX10, provision the separately approved local PostgreSQL database/role and `/etc/elova/backend.env`; on VPS configure `/etc/elova/frontend.env`. Keep `DATABASE_URL` and both keys only on GX10, never on VPS. Confirm Tailnet/private bind and public proxy boundaries. Review/install only each host's own unit(s) and the helper, then `systemctl daemon-reload` as separately authorized.
3. On each host run the helper's **read-only** artifact `preflight --dry-run` and full host `preflight`; resolve failures. On GX10, stage the backend; verify backup and migration SQL; explicitly migrate the staged backend release. Only after successful migration and separate approval, bootstrap the owner once using the protected local password-file handoff below; check database state if acknowledgement is uncertain. Never expose a public signup path.
4. Activate the backend and require PostgreSQL/migration readiness; then stage and activate the frontend and require its BFF readiness. Verify the VPS loopback listener, public TLS proxy to the frontend only, authenticated login, and absence of a public GX10/database listener. Configure n8n through the authenticated owner settings only after service health. Preserve logs, artifact hashes and rollback/forward-fix decision ownership.

**Stop conditions:** any missing separate authorization, backup, clean artifact provenance, private route, database/secret, unit or readiness check is a blocker for live bring-up. No live host/database/network state was verified by this repository; passing local or CI tests cannot certify tomorrow's hosts. A failed migration or changed migration count is a forward-fix/restore decision, not permission to down-migrate or roll back the backend.

## Preconditions owned by the operator

Do not continue until every applicable item is true. The helper's `preflight` reads and verifies these conditions but does not create them.

### Both hosts

- A supported Linux/systemd host exists and has `systemd-analyze`, Node.js, npm, `tar`, `sha256sum`, `curl`, `flock`, `ip`, and `ss` available on the unit/helper paths.
- Time synchronization and host patching are in place.
- A root operator has reviewed the templates and the exact release digest.
- The dedicated user and same-named group exist with a non-login shell and no password. They are different users; neither is a member of the other service group. For example, an operator may use `useradd --system --user-group --home-dir /nonexistent --no-create-home --shell /usr/sbin/nologin elova-frontend` on the VPS and the corresponding `elova-backend` command on GX10.
- `/etc/elova` and the relevant environment file have been created outside all release artifacts. The file is a regular, non-symlink file owned `root:<service-user>` with mode `0640`; `/etc/elova` should be root-owned mode `0750` or stricter.
- The reviewed unit(s) are installed under `/etc/systemd/system/`, and systemd has been reloaded. Installing units and enabling services are manual, separately authorized host changes—not actions performed here.
- `/opt/elova/ops/bin/elova-native-release` is an operator-reviewed copy of the helper. Release directories are on one local filesystem so a symlink rename is atomic.
- Backups, monitoring, log retention, capacity, and an incident rollback owner are in place.

### Tailnet, DNS, and firewall

- The VPS and GX10 are already enrolled in the intended Tailnet. Their identity, device approval, key expiry, ownership, and ACL/grant policy have been reviewed.
- GX10 has a stable address assigned to `tailscale0`; this exact address is `ELOVA_BACKEND_HOST`. Wildcard and loopback binds are rejected.
- The VPS can reach GX10 TCP port `43181` over the Tailnet, and no public interface can reach that port. Any host or network firewall changes require separate authorization.
- **Before activation on each actual host**, check that its chosen native TCP port is not occupied by another process or interface: `sudo ss -H -ltnp 'sport = :43180'` on VPS and `sudo ss -H -ltnp 'sport = :43181'` on GX10. For a first activation each must show no listener. For a later release only the existing `elova-frontend.service` listener on `127.0.0.1:43180` or `elova-backend.service` listener on the intended `tailscale0` address at `:43181` may remain. Resolve conflicts before continuing; do not kill an occupant or change a port without reviewing the matching unit, URL, proxy, and policy together. The helper checks listeners during explicit read-only `preflight` and rechecks after release validation, immediately before changing links and restarting the unit on activation or rollback. Staging and migration do not require the service port to be free. These local checks cannot certify another host or future availability. No real host port availability is claimed here.
- `ELOVA_BACKEND_URL` is the credential-free private GX10 Tailnet HTTP origin with explicit port `43181`, using a Tailnet IP or fully qualified MagicDNS `.ts.net` name. Production must not use HTTPS, a public, loopback, or unqualified hostname origin, or a `NEXT_PUBLIC_` alias.
- Public DNS/TLS and the VPS reverse proxy are already configured separately. No DNS or proxy configuration is included here.

### PostgreSQL and integrations

- PostgreSQL already exists on GX10, is backed up, and accepts the backend only through a same-host Unix socket or TCP loopback. Remote database hosts are rejected; TLS is not mandatory for these same-host transports. Database provisioning, roles, grants, socket/listener policy, backup policy, and credentials are outside this slice.
- `DATABASE_URL` references the intended production database and least-privilege runtime/migration role chosen by the operator, with either an explicit loopback host or an absolute Unix-socket `host` query parameter. It appears only in `/etc/elova/backend.env`; frontend preflight rejects any definition in `/etc/elova/frontend.env`, and it must never enter a frontend artifact, journal, command line, or log.
- `ELOVA_SESSION_SECRET` and `ELOVA_CREDENTIAL_KEY` are independent, base64-encoded 32-byte values delivered out of band. They appear only in the protected backend environment. Losing either requires an explicit session or credential recovery decision; never rotate them casually.
- Ordered forward migrations for the release have been reviewed and tested against a restored backup. A migration-count change is an irreversible application-release boundary: the retained backend cannot be restored, and recovery requires a forward fix.
- n8n origins and credentials are entered only after owner login in authenticated settings. Origins are immutable provider identities; a different n8n instance requires a separate connection so prior histories are never mixed or deleted.

## Release artifact contract

The integration build runs `npm run package:native -- <output-directory>` and supplies one gzip tar archive plus a separately transported SHA-256 file per service. The archive:

1. contains exactly one top-level directory;
2. contains no symlinks, special files, absolute paths, or `..` traversal;
3. is complete and prebuilt—deployment never runs dependency installation or build scripts;
4. has a top-level `package.json` named exactly `@elova/frontend` or `@elova/backend` with a `start` script;
5. for the backend, has an explicit `migrate` script and a release-owned `migrations/` directory; the script applies those ordered migrations and exits nonzero on incompatibility.

The SHA file starts with the archive's 64-digit SHA-256 digest. Credentials and environment files are never in the archive. A release ID should be an immutable build identifier such as the full Git commit SHA; it is limited to letters, digits, dots, underscores, and hyphens.

From a clean locked checkout with dependencies installed and an output directory **outside the checkout**, create both prebuilt, install-free archives and checksums with:

```sh
ELOVA_BACKEND_URL=http://100.100.10.20:43181 npm run package:native -- /path/to/output
```

The build-only private URL is synthetic and is not a deployment target. The packager refuses tracked edits, untracked files, and frontend environment files (including ignored files) even when `ELOVA_BUILD_ID` is set; it then removes prior backend and frontend generated output, derives `ELOVA_BUILD_ID` from the checked-out commit unless an immutable source identifier is supplied explicitly, then performs a fresh build. It also rejects environment files from either staged release before archiving. The command emits `elova-frontend.tgz`, `elova-backend.tgz`, and a matching `.sha256` file for each. It does not install or deploy anything. CI verifies that stale generated files cannot enter either archive, then validates the archives through the release helper, extracts them into isolated staging directories, runs the packaged migration command, and starts the packaged services without dependency installation before checking health and the BFF boundary.

Releases are staged under `/opt/elova/<service>/releases/<release-id>`, root-owned and non-writable. `current` and `previous` are relative symlinks. Each operation takes `/run/lock/elova-<service>-deploy.lock`. The append-only operational record is `/var/lib/elova/releases/<service>/journal.jsonl`; it contains no secrets. Activation retains `current`, `previous`, and at most one additional recent release.

## Review and install the templates

These are instructions for a separately authorized maintenance window, not actions performed by this change.

1. Review `ops/systemd/*.service`, `ops/bin/elova-native-release`, and the environment examples.
2. Check the repository copies without installing them:

   ```sh
   systemd-analyze verify ops/systemd/elova-frontend.service \
     ops/systemd/elova-backend.service \
     ops/systemd/elova-backend-migrate@.service
   bash -n ops/bin/elova-native-release ops/bin/elova-package-native ops/tests/test-native-release.sh ops/tests/test-package-provenance.sh
   ops/tests/test-native-release.sh
   ops/tests/test-package-provenance.sh
   ```

3. After separately authorizing host changes, install only the relevant files. On the VPS that is the frontend unit; on GX10 that is the backend and migration units. Preserve root ownership and non-writable modes.
4. Create the environment file from the relevant example. Replace every example value; never deploy the example credentials or addresses. Do not put `HOSTNAME` or `PORT` in the frontend file, or `PORT` in the backend file; the units pin the binds shown in the host topology table above.
5. Run `systemd-analyze verify` on the installed units, then `systemctl daemon-reload`. Enabling or starting units is a distinct operator decision and is not part of template installation.

The units run with dedicated users, a strict read-only filesystem view, no capabilities, no privilege escalation, private temporary/devices, protected kernel/control-group settings, a restrictive umask, `SIGTERM` with a 30-second stop timeout, and `Restart=on-failure`. The standalone Next.js frontend exits with status 143 after `SIGTERM`; its unit accepts that status as successful shutdown so an intentional stop does not trigger a failure restart. Writable state is restricted to systemd-managed `/var/lib/elova/<service>` and `/run/elova/<service>` paths. Application startup never runs a migration.

## Guarded deployment sequence

Set local shell variables without embedding secrets:

```sh
helper=/opt/elova/ops/bin/elova-native-release
artifact=/path/from/trusted-transfer/elova-release.tgz
digest=/path/from/trusted-transfer/elova-release.tgz.sha256
release=<full-build-commit-sha>
```

### 1. Dry-run and explicit preflight

Dry-run validates the digest, archive safety, package identity, and start script without examining or changing a host:

```sh
sudo "$helper" preflight --service frontend --artifact "$artifact" --sha256-file "$digest" --release "$release" --dry-run
```

Then run the explicit read-only host preflight by omitting `--dry-run`. It verifies tools, non-login user, installed units, environment ownership/mode, required variables, local TCP port conflicts, and (for backend) that the bind address is assigned to `tailscale0`. Use `sudo` so `ss -p` can verify listener ownership:

```sh
sudo "$helper" preflight --service frontend --artifact "$artifact" --sha256-file "$digest" --release "$release"
```

Use `--service backend` on GX10. Resolve every failure; do not bypass a check.

### 2. Stage an immutable release

First inspect the plan, then use the explicit mutation gate:

```sh
sudo "$helper" stage --service frontend --artifact "$artifact" --sha256-file "$digest" --release "$release" --dry-run
sudo "$helper" stage --service frontend --artifact "$artifact" --sha256-file "$digest" --release "$release" --apply
```

Staging verifies the SHA again, extracts into a temporary directory, checks package identity, removes write permission, records the event, and stops. It does not change a symlink, migrate, touch a service, or check service-port occupancy.

### 3. Run the backend migration explicitly

There is no migration for the frontend. On GX10, review the migration plan and current database backup before running:

```sh
sudo "$helper" migrate --service backend --release "$release" --dry-run
sudo "$helper" migrate --service backend --release "$release" --apply
```

The helper invokes only `elova-backend-migrate@<release>.service`, waits for success, and writes the verified staged-artifact digest into a release-specific success marker outside the artifact. Migration does not require an unused backend service port. A release identity with an existing migration record cannot be staged again, and activation refuses a missing or artifact-mismatched marker. It does **not** activate or restart the API. The API unit runs only `npm start`; it never invokes migration implicitly.

### 3a. Bootstrap the sole super administrator separately

**Not executed by this repository; requires separately approved host/release authority.** After applying both ordered migrations, an authorized operator may create the one global super-administrator and their actual `admin workspace`. Verify the captain-selected identifier through the approved operator channel and receive the chosen password through a protected local handoff, never chat, shell arguments, environment values, CI, repository or logs. A legacy owner's identifier cannot be reused or silently promoted. The CLI requires `ELOVA_BOOTSTRAP_EMAIL`, `ELOVA_BOOTSTRAP_NAME`, and `ELOVA_BOOTSTRAP_PASSWORD_FILE`; the latter contains only the password (an optional final newline is stripped). `ELOVA_BOOTSTRAP_PASSWORD` is rejected. The password file must be a regular non-symlink absolute path, readable by the bootstrap process UID, **exactly mode 0400**, between 12 and 256 password characters, on protected ephemeral storage. Its path may be supplied in the environment, but never its contents. For container mode, a separately reviewed one-off container mount must make the file accessible to UID 10001; do not add it to the always-on backend or publish any host port. Use the separately approved Elova-only application database credential, not a shared DBA password. In container mode `DATABASE_URL_FILE` uses the existing protected mount; native bootstrap uses local-only `DATABASE_URL`. Run the command under the designated backend identity after migration, not as a root convenience shell.

Immediately remove the password handoff file on success or failure and inspect the super-administrator count and the chosen identifier on uncertain outcomes before retrying. The transaction locks initial enrollment and writes the super administrator, personal workspace and owner membership atomically. Existing ordinary users remain isolated and do not close bootstrap; only an existing super administrator closes it permanently. Migration backfills legacy personal workspaces and owner memberships without recreating or promoting users. After a **separate** approval, an operator may provision a non-admin user through `node dist/src/provision-user.js` using `ELOVA_USER_EMAIL`, `ELOVA_USER_NAME` and `ELOVA_USER_PASSWORD_FILE` with the **same protected file requirements** as the first bootstrap; each person chooses their own password through the protected handoff, never chat, arguments, environment values or logs. `ELOVA_USER_PASSWORD` is rejected. The ordinary user starts with no membership; an owner/global admin may attach only an already-provisioned confirmed identity under [fixed workspace permissions](workspace-permissions.md). Do not perform or infer an invitation, consent, key exchange or live user creation from this documentation. Never reset/drop the database to repeat bootstrap. No public signup or browser enrollment exists. This runbook does not authorize running either command or accessing production credentials.

There is deliberately **no down/destructive migration procedure**. If a forward migration fails, stop, preserve logs, leave the current release running, and escalate to the database/release owner. Restore or corrective-forward-migration decisions require separate authorization. Backend symlink rollback is prohibited whenever the current and retained releases have different migration counts, including additive changes. Exact-count readiness remains fail-closed; recovery across that boundary requires a forward fix.

### 4. Activate and converge health

After migration (backend) and within the authorized service window:

```sh
sudo "$helper" activate --service frontend --release "$release" --dry-run
sudo "$helper" activate --service frontend --release "$release" --apply
```

Use `--service backend` on GX10. Before changing links, activation rejects any backend target with fewer migrations than the current release and requires a forward fix. After validating the release, it rechecks the local listener immediately before changing links and restarting the unit; a conflict stops activation without changing links. Otherwise activation atomically preserves the old `current` as `previous`, changes `current`, restarts only the named service, and polls the fixed readiness path for up to 60 seconds. Convergence requires the listener process to belong to the named systemd unit and the response to match the ready JSON contract; backend readiness must also carry `X-Elova-Api-Version: 1`. A failed convergence restores the prior links and preserves whether the prior service was active or stopped before recording failure when restoration does not cross a backend migration-count boundary. A previously active service must reacquire unit-owned readiness before restoration is reported; any restart, readiness, stop, or link restoration failure is reported as requiring operator intervention. When counts differ, the helper leaves the migrated release selected, stops the unhealthy service, records failure, and requires a forward fix instead of restoring an incompatible release. Inspect `journalctl -u elova-frontend.service` or the corresponding backend/migration unit without copying environment values into tickets.

Recommended order is backend stage → explicit backend migration → backend activation/readiness → frontend stage → frontend activation/readiness. Coordinate compatibility so either frontend can safely use either retained backend during the window.

## Symlink rollback

Rollback changes no database state and runs no migration. Review the plan and the `previous` target, then:

```sh
sudo "$helper" rollback --service frontend --dry-run
sudo readlink -f /opt/elova/frontend/{current,previous}
sudo "$helper" rollback --service frontend --apply
```

Use `--service backend` on GX10. Backend rollback also requires that the previous release has an artifact-matching successful migration marker and exactly the same migration count as the current release. Any count mismatch is rejected before links or services change and must be resolved with a forward fix; operator claims of forward compatibility do not override this gate. Equal counts do not guarantee compatibility, so the helper rechecks the local listener immediately before swapping `current` and `previous`, restarts only that service, and requires fail-closed readiness. On failed readiness it restores the pre-rollback links and preserves whether the prior service was active or stopped; a previously active service must reacquire unit-owned readiness, and any restoration failure is reported as requiring operator intervention. Never attempt a down migration as part of rollback.

## Evidence and incident checks

- `systemctl status elova-frontend.service` / `elova-backend.service`
- `journalctl -u <unit> --since <window>` and the migration instance on GX10
- `curl --fail http://127.0.0.1:43180/api/v1/health/ready` on VPS
- `curl --fail http://<tailnet-address>:43181/v1/health/live` and `/v1/health/ready` on GX10
- `/var/lib/elova/releases/<service>/journal.jsonl`
- resolved `current` and `previous` symlink targets and the deployed artifact digest

A liveness response proves only that the process serves requests. Readiness is the activation gate because backend readiness includes PostgreSQL reachability and migration compatibility. The backend allows up to three seconds to connect to PostgreSQL and two seconds for each of its two dependency queries. The frontend allows eight seconds for that complete backend check, and the release probe allows nine seconds for the frontend wrapper and response handling.
