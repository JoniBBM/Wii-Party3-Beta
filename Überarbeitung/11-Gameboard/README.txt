Was muss verbessert werden
--------------------------
- Uneinheitliche Datenquellen: Board bezieht Status, Würfel- und Spezialfeldinfos aus unterschiedlichen Endpunkten/Formaten.
- Event-Verarbeitung heterogen (SSE/Poll teils unterschiedlich, gemischte Eventdaten, eval-Fallbacks serverseitig).
- Viel JS-Sonderlogik im Template nötig; Rendering- und State-Management sind nicht klar getrennt.
- Inkonsistente Banner/Overlays (Würfel, Spezialfeld, Frage) und fehlende Wiederverwendung.
- Verbindungs-/Fehlerzustände nicht einheitlich (Reconnect, Backoff, Offline-Indikator).
- Performance: unnötige Re-renders, fehlendes Throttling/Debounce, Three.js nur rudimentär initialisiert.

Wie wird es gemacht
-------------------
- Gameboard konsumiert ausschließlich API v1 + Event-Stream:
  - GET `/api/v1/status/board` liefert vollständigen Board-Zustand (Teams, Session/Phase, letzte Ereignisse, Metadaten) im standardisierten Schema.
  - GET `/api/v1/fields/positions` für berechnete Spezialfeld-Positionen (Cachebar).
  - Stream `/api/v1/stream` (SSE/WebSocket) mit normierten Eventtypen (dice_roll, special_field, phase_change, content_selected, question_started, question_completed, field_update).
- Dediziertes Frontend-State-Management:
  - `state.store` (Single Source of Truth) + `selectors` für Canvas/Overlays.
  - Idempotente Event-Anwendung (Events enthalten `id`, `ts`, `type`, `data`).
- UI-Komponenten definieren:
  - Canvas-Renderer (Spielfeld, Pfad, Marker, Spezialfelder, Kamera/Zoom/Drag).
  - HUD/Overlays: Würfelbanner, Spezialfeldbanner, Fragenbanner, Face-Overlay.
  - Connection-Indicator, Error-Toast, Reconnect-Backoff.
- Performance & Robustheit:
  - Render-Loop via `requestAnimationFrame` mit Dirty-Flags.
  - Throttling/Coalescing eingehender Events.
  - Fallback: periodisches Re-Fetch des Status (z. B. alle 5–10s) bei Stream-Ausfall.
  - Keine `eval`; nur JSON; Timestamps ISO 8601.

ToDos
-----
- BoardState/TeamState/SessionState Schemas finalisieren (siehe Datenverträge.txt) und API v1 implementieren.
- Einheitlichen Event-Client schreiben (SSE/WebSocket Auto-Auswahl, mit Reconnect-Strategie und Backoff).
- Canvas-Renderer modularisieren (Renderer, Scene, Entities, Systems) – zunächst einfach halten.
- Banner/Overlays als eigenständige Komponenten, die auf State/Events hören (keine direkten DOM-Manipulationen innerhalb Routen).
- Tests: Mock-Server für Events/Status, Snapshot-/Screenshot-Tests optional.

