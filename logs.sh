#!/usr/bin/env bash
# Usage:
#   ./logs.sh          — live tail (follow)
#   ./logs.sh status   — pm2 status table
#   ./logs.sh dump     — last 200 lines, no follow

set -euo pipefail

REMOTE_USER="${REMOTE_USER:-t29zhu}"
REMOTE_HOST="${REMOTE_HOST:-34.173.74.223}"
REMOTE="${REMOTE_USER}@${REMOTE_HOST}"

case "${1:-}" in
  status)
    ssh "${REMOTE}" "pm2 status"
    ;;
  dump)
    ssh "${REMOTE}" "pm2 logs kirkahoot-backend --lines 200 --nostream"
    ;;
  *)
    ssh "${REMOTE}" "pm2 logs kirkahoot-backend"
    ;;
esac
