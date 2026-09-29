# Canonical Visual QA

This gate provides repeatable visual evidence for the Modern Education frontend without introducing pixel-perfect screenshot diffs.

## Canonical screens

The deterministic fixture captures nineteen representative page families:

1. Code-native UI Lab — foundations / Product UI / reports / canonical scenarios / visualization states
2. Portal
3. Student login
4. Student home
5. Student scale discovery
6. Multi-dimensional Scale report
7. Cognitive history
8. Classroom entry
9. Parent home
10. Staff course management
11. Staff profile
12. Organization index
13. Organization longitudinal report — comparable / not comparable / suppressed
14. Shared Scale Library
15. Public Questionnaire entry
16. Public Questionnaire legacy runner
17. Public Questionnaire result
18. Public Checkin
19. Public recovery / focused entry

Each screen is captured at:

- 390 × 844 — mobile
- 768 × 1024 — tablet
- 1440 × 1000 — desktop

This produces 57 canonical responsive screenshots per run. The multi-dimensional Scale report produces one A4-oriented print-media screenshot, and the Organization longitudinal case produces one A4 print-media screenshot of the report artifact.

## Hard assertions

The browser run fails only on structural regressions:

- canonical screen does not reach its expected ready state;
- an uncaught browser error is raised;
- page-level horizontal overflow exceeds the viewport;
- a canonical read-only capture unexpectedly emits a non-GET API request.

The JSON evidence also records visible interactive-target counts and targets smaller than 44 px. Those measurements are observational in this phase rather than a pixel-level release gate.

## Screenshot policy

Screenshots are CI artifacts retained for seven days. They are evidence for human visual review, not golden-image comparison inputs. Font rasterization, antialiasing and self-hosted runner differences therefore cannot create false failures.

The matrix runs against the production frontend build with deterministic browser-side API fixtures. It does not mutate the database and does not substitute for seeded business-flow acceptance.
