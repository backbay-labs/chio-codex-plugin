#!/usr/bin/env bash
# Real-host contract probe. This is not kernel or integration acceptance.
# Never deletes or edits the operator's normal Codex or Chio state.
set -euo pipefail
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec python3 "${script_dir}/scripts/probe-host-hooks.py" "$@"
