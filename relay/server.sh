#!/bin/bash
# Runs Relay Studio on a Linux server (Ubuntu) with Docker and automatic HTTPS.
#
#   ./server.sh setup    one time: install Docker, add swap memory, create .env
#   ./server.sh start    build and start (also use after editing .env)
#   ./server.sh stop     stop
#   ./server.sh update   get the latest version, rebuild and restart
#   ./server.sh status   show whether it is running
#   ./server.sh logs     follow the app's log (Ctrl+C to leave; the app keeps running)
#   ./server.sh backup   save the database, videos and connections to backups/<date>.tar.gz
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

say()  { printf '%s\n' "$*"; }
fail() { printf 'Problem: %s\n' "$*" >&2; exit 1; }
compose() { sudo docker compose --profile web "$@"; }
setting() { grep -E "^$1=" .env 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"'"'"' \r' || true; }

check_env() {
  [ -f .env ] || fail "There is no .env file. Run ./server.sh setup first."
  local domain url password
  domain="$(setting DOMAIN)"; url="$(setting PUBLIC_URL)"; password="$(setting APP_PASSWORD)"
  [ -n "$domain" ] || fail "Set DOMAIN in .env to your address, e.g. DOMAIN=studio.example.com (no https://)."
  [ "$url" = "https://$domain" ] || fail "Set PUBLIC_URL in .env to https://$domain (it is currently '${url:-empty}')."
  [ "${#password}" -ge 12 ] || fail "Set APP_PASSWORD in .env to a password of at least 12 characters. It protects your channels."
}

case "${1:-help}" in
  setup)
    command -v apt-get >/dev/null || fail "This script expects Ubuntu or Debian."
    if ! command -v docker >/dev/null; then
      say "Installing Docker..."
      sudo apt-get update -qq
      sudo apt-get install -y -qq docker.io docker-compose-v2 git curl
      sudo systemctl enable --now docker
    fi
    # Small servers have 1 GB of memory, which is not enough to build the app. Swap space covers the gap.
    if [ "$(swapon --noheadings | wc -l)" -eq 0 ]; then
      say "Adding 2 GB of swap memory..."
      sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile >/dev/null && sudo swapon /swapfile
      grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
    fi
    if [ ! -f .env ]; then cp .env.example .env && chmod 600 .env; say "Created .env from the template."; fi
    say ""
    say "Next: edit .env (nano .env) and fill in DOMAIN, PUBLIC_URL, APP_PASSWORD and your keys."
    say "Then run: ./server.sh start"
    ;;
  start)
    check_env
    say "Building and starting. The first build takes several minutes on a small server."
    compose up -d --build
    say ""
    say "Started. Open $(setting PUBLIC_URL)"
    say "The first visit can take up to a minute while the HTTPS certificate is issued."
    ;;
  stop)   compose down; say "Stopped." ;;
  update)
    check_env
    git stash --quiet 2>/dev/null || true
    git pull --ff-only origin "$(git rev-parse --abbrev-ref HEAD)"
    compose up -d --build
    sudo docker image prune -f >/dev/null   # old builds would otherwise fill the disk
    say "Updated to: $(git log -1 --format='%s (%cd)' --date=short)"
    ;;
  status) compose ps; df -h / | tail -1 | awk '{print "Disk: " $3 " used, " $4 " free"}' ;;
  logs)   compose logs -f --tail 80 relay ;;
  backup)
    mkdir -p backups
    file="backups/relay-$(date +%Y-%m-%d-%H%M).tar.gz"
    # Reads the app's data volume through a throwaway container and packs it into one file.
    sudo docker run --rm -v relay_relay_data:/data:ro -v "$PWD/backups":/out alpine tar czf "/out/$(basename "$file")" -C /data .
    sudo chown "$(id -u):$(id -g)" "$file"
    say "Saved $file ($(du -h "$file" | cut -f1)). Copy it somewhere off this server."
    ;;
  *) sed -n '2,11p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' ;;
esac
