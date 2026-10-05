#!/usr/bin/env bash
set -euo pipefail

# canvas falls back to node-gyp when its prebuilt binary cannot be downloaded.
# Keep that path usable on fresh hosted Ubuntu runners, as in backend/Dockerfile.
# Persistent CI hosts should not refresh apt metadata for every serial job.
if command -v cc >/dev/null && command -v c++ >/dev/null \
  && command -v make >/dev/null && command -v python3 >/dev/null \
  && command -v pkg-config >/dev/null \
  && pkg-config --exists pixman-1 cairo pangocairo librsvg-2.0; then
  echo 'Canvas source-build prerequisites are already installed.'
  exit 0
fi
sudo -n apt-get update -o Acquire::Retries=3
sudo -n apt-get install -y --no-install-recommends \
  build-essential python3 pkg-config \
  libcairo2-dev libpixman-1-dev libpango1.0-dev \
  libjpeg-dev libgif-dev librsvg2-dev
pkg-config --exists pixman-1 cairo pangocairo librsvg-2.0
