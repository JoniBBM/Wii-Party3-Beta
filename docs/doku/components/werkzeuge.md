---
name: Werkzeuge (Kommandozeile)
type: cli
layer: betrieb
path: packages/server/src/tools/
tech: [node, tsx]
provides:
  - cli npm run audio -- list | attach <id> <datei.mp3> | remove <id> – Sprachaufnahmen der Fragen verwalten
  - cli npm run import:legacy – Inhalte der alten Version neu nach seed/legacy-content.json übernehmen
uses:
  - konten: http "POST /api/auth/admin – Anmeldung mit ADMIN_PASSWORD aus .env" [auth=passwort, port=9534, local]
  - http-api: http "Audio-Wünsche lesen, Aufnahme anhängen oder entfernen" [auth=token, port=9534, local]
  - datenbank: call "Umwandlung alter Inhalte (legacy.ts)"
files:
  - audio.ts: Verwaltet die Sprachaufnahmen der Fragen über die Schnittstelle des laufenden Servers – zeigt offene Wünsche („Audio erstellen“ angehakt) mit Vorlesetext und Zeichenzahl, hängt eine MP3-Datei an eine Frage oder entfernt sie. Meldet sich dafür mit ADMIN_PASSWORD aus .env an; Adresse per --url bzw. INSEL_URL, sonst http://localhost mit HOST_PORT (Standard 9534).
  - import-legacy.ts: Liest die Inhalte der alten Flask-Version aus legacy/app/static (Minispiel-Ordner und Feld-Minispiele) und schreibt sie als packages/server/seed/legacy-content.json, die beim ersten Start mit leerer Datenbank eingespielt wird.
zone: intern
exposure: local
security:
  - secrets: Das Audio-Werkzeug liest ADMIN_PASSWORD aus .env bzw. der Umgebung und gibt es nicht aus
  - access: Sprachaufnahmen ändern geht nur mit Admin-Zugang
---
Kleine Helfer für die Kommandozeile, die neben dem eigentlichen Server laufen.

**Sprachaufnahmen der Fragen:** In der Regie lässt sich bei einer Frage „Audio erstellen“ anhaken. Die Aufnahme selbst wird außerhalb des Spiels erzeugt (bisher mit ElevenLabs, gleiche Stimme wie der Kommentator; Kosten etwa 1 Credit je Zeichen – vorher abschätzen). Mit `npm run audio -- list` sieht man, welche Fragen noch eine Aufnahme brauchen; mit `attach` wird die fertige Datei angehängt. Die Dateien landen im Datenordner (`data/media/audio/`, siehe [[sqlite]]), nicht im Git. Einzelheiten in [[entwicklung]].

**Alte Inhalte übernehmen:** `npm run import:legacy` braucht den Ordner `legacy/` und erzeugt die mitgelieferte Seed-Datei neu. Bestehende Installationen bekommen die Inhalte dadurch nicht automatisch – dafür in der Regie unter *Bibliothek → Importieren* die alte `minigames.json` einlesen ([[umstieg]]).
