---
title: Installation (Laptop mit Docker)
order: 10
audience: Betrieb
summary: Die Insel auf einem Laptop mit Docker installieren und starten – im WLAN oder zusätzlich übers Internet.
---
# Installation (Laptop mit Docker)

Diese Anleitung bringt die Insel auf einem Laptop zum Laufen, z. B. für einen Spieleabend vor Ort. Für den Dauerbetrieb auf einem Server (VPS) siehe die Anleitung **Betrieb**.

## Voraussetzungen

- **Docker Desktop** (macOS/Windows) oder Docker Engine mit Compose (Linux). Docker muss laufen.
- **Git**, um das Projekt zu holen (oder das Projekt als ZIP herunterladen).
- **Beamer-Rechner:** ein aktueller Browser (Chrome, Edge, Safari, Firefox) mit WebGL 2. Ein MacBook mit Apple-Chip schafft die Grafikstufe *Schön* mühelos (gemessen in 1080p auf M1 Max: ca. 125 Bilder/s *Schön*, 175 *Ausgewogen*, 200 *Sparsam*). Standard ist *Automatisch*: startet schön und schaltet bei unter 40 Bildern/s selbst herunter. Umschalten jederzeit in der Regie unter *Beamer*.
- **Handys/Tablets:** beliebiger aktueller Browser, keine App nötig.

## 1. Projekt holen

```bash
git clone https://github.com/JoniBBM/Wii-Party3-Beta.git
cd Wii-Party3-Beta
```

## 2. Starten

```bash
./start.sh
```

Beim allerersten Start legt das Skript die Datei `.env` an (Kopie von `.env.example`) und erzeugt ein **zufälliges Regie-Passwort mit 16 Zeichen**. Es wird einmal im Terminal angezeigt und steht danach in `.env` (nur für den eigenen Benutzer lesbar). Dort lässt es sich jederzeit ändern.

Was `./start.sh` sonst noch tut:
1. prüft, ob Docker läuft,
2. ermittelt die **WLAN-Adresse** des Rechners und gibt sie an den Server weiter, damit die QR-Codes die richtige Adresse enthalten,
3. öffnet den Port fürs WLAN (`HOST_BIND=0.0.0.0`, außer in `.env` steht etwas anderes),
4. baut das Docker-Abbild und startet den Container `insel`,
5. wartet, bis `/api/health` antwortet, und öffnet die Regie im Browser.

Danach:

| Was | Adresse |
|---|---|
| Regie | `http://localhost:9534/regie` |
| Beamer | `./start.sh beamer` (Kiosk mit Vollbild und Ton, gleich freigegeben) oder `http://localhost:9534/beamer` |
| Handys | `http://<WLAN-Adresse>:9534` – steckt im QR-Code auf dem Beamer |

**Anmelden in der Regie:** Benutzername `admin`, Passwort = `ADMIN_PASSWORD` aus `.env`.

**Erste Schritte:** In der Regie ein Spiel anlegen (ein Knopf, danach führt ein Assistent durch die Einrichtung), Beamer öffnen – dort erscheint der QR-Code –, Handys scannen ihn (gleiches WLAN), Teams bilden, Spiel starten. Den Ablauf eines Abends beschreibt die Anleitung für die Spielleitung.

## 3. Weitere Befehle

```bash
./start.sh online       # zusätzlich übers Internet erreichbar (Cloudflare-Schnell-Tunnel)
./start.sh logs         # Protokoll ansehen (Strg+C beendet nur die Anzeige)
./start.sh beamer       # Beamer-Fenster als Kiosk (Vollbild, Ton ohne Klick; gleich freigegeben)
./start.sh stop         # alles beenden
```

`./start.sh beamer` sucht Chrome, Edge, Chromium oder Brave und öffnet den Beamer mit eigenem Browserprofil im Kiosk-Modus. Läuft der Container, holt es vorher im Container einen Beamer-Zugang – das Passwort verlässt dabei den Container nicht. Beenden mit ⌘Q (macOS) bzw. Alt+F4.

**Ohne Skript** geht es auch direkt mit `docker compose up -d --build` – dann ist der Port aber nur auf dem Rechner selbst erreichbar. Für Handys im WLAN in `.env` `HOST_BIND=0.0.0.0` (und ggf. `HOST_IP`) setzen; `./start.sh` macht das automatisch.

## 4. Einstellungen in `.env`

Die Datei `.env` liegt im Projektordner, wird **nie ins Git übernommen** und enthält die Geheimnisse. Vorlage mit Erklärungen: `.env.example`. Nach einer Änderung neu starten (`./start.sh` bzw. `docker compose up -d`).

