---
name: Echtzeit & Spiele-Hub
type: service
layer: api
path: [packages/server/src/hub.ts, packages/server/src/live.ts]
tech: [node, socket.io, websocket]
provides:
  - ws cmd – Befehl an das eigene Spiel (Antwort ok/Fehler)
  - ws undo – letzten Schritt rückgängig (nur Regie)
  - ws auth – neues Token auf der bestehenden Verbindung
  - ws show – Beamer-Show steuern (Grafik, Ton, Musik, Kamera, Erklärung; nur Spielleitung)
  - ws beamer:pair – Beamer per Kopplungscode freigeben (nur Konto)
  - ws beamer:stats, beamer:explained – Rückmeldungen der Beamer
  - ws time – Serverzeit abfragen
  - event state – kompletter, auf die Rolle gefilterter Spielstand
  - event effects – Effekte für Animationen und Töne
  - event hello, presence, changed, show, show:test, show:cmd, beamers, accounts
  - event beamer:pair, beamer:token – Kopplungscode bzw. Zugang für einen Beamer
  - event session:ended, session:token – Zugang erloschen bzw. erneuert
uses:
  - server: call "Spiel-Laufzeit (Befehl ausführen, Rückgängig), Rolle je Gerät (access.ts), echte Absenderadresse (net.ts)"
  - engine: call "projectState – Sicht je Rolle; createGame – neues Spiel"
  - spielmodell: call "commandSchema – Befehle prüfen"
  - show: call "Beamer-Show prüfen (parseShow, showCommandSchema), Standardwerte"
  - konten: call "Token prüfen, Beamer-Token ausstellen (verifyToken, issueToken, beamerKey)"
  - datenbank: call "geöffnete Spiele, Spielcodes, gewähltes Spiel je Konto, Beamer-Einstellungen je Konto"
files:
  - hub.ts: Spiele-Hub – verwaltet mehrere gleichzeitig geöffnete Spiele (je eine Laufzeit), ihren Besitzer und Spielcode sowie das „gewählte Spiel“ jedes Kontos, das seine Regie steuert und seine Beamer zeigen. Hält die Beamer-Einstellungen je Konto (gelten für alle Spiele dieses Kontos).
  - live.ts: Echtzeitverbindung über Socket.IO. Ordnet jedes Gerät genau einem Spiel zu (ein Raum je Spiel), prüft dessen Zugang, nimmt Befehle an, schickt nach jeder Änderung jedem Gerät seine gefilterte Sicht und allen die Effekte. Dazu Beamer-Kopplung, Beamer-Show je Konto, Anwesenheit je Team, Online-Anzeige der Konten und Schutz vor Überflutung.
zone: intern
exposure: public
security:
  - auth: Jede Verbindung bringt beim Aufbau ihr Token mit; die Rolle wird bei jeder Verwendung neu geprüft. Erlischt ein Zugang (Passwort geändert, gesperrt, überall abgemeldet), bekommt das Gerät sofort session:ended
  - access: Rückgängig nur Regie; Beamer-Show nur Spielleitung (Konto oder Moderator); Beamer freigeben nur mit Konto; Spieler anlegen nicht als Gast
  - privacy: Jedes Gerät erhält nur seine Sicht – keine Lösungen vor der Auflösung, keine PINs, keine fremden Antworten; Gäste ohne Fotos und Verlauf; Beitritts-Adressen nur für Spielleitung und freigegebene Beamer
  - ratelimit: Je Verbindung höchstens 12 Nachrichten pro Sekunde (kurz bis 40); Spieler anlegen kostet zusätzlich; je Adresse höchstens 400 und insgesamt 3000 Verbindungen – Konten und freigegebene Beamer kommen immer herein
  - ratelimit: Spielcodes durchprobieren gebremst (gemeinsam mit der HTTP-Prüfung 30 Fehlversuche je Minute, 300 je Stunde)
  - input: Befehle und Show-Befehle werden mit Schemas geprüft; Nachrichten höchstens 256 kB; leere oder doppelte Befehle lösen keine Speicherung und keine Verteilung aus
  - other: Kopplungscodes haben 6 Ziffern aus einem kryptografischen Zufallsgenerator; höchstens 300 Beamer warten gleichzeitig
