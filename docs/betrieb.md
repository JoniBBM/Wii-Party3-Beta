# Betrieb & Installation

## Voraussetzungen

- **Docker Desktop** (macOS/Windows) oder Docker Engine mit Compose (Linux)
- Für den Beamer: ein aktueller Browser (Chrome, Edge, Safari, Firefox) mit WebGL 2. Ein MacBook mit Apple-Chip schafft den Modus **Schön** mühelos (gemessen in 1080p auf M1 Max: ca. 100 Bilder/s im Modus Schön, ca. 170 im Modus Schnell). Ältere Laptops oder 4K-Beamer: Modus **Schnell** wählen.
- Handys/Tablets: beliebiger aktueller Browser, keine App nötig.

## Starten

```bash
cp .env.example .env    # einmalig; ADMIN_PASSWORD setzen!
./start.sh              # im WLAN
./start.sh online       # zusätzlich übers Internet erreichbar
./start.sh logs         # Protokoll ansehen
./start.sh stop         # beenden
```

`start.sh` erkennt die WLAN-Adresse des Rechners automatisch und gibt sie an den Server weiter, damit die QR-Codes die richtige Adresse enthalten. Danach öffnet sich die Regie.

Ohne Skript geht es auch direkt mit `docker compose up -d --build` (dann ggf. `HOST_IP` in `.env` setzen).

## Einstellungen (`.env`)

| Variable | Bedeutung |
|---|---|
| `ADMIN_PASSWORD` | Passwort der Regie (Pflicht). |
| `MODERATOR_PASSWORD` | Optionales eigenes Passwort für Moderatoren. Sonst Regie-Passwort oder QR-Link. |
| `AUTH_DISABLED` | `true` = Regie/Moderator ohne Passwort (nur zum Testen!). |
| `HOST_PORT` | Port auf dem Rechner (Standard 8080). |
| `HOST_IP` | WLAN-Adresse für QR-Codes (setzt `start.sh` automatisch). |
| `PUBLIC_URL` | Feste öffentliche Adresse, wenn auf einem Server mit Domain betrieben. |
| `APP_SECRET` | Schlüssel für Sitzungen. Leer = wird automatisch in `data/.secret` erzeugt. |
| `LOG_LEVEL` | `warn` (Standard), `info` oder `debug`. |

## Netzwerk: Wie kommen die Handys aufs Spiel?

**Im WLAN (Standard):** Laptop und Handys im selben WLAN. Die Beitritts-Adresse lautet z. B. `http://192.168.178.20:8080`. Sie steckt in allen QR-Codes.

- Gäste-WLANs blockieren oft Verbindungen zwischen Geräten („Client-Isolation“). Dann einen eigenen Router/Hotspot verwenden oder den Online-Modus nutzen.
- Ein Handy-Hotspot des Laptops funktioniert ebenfalls.
- Hinweis: Der Port **5000** ist auf macOS vom AirPlay-Empfänger belegt – deshalb verwendet das Spiel 8080.

**Online (`./start.sh online`):** Zusätzlich startet ein kostenloser **Cloudflare Quick Tunnel** (kein Konto nötig). Er erzeugt eine zufällige Adresse wie `https://abc-def.trycloudflare.com`, die in *Einstellungen → Beitritts-Adresse* erscheint und dort ausgewählt werden kann. Vorteile: Handys brauchen kein WLAN, und durch HTTPS gibt es keine Browser-Warnungen. Die Adresse ändert sich bei jedem Start.

**Eigene Adresse:** Unter *Einstellungen → Beitritts-Adresse* kann jede Adresse fest eingetragen werden.

## Betrieb auf einem Server (optional)

Dasselbe Image läuft auch auf einem Linux-Server. Für HTTPS mit eigener Domain eignet sich z. B. Caddy als Vorschaltserver:

```yaml
# docker-compose.override.yml
services:
  insel:
    environment:
      PUBLIC_URL: https://insel.example.org
  caddy:
    image: caddy:2
    ports: ["80:80", "443:443"]
    command: caddy reverse-proxy --from insel.example.org --to insel:8080
    volumes: [caddy-data:/data]
volumes:
  caddy-data:
```

WebSockets werden von Caddy automatisch durchgereicht.

## Daten & Backups

Alles liegt im Ordner **`data/`** neben dem Projekt:

| Datei | Inhalt |
|---|---|
| `data/insel.db` | SQLite-Datenbank: Bibliothek, Vorlagen, Spiele (Spielstände) |
| `data/media/<spiel>/` | Spielerfotos (WebP, ohne Metadaten) |
| `data/.secret` | Sitzungsschlüssel |

**Backup:** Server stoppen (`./start.sh stop`) und den Ordner `data/` kopieren. Zusätzlich lassen sich Inhalte (*Bibliothek → Exportieren*) und einzelne Spielstände (*Spiele → Download*) als JSON sichern – Exporte enthalten **keine Fotos, PINs oder Passwörter**.

## Datenschutz

- Fotos werden beim Hochladen verkleinert (360×360), gedreht und ohne Metadaten (z. B. GPS) gespeichert.
- Sie liegen nur lokal in `data/media/` und werden nie exportiert.
- Nach dem Abend: *Einstellungen → Alle Fotos dieses Spiels löschen*. Beim Löschen eines Spiels werden seine Fotos ebenfalls gelöscht.
- Team-PINs und Passwörter werden nie an Beamer oder fremde Teams geschickt; Lösungen sieht vor der Auflösung nur die Spielleitung.

## Fehlerbehebung

| Problem | Ursache / Lösung |
|---|---|
| `./start.sh`: „Docker läuft nicht“ | Docker Desktop starten. |
| Seite lädt nicht unter `localhost:8080` | `./start.sh logs` ansehen; anderer Dienst auf Port 8080? → `HOST_PORT` in `.env` ändern. |
| Handys erreichen die Adresse nicht | Gleiches WLAN? Client-Isolation? Firewall des Macs (Systemeinstellungen → Netzwerk → Firewall: Docker erlauben)? Sonst `./start.sh online`. |
| Regie-Login „Es ist kein ADMIN_PASSWORD gesetzt“ | `.env` anlegen/ergänzen und neu starten. |
| Beamer zeigt „Die 3D-Insel konnte nicht geladen werden“ | Browser ohne WebGL 2 oder Hardwarebeschleunigung aus. Anderen Browser verwenden. |
| Beamer ruckelt | Grafik auf **Schnell** stellen (Taste Q). |
| Handy-Schütteln reagiert nicht | Browser geben Bewegungssensoren nur über HTTPS frei – im reinen WLAN-Betrieb (http) bleibt der Würfel-Knopf. Mit `./start.sh online` (https-Adresse) funktioniert auch das Schütteln. |
| Kamera für Selfies startet nicht | Das Handy öffnet seine Kamera-App über den Dateiauswahl-Dialog; funktioniert auch ohne HTTPS. Alternativ ein vorhandenes Bild wählen. |

### Die alte Version (Flask)

Die alte Version liegt unverändert in `legacy/`. Ihr Container startete nicht, weil `docker-compose.yml` `network_mode: "host"` verwendete: Unter Docker Desktop für macOS ist der Port dann nur in der internen Linux-VM erreichbar, nicht auf dem Mac. In `legacy/docker-compose.yml` ist das bereits auf ein normales Port-Mapping (`5001:5001`) korrigiert; Start mit `cd legacy && docker compose up -d`.
