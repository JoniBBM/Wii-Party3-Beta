---
name: REST-Schnittstelle
type: api
layer: api
path: [packages/server/src/http/common.ts, packages/server/src/http/game-routes.ts, packages/server/src/http/library-routes.ts, packages/server/src/http/media-routes.ts, packages/server/src/http/system-routes.ts, packages/server/src/media.ts]
tech: [fastify, zod, sharp]
provides:
  - http GET, POST /api/games – eigene Spiele auflisten, neues Spiel anlegen
  - http POST /api/games/:id/select – Spiel wählen und öffnen (Regie und Beamer zeigen es)
  - http POST /api/games/:id/close, POST /api/games/deactivate – Spiel schließen
  - http DELETE /api/games/:id – Spiel samt Fotos löschen
  - http POST /api/games/:id/owner – Spiel einem anderen Konto geben (nur Admins)
  - http GET /api/games/:id/export – Spielstand als JSON (ohne PINs, ohne Fotos)
  - http GET /api/games/active/log – Verlauf des aktuellen Spiels (Regie, Moderator)
  - http POST /api/games/:id/photos/delete – alle Fotos eines Spiels löschen
  - http GET, POST /api/templates; PUT, DELETE /api/templates/:id – Vorlagen
  - http GET /api/library, GET /api/library/items – Sammlungen und Inhalte lesen
  - http POST, PUT, DELETE /api/library/collections… – Sammlungen anlegen, ändern, veröffentlichen, kopieren, sortieren, löschen
  - http POST, PUT, DELETE /api/library/items… – Fragen und Spiele anlegen, ändern, verdoppeln, löschen
  - http GET /api/library/audio-requests; POST, DELETE /api/library/items/:id/audio – Sprachaufnahmen der Fragen (nur Admins)
  - http GET /api/library/export, POST /api/library/import – Inhalte als JSON sichern und einlesen (auch alte minigames.json)
  - http POST, DELETE /api/media/photo – Spielerfoto hochladen bzw. entfernen
  - http GET /api/health – Lebenszeichen mit Versionsnummer
  - http GET /api/system/info – App-Name, Beitritts-Adressen (nur für Spielleitung und freigegebene Beamer)
  - http GET /api/system/security – Sicherheitslage für den Warnhinweis der Regie
  - http PUT /api/system/settings – App-Name und feste Beitritts-Adresse (nur Admins)
  - http GET, PUT /api/system/smtp, POST /api/system/smtp/test – E-Mail-Versand einrichten und testen (nur Admins)
  - http GET /api/system/overview – Überblick über Konten und Spiele (nur Admins)
uses:
  - server: call "Rolle und Spiel der Anfrage (access.ts), Absenderadresse (net.ts), Spiel-Laufzeit"
  - konten: call "Token und Konto prüfen, Mengenbremse, Testmail"
  - echtzeit: call "Spiele öffnen, wählen, schließen, löschen; Regie-Oberflächen über Änderungen informieren"
  - datenbank: call "Spiele, Vorlagen, Sammlungen, Inhalte, Einstellungen, Befehlsprotokoll"
  - spielmodell: call "Schemas und Standardwerte für Spiele, Vorlagen und Inhalte, Vorlesetext einer Frage"
  - engine: call "isPrivileged – wer Fotos anderer Spieler ändern darf"
  - cloudflared: http "Adresse des Schnell-Tunnels abfragen (Metrics, /quicktunnel)" [plain, port=2000, nur im Docker-Netz]
files:
  - http/common.ts: Gemeinsame Bausteine aller Routen – Fehlerklasse, „angemeldetes Konto nötig“, „nur Admins“, „nur eigenes Spiel“, „nur Spielleitung“, Leserechte des Moderators, Erkennung von Internet-Anfragen, zweistufige Anmeldebremse und Datei-Download.
  - http/game-routes.ts: Spiele anlegen (aus Vorlage, Einstellung oder Standard), wählen, schließen, löschen, übergeben und exportieren; Spielverlauf; alle Fotos eines Spiels löschen; Vorlagen verwalten. Spielleiter sehen nur eigene Spiele, Admins alle. Solange das eigene Spiel läuft, lässt sich kein neues anlegen.
  - http/library-routes.ts: Bibliothek mit Sammlungen und Inhalten (Spiele und Fragen) samt Besitz, Veröffentlichen und Kopieren, Import/Export als JSON, Übernahme alter minigames.json und Sprachaufnahmen der Fragen (MP3, OGG, WAV bis 6 MB, an den ersten Bytes geprüft).
  - http/media-routes.ts: Spielerfotos hochladen und entfernen. Fotos werden geprüft (nur echte Bildformate, höchstens 8 MB und 30 Mio. Pixel), gedreht, auf 360×360 verkleinert und als WebP ohne Metadaten gespeichert; höchstens zwei Fotos werden gleichzeitig verarbeitet.
  - http/system-routes.ts: Lebenszeichen, Beitritts-Adressen für die QR-Codes (eigene Adresse, PUBLIC_URL, Schnell-Tunnel, WLAN), Sicherheitslage für die Regie, App-Name, E-Mail-Einstellungen mit Testmail, Überblick für Admins.
  - media.ts: Hilfsfunktionen für den Medienordner – Fotoordner eines Spiels (nur gültige IDs, garantiert innerhalb von data/media), Ordner für Sprachaufnahmen und sicheres Löschen einzelner Dateien anhand ihrer Adresse.
