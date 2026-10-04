Was muss verbessert werden
--------------------------
- Getrennte/duplizierte Routen für Admin/Teams; inkonsistente Endpunkte/Antworten.
- Legacy-/Test-Endpunkte; uneinheitliche Pfade; keine Versionierung.
- Uneinheitliche JSON-Struktur, uneinheitliche Fehlercodes; teils eval-Fallbacks.

Wie wird es gemacht
-------------------
- Einführung einer versionierten REST-API unter `/api/v1` mit Ressourcen-orientierten Pfaden.
- Gleiche Endpunkte für Admin/Team, Zugriff über Rollen/Scopes (RBAC), nicht durch separate Logik.
- Konsistente JSON-Antworten: `{ success, data, error }`-Kontrakt und einheitliche Fehlercodes.
- Entfernen von eval-Fallbacks; striktes JSON (mit sicheren Fallbacks).
- API-Dokumentation (OpenAPI/Swagger) generiert aus Schemata.

Beispiel-Endpunkte (Auszug)
---------------------------
- Status:
  - GET `/api/v1/status/board` – aktueller Board-/Session-Status (admin/team nutzbar)
  - GET `/api/v1/status/moderation` – Moderationszusammenfassung (admin role)
- Sessions/Runden:
  - GET `/api/v1/sessions/active`
  - POST `/api/v1/sessions` (admin)
  - POST `/api/v1/sessions/{id}/end` (admin)
- Dice/Würfeln:
  - POST `/api/v1/dice/roll` body: `{ team_id }` (admin)
- Teams:
  - GET `/api/v1/teams` / GET `/api/v1/teams/{id}`
  - PATCH `/api/v1/teams/{id}` (Position, Bonus, Block-Status; scopes)
- Felder/Special Fields:
  - GET `/api/v1/fields/config` (runde-spezifische Sicht)
  - PATCH `/api/v1/fields/config` (admin)
- Inhalte/Minigames/Fragen:
  - GET `/api/v1/content/next` (plan/random)
  - POST `/api/v1/content/select` (admin), POST `/api/v1/content/played` (Tracking)
  - GET `/api/v1/questions/{id}` (Daten für Anzeige), POST `/api/v1/questions/{id}/answer` (team)
- Events/Stream:
  - GET `/api/v1/stream` (SSE/WebSocket) mit standardisierten Eventtypen
- Welcome:
  - GET/POST `/api/v1/welcome/*` (Registrierung, Teamaufteilung) – rollenbasiert

ToDos
-----
- API v1 Blueprint anlegen, bestehende Routen deprecaten und intern auf Services umbiegen.
- Response-/Error-Schemata als zentrale Helfer (z. B. `api_response(data)`, `api_error(code, message)`).
- OpenAPI-Spec erzeugen (Flask-Smorest/Flask-Swagger) und im Admin-Dashboard verlinken.
