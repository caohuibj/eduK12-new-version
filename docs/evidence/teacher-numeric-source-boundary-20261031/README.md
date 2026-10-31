# Teacher numeric source-family boundary

Internal handoff inspection found that the directory excluded native Cognitive/SJT but the direct generation method did not yet explicitly restrict its source family. The existing parent/leaf resolvers normally refuse these sources, but relying on an unrelated generic canonical registry lookup was not the intended exclusion. The source guard now rejects non-Scale parents before any generic leaf resolution until the native per-unit adapter is connected in its separate slice.

One new unit contract passed with a valid-hash explicit native GROUP parent, and asserts the generic resolver is not called. Database and current manager authority are mocked; this is not PostgreSQL native-group acceptance. The original zero-case Vitest hoisting startup failure is retained; it is not promoted to a passed test. No old N10, page, scoring, FINAL or type suite was rerun. Existing backend/frontend type receipts remain bound to b7f050d0 / component trees f59989b9 and9797b5bd, preceding this two-line source guard; they are not relabelled as a fresh compiler run for this commit.

Original/library actual N10 and saved reads remain the preceding slice. This change does not open the native family or alter School code, roles, permissions, floors or historical snapshots. No upload, CI, merge or production change occurred.