---
Die Echtzeitverbindung hält alle Geräte eines Spiels synchron: Regie, Moderator, Beamer und Handys sind dauerhaft per WebSocket (Socket.IO) mit dem Server verbunden.

**So funktioniert es:** Jedes Gerät hängt an genau einem Spiel – ein Konto an seinem „gewählten Spiel“, ein Beamer am gewählten Spiel seines Besitzers, Moderator, Team und Spieler an dem Spiel aus ihrem Zugang, Gäste an dem Spiel zu ihrem Spielcode. Nach jeder Änderung schickt der Server den **kompletten Spielstand**, gefiltert auf das, was die jeweilige Rolle sehen darf, plus die **Effekte** für Animationen. Ablauf: [[befehl-und-spielstand]].

**Mehrere Spiele gleichzeitig:** Der Spiele-Hub kann beliebig viele Spiele offen halten. Ein Spiel gehört einem Konto (oder dem Haupt-Admin). Wählt ein Konto ein anderes Spiel, folgen seine Regie-Fenster und Beamer automatisch. Geschlossene Spiele bleiben gespeichert, Handys und Beamer kommen aber nicht mehr hinein.

**Beamer-Show:** Grafikstufe, Ton, Musik, Kommentator, Kamera, Wetter und Spielerklärung steuert die Regie (oder der Moderator) über das Ereignis `show`. Die Einstellungen gehören dem Konto, nicht dem einzelnen Spiel, und gelten für alle seine Beamer. Einmalige Befehle (Testton, Neu laden, Kamera, Vorlesen) gehen direkt an die Beamer und werden nicht gespeichert. Beamer melden Bildrate, Grafikstufe und Auflösung zurück; die Regie zeigt sie an.

**Beamer-Kopplung:** Ein Beamer ohne Zugang zeigt nur die Insel und einen sechsstelligen Code, den die Spielleitung in der Regie eingibt – Ablauf in [[beamer-kopplung]].

**Wichtige Ereignisse**

| Richtung | Ereignis | Inhalt |
|---|---|---|
| Gerät → Server | `cmd` | Befehl, Antwort mit ok/Fehler |
| Gerät → Server | `undo` | Rückgängig (nur Regie) |
| Gerät → Server | `auth` | neues Token für die bestehende Verbindung |
| Gerät → Server | `show` | Beamer-Show steuern (nur Spielleitung) |
| Regie → Server | `beamer:pair` | Beamer mit seinem Code freigeben |
| Beamer → Server | `beamer:stats`, `beamer:explained` | Bildrate, Grafikstufe, Ton frei, Vollbild; Erklärung fertig |
| Server → Gerät | `hello` | Name der App, Serverzeit |
| Server → Gerät | `state` | gefilterter Spielstand, Rolle, Serverzeit, bei der Regie der Text für „Rückgängig“ |
| Server → Gerät | `effects` | Effekte mit fortlaufender Nummer |
| Server → Spielleitung | `presence`, `beamers`, `changed` | verbundene Geräte je Team, Beamer-Rückmeldungen, „Bibliothek/Spiele/Einstellungen/Konten geändert“ |
| Server → Admins | `accounts` | welche Konten gerade online sind |
| Server → Beamer | `show`, `show:test`, `show:cmd`, `beamer:pair`, `beamer:token` | Show-Einstellungen, einmalige Befehle, Kopplungscode, Zugang nach Freigabe |
| Server → Gerät | `session:ended`, `session:token` | Zugang erloschen (zurück zur Anmeldung) bzw. neuer Zugang nach eigenem Passwortwechsel |

Die Verbindung prüft alle 10 Sekunden, ob das Gerät noch da ist. Fotos laufen nicht über die Echtzeitverbindung, sondern über HTTP ([[http-api]]).
