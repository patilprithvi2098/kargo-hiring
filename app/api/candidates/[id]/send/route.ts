import { fail, getReviewer, unauthorized } from "@/lib/auth";
import { getCandidate, updateCandidate } from "@/lib/db";
import { personalise, recipientFor, sendEmail } from "@/lib/flow/5-email";

// THE HUMAN BOUNDARY. The only place an email leaves the system:
// one candidate, one click, by a named reviewer, after they have seen the exact text.
export async function POST(req: Request, ctx: RouteContext<"/api/candidates/[id]/send">) {
  const reviewer = await getReviewer();
  if (!reviewer) return unauthorized();
  const { id } = await ctx.params;
  const { confirmedType } = await req.json().catch(() => ({}));

  const c = await getCandidate(id);
  if (!c) return fail("Not found", 404);
  if (c.email_status === "sent") return fail("Already sent", 400);
  if (!c.email_type || !c.email_subject || !c.email_body) return fail("No draft to send", 400);
  if (confirmedType !== c.email_type) return fail("Draft changed since you opened it — review again", 409);

  let to: string;
  try {
    to = recipientFor(c.email);
  } catch (e) {
    return fail(e, 400);
  }
  const now = new Date().toISOString();
  try {
    const resendId = await sendEmail({
      to,
      subject: personalise(c.email_subject, c.name),
      body: personalise(c.email_body, c.name),
    });
    await updateCandidate(id, {
      email_status: "sent",
      email_to: to,
      email_error: null,
      sent_at: now,
      sent_by: reviewer,
      resend_id: resendId,
      // sending IS the decision: record who made it
      decision: c.email_type,
      decided_by: c.decided_by ?? reviewer,
      decided_at: c.decided_at ?? now,
    });
    return Response.json({ ok: true, to, resendId });
  } catch (e) {
    await updateCandidate(id, { email_status: "failed", email_error: (e as Error).message });
    return fail(e, 502);
  }
}
