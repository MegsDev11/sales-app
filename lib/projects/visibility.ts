import { can } from "@/lib/access";
import type { User } from "@/lib/types";

/**
 * Shared project visibility rules.
 *
 * Extracted because both /api/projects and /api/scheduler need to answer "may this
 * person see this project?" — the scheduler surfaces project dates on the calendar,
 * and a project you cannot open must not leak its deadlines there. Two copies of
 * this logic would drift, and the drift would be a quiet privacy bug.
 *
 * Mirrors can_see_project() in migration 046. Keep all three in step.
 */

export interface ProjectAuthRow {
  id: string;
  owner_id: string | null;
  is_private: boolean;
}

/** The module grant is a prerequisite; membership scopes which projects you see. */
export function canSeeProject(
  user: User,
  project: ProjectAuthRow,
  memberIds: Set<string>
): boolean {
  if (!can(user, "projects", "view")) return false;
  if (can(user, "projects", "manage")) return true;
  if (project.owner_id === user.id) return true;
  if (memberIds.has(user.id)) return true;
  return !project.is_private;
}

/** Owner, project lead, or a projects manager — and the module at `edit`. */
export function canEditProject(
  user: User,
  project: ProjectAuthRow,
  leadIds: Set<string>
): boolean {
  if (!can(user, "projects", "edit")) return false;
  if (can(user, "projects", "manage")) return true;
  if (project.owner_id === user.id) return true;
  return leadIds.has(user.id);
}

/** Group member rows into per-project sets of all members and of leads. */
export function indexMembers(
  rows: { project_id: string; user_id: string; role?: string }[]
): { members: Map<string, Set<string>>; leads: Map<string, Set<string>> } {
  const members = new Map<string, Set<string>>();
  const leads = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!members.has(r.project_id)) members.set(r.project_id, new Set());
    members.get(r.project_id)!.add(r.user_id);
    if (r.role === "lead") {
      if (!leads.has(r.project_id)) leads.set(r.project_id, new Set());
      leads.get(r.project_id)!.add(r.user_id);
    }
  }
  return { members, leads };
}
