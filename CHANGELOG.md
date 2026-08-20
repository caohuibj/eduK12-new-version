# Changelog

## v1.0.0 — Release Candidate

### Added

- Cognitive Core assignment, session, append-only trial, server-authoritative completion and scoring flow.
- Reaction, Memory Digit Span Forward and Stroop tasks.
- Participant result rendering, history access and simulated reference layer.
- Docker Compose runtime with Postgres, Redis, backend and frontend ingress.

### Validation

- Backend full regression: 32 files / 272 tests passed with a real Postgres service.
- Frontend Cognitive tests: 11 files / 54 tests passed.
- Backend/frontend production builds and Docker image builds passed.

### Limitations

- Simulated reference data is not a formal K12 norm.
- Results are not clinical interpretation and do not produce a composite cognitive score.
- First production release requires backup verification and the documented rollback procedure.
