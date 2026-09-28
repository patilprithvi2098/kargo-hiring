"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { timingSafeEqual } from "node:crypto";
import { createSession, SESSION_COOKIE } from "@/lib/session";

export async function login(_: string | null, form: FormData): Promise<string | null> {
  const name = String(form.get("name") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const expected = process.env.DASHBOARD_PASSWORD ?? "";
  if (!name) return "Enter your name — every decision and send is recorded against it.";
  const a = Buffer.from(password);
  const b = Buffer.from(expected);
  if (!expected || a.length !== b.length || !timingSafeEqual(a, b)) return "Wrong password.";
  const s = await createSession(name.slice(0, 60));
  (await cookies()).set(SESSION_COOKIE, s.value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: s.maxAge,
    path: "/",
  });
  redirect("/");
}
