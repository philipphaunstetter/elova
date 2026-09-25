import assert from "node:assert/strict";
import test from "node:test";
import { resolveSettingsAccess } from "../src/app/settings/workspace-access";

const first = "11111111-1111-4111-8111-111111111111";
const second = "22222222-2222-4222-8222-222222222222";
const workspaces = (role: string, activeWorkspaceId: string = first) => ({
  activeWorkspaceId,
  workspaces: [{ id: first, role }, { id: second, role: "owner" }],
});
const session = (role: string = "user", workspaceId: string | null = first) => ({ user: { role, workspaceId } });

test("current server-reported workspace roles enable only owner and admin connection controls", () => {
  for (const role of ["owner", "admin"]) {
    assert.deepEqual(resolveSettingsAccess(workspaces(role), session(), first),
      { workspaceId: first, role, canManageConnections: true });
  }
  for (const role of ["editor", "viewer"]) {
    assert.deepEqual(resolveSettingsAccess(workspaces(role), session(), first),
      { workspaceId: first, role, canManageConnections: false });
  }
  assert.deepEqual(resolveSettingsAccess(workspaces("viewer"), session("super_admin"), first),
    { workspaceId: first, role: "super_admin", canManageConnections: true },
    "the separate global role retains capability without silently changing workspace membership");
})

test("downgrade, removal, unknown roles and stale two-tab selection fail closed", () => {
  assert.equal(resolveSettingsAccess(workspaces("editor"), session(), first)?.canManageConnections, false);
  assert.equal(resolveSettingsAccess(workspaces("owner", second), session("user", second), first), undefined);
  assert.equal(resolveSettingsAccess(workspaces("owner"), session("user", second), first), undefined);
  assert.equal(resolveSettingsAccess({ activeWorkspaceId: first, workspaces: [] }, session(), first), undefined);
  assert.equal(resolveSettingsAccess(workspaces("owner"), session("user", null), first), undefined);
  assert.equal(resolveSettingsAccess(workspaces("unknown"), session(), first), undefined);
  assert.equal(resolveSettingsAccess(workspaces("unknown"), session("super_admin"), first), undefined);
  assert.equal(resolveSettingsAccess(workspaces("owner"), session("unexpected"), first), undefined);
  assert.equal(resolveSettingsAccess(workspaces("super_admin"), session("user"), first), undefined);
  assert.equal(resolveSettingsAccess(null, session(), first), undefined);
})
