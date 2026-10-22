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

Ohne Skript geht es auch direkt mit `docker compose up -d --build` – dann ist der Port aber nur auf dem Rechner selbst erreichbar. Für Handys im WLAN `HOST_BIND=0.0.0.0` (und ggf. `HOST_IP`) in `.env` setzen; `./start.sh` macht das automatisch.

## Einstellungen (`.env`)

| Variable | Bedeutung |
|---|---|
| `ADMIN_PASSWORD` | Passwort der Regie (Pflicht, mindestens 10 Zeichen – sonst kein Internet-Betrieb). |
| `MODERATOR_PASSWORD` | Optionales eigenes Passwort für Moderatoren. Sonst Regie-Passwort oder QR-Link. |
| `AUTH_DISABLED` | `true` = Regie/Moderator ohne Passwort (nur zum Testen im WLAN – übers Internet gesperrt). |
| `HOST_PORT` | Port auf dem Rechner (Standard 9534; im Container intern 8080). |
| `HOST_BIND` | Wer den Port erreicht: `127.0.0.1` = nur dieser Rechner (Standard ohne Skript, richtig für Server), `0.0.0.0` = auch das WLAN (setzt `./start.sh`, wenn nichts eingetragen ist). |
| `TRUST_PROXY` | Nur wenn cloudflared direkt auf dem Server läuft: `172.16.0.0/12` (siehe *Eigener Server*). Sonst leer lassen. |
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

## Eigener Server mit Cloudflare-Tunnel (z. B. neben Nextcloud)

Ziel: Die Insel ist **nur über den Tunnel** erreichbar, kommt selbst nicht ins Internet und teilt kein Netz und keinen Ordner mit anderen Diensten.

**1. Aktualisieren und `.env` anlegen** (auf dem Server, im Projektordner):

```bash
git pull
```

```ini
# .env auf dem Server
ADMIN_PASSWORD=…        # lang und zufällig, z. B. Ausgabe von: openssl rand -base64 24
PUBLIC_URL=https://party.example.org
HOST_BIND=127.0.0.1
```

Mit `PUBLIC_URL` gelten die Regeln für den Internet-Betrieb: Die Insel startet nur mit sicherem Passwort, und die QR-Codes enthalten die Domain.

**2a. cloudflared läuft als Docker-Container (empfohlen).** Die Insel bekommt keinen Port am Server und hängt nur im internen Netz `insel-tunnel`:

```bash
docker compose -f docker-compose.yml -f docker-compose.server.yml up -d --build
```

Dann cloudflared **zusätzlich** in dieses Netz hängen (in der compose-Datei von cloudflared; bisherige Netze behalten, sonst verliert der Tunnel seine Verbindung):

```yaml
services:
  cloudflared:
    networks: [default, insel-tunnel]   # bisherige Netze + insel-tunnel
networks:
  insel-tunnel:
    external: true
```

In Cloudflare (*Zero Trust → Networks → Tunnels → Public Hostname*) die Domain auf **`http://insel:8080`** zeigen lassen. Nextcloud & Co. **nicht** in `insel-tunnel` hängen.

**2b. cloudflared läuft direkt auf dem Server** (Systemdienst): In `.env` zusätzlich `TRUST_PROXY=172.16.0.0/12` eintragen, mit `docker compose up -d --build` starten und die Domain auf **`http://127.0.0.1:9534`** zeigen lassen. Ohne `TRUST_PROXY` sähen alle Gäste gleich aus (es greifen dann nur die globalen Bremsen).

**3. Prüfen:**
- `ss -tlnp | grep 9534` auf dem Server: bei 2a nichts, bei 2b nur `127.0.0.1:9534` – nie `0.0.0.0:9534`.
- Aus einem anderen Netz (z. B. Handy ohne WLAN) `http://<Server-IP>:9534` aufrufen: darf **nicht** laden.
- Regie über die Domain öffnen: Es darf kein gelber Sicherheitshinweis erscheinen (er meldet schwache Passwörter und einen nicht erkannten Tunnel).

**4. Empfohlen: Cloudflare Access vor die Regie.** Unter *Zero Trust → Access → Applications* eine *Self-hosted*-Anwendung mit **einer** Anwendung und drei Pfaden anlegen: `party.example.org/regie`, `party.example.org/api/auth/admin` und `party.example.org/api/auth/moderator`. Regel: nur deine E-Mail-Adresse(n). Dann kommt ohne deinen Cloudflare-Login niemand auch nur bis zur Passwortabfrage. Teams, Spieler, Beamer und Moderator-QR-Links bleiben frei; Moderatoren mit Passwort-Login brauchen dann ebenfalls einen Zugang.

**Was die Insel dabei zusätzlich absichert:**
- Container ohne Root, schreibgeschützt, ohne Zusatzrechte, höchstens 1 GB Speicher und 256 Prozesse, Protokolle rotieren (max. 30 MB). Ein Ansturm auf die Insel kann Nextcloud weder ausbremsen noch die Platte füllen.
- Daten liegen nur in `./data` der Insel. Niemals den Docker-Socket oder Ordner anderer Dienste einhängen.
- Echte Absender-Adressen werden nur vom eigenen Tunnel übernommen – direkt am Port gefälschte Header zählen nicht.

