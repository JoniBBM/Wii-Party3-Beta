from flask import jsonify, current_app, Response, stream_with_context, request
from datetime import datetime, timedelta
import time
import json

from . import api_v1_bp
from app.models import Team, GameSession, GameEvent
from app.services.session_service import get_active_session, get_active_session_events


def _sse_format(data, *, event=None, event_id=None, retry=None):
    """
    Hilfsfunktion zum Formatieren von Server-Sent Events.
    """
    if not isinstance(data, str):
        data = json.dumps(data)

    lines = []
    if event_id is not None:
        lines.append(f"id: {event_id}")
    if event is not None:
        lines.append(f"event: {event}")
    if retry is not None:
        lines.append(f"retry: {int(retry)}")
    lines.append(f"data: {data}")
    return "\n".join(lines) + "\n\n"


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


@api_v1_bp.get('/stream')
def stream_events_v1():
    """
    Server-Sent Events Endpoint für standardisierte GameEvents.

    Unterstützt optionale Query-Parameter:
      - since_id: Nur Events mit ID > since_id werden gesendet.
      - limit: Maximale Anzahl Events pro Poll (1-200, Default 50).
      - poll: Poll-Intervall in Sekunden (0.2-5.0, Default 1.0).
      - keepalive: Keepalive-Intervall in Sekunden (3-120, Default 15).
      - event_types: Komma-separierte Liste erlaubter Eventtypen.
    """
    since_id = request.args.get('since_id', type=int)
    limit = request.args.get('limit', default=50, type=int)
    poll_interval = request.args.get('poll', default=1.0, type=float)
    keepalive_interval = request.args.get('keepalive', default=15.0, type=float)
    event_types_param = request.args.get('event_types')

    if limit is None:
        limit = 50
    limit = max(1, min(limit, 200))

    poll_interval = max(0.2, min(poll_interval or 1.0, 5.0))
    keepalive_interval = max(3.0, min(keepalive_interval or 15.0, 120.0))

    header_last_id = request.headers.get('Last-Event-ID')
    if header_last_id and since_id is None:
        try:
            since_id = int(header_last_id)
        except ValueError:
            since_id = None

    event_types = None
    if event_types_param:
        parsed = [item.strip() for item in event_types_param.split(',') if item.strip()]
        if parsed:
            event_types = parsed

    retry_ms = int(max(poll_interval, 0.5) * 1000)

    def generate():
        last_sent_id = since_id
        keepalive_marker = time.time()
        reported_session_id = None

        active_session = get_active_session()
        if active_session:
            reported_session_id = active_session.id

        handshake_payload = {
            "type": "stream_connected",
            "active_session_id": reported_session_id,
            "poll_interval": poll_interval,
            "keepalive_interval": keepalive_interval,
            "ts": datetime.utcnow().isoformat() + "Z",
            "event_filter": event_types if event_types else "all",
        }
        yield _sse_format(handshake_payload, event="control", retry=retry_ms)

        while True:
            try:
                current_session = get_active_session()
                current_session_id = current_session.id if current_session else None
                if current_session_id != reported_session_id:
                    reported_session_id = current_session_id
                    state_payload = {
                        "type": "session_state",
                        "active_session_id": reported_session_id,
                        "ts": datetime.utcnow().isoformat() + "Z",
                    }
                    yield _sse_format(state_payload, event="control")

                events = get_active_session_events(
                    since_id=last_sent_id,
                    limit=limit,
                    event_types=event_types,
                )

                if events:
                    for evt in events:
                        last_sent_id = evt["id"]
                        keepalive_marker = time.time()

                        yield _sse_format(
                            evt,
                            event=evt.get("type"),
                            event_id=evt.get("id"),
                        )

                now = time.time()
                if now - keepalive_marker >= keepalive_interval:
                    keepalive_marker = now
                    keepalive_payload = {
                        "type": "keepalive",
                        "ts": datetime.utcnow().isoformat() + "Z",
                    }
                    yield _sse_format(keepalive_payload, event="keepalive")

                time.sleep(poll_interval)
            except GeneratorExit:
                break
            except Exception as exc:
                current_app.logger.error("SSE stream failure: %s", exc, exc_info=True)
                error_payload = {
                    "type": "stream_error",
                    "message": "internal_error",
                }
                yield _sse_format(error_payload, event="error")
                break

    response = Response(stream_with_context(generate()), mimetype='text/event-stream')
    response.headers["Cache-Control"] = "no-cache"
    response.headers["Connection"] = "keep-alive"
    response.headers["X-Accel-Buffering"] = "no"
    return response


@api_v1_bp.get('/status/board')
def status_board_v1():
    try:
        teams = Team.query.order_by(Team.id).all()
        active_session = get_active_session()

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
