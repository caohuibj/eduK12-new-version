#!/usr/bin/env bash
# Same Debian image for native modules; all credentials stay in the private directory.
set -euo pipefail
mode="${1:?mode}"; shift
private="$RUNNER_TEMP/training-workspace-integrated-private"
test -d "$private"
export GOVERNANCE_CONTAINER_MODE="$mode" GOVERNANCE_CONTAINER_ENV="$private/$mode.env"
python3 -B - <<'PY'
import os
from pathlib import Path
keys={'CHECKIN_SCHEDULE_DB_TEST','WORKSPACE_LIBRARY_INTEGRATION','MATERIAL_GRANTS_ENABLED','CI','TZ','NODE_ENV','GITHUB_ACTIONS','GITHUB_SHA','GITHUB_RUN_ID','GITHUB_ENV','GITHUB_WORKSPACE','RUNNER_TEMP','RUNNER_ENVIRONMENT','CI_POSTGRES_SERVICE_ID','DATABASE_URL','DATABASE_URL_RUNTIME','DATABASE_URL_ADMIN','RELEASE_INTEGRATION_DATABASE_URL','INSTRUMENT_FINAL_INTEGRATION_DATABASE_URL','REDIS_URL','PORT','SOCKET_REDIS_REQUIRED','COOKIE_SECURE','CORS_ORIGIN','TRUST_PROXY_HOPS','SURVEY_WORKSPACE_ENABLED','SURVEY_PUBLICATION_ENABLED','SURVEY_ANALYTICS_ENABLED','COGNITIVE_MODULE_ENABLED','BACKGROUND_WORKERS_ENABLED','HEAVY_PROCESSING_ENABLED','VIDEO_PROCESSING_ENABLED','LOG_LEVEL','ASSET_MIGRATION_COMPLETE','TRAINING_WORKSPACE_ISOLATED','TRAINING_WORKSPACE_FIXTURE_FILE','TRAINING_WORKSPACE_BACKEND_ROOT','WORKSPACE_EVIDENCE','UPLOAD_DIR','EXPORT_DIR','CREDENTIAL_HANDOFF_DIR','JWT_SECRET','DATA_ENCRYPTION_KEY','DATA_PSEUDONYM_KEY','ASSET_SIGNING_SECRET','SURVEY_MFA_ENCRYPTION_KEY','ADMIN_WEBAUTHN_ORIGIN','ADMIN_WEBAUTHN_RP_ID','VIDEO_CONCURRENCY','IMAGE_CONCURRENCY','EXPORT_CONCURRENCY','VIDEO_TIMEOUT','VIDEO_RESOLUTION','VIDEO_PRESET','WORKER_SHUTDOWN_TIMEOUT_SECONDS'}
mode=os.environ['GOVERNANCE_CONTAINER_MODE']
if mode in ['serve','worker']:keys-={'DATABASE_URL_ADMIN','RELEASE_INTEGRATION_DATABASE_URL','INSTRUMENT_FINAL_INTEGRATION_DATABASE_URL','GITHUB_ENV','TRAINING_WORKSPACE_FIXTURE_FILE'}
values={k:v for k,v in os.environ.items() if k in keys}
assert all('\n' not in v and '\r' not in v for v in values.values())
p=Path(os.environ['GOVERNANCE_CONTAINER_ENV']);p.write_text(''.join(k+'='+v+'\n' for k,v in sorted(values.items())));p.chmod(0o600)
PY
common=(--network host --user "$(id -u):$(id -g)" --env HOME=/tmp --env-file "$GOVERNANCE_CONTAINER_ENV" -v "$private:$private" -v "$GITHUB_WORKSPACE:$GITHUB_WORKSPACE:ro")
case "$mode" in
  serve) docker run -d --name training-workspace-integrated-api "${common[@]}" "training-workspace-integrated-backend-runtime:${TRAINING_WORKSPACE_BACKEND_IMAGE_HEAD:-$GITHUB_SHA}";;
  once) docker run --rm "${common[@]}" -v "$GITHUB_ENV:$GITHUB_ENV" -v "$GITHUB_WORKSPACE/training-workspace-integrated-evidence:$GITHUB_WORKSPACE/training-workspace-integrated-evidence" "training-workspace-integrated-backend-builder:${TRAINING_WORKSPACE_BACKEND_IMAGE_HEAD:-$GITHUB_SHA}" "$@";;
  *) echo 'Explicit once/serve mode required' >&2; exit 2;;
esac
