import "server-only";
import { env } from "./env";

// Minimal Gemini client: JSON-schema output, retries on overload, model fallback.
// Only ever receives PII-stripped content (see lib/flow/2-context.ts).

type Schema = Record<string, unknown>;

const FALLBACK_MODELS = ["gemini-3.5-flash", "gemini-flash-latest", "gemini-3.5-flash-lite"];
const RETRYABLE = new Set([429, 500, 502, 503, 504]);
/** Models whose daily quota is spent (per server instance). */
const exhausted = new Set<string>();

export async function generateJson<T>(opts: {
  system: string;
  prompt: string;
  schema: Schema;
  temperature?: number;
}): Promise<T> {
  const models = [env.geminiModel(), ...FALLBACK_MODELS.filter((m) => m !== env.geminiModel())];
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: opts.system }] },
    contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
    generationConfig: {
      temperature: opts.temperature ?? 0.2,
      responseMimeType: "application/json",
      responseSchema: opts.schema,
    },
  });

  const errors: string[] = [];
  // Try the configured model first (both API versions), then fallbacks. Overload (503/429) is
  // retried with backoff; "model not found" (404) moves on immediately.
  const targets = models.flatMap((m) => [`v1/models/${m}`, `v1beta/models/${m}`]);
  for (const model of targets) {
    if (exhausted.has(model.split("/").pop()!)) continue;
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetch(`https://generativelanguage.googleapis.com/${model}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": env.geminiKey() },
        body,
      });
      if (res.ok) {
        const data = await res.json();
        const parts: { text?: string; thought?: boolean }[] = data?.candidates?.[0]?.content?.parts ?? [];
        const text = parts.filter((p) => !p.thought && p.text).map((p) => p.text).join("");
        try {
          return JSON.parse(text) as T;
        } catch {
          errors.push(`${model}: unparseable JSON`);
          continue;
        }
      }
      const raw = await res.text();
      const detail = raw.replace(/\s+/g, " ").slice(0, 120);
      errors.push(`${model} HTTP ${res.status}${detail ? ` ${detail}` : ""}`);
      if (res.status === 404 || res.status === 400) break;
      // Daily quota spent: this model is done for the day on both API versions — move on now.
      if (res.status === 429 && /PerDay/i.test(raw)) {
        exhausted.add(model.split("/").pop()!);
        break;
      }
      if (!RETRYABLE.has(res.status)) throw new Error(`Gemini ${errors.at(-1)}`);
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
    }
  }
  throw new Error(`Gemini failed after retries — ${errors.slice(-4).join(" | ")}`);
}
