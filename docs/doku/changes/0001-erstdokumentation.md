---
title: Erstdokumentation mit dem Doku-Werkzeug
status: implemented
date: 2026-10-25
affects: [layer:ui, layer:grafik, layer:logik, layer:api, layer:daten, layer:betrieb, layer:extern]
risk: niedrig
implemented: 2026-10-25
---
**Warum:** Das Projekt bekommt eine einzige, zentrale Doku, die auch Menschen ohne Programmierkenntnisse verstehen und die bei jeder Änderung mitgepflegt wird.

**Was ändert sich:** Alle 225 Quelldateien sind 29 Bausteinen zugeordnet und erklärt; dazu 8 Abläufe, 6 Architekturentscheidungen und 9 Anleitungen. Die bisherigen Dateien in `docs/` (Architektur, Betrieb, Entwicklung, Spielleitung, Spielregeln, Inhalte, Umstieg) wurden vollständig übernommen und entfernt; die Bilder liegen jetzt in `docs/doku/bilder/`. README, Hinweistexte und Kommentare verweisen auf die neuen Orte. Am Code nur Kleinigkeiten: ein falscher Dateiverweis in einem Kommentar und „beide Welten“ → „alle Welten“ in der Regie.

**Risiko und Rückweg:** Keins für den Spielbetrieb – nur Doku, Kommentare und Texte. Rückweg: Commit zurücknehmen.

**Test:** `node .claude/doku/doku.mjs check` ohne Fehler, `coverage` 225/225; Typprüfung, Unit-Tests und Build ohne Fehler.
