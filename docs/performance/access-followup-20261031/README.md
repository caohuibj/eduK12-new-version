# Access and efficiency follow-up (local only)

Base main0a9c565ce9a46793363fd1b40a3e7a0b1d124019. PR395 and420 were confirmed merged by current GitHub reads. Original performance V2 Notion page406d27635a38819ca344e5dd8074f7fe returned404/object_not_found on2026-10-31; repository roadmap and the current DOT scope apply. No Notion write or alternative-identity retry. Existing other worktree/WIP preserved.

## Questionnaire accepted state and retry

FinalQuestionnaireAssessment now marks the current unit COMPLETED in memory immediately after successful POST, before local cleanup or parent progress reads. Cleanup/reload failure cannot call submission-failure classification or unlock/reseal the accepted unit. Already accepted submit controls and handlers refuse another POST; the committed message outranks the in-flight progress load. This does not claim the parent questionnaire completed or report became readable.

Form uses the existing independent answer/submit controls, like Scale: uncertain sealed answers stay locked while navigation and identical sealed replay remain available. No new engine, cache, API or permissions. Existing Composite accepted handling and Scale replay semantics are the implementation references, not newly replayed qualification.

Three new React/jsdom cases passed: Form ambiguous failure→locked answers/navigation→identical replay; Form accepted→deleted local draft→reload failure→no resubmit; Scale equivalent accepted path. Baseline had both accepted-message failures and, after a selector-only correction, the disabled Form navigation failure. Full original reporter rows, fixture failure and an unchanged-product repeated red invocation caused by an edit cwd error are preserved; no historical failure is relabelled. See questionnaire-recovery/execution.json for exact selections and source hashes. No application build, whole journey, database, CI, upload, merge or deployment.
