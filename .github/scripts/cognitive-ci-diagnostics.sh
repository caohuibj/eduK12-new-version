#!/usr/bin/env bash
set -euo pipefail
ci_task_repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# Onboarding validates declared frontend suites as well as backend contracts.
# Keep the frontend feature flag/timezone identical to the former frontend gate.
export TZ=UTC
export VITE_COGNITIVE_MODULE_ENABLED=true
cd "$ci_task_repo/server-version/frontend"
npm ci
cd "$ci_task_repo/server-version/backend"
npm run cognitive:onboarding-check -- --all --json
