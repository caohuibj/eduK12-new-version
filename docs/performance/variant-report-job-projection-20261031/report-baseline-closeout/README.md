# PR450 qualification after control simplification

Base `a58a16dcdd3998e5262e89a677ff716b8a15b6e7` includes #445, #447, #448 and #461. All 23 original public objects from `64fa9e53` remain unchanged. The only application change is the reviewed seven-field report-job projection and its direct test.

Reuse three distinct actual Vitest assertions: two candidate cases and one existing consumer extracted without changing the original reporter bytes. The 16 compressed originals, failed baselines and filtered cases remain intact. No business, PostgreSQL or FINAL replay was performed. The synthetic two-row result changed from 25 to 7 fields and from 114035 to 4719 serialized JSON bytes; this does not establish production latency, CPU, network, capacity or storage savings.

One final backend `tsc --noEmit` ran on Node 24.21.0 and exited 0 in 36.329 seconds. Its actual producer is `fb535587ccca4c505079b208f36dc2b6b5008b2d`, with backend tree `b1db0d6e6ff86ca1a23e02b8138347de178b07fa`. This candidate has that same complete backend tree. The receipt is copied unchanged; no new execution identity is claimed. Original dependency limitations remain visible. The final compiler used the existing isolated, lock-patched dependency copy with selected input hashes, without claiming a clean install or complete installation-byte attestation.

The existing route adds only #450 source, branch, admission and affected SAST membership, plus its required backend type receipt. It retains #461 behavior: snapshot only controls modified by this PR; inherit unchanged controls from the actual main base. All 34 prior candidate values and root metadata remain unchanged, including PR381's existing enabled state and historical authorization summaries. The earlier one-case control result retains its original association and was not rerun during this alignment.

This is a local disabled candidate. Publication awaits the specific consent request; formal CI, Ready, merge and production actions have not occurred.
