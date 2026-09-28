import { fail, getReviewer, unauthorized } from "@/lib/auth";
import { getCandidate, updateCandidate } from "@/lib/db";

// Founder edits the draft by hand. Edited drafts are never overwritten by the system.
export async function POST(req: Request, ctx: RouteContext<"/api/candidates/[id]/email">) {
  if (!(await getReviewer())) return unauthorized();
  const { id } = await ctx.params;
  const { subject, body } = await req.json();
  if (typeof subject !== "string" || typeof body !== "string" || !subject.trim() || !body.trim()) {
    return fail("Subject and body are required", 400);
  }
  const c = await getCandidate(id);
  if (!c) return fail("Not found", 404);
  if (c.email_status === "sent") return fail("Already sent", 400);
  await updateCandidate(id, { email_subject: subject, email_body: body, email_edited: true });
  return Response.json({ ok: true });
}
