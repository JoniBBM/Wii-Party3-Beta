import json
from typing import Optional, Dict, Any

from app import db
from app.models import GameEvent


def create_event(
    game_session_id: int,
    event_type: str,
    related_team_id: Optional[int] = None,
    description: Optional[str] = None,
    data: Optional[Dict[str, Any]] = None,
    timestamp=None,
) -> GameEvent:
    """
    Erstellt ein GameEvent mit garantiertem JSON-Inhalt und fügt es der DB-Session hinzu.
    Commit wird nicht durchgeführt; der Aufrufer ist dafür verantwortlich.
    """
    data_json = None
    if data is not None:
        try:
            data_json = json.dumps(data)
        except Exception:
            # Fallback: leeres JSON, um defekte Daten nicht zu persistieren
            data_json = json.dumps({})

    evt = GameEvent(
        game_session_id=game_session_id,
        event_type=event_type,
        description=description,
        related_team_id=related_team_id,
        data_json=data_json,
    )

    # Optional: timestamp setzen, wenn vorgegeben (z. B. für Tests/Importe)
    if timestamp is not None:
        evt.timestamp = timestamp

    db.session.add(evt)
    return evt

