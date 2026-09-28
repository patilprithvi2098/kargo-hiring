// Shared by the server pipeline and the dashboard, so both rank identically.
import { MIN_INVITE_SCORE, SHORTLIST_SIZE, type Role } from "./rubric";
import type { Candidate } from "./db";

export type Ranked = Candidate & {
  rank: number;
  total: number;
  mismatch: Role | null;
  /** Names of other candidates with the same CV text. */
  duplicateOf: string[];
};

/** Rank candidates who applied for `role`: those passing the role floor first, then by rubric score. */
export function rankRole(all: Candidate[], role: Role): Ranked[] {
  const other: Role = role === "PM" ? "SPM" : "PM";
  const byHash = new Map<string, Candidate[]>();
  for (const c of all) if (c.content_hash) byHash.set(c.content_hash, [...(byHash.get(c.content_hash) ?? []), c]);
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
      const dupes = (c.content_hash && byHash.get(c.content_hash)) || [];
      return {
        ...c,
        rank: i + 1,
        total: own,
        mismatch: alt >= own + 10 ? other : null,
        duplicateOf: dupes.filter((d) => d.id !== c.id).map((d) => d.name ?? d.cv_filename),
      };
    });
}

/**
 * Invite only if in the top N, above the role floor, AND scoring at least MIN_INVITE_SCORE.
 * A small or weak pool must not turn "top 5" into an invite for a 31.
 */
export const recommendationFor = (rank: number, passesFloor: boolean, total: number) =>
  rank <= SHORTLIST_SIZE && passesFloor && total >= MIN_INVITE_SCORE ? ("invite" as const) : ("decline" as const);

/** Where the shortlist line sits: halfway between the last shortlisted score and the next one. */
export function shortlistLine(ranked: Ranked[]): number | null {
  const eligible = ranked.filter((r) => r.scores[r.role_applied]?.passes_floor);
  if (eligible.length <= SHORTLIST_SIZE) return null;
  return (eligible[SHORTLIST_SIZE - 1].total + eligible[SHORTLIST_SIZE].total) / 2;
}
