---
title: Notfall & Fehlerbehebung
order: 40
audience: Betrieb
summary: Was tun, wenn die Insel nicht erreichbar ist, ein Passwort fehlt, Zugänge entzogen werden müssen – und wie man Daten sichert und wiederherstellt.
---
# Notfall & Fehlerbehebung

Alle Befehle für den VPS im Projektordner ausführen: `cd ~/party/Wii-Party3-Beta`. Auf dem Laptop im eigenen Projektordner.

## 1. Erste Prüfung

```bash
curl -s https://party.jonas-leonie.com/api/health   # von außen (über Cloudflare)
curl -s http://127.0.0.1:9534/api/health            # auf dem VPS direkt
docker compose ps                                    # läuft „insel“? Status healthy?
docker compose logs --tail 100 insel                 # Fehlermeldungen des Servers
systemctl status cloudflared                         # Tunnel-Dienst (nur VPS)
```

| Ergebnis | Bedeutung |
|---|---|
| Beide `curl` liefern `{"ok":true,…}` | Insel und Tunnel laufen – Problem liegt eher beim Gerät/Browser. |
| Nur der lokale `curl` klappt | Tunnel gestört → cloudflared prüfen (unten). |
| Keiner klappt | Container läuft nicht oder hängt → Container neu starten (unten). |

## 2. Container hängt oder läuft nicht

```bash
docker compose restart insel             # sanfter Neustart
docker compose up -d --build             # falls er gar nicht läuft (baut bei Bedarf neu)
docker compose up -d --force-recreate    # Container komplett neu anlegen
docker stats --no-stream insel           # Speicher/CPU (Grenze 1 GB)
```

Spielstände gehen dabei nicht verloren – jeder Stand ist sofort gespeichert; nur die Rückgängig-Schritte sind nach einem Neustart weg.

Häufige Ursachen in den Protokollen:
- **„Das Regie- bzw. Moderator-Passwort ist zu schwach …“** – im Internet-Betrieb (`PUBLIC_URL` gesetzt) startet die Insel nur mit sicherem Passwort. In `.env` ein `ADMIN_PASSWORD` mit mindestens 10 Zeichen setzen (bzw. `MODERATOR_PASSWORD` verbessern oder leeren).
- **„AUTH_DISABLED=true ist im Internet-Betrieb nicht erlaubt“** – in `.env` auf `false` setzen.
- **„Bitte ADMIN_PASSWORD in der Datei .env setzen“** (beim `docker compose`-Aufruf) – `.env` fehlt oder der Eintrag ist leer.
- **Platte voll** – `df -h`; alte Docker-Abbilder mit `docker image prune` entfernen. Die Protokolle der Insel sind auf 30 MB begrenzt.

## 3. Cloudflare meldet einen Fehler (502/1033)

- **Fehler 502** (Bad Gateway): Cloudflare erreicht die Insel nicht. Prüfen, ob der Container läuft und der Port lokal offen ist: `ss -tlnp | grep 9534` muss `127.0.0.1:9534` zeigen. Wurde mit `-f docker-compose.server.yml` gestartet, fehlt der Port – dann `docker compose down` und neu mit `docker compose up -d --build`.
- **Tunnel getrennt** (Cloudflare zeigt eine eigene Fehlerseite, z. B. 1033): `sudo systemctl restart cloudflared`, danach `systemctl status cloudflared` und `journalctl -u cloudflared --since "10 min ago"`.
- In Cloudflare (*Zero Trust → Networks → Tunnels*) prüfen, ob der Tunnel „Healthy“ ist und der Public Hostname auf `http://127.0.0.1:9534` zeigt.

## 4. Passwort vergessen

**Haupt-Admin:** Das Passwort steht nur in der Datei `.env` auf dem Server bzw. Laptop (`ADMIN_PASSWORD`). Dort nachsehen oder ein neues eintragen und den Container neu erzeugen:

```bash
nano .env                     # ADMIN_PASSWORD=… ändern
docker compose up -d          # übernimmt die neue Einstellung (Laptop: ./start.sh)
```

Folge: Alle bisherigen Regie-, Moderator- und Beamer-Zugänge des Haupt-Admins werden ungültig – Beamer danach neu freigeben.

