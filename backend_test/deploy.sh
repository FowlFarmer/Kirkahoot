#!/usr/bin/env bash
set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
REMOTE_USER="${REMOTE_USER:-}"
REMOTE_HOST="${REMOTE_HOST:-}"
REMOTE_DIR="${REMOTE_DIR:-~/kirkahoot-backend}"
LOCAL_SRC="$(cd "$(dirname "$0")" && pwd)"

# ── Helpers ───────────────────────────────────────────────────────────────────
die() { echo "❌ $*" >&2; exit 1; }
info() { echo "▶ $*"; }

# ── Validate ──────────────────────────────────────────────────────────────────
[[ -z "$REMOTE_USER" ]] && die "Set REMOTE_USER (e.g. export REMOTE_USER=ubuntu)"
[[ -z "$REMOTE_HOST" ]] && die "Set REMOTE_HOST (e.g. export REMOTE_HOST=34.x.x.x)"

REMOTE="${REMOTE_USER}@${REMOTE_HOST}"

# ── 1. Sync files ─────────────────────────────────────────────────────────────
info "Syncing files to ${REMOTE}:${REMOTE_DIR} ..."
rsync -az --delete \
  --exclude node_modules \
  --exclude .env \
  --exclude '*.log' \
  "${LOCAL_SRC}/" "${REMOTE}:${REMOTE_DIR}/"

# ── 2. Bootstrap Node + PM2 + deps on VM ─────────────────────────────────────
info "Running remote setup ..."
ssh "${REMOTE}" bash <<EOF
set -euo pipefail

# Install Node.js 20 if not present or too old
if ! command -v node &>/dev/null || [[ "\$(node -e 'process.exit(+process.version.slice(1).split(".")[0] < 20)')" ]]; then
  echo "Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

# Install PM2 globally if not present
if ! command -v pm2 &>/dev/null; then
  echo "Installing PM2..."
  sudo npm install -g pm2
fi

cd "${REMOTE_DIR}"
npm install --omit=dev

# Create .env if missing (user must fill it in)
if [[ ! -f .env ]]; then
  cat > .env <<ENVEOF
PORT=3001
MAX_ACTIVE_SESSIONS=20
ENABLE_BACKEND_LOGS=true
LOG_INTERVAL_MS=10000
ENVEOF
  echo "⚠️  Created default .env — edit ${REMOTE_DIR}/.env on the VM if needed."
fi

# Start or reload via PM2
if pm2 describe kirkahoot-backend &>/dev/null; then
  pm2 reload kirkahoot-backend --update-env
else
  pm2 start ecosystem.config.cjs
fi

pm2 save

# Register PM2 for boot (prints a command the user must run once as root)
STARTUP_CMD=\$(pm2 startup systemd -u "${REMOTE_USER}" --hp "/home/${REMOTE_USER}" 2>&1 | grep "sudo env" || true)
if [[ -n "\$STARTUP_CMD" ]]; then
  echo ""
  echo "🔔 Run this on the VM to enable boot startup:"
  echo "   \$STARTUP_CMD"
fi

echo ""
pm2 status
EOF

info "Done! Backend running at http://${REMOTE_HOST}:3001"
info "Set NEXT_PUBLIC_BACKEND_URL=http://${REMOTE_HOST}:3001 in Vercel env vars."
