# Final restricted Codex qualification archive

This directory preserves 552 raw files from `/tmp/chio-codex-subscription-final-20260909` without changing their bytes. `ARCHIVE-MANIFEST.json` records every source-relative path, size and SHA256, plus the explicit omission ledger. The runtime remains source `e3df90372bb68f15470eded19ef294968d60523d`, artifact SHA256 `ac4f14ee4073abdc0c9ff2b4771e99adf7a871d084a9b488513f5d28eae56874`. This archival commit does not rebuild or change that artifact.

Read the unchanged [gate review](GATE-REVIEW.md) alongside the [current scoped matrix](../CURRENT-MATRIX.md). In the review's path aliases, `F` now maps to this archive directory. `C` maps to its parent native-subscription directory and `A` to the parent's authority-and-evidence directory. The other absolute paths identify the original installed consumer and qualification source, not hidden runtime dependencies of this archive.

The excluded trees are five installed `node_modules` trees and eight npm caches. They are reproducible dependency/cache material, not raw host observations. Each omitted tree has a content identity in the manifest. The consumers' package manifests and lockfiles, source/artifact identities, empty-cache install transcripts, host outputs, independent resource snapshots and fault records remain. Symlinks inside omitted trees were counted and not followed. No private operator configuration, native account cache or publisher credential was copied.

The first failed startup, first parallel fixture, and failed nonexistent-file parallel attempt remain in their original folders. Corrected repetitions have separate names. The previous native-subscription evidence and hook-only failures are also retained unchanged.

`CREDENTIAL-SCAN.json` records the bounded exact-value scan against designated provider, publisher, operator and session credentials and an additional provider-token/JWT pattern scan. No credential values were printed or included in the scan report. `SHA256SUMS` covers every file here except itself, including manifests and this note.

The gate review explicitly leaves kernel-internal SQLite store fault qualification and publication unresolved. Subsequent dedicated kernel-storage evidence is owned by a separate lane and must be added as a separately identified record. No full acceptance or publication claim is made by this archive.
