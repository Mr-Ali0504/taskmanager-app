#!/bin/bash
# Runs Relay Studio in the background on this Mac, without keeping a Terminal window open.
#
#   ./relay.sh start     build if needed, start now, and start automatically at every login
#   ./relay.sh stop      stop, and stay stopped until you start it again
#   ./relay.sh restart   stop and start
#   ./relay.sh update    get the latest version, rebuild, and restart if it was running
#   ./relay.sh status    say whether it is running and where
#   ./relay.sh logs      show the log and keep following it (Ctrl+C to leave; the app keeps running)
#   ./relay.sh open      open the app in your browser
#
# Logs are written to the "logs" folder next to this file:
#   logs/app.log      what the app is doing: uploads, failures, scheduled posts
#   logs/update.log   output of the last update or build
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LABEL="com.relaystudio.app"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOGS="$DIR/logs"
APP_LOG="$LOGS/app.log"
UPDATE_LOG="$LOGS/update.log"
DOMAIN_TARGET="gui/$(id -u)"

say()  { printf '%s\n' "$*"; }
fail() { printf 'Problem: %s\n' "$*" >&2; exit 1; }

# Double-clicked scripts start with a bare PATH, so look in the usual places for Node (Homebrew, nvm).
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null 2>&1 && [ -s "$HOME/.nvm/nvm.sh" ]; then . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1; fi

# The address comes from PUBLIC_URL in .env so that the Google and Meta sign-in addresses keep working.
public_url() {
  local url=""
  [ -f "$DIR/.env" ] && url="$(grep -E '^PUBLIC_URL=' "$DIR/.env" | tail -1 | cut -d= -f2- | tr -d '"'"'"' \r')"
  printf '%s' "${url:-http://localhost:5173}"
}
port_of() {
  local port
  port="$(printf '%s' "$1" | sed -E 's#^https?://[^:/]+(:([0-9]+))?.*$#\2#')"
  printf '%s' "${port:-5173}"
}
URL="$(public_url)"
PORT="$(port_of "$URL")"

