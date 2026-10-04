Was muss verbessert werden
--------------------------
- Klare Schichten: Web (Blueprints) vs. Domain/Services vs. Datenzugriff (ORM).
- Entfernen verteilter Geschäftslogik aus Routen (aktuell in admin/main/teams verstreut).
- Konsolidierung der Spiel-Zustandsmaschine (Phasen) an einer Stelle.
- Einheitliche Fehlerbehandlung/Logging an zentraler Middleware/Decorator-Schicht.
- Trennung von Präsentation (Jinja) und API (JSON) mit stabilen Schnittstellen.

Wie wird es gemacht
-------------------
- Einführung einer Service-Layer unter `app/services/` (dice_service, session_service, field_service, content_service, question_service, team_service, event_service, welcome_service).
- Routen rufen nur Services auf; Services kapseln Geschäftslogik, validieren Input und werfen definierte Fehler.
- Ein zentraler Error-Handler für API (z. B. `@api_errorhandler`) konvertiert Exceptions in konsistente JSON-Fehler.
- Zustandsmaschine (Phasen) als State-Objekt oder Enum + Transitionen im session_service.
- DTO/Schema-Ebene (Marshmallow/Pydantic) für Request/Response-Schemata.

ToDos
-----
- app/services/ Struktur anlegen und bestehende Logik aus Routen herausziehen.
- Einheitliche Exception-Typen definieren (DomainError, ValidationError, NotFound, Forbidden).
- Globale API-Fehler- und Response-Wrapper einführen.
- Phasen-Transitionen dokumentieren und als explizite Funktionen implementieren.
