# Self-Hosting on Raspberry Pi 5 (DietPi)

## What runs where

- **Express API server** — handles all backend logic, AI calls, lyrics fetching. Serves the built React app in production.
- **React frontend** — built to static files by Vite, then served by the Express server.
- You only need to run **one process** on the Pi.

---

## 1. Prepare DietPi

```bash
# Update the system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20 (LTS, arm64)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify
node -v   # should be v20.x.x
npm -v

# Install pnpm
npm install -g pnpm

# Install PM2 (process manager — keeps the server running)
npm install -g pm2

# Install Nginx
sudo apt install -y nginx
```

---

## 2. Get the project onto your Pi

**Option A — download from Replit:**
In Replit, use the three-dot menu → Download as ZIP, copy to your Pi and unzip.

**Option B — via GitHub (recommended):**
Push your Replit project to GitHub first, then on the Pi:
```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
cd YOUR_REPO
```

---

## 3. Install dependencies

```bash
# From the project root
pnpm install
```

---

## 4. Set up environment variables

Create a `.env` file in the project root:

```bash
nano .env
```

Paste the following (fill in your values):

```env
# Required — your OpenAI API key (get one at platform.openai.com)
OPENAI_API_KEY=sk-...

# Required — server port (3000 is a safe default)
PORT=3000

# Optional — Genius lyrics API token (for better lyrics accuracy)
# Get one free at genius.com/api-clients
GENIUS_API_TOKEN=your_genius_token_here

# Optional — GetSongBPM API key (for verified BPM data)
# Get one free at getsongbpm.com/api
GETSONGBPM_API_KEY=your_key_here
```

Save with `Ctrl+X → Y → Enter`.

---

## 5. Build the project

```bash
# Build both the frontend and the API server
pnpm run build:prod
```

This will:
1. Build the React frontend → `artifacts/suno-generator/dist/public/`
2. Compile the Express API server → `artifacts/api-server/dist/index.cjs`

---

## 6. Start the server with PM2

```bash
# Start the server (reads .env automatically)
pm2 start artifacts/api-server/dist/index.cjs \
  --name "track-template" \
  --env production \
  --env-file .env

# Save PM2 config so it survives reboots
pm2 save

# Set PM2 to start on boot
pm2 startup
# Run the command it prints (starts with "sudo env PATH=...")
```

Check it's running:
```bash
pm2 status
pm2 logs track-template
```

The app is now running on `http://localhost:3000`. Test it:
```bash
curl http://localhost:3000/api/health 2>/dev/null | head -5
# Or just open a browser on the Pi and go to http://localhost:3000
```

---

## 7. Set up Nginx as a reverse proxy

This lets you access the app on port 80 (standard HTTP) and later add HTTPS.

```bash
sudo nano /etc/nginx/sites-available/track-template
```

Paste:

```nginx
server {
    listen 80;
    server_name _;          # accepts any hostname/IP

    client_max_body_size 20M;

    location / {
        proxy_pass         http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 120s;
    }
}
```

Enable it:

```bash
sudo ln -s /etc/nginx/sites-available/track-template /etc/nginx/sites-enabled/
sudo nginx -t          # should say "syntax is ok"
sudo systemctl restart nginx
sudo systemctl enable nginx
```

The app is now accessible at `http://YOUR_PI_IP_ADDRESS` from any device on your local network.

Find your Pi's IP:
```bash
hostname -I | awk '{print $1}'
```

---

## 8. External access (reach it from outside your home)

### Option A — Cloudflare Tunnel (recommended, free, HTTPS automatic)

```bash
# Install cloudflared
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64 \
  -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared

# Log in (opens a browser on your Pi or gives you a URL to visit)
cloudflared tunnel login

# Create a tunnel
cloudflared tunnel create track-template

# Route a hostname to it (replace with your domain on Cloudflare)
cloudflared tunnel route dns track-template tracktemplate.yourdomain.com

# Create config
mkdir -p ~/.cloudflared
nano ~/.cloudflared/config.yml
```

Config file content (replace TUNNEL_ID with yours from the create step):
```yaml
tunnel: TUNNEL_ID
credentials-file: /root/.cloudflared/TUNNEL_ID.json

ingress:
  - hostname: tracktemplate.yourdomain.com
    service: http://localhost:3000
  - service: http_status:404
```

Run it as a service:
```bash
sudo cloudflared service install
sudo systemctl start cloudflared
sudo systemctl enable cloudflared
```

Your app is now live at `https://tracktemplate.yourdomain.com` with automatic HTTPS.

### Option B — Port forwarding + DuckDNS (free dynamic DNS)

1. Sign up at [duckdns.org](https://www.duckdns.org) → get a free `yourname.duckdns.org` subdomain
2. On your router: forward external port 80 → Pi's local IP port 80
3. Set up a cron job to update DuckDNS with your current IP:
```bash
crontab -e
# Add this line:
*/5 * * * * curl -s "https://www.duckdns.org/update?domains=YOURNAME&token=YOUR_TOKEN&ip=" > /dev/null
```

---

## Updating the app

When you pull new changes:

```bash
git pull
pnpm install
pnpm run build:prod
pm2 restart track-template
```

---

## Troubleshooting

| Problem | Check |
|---------|-------|
| Server won't start | `pm2 logs track-template` — look for missing env vars |
| "Cannot find module" | Run `pnpm install` again |
| Frontend loads but API calls fail | Check Nginx config, make sure PORT matches |
| Blank page | Check browser console; make sure the build completed |
| OpenAI errors | Verify `OPENAI_API_KEY` in `.env` is correct and has credits |
