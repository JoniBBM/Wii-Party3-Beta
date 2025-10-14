# Aktueller Stand (Kurzüberblick)

- Ort/Bereich: Überarbeitung/05-Events-und-Echtzeit
- Docker-Live: Ja (docker-compose, Live-Mount `.:/app`)
- Commit-/Push-Policy: KI schlägt Änderungen/Commit-Text vor, User bestätigt und pusht selbst.

Zuletzt abgeschlossen
- API v1 (read-only): `GET /api/v1/status/board`, `GET /api/v1/fields/positions` (getestet, ok)
- Event-Service: `app/services/event_service.py` eingeführt (getestet, ok)
- player_swap-Events über Service (getestet, ok)
- catapult_forward-Event über Service (getestet, ok)

Nächster Schritt (offen)
- Aufgabe: catapult_backward-Event in `app/game_logic/special_fields.py` auf `event_service.create_event` umstellen.
- Umfang: Nur Event-Erzeugung ersetzen, keine Logikänderung.

Testanleitung für den nächsten Schritt (step-by-step)
1) Spielen/würfeln, bis ein Team auf ein Katapult-Rückwärts-Feld kommt (z. B. 13/26/39/52/65 je nach Konfig).
2) Direkt danach (innerhalb 10s): `curl -s http://localhost:5001/api/v1/status/board | jq`
3) Erwartung: `success=true`, `data.last_special.type == "special_field_catapult_backward"`, keine Tracebacks im Log.

Push-Hinweis nach erfolgreichem Test
- Commit-Message-Vorschlag: `refactor(events): use event_service for catapult_backward event`
- Push immer durch den User.

Wo ist die ausführliche Doku?
- Globaler Fortschritt: `Überarbeitung/00-Roadmap/Protokoll.txt`
- Bereich Events/Echtzeit: `Überarbeitung/05-Events-und-Echtzeit/Protokoll.txt`
- Arbeitsregeln/Policy: `Überarbeitung/README.md`

So knüpft der nächste Chat nahtlos an
- Dieses AKTUELL.md lesen → den „Nächster Schritt“ umsetzen → Testanleitung ausführen → bei Erfolg pushen → Protokoll aktualisieren.
