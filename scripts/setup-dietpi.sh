#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  Track → Template  |  DietPi / Raspberry Pi 5 setup script
#  Usage: bash setup-dietpi.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

INSTALL_DIR="/opt/suno-generator"
SERVICE_NAME="suno-generator"
NODE_VERSION="22"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ── 1. Root check ─────────────────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
  error "Run this script as root: sudo bash setup-dietpi.sh"
fi

# ── 2. System dependencies ────────────────────────────────────────────────────
info "Installing system packages..."
apt-get update -qq
apt-get install -y -qq curl git build-essential python3

# ── 3. Node.js (via NodeSource) ───────────────────────────────────────────────
if command -v node &>/dev/null && [[ $(node -v) == v${NODE_VERSION}* ]]; then
  info "Node.js $(node -v) already installed — skipping."
else
  info "Installing Node.js ${NODE_VERSION} LTS..."
  curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
  apt-get install -y -qq nodejs
fi
info "Node $(node -v)  |  npm $(npm -v)"

# ── 4. pnpm ───────────────────────────────────────────────────────────────────
if command -v pnpm &>/dev/null; then
  info "pnpm $(pnpm -v) already installed — skipping."
else
  info "Installing pnpm..."
  npm install -g pnpm --silent
fi

# ── 5. Clone / update repository ─────────────────────────────────────────────
REPO_URL="https://github.com/Toblaron/Inoob.git"

if [[ -d "$INSTALL_DIR/.git" ]]; then
  info "Repository already cloned — pulling latest changes..."
  git -C "$INSTALL_DIR" pull
else
  info "Cloning repository to $INSTALL_DIR..."
  git clone "$REPO_URL" "$INSTALL_DIR"
fi
cd "$INSTALL_DIR"

# ── 6. Environment file ───────────────────────────────────────────────────────
if [[ ! -f "$INSTALL_DIR/.env" ]]; then
  cp .env.example .env
  warn "Created .env from template."
  echo ""
  echo "  ┌─ FREE option (recommended) ──────────────────────────────────────────"
  echo "  │  Groq: https://console.groq.com → API Keys → Create API Key"
  echo "  │  Set OPENAI_API_KEY=gsk_...  and keep the Groq lines in .env"
  echo "  ├─ Paid option ────────────────────────────────────────────────────────"
  echo "  │  OpenAI: https://platform.openai.com → Billing → Add credits"
  echo "  │  Set OPENAI_API_KEY=sk-...  and switch model lines in .env"
  echo "  └───────────────────────────────────────────────────────────────────────"
  echo ""
  warn "Edit the .env file now:  nano $INSTALL_DIR/.env"
  echo ""
  read -rp "Press ENTER after you've saved your .env to continue, or Ctrl+C to exit and edit first..."
fi

# Verify OPENAI_API_KEY is set
source "$INSTALL_DIR/.env" 2>/dev/null || true
if [[ -z "${OPENAI_API_KEY:-}" ]]; then
  warn "OPENAI_API_KEY is not set in .env — the app will start but AI features will not work."
  warn "Get a free key at https://console.groq.com then edit $INSTALL_DIR/.env and restart the service."
fi

# Make sure PORT is set in .env (add if missing)
if ! grep -q "^PORT=" "$INSTALL_DIR/.env"; then
  echo "PORT=3000" >> "$INSTALL_DIR/.env"
  info "Added PORT=3000 to .env"
fi

# ── 7. Install dependencies ───────────────────────────────────────────────────
info "Installing Node.js dependencies (this compiles native modules for ARM64)..."
pnpm install --frozen-lockfile

# ── 8. Build ──────────────────────────────────────────────────────────────────
info "Building frontend and API server..."
BASE_PATH=/ PORT=3000 pnpm --filter @workspace/suno-generator run build
pnpm --filter @workspace/api-server run build
info "Build complete."

# ── 9. Systemd service ────────────────────────────────────────────────────────
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

info "Installing systemd service..."
cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Track → Template (Suno Generator)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=dietpi
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=${INSTALL_DIR}/.env
Environment=NODE_ENV=production
ExecStart=$(which node) ${INSTALL_DIR}/artifacts/api-server/dist/index.cjs
Restart=on-failure
RestartSec=5s
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

# ── 10. Done ──────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Track → Template is running!${NC}"
echo ""

# Try to get the Pi's local IP
LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}') || LOCAL_IP="<your-pi-ip>"
PORT_NUM=$(grep "^PORT=" "$INSTALL_DIR/.env" | cut -d= -f2 | tr -d ' "' || echo 3000)

echo -e "  Open in your browser:  ${GREEN}http://${LOCAL_IP}:${PORT_NUM}${NC}"
echo ""
echo "  Useful commands:"
echo "    sudo systemctl status $SERVICE_NAME   # check status"
echo "    sudo journalctl -u $SERVICE_NAME -f   # view live logs"
echo "    sudo systemctl restart $SERVICE_NAME  # restart"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
