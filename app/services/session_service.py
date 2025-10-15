from typing import Optional

from app.models import GameSession


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
