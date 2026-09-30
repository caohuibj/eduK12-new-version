# PR #202 current-main UX cleanup

## Purpose

PR #202 (`3584028f`) passed its original full gates but was intentionally bypassed when later work restarted from `main@6084650e`. PRs #203–#207 then changed overlapping surfaces and made a direct merge/rebase unsafe.

This cleanup selectively carries forward only the still-valid #202 improvements against current `main@e7d1b3f`.

## Absorbed

- Scale Library progressive disclosure, applied-filter recovery, stale-response protection, and card reading hierarchy.
- Assignment management explicit read failure/retry and one-DOM responsive mobile record layout.
- Scale report score-first hierarchy, single total/range reading unit, and limitations/disclaimer before detailed scientific references.
- Browser/visual regressions for the above behavior.

## Superseded rather than copied

PR #202's StudentHome "enter a course to see tasks" next-step card is not restored. PR #204 added the stronger cross-course `/api/courses/my/tasks` aggregation and `StudentTasks` surface, which remains authoritative.

## Preserved current-main behavior

This cleanup does not replace or weaken #203/#204 modal/focus/editor guards, cross-course task aggregation, authorization, APIs, database behavior, assessment runtime/scoring, submission protocols, or the #205–#207 security/performance/deployment closures.

## Validation target

- focused Scale Library, AssignmentList and Scale report component regressions;
- frontend typecheck/build/full tests;
- interaction-state browser checks at 360/390/768/1440;
- canonical visual/print report checks;
- normal repository merge gate on the exact head.
