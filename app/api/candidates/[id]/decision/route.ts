import { fail, getReviewer, unauthorized } from "@/lib/auth";
import { setDecision } from "@/lib/flow/pipeline";

export const maxDuration = 60;

// Arjun decides: invite or decline. The draft is regenerated to match.
export async function POST(req: Request, ctx: RouteContext<"/api/candidates/[id]/decision">) {
  const reviewer = await getReviewer();
  if (!reviewer) return unauthorized();
  const { id } = await ctx.params;
  const { decision } = await req.json();
  if (decision !== "invite" && decision !== "decline") return fail("Invalid decision", 400);
  try {
    await setDecision(id, decision, reviewer);
    return Response.json({ ok: true });
  } catch (e) {
    return fail(e, 400);
  }
}
