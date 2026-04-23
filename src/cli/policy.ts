import { buildBridge } from "../chio/bridge.js";
import { getSoleBond } from "../chio/state.js";

export async function policyCmd(): Promise<string> {
  const bond = getSoleBond();
  if (!bond) return "chio · no active bond · nothing to print";
  const bridge = buildBridge();
  const policy = await bridge.loadPolicy(bond.policyPath);
  const lint = await bridge.lintPolicy(policy);
  const summary = [
    `chio · policy · ${bond.policyPath}`,
    `  name           ${policy.name ?? "(unnamed)"}`,
    `  version        ${policy.hushspec}`,
    `  rules          ${policy.rules ? Object.keys(policy.rules).join(", ") : "(none)"}`,
    `  extensions     ${policy.extensions ? Object.keys(policy.extensions).join(", ") : "(none)"}`,
    `  lint           ${lint.errors.length} errors, ${lint.warnings.length} warnings`,
  ];
  for (const e of lint.errors) summary.push(`  error · ${e.path}: ${e.message}`);
  for (const w of lint.warnings) summary.push(`  warn  · ${w.path}: ${w.message}`);
  return summary.join("\n");
}
