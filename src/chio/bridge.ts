import { ChioBridge } from "@chio/bridge";

/**
 * Construct a ChioBridge from environment. Codex plugin options, per the
 * Codex plugin spec, land in env as CODEX_PLUGIN_OPTION_* when users
 * configure the plugin; we also honor plain CHIO_* for CLI users. Precedence:
 *   1. CHIO_SERVICE_TOKEN (+optional CHIO_TRUST_URL/CHIO_MCP_EDGE_URL) set
 *      → daemon mode against `chio trust serve` / `chio mcp serve-http`.
 *   2. Otherwise → CLI mode (shell out to `chio`).
 *
 * Note: there is no standalone chio daemon on 4821. All HTTP goes to the
 * chio trust plane (default 127.0.0.1:8940) and chio MCP edge (default
 * 127.0.0.1:8931).
 */
export function buildBridge(): ChioBridge {
  const token =
    process.env["CHIO_SERVICE_TOKEN"] ??
    process.env["CODEX_PLUGIN_OPTION_SERVICE_TOKEN"];
  const trustUrl =
    process.env["CHIO_TRUST_URL"] ??
    process.env["CODEX_PLUGIN_OPTION_TRUST_URL"];
  const mcpEdgeUrl =
    process.env["CHIO_MCP_EDGE_URL"] ??
    process.env["CODEX_PLUGIN_OPTION_MCP_EDGE_URL"];
  const chioBinary =
    process.env["CHIO_BINARY"] ??
    process.env["CHIO_BIN"] ??
    process.env["CODEX_PLUGIN_OPTION_CHIO_BINARY"] ??
    "chio";

  if (token) {
    return ChioBridge.fromDaemon({
      token,
      ...(trustUrl ? { trustUrl } : {}),
      ...(mcpEdgeUrl ? { mcpEdgeUrl } : {}),
    });
  }
  return ChioBridge.fromCli({ chioBinary });
}

export function getDefaultPolicyPath(): string | undefined {
  return (
    process.env["CHIO_POLICY_PATH"] ??
    process.env["CODEX_PLUGIN_OPTION_POLICY_PATH"] ??
    undefined
  );
}
