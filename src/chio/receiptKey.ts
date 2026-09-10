import { createHash } from "node:crypto";

/** Correlate only an exact host session and tool invocation, never a timestamp. */
export function receiptKey(sessionId: string, toolUseId: string): string {
  return createHash("sha256").update(JSON.stringify([sessionId, toolUseId])).digest("hex");
}
