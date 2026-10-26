---
name: Web-Grundlage (Start, Live-Verbindung, Bausteine)
type: ui
layer: ui
path:
  - packages/web/src/main.tsx
  - packages/web/src/styles.css
  - packages/web/src/lib/
  - packages/web/src/ui/
  - packages/web/src/types/
  - packages/web/src/pages/Home.tsx
  - packages/web/src/pages/account/
  - packages/web/vite.config.ts
  - packages/web/tsconfig.json
  - packages/web/package.json
tech: [react, vite, tailwind, zustand, socket.io-client, react-router]
provides:
  - http GET / – Startseite (Mitspielen, Beamer, Regie, Moderator)
  - http GET /konto – Passwort festlegen aus Einladungs- oder Zurücksetzen-Link
  - call Live-Verbindung als gemeinsamer Zustand (Spielstand, Sitzung, Effekte, Beamer-Show, Anwesenheit)
  - call REST-Aufrufe mit Zugang und deutschen Fehlermeldungen
  - call Oberflächen-Bausteine (Knöpfe, Karten, Dialoge, Meldungen, Teamfarben, Würfel, Countdown, QR-Code, Vulkananzeige)
  - call Verzeichnis und Suche aller Regie-Einstellungen
uses:
  - echtzeit: ws "Verbindung mit Zugang bzw. Spielcode; sendet Befehle, Rückgängig, Show-Befehle, Beamer-Kopplung und Rückmeldungen; empfängt Spielstand, Effekte, Show, Anwesenheit, Änderungs-Hinweise" [auth=token, tls, tunnel, im WLAN-Betrieb http]
  - konten: http "Eigene Sitzung abfragen (/api/auth/me), Link prüfen und Passwort setzen (/api/auth/link-info, /api/auth/set-password)" [auth=token, tls, tunnel, im WLAN-Betrieb http]
  - http-api: http "Systeminfo und Beitritts-Adressen (/api/system/info), Bibliothek und Vorlagen (/api/library, /api/templates), Foto hochladen (/api/media/photo)" [auth=token, tls, tunnel, im WLAN-Betrieb http]
  - spielmodell: call "Typen, Kataloge, Prüfung im Browser"
  - show: call "Standardwerte der Beamer-Show"
  - engine: call "Restzeit des Countdowns"
  - blockwelt: call "Pixel-Kacheln für den Blockwelt-Look der Handys"
