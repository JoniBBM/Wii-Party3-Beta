#!/usr/bin/env bash
# Insel der Abenteuer starten.
#   ./start.sh          – im WLAN (Laptop vor Ort)
#   ./start.sh online   – zusätzlich öffentlich erreichbar (Cloudflare-Tunnel, HTTPS)
#   ./start.sh stop     – alles beenden
#   ./start.sh logs     – Server-Protokoll ansehen
#   ./start.sh beamer   – Beamer-Fenster als Kiosk öffnen (Vollbild + Ton ohne Klick; Chrome/Edge)
set -euo pipefail
cd "$(dirname "$0")"

if [ "${1:-}" = "beamer" ]; then
  PORT=$(grep -E '^HOST_PORT=' .env 2>/dev/null | cut -d= -f2 || true)
  URL="${2:-http://localhost:${PORT:-8080}/beamer}"
  # Eigenes Profil, damit der Kiosk nicht das normale Browserfenster übernimmt
  PROFILE_DIR="${TMPDIR:-/tmp}/insel-beamer-profil"
  FLAGS="--kiosk --start-fullscreen --autoplay-policy=no-user-gesture-required --no-first-run --disable-session-crashed-bubble --user-data-dir=${PROFILE_DIR}"
  for APP in "Google Chrome" "Microsoft Edge" "Chromium" "Brave Browser"; do
    if [ -d "/Applications/${APP}.app" ]; then
      echo "🖥️  Öffne den Beamer in ${APP} (Kiosk). Beenden: ⌘Q"
      open -na "${APP}" --args $FLAGS "--app=${URL}"
      exit 0
    fi
  done
  for BIN in google-chrome chromium chromium-browser microsoft-edge; do
    if command -v "$BIN" >/dev/null 2>&1; then
      echo "🖥️  Öffne den Beamer in ${BIN} (Kiosk). Beenden: Alt+F4"
      nohup "$BIN" $FLAGS "--app=${URL}" >/dev/null 2>&1 &
      exit 0
    fi
  done
  echo "❌ Kein Chrome/Edge gefunden. Öffne ${URL} von Hand und klicke einmal hinein (für Ton und Vollbild)."
  exit 1
fi

if [ "${1:-}" = "stop" ]; then
  docker compose --profile online down
  exit 0
fi
if [ "${1:-}" = "logs" ]; then
  docker compose --profile online logs -f --tail 100
  exit 0
fi

if ! docker info >/dev/null 2>&1; then
  echo "❌ Docker läuft nicht. Bitte Docker Desktop starten und erneut versuchen."
  exit 1
fi

if [ ! -f .env ]; then
  cp .env.example .env
  echo "ℹ️  .env wurde aus .env.example angelegt – bitte ADMIN_PASSWORD darin ändern!"
fi

# WLAN-Adresse des Rechners ermitteln (für die QR-Codes)
HOST_IP=""
if command -v ipconfig >/dev/null 2>&1; then
  for IF in en0 en1 en2; do HOST_IP=$(ipconfig getifaddr "$IF" 2>/dev/null || true); [ -n "$HOST_IP" ] && break; done
fi
if [ -z "$HOST_IP" ] && command -v hostname >/dev/null 2>&1; then
  HOST_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || true)
fi
export HOST_IP
PORT=$(grep -E '^HOST_PORT=' .env 2>/dev/null | cut -d= -f2 || true)
export HOST_PORT=${PORT:-8080}

# (kein Array: die Bash 3.2 von macOS kennt leere Arrays mit `set -u` nicht)
PROFILE=""
[ "${1:-}" = "online" ] && PROFILE="--profile online"

echo "🏝️  Baue und starte die Insel …"
docker compose $PROFILE up -d --build

printf "⏳ Warte auf den Server"
for _ in $(seq 1 60); do
  if curl -fs "http://localhost:${HOST_PORT}/api/health" >/dev/null 2>&1; then break; fi
  printf "."; sleep 1
done
echo

echo ""
echo "✅ Läuft!"
echo "   Regie:      http://localhost:${HOST_PORT}/regie"
echo "   Beamer:     http://localhost:${HOST_PORT}/beamer   (Kiosk mit Ton/Vollbild: ./start.sh beamer)"
[ -n "$HOST_IP" ] && echo "   Handys:     http://${HOST_IP}:${HOST_PORT}  (gleiches WLAN)"
if [ "${1:-}" = "online" ]; then
  printf "🌍 Warte auf die Tunnel-Adresse"
  for _ in $(seq 1 30); do
    URL=$(docker compose logs tunnel 2>/dev/null | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -1 || true)
    [ -n "$URL" ] && break
    printf "."; sleep 1
  done
  echo
  [ -n "${URL:-}" ] && echo "   Internet:   ${URL}" || echo "   Tunnel-Adresse noch nicht da – siehe ./start.sh logs"
fi
echo ""
command -v open >/dev/null 2>&1 && open "http://localhost:${HOST_PORT}/regie" || true
