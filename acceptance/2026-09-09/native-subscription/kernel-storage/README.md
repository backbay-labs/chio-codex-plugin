# Kernel storage and bounded operating cost followup

The frozen `ac4f14ee4073abdc0c9ff2b4771e99adf7a871d084a9b488513f5d28eae56874`
package passed three actual native Codex kernel-storage fault cases and three
paired healthy read observations. Confidence is high for these selected cases.
Source runtime remains `e3df90372bb68f15470eded19ef294968d60523d`, kernel binary
SHA256 `33dd1dea21a4ca5ecddeab4f30f6b06b0b90c513f0987aef552b0633d9da1e25`,
Codex 0.153.4 and live gpt-5.5. No runtime rebuild was performed. The original
gate review and prior failed observations remain unchanged. Publication is a
separate requirement.

## Actual kernel storage failures

Each case first completed one fully acknowledged native write on its fresh
dedicated owner. The fault controller held `BEGIN IMMEDIATE` on the selected
actual SQLite database, then released it with rollback. After-effect cases held
the genuine resource reply until an independent observer established the effect
and the selected write lock was active. No database rows, schema, authority
clocks or journals were edited.

| Case | Owner port | New fault effects | Native outcome | New effects on each retry |
|---|---:|---:|---|---:|
| Receipt store unavailable after effect | 58517 | 1 | Unknown, no host ACK | 0 |
| Admission store unavailable before dispatch | 58518 | 0 | Unknown, no host ACK | 0 |
| Admission outcome store unavailable after effect | 58519 | 1 | Unknown, no host ACK | 0 |

Retries used the original action, a distinct action, and the original action
after an ordinary restart of the same owner. Original configuration and journal
bytes remained unchanged. No new session or authority was used for recovery.
The files and durable resource audit were independently observed at each stage.

[Results](storage/results.json), [raw case identity](storage/identity.json),
[request-specific database review](storage/database-state-review.json) and the
[original followup](storage/FOLLOWUP.md) retain the exact evidence. The database
review establishes that the before-admission fault has no admitted operation,
the receipt-store fault retains its owner result but stays fenced, and the
outcome-store fault transitions from `dispatch_committed` to
`outcome_unknown_after_dispatch` after restart. The signed credential call and
latch remain fenced in all three cases.

These observations close the selected kernel SQLite unavailability gap in the
prior gate review. They do not claim arbitrary disk corruption, every possible
serialization failure, or a hardware signer outage. The selected software
Ed25519 primitive has no recoverable signing-failure branch; receipt persistence
is fallible and is exercised here. Safe refusal and retained unknown outcomes
are demonstrated; automatic reconciliation of unresolved storage faults is not
claimed.

## Three paired healthy read observations

A separate new healthy owner used the same frozen kernel/resource image and one
unchanged native authority for all three reads of `/workspace/timing.txt`. An
acknowledged native write seeded the file. The direct control used the identical
resource image and audit server, mounting that same resource volume readonly
with separate ephemeral audit storage. The direct control was operator-only and
had no kernel capability; its authority was limited by the readonly mount.
Native calls retained the same original selected-tool grant and policy scope.

The native JSONL has no tool-event timestamps. Explicit trusted-parent
instrumentation therefore records two narrower boundaries. The outer interval
runs from the native HTTP request reaching the gateway through response
serialization, immediately before `ServerResponse.end` writes the tool result.
It includes request ingestion, bridge journal work, the kernel exchange and
evidence verification. The inner interval starts at kernel `tools/call` fetch
and ends when the SDK consumes the terminal response. The retained records name
the actual stream completion boundary. Both exclude model work, launcher
startup and the subsequent host-delivery ACK. Instrumentation logging can add
some cost inside the outer interval.

The warm direct interval starts at MCP stdin write/flush and ends at the parsed
matching response. It includes Docker stdio transport, the resource audit fsync
and file read. Container startup and MCP initialization are excluded. The
transport paths differ, so the differences below are descriptive stage
differences, not isolated plugin overhead.

| Pair | Order | Native gateway interval | Inner kernel exchange | Warm direct MCP | Gateway minus direct | Kernel minus direct |
|---|---|---:|---:|---:|---:|---:|
| 1 | Native, direct | 562.852 ms | 521.196 ms | 16.207 ms | 546.645 ms | 504.989 ms |
| 2 | Direct, native | 889.419 ms | 817.974 ms | 5.531 ms | 883.888 ms | 812.444 ms |
| 3 | Native, direct | 1188.671 ms | 1132.096 ms | 87.110 ms | 1101.560 ms | 1044.985 ms |

[All raw pairs](timing/pairs.json), [instrumented identity](timing/identity.json),
[independent final result](timing/result.json) and
[matched native/direct contents](timing/result-equality.json) are retained.
Exactly three new native read dispatches occurred; all three results were
verified and acknowledged, and the file stayed unchanged. The native raw output,
direct request/response and individual monotonic timestamps are preserved for
each pair. These three non-randomized local observations are not a population
estimate or a general throughput/latency claim. Pure plugin overhead is unknown.

The [first instrumentation attempt](timing-instrumentation-attempt/FAILED-INSTRUMENTATION.json)
remains failed: its seed write completed and was acknowledged, but the
`response.text` timestamp hook missed the SDK's streamed response. It contains
zero accepted pairs. Corrected instrumentation captures stream completion;
the successful three pairs have a separate identity and owner. No fault-owner
state was reset or reused for timing.

## Operation, reproduction and archival

The storage controller recorded all [15 native launcher durations and operator
interventions](storage/operational-cost.json). Those whole-launcher durations
include provider work; startup cannot be isolated from their preparation and
shutdown residuals. The original note's absent paired baseline is now followed
by the three separately identified read observations above. It remains truthful
for the original storage run.

Storage fault tests require explicit dedicated-owner setup, one fully ACKed
positive control, a selected SQLite lock, a faulted native call, lock rollback,
same/new-action retries and one same-owner restart. Healthy timing required one
new owner/scope, one native seed write and one readonly direct control process;
no manual approvals, journal repair or operator intervention occurred between
the three native reads. These setup/fault-test interventions are not ordinary
per-call requirements.

The owning repository retains the executed harnesses under
`scripts/qualify-kernel-storage.py`, `scripts/qualify-subscription-timing.py` and
`scripts/subscription-timing.mjs`. Their `--help` contracts require explicit
artifact paths, private authentication/configuration and disposable output.
Native invocation records and owner-start commands preserve exact arguments;
the identity files bind the executed source hashes. The timing hook is test-only
operator instrumentation and is not distributed as a supported runtime change.

[Storage manifest](STORAGE-ARCHIVE-MANIFEST.json) and
[timing manifest](TIMING-ARCHIVE-MANIFEST.json) preserve every copied source byte
and its SHA256, without omissions. `CREDENTIAL-SCAN.json` records a bounded
known-value/provider-pattern scan. `SHA256SUMS` covers every file here except
itself. No private operator configuration, provider account cache or installed
dependency tree was copied. Absolute paths in raw observations identify their
original execution environment, not hidden installation dependencies.
