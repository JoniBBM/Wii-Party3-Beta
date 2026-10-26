---
title: Bildschirme im Tab „Oberfläche“ und genauere Verbindungsangaben
status: implemented
date: 2026-10-26
affects: [regie, handy, moderator, beamer, cloudflare, cloudflared, e2e]
risk: niedrig
implemented: 2026-10-26
---
**Warum:** Das Doku-Werkzeug hat neue Regeln bekommen: Die wichtigsten Bildschirme sollen zum Durchklicken in der Doku stehen, Bilder liegen in `docs/doku/assets/`, und jede Verbindung soll so beschrieben sein, wie sie wirklich läuft (`local`, `tunnel`) – sonst meldet das Portal Risiken, die es nicht gibt.

**Was ändert sich:**
- Zehn Bildschirme (Startseite, Anmeldung, Assistent, Beitritt, Regie live, Frage am Handy, Moderator, Beamer, Spiel einrichten, Beamer fernsteuern) mit anklickbaren Bereichen. Diese führen zu Bausteinen, Abläufen und anderen Bildschirmen. Neu erzeugen mit `node e2e/doku-screens.mjs`.
- Der Cloudflare-Tunnel ist in zwei Bausteine geteilt: das Cloudflare-Netz und das Programm cloudflared auf dem Rechner der Insel. Cloudflare → cloudflared ist als verschlüsselter Tunnel eingetragen, cloudflared → Insel als lokal (gleicher Rechner).
- Verbindungen der Geräte zum Server: verschlüsselt über den Tunnel, im WLAN-Betrieb am Laptop einfaches HTTP. Prüfskripte, Werkzeuge und die Datenbank-Datei sind als lokal markiert.
- Die Bilder der Anleitungen sind von `docs/doku/bilder/` nach `docs/doku/assets/` umgezogen.

**Risiko und Rückweg:** Nur Doku und ein zusätzliches Prüfskript, am Spiel ändert sich nichts.

**Test:** `doku check` ohne Fehler, alle Quelldateien abgedeckt, Bildschirm-Skript läuft ohne Browserfehler.
