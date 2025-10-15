from typing import Optional

from app import db
from app.models import GameEvent, GameRound, GameSession


def get_active_session() -> Optional[GameSession]:
    """
    Liefert die aktuell aktive GameSession oder None.

    Zentralisiert die Abfrage, damit künftige Anpassungen
    (z. B. Caching, Prefetch) nicht an allen Aufrufstellen
    dupliziert werden müssen.
    """
    return GameSession.query.filter_by(is_active=True).first()


def require_active_session() -> GameSession:
    """
    Gibt die aktive Session zurück oder wirft einen LookupError.
    Für Aufrufer, die zwingend eine aktive Session erwarten.
    """
    session = get_active_session()
    if session is None:
        raise LookupError("Keine aktive Spielsitzung gefunden.")
    return session


def get_or_create_active_session() -> GameSession:
    """
    Liefert die aktive Session oder legt eine neue an, falls keine existiert.

    Beinhaltet die Initialisierung einer neuen Session inklusive
    Eventprotokollierung, genau wie bislang in den Admin-Routen.
    """
    session = get_active_session()
    if session:
        return session

    active_round = GameRound.get_active_round()
    session = GameSession(
        is_active=True,
        current_phase='SETUP_MINIGAME',
        game_round_id=active_round.id if active_round else None,
        played_content_ids='',
    )
    db.session.add(session)
    db.session.flush()

    description = "Neue Spielsitzung gestartet."
    if active_round:
        description = f"Neue Spielsitzung gestartet für Runde {active_round.name}."

    event = GameEvent(
        game_session_id=session.id,
        event_type="game_session_started",
        description=description,
    )
    db.session.add(event)
    db.session.commit()
    return session
