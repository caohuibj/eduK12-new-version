#!/bin/bash
# Historical entrypoint: deliberately fails instead of deploying an obsolete topology.
printf "%s\n" "此脚本已停用。请使用 server-version/DEPLOYMENT-CHECKLIST.md（唯一生产部署入口）。" >&2
exit 1
