import "server-only";
import { cookies } from "next/headers";
import { readSession, SESSION_COOKIE } from "./session";

/** Reviewer name from the signed session cookie, or null. */
export async function getReviewer(): Promise<string | null> {
  const jar = await cookies();
  return (await readSession(jar.get(SESSION_COOKIE)?.value))?.reviewer ?? null;
}

export function unauthorized() {
  return Response.json({ error: "Not signed in" }, { status: 401 });
}

export function fail(e: unknown, status = 500) {
  return Response.json({ error: (e as Error)?.message ?? String(e) }, { status });
}
