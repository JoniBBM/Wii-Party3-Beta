# Betrieb & Installation

## Voraussetzungen

- **Docker Desktop** (macOS/Windows) oder Docker Engine mit Compose (Linux)
- Für den Beamer: ein aktueller Browser (Chrome, Edge, Safari, Firefox) mit WebGL 2. Ein MacBook mit Apple-Chip schafft den Modus **Schön** mühelos (gemessen in 1080p auf M1 Max: ca. 125 Bilder/s *Schön*, 175 *Ausgewogen*, 200 *Sparsam*). Standard ist **Automatisch**: startet schön und schaltet bei unter 40 Bildern/s selbst herunter. Umschalten jederzeit in der Regie unter *Beamer*.
- Handys/Tablets: beliebiger aktueller Browser, keine App nötig.

## Starten

```bash
./start.sh              # im WLAN (legt beim ersten Mal .env mit zufälligem Regie-Passwort an)
./start.sh online       # zusätzlich übers Internet erreichbar
./start.sh logs         # Protokoll ansehen
./start.sh beamer       # Beamer-Fenster als Kiosk (Vollbild, Ton ohne Klick; gleich freigegeben)
./start.sh stop         # beenden
```

`start.sh` erkennt die WLAN-Adresse des Rechners automatisch und gibt sie an den Server weiter, damit die QR-Codes die richtige Adresse enthalten. Danach öffnet sich die Regie.

Ohne Skript geht es auch direkt mit `docker compose up -d --build` (dann ggf. `HOST_IP` in `.env` setzen).

## Einstellungen (`.env`)

| Variable | Bedeutung |
|---|---|
| `ADMIN_PASSWORD` | Passwort der Regie (Pflicht, mindestens 10 Zeichen – sonst kein Internet-Betrieb). |
| `MODERATOR_PASSWORD` | Optionales eigenes Passwort für Moderatoren. Sonst Regie-Passwort oder QR-Link. |
| `AUTH_DISABLED` | `true` = Regie/Moderator ohne Passwort (nur zum Testen im WLAN – übers Internet gesperrt). |
| `HOST_PORT` | Port auf dem Rechner (Standard 9534; im Container intern 8080). |
| `HOST_IP` | WLAN-Adresse für QR-Codes (setzt `start.sh` automatisch). |
| `PUBLIC_URL` | Feste öffentliche Adresse, wenn auf einem Server mit Domain betrieben. |
| `APP_SECRET` | Schlüssel für Sitzungen. Leer = wird automatisch in `data/.secret` erzeugt. |
| `LOG_LEVEL` | `warn` (Standard), `info` oder `debug`. |

## Netzwerk: Wie kommen die Handys aufs Spiel?

**Im WLAN (Standard):** Laptop und Handys im selben WLAN. Die Beitritts-Adresse lautet z. B. `http://192.168.178.20:9534`. Sie steckt in allen QR-Codes.

- Gäste-WLANs blockieren oft Verbindungen zwischen Geräten („Client-Isolation“). Dann einen eigenen Router/Hotspot verwenden oder den Online-Modus nutzen.
- Ein Handy-Hotspot des Laptops funktioniert ebenfalls.
- Hinweis: Der Port **5000** ist auf macOS vom AirPlay-Empfänger belegt – deshalb verwendet das Spiel 9534.

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

## Sicherheit

Die Insel ist für Gruppenabende gebaut, kann aber gefahrlos übers Internet laufen. Dafür sorgt:

