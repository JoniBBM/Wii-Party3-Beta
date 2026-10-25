---
title: Betrieb (VPS, Cloudflare-Tunnel, Spielabend)
order: 20
audience: Betrieb
summary: Wie die Insel auf dem VPS hinter dem Cloudflare-Tunnel läuft, wie man einen Server neu einrichtet und absichert und was am Spielabend zu tun ist.
---
# Betrieb (VPS, Cloudflare-Tunnel, Spielabend)

## Aktueller Aufbau

Die Insel läuft dauerhaft auf einem eigenen Server (VPS) und ist über einen Cloudflare-Tunnel erreichbar.

| Was | Wert |
|---|---|
| Adresse | `https://party.jonas-leonie.com` (Regie: `/regie`, Beamer: `/beamer`, Moderator: `/moderator`) |
| Projektordner | `~/party/Wii-Party3-Beta` (Git-Klon von `github.com/JoniBBM/Wii-Party3-Beta`, Zweig `main`) |
| Start | `docker compose up -d --build` – **nur** mit `docker-compose.yml` |
| Container | `insel` (Abbild `insel-der-abenteuer:latest`), startet nach einem Neustart des Servers von selbst (`restart: unless-stopped`) |
| Port | `127.0.0.1:9534` am VPS → 8080 im Container; von außen nicht erreichbar |
| Tunnel | cloudflared als **systemd-Dienst** `cloudflared` direkt auf dem VPS („Variante B“), Ziel `http://127.0.0.1:9534` |
| Daten | `~/party/Wii-Party3-Beta/data` |
| Geheimnisse | `~/party/Wii-Party3-Beta/.env` (nur auf dem VPS, nie im Git) |

Einträge in der `.env` auf dem VPS (Werte hier bewusst nicht aufgeführt):
- `ADMIN_PASSWORD` – langes, zufälliges Passwort,
- `PUBLIC_URL=https://party.jonas-leonie.com` – feste Adresse für QR-Codes und Links in E-Mails; schaltet die strengen Regeln für den Internet-Betrieb ein,
- `HOST_BIND=127.0.0.1` – Port nur lokal,
- `TRUST_PROXY=172.16.0.0/12` – damit die Insel die echten Absender hinter dem Tunnel erkennt.

> **Wichtig:** Auf dem VPS **nicht** mit `-f docker-compose.server.yml` starten. Diese Datei entfernt den Port vollständig (gedacht für Variante A mit cloudflared im Docker-Netz); der Tunnel auf `127.0.0.1:9534` findet die Insel dann nicht, und Cloudflare meldet **Fehler 502**.

Auf demselben Server läuft auch eine (Beta-)Nextcloud. Die Insel teilt mit ihr weder Netz noch Ordner und ist in Speicher und Prozessen begrenzt, damit ein Ansturm die Nextcloud nicht ausbremst.

Aktualisieren: Anleitung **Aktualisieren**. Störungen: Anleitung **Notfall**.

## Neu einrichten: Server mit cloudflared als Systemdienst (Variante B)

Ziel: Die Insel ist **nur über den Tunnel** erreichbar, und echte Absenderadressen kommen an.

**1. Projekt holen** (auf dem Server):

```bash
mkdir -p ~/party && cd ~/party
git clone https://github.com/JoniBBM/Wii-Party3-Beta.git
cd Wii-Party3-Beta
```

**2. `.env` anlegen:**

```bash
cp .env.example .env
chmod 600 .env
openssl rand -base64 24        # Ausgabe als ADMIN_PASSWORD verwenden
nano .env
```

```ini
# .env auf dem Server
ADMIN_PASSWORD=…        # lang und zufällig
PUBLIC_URL=https://party.example.org
HOST_BIND=127.0.0.1
TRUST_PROXY=172.16.0.0/12
```

Mit `PUBLIC_URL` gelten die Regeln für den Internet-Betrieb: Die Insel startet nur mit sicherem Passwort, und die QR-Codes enthalten die Domain.

**3. Starten:**

```bash
docker compose up -d --build
curl -s http://127.0.0.1:9534/api/health      # {"ok":true,"version":"2.0.0"}
```

**4. Tunnel einrichten:** In Cloudflare unter *Zero Trust → Networks → Tunnels* einen Tunnel anlegen und den angezeigten Befehl zum Installieren von cloudflared als Systemdienst auf dem Server ausführen (er enthält ein geheimes Tunnel-Token – nirgends ablegen). Dann unter *Public Hostname* die Domain auf **`http://127.0.0.1:9534`** zeigen lassen. Ohne `TRUST_PROXY` sähen alle Gäste gleich aus (es greifen dann nur die globalen Bremsen).

