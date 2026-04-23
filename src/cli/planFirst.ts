import { planFirstWrap } from "./run.js";

/**
 * `chio-codex plan-first "<prompt>"`
 *
 * Utility: returns the given prompt wrapped with a plan-first instruction
 * so Codex emits a fenced ```plan block we can fingerprint in the
 * UserPromptSubmit hook. Pipe the output into `codex` directly, or use
 * `chio-codex run --plan-first -- codex "..."` to wrap in-line.
 */
export function planFirstCmd(args: string[]): string {
  const prompt = args.join(" ");
  if (!prompt) throw new Error("chio-codex plan-first: <prompt> required");
  return planFirstWrap(prompt);
}
