---
title: Umstieg von Version 1 (Flask)
order: 80
audience: Betrieb
summary: Was aus der alten Flask-Version wurde, was übernommen wurde, was entfallen ist und wie man die alte Version noch startet.
---
# Umstieg von Version 1 (Flask)

Version 2 („Insel der Abenteuer“) ist ein kompletter Neubau. Die alte Version liegt unverändert im Ordner `legacy/` – nur noch als Referenz und Import-Quelle – und in der Git-Historie.

## Was übernommen wurde

| Alt | Neu |
|---|---|
| Minispiel-Ordner (`minigame_folders/*/minigames.json`) | Sammlungen „Default (Import)“ und „Teenie 2025 (Import)“ |
| Feld-Minispiele (`field_minigames/team_vs_all`, `team_vs_team`) | Sammlung „Feld-Minispiele (Import)“ mit Modus *allein gegen alle* bzw. *Duell* |
| Runde „Teenie 2025“ | Vorlage „Teenie 2025“ |
| Spielprinzip: Platzierung → Bonuswürfel (W6/W4/W2) → Würfeln → Sonderfelder → Siegeswurf ab Feld 72 | unverändert, jetzt überall einheitlich |
| Sonderfelder Katapult vor/zurück, Platztausch, Sperre, Minispiel-Feld | übernommen, Werte einstellbar |

Testteams, alte Spielstände und Ereignisse wurden bewusst **nicht** übernommen (sie enthielten Testdaten und Klartext-Passwörter).

Die übernommenen Inhalte stecken in `packages/server/seed/legacy-content.json` und werden beim ersten Start mit leerer Datenbank automatisch eingespielt. Neu erzeugen lässt sich die Datei mit `npm run import:legacy` (liest `legacy/app/static`). Einzelne alte `minigames.json` kann man auch in einer bestehenden Installation unter *Regie → Bibliothek → Importieren* einlesen; sie werden dabei umgewandelt.

## Was sich grundlegend geändert hat

| Thema | Version 1 | Version 2 |
|---|---|---|
| Technik | Flask, Jinja, ~34.000 Zeilen Inline-CSS/JS | TypeScript-Monorepo: Engine, Server, React-Oberfläche |
| Spiellogik | in Routen verteilt, Würfeln 3× umgesetzt | eine getestete Engine für alle |
| Echtzeit | Polling + SSE parallel, Zeitfenster-Erkennung | WebSocket, Server schickt fertigen Zustand + Effekte |
| Spielfeld | Verteilung teils zufällig, konnte sich mitten im Spiel ändern | deterministisch, im Editor sichtbar und änderbar |
| 3D-Insel | stufige „Torte“, keine Anzeige, Teamfarben unsichtbar | Insel mit Strand, Dschungel, Fluss, Klippen, Vulkan; Einblendungen; Würfel; Effekte – dazu Blockwelt und Weltall |
| Figuren | Charakter-Dateien fehlten (404) | Mii-artige Figuren mit Editor, Teamfarbe auf dem Shirt |
| Team-Login | Teamname + Klartext-Passwort (öffentlich abrufbar) | QR-Code oder 6-stellige PIN, signierte Zugänge |
| Moderation | nur lesen, Lösungen öffentlich abrufbar | Moderator kann steuern; Lösungen nur für Regie/Moderator |
| Spielleitung | ein gemeinsames Passwort | Haupt-Admin plus Konten für Spielleiter, mehrere Spiele gleichzeitig |
| Fehler korrigieren | – | Rückgängig (40 Schritte), Position/Bonus korrigieren |
| Inhalte | Ordner-JSON + Datenbank gemischt | Bibliothek in der Datenbank, Import/Export |
| Neue Inhaltsarten | – | Schätzfrage, Buzzer-Frage, Countdown |
| Vulkan | nur Datenfelder | voll umgesetzt mit Druck, Ausbruch und Inszenierung |
| Docker | `network_mode: host` (auf macOS nicht erreichbar) | Port-Mapping, Startskript, optionaler Internet-Tunnel |
| Datenschutz | Fotos/Passwörter in Backups | Fotos nur lokal, ohne Metadaten, löschbar; Exporte ohne Fotos/PINs |

## Entfallen

- **Video-Punkte** (war nur eine Vorlage ohne Funktion).
- **Charakter-Freischaltungen, -Werte und Teilekatalog** (nie benutzt).
- **Schild, Mehrrunden-Sperren, Extrazüge** (nur Datenfelder ohne Logik).
- Die Planungsdokumente unter `legacy/Überarbeitung/` sind durch diese Dokumentation ersetzt.

## Die alte Version starten

Die alte Version liegt unverändert in `legacy/`. Ihr Container startete früher nicht, weil `docker-compose.yml` `network_mode: "host"` verwendete: Unter Docker Desktop für macOS ist der Port dann nur in der internen Linux-VM erreichbar, nicht auf dem Mac. In `legacy/docker-compose.yml` ist das bereits auf ein normales Port-Mapping (`5001:5001`) korrigiert. Start:

```bash
cd legacy && docker compose up -d
```

Danach unter `http://localhost:5001` erreichbar. Die alte Version ist nicht für den Betrieb im Internet gedacht (Klartext-Passwörter, öffentlich abrufbare Lösungen).
