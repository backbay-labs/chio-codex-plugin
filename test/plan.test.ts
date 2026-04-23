import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canonicalizePlanInput,
  fingerprintPrompt,
  fingerprintPlanText,
  extractPlanBlock,
  sha256Hex,
} from "../src/chio/plan.ts";

test("fingerprintPrompt returns a full 64-hex SHA-256 digest", () => {
  const hash = fingerprintPrompt({
    prompt: "migrate users from mongo to postgres",
    cwd: "/home/me/project",
    model: "gpt-5-codex",
  });
  assert.equal(hash.length, 64, `expected 64-char hex, got ${hash.length}`);
  assert.match(hash, /^[0-9a-f]{64}$/);
});

test("fingerprintPrompt canonical order is stable across key order", () => {
  // canonicalizePlanInput sorts keys (cwd, model, prompt) regardless of
  // call-site construction, so the hash is deterministic.
  const a = fingerprintPrompt({ prompt: "p", cwd: "/c", model: "m" });
  const b = fingerprintPrompt({ model: "m", cwd: "/c", prompt: "p" });
  assert.equal(a, b);
});

test("canonicalizePlanInput omits undefined fields", () => {
  const text = canonicalizePlanInput({ prompt: "p" });
  assert.equal(text, `{"prompt":"p"}`);
});

test("fingerprintPlanText normalizes CRLF", () => {
  const a = fingerprintPlanText("step 1\nstep 2");
  const b = fingerprintPlanText("step 1\r\nstep 2");
  assert.equal(a, b);
});

test("extractPlanBlock finds fenced plan block", () => {
  const prompt = [
    "intro",
    "```plan",
    "1. dry-run",
    "2. commit",
    "```",
    "postscript",
  ].join("\n");
  assert.equal(extractPlanBlock(prompt), "1. dry-run\n2. commit");
});

test("extractPlanBlock returns undefined when no plan is embedded", () => {
  assert.equal(extractPlanBlock("just a prompt"), undefined);
});

test("sha256Hex matches the Node crypto reference", () => {
  // sanity: matches a known hash
  assert.equal(
    sha256Hex("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});
