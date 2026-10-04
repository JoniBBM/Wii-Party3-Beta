Was muss verbessert werden
--------------------------
- Mehrere Wege für Live-Updates (SSE/Poll), uneinheitliche Eventtypen/Strukturen.
- Frontend-Parsing komplex wegen heterogener Events.

Wie wird es gemacht
-------------------
- Einheitlicher Echtzeitkanal `/api/v1/stream` (SSE oder WebSocket, z. B. Flask-SocketIO optional).
- Standardisierte Eventtypen: dice_roll, special_field, phase_change, content_selected, question_started, question_completed, field_update.
- Einheitlicher Payload-Schema (siehe APIs/Response-Schemata). Timestamps ISO.
- Serverseitiges Event-Buffering/Replay kleiner Historie.

ToDos
-----
- Event-Factory im `event_service` einführen.
- Bestehende `GameEvent`-Erzeugung durch Factory ersetzen.
- SSE-Handler vereinheitlichen und in API v1 überführen.
