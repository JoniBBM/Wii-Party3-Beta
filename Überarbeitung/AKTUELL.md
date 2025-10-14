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
- Team-Dashboard (_get_last_dice_result): eval-Fallback entfernt (getestet, ok)
- dice_service: Admin-Würfel-/Eventlogik ausgelagert; Route nutzt Service (Test ausstehend)
 - dice_service: getestet, ok

Nächster Schritt (offen)
- Aktuell keine offenen Schritte in Services/Events.
- Vorschlag für Fortsetzung: session_service (Turn-/Phasenlogik), anschließend API v1 POST /api/v1/dice/roll, oder SSE-Konsolidierung.

Testanleitung für den nächsten Schritt (step-by-step)
 - Wird beim Start des nächsten Tasks konkretisiert (abhängig von Auswahl: session_service, API v1, oder SSE).

Push-Hinweis
 - Commit-Message-Vorschlag: `refactor(dice): use dice_service for admin legacy roll route`
- Push immer durch den User.

Wo ist die ausführliche Doku?
- Globaler Fortschritt: `Überarbeitung/00-Roadmap/Protokoll.txt`
- Bereich Events/Echtzeit: `Überarbeitung/05-Events-und-Echtzeit/Protokoll.txt`
- Arbeitsregeln/Policy: `Überarbeitung/README.md`

So knüpft der nächste Chat nahtlos an
- Dieses AKTUELL.md lesen → den „Nächster Schritt“ umsetzen → Testanleitung ausführen → bei Erfolg pushen → Protokoll aktualisieren.