- **Passwörter:** Regie und Moderator brauchen ein Passwort mit mindestens 10 Zeichen, das nicht als Standardpasswort bekannt ist. Mit einem schwachen Passwort läuft die Insel nur im WLAN: `./start.sh online` und der Server selbst verweigern den Start, Anmeldungen über den Tunnel werden abgelehnt, und die Regie zeigt einen Warnhinweis. Passwort ändern = in `.env` eintragen und `./start.sh` – alle alten Regie-, Moderator- und Beamer-Zugänge werden damit ungültig.
- **Beamer-Freigabe:** Ein neuer Beamer sieht nur die Insel. Fotos, Beitritts-Adressen und den Spielverlauf bekommt er erst nach der Freigabe. Am einfachsten öffnet man ihn mit `./start.sh beamer` oder per *Beamer öffnen* in der Regie auf demselben Rechner – dann ist er sofort freigegeben. Auf einem anderen Rechner zeigt er unten rechts einen **vierstelligen Code**: In der Regie unter *Beamer* eingeben, fertig. Die Freigabe gilt 30 Tage.
- **Zugänge in QR-Codes** (Team, Moderator) stehen hinter `#` in der Adresse und landen so in keinem Server- oder Tunnel-Protokoll.
- **Schutz vor Missbrauch:** begrenzte Anmeldeversuche je Gerät (bei Fehlversuchen wachsende Sperre), begrenzte Verbindungen und Nachrichten je Gerät, höchstens 200 Spieler (40 je Team), Fotos höchstens 8 MB und nur echte Bildformate.
- **Datensparsam:** Gäste ohne Anmeldung sehen keine Fotos und keinen Verlauf; PINs, Passwörter und Lösungen gehen nie an Handys oder Beamer.
- **Server:** Sicherheits-Header (CSP, kein Einbetten in fremde Seiten), Container ohne Root-Rechte mit schreibgeschütztem Dateisystem, Tunnel in fester Version.
- **Kein KI-Dienst zur Laufzeit:** Sprecher und Musik sind fertige Dateien – Eingaben der Spieler (Namen, Antworten) werden nur angezeigt, nie als Anweisung ausgeführt. „Prompt Injection“ ist damit kein Thema.

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
| Seite lädt nicht unter `localhost:9534` | `./start.sh logs` ansehen; anderer Dienst auf Port 9534? → `HOST_PORT` in `.env` ändern. |
| Handys erreichen die Adresse nicht | Gleiches WLAN? Client-Isolation? Firewall des Macs (Systemeinstellungen → Netzwerk → Firewall: Docker erlauben)? Sonst `./start.sh online`. |
| Regie-Login „Es ist kein ADMIN_PASSWORD gesetzt“ | `.env` anlegen/ergänzen und neu starten. |
| `./start.sh online`: „Passwort zu kurz oder Standardpasswort“ | In `.env` ein `ADMIN_PASSWORD` mit mindestens 10 Zeichen setzen. |
| Beamer zeigt unten rechts einen Code | Er ist noch nicht freigegeben: Regie → *Beamer* → Code eingeben (oder `./start.sh beamer`). |
| Nach Passwortwechsel will alles neu angemeldet werden | Gewollt: Ein neues Passwort macht alte Zugänge ungültig. Beamer neu freigeben. |
| Beamer zeigt „Die 3D-Insel konnte nicht geladen werden“ | Browser ohne WebGL 2 oder Hardwarebeschleunigung aus. Anderen Browser verwenden. |
| Beamer ruckelt | Regie → *Beamer* → Grafik **Ausgewogen** oder **Sparsam** (bzw. **Automatisch**). |
| Handy-Schütteln reagiert nicht | Browser geben Bewegungssensoren nur über HTTPS frei – im reinen WLAN-Betrieb (http) bleibt der Würfel-Knopf. Mit `./start.sh online` (https-Adresse) funktioniert auch das Schütteln. |
| Kamera für Selfies startet nicht | Das Handy öffnet seine Kamera-App über den Dateiauswahl-Dialog; funktioniert auch ohne HTTPS. Alternativ ein vorhandenes Bild wählen. |

### Die alte Version (Flask)

Die alte Version liegt unverändert in `legacy/`. Ihr Container startete nicht, weil `docker-compose.yml` `network_mode: "host"` verwendete: Unter Docker Desktop für macOS ist der Port dann nur in der internen Linux-VM erreichbar, nicht auf dem Mac. In `legacy/docker-compose.yml` ist das bereits auf ein normales Port-Mapping (`5001:5001`) korrigiert; Start mit `cd legacy && docker compose up -d`.
