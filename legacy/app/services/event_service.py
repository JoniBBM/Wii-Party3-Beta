import json
from typing import Optional, Dict, Any, List, Sequence

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


def serialize_event_for_stream(event: GameEvent) -> Dict[str, Any]:
    """
    Normalisiert ein GameEvent für Event-Streams/SSE-Ausgaben.

    - Garantiert, dass die Daten als Dict vorliegen (fallback: {}).
    - Enthält Timestamp im ISO-Format.
    """
    payload: Dict[str, Any] = {}
    if event.data_json:
        if isinstance(event.data_json, dict):
            payload = event.data_json
        else:
            try:
                payload = json.loads(event.data_json)
            except Exception:
                payload = {}

    return {
        "id": event.id,
        "type": event.event_type,
        "session_id": event.game_session_id,
        "team_id": event.related_team_id,
        "description": event.description,
        "timestamp": event.timestamp.isoformat() if event.timestamp else None,
        "data": payload,
    }


def fetch_recent_events_for_session(
    session_id: int,
    *,
    since_id: Optional[int] = None,
    limit: int = 50,
    event_types: Optional[Sequence[str]] = None,
) -> List[Dict[str, Any]]:
    """
    Liefert normalisierte Events für eine Session.

    Args:
        session_id: ID der GameSession.
        since_id: Nur Events mit ID > since_id werden berücksichtigt.
        limit: Maximale Anzahl Events (Standard 50).
        event_types: Optional Liste erlaubter Eventtypen.

    Returns:
        Liste serialisierter Events in aufsteigender Reihenfolge (älteste zuerst).
    """
    query = GameEvent.query.filter_by(game_session_id=session_id)

    if since_id is not None:
        query = query.filter(GameEvent.id > since_id)

    if event_types:
        query = query.filter(GameEvent.event_type.in_(event_types))

    limit = max(0, limit)
    if limit:
        query = query.order_by(GameEvent.id.desc()).limit(limit)
    else:
        query = query.order_by(GameEvent.id.desc())

    results = list(query.all())
    results.reverse()  # wieder chronologisch (alt -> neu)
    return [serialize_event_for_stream(evt) for evt in results]
