#!/usr/bin/env bash
# Same-Debian execution for native canvas; never load backend native addons on Ubuntu.
set -euo pipefail
private="$RUNNER_TEMP/scale-authoring-private"
test -d "$private"
export SCALE_CONTAINER_MODE="$1"
export SCALE_CONTAINER_ENV="$private/container.env"
python3 - <<'PY'
import os
from pathlib import Path
keys={'CI','TZ','NODE_ENV','GITHUB_ACTIONS','GITHUB_SHA','GITHUB_RUN_ID','GITHUB_ENV','GITHUB_WORKSPACE','RUNNER_TEMP','RUNNER_ENVIRONMENT','CI_POSTGRES_SERVICE_ID','DATABASE_URL','DATABASE_URL_RUNTIME','DATABASE_URL_ADMIN','INSTRUMENT_FINAL_INTEGRATION_DATABASE_URL','REDIS_URL','PORT','SOCKET_REDIS_REQUIRED','COOKIE_SECURE','CORS_ORIGIN','TRUST_PROXY_HOPS','SURVEY_WORKSPACE_ENABLED','SURVEY_PUBLICATION_ENABLED','SURVEY_ANALYTICS_ENABLED','COGNITIVE_MODULE_ENABLED','BACKGROUND_WORKERS_ENABLED','HEAVY_PROCESSING_ENABLED','VIDEO_PROCESSING_ENABLED','LOG_LEVEL','ASSET_MIGRATION_COMPLETE','SCALE_AUTHORING_ISOLATED','SCALE_AUTHORING_ACCEPTANCE','SCALE_AUTHORING_FIXTURE_FILE','SCALE_AUTHORING_BACKEND_ROOT','UPLOAD_DIR','EXPORT_DIR','CREDENTIAL_HANDOFF_DIR','JWT_SECRET','DATA_ENCRYPTION_KEY','DATA_PSEUDONYM_KEY','ASSET_SIGNING_SECRET','SURVEY_MFA_ENCRYPTION_KEY'}
if os.environ['SCALE_CONTAINER_MODE']=='serve': keys -= {'DATABASE_URL_ADMIN','INSTRUMENT_FINAL_INTEGRATION_DATABASE_URL','GITHUB_ENV','SCALE_AUTHORING_FIXTURE_FILE'}
values={k:v for k,v in os.environ.items() if k in keys}
assert all('\n' not in v and '\r' not in v for v in values.values())
p=Path(os.environ['SCALE_CONTAINER_ENV']);p.write_text(''.join(k+'='+v+'\n' for k,v in sorted(values.items())));p.chmod(0o600)
PY
common=(--env HOME=/tmp --network host --user "$(id -u):$(id -g)" --env-file "$SCALE_CONTAINER_ENV")
if [ "$1" = serve ]; then
  docker run -d --name scale-authoring-api "${common[@]}" -v "$UPLOAD_DIR:$UPLOAD_DIR" -v "$EXPORT_DIR:$EXPORT_DIR" -v "$CREDENTIAL_HANDOFF_DIR:$CREDENTIAL_HANDOFF_DIR" "scale-authoring-backend-runtime:$GITHUB_SHA"
else
  docker run --rm "${common[@]}" -v "$private:$private" -v "$GITHUB_ENV:$GITHUB_ENV" -v "$GITHUB_WORKSPACE:$GITHUB_WORKSPACE" -w "$GITHUB_WORKSPACE/server-version/backend" "scale-authoring-backend-builder:$GITHUB_SHA" "$@"
fi
