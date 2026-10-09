#!/usr/bin/env bash
# Review-only adapter example. This file never installs or changes production.
# Preserve the existing compose.sh byte-for-byte at an operator-approved path,
# then adapt its public entry only after separate production authorization.
set -euo pipefail
_hui_base_entry="${EDUK12_PRESERVED_COMPOSE_ENTRY:?preserved actual Compose entry required}"
_hui_overlay="${EDUK12_RELEASE_OVERLAY:-/opt/eduk12-new/deploy/scoped-release/images.json}"
if [[ -f "$_hui_overlay" ]]; then
  # Persistent default is essential: a later ordinary restart uses the same
  # immutable images, rather than silently returning to old Compose tags.
  exec "$_hui_base_entry" -f "$_hui_overlay" "$@"
fi
exec "$_hui_base_entry" "$@"
