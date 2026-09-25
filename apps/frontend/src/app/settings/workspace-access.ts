export type SettingsAccess = {
  workspaceId: string;
  role: "owner" | "admin" | "editor" | "viewer" | "super_admin";
  canManageConnections: boolean;
};

// The workspace list and session are fetched without cache. Neither a remembered role nor a
// selected ID alone is authority: both server responses must still agree on the active workspace.
export function resolveSettingsAccess(workspaces: unknown, session: unknown, workspaceId: string): SettingsAccess | undefined {
  if (!workspaces || typeof workspaces !== "object" || !session || typeof session !== "object") return undefined;
  const list = workspaces as { activeWorkspaceId?: unknown; workspaces?: unknown };
  const user = (session as { user?: unknown }).user;
  if (!user || typeof user !== "object" || !Array.isArray(list.workspaces) ||
      list.activeWorkspaceId !== workspaceId || (user as { workspaceId?: unknown }).workspaceId !== workspaceId) {
    return undefined;
  }
  const selected = list.workspaces.find((item: unknown) => item && typeof item === "object" &&
    (item as { id?: unknown }).id === workspaceId) as { role?: unknown } | undefined;
  if (!selected) return undefined;
  const accountRole = (user as { role?: unknown }).role;
  if (accountRole !== "user" && accountRole !== "super_admin") return undefined;
  const reportedRole = selected.role;
  if (reportedRole !== "owner" && reportedRole !== "admin" && reportedRole !== "editor" &&
      reportedRole !== "viewer" && reportedRole !== "super_admin") return undefined;
  const role = accountRole === "super_admin" ? "super_admin" : reportedRole;
  // Non-admin users cannot claim global access by forging a workspace-list role.
  if (role === "super_admin" && accountRole !== "super_admin") return undefined;
  return { workspaceId, role, canManageConnections: role === "owner" || role === "admin" || role === "super_admin" };
}
