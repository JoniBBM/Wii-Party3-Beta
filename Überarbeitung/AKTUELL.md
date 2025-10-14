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
 - /api/board-status: eval-Fallback entfernt (getestet, ok)

Nächster Schritt (offen)
 - Aufgabe: Team-Dashboard Parsing testen (eval-Fallback entfernt in `_get_last_dice_result`).
 - Umfang: Nur Test/Validierung, danach als abgeschlossen markieren.

Testanleitung für den nächsten Schritt (step-by-step)
 1) Team-Dashboard öffnen (als Team eingeloggt) und eine Würfelaktion auslösen.
 2) Danach: `GET /teams/api/dashboard-status` (oder Dashboard neu laden) prüft letztes Würfelergebnis.
 3) Erwartung: Letztes Würfelergebnis wird korrekt angezeigt; keine Tracebacks im Log (Parsing ohne eval).

Push-Hinweis nach erfolgreichem Test
 - Commit-Message-Vorschlag: `sec(events): remove eval fallback in teams/_get_last_dice_result`
- Push immer durch den User.

Wo ist die ausführliche Doku?
- Globaler Fortschritt: `Überarbeitung/00-Roadmap/Protokoll.txt`
- Bereich Events/Echtzeit: `Überarbeitung/05-Events-und-Echtzeit/Protokoll.txt`
- Arbeitsregeln/Policy: `Überarbeitung/README.md`

So knüpft der nächste Chat nahtlos an
- Dieses AKTUELL.md lesen → den „Nächster Schritt“ umsetzen → Testanleitung ausführen → bei Erfolg pushen → Protokoll aktualisieren.
