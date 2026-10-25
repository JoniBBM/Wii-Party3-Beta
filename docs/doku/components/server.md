---
name: Spielserver
type: service
layer: api
path: [packages/server/src/main.ts, packages/server/src/config.ts, packages/server/src/runtime.ts, packages/server/src/net.ts, packages/server/src/access.ts, packages/server/tsconfig.json, packages/server/tsup.config.ts, packages/server/package.json]
tech: [node, typescript, fastify, tsup, vitest]
provides:
  - http GET / – gebaute Weboberfläche (Regie, Beamer, Handys) als Single-Page-App
  - http GET /media/* – Spielerfotos und Sprachaufnahmen aus dem Datenordner
  - call startServer() – startet den kompletten Server (auch für Tests)
uses:
  - datenbank: call "Datenbank öffnen, Startinhalte anlegen, Spielstand speichern, Befehle protokollieren"
  - konten: call "Token prüfen, Konto und Schlüssel bestimmen (accountOf, staffKey, beamerKey, teamKey)"
  - echtzeit: call "Spiele-Hub und Socket.IO starten"
  - http-api: call "REST-Routen unter /api/* registrieren"
  - engine: call "applyCommand – Befehl auf den Spielstand anwenden; Rückgängig-Regeln, Countdown"
  - web-grundlage: file "liefert packages/web/dist aus (im Container fertig gebaut)"
files:
  - main.ts: Einstiegspunkt. Öffnet die Datenbank, legt beim ersten Start Inhalte an, lädt alle geöffneten Spiele, startet Fastify (HTTP) und Socket.IO, setzt die Sicherheits-Header und liefert die gebaute Weboberfläche und den Ordner /media aus. Verweigert im Internet-Betrieb den Start mit schwachem Passwort oder abgeschalteter Anmeldung.
  - config.ts: Liest alle Einstellungen aus den Umgebungsvariablen bzw. der Datei .env (Port, Datenordner, Passwörter, öffentliche Adresse, Tunnel, Vertrauen in Vorschaltserver). Erzeugt den geheimen Sitzungsschlüssel in data/.secret, falls APP_SECRET fehlt, und erkennt schwache Passwörter.
  - runtime.ts: Die Laufzeit eines geöffneten Spiels. Hält den Spielstand im Speicher, lässt jeden Befehl von der Spiel-Engine ausführen, speichert danach sofort, führt das Befehlsprotokoll, verwaltet bis zu 40 Rückgängig-Schritte und schließt Antworten automatisch, wenn ein Countdown abläuft.
  - net.ts: Bestimmt, von welcher Adresse eine Anfrage wirklich kommt. Weitergeleitete Absenderadressen (Cf-Connecting-Ip, X-Forwarded-For) werden nur von eigenen Vorschaltservern geglaubt (Tunnel im Docker-Netz oder per TRUST_PROXY eingetragen). Fasst IPv6-Adressen je Anschluss (/64) zusammen.
  - access.ts: Zentrale Rechteprüfung für HTTP und WebSocket. Entscheidet, welches Konto hinter einem Token steht, welches Spiel ein Gerät sieht und welche Rolle es darin hat (Konto wird im eigenen Spiel zur Regie, Moderator/Team/Spieler nur in ihrem Spiel, Beamer zeigt das gewählte Spiel seines Besitzers).
  - net.test.ts: Automatische Tests für die Adress-Erkennung hinter Tunnel/Proxy und die Anmeldebremsen.
  - server.test.ts: Integrationstest mit echtem Server und echten WebSockets – kompletter Spielablauf, Rechte, Konten, mehrere Spiele, Abmelden, Passwort vergessen.
  - packages/server/package.json: Paketbeschreibung des Servers mit Abhängigkeiten (Fastify, Socket.IO, better-sqlite3, sharp, nodemailer, zod) und Skripten (dev, build, start, import:legacy).
  - packages/server/tsconfig.json: TypeScript-Einstellungen für den Server (erbt von tsconfig.base.json).
  - packages/server/tsup.config.ts: Baut den Server samt gemeinsamer Spiellogik zu einer einzigen Datei dist/main.js; die nativen Module better-sqlite3 und sharp bleiben extern.
zone: intern
exposure: public
security:
  - auth: Im Internet-Betrieb (PUBLIC_URL gesetzt oder ./start.sh online) startet der Server nur mit sicherem Regie-Passwort (mindestens 10 Zeichen, kein bekanntes Standardpasswort) und nie mit AUTH_DISABLED
  - access: Rollen und Spielzugehörigkeit werden bei jeder Anfrage und jedem Befehl neu aus dem Token bestimmt (access.ts) – HTTP und WebSocket entscheiden gleich
  - headers: Content-Security-Policy (nur eigene Skripte), X-Frame-Options DENY, nosniff, Referrer-Policy no-referrer, Permissions-Policy ohne Ortung/Mikrofon/Zahlung, Cross-Origin-Opener-Policy; Antworten unter /api werden nicht zwischengespeichert
  - network: Absenderadressen aus Weiterleitungs-Headern zählen nur von eigenen Proxys (Docker-Netz ohne Gateway, TRUST_PROXY); direkt am Port gefälschte Header werden ignoriert
  - secrets: Sitzungsschlüssel aus APP_SECRET oder automatisch erzeugt in data/.secret (nur für den Besitzer lesbar)
  - input: Anfragen höchstens 2 MB; Fotos unter /media ohne Verzeichnislisten und nur privat zwischenspeicherbar
  - logging: Protokoll standardmäßig nur Warnungen und Fehler (LOG_LEVEL), keine Anfrage-Protokolle mit Zugängen
---
Der Spielserver ist das Herz der Insel: ein Node.js-Programm, das den Spielstand aller geöffneten Spiele im Speicher hält, jede Änderung sofort in die SQLite-Datenbank schreibt und den Stand in Echtzeit an alle Geräte verteilt.

**Grundprinzip:** Der Server ist die einzige „Quelle der Wahrheit“. Geräte schicken nur Befehle (z. B. „würfeln“). Die gemeinsame Spiel-Engine ([[engine]]) berechnet daraus den neuen Stand und eine Liste von Effekten (z. B. „Figur läuft 6 Felder“), die der Beamer inszeniert. Der Ablauf ist in [[befehl-und-spielstand]] beschrieben.

**Aufbau:** Ein Programm, ein Port (im Container 8080). Darüber laufen
- die REST-Schnittstelle unter `/api/*` ([[http-api]], [[konten]]),
- die Echtzeitverbindung über Socket.IO unter `/socket.io` ([[echtzeit]]),
- die Weboberfläche (fertig gebaute Dateien aus `packages/web/dist`) und die Mediendateien unter `/media/`.

Unbekannte Seiten liefern die Startseite der Weboberfläche aus (die Oberfläche entscheidet dann selbst, welche Seite sie zeigt); unbekannte `/api`- oder `/media`-Adressen geben „nicht gefunden“.

**Einstellungen** kommen aus Umgebungsvariablen bzw. der Datei `.env` im Projektordner (Vorlage: `.env.example`, siehe [[installation]]). Wichtig: `ADMIN_PASSWORD` (Haupt-Admin), optional `MODERATOR_PASSWORD`, `PUBLIC_URL` (feste Adresse), `APP_SECRET` (Sitzungsschlüssel), `TRUST_PROXY` (eigener Tunnel direkt auf dem Server), `INSEL_PORT`/`PORT` (Port ohne Docker), `DATA_DIR` (Datenordner), `LOG_LEVEL`.

**Internet-Betrieb:** Ist `PUBLIC_URL` gesetzt oder wurde mit `./start.sh online` gestartet, gelten strengere Regeln: kein Start mit schwachem Passwort, keine Anmeldung ohne Passwort. Zusätzlich lehnt der Server jede Regie- oder Moderator-Anmeldung, die über den Cloudflare-Tunnel kommt, bei schwachem Passwort ab – auch wenn jemand den Tunnel von Hand startet.

**Rückgängig:** Die Laufzeit merkt sich die letzten 40 Stände. Automatische Aktionen (z. B. Countdown) und bestimmte Befehle (siehe Spiel-Engine) sind nicht rückgängig zu machen. Spieldauer und Tempo-Einstellung bleiben beim Rückgängigmachen erhalten, außer es wird gerade die Einrichtung selbst zurückgenommen.

**Mehrere Spiele:** Jedes geöffnete Spiel hat seine eigene Laufzeit; verwaltet werden sie vom Spiele-Hub in [[echtzeit]].