**Spielleiter-Konto:** Auf der Anmeldeseite *Passwort vergessen* – funktioniert nur mit eingerichtetem E-Mail-Versand und fester Adresse. Sonst meldet sich ein Admin an und klickt unter *Konten* beim betreffenden Konto auf *Passwort-Link* (bzw. *Einladung erneut*, wenn noch kein Passwort gesetzt wurde). Ohne E-Mail-Versand zeigt die Regie den Link zum Weitergeben an; er gilt 1 Stunde (Einladungen 7 Tage).

**Moderator:** Moderator-Passwort steht in `.env` (`MODERATOR_PASSWORD`, sonst gilt das Regie-Passwort). Einfacher: in der Regie unter *Einstellungen → Moderator verbinden* einen QR-Code erzeugen.

**Team hat PIN vergessen:** Regie → *Teams* zeigt PIN und QR-Code jedes Teams.

## 5. Zugänge sofort entziehen

| Situation | Maßnahme |
|---|---|
| Fremdes Gerät in einem Team | Regie → *Teams* → *Neue PIN* |
| Handy eines Spielleiters verloren | Regie → *Konten* → *Weitere Aktionen* → *Überall abmelden* (oder *Sperren*) |
| Spielleiter soll nicht mehr rein | Konto sperren oder löschen |
| Regie-Passwort könnte bekannt sein | neues `ADMIN_PASSWORD` in `.env`, `docker compose up -d` |
| Verdacht, dass der Sitzungsschlüssel bekannt ist, oder alle müssen raus | neuen Schlüssel setzen (unten) |

**Alle Zugänge auf einmal ungültig machen:** Alle Tokens sind mit dem Sitzungsschlüssel signiert. Ein neuer Schlüssel meldet **alle** Geräte ab (Regie, Konten, Moderatoren, Beamer, Teams, Spieler):

```bash
openssl rand -hex 32          # Ausgabe als APP_SECRET in .env eintragen (mind. 16 Zeichen)
nano .env
docker compose up -d
```

Ist `APP_SECRET` leer, steckt der Schlüssel in `data/.secret`; Löschen dieser Datei (`sudo rm data/.secret`, die Datei gehört dem Container-Benutzer) und `docker compose restart insel` erzeugt ebenfalls einen neuen. Teams treten danach mit PIN bzw. QR-Code wieder bei.

## 6. Backup und Wiederherstellung

Alles liegt im Datenordner `data/` (VPS: `~/party/Wii-Party3-Beta/data`): Datenbank `insel.db` (mit `-wal`/`-shm`), Fotos, Sprachaufnahmen, Sitzungsschlüssel. Dazu kommt die Datei `.env` mit den Passwörtern.

**Sichern** (kurze Unterbrechung, damit die Datenbank in sich stimmig ist):

```bash
cd ~/party/Wii-Party3-Beta
docker compose stop insel
sudo tar -czf ~/insel-backup-$(date +%F).tar.gz data .env
docker compose start insel
```

Auf dem Laptop statt `docker compose stop/start`: `./start.sh stop` bzw. `./start.sh`. `sudo` ist nötig, weil der Datenordner im Container dem Benutzer `node` übergeben wird. Die Sicherung enthält Fotos, E-Mail-Adressen, das SMTP-Passwort, den Sitzungsschlüssel und das Regie-Passwort – **vertraulich aufbewahren** (nicht ins Git, nicht unverschlüsselt in fremde Clouds). Die Datenbank im laufenden Betrieb nicht einzeln kopieren – Änderungen stehen dann womöglich noch in `insel.db-wal`.

**Wiederherstellen:**

```bash
cd ~/party/Wii-Party3-Beta
docker compose stop insel
sudo mv data data-defekt-$(date +%F)          # alten Stand aufheben
sudo tar -xzf ~/insel-backup-JJJJ-MM-TT.tar.gz data
docker compose start insel
curl -s http://127.0.0.1:9534/api/health
```

Die `.env` aus der Sicherung nur zurückspielen, wenn sie verloren ist (`tar -xzf … .env`). Beim Start übergibt der Container den Datenordner automatisch wieder an seinen Benutzer.

