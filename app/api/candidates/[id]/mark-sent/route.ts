import { fail, getReviewer, unauthorized } from "@/lib/auth";
import { getCandidate, updateCandidate } from "@/lib/db";
import { recipientFor } from "@/lib/flow/5-email";

// The founder sent the draft himself from his own Gmail (compose window opened by the dashboard).
// The app sent nothing — this only records who sent it and when, so the audit trail stays complete.
export async function POST(req: Request, ctx: RouteContext<"/api/candidates/[id]/mark-sent">) {
  const reviewer = await getReviewer();
  if (!reviewer) return unauthorized();
  const { id } = await ctx.params;
  const { confirmedType } = await req.json().catch(() => ({}));

  const c = await getCandidate(id);
  if (!c) return fail("Not found", 404);
  if (c.email_status === "sent") return fail("Already marked as sent", 400);
  if (!c.email_type) return fail("No draft", 400);
  if (confirmedType !== c.email_type) return fail("Draft changed since you opened it — review again", 409);

  let to: string;
  try {
    to = recipientFor(c.email);
  } catch (e) {
    return fail(e, 400);
  }
  const now = new Date().toISOString();
  await updateCandidate(id, {
    email_status: "sent",
    email_to: to,
    email_error: null,
    sent_at: now,
    sent_by: reviewer,
    send_channel: "gmail",
    decision: c.email_type,
    decided_by: c.decided_by ?? reviewer,
    decided_at: c.decided_at ?? now,
  });
  return Response.json({ ok: true });
}
