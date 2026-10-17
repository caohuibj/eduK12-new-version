# Survey measurement extension: cloud candidate

## Scope and scientific status

Survey now has four native tool kinds: Form, Scale, SJT and Cognitive. Existing Form/Scale/SJT v1 frozen publications keep their original scoring semantics. Shared assessment kernels remain authoritative; report and export paths project stored results rather than rerunning scoring.

SJT v2 supports fixed-order mother scenes with multiple single-choice or bounded multiple-choice questions, multi-dimensional matrices, AUTHOR_KEY_SUM and controlled EXPERT_KEY. Question nodes retain distinct scorer keys while coverage uses the original mother scene. Raw selections, missingness and derived scorer selections remain distinguishable. Initial safety bounds: 20 scenes, 10 questions per scene, 100 questions total, 20 metrics, 24 derived choices per question and 16,000 contribution cells. These are input limits, not measured capacity claims.

The only Survey cognitive template is Go/No-Go software-frame-v1: config 1.1.0, engine/scorer 1.0.0, 120 formal trials, 25% No-Go, 800 ms stimulus, 500 ms interstimulus interval, 100 ms minimum RT. It uses the existing seeded sequence and authoritative scorer. It is PILOT, with no normative reference or diagnostic interpretation. Desktop keyboard input is required. A wave can contain up to four tasks (480 formal trials).

## Persistence and recovery

- Admission freezes protocol, seed, slot and epoch and locks preceding ordinary answers.
- Child FINAL stores encrypted raw trials and authoritative metrics once. Concurrent retries return the existing authoritative result; CPU work is not claimed exactly-once.
- Parent FINAL binds the exact reached child reference set: slot, epoch, result ID, result hash and measurement digest. Raw trials are not duplicated in the parent.
- Child access, restart and completion recheck current credential, consent, collection window, withdrawal, HARD_STOP and parent state under transactional locks.
- One interrupted whole-task restart is permitted. Partial trials never resume as a new admission. Existing admissions are distinguished by server-owned freshness metadata.
- A lost last-restart response without a sealed local FINAL can leave no safe continuation. The participant must use the original active tab or contact the researcher. No third epoch is silently granted.
- Confirmed completion/replacement/withdrawal/revocation cleans the matching local Survey drafts. Abandoned local drafts never revisited or withdrawn do not have automatic age-based purging; this maintenance remains unfinished. Cleanup failures are shown without invalidating a confirmed server receipt.
- Unfinalized child data carries a 30-day retention-review marker. No automatic hard deletion was introduced. Withdrawal removes eligibility/access while immutable records remain retained.

## Feedback and exports

GENERAL remains the default. Optional SURVEY_DESCRIPTIVE_V1 feedback permits only hitRate and goMedianRtMs, after parent FINAL or after the collection window has finished. It does not disclose raw trials, seeds, private keys or unrestricted scoring objects.

RAW and SCORE exports retain frozen identity and provenance. COGNITIVE_TRIAL_LONG is researcher-authorized, single-wave, signed and bounded by rows/bytes, with exact child and parent hashes. Software-observed RT is in milliseconds; withheld No-Go RT is null with a reason, never zero. Export creation and download recheck MFA, ownership and source revision. COMPLETE and COMPLETE_EARLY remain distinct.

## Acceptance boundaries

Cloud verification covers schema/scoring contracts, component behavior, real local PostgreSQL races and immutable triggers, loopback HTTP, stored-result export oracles, additive migration of existing synthetic records and restored runtime-role policy. Services use synthetic accounts/data and are stopped after runs.

Real browser rendering, physical keyboard delivery, refresh/visibility behavior on supported browsers and actual frame/timing calibration are deferred to the user's later browser phase. Synthetic trial timestamps, DOM tests and HTTP results do not establish physical measurement validity or production capacity. No deployment is implied.