files:
  - main.tsx: Startpunkt der Weboberfläche – schaltet die Eingabeprüfung in den browsertauglichen Modus, verhindert den Auto-Zoom auf iPhones und legt alle Adressen fest (/, /join, /team, /regie, /moderator, /beamer, /konto). Regie, Moderator, Team und Beamer werden erst bei Bedarf nachgeladen.
  - styles.css: Designsystem „Insel“ – helle, runde Wii-Optik mit Farbvariablen, Dunkelmodus für Regie/Moderator, lokal eingebundene Schriften, Animationen, Hervorhebung beim Sprung aus der Einstellungssuche sowie der Pixel-Look der Blockwelt und der Sternenhimmel-Look des Weltalls für Handys und Beamer-Einblendungen.
  - lib/live.ts: Die Live-Verbindung zum Server als gemeinsamer Zustand aller Seiten – Spielstand, eigene Sitzung, Rückgängig-Text, Serverzeit, Anwesenheit, Beamer-Show und Rückmeldungen. Sendet Befehle, Rückgängig, Show-Befehle und Kopplungscodes; übernimmt neue Zugänge vom Server und meldet ab, wenn der Server die Sitzung beendet.
  - lib/api.ts: Aufrufe der Server-Schnittstelle mit Zugang im Kopf der Anfrage, deutschen Fehlermeldungen und Datei-Download; meldet Regie/Moderator bei abgelaufener Anmeldung ab.
  - lib/storage.ts: Zugriff auf den Browser-Speicher – Zugänge getrennt nach „Platz“ (Regie, Moderator, Mitspieler, Beamer), zuletzt benutzter Spielcode, sonstige Merkwerte; funktioniert auch, wenn der Speicher gesperrt ist.
  - lib/session.ts: Gibt Bescheid, wenn eine Sitzung von außen beendet wurde (überall abgemeldet, gesperrt, Passwort geändert), löscht den Zugang und schickt die Seite zur Anmeldung.
  - lib/account.ts: Angemeldetes Konto der Regie (Haupt-Admin oder Spielleiter) und sein gewähltes Spiel.
  - lib/system.ts: Systeminfos wie App-Name und Beitritts-Adressen; frischt sie regelmäßig auf (eine Tunnel-Adresse kann später dazukommen).
  - lib/library.ts: Bibliothek (Sammlungen, Inhalte, Vorlagen) für Regie und Moderator; lädt neu, sobald ein anderes Gerät etwas ändert.
  - lib/hooks.ts: Kleine Helfer – Serverzeit, Befehl senden mit Ladeanzeige und Fehlermeldung, Bildschirmgröße, vorheriger Wert.
  - lib/settingsIndex.ts: Verzeichnis aller Einstellungen der Regie mit Bereich, Titel je Welt und Suchwörtern; daraus entstehen die Bereiche von „Spiel einrichten“ und die Suche. Springt zur Einstellung und hebt sie kurz hervor.
  - lib/settingsIndex.test.ts: Tests für die Einstellungssuche (Begriffe aller Welten, Umlaute, Admin-Einträge) und dafür, dass jede Einstellung ein Sprungziel hat.
  - lib/world.ts: Setzt den Look der gewählten Welt für Handys und Beamer (Blockwelt mit Pixel-Kacheln, Weltall dunkel).
  - lib/theme.ts: Hell/Dunkel – Regie und Moderator dürfen dunkel, Beamer und Handys sind immer hell; Wahl wird im Browser gemerkt.
  - lib/shake.ts: Würfeln durch Schütteln über den Bewegungssensor (nur über HTTPS, am iPhone nach Erlaubnis).
  - lib/wakeLock.ts: Hält den Bildschirm wach (z. B. Moderator-Handy), sofern der Browser es erlaubt (HTTPS).
  - lib/image.ts: Verkleinert Fotos vor dem Hochladen und lädt sie zum Server hoch.
  - lib/parse.ts: Liest Schätz-Eingaben in deutscher und englischer Schreibweise („1.500“, „3,5“).
  - lib/spotlight.ts: Gemeinsamer Zustand für die Frage, die auf dem Beamer gerade groß in der Mitte steht und dann in die Tafel fliegt.
  - ui/basics.tsx: Grundbausteine – Knöpfe, Symbolknöpfe, Karten, Abzeichen, Ladeanzeige, Umschalter, Schalter, Leerzustand, Eingabefeld, Zahlenauswahl.
  - ui/game.tsx: Spielbezogene Bausteine – Teamfarben und -chips, Avatar mit Foto oder Emoji, Würfelseite, Bonuswürfel, Countdown, QR-Code (wird im Browser erzeugt), Inhaltsart, Feldfarbe, Vulkananzeige, Verbindungspunkt.
  - ui/overlay.tsx: Dialogfenster und „Wirklich …?“-Rückfragen.
  - ui/toast.tsx: Kurze Erfolgs- und Fehlermeldungen am Bildschirmrand.
  - ui/PhotoPicker.tsx: Selfie aufnehmen oder Bild wählen (öffnet am Handy direkt die Frontkamera, auch ohne HTTPS).
  - ui/IslandBackdrop.tsx: Heller Himmel-und-Meer-Hintergrund für Start-, Beitritts- und Handyseiten.
  - types/n8ao.d.ts: Typbeschreibung für die Umgebungsverdeckungs-Bibliothek der 3D-Grafik.
  - pages/Home.tsx: Startseite – „Mitspielen“ (bzw. „Weiter als …“ für bereits beigetretene Geräte) und Links zu Beamer, Regie und Moderator.
  - pages/account/AccountLink.tsx: Seite hinter dem Einladungs- bzw. Passwort-vergessen-Link – prüft den Link, lässt das Passwort festlegen und meldet direkt in der Regie an.
  - packages/web/vite.config.ts: Bau-Einstellungen; im Entwicklungsmodus leitet der Vite-Server Schnittstelle, Fotos und Live-Verbindung an den lokalen Spielserver weiter.
  - packages/web/tsconfig.json: TypeScript-Einstellungen der Weboberfläche.
  - packages/web/package.json: Paketbeschreibung „@insel/web“ mit allen Bibliotheken (React, Router, Zustand, Socket.IO, three.js, Tailwind, Schriften, QR-Code) und Bau-Befehlen.
