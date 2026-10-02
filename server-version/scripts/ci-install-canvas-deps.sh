#!/usr/bin/env bash
set -euo pipefail

# canvas falls back to node-gyp when its prebuilt binary cannot be downloaded.
# Keep that path usable on fresh hosted Ubuntu runners, as in backend/Dockerfile.
sudo apt-get update -o Acquire::Retries=3
sudo apt-get install -y --no-install-recommends \
  build-essential python3 pkg-config \
  libcairo2-dev libpixman-1-dev libpango1.0-dev \
  libjpeg-dev libgif-dev librsvg2-dev
pkg-config --exists pixman-1 cairo pangocairo librsvg-2.0
