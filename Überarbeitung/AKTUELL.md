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
 - dice_service: Admin-Würfel-/Eventlogik ausgelagert; Route nutzt Service (getestet, ok)
 - Victory-Event speichert JSON statt String (Mini-Fix)
- Docker-Setup: Host-Netzwerk aktiviert, damit Container in aktueller Umgebung startet (getestet, ok)
- Victory-Event (Team auf Position 72, ≥6 Wurf) erfolgreich getestet; Event als JSON gespeichert (getestet, ok)
- DB neu initialisiert; alle Teams auf Position 0 zurückgesetzt (getestet, ok)
- Session-Service: `get_active_session`/`require_active_session` eingeführt; moderation_mode, admin_roll_dice, automatische Platzierungen, Dashboard/Minigame-Setup, Minigame-Abbruch, end_question, reset_played_content, unblock_team, record_placements, question_responses_api, add_player_to_team, activate_round, start_welcome, player_rotation_stats, reset_player_rotation, Feld-Minispiel-Endpoints, Main-/Team-Routen & API v1 Status nutzen Service (getestet, ok)

Nächster Schritt (offen)
- Session-Service & Event-Stream vorbereiten (gemäß Protokoll Eintrag 11) bzw. Board-Blau-Bug adressieren.

Testanleitung für den nächsten Schritt (step-by-step)
 1) Festlegen: Session-Service-Stories (z. B. Events streamen konsolidieren) oder Board-Blau-Bug reproduzieren.
 2) Micro-Step auswählen, dokumentieren, testen (siehe Protokollhinweise).

Push-Hinweis
 - Commit-Message-Vorschlag: `refactor(dice): use dice_service for admin legacy roll route`
 - Commit-Message-Vorschlag: `chore(events): store victory_event data as JSON`
- Push immer durch den User.

Wo ist die ausführliche Doku?
- Globaler Fortschritt: `Überarbeitung/00-Roadmap/Protokoll.txt`
- Bereich Events/Echtzeit: `Überarbeitung/05-Events-und-Echtzeit/Protokoll.txt`
- Arbeitsregeln/Policy: `Überarbeitung/README.md`

So knüpft der nächste Chat nahtlos an
- Dieses AKTUELL.md lesen → den „Nächster Schritt“ umsetzen → Testanleitung ausführen → bei Erfolg pushen → Protokoll aktualisieren.
