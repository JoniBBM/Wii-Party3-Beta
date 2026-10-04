Technische Roadmap (logische Reihenfolge)
=========================================

0. Vorbereitung / Baseline
- Voll-Backup: DB (`app.db`) und `spielstaende/` sichern.
- Env-Konfiguration prüfen, `.env` erstellen; unsichere Defaults entfernen.
- Readme/Protokoll-Template in allen Unterordnern anlegen (Änderungen fortlaufend dokumentieren).
- Test-Gate festlegen: Nach jedem Schritt liefert die KI Test-Anweisungen (Was/Wie/Erfolgskriterien) und wartet auf erfolgreiches Feedback.
 - Testdisziplin: Pro Schritt genau EINE Testsache durchführen (step-by-step), erst nach Erfolg den nächsten Test ausführen.

1. API v1 Gerüst (read-only, ohne Logikwechsel)
- Blueprint `api_v1` erstellen, Endpunkte: `GET /status/board`, `GET /fields/positions`.
- Antworten nach `Response-Schemata.txt`; Daten vorerst aus bestehenden Modellen/Funktionen (ohne Refactor).
- Ziel: stabile, einheitliche Schnittstellen, die das Frontend schon nutzen kann.

2. Events vereinheitlichen (Event-Factory)
- Einheitliche Eventtypen + Payloads (siehe Events-und-Echtzeit).
- eval-Fallbacks entfernen; nur JSON in `GameEvent.data_json`.
- SSE-Endpoint unter `/api/v1/stream` vorbereiten (parallel zu bestehendem SSE).

3. Service-Layer extrahieren (Domain-Logik)
- `app/services/` anlegen: `dice_service`, `field_service`, `session_service`, `content_service`, `question_service`, `team_service`, `event_service`, `welcome_service`.
- Schrittweise Migration: Würfeln, Spezialfelder, Phasenwechsel.
- Unit-Tests für Services beginnen.

4. Datenbank-Migrationen
- Neue Tabellen/Indizes: `PlayedContent(session_id, content_id, type)`, Indizes auf Events (session_id, type), Constraints.
- Data-Migration von CSV-Feldern zu Relationen.
- Alembic-Migrationen erstellen und testen.

5. API v1 auf Services umstellen
- v1-Endpunkte nutzen Services; Legacy-Routen intern auf Services mappen.
- Fehler-/Response-Wrapper zentral.

6. Echtzeit-Stream konsolidieren
- SSE/WebSocket vereinheitlichen (zunächst SSE). Event-Buffer/Replay implementieren.
- Admin-Field-Updates auf neuen Stream umstellen.

7. Frontend schrittweise umstellen (Gameboard zuerst)
- Gemeinsamer `ApiClient` + `StreamClient` bauen.
- Gameboard auf `GET /api/v1/status/board` + Stream umstellen (Events → UI gemäß Event-Mapping).
- Moderationsansicht anpassen.

8. CSS/JS/HTML trennen und vereinheitlichen
- JS: ES-Module, Ordnerstruktur, ein Entry pro Seite (Board/Admin/Teams).
- CSS: BEM/Utilities, Komponenten-/Seiten-Styles trennen, Variablen/Theme.
- Templates: Layout/Partials/Macros; Inline-Skripte/-Styles entfernen.

9. Sicherheitshärtung
- Rollen/Scopes (RBAC) erzwingen; CSRF/Token-Regeln klar dokumentieren.
- Upload-Validierung (Profilbilder), Pfad-Whitelists.
- Secrets nur aus Env.

10. Tests & Qualität
- Testabdeckung der Services/APIs erhöhen; Integrationstests (API v1, Stream).
- Linting/Typing/Formatter in CI.

11. Deployment/Prod
- Gunicorn + Nginx, Compose-Profile (dev/prod/test), Migrationsschritt automatisieren.
- Healthchecks/Monitoring (optional).

12. Legacy bereinigen
- Deprecation-Fenster beenden, alte Routen/Code-Pfade entfernen.
- Doku finalisieren.

Checkpoints & Deliverables
- Nach 1–2: API v1 (read-only) stabil; Frontend kann parallel angebunden werden.
- Nach 3–5: Backend-Logik vereinheitlicht; v1 produktiv nutzbar.
- Nach 6–8: Echtzeit + Gameboard + einheitliche Assets stabil.
- Nach 9–11: Sicherer Betrieb, CI grün, produktionsbereit.
