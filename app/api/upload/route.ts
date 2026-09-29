import { fail, getReviewer, unauthorized } from "@/lib/auth";
import { getCandidate } from "@/lib/db";
import { roleFromFilename } from "@/lib/flow/1-input";
import { processUpload } from "@/lib/flow/pipeline";
import type { Role } from "@/lib/rubric";

export const maxDuration = 120;

// TRIGGER: founder uploads one CV + selects the role.
export async function POST(req: Request) {
  if (!(await getReviewer())) return unauthorized();
  try {
    const form = await req.formData();
    const file = form.get("file");
    const picked = form.get("role");
    if (!(file instanceof File)) return fail("No file uploaded", 400);
    // "AUTO_PM" / "AUTO_SPM": use the pm_ / spm_ filename prefix when present, else the picked role
    const valid = ["PM", "SPM", "AUTO_PM", "AUTO_SPM"];
    if (typeof picked !== "string" || !valid.includes(picked)) return fail("Select PM or SPM", 400);
    const base = picked.replace("AUTO_", "") as Role;
    const role: Role = picked.startsWith("AUTO_") ? roleFromFilename(file.name, base) : base;
    const id = await processUpload(file, role);
    const c = await getCandidate(id);
    return Response.json({
      id,
      role,
      status: c?.pipeline_status,
      error: c?.pipeline_error,
      score: c?.scores?.[role]?.total ?? null,
    });
  } catch (e) {
    return fail(e, 400);
  }
}
