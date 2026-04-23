import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Plugin-local state lives under the user's Codex plugin cache. One JSON
 * file holds the current per-session bonds, keyed by Codex session_id; we
 * also dump per-tool-call pending receipts and a per-session transcript of
 * summaries into sibling dirs so slash commands and the Stop hook can read
 * them without threading state through Codex itself.
 */
export const STATE_DIR = join(homedir(), ".codex", "plugins", "chio-codex");
export const STATE_PATH = join(STATE_DIR, "state.json");
export const PENDING_DIR = join(STATE_DIR, "pending");
export const RECEIPT_CACHE_DIR = join(STATE_DIR, "receipts");
export const TRANSCRIPT_DIR = join(STATE_DIR, "transcripts");
