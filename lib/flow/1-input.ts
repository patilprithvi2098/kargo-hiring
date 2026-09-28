import "server-only";
import type { Role } from "../rubric";

// COMPONENTS MAP — TRIGGER + INPUT
// Founder uploads a CV file and selects the applied role (PM / SPM).
// This step only turns the file into raw text. Nothing leaves the server here.

export const ACCEPTED = [".pdf", ".docx", ".txt"];
export const MAX_BYTES = 4 * 1024 * 1024; // Vercel request body limit is 4.5 MB

export type CvInput = { filename: string; role: Role; rawText: string };

export async function readCvFile(file: File, role: Role): Promise<CvInput> {
  const name = file.name;
  const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
  if (!ACCEPTED.includes(ext)) throw new Error(`Unsupported file type ${ext} — use PDF, DOCX or TXT`);
  if (file.size > MAX_BYTES) throw new Error("File is larger than 4 MB");

  const buf = Buffer.from(await file.arrayBuffer());
  let rawText = "";
  if (ext === ".pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    rawText = text;
  } else if (ext === ".docx") {
    const mammoth = await import("mammoth");
    rawText = (await mammoth.extractRawText({ buffer: buf })).value;
  } else {
    rawText = buf.toString("utf8");
  }

  rawText = rawText.replace(/\u0000/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (rawText.length < 200) {
    throw new Error("Could not read enough text from this file (scanned image PDF?)");
  }
  return { filename: name, role, rawText };
}

/** Role from the filename convention pm_* / spm_*, else the role the founder picked. */
export function roleFromFilename(filename: string, fallback: Role): Role {
  const f = filename.toLowerCase();
  if (f.startsWith("spm_")) return "SPM";
  if (f.startsWith("pm_")) return "PM";
  return fallback;
}