**5. Prüfen** (siehe unten).

## Variante A: cloudflared läuft als Docker-Container

Läuft cloudflared bereits als Docker-Container (z. B. für andere Dienste), kann die Insel ganz ohne Port betrieben werden. Sie hängt dann nur im internen Netz `insel-tunnel`, kommt selbst nicht ins Internet und teilt kein Netz mit anderen Diensten.

```bash
docker compose -f docker-compose.yml -f docker-compose.server.yml up -d --build
```

cloudflared **zusätzlich** in dieses Netz hängen (in der Compose-Datei von cloudflared; bisherige Netze behalten, sonst verliert der Tunnel seine Verbindung):

```yaml
services:
  cloudflared:
    networks: [default, insel-tunnel]   # bisherige Netze + insel-tunnel
networks:
  insel-tunnel:
    external: true
```

In Cloudflare (*Zero Trust → Networks → Tunnels → Public Hostname*) die Domain auf **`http://insel:8080`** zeigen lassen. Nextcloud & Co. **nicht** in `insel-tunnel` hängen. `TRUST_PROXY` bleibt leer (cloudflared im Docker-Netz wird automatisch erkannt). Für den E-Mail-Versand braucht die Insel hier ein zusätzliches Netz mit Internet (siehe Kommentar in `docker-compose.server.yml`). Stoppen: `docker compose -f docker-compose.yml -f docker-compose.server.yml down`.

## Prüfen

- `ss -tlnp | grep 9534` auf dem Server: bei Variante B nur `127.0.0.1:9534`, bei Variante A nichts – **nie** `0.0.0.0:9534`.
- Aus einem anderen Netz (z. B. Handy ohne WLAN) `http://<Server-IP>:9534` aufrufen: darf **nicht** laden.
- `curl -s https://party.jonas-leonie.com/api/health` liefert `{"ok":true,"version":"2.0.0"}`.
- Regie über die Domain öffnen: Es darf **kein gelber Sicherheitshinweis** erscheinen. Er meldet abgeschaltete Anmeldung, schwache Passwörter, einen nicht erkannten Tunnel („Geräte hinter dem Tunnel nicht einzeln erkannt“ → `TRUST_PROXY` fehlt) oder `TRUST_PROXY` bei offenem Port (→ `HOST_BIND=127.0.0.1`).

## Empfohlen: Cloudflare Access vor die Regie

Unter *Zero Trust → Access → Applications* eine *Self-hosted*-Anwendung mit drei Pfaden anlegen: `party.example.org/regie`, `party.example.org/api/auth/admin` und `party.example.org/api/auth/moderator`. Regel: nur die eigene(n) E-Mail-Adresse(n). Dann kommt ohne Cloudflare-Login niemand auch nur bis zur Passwortabfrage. Teams, Spieler, Beamer und Moderator-QR-Links bleiben frei; Moderatoren mit Passwort-Login brauchen dann ebenfalls einen Zugang. (Ob das auf dem VPS eingerichtet ist, ist im Repository nicht vermerkt.)

## Was die Insel zusätzlich absichert

- Container ohne Root, schreibgeschützt, ohne Zusatzrechte, höchstens 1 GB Speicher und 256 Prozesse, Protokolle rotieren (höchstens 30 MB). Ein Ansturm kann andere Dienste weder ausbremsen noch die Platte füllen.
- Daten liegen nur in `./data` der Insel. Niemals den Docker-Socket oder Ordner anderer Dienste einhängen.
- Echte Absenderadressen werden nur vom eigenen Tunnel übernommen – direkt am Port gefälschte Kopfzeilen zählen nicht.

## Ohne Tunnel: eigener Vorschaltserver (Caddy)

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

WebSockets reicht Caddy automatisch durch; die echten Absender kommen über `X-Forwarded-For` (Caddy läuft als Container im Docker-Netz und wird damit als eigener Vorschaltserver erkannt).

## Konten, Einladungen und E-Mail

Der **Haupt-Admin** meldet sich mit `ADMIN_PASSWORD` aus `.env` an: auf der Anmeldeseite als Benutzername `admin` eingeben, dazu das Passwort – dafür braucht es keinen E-Mail-Versand. Unter *Konten* lädt er Spielleiter ein:

1. Name und E-Mail eintragen, Rolle wählen (*Spielleiter* oder *Admin*).
2. Ist der E-Mail-Versand eingerichtet, kommt eine Einladung mit Link (7 Tage gültig, nur einmal benutzbar). Sonst zeigt die Regie den Link zum Weitergeben an.
3. Über den Link legt die Person ihr Passwort fest (mindestens 10 Zeichen) und ist gleich angemeldet.