**Zusätzlich ohne Unterbrechung sichern** lassen sich aus der Regie:
- Inhalte: *Bibliothek → Exportieren* (alle eigenen Sammlungen) bzw. eine einzelne Sammlung – als JSON, wieder einlesbar über *Bibliothek → Importieren*.
- Spielstände: *Spiele → Exportieren* – als JSON zum Aufheben. Ein Wiedereinlesen von Spielständen gibt es nicht.

Exporte enthalten **keine Fotos, PINs oder Passwörter**.

## 7. Fehlerbehebung (Spielabend)

| Problem | Ursache / Lösung |
|---|---|
| `./start.sh`: „Docker läuft nicht“ | Docker Desktop starten. |
| Seite lädt nicht unter `localhost:9534` | `./start.sh logs` ansehen; anderer Dienst auf Port 9534? → `HOST_PORT` in `.env` ändern. |
| Handys erreichen die Adresse nicht | Ohne `./start.sh` gestartet? Dann `HOST_BIND=0.0.0.0` in `.env`. Gleiches WLAN? Client-Isolation? Firewall des Macs (Systemeinstellungen → Netzwerk → Firewall: Docker erlauben)? Sonst `./start.sh online`. |
| Regie-Anmeldung: „Es ist kein ADMIN_PASSWORD gesetzt“ | `.env` anlegen/ergänzen und neu starten. |
| Regie-Anmeldung: „Anmeldung übers Internet gesperrt …“ | Passwort zu schwach für den Internet-Betrieb → sicheres `ADMIN_PASSWORD` setzen, neu starten. |
| „Zu viele Fehlversuche – bitte etwas warten“ | Bremse gegen Rateversuche. Eine Minute (bei Wiederholung länger, höchstens 1 Stunde) warten; Teams können stattdessen den Team-QR-Code scannen. |
| `./start.sh online`: „Passwort zu kurz oder Standardpasswort“ | In `.env` ein `ADMIN_PASSWORD` mit mindestens 10 Zeichen setzen. |
| Beamer zeigt unten rechts einen Code | Er ist noch nicht freigegeben (6 Ziffern): Regie → *Beamer* → Code eingeben (oder `./start.sh beamer`). |
| Nach Passwortwechsel will alles neu angemeldet werden | Gewollt: Ein neues Passwort macht alte Zugänge ungültig. Beamer neu freigeben. |
| Regie zeigt gelben Sicherheitshinweis | Schwaches Passwort, abgeschaltete Anmeldung, Tunnel nicht als eigener Proxy erkannt (`TRUST_PROXY` fehlt) oder `TRUST_PROXY` bei offenem Port (`HOST_BIND=127.0.0.1` setzen). Siehe Anleitung **Betrieb**. |
| E-Mails kommen nicht an | *Einstellungen → E-Mail-Versand → Testmail*; die Fehlermeldung nennt die Ursache (Anmeldung, Erreichbarkeit, Zeitüberschreitung, Absender abgelehnt). Feste Adresse (`PUBLIC_URL` oder Beitritts-Adresse) gesetzt? Bei Variante A fehlt dem Container das Internet. |
| Beamer zeigt „Die 3D-Insel konnte nicht geladen werden“ | Browser ohne WebGL 2 oder Hardwarebeschleunigung aus. Anderen Browser verwenden. |
| Beamer ruckelt | Regie → *Beamer* → Grafik **Ausgewogen** oder **Sparsam** (bzw. **Automatisch**). |
| Kein Ton am Beamer | Einmal in das Beamer-Fenster klicken (Browser erlauben Ton erst nach einer Berührung) oder `./start.sh beamer` nutzen. |
| Handy-Schütteln reagiert nicht | Browser geben Bewegungssensoren nur über HTTPS frei – im reinen WLAN-Betrieb (http) bleibt der Würfel-Knopf. Mit `./start.sh online` bzw. auf dem VPS (https) funktioniert auch das Schütteln. |
| Kamera für Selfies startet nicht | Das Handy öffnet seine Kamera-App über den Dateiauswahl-Dialog; funktioniert auch ohne HTTPS. Alternativ ein vorhandenes Bild wählen. |
| „Zu viele Verbindungen“ | Mehr als 400 Verbindungen von einer Adresse bzw. 3000 insgesamt. Kurz warten; Spielleitung und freigegebene Beamer sind davon nicht betroffen. |