**Am Spielabend:** Wenn alle drin sind, in der Regie die **Anmeldung schließen** (danach geht es nur noch mit Team-PIN/QR). Nach dem Abend die Fotos löschen; wer mag, stoppt die Insel ganz (`docker compose -f docker-compose.yml -f docker-compose.server.yml down`).

### Ohne Tunnel: eigener Proxy (Caddy)

Statt des Tunnels geht auch ein Vorschaltserver mit eigenem Zertifikat, z. B. Caddy im selben Docker-Netz:

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

WebSockets werden von Caddy automatisch durchgereicht; die echten Absender kommen über `X-Forwarded-For`.

## Konten, Einladungen und E-Mail

Der **Haupt-Admin** meldet sich mit `ADMIN_PASSWORD` aus `.env` an: auf der Anmeldeseite als Benutzername `admin` eingeben, dazu das Passwort – dafür braucht es keinen E-Mail-Versand. Unter *Konten* lädt er Spielleiter ein:

1. Name und E-Mail eintragen, Rolle wählen (*Spielleiter* oder *Admin*).
2. Ist der E-Mail-Versand eingerichtet, kommt eine Einladung mit Link (7 Tage gültig, nur einmal benutzbar). Sonst zeigt die Regie den Link zum Weitergeben an.
3. Über den Link legt die Person ihr Passwort fest (mindestens 10 Zeichen) und ist gleich angemeldet.

**E-Mail-Versand einrichten:** *Einstellungen → E-Mail-Versand* – Mailserver, Port, Verschlüsselung (meist STARTTLS auf 587 oder SSL/TLS auf 465), Benutzer, Passwort und Absender eintragen, speichern, **Testmail** schicken. Das SMTP-Passwort liegt nur in der Datenbank auf dem Server und wird nie wieder an den Browser geschickt.

Wichtig: Links in E-Mails brauchen eine **feste Adresse** – `PUBLIC_URL` in `.env` oder die *Beitritts-Adresse* in den Einstellungen. Ohne sie verschickt „Passwort vergessen“ keine Mails (sonst ließe sich der Link über eine gefälschte Server-Adresse auf eine fremde Seite umbiegen).

In `docker-compose.server.yml` (Variante 2a) hat die Insel absichtlich **keinen Internetzugang** – für den E-Mail-Versand dort zusätzlich ein Netz mit Internet anhängen (siehe Kommentar in der Datei) oder Variante 2b nehmen.

## Sicherheit

Die Insel ist für Gruppenabende gebaut, kann aber gefahrlos übers Internet laufen. Dafür sorgt:

- **Passwörter:** Regie und Moderator brauchen ein Passwort mit mindestens 10 Zeichen, das nicht als Standardpasswort bekannt ist. Mit einem schwachen Passwort läuft die Insel nur im WLAN: `./start.sh online` und der Server selbst verweigern den Start, Anmeldungen über den Tunnel werden abgelehnt, und die Regie zeigt einen Warnhinweis. Passwort ändern = in `.env` eintragen und `./start.sh` – alle alten Regie-, Moderator- und Beamer-Zugänge werden damit ungültig.
- **Beamer-Freigabe:** Ein neuer Beamer sieht nur die Insel. Fotos, Beitritts-Adressen und den Spielverlauf bekommt er erst nach der Freigabe. Am einfachsten öffnet man ihn mit `./start.sh beamer` oder per *Beamer öffnen* in der Regie auf demselben Rechner – dann ist er sofort freigegeben. Auf einem anderen Rechner zeigt er unten rechts einen **sechsstelligen Code**: In der Regie unter *Beamer* eingeben, fertig. Die Freigabe gilt 30 Tage.
- **Zugänge in QR-Codes** (Team, Moderator) stehen hinter `#` in der Adresse und landen so in keinem Server- oder Tunnel-Protokoll.
- **Team-PINs mit 6 Ziffern** (ältere Spiele behalten ihre 4-stelligen, „Neue PIN“ vergibt 6). Der Team-QR-Code enthält einen unerratbaren Schlüssel.
- **Schutz vor Raten:** Falsche PINs und Passwörter werden doppelt gebremst. Ein globaler Zähler kappt verteiltes Raten, auch bei IP-Wechsel (PINs: höchstens 20 Fehlversuche je Minute und 100 je Stunde – damit bleibt eine 6-stellige PIN einen ganzen Abend lang praktisch unerratbar). Dazu kommt eine Sperre je Adresse, aber nur, wo die Insel echte Adressen kennt (über den eigenen Tunnel) und solange von dort noch niemand richtig angemeldet wurde. So sperren ein paar Tippfehler weder den Saal im WLAN noch alle Gäste hinter dem gemeinsamen Internetanschluss der Location aus. IPv6-Adressen zählen je Anschluss (/64). Falsche QR-Codes zählen nicht global, damit niemand mit Unsinn-Codes die Beitritte aller blockieren kann.
- **Schutz vor Überflutung:** begrenzte Nachrichten je Verbindung; bis 400 Verbindungen je Adresse (eine ganze Party hinter einem Anschluss) und 3000 insgesamt – Regie, Moderator und freigegebene Beamer kommen immer rein. Höchstens 200 Spieler (40 je Team), Fotos höchstens 8 MB und nur echte Bildformate (höchstens zwei gleichzeitig in Bearbeitung); leere oder doppelte Befehle lösen keine Last aus.
- **Zugänge, die ihre Gültigkeit verlieren:** „Neue PIN“ (Regie → *Teams*) macht alle Geräte dieses Teams ungültig – auch Spieler-Zugänge, die über ein Team-Gerät erzeugt wurden. Nützlich, wenn ein fremdes Gerät in einem Team auftaucht.
- **Konten:** Passwörter der Spielleiter werden mit scrypt gespeichert. Einladungs- und Zurücksetzen-Links sind lang, zufällig, nur einmal gültig und laufen ab (7 Tage bzw. 1 Stunde); gespeichert wird nur ihr Hash. Neues Passwort, Sperren oder „Überall abmelden“ macht sofort alle Anmeldungen des Kontos ungültig – auch seine Beamer und Moderator-Links: Offene Regie-Fenster springen ohne Neuladen zur Anmeldung, Beamer zeigen wieder den Kopplungscode. Wer sein eigenes Passwort ändert, bleibt auf diesem Gerät angemeldet. „Passwort vergessen“ verrät nicht, ob es eine E-Mail-Adresse gibt. Spielleiter sehen und steuern nur ihre eigenen Spiele; fremde private Sammlungen sind für sie unsichtbar.
- **Spielcodes:** Ohne Code (oder Team-QR-Code) kommt niemand in ein Spiel. Falsche Codes werden gebremst wie falsche PINs.
- **Datensparsam:** Gäste ohne Anmeldung sehen keine Fotos und keinen Verlauf; PINs, Passwörter und Lösungen gehen nie an Handys oder Beamer. Der Moderator sieht Lösungen, aber keine Team-PINs oder Beitritts-Codes. Vor der Auflösung bleiben fremde Antworten vollständig verborgen (auch der Zeitpunkt).
- **Server:** Sicherheits-Header (CSP, kein Einbetten in fremde Seiten), Container ohne Root-Rechte mit schreibgeschütztem Dateisystem und Grenzen für Speicher, Prozesse und Protokolle, Tunnel in fester Version. Ohne `./start.sh` ist der Port nur auf dem Rechner selbst offen.
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
| Handys erreichen die Adresse nicht | Ohne `./start.sh` gestartet? Dann `HOST_BIND=0.0.0.0` in `.env`. Gleiches WLAN? Client-Isolation? Firewall des Macs (Systemeinstellungen → Netzwerk → Firewall: Docker erlauben)? Sonst `./start.sh online`. |
| Regie-Login „Es ist kein ADMIN_PASSWORD gesetzt“ | `.env` anlegen/ergänzen und neu starten. |
| `./start.sh online`: „Passwort zu kurz oder Standardpasswort“ | In `.env` ein `ADMIN_PASSWORD` mit mindestens 10 Zeichen setzen. |
| Beamer zeigt unten rechts einen Code | Er ist noch nicht freigegeben (6 Ziffern): Regie → *Beamer* → Code eingeben (oder `./start.sh beamer`). |
| Nach Passwortwechsel will alles neu angemeldet werden | Gewollt: Ein neues Passwort macht alte Zugänge ungültig. Beamer neu freigeben. |
| Beamer zeigt „Die 3D-Insel konnte nicht geladen werden“ | Browser ohne WebGL 2 oder Hardwarebeschleunigung aus. Anderen Browser verwenden. |
| Beamer ruckelt | Regie → *Beamer* → Grafik **Ausgewogen** oder **Sparsam** (bzw. **Automatisch**). |
| Handy-Schütteln reagiert nicht | Browser geben Bewegungssensoren nur über HTTPS frei – im reinen WLAN-Betrieb (http) bleibt der Würfel-Knopf. Mit `./start.sh online` (https-Adresse) funktioniert auch das Schütteln. |
| Kamera für Selfies startet nicht | Das Handy öffnet seine Kamera-App über den Dateiauswahl-Dialog; funktioniert auch ohne HTTPS. Alternativ ein vorhandenes Bild wählen. |

### Die alte Version (Flask)

Die alte Version liegt unverändert in `legacy/`. Ihr Container startete nicht, weil `docker-compose.yml` `network_mode: "host"` verwendete: Unter Docker Desktop für macOS ist der Port dann nur in der internen Linux-VM erreichbar, nicht auf dem Mac. In `legacy/docker-compose.yml` ist das bereits auf ein normales Port-Mapping (`5001:5001`) korrigiert; Start mit `cd legacy && docker compose up -d`.