Spielleiter sehen und steuern nur ihre eigenen Spiele und Sammlungen; Admins alles. Unter *Konten* sieht ein Admin, wer gerade online ist, und kann Konten sperren, „überall abmelden“ oder löschen (Spiele und Inhalte gehen dann an den Haupt-Admin über).

**E-Mail-Versand einrichten:** *Einstellungen → E-Mail-Versand* – Mailserver, Port, Verschlüsselung (meist STARTTLS auf 587 oder SSL/TLS auf 465), Benutzer, Passwort und Absender eintragen, speichern, **Testmail** schicken. Das SMTP-Passwort liegt nur in der Datenbank auf dem Server und wird nie wieder an den Browser geschickt.

Wichtig: Links in E-Mails brauchen eine **feste Adresse** – `PUBLIC_URL` in `.env` oder die *Beitritts-Adresse* in den Einstellungen. Ohne sie verschickt „Passwort vergessen“ keine Mails (sonst ließe sich der Link über eine gefälschte Server-Adresse auf eine fremde Seite umbiegen). Auf dem VPS ist `PUBLIC_URL` gesetzt.

Bei Variante A hat die Insel absichtlich **keinen Internetzugang** – dort für den E-Mail-Versand ein Netz mit Internet anhängen oder Variante B nehmen.

## Am Spielabend

**Vorher**
1. Regie öffnen (`/regie`), anmelden, Spiel anlegen bzw. wählen.
2. **Beamer öffnen:**
   - auf dem Laptop mit dem Projekt: `./start.sh beamer` (Kiosk mit Vollbild und Ton, sofort freigegeben),
   - auf einem anderen Rechner: `/beamer` der Domain im Browser öffnen (einmal hineinklicken für Ton und Vollbild). Der Beamer zeigt unten rechts einen **sechsstelligen Code** → in der Regie unter *Beamer* eingeben. Mit Projekt auf diesem Rechner geht auch `./start.sh beamer https://party.jonas-leonie.com/beamer` (Kiosk; Freigabe dann per Code),
   - ist im selben Browser die Regie angemeldet (Knopf *Beamer öffnen*), ist der Beamer sofort freigegeben.
   Die Freigabe gilt 30 Tage.
3. **Moderator:** in der Regie unter *Einstellungen → Moderator verbinden* einen QR-Code erzeugen (24 Stunden gültig, kein Passwort nötig) – oder auf `/moderator` mit Moderator-Passwort und Spielcode anmelden.
4. Grafik und Ton steuert die Regie unter *Beamer* (bei Ruckeln *Ausgewogen* oder *Sparsam*, bzw. *Automatisch*).

**Während des Spiels**
- Wenn alle drin sind, in der Regie die **Anmeldung schließen** (Schalter „Anmeldung offen“ unter *Teams* bzw. in der Lobby). Danach kommt man nur noch mit Team-PIN oder Team-QR-Code hinein.
- Taucht ein fremdes Gerät in einem Team auf: *Teams → Neue PIN*. Alle Geräte dieses Teams verlieren ihren Zugang (auch Spieler-Zugänge, die über ein Team-Gerät erzeugt wurden) und treten mit der neuen PIN bzw. dem neuen QR-Code wieder bei.

**Danach**
- *Einstellungen → Alle Fotos dieses Spiels löschen* (Datenschutz). Beim Löschen eines Spiels werden seine Fotos ebenfalls gelöscht.
- Spiel beenden bzw. schließen; Handys und Beamer kommen dann nicht mehr hinein, der Spielstand bleibt gespeichert.
- Wer mag, stoppt die Insel ganz (`docker compose down` bzw. bei Variante A mit beiden Compose-Dateien).

## Sicherheit im Überblick

Die Insel ist für Gruppenabende gebaut, kann aber gefahrlos übers Internet laufen. Dafür sorgt:

- **Passwörter:** Regie und Moderator brauchen ein Passwort mit mindestens 10 Zeichen, das nicht als Standardpasswort bekannt ist. Mit einem schwachen Passwort läuft die Insel nur im WLAN: `./start.sh online` und der Server selbst verweigern den Start, Anmeldungen über den Tunnel werden abgelehnt, und die Regie zeigt einen Warnhinweis. Passwort ändern = in `.env` eintragen und neu starten – alle alten Regie-, Moderator- und Beamer-Zugänge des Haupt-Admins werden damit ungültig.
- **Beamer-Freigabe:** Ein neuer Beamer sieht nur die Insel. Fotos, Beitritts-Adressen und den Spielverlauf bekommt er erst nach der Freigabe (Code oder Link, 30 Tage).
- **Zugänge in QR-Codes** (Team, Moderator, Beamer, Konto-Links) stehen hinter dem Zeichen `#` in der Adresse und landen so in keinem Server- oder Tunnel-Protokoll.
- **Team-PINs mit 6 Ziffern** (ältere Spiele behalten ihre 4-stelligen, „Neue PIN“ vergibt 6). Der Team-QR-Code enthält einen unerratbaren Schlüssel.
- **Schutz vor Raten:** Falsche PINs und Passwörter werden doppelt gebremst. Ein globaler Zähler kappt verteiltes Raten, auch bei wechselnden Adressen (PINs: höchstens 20 Fehlversuche je Minute und 100 je Stunde – damit bleibt eine 6-stellige PIN einen ganzen Abend lang praktisch unerratbar). Dazu kommt eine Sperre je Adresse (wachsend bis 1 Stunde), aber nur, wo die Insel echte Adressen kennt (über den eigenen Tunnel) und solange von dort noch niemand richtig angemeldet wurde. So sperren ein paar Tippfehler weder den Saal im WLAN noch alle Gäste hinter dem gemeinsamen Internetanschluss der Location aus. IPv6-Adressen zählen je Anschluss (/64). Falsche QR-Codes zählen nicht global, damit niemand mit Unsinn-Codes die Beitritte aller blockieren kann.
- **Schutz vor Überflutung:** begrenzte Nachrichten je Verbindung; bis 400 Verbindungen je Adresse (eine ganze Party hinter einem Anschluss) und 3000 insgesamt – Regie, Moderator und freigegebene Beamer kommen immer herein. Höchstens 200 Spieler (40 je Team), Fotos höchstens 8 MB und nur echte Bildformate (höchstens zwei gleichzeitig in Bearbeitung); leere oder doppelte Befehle lösen keine Last aus.
- **Zugänge, die ihre Gültigkeit verlieren:** „Neue PIN“ macht alle Geräte dieses Teams ungültig. Bei Konten machen neues Passwort, Sperren oder „Überall abmelden“ sofort alle Anmeldungen ungültig – auch Beamer und Moderator-Links des Kontos: Offene Regie-Fenster springen ohne Neuladen zur Anmeldung, Beamer zeigen wieder den Kopplungscode. Wer sein eigenes Passwort ändert, bleibt auf diesem Gerät angemeldet.
- **Konten:** Passwörter der Spielleiter werden mit scrypt gespeichert. Einladungs- und Zurücksetzen-Links sind lang, zufällig, nur einmal gültig und laufen ab (7 Tage bzw. 1 Stunde); gespeichert wird nur ihr Hash. „Passwort vergessen“ verrät nicht, ob es eine E-Mail-Adresse gibt. Fremde private Sammlungen sind für Spielleiter unsichtbar.
- **Spielcodes:** Ohne Spielcode (oder Team-QR-Code) kommt niemand in ein Spiel. Falsche Codes werden gebremst wie falsche PINs.
- **Datensparsam:** Gäste ohne Anmeldung sehen keine Fotos und keinen Verlauf; PINs, Passwörter und Lösungen gehen nie an Handys oder Beamer. Der Moderator sieht Lösungen, aber keine Team-PINs oder Beitritts-Codes. Vor der Auflösung bleiben fremde Antworten vollständig verborgen (auch der Zeitpunkt).
- **Server:** Sicherheits-Kopfzeilen (CSP, kein Einbetten in fremde Seiten), Container ohne Root-Rechte mit schreibgeschütztem Dateisystem und Grenzen für Speicher, Prozesse und Protokolle, Schnell-Tunnel in fester Version. Ohne `./start.sh` ist der Port nur auf dem Rechner selbst offen.
- **Kein KI-Dienst zur Laufzeit:** Sprecher und Musik sind fertige Dateien – Eingaben der Spieler (Namen, Antworten) werden nur angezeigt, nie als Anweisung ausgeführt. „Prompt Injection“ ist damit kein Thema.

## Datenschutz

- Fotos werden beim Hochladen verkleinert (360×360), gedreht und ohne Metadaten (z. B. GPS) gespeichert.
- Sie liegen nur im Datenordner auf dem Server (`data/media/`) und werden nie exportiert.
- Nach dem Abend: *Einstellungen → Alle Fotos dieses Spiels löschen*. Beim Löschen eines Spiels werden seine Fotos ebenfalls gelöscht.
- Team-PINs und Passwörter werden nie an Beamer oder fremde Teams geschickt; Lösungen sieht vor der Auflösung nur die Spielleitung.
- Exporte (Inhalte, Spielstände) enthalten keine Fotos, PINs oder Passwörter. Datenbank-Backups dagegen enthalten alles (auch das SMTP-Passwort) – vertraulich aufbewahren.
