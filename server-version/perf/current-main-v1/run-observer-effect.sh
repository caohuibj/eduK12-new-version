#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:53001}"
OUT_DIR="${OUT_DIR:?Set OUT_DIR to a task-owned evidence directory}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$OUT_DIR"
scraper_pid=""
stop_scraper() {
  if [[ -n "$scraper_pid" ]]; then
    kill "$scraper_pid" 2>/dev/null || true
    wait "$scraper_pid" 2>/dev/null || true
    scraper_pid=""
  fi
}
trap stop_scraper EXIT INT TERM

# Interleaved no-scrape/scrape pairs: A-B, B-A, A-B.
for entry in 1-off 1-on 2-on 2-off 3-off 3-on; do
  if [[ "$entry" == *-on ]]; then
    (
      while true; do
        curl --fail --silent --max-time 3 "$BASE_URL/metrics" >/dev/null || true
        sleep 5
      done
    ) &
    scraper_pid="$!"
  fi
  BASE_URL="$BASE_URL" DURATION=20s VUS=4 k6 run \
    --summary-export "$OUT_DIR/$entry.json" \
    "$SCRIPT_DIR/k6-observer-effect.js" >"$OUT_DIR/$entry.log" 2>&1
  stop_scraper
done