| Variable | Bedeutung |
|---|---|
| `ADMIN_PASSWORD` | Passwort des Haupt-Admins (Regie). Pflicht, mindestens 10 Zeichen und kein bekanntes Standardpasswort – sonst kein Internet-Betrieb. |
| `MODERATOR_PASSWORD` | Optionales eigenes Passwort für Moderatoren. Sonst Regie-Passwort oder QR-Link aus der Regie. |
| `AUTH_DISABLED` | `true` = Regie/Moderator ohne Passwort. Nur zum Testen im eigenen WLAN – übers Internet gesperrt. |
| `HOST_PORT` | Port am Rechner (Standard 9534; im Container immer 8080). |
| `HOST_BIND` | Wer den Port erreicht: `127.0.0.1` = nur dieser Rechner (Standard ohne Skript, richtig für Server), `0.0.0.0` = auch das WLAN (setzt `./start.sh`, wenn nichts eingetragen ist). |
| `HOST_IP` | WLAN-Adresse für die QR-Codes (setzt `./start.sh` automatisch). |
| `PUBLIC_URL` | Feste öffentliche Adresse, wenn auf einem Server mit Domain betrieben. Schaltet die strengen Regeln für den Internet-Betrieb ein. |
| `TRUST_PROXY` | Nur wenn cloudflared direkt auf dem Server läuft: `172.16.0.0/12`. Sonst leer lassen. |
| `APP_SECRET` | Schlüssel für die Zugänge (mindestens 16 Zeichen). Leer = wird automatisch in `data/.secret` erzeugt. |
| `PORT` / `INSEL_PORT` | Port des Servers ohne Docker (Standard 8080; `INSEL_PORT` hat Vorrang). |
| `LOG_LEVEL` | `warn` (Standard), `info` oder `debug`. Wird von `docker-compose.yml` nicht an den Container weitergereicht – wirkt nur ohne Docker oder mit eigener Ergänzung der Compose-Datei. |
| `DATA_DIR` | Datenordner (ohne Docker; im Container immer `/data`). |

## 5. Netzwerk: Wie kommen die Handys aufs Spiel?

**Im WLAN (Standard):** Laptop und Handys im selben WLAN. Die Beitritts-Adresse lautet z. B. `http://192.168.178.20:9534`; sie steckt in allen QR-Codes.

- Gäste-WLANs blockieren oft Verbindungen zwischen Geräten („Client-Isolation“). Dann einen eigenen Router/Hotspot verwenden oder den Online-Modus nutzen.
- Ein Handy-Hotspot funktioniert ebenfalls.
- Port **5000** ist auf macOS vom AirPlay-Empfänger belegt – deshalb verwendet das Spiel 9534.
- Im reinen WLAN-Betrieb (http) geben Browser den Bewegungssensor nicht frei: Würfeln durch Schütteln geht dann nicht, der Würfel-Knopf schon.

**Online (`./start.sh online`):** Zusätzlich startet ein kostenloser **Cloudflare-Schnell-Tunnel** (kein Konto nötig). Er erzeugt eine zufällige Adresse wie `https://abc-def.trycloudflare.com`, die das Skript anzeigt und die in *Einstellungen → Beitritts-Adresse* erscheint und dort ausgewählt werden kann. Vorteile: Handys brauchen kein WLAN, und durch HTTPS gibt es keine Browser-Warnungen (Schütteln funktioniert). Die Adresse ändert sich bei jedem Start. Voraussetzung: sicheres Regie-Passwort (mindestens 10 Zeichen) und `AUTH_DISABLED` aus – sonst bricht das Skript ab, und auch der Server selbst verweigert den Start.

**Eigene Adresse:** Unter *Einstellungen → Beitritts-Adresse* kann jede Adresse fest eingetragen werden; sie hat dann Vorrang in den QR-Codes.

## 6. Ohne Docker (nur für Entwicklung)

Voraussetzung Node.js ab 22.12:

```bash
npm install
cp .env.example .env      # ADMIN_PASSWORD setzen
npm run build
npm start                 # Server auf Port 8080 mit gebauter Oberfläche
```

Für die Arbeit am Code siehe die Anleitung **Entwicklung**.

## Was liegt wo?

Alle Daten (Datenbank, Fotos, Sprachaufnahmen, Sitzungsschlüssel) liegen im Ordner `data/` im Projektordner. Sicherung und Wiederherstellung: Anleitung **Notfall**.