xml() { printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'; }

plist() {
  local node_bin="$1"
  cat <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>WorkingDirectory</key><string>$(xml "$DIR")</string>
  <key>ProgramArguments</key>
  <array>
    <string>$(xml "$node_bin")</string>
    <string>--env-file-if-exists=.env</string>
    <string>dist/server/index.js</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>NODE_ENV</key><string>production</string>
    <key>HOST</key><string>127.0.0.1</string>
    <key>PORT</key><string>$PORT</string>
    <key>PUBLIC_URL</key><string>$(xml "$URL")</string>
    <key>PATH</key><string>$(xml "$(dirname "$node_bin")"):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>$(xml "$APP_LOG")</string>
  <key>StandardErrorPath</key><string>$(xml "$APP_LOG")</string>
</dict>
</plist>
PLIST
}

require_mac()  { [ "$(uname)" = "Darwin" ] || fail "The background service is for macOS. On other systems use: npm run build && npm start"; }
require_node() {
  command -v node >/dev/null 2>&1 || fail "Node.js was not found. Install it from https://nodejs.org and try again."
  local major; major="$(node -p 'process.versions.node.split(".")[0]')"
  [ "$major" -ge 22 ] || fail "Node.js 22 or newer is needed (found $(node -v))."
}
is_loaded() { launchctl print "$DOMAIN_TARGET/$LABEL" >/dev/null 2>&1; }
is_healthy() { curl -fsS -m 3 "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; }

build() {
  mkdir -p "$LOGS"
  say "Building (details in logs/update.log)..."
  {
    echo "=== $(date '+%Y-%m-%d %H:%M:%S') build ==="
    cd "$DIR" && npm install --no-audit --no-fund && npm run build
  } >>"$UPDATE_LOG" 2>&1 || { tail -n 25 "$UPDATE_LOG"; fail "The build failed. The lines above are from logs/update.log."; }
}

rotate_log() {
  # Keep the log readable: once it passes about 5 MB, the old one moves to app.log.1.
  if [ -f "$APP_LOG" ] && [ "$(wc -c <"$APP_LOG")" -gt 5000000 ]; then mv -f "$APP_LOG" "$APP_LOG.1"; fi
}

cmd_start() {
  require_mac; require_node
  mkdir -p "$LOGS" "$(dirname "$PLIST")"
  [ -f "$DIR/.env" ] || fail "There is no .env file yet. Copy .env.example to .env and fill in your keys first."
  [ -d "$DIR/node_modules" ] && [ -f "$DIR/dist/server/index.js" ] && [ -f "$DIR/dist/web/index.html" ] || build
  if is_loaded; then launchctl bootout "$DOMAIN_TARGET/$LABEL" >/dev/null 2>&1; sleep 1; fi
  if is_healthy || lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    fail "Something is already using port $PORT. If 'npm run dev' is open in a Terminal window, stop it there with Ctrl+C and try again."
  fi
  rotate_log
  plist "$(command -v node)" >"$PLIST"
  launchctl bootstrap "$DOMAIN_TARGET" "$PLIST" || fail "macOS would not start the service. See $APP_LOG"
  printf 'Starting'
  for _ in $(seq 1 30); do
    if is_healthy; then
      say ""; say "Relay Studio is running: $URL"
      say "It will also start by itself whenever you log in to this Mac."
      say "Logs: $LOGS"
      return 0
    fi
    printf '.'; sleep 1
  done
  say ""; say "It did not come up within 30 seconds. Last lines of the log:"; tail -n 20 "$APP_LOG" 2>/dev/null
  exit 1
}

cmd_stop() {
  require_mac
  if is_loaded; then launchctl bootout "$DOMAIN_TARGET/$LABEL" >/dev/null 2>&1; fi
  rm -f "$PLIST"
  say "Relay Studio is stopped. It stays off until you start it again."
}

cmd_status() {
  require_mac
  if is_healthy; then say "Running: $URL"
  elif is_loaded; then say "Started, but not answering on port $PORT. Check the log: $APP_LOG"
  else say "Stopped."
  fi
  say "Logs: $LOGS"
}

cmd_update() {
  require_node
  mkdir -p "$LOGS"
  local was_running=0; is_loaded 2>/dev/null && was_running=1
  local branch; branch="$(git -C "$DIR" rev-parse --abbrev-ref HEAD)" || fail "This folder is not a git checkout."
  say "Getting the latest version..."
  {
    echo "=== $(date '+%Y-%m-%d %H:%M:%S') update (branch $branch) ==="
    # npm sometimes rewrites package-lock.json, which would block the pull. Set such changes aside.
    git -C "$DIR" diff --quiet || git -C "$DIR" stash push -m "relay update $(date '+%Y-%m-%d %H:%M')"
    git -C "$DIR" pull --ff-only origin "$branch"
  } >>"$UPDATE_LOG" 2>&1 || { tail -n 15 "$UPDATE_LOG"; fail "Could not download the update. The lines above are from logs/update.log. The app was left as it was."; }
  build
  say "Updated to: $(git -C "$DIR" log -1 --format='%s (%cd)' --date=short)"
  if [ "$was_running" = 1 ]; then cmd_start; else say "It was not running, so it was not started. Use: ./relay.sh start"; fi
}

cmd_logs() {
  mkdir -p "$LOGS"; touch "$APP_LOG"
  say "Log file: $APP_LOG   (Ctrl+C stops following; the app keeps running)"
  tail -n 60 -f "$APP_LOG"
}

case "${1:-help}" in
  start)   cmd_start ;;
  stop)    cmd_stop ;;
  restart) cmd_stop; cmd_start ;;
  status)  cmd_status ;;
  update)  cmd_update ;;
  logs)    cmd_logs ;;
  open)    require_mac; open "$URL" ;;
  _plist)  plist "$(command -v node)" ;;   # prints the service definition, for troubleshooting
  *)       sed -n '2,14p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' ;;
esac
