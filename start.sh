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
  # Beamer gleich freigeben: Zugang im laufenden Container erzeugen (das Passwort bleibt dort).
  # Klappt das nicht (z. B. anderer Rechner), zeigt der Beamer einen Code für die Regie.
  if [ -z "${2:-}" ] && [ -n "$(docker compose ps -q --status running insel 2>/dev/null)" ]; then
    BT=$(docker compose exec -T insel node -e "
      const b='http://localhost:8080', j={'content-type':'application/json'};
      fetch(b+'/api/auth/admin',{method:'POST',headers:j,body:JSON.stringify({password:process.env.ADMIN_PASSWORD||''})})
        .then(r=>r.json()).then(a=>fetch(b+'/api/auth/beamer-link',{method:'POST',headers:{...j,authorization:'Bearer '+a.token},body:'{}'}))
        .then(r=>r.json()).then(r=>process.stdout.write(r.token||'')).catch(()=>{})" 2>/dev/null || true)
    [ -n "$BT" ] && URL="${URL}#bt=${BT}"
  fi
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
  # Neue Installation: zufälliges, sicheres Regie-Passwort erzeugen
  NEWPW=$(LC_ALL=C tr -dc 'A-HJ-NP-Za-km-z2-9' </dev/urandom | head -c 16 || true)
  sed "s/^ADMIN_PASSWORD=.*/ADMIN_PASSWORD=${NEWPW}/" .env.example > .env
  chmod 600 .env
  echo "🔑 Neue .env angelegt. Regie-Passwort: ${NEWPW}"
  echo "   (steht in der Datei .env – dort kannst du es jederzeit ändern)"
fi

# Wert aus .env lesen (ohne Anführungszeichen)
envval() { grep -E "^$1=" .env 2>/dev/null | tail -1 | cut -d= -f2- | sed -e 's/^["'"'"']//' -e 's/["'"'"']$//'; }

if [ "${1:-}" = "online" ]; then
  # Übers Internet nur mit sicherem Passwort und nie ohne Anmeldung
  case "$(envval AUTH_DISABLED | tr '[:upper:]' '[:lower:]')" in
    1|true|yes) echo "❌ AUTH_DISABLED ist in .env eingeschaltet – übers Internet nicht erlaubt. Bitte auf false setzen."; exit 1 ;;
  esac
  PW="$(envval ADMIN_PASSWORD)"
  if [ ${#PW} -lt 10 ] || [ "$PW" = "bitte-aendern" ]; then
    echo "❌ Das Regie-Passwort in .env ist zu kurz oder ein Standardpasswort (mindestens 10 Zeichen)."
    echo "   Bitte ADMIN_PASSWORD in .env ändern – übers Internet startet die Insel sonst nicht."
    exit 1
  fi
  MPW="$(envval MODERATOR_PASSWORD)"
  if [ -n "$MPW" ] && [ ${#MPW} -lt 10 ]; then
    echo "❌ Das Moderator-Passwort in .env ist zu kurz (mindestens 10 Zeichen) – bitte ändern oder leer lassen."
    exit 1
  fi
  export INSEL_ONLINE=true
else
  export INSEL_ONLINE=false
  # nur im WLAN: einen noch laufenden Tunnel von „./start.sh online“ beenden
  docker compose --profile online rm -sf tunnel >/dev/null 2>&1 || true
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
echo "   Beamer:     ./start.sh beamer   (Kiosk mit Ton/Vollbild, gleich freigegeben)"
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
[ -z "${INSEL_NO_OPEN:-}" ] && command -v open >/dev/null 2>&1 && open "http://localhost:${HOST_PORT}/regie" || true