zone: client
exposure: public
security:
  - storage: Zugänge (vom Server signierte Tokens) liegen im Browser-Speicher (localStorage), getrennt nach Platz – Regie, Moderator, Mitspieler, Beamer –, damit ein Gerät z. B. Regie und Team gleichzeitig testen kann; dazu nur Spielcode und Design-Wahl. „Abmelden“ löscht den jeweiligen Zugang.
  - secrets: Einmal-Schlüssel in Links (Einladung, Team-QR-Code, Moderator- und Beamer-Link) stehen hinter „#“ und gelangen so nicht in Server- oder Tunnel-Protokolle; Einladungs- und Beamer-Link werden sofort aus der Adresszeile entfernt
  - auth: Zugang wird bei jeder Anfrage im Kopf mitgeschickt und beim Verbindungsaufbau übergeben; meldet der Server „abgelaufen“ oder „Sitzung beendet“, wird der Zugang gelöscht und zur Anmeldung geleitet
  - headers: Läuft unter der strengen Sicherheitsrichtlinie des Servers (nur eigene Skripte) – deshalb Prüfung ohne dynamisch erzeugten Code; Schriften und Bibliotheken liegen lokal, keine fremden Quellen
  - privacy: Fotos werden vor dem Hochladen verkleinert (höchstens 720 Pixel); QR-Codes entstehen im Browser, ohne fremden Dienst
  - other: Bewegungssensor und „Bildschirm wach halten“ gibt der Browser nur über HTTPS frei – im WLAN-Betrieb über HTTP fallen sie still weg
---
Gemeinsames Fundament aller Oberflächen im Browser: Startseite, Adressen, die **Live-Verbindung** zum Server, REST-Aufrufe, Speicher für Zugänge und die wiederverwendbaren Bausteine. Darauf bauen [[regie]], [[handy]], [[moderator]] und [[beamer]] auf.

**So bleibt alles live:** Jede Seite verbindet sich beim Öffnen einmal mit dem Server ([[echtzeit]]) und gibt dabei ihren Zugang (bzw. ohne Anmeldung den Spielcode) mit. Danach schickt der Server nach jeder Änderung den **kompletten, für diese Rolle gefilterten Spielstand** sowie die Effekte für Animationen. Die Seiten schicken nur Befehle zurück und zeigen an, was kommt – sie rechnen den Spielstand nie selbst weiter.

**Zugänge im Browser:** Es gibt vier getrennte Plätze im Browser-Speicher: Regie (Konto), Moderator, Mitspieler (Team-Gerät oder Spieler) und Beamer. Alle Zugänge stellt der Server aus und kann sie jederzeit ungültig machen (überall abmelden, Passwort geändert, neue Team-PIN). Weil Zugänge im Browser-Speicher für Skripte der Seite lesbar sind, lässt der Server nur eigene Skripte zu.

**Einstellungssuche:** Das Verzeichnis aller Einstellungen (Spiel einrichten, Beamer, Einstellungen, weitere Seiten) ist die Grundlage für die Suche in der Kopfzeile der Regie (Strg/⌘ + K). Jede Einstellung trägt auf ihrer Seite eine Sprungmarke; neue Einstellungen brauchen einen Eintrag im Verzeichnis und eine Marke am Element. Gefunden werden auch die Namen der anderen Welten.

**Design:** Hell und rund im Wii-Stil; Regie und Moderator auch dunkel. In der Blockwelt bekommen Handys und Beamer-Einblendungen einen Pixel-Look, im Weltall einen dunklen Sternenhimmel-Look – Fragen, Antworten und Zahlen bleiben in einer klar lesbaren Schrift.
