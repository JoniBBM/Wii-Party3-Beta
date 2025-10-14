from flask import jsonify, current_app
from datetime import datetime, timedelta
import time
import json

from . import api_v1_bp
from app.models import Team, GameSession, GameEvent


def _meta():
    return {"version": "v1", "ts": int(time.time())}


def _ok(data):
    return jsonify({"success": True, "data": data, "meta": _meta()})


def _err(code, message, details=None, status=400):
    payload = {"success": False, "error": {"code": code, "message": message}}
    if details is not None:
        payload["error"]["details"] = details
    payload["meta"] = _meta()
    return jsonify(payload), status


@api_v1_bp.get('/status/board')
def status_board_v1():
    try:
        teams = Team.query.order_by(Team.id).all()
        active_session = GameSession.query.filter_by(is_active=True).first()

        team_data = []
        for t in teams:
            color = None
            char = None
            if t.character:
                char = {
                    "id": t.character.id,
                    "name": t.character.name,
                    "color": getattr(t.character, 'color', None)
                }
                color = getattr(t.character, 'color', None)
            team_data.append({
                "id": t.id,
                "name": t.name,
                "position": t.current_position or 0,
                "color": color,
                "character": char,
                "bonus_dice_sides": t.bonus_dice_sides or 0,
                "minigame_placement": t.minigame_placement,
                "special": {
                    "is_blocked": getattr(t, 'is_blocked', False),
                    "blocked_turns": getattr(t, 'blocked_turns_remaining', 0),
                    "extra_moves": getattr(t, 'extra_moves_remaining', 0),
                    "has_shield": getattr(t, 'has_shield', False)
                }
            })

        session_data = None
        if active_session:
            # Round info
            round_info = None
            if active_session.game_round:
                folder_name = None
                if active_session.game_round.minigame_folder:
                    folder_name = active_session.game_round.minigame_folder.name
                round_info = {
                    "id": active_session.game_round.id,
                    "name": active_session.game_round.name,
                    "folder": folder_name,
                }

            # Dice order parsing
            order = []
            if active_session.dice_roll_order:
                try:
                    order = [int(x) for x in active_session.dice_roll_order.split(',') if x.strip().isdigit()]
                except Exception:
                    order = []

            session_data = {
                "id": active_session.id,
                "phase": active_session.current_phase,
                "round": round_info,
                "current_team_turn_id": active_session.current_team_turn_id,
                "dice_roll_order": order,
                "question": {"id": active_session.current_question_id} if active_session.current_question_id else {"id": None},
                "field_minigame": {"active": active_session.current_phase in [
                    'FIELD_MINIGAME_SELECTION_PENDING', 'FIELD_MINIGAME_TRIGGERED', 'FIELD_MINIGAME_ACTIVE'
                ]}
            }

        # Recent events (10s window)
        last_dice = None
        last_special = None
        if active_session:
            recent_time = datetime.utcnow() - timedelta(seconds=10)

            dice_evt = GameEvent.query.filter_by(game_session_id=active_session.id) \
                .filter(GameEvent.event_type.in_([
                    'dice_roll', 'admin_dice_roll', 'admin_dice_roll_legacy', 'team_dice_roll'
                ])) \
                .filter(GameEvent.timestamp >= recent_time) \
                .order_by(GameEvent.timestamp.desc()) \
                .first()
            if dice_evt and dice_evt.data_json:
                try:
                    d = json.loads(dice_evt.data_json) if isinstance(dice_evt.data_json, str) else dice_evt.data_json
                    last_dice = {
                        "team_id": dice_evt.related_team_id,
                        "standard": d.get('standard_roll', 0),
                        "bonus": d.get('bonus_roll', 0),
                        "total": d.get('total_roll', 0),
                        "old_pos": d.get('old_position'),
                        "new_pos": d.get('new_position'),
                        "ts": dice_evt.timestamp.isoformat()
                    }
                except Exception:
                    last_dice = None

            special_evt = GameEvent.query.filter_by(game_session_id=active_session.id) \
                .filter(GameEvent.event_type.in_([
                    'special_field_catapult_forward', 'special_field_catapult_backward', 'special_field_player_swap',
                    'special_field_barrier_set', 'special_field_barrier_released', 'special_field_barrier_blocked',
                    'field_minigame_completed'
                ])) \
                .filter(GameEvent.timestamp >= recent_time) \
                .order_by(GameEvent.timestamp.desc()) \
                .first()
            if special_evt and special_evt.data_json:
                try:
                    s = json.loads(special_evt.data_json) if isinstance(special_evt.data_json, str) else special_evt.data_json
                    last_special = {
                        "type": special_evt.event_type,
                        "team_id": special_evt.related_team_id,
                        "data": s,
                        "ts": special_evt.timestamp.isoformat()
                    }
                except Exception:
                    last_special = None

        return _ok({
            "teams": team_data,
            "session": session_data,
            "last_dice": last_dice,
            "last_special": last_special
        })
    except Exception as e:
        current_app.logger.error(f"/api/v1/status/board error: {e}", exc_info=True)
        return _err("INTERNAL_ERROR", "Unerwarteter Fehler", status=500)


@api_v1_bp.get('/fields/positions')
def fields_positions_v1():
    try:
        # Preferred: use special_fields util if available
        positions = {}
        try:
            from app.game_logic.special_fields import get_all_special_field_positions
            positions = get_all_special_field_positions()
        except Exception:
            # Fallback: compute from Config SPECIAL_FIELD_POSITIONS
            max_fields = current_app.config.get('MAX_BOARD_FIELDS', 72)
            spec = current_app.config.get('SPECIAL_FIELD_POSITIONS', {})
            for k, modulo in spec.items():
                if isinstance(modulo, int) and modulo > 0:
                    positions[k] = [i for i in range(0, max_fields + 1) if (i % modulo == 0 and i != 0)]

        # Always include start/goal
        positions_out = {
            "start": [0],
            "goal": [current_app.config.get('MAX_BOARD_FIELDS', 72)]
        }
        # merge known keys
        for key in ['catapult_forward', 'catapult_backward', 'player_swap', 'barrier']:
            if key in positions and isinstance(positions[key], list):
                positions_out[key] = positions[key]

        return _ok(positions_out)
    except Exception as e:
        current_app.logger.error(f"/api/v1/fields/positions error: {e}", exc_info=True)
        return _err("INTERNAL_ERROR", "Unerwarteter Fehler", status=500)

