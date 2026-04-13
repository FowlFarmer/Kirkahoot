#!/usr/bin/env bash

# Usage:
#   ./deploy.sh
#
# First-time SSH key setup (run once on your Mac):
#   gcloud compute ssh t29zhu@instance-20260412-232313 --zone=us-central1-a \
#     --command="mkdir -p ~/.ssh && echo '$(cat ~/.ssh/id_ed25519.pub 2>/dev/null || cat ~/.ssh/id_rsa.pub)' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"

set -euo pipefail

REMOTE_USER="${REMOTE_USER:-t29zhu}"
REMOTE_HOST="${REMOTE_HOST:-34.173.74.223}"
REMOTE_DIR="${REMOTE_DIR:-\$HOME/backend}"
REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
LOCAL_SRC="${REPO_ROOT}/backend_test"
REMOTE="${REMOTE_USER}@${REMOTE_HOST}"

info() { echo "▶ $*"; }

# Check SSH access
info "Checking SSH access to ${REMOTE} ..."
if ! ssh -o BatchMode=yes -o ConnectTimeout=8 "${REMOTE}" true 2>/dev/null; then
  echo ""
  echo "❌ Cannot SSH into ${REMOTE}. Run this once to inject your key via gcloud:"
  echo ""
  echo "   gcloud compute ssh ${REMOTE_USER}@instance-20260412-232313 --zone=us-central1-a \\"
  echo "     --command=\"mkdir -p ~/.ssh && echo '\$(cat ~/.ssh/id_ed25519.pub 2>/dev/null || cat ~/.ssh/id_rsa.pub)' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys\""
  echo ""
  exit 1
fi

# Sync files
info "Syncing files to ${REMOTE}:${REMOTE_DIR} ..."
ssh "${REMOTE}" "mkdir -p \$HOME/backend"
# Copy everything except node_modules and .env
(cd "${LOCAL_SRC}" && tar --exclude=node_modules --exclude=.env --exclude='*.log' -czf - .) \
  | ssh "${REMOTE}" "tar -xzf - -C ${REMOTE_DIR}"

# Remote bootstrap
info "Running remote setup ..."
ssh "${REMOTE}" bash <<EOF
set -euo pipefail

NODE_OK=false
if command -v node &>/dev/null; then
  NODE_VER=\$(node -e 'process.stdout.write(process.version.slice(1).split(".")[0])')
  [[ "\$NODE_VER" -ge 20 ]] && NODE_OK=true
fi
if [[ "\$NODE_OK" == false ]]; then
  echo "Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

node --version && npm --version

if ! command -v pm2 &>/dev/null; then
  echo "Installing PM2..."
  sudo npm install -g pm2
fi

cd "${REMOTE_DIR}"
npm install --omit=dev

if [[ ! -f .env ]]; then
  cat > .env <<ENVEOF
PORT=3001
MAX_ACTIVE_SESSIONS=80
ENABLE_BACKEND_LOGS=true
LOG_INTERVAL_MS=10000
ENVEOF
  echo "⚠️  Created default .env at ${REMOTE_DIR}/.env — edit it if needed."
fi

if pm2 describe kirkahoot-backend &>/dev/null; then
  pm2 reload kirkahoot-backend --update-env
else
  pm2 start ecosystem.config.cjs
fi

pm2 save

STARTUP_CMD=\$(pm2 startup systemd -u "${REMOTE_USER}" --hp "/home/${REMOTE_USER}" 2>&1 | grep "sudo env" || true)
if [[ -n "\$STARTUP_CMD" ]]; then
  echo ""
  echo "🔔 Run this on the VM once to survive reboots:"
  echo "   \$STARTUP_CMD"
fi

echo ""
pm2 status

# Install cloudflared if not present
if ! command -v cloudflared &>/dev/null; then
  echo "Installing cloudflared..."
  curl -fsSL -o /tmp/cloudflared.deb \
    https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
  sudo dpkg -i /tmp/cloudflared.deb
fi

# Start cloudflared tunnel as a PM2 process if not already running
if ! pm2 describe kirkahoot-tunnel &>/dev/null; then
  pm2 start cloudflared --name kirkahoot-tunnel -- tunnel --url http://localhost:3001
  pm2 save
  echo "⏳ Waiting for tunnel URL..."
  sleep 5
fi

# Extract tunnel URL from pm2 logs
TUNNEL_URL=\$(pm2 logs kirkahoot-tunnel --lines 50 --nostream 2>/dev/null \
  | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -1 || true)
if [[ -z "\$TUNNEL_URL" ]]; then
  echo "⚠️  Could not detect tunnel URL yet. Check: pm2 logs kirkahoot-tunnel"
  echo "   Then set NEXT_PUBLIC_BACKEND_URL to the tunnel URL in Vercel manually."
else
  echo "✅ Tunnel URL: \$TUNNEL_URL"
  echo "\$TUNNEL_URL" > \$HOME/backend/.tunnel_url
fi
EOF

# Read tunnel URL from VM
info "Fetching tunnel URL..."
TUNNEL_URL=$(ssh "${REMOTE}" "cat \$HOME/backend/.tunnel_url 2>/dev/null || echo ''")

if [[ -z "${TUNNEL_URL}" ]]; then
  echo "⚠️  Tunnel URL not ready yet. SSH in and run: pm2 logs kirkahoot-tunnel"
  echo "   Then re-run ./deploy.sh once the URL appears."
  exit 1
fi

info "Tunnel URL: ${TUNNEL_URL}"

# Set NEXT_PUBLIC_BACKEND_URL in Vercel for all environments
VERCEL_DIR="${REPO_ROOT}"
BACKEND_URL="${TUNNEL_URL}"
info "Setting NEXT_PUBLIC_BACKEND_URL=${BACKEND_URL} in Vercel ..."
for env in production preview development; do
  npx vercel env rm NEXT_PUBLIC_BACKEND_URL "${env}" --yes --cwd "${VERCEL_DIR}" 2>/dev/null || true
  echo "${BACKEND_URL}" | npx vercel env add NEXT_PUBLIC_BACKEND_URL "${env}" --cwd "${VERCEL_DIR}"
done
info "Vercel env vars updated. Triggering production redeploy ..."
npx vercel --prod --yes --cwd "${VERCEL_DIR}"
info "All done!"
