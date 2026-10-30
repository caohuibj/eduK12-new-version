# Education authoring: post-P6 local review

Base main 4a3aaa2ebbae712002a2d349c5e83368085c437e. No deployment or longitudinal-report changes.

## Confirmed correction

The shared School/Teacher registration panel previously reported a clean draft until preparation completed. Typing a title and switching authoring modes could therefore discard it without the parent's existing confirmation. The callback now includes unfinished title, source and family selection, while a frozen registration remains clean. Closing the panel retains its input, so retained unsaved input remains dirty. No extra request, permission check or persistence mechanism was added.

The original title test failed before correction. After correction the selected registration component files passed 17 cases. These are component tests with synthetic API responses, not PostgreSQL or browser acceptance.

## Loading optimization

The shared studio previously statically imported the scale editor, form editor, ordinary questionnaire studio and whole-package library even when only the tool list was visible. These four components now use the existing retryable deferred loader. Business APIs, permissions, draft ownership and save payloads are unchanged. Initial list loading does not load hidden-mode data.

Two production builds, same dependency lock and machine, measured emitted JavaScript/CSS import closures before and after. Full studio static closure: 602,556 → 392,830 bytes; deterministic gzip: 190,946 → 128,908 bytes (32.5% less). This is a build-artifact estimate, not measured browser transfer or user latency. Dynamic features download on first use; their total functionality was not removed. School and Teacher app static closures did not increase.

Targeted consumer checks cover School ordinary-questionnaire entry; shared form/scale same-id reload preserving/discarding pending buffers; Teacher initial list → ordinary questionnaire → declined switch retaining draft → accepted package switch. One pre-existing School test clicked the mode button while initial loading still reported writing. Its synchronization now waits for the visible initial loading status to finish; business assertions are unchanged. The first failing reporter is retained separately.

No scoring, backend, database, version authorization or report computation changed. No database suites, full-platform regression or formal CI have been run for this local candidate. Formal route selection and evidence acceptance remain pending.

After subtracting the already-loaded product shell's static assets, incremental studio gzip was 121,130 → 58,288 bytes for School and 99,741 → 37,249 bytes for Teacher. These are per-file gzip sums, not a cold network benchmark or a server CPU claim.

Selected loading consumers: 4 unique cases passed (2 shared editor reload cases, 1 School composition entry, 1 Teacher deferred-data/draft interaction). The first School synchronization failure remains recorded. Frontend app typecheck initially failed because the new worktree lacked backend dependencies referenced by shared types. Providing the existing dependencies with the identical backend lockfile and schema allowed the same typecheck to pass; no dependency or schema modification was made.
