#!/usr/bin/env bash
# Recover only regenerable build cache, never application images or data volumes.
set -euo pipefail
available_kib() { df -Pk . | awk 'NR == 2 {print $4}'; }
minimum_kib=$((3 * 1024 * 1024))
if [[ "${RUNNER_ENVIRONMENT:-}" == 'github-hosted' ]] && (( $(available_kib) < minimum_kib )); then
  docker builder prune --force --keep-storage 1GB
fi
df -h .
if (( $(available_kib) < minimum_kib )); then
  echo 'CI needs at least 3 GiB free disk space; provision capacity before retrying.' >&2
  exit 1
fi
