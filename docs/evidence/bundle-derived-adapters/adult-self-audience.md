# Frozen adult SELF audience bridge

A frozen source report's display lane and its respondent relationship are distinct. B09 exposed a real mismatch: its PBA report declares ADULT_SELF/parent and BPSES declares ADULT_SELF/student, while the participant-self Bundle projection uses the existing internal student lane. The prior adapter recognized only a teacher display-lane exception.

The new shared predicate is limited to schema3 Bundle-owned SELF narrative, an adult SELF Bundle/slot, an ADULT_SELF source report and a supported self-report source definition. It reuses the existing admission respondent resolver and rejects explicit proxy relationships or asymmetric subject/respondent identities. Existing legacy SELF-surface semantics are retained; no relationship is inferred from userId or from the word parent/teacher. Source numeric/individual-interpretation permissions are never set to true by this bridge.

The source PBA ADULT_SELF/parent contract remains unchanged. Survey now retains the real parent/teacher source lane only when the same predicate validates it, and normalizes only the consumer feedback lane. The frozen source report, policy and original source-audience metadata remain intact. Other-person parent reports, absent report selections, researcher-only selections and historical V2 handling are not promoted into adult SELF.

Three targeted checks used recorded synthetic results without a leaf scorer: the actual saved-reader B09 case keeps111/21 and now returns MATCHED/pa2; an explicit parent-proxy case still withholds pa2 while preserving independent permitted values; and the Survey consumer mapping preserves the source parent contract while rejecting a parent-observer definition. The privately supplied package/test metadata are not included in this public change.

The first focused type check identified one redundant researcher comparison after the existing source-audience type guard had already excluded that value. The redundant comparison was removed; the legacy V2 branch retains its prior researcher handling. No source audience, permission, schema or test assertion was weakened. Corrected type evidence is recorded separately.

B15 Survey boundary remains closed. The existing Survey profile executor admits reaction/Go-No-Go only, its native profile feedback is GENERAL, and its compact saved result does not carry the full frozen report view/verified disclosure intersection required by projectFrozenCognitiveDisclosure. A FrozenReport definition alone is insufficient proof. This change does not widen Cognitive execution, participant feedback or substitute a synthetic Training/FULL_REPORT authorization.

This is a C adapter-only follow-up. No A service, B core, leaf instrument or content package is modified. It remains Draft with [skip ci]; the combined candidate still needs the integration owner's applicable formal checks. No merge, production installation, publish or deployment was performed.
