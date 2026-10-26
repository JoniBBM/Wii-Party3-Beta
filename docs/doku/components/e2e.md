---
name: Browser-Tests & Prüfskripte
type: cli
layer: betrieb
path: e2e/
tech: [playwright, chromium, node]
provides:
  - cli npm run e2e – baut und spielt eine Runde mit echten Browsern durch (flow.mjs)
  - cli node e2e/<skript>.mjs – einzelne Prüfungen und Bildserien
uses:
  - server: exec "startet einen eigenen Server mit leerer Datenbank in einem Temp-Ordner"
  - konten: http "Anmeldung, Team-PIN, Beamer-Link (/api/auth/beamer-link)" [local]
  - echtzeit: ws "steuert Spiele wie die Regie, liest den Spielstand" [local]
  - regie: http "echter Browser (Chromium über Playwright)" [local]
  - handy: http "echte Browser als Team-Handys" [local]
  - moderator: http "echter Browser als Moderator" [local]
  - beamer: http "echter Browser als Beamer, Fotos und Messwerte" [local]
files:
  - flow.mjs: Kompletter Durchlauf mit echten Browsern – Regie, 4 Handys, Moderator und Beamer spielen eine Runde; Bildschirmfotos und Prüfung der Browser-Konsolen; der Beamer wird per Code aus der Regie freigegeben.
  - logout.mjs: Prüft „Überall abmelden“ – ein Spielleiter in der Regie muss sofort (ohne Neuladen) zur Anmeldung springen, wenn der Admin ihn abmeldet.
  - layout.mjs: Optische Prüfung aller Seiten (Regie, Dialoge, Moderator, Team-Handy, Beitritt, Beamer) in fünf Breiten von 375 bis 1600 Pixel und allen Spielphasen; meldet Text, der aus seinem Kasten ragt, und seitliches Scrollen.
  - audit.mjs: Gemeinsame Prüffunktion für die Browser-Tests (überstehender Text, seitliches Scrollen), läuft im Browser.
  - wizard.mjs: Geführte Spieleinrichtung im Browser komplett durchklicken und prüfen, was im Spiel ankommt; jede Folie wird auf Überstand geprüft und fotografiert.
  - station.mjs: Gruppenmodus – mehrere Personen melden sich nacheinander an einer Anmeldestation an (mit Selfie), Teams bilden, Team-Gerät per PIN verbinden.
  - screens.mjs: Galerie aller Oberflächen in typischen Größen (für Endkontrolle und die Bilder der Doku).
  - doku-screens.mjs: Bildschirme für den Tab „Oberfläche“ der Doku – spielt bis zur ersten Frage, fotografiert die wichtigsten Seiten und misst die anklickbaren Bereiche aus (docs/doku/screens, Bilder in docs/doku/assets/screens).
  - shot.mjs: Schnelles Bildschirmfoto einer Seite, auf Wunsch vorher als Regie oder Moderator angemeldet (Passwort aus .env).
  - beamer.mjs: Steuert ein Spiel per WebSocket und fotografiert den Beamer in allen Phasen (Lobby, Frage, Würfel, Ausbruch, Sieg).
  - show.mjs: Beamer-Show – Fernsteuerung aus der Regie (Grafik, Kamera, Neu laden), Spielerklärung, Foto-Blasen, Reaktion nach dem Zug, Vulkan-Inneres, Siegerehrung.
  - hazards.mjs: Inselgefahren durchspielen (Fässer im Fluss, Kraterloch, Schwimmen, Klettern) und fotografieren.
  - stunts.mjs: Alle Feld-Auftritte als Bildfolgen (Sprungfeder, Flugzeug, UFO, Käfig, Bühne, Geysir, Liane, Fluss, Lavahöhle, Totenkopf) und Rückgängig mitten im Auftritt.
  - camera.mjs: Kameraprüfung über eine Partie – Abstand zum Gelände, verdeckte Bilder, Drehrate, Beschleunigung; Foto bei verdeckter Sicht.
  - soak.mjs: Dauertest – komplette Partie bis zum Sieg, prüft Fehler und Speicherwachstum des Beamers.
  - blocks.mjs: Rundgang durch eine Welt (Standard Blockwelt, mit WORLD=space das Weltall) – Handy und Beamer in allen Phasen fotografieren und auf Fehler prüfen.
  - worldshot.mjs: Beamer-Bilder einer Welt aus festen Blickwinkeln (gegen den Entwicklungsserver), auch mit Wetter und Festzeit.
  - fps.mjs: Bildrate des Beamers in allen Grafikstufen messen.
  - perfprobe.mjs: Leistungsanalyse – Zeichenaufrufe je Gruppe und Bildrate mit einzeln abgeschalteten Teilen.
  - animals-look.mjs: Tiere aus mehreren Kamerapositionen und zu mehreren Zeitpunkten fotografieren.
  - animals-perf.mjs: Leistungsanteil der Tiere messen (mit und ohne Tiere).
  - look.mjs: Beamer-Kamera frei setzen und fotografieren (Fehlersuche).
zone: intern
exposure: local
security:
  - other: Läuft nur lokal auf dem Entwicklungsrechner gegen eigene Testserver mit leerer Datenbank; einige Skripte lesen ADMIN_PASSWORD aus .env, um sich an einem laufenden Server anzumelden
---
Prüfskripte, die die echte Weboberfläche in echten Browsern bedienen (Playwright mit Chromium). Sie gehören nicht zum Betrieb, sondern zur Entwicklung und Qualitätskontrolle.

Die meisten Skripte starten einen **eigenen Server mit leerer Datenbank** und brauchen vorher die gebaute Weboberfläche (`npm run build` bzw. `npm run build -w @insel/web`) und einmalig `npx playwright install chromium`. Einige (worldshot, perfprobe) laufen gegen einen bereits laufenden Entwicklungsserver. Ein Beamer bekommt in den Tests seinen Zugang über den Beamer-Link – ohne zeigt er nur die Insel und einen Kopplungscode ([[beamer-kopplung]]).

Aufrufe und Parameter stehen in [[entwicklung]]. Die Unit- und Integrationstests (Vitest) liegen dagegen in den Paketen selbst, z. B. `server.test.ts` im [[server]].
