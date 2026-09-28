// Signed session cookie (HMAC-SHA256 via Web Crypto, so it works in proxy.ts and route handlers).
// Carries the reviewer's name so every decision and send is attributable to a person (Check 09).

export const SESSION_COOKIE = "kh_session";
const MAX_AGE_S = 60 * 60 * 12;

const enc = new TextEncoder();

async function hmac(data: string): Promise<string> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("Missing SESSION_SECRET");
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/[+/=]/g, (c) =>
    c === "+" ? "-" : c === "/" ? "_" : "",
  );
}

const b64 = (s: string) => btoa(unescape(encodeURIComponent(s)));
const unb64 = (s: string) => decodeURIComponent(escape(atob(s)));

export async function createSession(reviewer: string): Promise<{ value: string; maxAge: number }> {
  const payload = `${b64(reviewer)}.${Math.floor(Date.now() / 1000) + MAX_AGE_S}`;
  return { value: `${payload}.${await hmac(payload)}`, maxAge: MAX_AGE_S };
}

export async function readSession(value: string | undefined): Promise<{ reviewer: string } | null> {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [name, exp, sig] = parts;
  if ((await hmac(`${name}.${exp}`)) !== sig) return null;
  if (Number(exp) < Date.now() / 1000) return null;
  try {
    return { reviewer: unb64(name) };
  } catch {
    return null;
  }
}
