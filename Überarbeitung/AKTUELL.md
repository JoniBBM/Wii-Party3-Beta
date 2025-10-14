# Aktueller Stand (Kurzüberblick)

- Ort/Bereich: Überarbeitung/05-Events-und-Echtzeit
- Docker-Live: Ja (docker-compose, Live-Mount `.:/app`)
- Commit-/Push-Policy: KI schlägt Änderungen/Commit-Text vor, User bestätigt und pusht selbst.

 Zuletzt abgeschlossen
- API v1 (read-only): `GET /api/v1/status/board`, `GET /api/v1/fields/positions` (getestet, ok)
- Event-Service: `app/services/event_service.py` eingeführt (getestet, ok)
- player_swap-Events über Service (getestet, ok)
- catapult_forward-Event über Service (getestet, ok)
- catapult_backward-Event über Service (getestet, ok)
- barrier_set-Event über Service (getestet, ok)
 - barrier_released/blocked-Events über Service (getestet, ok)

 Nächster Schritt (offen)
 - Aufgabe: eval-Fallbacks in Lesepfaden entfernen (Schritt 1) – `/api/board-status` liest Events; Fallback auf `eval` wird entfernt und durch sicheres Ignorieren ungültiger Daten ersetzt.
 - Umfang: Kleine Änderung nur im Lesen, keine Endpunkt-Semantikänderung.

 Testanleitung für den nächsten Schritt (step-by-step)
 1) Mehrere Events erzeugen (Wurf + Spezialfeld). 
 2) Danach: `curl -s http://localhost:5001/api/board-status | jq` (Legacy-Endpoint)
 3) Erwartung: JSON mit `last_dice_result`/`last_special_field_event` gefüllt (falls innerhalb 10s), keine Tracebacks; insbesondere keine Fehler beim Parsen (da eval entfernt wird).

 Push-Hinweis nach erfolgreichem Test
 - Commit-Message-Vorschlag: `sec(events): remove eval fallback in /api/board-status parsing`
- Push immer durch den User.

Wo ist die ausführliche Doku?
- Globaler Fortschritt: `Überarbeitung/00-Roadmap/Protokoll.txt`
- Bereich Events/Echtzeit: `Überarbeitung/05-Events-und-Echtzeit/Protokoll.txt`
- Arbeitsregeln/Policy: `Überarbeitung/README.md`

So knüpft der nächste Chat nahtlos an
- Dieses AKTUELL.md lesen → den „Nächster Schritt“ umsetzen → Testanleitung ausführen → bei Erfolg pushen → Protokoll aktualisieren.
