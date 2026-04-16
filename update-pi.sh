#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Inoob — pull latest changes and rebuild
# Run from the repo directory:  bash update-pi.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

echo "==> Pulling latest changes..."
git pull

echo "==> Installing any new dependencies..."
pnpm install

echo "==> Rebuilding..."
pnpm run build:prod

echo "==> Restarting service..."
sudo systemctl restart inoob

echo ""
echo "==> Done. Check status with: journalctl -u inoob -f"
