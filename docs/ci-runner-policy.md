# CI runner policy

All 15 versioned workflows use GitHub-hosted `ubuntu-24.04` runners. Each executable job receives a separate temporary VM. No workflow selects a self-hosted runner or offers a runner-selection override. Manual acceptance workflows remain manual; selecting hosted infrastructure does not automatically dispatch deployment or production jobs.

The ready-PR merge gate still requires backend compilation/migration and the 200-completion performance SLA, independent full PostgreSQL regression, frontend lint/types/tests/build, browser acceptance, Docker image builds and vulnerability scans, and CodeQL. The performance suite remains separately required and is excluded only from the functional-regression job. Missing, skipped, failed, or cancelled required jobs cannot pass the aggregate gate.

Docker and CodeQL run independently after scope classification. Browser acceptance waits for backend/frontend and consumes only this run's exact-commit artifacts. PostgreSQL/Redis services, generated synthetic keys, and test accounts are job-local. Existing content/presentation/draft fast paths and manual workflow scopes remain intact.

`.github/scripts/content-workflows.test.mjs` checks every versioned workflow's runner choice and the required gates/dependencies. Historical self-hosted workflow runs remain visible in GitHub; old revisions still contain their original configuration and must not be rerun to validate this policy.

This policy takes effect for PR #219 at its updated head. The default branch adopts the policy when the PR is merged. No runner machines are deleted, no production migration/deployment is performed, and no other active development branch is changed by this implementation.
