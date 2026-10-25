---
name: Betrieb (Docker, Startskript, Build)
type: config
layer: betrieb
path: [Dockerfile, docker-compose.yml, docker-compose.server.yml, docker/, .dockerignore, start.sh, package.json, tsconfig.base.json, vitest.config.ts, .env.example]
tech: [docker, docker-compose, bash, npm-workspaces, vitest, cloudflared]
provides:
  - cli ./start.sh [online|stop|logs|beamer] – Insel bauen, starten, stoppen, Protokoll, Beamer-Kiosk
  - cli docker compose up -d --build – Container bauen und starten (Server/VPS)
  - cli npm run dev | build | start | test | typecheck | e2e – Entwicklung, Build, Tests
  - http Port 9534 am Rechner (HOST_PORT) → 8080 im Container
uses:
  - server: exec "node packages/server/dist/main.js im Container (Benutzer node)" [port=8080, intern]
  - sqlite: file "Datenordner ./data als /data eingehängt"
  - cloudflared: exec "startet den Schnell-Tunnel als Container tunnel (Profil online, cloudflared 2026.10.0)"
  - web-grundlage: exec "npm run build – Weboberfläche mit Vite bauen"
files:
  - Dockerfile: Baut das Abbild in Stufen – Weboberfläche (Vite) und Server-Bundle (tsup) bauen, nur die Laufzeit-Abhängigkeiten des Servers übernehmen, schlankes Node-22-Abbild mit Datenordner /data, Port 8080 und Gesundheitscheck auf /api/health alle 30 Sekunden.
  - docker-compose.yml: Standard-Aufbau mit dem Dienst insel (Port HOST_BIND:HOST_PORT → 8080, Datenordner ./data, Einstellungen aus .env, Härtung und Grenzen für Speicher, Prozesse und Protokolle) und dem optionalen Dienst tunnel (Cloudflare-Schnell-Tunnel, nur mit Profil online).
  - docker-compose.server.yml: Ergänzung für einen Server, auf dem cloudflared als Docker-Container läuft (Variante A) – entfernt den Port ganz, hängt die Insel nur ins interne Netz insel-tunnel ohne Internetzugang und erzwingt den Internet-Betrieb. Auf dem aktuellen VPS NICHT verwendet (Variante B).
  - docker/: Enthält entrypoint.sh – übergibt beim Start den Datenordner an den Benutzer node und startet den Server dann ohne Root-Rechte.
  - .dockerignore: Hält Git, node_modules, gebaute Dateien, den Datenordner, legacy, e2e und vor allem .env aus dem Docker-Abbild heraus.
  - start.sh: Startskript für den Laptop – legt beim ersten Start eine .env mit zufälligem Regie-Passwort an, ermittelt die WLAN-Adresse für die QR-Codes, öffnet den Port fürs WLAN, baut und startet, wartet auf das Lebenszeichen und öffnet die Regie. „online“ prüft vorher das Passwort und startet den Schnell-Tunnel, „beamer“ öffnet einen bereits freigegebenen Beamer als Kiosk-Fenster.
  - package.json: Wurzel des Monorepos (npm-Workspaces shared, server, web) mit den Befehlen für Entwicklung, Build, Tests, Typprüfung, Audio-Werkzeug und Browser-Tests; verlangt Node 22.12 oder neuer.
  - tsconfig.base.json: Gemeinsame, strenge TypeScript-Einstellungen für alle Pakete.
  - vitest.config.ts: Testlauf für alle Pakete (Dateien *.test.ts unter packages/*/src).
  - .env.example: Vorlage für die Datei .env mit allen Einstellungen und Erklärungen (ohne echte Passwörter). Die echte .env wird nie ins Git übernommen.
zone: intern
security:
  - secrets: Passwörter und Schlüssel nur in .env auf dem Rechner bzw. Server – in .gitignore und .dockerignore; start.sh legt sie mit Rechten 600 und zufälligem 16-Zeichen-Passwort an; docker compose startet ohne ADMIN_PASSWORD gar nicht
  - network: Ohne Startskript ist der Port nur auf dem Rechner selbst erreichbar (HOST_BIND=127.0.0.1); ./start.sh öffnet ihn fürs WLAN (0.0.0.0); auf dem Server bleibt er lokal und ist nur über den Tunnel erreichbar
  - network: Variante A (docker-compose.server.yml) – gar kein Port, nur internes Netz ohne Internet, kein gemeinsames Netz mit anderen Diensten
  - auth: ./start.sh online verweigert den Start bei AUTH_DISABLED oder einem Regie-/Moderator-Passwort unter 10 Zeichen
  - other: Container-Härtung – läuft als Benutzer node, schreibgeschütztes Dateisystem (nur /data und /tmp beschreibbar), keine zusätzlichen Rechte (alle Capabilities entzogen bis auf die drei für den Start), no-new-privileges
  - other: Grenzen gegen Ausbremsen anderer Dienste – höchstens 1 GB Speicher und 256 Prozesse (Tunnel 256 MB/128), Protokolle höchstens 3 × 10 MB
  - other: Tunnel-Abbild in fester Version (cloudflare/cloudflared:2026.10.0), bei Bedarf in docker-compose.yml anheben
---
Alles, was nötig ist, um die Insel zu bauen und zu betreiben: Docker-Abbild, Compose-Dateien, Startskript, Einstellungsvorlage und die Werkzeug-Einstellungen des Monorepos.

**Zwei Betriebsarten**

| | Laptop vor Ort | VPS (party.jonas-leonie.com) |
|---|---|---|
| Start | `./start.sh` (WLAN) bzw. `./start.sh online` | `docker compose up -d --build` im Ordner `~/party/Wii-Party3-Beta` |
| Port | `0.0.0.0:9534` (Handys im WLAN) | `127.0.0.1:9534` (nur lokal) |
| Internet | optional Schnell-Tunnel (`*.trycloudflare.com`, wechselnde Adresse) | cloudflared als systemd-Dienst auf dem VPS, feste Domain |
| Datenordner | `./data` | `~/party/Wii-Party3-Beta/data` |

Schritt für Schritt: [[installation]] (Laptop) und die Anleitung „Betrieb“ (VPS, Tunnel, Spielabend). Updates: [[aktualisieren]].

**Das Docker-Abbild** wird aus dem Quellcode gebaut (mehrstufig: bauen mit Compiler, dann nur das Nötige in ein schlankes Node-22-Abbild). Im Container läuft der Server auf Port 8080; am Rechner ist er unter `HOST_PORT` (Standard 9534) erreichbar. Port 5000 ist auf macOS vom AirPlay-Empfänger belegt – deshalb 9534.

**Einstellungen** stehen in `.env` (Vorlage `.env.example`). Compose reicht sie an den Container weiter: `ADMIN_PASSWORD` (Pflicht), `MODERATOR_PASSWORD`, `AUTH_DISABLED`, `APP_SECRET`, `PUBLIC_URL`, `HOST_IP`, `HOST_PORT`, `HOST_BIND`, `TRUST_PROXY`, `INSEL_ONLINE`. Bedeutung siehe [[installation]].

**Profil „online“:** Nur mit `./start.sh online` (bzw. `docker compose --profile online …`) startet zusätzlich der Container `tunnel`. Er baut einen kostenlosen Cloudflare-Schnell-Tunnel ohne Konto auf; der Server fragt dessen Adresse über die interne Messschnittstelle (Port 2000) ab und bietet sie in der Regie als Beitritts-Adresse an.
