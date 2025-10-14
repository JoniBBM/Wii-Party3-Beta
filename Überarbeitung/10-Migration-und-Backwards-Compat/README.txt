Was muss verbessert werden
--------------------------
- Viele Legacy-Routen/Antworten im Umlauf; harte Änderungen riskieren Brüche.

Wie wird es gemacht
-------------------
- API v1 parallel einführen; alte Routen deprecaten und intern auf Services mappen.
- Response-Adapter für Übergangszeit (alte Clients bekommen alte Form, Daten aber aus neuer Logik).
- Migrationsskripte für DB, Content, Eventdaten. Backups vor Migration.
- Feature-Flags: Schrittweise Aktivierung (z. B. neue Dice-Logik, neuer Stream).

ToDos
-----
- Deprecation-Plan + Zeitleiste dokumentieren.
- Mapping-Tabelle alt -> neu (Routen, Felder).
- Rollback-Strategie notieren.
