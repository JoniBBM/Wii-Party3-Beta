# Umstieg von Version 1 (Flask)

Version 2 ist ein kompletter Neubau. Die alte Version liegt unverändert in `legacy/` (nur noch als Referenz und Import-Quelle).

## Was übernommen wurde

| Alt | Neu |
|---|---|
| Minispiel-Ordner (`minigame_folders/*/minigames.json`) | Sammlungen „Default (Import)“ und „Teenie 2025 (Import)“ |
| Feld-Minispiele (`field_minigames/team_vs_all`, `team_vs_team`) | Sammlung „Feld-Minispiele (Import)“ mit Modus *allein gegen alle* bzw. *Duell* |
| Runde „Teenie 2025“ | Vorlage „Teenie 2025“ |
| Spielprinzip: Platzierung → Bonuswürfel (W6/W4/W2) → Würfeln → Sonderfelder → Siegeswurf ab Feld 72 | unverändert, jetzt überall einheitlich |
| Sonderfelder Katapult vor/zurück, Platztausch, Sperre, Minispiel-Feld | übernommen, Werte einstellbar |

Testteams, alte Spielstände und Ereignisse wurden bewusst **nicht** übernommen (sie enthielten Testdaten und Klartext-Passwörter).

## Was sich grundlegend geändert hat

| Thema | Version 1 | Version 2 |
|---|---|---|
| Technik | Flask, Jinja, ~34.000 Zeilen Inline-CSS/JS | TypeScript-Monorepo: Engine, Server, React-Oberfläche |
| Spiellogik | in Routen verteilt, Würfeln 3× implementiert | eine getestete Engine für alle |
| Echtzeit | Polling + SSE parallel, Zeitfenster-Erkennung | WebSocket, Server schickt fertigen Zustand + Effekte |
| Spielfeld | Verteilung teils zufällig, konnte sich mitten im Spiel ändern | deterministisch, im Editor sichtbar und änderbar |
| 3D-Insel | stufige „Torte“, keine Anzeige, Teamfarben unsichtbar | Insel mit Strand, Dschungel, Fluss, Klippen, Vulkan; HUD; Würfel; Effekte |
| Figuren | Charakter-Dateien fehlten (404) | Mii-artige Figuren mit Editor, Teamfarbe auf dem Shirt |
| Team-Login | Teamname + Klartext-Passwort (öffentlich abrufbar) | QR-Code oder 4-stellige PIN, signierte Tokens |
| Moderation | nur lesen, Lösungen öffentlich abrufbar | Moderator kann steuern; Lösungen nur für Regie/Moderator |
| Fehler korrigieren | – | Rückgängig (40 Schritte), Position/Bonus korrigieren |
| Inhalte | Ordner-JSON + Datenbank gemischt | Bibliothek in der Datenbank, Import/Export |
| Neue Inhaltsarten | – | Schätzfrage, Buzzer-Frage, Countdown |
| Vulkan | nur Datenfelder | voll umgesetzt mit Druck, Ausbruch und Inszenierung |
| Docker | `network_mode: host` (auf macOS nicht erreichbar) | Port-Mapping, Startskript, optionaler Internet-Tunnel |
| Datenschutz | Fotos/Passwörter in Backups | Fotos nur lokal, ohne Metadaten, löschbar; Exporte ohne Fotos/PINs |

## Entfallen

- **Video-Punkte** (war nur ein Template ohne Funktion).
- **Charakter-Freischaltungen, -Werte und Teilekatalog** (nie benutzt).
- **Schild, Mehrrunden-Sperren, Extrazüge** (nur Datenfelder ohne Logik).
- Die Planungsdokumente unter `legacy/Überarbeitung/` sind durch diese Dokumentation ersetzt.