zone: intern
exposure: public
security:
  - access: Konten sehen und steuern nur eigene Spiele, Vorlagen und Sammlungen (Admins alles); veröffentlichte Sammlungen sind für alle Konten lesbar, ändern nur als eigene Kopie; Moderatoren lesen die Bibliothek mit den Rechten des Spielbesitzers und ändern nichts
  - access: Kontenverwaltung, SMTP, Systemeinstellungen, Spielübergabe und Sprachaufnahmen nur für Admins
  - privacy: Fotos werden verkleinert, gedreht und ohne Metadaten (z. B. GPS) gespeichert, liegen nur in data/media/<spiel>, haben unerratbare Dateinamen, landen nie in Exporten und lassen sich je Spiel löschen; beim Löschen eines Spiels verschwinden sie mit
  - privacy: Spielstand-Export ohne Team-PINs und Team-Schlüssel; Beitritts-Adressen und Spiel-ID nur für Spielleitung, Moderator und freigegebene Beamer
  - secrets: Das SMTP-Passwort wird gespeichert, aber nie wieder an den Browser geschickt
  - ratelimit: Fotos höchstens 120 je Minute je Adresse und 6 je Minute je Spieler; Spieler-Anmeldungen 180 je Minute je Adresse
  - input: Alle Eingaben über Schemas geprüft; Spiel-IDs nach festem Muster; Importe höchstens 500 Sammlungen mit je 5000 Inhalten, fehlerhafte Einträge werden übersprungen
  - headers: Antworten unter /api werden nie zwischengespeichert (no-store)
---
Über diese Schnittstelle laufen alle Verwaltungsaufgaben, die nicht in Echtzeit passieren müssen: Spiele anlegen und wählen, die Bibliothek pflegen, Fotos hochladen, Einstellungen ändern. Die Anmeldung selbst liegt in [[konten]], das laufende Spiel in [[echtzeit]].

Jede Anfrage schickt ihr Token im Kopf `Authorization: Bearer …` mit. Daraus ergibt sich, welches Spiel gemeint ist: bei einem Konto sein gewähltes Spiel, bei Moderator, Team und Spieler das Spiel aus dem Zugang, bei Gästen der Spielcode. Antworten sind JSON; Fehler kommen als `{ error: "…" }` mit passendem Statuscode (400 ungültig, 401 bitte anmelden, 403 keine Berechtigung, 404 nicht gefunden, 409 gerade nicht möglich, 429 zu viele Versuche).

**Spiele:** Ein Spiel gehört dem Konto, das es angelegt hat. Ein „gewähltes“ Spiel ist geöffnet; geschlossene Spiele bleiben gespeichert. Der Export (*Regie → Spiele → Exportieren*) enthält den Spielstand ohne PINs und Fotos. Ein Wiedereinlesen von Spielständen gibt es nicht – zur Sicherung siehe [[notfall]].

**Bibliothek:** Sammlungen gehören einem Konto. Admins legen gemeinsame (veröffentlichte) Sammlungen an, Spielleiter zunächst private, die sie für alle veröffentlichen können. Fremde Sammlungen lassen sich als eigene Kopie übernehmen. Import und Export nutzen das Format `insel-inhalte`; alte `minigames.json` der Flask-Version werden beim Import umgewandelt.

**Beitritts-Adressen:** Für die QR-Codes sammelt der Server mögliche Adressen – die in den Einstellungen eingetragene, `PUBLIC_URL`, die Adresse des Schnell-Tunnels (fragt dazu den Tunnel-Container ab) und die WLAN-Adresse des Rechners (vom Startskript übergeben).

**Lebenszeichen:** `GET /api/health` antwortet mit `{"ok":true,"version":"2.0.0"}`. Docker nutzt es für den Gesundheitscheck, `./start.sh` zum Warten auf den Start, und auf dem Server prüft man damit nach einem Update ([[aktualisieren]]).
