# Canonical Visual QA

This gate provides repeatable visual evidence for the Modern Education frontend without introducing pixel-perfect screenshot diffs.

## Canonical screens

The deterministic fixture captures fourteen representative page families:

1. Portal
2. Student login
3. Student home
4. Student scale discovery
5. Multi-dimensional Scale report
6. Cognitive history
7. Classroom entry
8. Parent home
9. Staff course management
10. Staff profile
11. Organization index
12. Organization longitudinal report — comparable / not comparable / suppressed
13. Shared Scale Library
14. Public recovery / focused entry

Each screen is captured at:

- 390 × 844 — mobile
- 768 × 1024 — tablet
- 1440 × 1000 — desktop

This produces 42 canonical responsive screenshots per run. The multi-dimensional Scale report produces one A4-oriented print-media screenshot, and the Organization longitudinal case produces one A4 print-media screenshot of the report artifact.

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
