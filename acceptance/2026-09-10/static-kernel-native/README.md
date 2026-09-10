# Codex native static-kernel evidence

See [the qualification record](../../../docs/STATIC-KERNEL-QUALIFICATION.md) for
exact versions, scope, observations and open delivery requirements. This is local
static kernel `c03a8a711dbb...`, not a different hosted binary's acceptance.

`files.json` binds 825 losslessly retained deterministic gzip objects to their
original paths, hashes and byte counts. Decompress once for the original bytes;
source-CI logs were already compressed and require a second decompression to
read. Exact executed driver sources are retained with their own manifests.
Consumer installations, npm caches and private profiles/DBs are excluded.

Attempt 1 preserves the failed timing measurement: the native model made no tool
attempt because the prompt prohibited discovery. The independent observer found
no additional dispatch after its completed seed. Attempt 2 explicitly allows
native discovery in the test prompt and uses a fresh timing owner; the paired
reads and all previously unexecuted cases pass. Runtime archives are unchanged.
The combined collection has no omitted required command but makes no automatic
claim about separate shared matrix or public delivery gates.

Shared capacity pause/resume and completed-owner drain records preserve operator
interventions. Paused outer command durations are not latency measurements.
