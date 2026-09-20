# Cognitive Report Content Completion

This change completes the participant-facing V2 report projection shared by the current nine product-available Cognitive tasks and the later Cognitive task set.

## Scope

- carry profile-specific `reportCaveats` into the V2 report payload and render them;
- expose `research_only` metrics only for the Research profile and keep them hidden for Experience / Standard / invalid results;
- attach a participant-safe metric description to every projected metric;
- replace raw internal category/taxonomy fallback text with a direction-aware participant explanation;
- add curated Chinese explanations for participant-visible metrics used by the current nine product-available tasks;
- preserve Experience headline hardening, Memory/Stroop anti-strategy filtering, quality gating, invalid fail-closed behavior, reference suppression, and runtime/scoring contracts.

## Shared effect on later Cognitive tasks

The caveat projection, Research-only projection, invalid hiding, and safe explanation fallback are implemented in the shared V2 report layer and therefore apply to all task definitions that use that layer, including the later task set.

Task-specific scientific wording remains content-owned. Later tasks automatically receive a safe non-taxonomy fallback, but their final publication review should still replace generic wording with task-specific copy where stronger construct-level explanation is warranted.

## Non-goals

- no scorer changes;
- no trial protocol changes;
- no DB migration;
- no norm/reference policy change;
- no Research Grade claim.
