import { redirect } from "next/navigation";
import Dashboard from "@/components/Dashboard";
import { getReviewer } from "@/lib/auth";
import { getRubrics, listCandidates } from "@/lib/db";

// COMPONENTS MAP — OUTPUT
// "Hiring dashboard with ranked candidates, scores, interview brief and draft emails (one-click send)".
export default async function Page() {
  const reviewer = await getReviewer();
  if (!reviewer) redirect("/login");
  const [candidates, rubrics] = await Promise.all([listCandidates(), getRubrics()]);
  return (
    <Dashboard
      reviewer={reviewer}
      candidates={candidates}
      rubrics={rubrics}
      testRecipient={process.env.EMAIL_TEST_RECIPIENT || null}
      resendReady={Boolean(process.env.RESEND_API_KEY)}
    />
  );
}
