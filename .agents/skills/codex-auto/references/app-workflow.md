# ChatGPT App workflow reference

The repository is `eduk12-local`; the signed-in ChatGPT App is the model runtime and local Git is the
evidence layer. Use the configured `dev` base branch and the exact verification names in
`.codex-auto/project.yml` / `.codex-auto/orchestrator.yml`.

For each bounded task, create a Task Contract, start the local session, accept the plan, begin
implementation, record the change, begin independent review, and submit the review. If review
requests changes, use the bounded fix cycle and review again. The human integration gate remains
mandatory.

Required evidence includes the actual base/head SHAs, the scoped diff, each applicable verification
result, and any unavailable conditional environment. Do not treat skipped integration tests or a
missing database URL as a pass.
