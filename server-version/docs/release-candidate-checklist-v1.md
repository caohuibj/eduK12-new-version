# Milestone F Release Candidate Checklist v1

**候选版本：** eduK12 + Cognitive Core v1
**状态：** APPROVED FOR MILESTONE G REVIEW
**日期：** 2026-08-20

## F Gate

- [x] Cognitive regression PASS
- [x] Repository regression PASS after approved baseline closeout
- [x] Baseline closeout report completed
- [x] Fresh migration validation PASS
- [x] Docker config/build/startup PASS
- [x] Backend/frontend build PASS
- [x] Session ownership/history security tests PASS
- [x] Cognitive data integrity checks PASS
- [x] Known limitations documented

## G Handoff

- [x] Release scope limited to eduK12 + Cognitive Core + Reaction/Memory/Stroop + Results/History
- [x] Published engine/scoring/config versions recorded
- [x] Production configuration template defaults Cognitive flags to enabled
- [x] Release notes and deployment/rollback checklist prepared
- [ ] `dev` approved and merged through repository review
- [ ] `main` updated through repository review
- [ ] `v1.0.0` tag created and pushed

The three unchecked items are repository release operations, not unverified product behavior; they require the authorized GitHub review/release step.
