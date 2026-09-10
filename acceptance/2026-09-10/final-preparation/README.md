# Final candidate preparation

These are local archive lifecycle observations, not real-kernel acceptance or
publication. No kernel ran in these commands. Confidence in the recorded
installation and removal observations is high. Final kernel testing remains open.

The exact original files are retained as deterministic gzip objects. `files.json`
binds every object to its original byte hash and source path. Only evidence
folders were exported; no npm cache, consumer installation, normal profile,
provider credential or private kernel authority was copied.

The unchanged `ac4f14ee4073abdc0c9ff2b4771e99adf7a871d084a9b488513f5d28eae56874`
archive installs offline into a fresh prefix, replacing retained candidate
`740225b7b0bef72634ee6e04b159565f0c75b494a69ce496b6a9b73dcbe50e30`.
Attempt 2 passes upgrade, current help, removal, reinstall and reinstalled help.
All 2,337 regular archive files match the installed bytes. Runtime module hashes
prove that the upgrade changed implementation files.

Attempt 1 is preserved: both npm installations and archive comparisons succeeded,
but the harness incorrectly demanded that the unchanged CLI entrypoint itself
change. The actual restricted runtime changed. The corrected harness compares
all compiled runtime modules rather than that entrypoint.

`qualify-kernel-storage.py` now requires explicit private owner storage and uses
an explicit output subdirectory for every helper command. Invalid duplicate ports
refuse before creating output. `qualify-http-host.py` adds an actual missing-file
error case that requires the exact native call, one independently audited read,
a verified and acknowledged definite tool error, and a non-successful protected
work outcome. Its real-kernel result is pending.
