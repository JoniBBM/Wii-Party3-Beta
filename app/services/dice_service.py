import random
from typing import Dict, Any

from flask import current_app

from app import db
from app.models import Team
from app.services.event_service import create_event


def admin_roll_for_team(active_session, team: Team) -> Dict[str, Any]:
    """
    Führt einen Admin-Wurf für das gegebene Team aus:
    - Berechnet Standard- und Bonuswürfel
    - Bewegt das Team (inkl. Blockadeprüfung)
    - Triggert ggf. Spezialfelder
    - Erzeugt ein Dice-Event (garantiert JSON)

    Gibt ein Ergebnis-Dict zurück (Rollwerte, Positionen, Flags).
    Commit wird NICHT durchgeführt – der Aufrufer ist verantwortlich.
    """
    # Würfel
    standard_dice_roll = random.randint(1, 6)
    bonus_dice_roll = 0
    if team.bonus_dice_sides and team.bonus_dice_sides > 0:
        bonus_dice_roll = random.randint(1, team.bonus_dice_sides)

    total_roll = standard_dice_roll + bonus_dice_roll
    max_field_index = current_app.config.get('MAX_BOARD_FIELDS', 72)

    old_position = team.current_position or 0
    new_position = old_position

    # Sonderfelder-Logik
    try:
        from app.game_logic.special_fields import (
            handle_special_field_action,
            check_barrier_release,
        )
        special_fields_available = True
    except Exception:
        special_fields_available = False

    special_field_result = None
    barrier_check_result = None

    if special_fields_available and getattr(team, 'is_blocked', False):
        # Team ist blockiert – prüfe Befreiung
        barrier_check_result = check_barrier_release(team, standard_dice_roll, active_session, bonus_dice_roll)
        if barrier_check_result.get('released'):
            new_position = min(old_position + total_roll, max_field_index)
            team.current_position = new_position
            # Spezialfeld nach der Bewegung prüfen
            all_teams = Team.query.all()
            special_field_result = handle_special_field_action(team, all_teams, active_session)
        else:
            # bleibt blockiert, keine Bewegung
            new_position = old_position
    else:
        # Normale Bewegung
        new_position = min(old_position + total_roll, max_field_index)
        team.current_position = new_position
        if special_fields_available:
            all_teams = Team.query.all()
            special_field_result = handle_special_field_action(team, all_teams, active_session)

    # Zielfeld-/Sieg-Logik
    victory_triggered = False
    needs_final_roll = False
    if old_position == 72 and total_roll >= 6:
        victory_triggered = True
    elif old_position == 72 and total_roll < 6:
        needs_final_roll = True

    # Event-Beschreibung
    event_description = f"Admin würfelte für Team {team.name}: {standard_dice_roll}"
    if bonus_dice_roll > 0:
        event_description += f" (Bonus: {bonus_dice_roll}, Gesamt: {total_roll})"

    if getattr(team, 'is_blocked', False) and barrier_check_result and not barrier_check_result.get('released', False):
        event_description += " - BLOCKIERT: Konnte sich nicht befreien."
    else:
        event_description += f" und bewegte sich von Feld {old_position} zu Feld {new_position}."

    if victory_triggered:
        event_description += f" 🏆 SIEG! Team war auf Zielfeld und würfelte {total_roll}!"
    elif old_position == 72 and total_roll < 6:
        event_description += f" 🎯 War auf Zielfeld - braucht mindestens 6 zum Gewinnen (gewürfelt: {total_roll})"
    elif new_position == 72:
        event_description += f" 🎯 Erreichte Zielfeld - braucht nächste Runde mindestens 6 zum Gewinnen"

    # Dice-Event erzeugen (JSON)
    create_event(
        game_session_id=active_session.id,
        event_type="admin_dice_roll_legacy",
        related_team_id=team.id,
        description=event_description,
        data={
            "standard_roll": standard_dice_roll,
            "bonus_roll": bonus_dice_roll,
            "total_roll": total_roll,
            "old_position": old_position,
            "new_position": new_position,
            "rolled_by": "admin_legacy_route",
            "was_blocked": getattr(team, 'is_blocked', False) if barrier_check_result else False,
            "barrier_released": barrier_check_result.get('released', False) if barrier_check_result else False,
            "victory_triggered": victory_triggered,
            "needs_final_roll": needs_final_roll,
        },
    )

    result = {
        "standard_roll": standard_dice_roll,
        "bonus_roll": bonus_dice_roll,
        "total_roll": total_roll,
        "old_position": old_position,
        "new_position": new_position,
        "victory_triggered": victory_triggered,
        "needs_final_roll": needs_final_roll,
        "barrier_check_result": barrier_check_result,
        "special_field_result": special_field_result,
    }
    return result

