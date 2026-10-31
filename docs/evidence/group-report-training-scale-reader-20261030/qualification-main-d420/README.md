# PR424 local preparation against the aligned PR423 candidate

The new worktree merged c7940ed885ed52243dd05447460a45ac05bec759 without conflicts. The complete backend tree is exactly 7955b8d801126e4cf952a1e979833bdd7aef2895, already compiled successfully in the retained Legacy compatibility receipt. The complete frontend tree is exactly 6dd9390e0104306cad051c7048aac9b05c82e27a, already compiled successfully for PR423 on main d420. Neither compiler is replayed.

The two original application cases and the pointer-picker read-only continuation retain their identities. All report-reader production and test bytes match the previously reviewed Legacy candidate; the Legacy start change does not alter the report reader's inputs or result contract. The original N=5, mean .4, actual snapshot/read and zero result/runtime reader counters remain original observations, not a new execution.

This is local preparation only. PR423 retargeting was rejected by automatic approval review; no retry, PR424 remote mutation, CI activation or merge is performed by this preparation. Formal source/merge binding awaits the actual accepted parent/base, using the existing route rather than a new gate.
