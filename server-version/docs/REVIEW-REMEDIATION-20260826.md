# 2026-08-26 review remediation ledger

This PR is the Web-only remediation branch. The mini-program, GitHub Actions
workflow changes, and `xlsx` parser/import review remain out of scope.

| Area | Status in this branch |
| --- | --- |
| Credentials and `.env.backup*` | Removed from tracked paths; runtime credentials are environment-only. Historical rotation/rewriting remains an external maintenance action. |
| Cookie/CSRF/password reset | HttpOnly session cookie, double-submit CSRF, token version, first-login password change, and protected local handoff file. |
| Public questionnaire | Server-issued hashed resume capability with rotation, expiry, and conditional completion updates. |
| Public check-in assets | Teacher media remain course/private assets and require an exact check-in reference plus token-bound signed delivery; anonymous uploads use a server-issued HMAC session capability, session-bound staging, a nine-image cap, submit-time promotion, a shared upload/submit advisory lock, and configurable class-sized rate ceilings. A submitted session cannot upload again, and shared check-in tokens cannot read participant media. |
| Backup/restore | Encrypted manifest package, real decrypt/hash verification, isolated restore entry points; WAL incremental path paused. |
| Legacy uploads | Reversible migration window; set `ASSET_MIGRATION_COMPLETE=true` only after counts and hashes are verified. |
| Monitoring | Pinned Alertmanager, local-only default, bounded API 401/403 auto-block opt-in, no automatic SSH/URL attack blocking. |
| Frontend | Cookie-auth API client, lazy route loading, asset IDs, and compressed emotion assets with PNG source retained. |

Production server/COS resources do not exist yet. Local Compose and the
disposable development database are the only environments used for this PR.
