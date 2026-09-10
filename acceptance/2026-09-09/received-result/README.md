# Received-result verification and authority qualification

The previous host-delivery artifact acknowledged an authentic proof despite substituted result bytes. The actual Codex host reported FORGED_HOST_RESULT. Its original read returned a signed tool error because approved.txt does not exist; the fault changed it into forged success. The wrapper exit was already nonzero, but acknowledgement still released the durable fence. This was a failed I06 case.

The replacement verifies the complete received outcome against the original private request and signed result before acknowledging. Both native completion events and the next model request use this check. Changed history is revalidated even for a previously acknowledged request. Invalid received results stop the host and cannot reach the next provider turn.

The cold-installed replacement passed actual-host result substitution, write/edit/read/list, forbidden read and write, lost response with fenced restart and explicit operator recovery, aggregate three-call budget, and seven approval stages. Every run uses independent readonly resource and dispatch observations. The model provider was actual OpenAI, not a fixture. The component suite passed 31 tests with no skips.

The first combined after run accidentally selected the result-substitution injector for its final response-loss case. That invocation failed before host execution. Its files remain under after/host-response-loss and are not a passing case; delivery-loss contains the corrected invocation and complete recovery observations.

The archive is an unpublished candidate. Full I01-I08 acceptance and lifecycle delivery remain open. Earlier budget evidence from the predecessor artifact is superseded by this record's budget run.
