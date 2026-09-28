// Shared by the server pipeline and the dashboard, so both rank identically.
import { SHORTLIST_SIZE, type Role } from "./rubric";
import type { Candidate } from "./db";

export type Ranked = Candidate & { rank: number; total: number; mismatch: Role | null };

/** Rank candidates who applied for `role`: those passing the role floor first, then by rubric score. */
export function rankRole(all: Candidate[], role: Role): Ranked[] {
  const other: Role = role === "PM" ? "SPM" : "PM";
  return all
    .filter((c) => c.role_applied === role && c.scores?.[role])
    .sort(
      (a, b) =>
        Number(b.scores[role]!.passes_floor) - Number(a.scores[role]!.passes_floor) ||
        b.scores[role]!.total - a.scores[role]!.total ||
        a.created_at.localeCompare(b.created_at),
    )
    .map((c, i) => {
      const own = c.scores[role]!.total;
      const alt = c.scores[other]?.total ?? 0;
      return { ...c, rank: i + 1, total: own, mismatch: alt >= own + 10 ? other : null };
    });
}

/** Invite only if in the top N AND above the role floor — a small pool must not turn "top 5" into "everyone". */
export const recommendationFor = (rank: number, passesFloor: boolean) =>
  rank <= SHORTLIST_SIZE && passesFloor ? ("invite" as const) : ("decline" as const);
