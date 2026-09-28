import { fail, getReviewer, unauthorized } from "@/lib/auth";
import { updateCandidate } from "@/lib/db";
import { runAiSteps } from "@/lib/flow/pipeline";

export const maxDuration = 120;

export async function POST(_: Request, ctx: RouteContext<"/api/candidates/[id]/retry">) {
  if (!(await getReviewer())) return unauthorized();
  const { id } = await ctx.params;
  try {
    await runAiSteps(id);
    return Response.json({ ok: true });
  } catch (e) {
    await updateCandidate(id, { pipeline_status: "error", pipeline_error: (e as Error).message });
    return fail(e);
  }
}
