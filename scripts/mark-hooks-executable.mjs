#!/usr/bin/env node
// After tsc builds dist/, the compiled hook + CLI entrypoints need the
// exec bit and a .mjs extension so Codex's hooks.json and the `chio-codex`
// bin shim can exec them directly. We copy dist/hooks/*.js to *.mjs and
// chmod +x both sets.

import { readdirSync, copyFileSync, chmodSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const distRoot = join(__dirname, "..", "dist");

for (const [dir, opts] of [
  ["hooks", { mjs: true }],
  ["cli", { mjs: false }],
]) {
  const full = join(distRoot, dir);
  if (!existsSync(full)) continue;
  for (const f of readdirSync(full)) {
    if (!f.endsWith(".js")) continue;
    const src = join(full, f);
    if (opts.mjs) {
      const dst = src.replace(/\.js$/, ".mjs");
      copyFileSync(src, dst);
      chmodSync(dst, 0o755);
    } else {
      chmodSync(src, 0o755);
    }
  }
}
