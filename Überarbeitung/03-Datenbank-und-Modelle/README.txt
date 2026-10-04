Was muss verbessert werden
--------------------------
- Legacy-/Duplikatfelder und gemischte Verantwortlichkeiten (z. B. played_content_ids als CSV statt Relation).
- Fehlende Indizes/Constraints; uneinheitliche JSON-Felder ohne Validierung.
- eval-Fallbacks in Events; heterogene Event-Daten.

Wie wird es gemacht
-------------------
- Normalisierung: `PlayedContent(session_id, content_id, type)` statt CSV-String in GameSession.
- Indizes: auf häufigen Filtern (session_id, team_id, event_type, timestamps).
- Constraints: NOT NULL wo sinnvoll, Foreign Keys prüfen, Unique-Constraints dokumentieren.
- Event-Daten: Einheitliches Schema; `GameEvent.data_json` strikt JSON; Migration entfernt eval-Pfade in Code.
- Charakter/Customization: optional separate Tabellen oder validierte JSON-Schemata.

ToDos
-----
- Alembic-Migrationen für neue Tabellen/Constraints/Indizes schreiben.
- Data-Migration von played_content_ids -> PlayedContent.
- Prüfen: Welcome/PlayerRegistration Relation/Constraints.
- Performance: Query-Optimierungen (N+1 vermeiden, Lazy-Strategien prüfen).
