# Codex kernel storage followup

All three cases passed through native Codex 0.153.4, live gpt-5.5 and the frozen ac4 package. Each used a fresh dedicated owner and first completed a positive call with host delivery acknowledged. The original configuration, journal, session and delegated authority were retained for every retry and owner restart.

| Case | Port | Fault effects | Caller outcome | Effects on each original-authority retry |
|---|---:|---:|---|---:|
| after-receipt | 58517 | 1 | unknown, no host ACK | 0 |
| before-admission | 58518 | 0 | unknown, no host ACK | 0 |
| after-admission | 58519 | 1 | unknown, no host ACK | 0 |

The retries were the same action, a distinct new action, and the original action after restarting the same resource owner. Independent file and audit snapshots remained unchanged across each retry. The bounded storage fault was a SQLite write transaction lock, released with rollback. No database row/schema, journal, authority clock or runtime code was changed.

`database-state-review.json` independently checks the retained request-specific admission rows and signed credential latches: before-admission has no admitted fault operation; after-receipt retains the owner result while delivery stays fenced; after-admission moves from `dispatch_committed` to `outcome_unknown_after_dispatch` after restart. This qualifies the selected storage unavailability paths; it does not claim arbitrary disk corruption or hardware signer outage testing.

## Observed operational cost

| Case | Positive launcher elapsed | Fault launcher elapsed | Positive host window | Fault host window |
|---|---:|---:|---:|---:|
| after-receipt | 9.748s | 15.549s | 8.585s | 14.962s |
| before-admission | 8.751s | 14.461s | 8.077s | 13.756s |
| after-admission | 12.390s | 17.116s | 11.727s | 16.345s |

All elapsed measurements include live model latency. `operational-cost.json` contains the 15 individual launcher durations, recorded host windows, and setup/shutdown residuals. Native tool intervals are unknown because the retained native event frames have no timestamps. Startup is not isolated from teardown; the residual is not labelled startup. No comparable unmediated duration was retained, so incremental mediation overhead is unknown.

Each case required explicit test-controller setup of a dedicated owner and original scoped authority, one acknowledged positive control, one selected SQLite lock, one faulted native call, rollback of that lock, two original-authority retries, one same-owner restart, and one final original-authority retry. These are fault-test interventions, not ordinary per-call operator actions. No new authority or manual journal repair recovered the uncertain call.

If a paired overhead observation is required, the smallest followup is timestamped capture of three identical same-resource native Chio reads paired with an operator-only direct resource read control, retaining every raw interval and difference. That is not part of this evidence and would not isolate provider effects from whole turn elapsed times.

Runtime archive identity and helper/harness hashes are in `identity.json`. Exact native invocations, outputs and independent observer snapshots are retained per case. I08 public release and distribution claims remain separate.
