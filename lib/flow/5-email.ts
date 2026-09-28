import "server-only";
import { Resend } from "resend";
import { env } from "../env";

// COMPONENTS MAP — EMAIL SERVICE (Resend)
// "Sends email via Resend (when founder clicks send)".
// Only ever called from the Confirm & Send route, one candidate at a time.
// There is no bulk send and no automatic send anywhere in the system (the Cut).

export function personalise(text: string, name: string | null) {
  const first = name?.split(" ")[0] || "there";
  return text.replace(/\[NAME\]/g, first);
}

export async function sendEmail(opts: { to: string; subject: string; body: string }) {
  const key = env.resendKey();
  if (!key) throw new Error("RESEND_API_KEY is not set — add it in Vercel env vars and redeploy");
  const resend = new Resend(key);
  const html = opts.body
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>")}</p>`)
    .join("");
  const { data, error } = await resend.emails.send({
    from: env.emailFrom(),
    to: opts.to,
    subject: opts.subject,
    text: opts.body,
    html,
  });
  if (error) throw new Error(`Resend: ${error.message}`);
  return data?.id ?? null;
}

export function recipientFor(candidateEmail: string | null): string {
  const override = env.emailTestRecipient();
  if (override) return override;
  if (!candidateEmail) throw new Error("No email address found in this CV");
  return candidateEmail;
}
