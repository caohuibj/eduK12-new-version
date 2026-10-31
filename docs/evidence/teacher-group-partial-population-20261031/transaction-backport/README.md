# Current partial-population consumer with the existing transaction correction

Prepared source5ab02e35a7a4ef71f17ad3e41e42c8ae62d165d7 retains PR429 actual-contributor semantics and the reviewed same-transaction Artifact correction brought forward to PR428. Conflict resolution preserves beforePersist, per-metric contributor membership and alias comparison, uses the lock-owning tx for both prior-disclosure queries and persistence, and reads after commit. The runtime and schema are unchanged outside that reviewed correction.

Both current complete component trees were compiled once with stable input receipts. Backend b94bb0efbbc2e5fd32a0755571fd28368dce159c; frontend a53564bc774639ea9211bd6924a3fadad321c171. The identical frontend is reusable by the aligned native-leaf slice. Original partial-population, pointer-page and transaction-expiry observations keep their source identities and are not replayed. This is not a fresh FINAL, PG, browser or formal CI run.
