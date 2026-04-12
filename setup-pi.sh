#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Inoob — Raspberry Pi 5 / DietPi setup script
# Run once after cloning the repo:  bash setup-pi.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_NAME="inoob"
SERVICE_USER="$(whoami)"

echo "==> App directory: $APP_DIR"
echo "==> Running as: $SERVICE_USER"

# ── 1. System packages ────────────────────────────────────────────────────────
echo ""
echo "==> Installing system dependencies..."
sudo apt-get update -qq
sudo apt-get install -y --no-install-recommends \
    curl \
    git \
    build-essential \
    python3 \
    ca-certificates \
    gnupg

# ── 2. Node.js 22 (LTS) via NodeSource ───────────────────────────────────────
if ! command -v node &>/dev/null || [[ "$(node -e 'process.stdout.write(process.version.split(".")[0].slice(1))')" -lt 20 ]]; then
    echo ""
    echo "==> Installing Node.js 22..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    echo "==> Node.js $(node --version) already installed — skipping"
fi

# ── 3. pnpm ───────────────────────────────────────────────────────────────────
if ! command -v pnpm &>/dev/null; then
    echo ""
    echo "==> Installing pnpm..."
    sudo npm install -g pnpm
else
    echo "==> pnpm $(pnpm --version) already installed — skipping"
fi

# ── 4. Install dependencies ───────────────────────────────────────────────────
echo ""
echo "==> Installing Node dependencies (this compiles native modules — may take a few minutes)..."
cd "$APP_DIR"
pnpm install

# ── 5. Production build ───────────────────────────────────────────────────────
echo ""
echo "==> Building for production..."
pnpm run build:prod

# ── 6. Create data directory ──────────────────────────────────────────────────
mkdir -p "$APP_DIR/data"

# ── 7. systemd service ───────────────────────────────────────────────────────
echo ""
echo "==> Installing systemd service..."

sudo tee /etc/systemd/system/${SERVICE_NAME}.service > /dev/null <<EOF
[Unit]
Description=Inoob — YouTube to Suno template generator
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${SERVICE_USER}
WorkingDirectory=${APP_DIR}
ExecStart=/usr/bin/node --env-file=${APP_DIR}/.env ${APP_DIR}/artifacts/api-server/dist/index.cjs
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${SERVICE_NAME}

# Keep the process alive if Groq returns 429 — don't let OOM killer touch it
OOMScoreAdjust=-100

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable ${SERVICE_NAME}
sudo systemctl restart ${SERVICE_NAME}

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " Done! Inoob is running."
echo ""
echo " App:     http://$(hostname -I | awk '{print $1}'):3000"
echo " Logs:    journalctl -u ${SERVICE_NAME} -f"
echo " Stop:    sudo systemctl stop ${SERVICE_NAME}"
echo " Restart: sudo systemctl restart ${SERVICE_NAME}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
