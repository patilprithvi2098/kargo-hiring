import "server-only";

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

export const env = {
  supabaseUrl: () => req("SUPABASE_URL"),
  supabaseKey: () => req("SUPABASE_ANON_KEY"),
  dbSecret: () => req("KH_DB_SECRET"),
  geminiKey: () => req("GEMINI_API_KEY"),
  geminiModel: () => process.env.GEMINI_MODEL || "gemini-3.8-flash",
  resendKey: () => process.env.RESEND_API_KEY || "",
  emailFrom: () => process.env.EMAIL_FROM || "Kargo Hiring <onboarding@resend.dev>",
  /** When set, every email goes here instead of the candidate (test mode). */
  emailTestRecipient: () => process.env.EMAIL_TEST_RECIPIENT || "",
};
