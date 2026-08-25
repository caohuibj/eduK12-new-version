---
name: codex-auto
description: Use for implementation, bug fixes, or refactors in this repository through the project-local Sol/Luna workflow. Do not use for review-only or explanation-only questions, or when the user explicitly asks for direct manual editing.
---

# Project-local codex-auto workflow

Operate only in `eduk12-local`. Read `.codex-auto/project.yml` and
`.codex-auto/orchestrator.yml` before acting. Never copy ChatGPT OAuth tokens, request an OpenAI API
key in `chatgpt-app` mode, install a global runtime, publish unless configured, or integrate code.

Planning and review stay in the primary task. Implementation and fixes are delegated through the
App's native subagent as the configured `luna_implementer`; the local executable is only a
deterministic validator/state recorder and performs no model call.

Every task must have a bounded Task Contract under `.codex-auto/tasks/`, named verification commands,
an implementation evidence record, and an independent review. A missing required environment or a
failed check is a blocker; an exit-zero summary with skipped integration is not evidence of a real
database check. Do not merge, rebase, cherry-pick, push, or deploy implicitly.

Read `.codex-auto/project.yml`, `.codex-auto/orchestrator.yml`, and
`docs/CODEX_AUTO_LOCAL_WORKFLOW.md` before using the local workflow. Keep credentials and runtime
outputs in the ignored paths listed in `.gitignore`.
