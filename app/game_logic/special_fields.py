"""
Sonderfeld-Logik für Wii Party Clone - Erweitert mit konfigurierbaren Feld-Häufigkeiten
Enthält alle Funktionen für die verschiedenen Sonderfelder basierend auf FieldConfiguration
Mit intelligentem Konflikt-Auflösungs-Algorithmus
"""
import random
import json
import os
from flask import current_app
from app.models import db, GameEvent, FieldConfiguration

# Cache für berechnete Feld-Verteilung
_field_distribution_cache = None
_cache_max_fields = None


def handle_catapult_forward(team, current_position, game_session, dice_info=None):
    """
    Katapultiert ein Team 3-5 Felder nach vorne (konfigurierbar)
    """
    config = FieldConfiguration.get_config_for_field('catapult_forward')
    if not config or not config.is_enabled:
        return {"success": False, "action": "none"}
    
    config_data = config.config_dict
    min_distance = config_data.get('min_distance', 3)
    max_distance = config_data.get('max_distance', 5)
    
    max_board_fields = current_app.config.get('MAX_BOARD_FIELDS', 72)
    catapult_distance = random.randint(min_distance, max_distance)
    
    # Katapult-Positionen (vor und nach Katapult)
    catapult_old_position = current_position
    catapult_new_position = min(current_position + catapult_distance, max_board_fields)
    
    # Original Würfel-Bewegung (falls verfügbar)
    dice_old_position = dice_info.get('old_position') if dice_info else None
    dice_new_position = dice_info.get('new_position') if dice_info else None
    
    team.current_position = catapult_new_position
    
    # Event erstellen
    event = GameEvent(
        game_session_id=game_session.id,
        event_type="special_field_catapult_forward",
        description=f"Team {team.name} wurde {catapult_distance} Felder nach vorne katapultiert (von Feld {catapult_old_position} zu Feld {catapult_new_position})!",
        related_team_id=team.id,
        data_json=json.dumps({
            "field_type": "catapult_forward",
            "catapult_distance": catapult_distance,
            "old_position": catapult_old_position,
            "new_position": catapult_new_position,
            # Original Würfel-Bewegung für Banner
            "dice_old_position": dice_old_position,
            "dice_new_position": dice_new_position,
            "dice_roll": dice_info.get('dice_roll') if dice_info else None,
            "bonus_roll": dice_info.get('bonus_roll') if dice_info else None,
            "total_roll": dice_info.get('total_roll') if dice_info else None
        })
    )
    db.session.add(event)
    
    return {
        "success": True,
        "action": "catapult_forward", 
        "catapult_distance": catapult_distance,
        "old_position": catapult_old_position,
        "new_position": catapult_new_position,
        # Original Würfel-Bewegung für Banner
        "dice_old_position": dice_old_position,
        "dice_new_position": dice_new_position,
        "message": f"🚀 Katapult! {team.name} fliegt {catapult_distance} Felder nach vorne!"
    }


def handle_catapult_backward(team, current_position, game_session, dice_info=None):
    """
    Katapultiert ein Team 4-10 Felder nach hinten (konfigurierbar)
    """
    config = FieldConfiguration.get_config_for_field('catapult_backward')
    if not config or not config.is_enabled:
        return {"success": False, "action": "none"}
    
    config_data = config.config_dict
    min_distance = config_data.get('min_distance', 4)
    max_distance = config_data.get('max_distance', 10)
    
    catapult_distance = random.randint(min_distance, max_distance)
    
    # Katapult-Positionen (vor und nach Katapult)
    catapult_old_position = current_position
    catapult_new_position = max(0, current_position - catapult_distance)
    
    # Original Würfel-Bewegung (falls verfügbar)
    dice_old_position = dice_info.get('old_position') if dice_info else None
    dice_new_position = dice_info.get('new_position') if dice_info else None
    
    team.current_position = catapult_new_position
    
    # Event erstellen
    event = GameEvent(
        game_session_id=game_session.id,
        event_type="special_field_catapult_backward",
        description=f"Team {team.name} wurde {catapult_distance} Felder nach hinten katapultiert (von Feld {catapult_old_position} zu Feld {catapult_new_position})!",
        related_team_id=team.id,
        data_json=json.dumps({
            "field_type": "catapult_backward",
            "catapult_distance": catapult_distance,
            "old_position": catapult_old_position,
            "new_position": catapult_new_position,
            # Original Würfel-Bewegung für Banner
            "dice_old_position": dice_old_position,
            "dice_new_position": dice_new_position,
            "dice_roll": dice_info.get('dice_roll') if dice_info else None,
            "bonus_roll": dice_info.get('bonus_roll') if dice_info else None,
            "total_roll": dice_info.get('total_roll') if dice_info else None
        })
    )
    db.session.add(event)
    
    return {
        "success": True,
        "action": "catapult_backward",
        "catapult_distance": catapult_distance,
        "old_position": catapult_old_position,
        "new_position": catapult_new_position,
        # Original Würfel-Bewegung für Banner
        "dice_old_position": dice_old_position,
        "dice_new_position": dice_new_position,
        "message": f"💥 Rückschlag! {team.name} wird {catapult_distance} Felder zurück geschleudert!"
    }


def handle_player_swap(current_team, all_teams, game_session, dice_info=None):
    """
    Tauscht die Position des aktuellen Teams mit einem zufälligen anderen Team (konfigurierbar)
    """
    config = FieldConfiguration.get_config_for_field('player_swap')
    if not config or not config.is_enabled:
        return {"success": False, "action": "none"}
    
    config_data = config.config_dict
    min_distance = config_data.get('min_distance', 3)
    
    # Finde andere Teams (nicht das aktuelle) mit Mindestabstand
    other_teams = []
    for team in all_teams:
        if team.id != current_team.id:
            distance = abs(team.current_position - current_team.current_position)
            if distance >= min_distance:
                other_teams.append(team)
    
    if not other_teams:
        # Fallback: alle anderen Teams wenn kein Mindestabstand erfüllt wird
        other_teams = [team for team in all_teams if team.id != current_team.id and team.current_position != current_team.current_position]
    
    if not other_teams:
        return {
            "success": False,
            "action": "player_swap",
            "message": f"🔄 Kein anderes Team zum Tauschen verfügbar!"
        }
    
    # Wähle zufälliges Team zum Tauschen
    swap_team = random.choice(other_teams)
    
    # Tausche Positionen
    old_current_position = current_team.current_position
    old_swap_position = swap_team.current_position
    
    current_team.current_position = old_swap_position
    swap_team.current_position = old_current_position
    
    # Event für das aktuelle Team erstellen (das gewürfelt hat)
    current_team_event = GameEvent(
        game_session_id=game_session.id,
        event_type="special_field_player_swap",
        description=f"Team {current_team.name} (Feld {old_current_position}) tauschte Positionen mit Team {swap_team.name} (Feld {old_swap_position})!",
        related_team_id=current_team.id,
        data_json=json.dumps({
            "field_type": "player_swap",
            "current_team_id": current_team.id,
            "current_team_old_position": old_current_position,
            "current_team_new_position": current_team.current_position,
            "swap_team_id": swap_team.id,
            "swap_team_name": swap_team.name,
            "swap_team_old_position": old_swap_position,
            "swap_team_new_position": swap_team.current_position,
            "is_initiating_team": True  # Dieses Team hat gewürfelt
        })
    )
    db.session.add(current_team_event)
    
    # Event für das andere Team erstellen (das getauscht wurde)
    swap_team_event = GameEvent(
        game_session_id=game_session.id,
        event_type="special_field_player_swap",
        description=f"Team {swap_team.name} (Feld {old_swap_position}) wurde mit Team {current_team.name} (Feld {old_current_position}) getauscht!",
        related_team_id=swap_team.id,
        data_json=json.dumps({
            "field_type": "player_swap",
            "current_team_id": current_team.id,
            "current_team_name": current_team.name,
            "current_team_old_position": old_current_position,
            "current_team_new_position": current_team.current_position,
            "swap_team_id": swap_team.id,
            "swap_team_old_position": old_swap_position,
            "swap_team_new_position": swap_team.current_position,
            "is_initiating_team": False  # Dieses Team wurde getauscht
        })
    )
    db.session.add(swap_team_event)
    
    return {
        "success": True,
        "action": "player_swap",
        "current_team_old_position": old_current_position,
        "current_team_new_position": current_team.current_position,
        "swap_team_name": swap_team.name,
        "swap_team_old_position": old_swap_position,
        "swap_team_new_position": swap_team.current_position,
        "message": f"🔄 Positionstausch! {current_team.name} tauscht mit {swap_team.name}!"
    }


def handle_barrier_field(team, game_session):
    """
    Setzt ein Team auf ein Sperren-Feld (konfigurierbar)
    Das Team muss bestimmte Zahlen würfeln um freizukommen
    """
    try:
        config = FieldConfiguration.get_config_for_field('barrier')
        if not config or not config.is_enabled:
            return {"success": False, "action": "none"}
        
        config_data = config.config_dict
        target_numbers = config_data.get('target_numbers', [4, 5, 6])
        
        # Parse target numbers and determine mode
        parsed_config = _parse_barrier_config(target_numbers)
        
        # Team blockieren
        team.is_blocked = True
        team.blocked_target_number = parsed_config['min_number']  # For backward compatibility
        try:
            team.blocked_config = json.dumps(parsed_config)  # Store full config
        except AttributeError:
            # Fallback if blocked_config column doesn't exist
            pass
        
        # Event erstellen
        event = GameEvent(
            game_session_id=game_session.id,
            event_type="special_field_barrier_set",
            description=f"Team {team.name} wurde auf Sperren-Feld blockiert",
            related_team_id=team.id,
            data_json=json.dumps({
                'action': 'barrier',
                'field_type': 'barrier',
                'barrier_set': True,
                'target_config': parsed_config,
                'required_number': parsed_config['min_number'],
                'display_text': parsed_config['display_text']
            })
        )
        db.session.add(event)
        
        return {
            "success": True,
            "action": "barrier_set",
            "target_config": parsed_config,
            "target_number": parsed_config['min_number'],
            "display_text": parsed_config['display_text'],
            "message": f"🚧 Blockiert! {team.name} - {parsed_config['display_text']}"
        }
    
    except Exception as e:
        # Fallback if anything goes wrong
        try:
            team.is_blocked = True
            team.blocked_target_number = 6  # Safe fallback
        except:
            pass
        return {
            "success": False,
            "action": "barrier_error",
            "message": f"Fehler beim Setzen der Sperre: {str(e)}"
        }


def check_barrier_release(team, dice_roll, game_session, bonus_roll=0):
    """
    Prüft ob ein blockiertes Team durch den Würfelwurf freikommt
    
    Args:
        team: Das blockierte Team
        dice_roll: Der Standard-Würfelwurf (1-6)
        game_session: Die aktuelle Spielsitzung
        bonus_roll: Der Bonus-Würfelwurf (0 wenn kein Bonus)
    """
    if not team.is_blocked:
        return {"released": False, "message": "Team ist nicht blockiert"}
    
    # WICHTIG: Verwende Gesamtwürfelwurf (Standard + Bonus) für Barrier-Prüfung
    total_roll = dice_roll + bonus_roll
    current_app.logger.info(f"[BARRIER] Prüfe Team {team.name}: Standard={dice_roll}, Bonus={bonus_roll}, Gesamt={total_roll}")
    
    # Get barrier configuration
    try:
        blocked_config_data = getattr(team, 'blocked_config', None)
        if blocked_config_data:
            barrier_config = json.loads(blocked_config_data)
        else:
            # Fallback for old data
            barrier_config = {
                'mode': 'minimum',
                'numbers': list(range(team.blocked_target_number, 7)),
                'min_number': team.blocked_target_number,
                'display_text': f"Würfle mindestens eine {team.blocked_target_number}!"
            }
    except (json.JSONDecodeError, AttributeError):
        # Fallback
        target_number = team.blocked_target_number or 6
        barrier_config = {
            'mode': 'minimum',
            'numbers': list(range(target_number, 7)),
            'min_number': target_number,
            'display_text': f"Würfle mindestens eine {target_number}!"
        }
    
    current_app.logger.info(f"[BARRIER] Team {team.name} Konfiguration: {barrier_config}")
    
    # Check if dice roll releases the team
    # User requirement: "es soll immer das gesamtergebnis der beiden würfel verglichen werden"
    # Only check the total roll (standard + bonus) for barrier release
    released = _check_barrier_dice_roll(total_roll, barrier_config)
    current_app.logger.info(f"[BARRIER] Team {team.name}: Würfel {total_roll} vs. Konfiguration → {'BEFREIT' if released else 'BLOCKIERT'}")
    
    release_method = "total" if released else None
    
    # Build dice description for event
    dice_description = f"{dice_roll}"
    if bonus_roll > 0:
        dice_description += f" + {bonus_roll} (Bonus) = {total_roll}"
    
    # Event loggen
    event_description = f"Team {team.name} versuchte Befreiung mit Würfel {dice_description}"
    if released and release_method:
        event_description += f" - Befreit durch {release_method}!"
    
    # Erstelle Event basierend auf Ergebnis
    if released:
        event_type = "special_field_barrier_released"
    else:
        event_type = "special_field_barrier_blocked"
    
    event = GameEvent(
        game_session_id=game_session.id,
        event_type=event_type,
        description=event_description,
        related_team_id=team.id,
        data_json=json.dumps({
            'action': 'check_barrier_release',
            'field_type': 'barrier',
            'dice_roll': dice_roll,
            'bonus_roll': bonus_roll,
            'total_roll': total_roll,
            'barrier_config': barrier_config,
            'released': released,
            'release_method': release_method
        })
    )
    db.session.add(event)
    
    if released:
        # Team freigeben
        team.is_blocked = False
        team.blocked_target_number = None
        try:
            team.blocked_config = None
        except AttributeError:
            # Fallback if blocked_config column doesn't exist
            pass
        return {
            "released": True,
            "dice_roll": dice_roll,
            "bonus_roll": bonus_roll,
            "total_roll": total_roll,
            "barrier_config": barrier_config,
            "release_method": release_method,
            "message": f"🎉 Befreit! {team.name} hat {dice_description} gewürfelt!"
        }
    else:
        return {
            "released": False,
            "dice_roll": dice_roll,
            "bonus_roll": bonus_roll,
            "total_roll": total_roll,
            "barrier_config": barrier_config,
            "message": f"🚧 Noch blockiert! {team.name} hat {dice_description} gewürfelt. {barrier_config['display_text']}"
        }


def calculate_smart_field_distribution(max_fields=73):
    """
    Intelligenter Algorithmus zur konfliktfreien Feld-Verteilung
    
    1. Sammelt alle gewünschten Positionen für jeden Feld-Typ
    2. Erkennt Konflikte (mehrere Feld-Typen für eine Position)
    3. Löst Konflikte durch gewichtete Zufallsauswahl oder Umverteilung auf
    4. Gibt eine konfliktfreie Zuordnung zurück: {position: field_type}
    """
    # Lade alle aktivierten Konfigurationen
    field_configs = FieldConfiguration.get_all_enabled()
    
    # Sammle gewünschte Positionen für jeden Feld-Typ
    desired_positions = {}
    
    for config in field_configs:
        field_type = config.field_type
        positions = []
        
        # Spezielle Behandlung für Start und Ziel
        if field_type == 'start':
            positions = [0]
        elif field_type == 'goal':
            positions = [max_fields - 1]
        elif field_type == 'normal':
            # Normale Felder werden später als Fallback zugewiesen
            continue
        elif config.frequency_type == 'modulo' and config.frequency_value > 0:
            # Modulo-basierte Felder - erweiterte Logik für bessere Verteilung
            for pos in range(1, max_fields - 1):  # Nicht Start oder Ziel
                # Erweiterte Modulo-Logik: Verteile Felder in regelmäßigen Abständen
                # aber berücksichtige auch Offset-Positionen für bessere Abdeckung
                if (pos % config.frequency_value == 0 or 
                    (pos + config.frequency_value // 2) % config.frequency_value == 0):
                    positions.append(pos)
        elif config.frequency_type == 'fixed_positions':
            # Fest definierte Positionen
            fixed_positions = config.config_dict.get('positions', [])
            positions = [pos for pos in fixed_positions if 0 <= pos < max_fields]
        elif config.frequency_type == 'probability':
            # Wahrscheinlichkeitsbasierte Verteilung
            probability = config.frequency_value / 100.0
            for pos in range(1, max_fields - 1):  # Nicht Start oder Ziel
                if random.random() < probability:
                    positions.append(pos)
        
        if positions:
            desired_positions[field_type] = positions
    
    # Erkenne Konflikte
    position_conflicts = {}
    for field_type, positions in desired_positions.items():
        for pos in positions:
            if pos not in position_conflicts:
                position_conflicts[pos] = []
            position_conflicts[pos].append(field_type)
    
    # Erstelle finale Zuordnung
    final_assignment = {}
    conflict_resolution_stats = {
        'total_conflicts': 0,
        'resolved_randomly': 0,
        'redistributed': 0
    }
    
    for position, field_types in position_conflicts.items():
        if len(field_types) == 1:
            # Kein Konflikt
            final_assignment[position] = field_types[0]
        else:
            # Konflikt gefunden
            conflict_resolution_stats['total_conflicts'] += 1
            
            # Gewichtete Zufallsauswahl basierend auf Prioritäten
            field_priorities = {}
            for field_type in field_types:
                config = FieldConfiguration.get_config_for_field(field_type)
                if config:
                    # Niedrigere frequency_value = höhere Priorität (seltener = wichtiger)
                    priority = 1000 / max(config.frequency_value, 1) if config.frequency_value else 1
                    field_priorities[field_type] = priority
                else:
                    field_priorities[field_type] = 1
            
            # Gewichtete Zufallsauswahl
            total_weight = sum(field_priorities.values())
            if total_weight > 0:
                rand_value = random.random() * total_weight
                cumulative_weight = 0
                chosen_field = field_types[0]  # Fallback
                
                for field_type, weight in field_priorities.items():
                    cumulative_weight += weight
                    if rand_value <= cumulative_weight:
                        chosen_field = field_type
                        break
                
                final_assignment[position] = chosen_field
                conflict_resolution_stats['resolved_randomly'] += 1
    
    # Umverteilung: Versuche überzählige Felder auf benachbarte Positionen zu verteilen
    for field_type, desired_pos_list in desired_positions.items():
        assigned_count = sum(1 for pos, assigned_type in final_assignment.items() if assigned_type == field_type)
        missing_count = len(desired_pos_list) - assigned_count
        
        if missing_count > 0:
            # Finde alternative Positionen in der Nähe
            for _ in range(missing_count):
                alternative_pos = find_alternative_position(final_assignment, desired_pos_list, max_fields)
                if alternative_pos is not None:
                    final_assignment[alternative_pos] = field_type
                    conflict_resolution_stats['redistributed'] += 1
    
    # Fülle verbleibende Positionen mit 'normal'
    for position in range(max_fields):
        if position not in final_assignment:
            final_assignment[position] = 'normal'
    
    # Debug-Info ausgeben (optional)
    if current_app and current_app.config.get('DEBUG_SPECIAL_FIELDS'):
        current_app.logger.info(f"Feld-Verteilung berechnet: {conflict_resolution_stats['total_conflicts']} Konflikte, "
                               f"{conflict_resolution_stats['resolved_randomly']} zufällig gelöst, "
                               f"{conflict_resolution_stats['redistributed']} umverteilt")
    
    return final_assignment


def find_alternative_position(final_assignment, preferred_positions, max_fields):
    """
    Findet eine alternative Position für ein Feld in der Nähe der bevorzugten Positionen
    """
    # Suche in der Nähe der bevorzugten Positionen
    for preferred_pos in preferred_positions:
        # Suche in zunehmendem Abstand um die bevorzugte Position
        for distance in range(1, 10):  # Maximal 10 Felder Abstand
            for direction in [-1, 1]:  # Links und rechts
                alt_pos = preferred_pos + (direction * distance)
                
                # Prüfe ob Position gültig und verfügbar ist
                if (0 < alt_pos < max_fields - 1 and  # Nicht Start oder Ziel
                    alt_pos not in final_assignment):
                    return alt_pos
    
    # Fallback: Suche irgendeine freie Position
    for position in range(1, max_fields - 1):
        if position not in final_assignment:
            return position
    
    return None


def _parse_barrier_config(target_numbers):
    """
    Parst die target_numbers Konfiguration und bestimmt den Modus
    
    Args:
        target_numbers: Liste oder String mit Ziel-Zahlen
        
    Returns:
        dict: Parsed configuration with mode, numbers, display_text
    """
    if isinstance(target_numbers, str):
        target_str = target_numbers.strip()
    elif isinstance(target_numbers, list):
        # Convert list to string for parsing
        target_str = ','.join(str(x) for x in target_numbers)
    else:
        target_str = "4,5,6"  # Default
    
    # Check for maximum mode (starts with -)
    if target_str.startswith('-'):
        try:
            max_number = int(target_str[1:])
            max_number = min(max(max_number, 1), 6)  # Clamp between 1 and 6
            return {
                'mode': 'maximum',
                'numbers': list(range(1, max_number + 1)),  # 1 to max_number
                'max_number': max_number,
                'min_number': 1,
                'display_text': f"Würfle höchstens eine {max_number}!"
            }
        except ValueError:
            pass  # Fall through to other modes
    
    # Check for minimum mode (ends with +)
    if target_str.endswith('+'):
        try:
            min_number = int(target_str[:-1])
            min_number = min(max(min_number, 1), 6)  # Clamp between 1 and 6
            return {
                'mode': 'minimum',
                'numbers': list(range(min_number, 7)),  # min_number to 6
                'min_number': min_number,
                'display_text': f"Würfle mindestens eine {min_number}!"
            }
        except ValueError:
            pass  # Fall through to exact mode
    
    # Exact numbers mode
    try:
        numbers = [int(x.strip()) for x in target_str.split(',') if x.strip()]
        numbers = [n for n in numbers if 1 <= n <= 6]  # Filter valid dice numbers
        if not numbers:
            numbers = [4, 5, 6]  # Default
            
        # Sort numbers for consistent display
        numbers = sorted(numbers)
        
        if len(numbers) == 1:
            display_text = f"Würfle eine {numbers[0]}!"
        elif len(numbers) == 2:
            display_text = f"Würfle eine {numbers[0]} oder {numbers[1]}!"
        else:
            display_text = f"Würfle eine {', '.join(str(n) for n in numbers[:-1])} oder {numbers[-1]}!"
            
        return {
            'mode': 'exact',
            'numbers': numbers,
            'min_number': min(numbers),
            'display_text': display_text
        }
    except ValueError:
        # Fallback
        return {
            'mode': 'exact',
            'numbers': [4, 5, 6],
            'min_number': 4,
            'display_text': "Würfle eine 4, 5 oder 6!"
        }

def _check_barrier_dice_roll(dice_roll, barrier_config):
    """
    Prüft ob ein Würfelwurf die Barrier-Bedingung erfüllt
    
    Args:
        dice_roll: Die gewürfelte Zahl (kann durch Bonus-Würfel über 6 sein)
        barrier_config: Die Barrier-Konfiguration
        
    Returns:
        bool: True wenn befreit, False wenn noch blockiert
    """
    mode = barrier_config.get('mode', 'exact')
    
    if mode == 'minimum':
        # Bei 4+ bedeutet: würfle mindestens 4 (auch 7, 8, 9, etc. mit Bonus)
        min_number = barrier_config.get('min_number', 4)
        return dice_roll >= min_number
    elif mode == 'maximum':
        # Bei -3 bedeutet: würfle höchstens 3
        max_number = barrier_config.get('max_number', 3)
        return dice_roll <= max_number
    else:
        # Exakte Zahlen: muss in der Liste sein
        return dice_roll in barrier_config['numbers']

def clear_field_distribution_cache():
    """
    Löscht den Cache für die Feld-Verteilung (z.B. nach Konfigurations-Änderungen)
    """
    global _field_distribution_cache, _cache_max_fields
    _field_distribution_cache = None
    _cache_max_fields = None
    
    # Prüfe ob FieldConfiguration-Daten existieren
    try:
        field_configs = FieldConfiguration.get_all_enabled()
        if field_configs:
            current_app.logger.info(f"Cache geleert. {len(field_configs)} Feld-Konfigurationen verfügbar.")
            
            # DEBUG: Logge Minigame-Konfiguration
            minigame_config = next((c for c in field_configs if c.field_type == 'minigame'), None)
            if minigame_config:
                current_app.logger.info(f"Minigame-Feld: aktiviert={minigame_config.is_enabled}, "
                                       f"typ={minigame_config.frequency_type}, "
                                       f"wert={minigame_config.frequency_value}")
            else:
                current_app.logger.warning("Keine Minigame-Feld-Konfiguration gefunden!")
        else:
            current_app.logger.warning("Cache geleert, aber keine FieldConfiguration-Daten gefunden!")
    except Exception as e:
        current_app.logger.error(f"Fehler beim Prüfen der FieldConfiguration: {e}")


def get_field_type_at_position(position):
    """
    Bestimmt den Feldtyp basierend auf der Position unter Verwendung des intelligenten
    Konflikt-Auflösungs-Algorithmus mit Caching für bessere Performance
    """
    global _field_distribution_cache, _cache_max_fields
    
    max_fields = 73  # Standard-Wert
    
    # Cache prüfen und neu berechnen falls nötig
    if (_field_distribution_cache is None or 
        _cache_max_fields != max_fields):
        
        _field_distribution_cache = calculate_smart_field_distribution(max_fields)
        _cache_max_fields = max_fields
        
        # DEBUG: Logge Minigame-Positionen
        try:
            minigame_positions = [pos for pos, field_type in _field_distribution_cache.items() if field_type == 'minigame']
            if current_app:
                current_app.logger.info(f"Minigame-Felder auf Positionen: {sorted(minigame_positions)}")
        except:
            pass
    
    # Position aus Cache zurückgeben
    field_type = _field_distribution_cache.get(position, 'normal')
    
    # DEBUG: Logge wenn Minigame-Feld erkannt wird
    if field_type == 'minigame':
        try:
            if current_app:
                current_app.logger.info(f"MINIGAME-FELD ERKANNT auf Position {position}")
        except:
            pass
    
    return field_type


def get_field_config_for_position(position):
    """
    Gibt die FieldConfiguration für eine bestimmte Position zurück
    """
    field_type = get_field_type_at_position(position)
    return FieldConfiguration.get_config_for_field(field_type)


def handle_minigame_field(team, all_teams, game_session):
    """
    Behandelt das Landen auf einem Minigame-Feld - NEUE VERSION
    Triggert Admin-Auswahl statt automatisches Starten
    """
    try:
        import os
        
        # Lade Konfiguration  
        config_path = os.path.join(current_app.static_folder, 'field_minigames', 'config.json')
        if not os.path.exists(config_path):
            return {"success": False, "action": "none", "message": "Feld-Minigame Konfiguration nicht gefunden"}
        
        with open(config_path, 'r', encoding='utf-8') as f:
            config = json.load(f)
        
        field_config = config.get('field_minigames', {})
        if not field_config.get('enabled', True):
            return {"success": False, "action": "none", "message": "Feld-Minigames sind deaktiviert"}
        
        # Bestimme Minigame-Modus
        modes = field_config.get('modes', {})
        active_modes = [mode for mode, settings in modes.items() if settings.get('enabled', True)]
        
        if not active_modes:
            return {"success": False, "action": "none", "message": "Keine aktiven Minigame-Modi"}
        
        # NEU: Lasse Admin den Modus wählen - verwende erstmal 'pending' als Platzhalter
        selected_mode = 'pending'  # Admin wird wählen
        opponent_team = None  # Wird später bestimmt

        # NEU: Hole verfügbare Minispiele für Admin-Auswahl
        from app.admin.minigame_utils import get_available_content_from_folder
        from app.models import GameRound
        
        # Hole aktuelle Runde und deren Minigame-Ordner
        active_round = GameRound.get_active_round()
        if not active_round or not active_round.minigame_folder:
            return {"success": False, "action": "none", "message": "Keine aktive Runde oder Minigame-Ordner gefunden"}
        
        # Hole bereits gespielte IDs aus der Session
        played_ids = []
        if game_session.played_content_ids:
            played_ids = game_session.played_content_ids.split(',')
        
        # Hole verfügbare Minispiele für dieses Feld
        available_minigames = get_available_content_from_folder(
            active_round.minigame_folder.folder_path, 
            played_ids
        )
        
        if not available_minigames:
            return {"success": False, "action": "none", "message": "Keine verfügbaren Minispiele für dieses Feld"}
        
        # NEU: Setze Session-Daten für ADMIN-AUSWAHL (nicht automatisch starten)
        game_session.field_minigame_mode = selected_mode
        game_session.field_minigame_landing_team_id = team.id
        game_session.field_minigame_opponent_team_id = opponent_team.id if opponent_team else None
        game_session.field_minigame_content_id = None  # Noch nicht ausgewählt!
        game_session.field_minigame_content_type = None
        game_session.current_phase = 'FIELD_MINIGAME_SELECTION_PENDING'  # NEU: Warte auf Admin-Auswahl
        
        # Event erstellen
        event = GameEvent(
            game_session_id=game_session.id,
            event_type="field_minigame_selection_pending",
            description=f"Team {team.name} landete auf Minigame-Feld - wartet auf Admin-Auswahl ({selected_mode})",
            related_team_id=team.id,
            data_json=json.dumps({
                "field_type": "minigame",
                "mode": selected_mode,
                "landing_team_id": team.id,
                "opponent_team_id": opponent_team.id if opponent_team else None,
                "available_minigames_count": len(available_minigames),
                "pending_admin_selection": True
            })
        )
        db.session.add(event)
        
        # Vorbereite Rückgabe-Daten
        opponent_name = opponent_team.name if opponent_team else "alle anderen Teams"
        mode_name = modes.get(selected_mode, {}).get('name', selected_mode)
        
        return {
            "success": True,
            "action": "field_minigame_selection_pending",  # NEU: Anderer Action-Type
            "mode": selected_mode,
            "mode_name": mode_name,
            "landing_team": team.name,
            "opponent_team": opponent_name,
            "available_minigames": available_minigames,
            "minigame_folder": active_round.minigame_folder.folder_path,
            "message": f"🎮 Minigame-Feld! {team.name} vs {opponent_name} - Admin muss Spiel auswählen"
        }
        
    except Exception as e:
        current_app.logger.error(f"Fehler beim Behandeln des Minigame-Felds: {e}")
        return {"success": False, "action": "none", "message": f"Fehler beim Starten des Minigames: {str(e)}"}


def start_selected_field_minigame(game_session, selected_minigame_id, selected_mode=None):
    """
    Startet das vom Admin ausgewählte Feld-Minigame
    
    Args:
        game_session: Die aktuelle GameSession
        selected_minigame_id: ID des ausgewählten Minispiels (Dateiname ohne .json)
        selected_mode: Der gewählte Modus (team_vs_all oder team_vs_team)
    
    Returns:
        dict: Erfolg/Fehler Information
    """
    try:
        # Prüfe ob in der richtigen Phase
        if game_session.current_phase != 'FIELD_MINIGAME_SELECTION_PENDING':
            return {"success": False, "message": "Kein Minigame-Feld in Auswahl-Phase aktiv"}
        
        # Lade das Feld-spezifische Minispiel aus den statischen Dateien
        import os
        import json
        
        # Verwende den übergebenen Modus, falls verfügbar
        mode = selected_mode or game_session.field_minigame_mode
        if mode == 'pending' or not mode:
            return {"success": False, "message": "Modus noch nicht gewählt"}
            
        field_minigame_path = os.path.join(
            current_app.static_folder, 
            'field_minigames', 
            mode, 
            f"{selected_minigame_id}.json"
        )
        
        if not os.path.exists(field_minigame_path):
            return {"success": False, "message": f"Feld-Minispiel mit ID {selected_minigame_id} nicht gefunden"}
        
        # Lade Minispiel-Daten
        with open(field_minigame_path, 'r', encoding='utf-8') as f:
            selected_minigame = json.load(f)
        
        # Setze die Auswahl in der Session
        game_session.field_minigame_content_id = selected_minigame_id
        game_session.field_minigame_content_type = selected_minigame.get('type', 'game')
        game_session.current_minigame_name = selected_minigame.get('title', selected_minigame_id)
        game_session.current_minigame_description = selected_minigame.get('instructions', '')
        game_session.current_phase = 'FIELD_MINIGAME_TRIGGERED'
        
        # Spieler auslosen basierend auf player_count
        selected_players_data = {}
        player_count = selected_minigame.get('player_count', 1)
        
        # Hole die beteiligten Teams
        from app.models import Team
        
        if game_session.field_minigame_landing_team_id:
            landing_team = Team.query.get(game_session.field_minigame_landing_team_id)
            if landing_team:
                # Hole verfügbare Spieler für Auslosung
                selectable_players = landing_team.get_selectable_players()
                if selectable_players:
                    if player_count == -1:
                        # Ganzes Team
                        selected_players = selectable_players
                        # Tracking für alle Spieler aktualisieren
                        game_session._update_player_rotation_tracking(str(landing_team.id), selected_players)
                    elif len(selectable_players) >= player_count:
                        # Faire Rotation verwenden statt zufälliger Auswahl
                        selected_players = game_session._select_fair_rotation(str(landing_team.id), selectable_players, player_count)
                        # Tracking aktualisieren
                        game_session._update_player_rotation_tracking(str(landing_team.id), selected_players)
                    else:
                        selected_players = selectable_players  # Alle Spieler wenn weniger als benötigt
                        # Tracking für alle verfügbaren Spieler
                        game_session._update_player_rotation_tracking(str(landing_team.id), selected_players)
                    
                    # Erweitere Spielerdaten um alle nötigen Informationen für die Anzeige
                    current_app.logger.info(f"[DEBUG] Processing {len(selected_players)} players for team {landing_team.name}")
                    player_data_list = []
                    for player_name in selected_players:
                        player_info = {"name": player_name}
                        # Prüfe ob Spieler ein Foto hat
                        player_obj = landing_team.get_player_by_name(player_name)
                        current_app.logger.info(f"[DEBUG] get_player_by_name('{player_name}') returned: {player_obj}")
                        if player_obj:
                            player_info["has_photo"] = player_obj.get("has_photo", False) 
                            player_info["profile_image"] = player_obj.get("profile_image")
                            player_info["emoji"] = player_obj.get("emoji")
                            current_app.logger.info(f"[DEBUG] Final player_info for '{player_name}': {player_info}")
                        else:
                            current_app.logger.warning(f"[DEBUG] get_player_by_name('{player_name}') returned None!")
                        player_data_list.append(player_info)
                    
                    selected_players_data[landing_team.name] = player_data_list
        
        # Für team_vs_team Mode auch Gegner-Team
        if (game_session.field_minigame_mode == 'team_vs_team' and 
            game_session.field_minigame_opponent_team_id):
            opponent_team = Team.query.get(game_session.field_minigame_opponent_team_id)
            if opponent_team:
                selectable_players = opponent_team.get_selectable_players()
                if selectable_players:
                    if player_count == -1:
                        # Ganzes Team
                        selected_players = selectable_players
                        # Tracking für alle Spieler aktualisieren
                        game_session._update_player_rotation_tracking(str(opponent_team.id), selected_players)
                    elif len(selectable_players) >= player_count:
                        # Faire Rotation verwenden statt zufälliger Auswahl
                        selected_players = game_session._select_fair_rotation(str(opponent_team.id), selectable_players, player_count)
                        # Tracking aktualisieren
                        game_session._update_player_rotation_tracking(str(opponent_team.id), selected_players)
                    else:
                        selected_players = selectable_players
                        # Tracking für alle verfügbaren Spieler
                        game_session._update_player_rotation_tracking(str(opponent_team.id), selected_players)
                    
                    # Erweitere Spielerdaten um alle nötigen Informationen für die Anzeige
                    player_data_list = []
                    for player_name in selected_players:
                        player_info = {"name": player_name}
                        # Prüfe ob Spieler ein Foto hat
                        player_obj = opponent_team.get_player_by_name(player_name)
                        if player_obj:
                            player_info["has_photo"] = player_obj.get("has_photo", False) 
                            player_info["profile_image"] = player_obj.get("profile_image")
                            player_info["emoji"] = player_obj.get("emoji")
                        player_data_list.append(player_info)
                    
                    selected_players_data[opponent_team.name] = player_data_list
        
        # Für team_vs_all Mode: Lose von ALLEN anderen Teams Spieler aus
        elif game_session.field_minigame_mode == 'team_vs_all':
            # Hole alle Teams außer dem landenden Team
            from app.models import GameSession
            all_teams = Team.query.filter(
                Team.id != game_session.field_minigame_landing_team_id
            ).all()
            
            for team in all_teams:
                selectable_players = team.get_selectable_players()
                if selectable_players:
                    if player_count == -1:
                        # Ganzes Team
                        selected_players = selectable_players
                        # Tracking für alle Spieler aktualisieren
                        game_session._update_player_rotation_tracking(str(team.id), selected_players)
                    elif len(selectable_players) >= player_count:
                        # Faire Rotation verwenden statt zufälliger Auswahl
                        selected_players = game_session._select_fair_rotation(str(team.id), selectable_players, player_count)
                        # Tracking aktualisieren
                        game_session._update_player_rotation_tracking(str(team.id), selected_players)
                    else:
                        selected_players = selectable_players
                        # Tracking für alle verfügbaren Spieler
                        game_session._update_player_rotation_tracking(str(team.id), selected_players)
                    
                    # Erweitere Spielerdaten um alle nötigen Informationen für die Anzeige
                    player_data_list = []
                    for player_name in selected_players:
                        player_info = {"name": player_name}
                        # Prüfe ob Spieler ein Foto hat
                        player_obj = team.get_player_by_name(player_name)
                        if player_obj:
                            player_info["has_photo"] = player_obj.get("has_photo", False) 
                            player_info["profile_image"] = player_obj.get("profile_image")
                            player_info["emoji"] = player_obj.get("emoji")
                        player_data_list.append(player_info)
                    
                    selected_players_data[team.name] = player_data_list
        
        # Speichere die ausgelosten Spieler in der Session als JSON
        game_session.field_minigame_selected_players = json.dumps(selected_players_data)
        
        # Event erstellen  
        event = GameEvent(
            game_session_id=game_session.id,
            event_type="field_minigame_admin_selected",
            description=f"Admin wählte Feld-Minispiel '{selected_minigame.get('title', selected_minigame_id)}' für Feld-Minigame",
            data_json=json.dumps({
                "selected_minigame_id": selected_minigame_id,
                "selected_minigame_name": selected_minigame.get('title', ''),
                "mode": game_session.field_minigame_mode,
                "landing_team_id": game_session.field_minigame_landing_team_id,
                "opponent_team_id": game_session.field_minigame_opponent_team_id,
                "content": selected_minigame
            })
        )
        db.session.add(event)
        
        return {
            "success": True,
            "selected_minigame": selected_minigame,
            "message": f"Feld-Minispiel '{selected_minigame.get('title', selected_minigame_id)}' wurde gestartet"
        }
        
    except Exception as e:
        current_app.logger.error(f"Fehler beim Starten des ausgewählten Feld-Minigames: {e}")
        return {"success": False, "message": f"Fehler: {str(e)}"}


def handle_field_minigame_result(game_session, winning_team_id):
    """
    Behandelt das Ergebnis eines Feld-Minigames
    Belohnt das gewinnende Team mit Vorwärtsbewegung
    """
    try:
        if not game_session.field_minigame_landing_team_id:
            return {"success": False, "message": "Kein aktives Feld-Minigame"}
        
        current_app.logger.info(f"Processing field minigame result for mode: {game_session.field_minigame_mode}")
        
        # Lade Konfiguration
        config_path = os.path.join(current_app.static_folder, 'field_minigames', 'config.json')
        if not os.path.exists(config_path):
            current_app.logger.error(f"Config file not found: {config_path}")
            return {"success": False, "message": "Konfigurationsdatei nicht gefunden"}
            
        with open(config_path, 'r', encoding='utf-8') as f:
            config = json.load(f)
        
        field_config = config.get('field_minigames', {})
        mode_config = field_config.get('modes', {}).get(game_session.field_minigame_mode, {})
        
        current_app.logger.info(f"Mode config for {game_session.field_minigame_mode}: {mode_config}")
        
        if not mode_config:
            current_app.logger.error(f"No mode config found for mode: {game_session.field_minigame_mode}")
            # Use default values if mode config is missing
            mode_config = {'reward_forward': 5}
        
        # Prüfe ob das landende Team gewonnen hat
        landing_team = game_session.field_minigame_landing_team
        if not landing_team:
            current_app.logger.error(f"Landing team not found for ID: {game_session.field_minigame_landing_team_id}")
            return {"success": False, "message": "Team-Daten nicht gefunden"}
            
        won = (winning_team_id == game_session.field_minigame_landing_team_id)
        current_app.logger.info(f"Minigame result - Won: {won}, Landing team: {landing_team.name}, Winning team ID: {winning_team_id}")
        
        if won:
            # Team gewinnt - bewege vorwärts
            reward_forward = mode_config.get('reward_forward', 5)
            max_board_fields = current_app.config.get('MAX_BOARD_FIELDS', 72)
            
            old_position = landing_team.current_position
            new_position = min(old_position + reward_forward, max_board_fields)
            landing_team.current_position = new_position
            
            game_session.field_minigame_result = 'won'
            
            # Event erstellen
            event = GameEvent(
                game_session_id=game_session.id,
                event_type="field_minigame_completed",
                description=f"Team {landing_team.name} gewann das Feld-Minigame und bewegt sich {reward_forward} Felder vor",
                related_team_id=landing_team.id,
                data_json=json.dumps({
                    "result": "won",
                    "reward_forward": reward_forward,
                    "old_position": old_position,
                    "new_position": new_position,
                    "mode": game_session.field_minigame_mode
                })
            )
            db.session.add(event)
            
            result_message = f"🎉 {landing_team.name} gewinnt und bewegt sich {reward_forward} Felder vor!"
            
        else:
            # Team verliert - keine Bewegung
            game_session.field_minigame_result = 'lost'
            
            # Event erstellen
            event = GameEvent(
                game_session_id=game_session.id,
                event_type="field_minigame_completed",
                description=f"Team {landing_team.name} verlor das Feld-Minigame - keine Bewegung",
                related_team_id=landing_team.id,
                data_json=json.dumps({
                    "result": "lost",
                    "mode": game_session.field_minigame_mode
                })
            )
            db.session.add(event)
            
            result_message = f"❌ {landing_team.name} verliert - keine Bewegung"
        
        # Setze Phase zurück
        game_session.current_phase = 'FIELD_MINIGAME_COMPLETED'
        
        return {
            "success": True,
            "won": won,
            "team_name": landing_team.name,
            "old_position": old_position if won else landing_team.current_position,
            "new_position": landing_team.current_position,
            "reward_forward": reward_forward if won else 0,
            "message": result_message
        }
        
    except Exception as e:
        current_app.logger.error(f"Fehler beim Behandeln des Minigame-Ergebnisses: {e}")
        return {"success": False, "message": f"Fehler beim Verarbeiten des Ergebnisses: {str(e)}"}


def handle_special_field_action(team, all_teams, game_session, dice_info=None):
    """
    Hauptfunktion die nach einer Bewegung aufgerufen wird
    Prüft den Feldtyp und führt entsprechende Aktionen aus
    
    Args:
        team: Das Team das sich bewegt hat
        all_teams: Alle Teams in der Session
        game_session: Die aktuelle Spielsession
        dice_info: Optional - Informationen über den Würfelwurf
                   {"old_position": int, "new_position": int, "dice_roll": int, "bonus_roll": int, "total_roll": int}
    """
    field_type = get_field_type_at_position(team.current_position)
    
    if field_type == 'catapult_forward':
        return handle_catapult_forward(team, team.current_position, game_session, dice_info)
    elif field_type == 'catapult_backward':
        return handle_catapult_backward(team, team.current_position, game_session, dice_info)
    elif field_type == 'player_swap':
        return handle_player_swap(team, all_teams, game_session, dice_info)
    elif field_type == 'barrier':
        return handle_barrier_field(team, game_session)
    elif field_type == 'minigame':
        return handle_minigame_field(team, all_teams, game_session)
    else:
        # Kein Sonderfeld oder andere Felder (normale Felder, etc.)
        return {"success": False, "action": "none"}



def get_all_special_field_positions(max_fields=73):
    """
    Gibt alle Positionen der Sonderfelder zurück basierend auf der intelligenten
    Feld-Verteilung (verwendet den Cache)
    """
    # Verwende die gecachte Verteilung
    field_distribution = _field_distribution_cache
    if field_distribution is None:
        # Cache ist leer, berechne neu
        field_distribution = calculate_smart_field_distribution(max_fields)
    
    special_positions = {}
    
    # Gruppiere Positionen nach Feld-Typ
    for position, field_type in field_distribution.items():
        if field_type not in special_positions:
            special_positions[field_type] = []
        special_positions[field_type].append(position)
    
    # Sortiere Positionen innerhalb jedes Feld-Typs
    for field_type in special_positions:
        special_positions[field_type].sort()
    
    return special_positions


def get_field_statistics():
    """
    Gibt Statistiken über die aktuellen Feld-Konfigurationen zurück
    Verwendet die intelligente Feld-Verteilung
    """
    field_configs = FieldConfiguration.query.all()
    
    enabled_count = sum(1 for config in field_configs if config.is_enabled)
    disabled_count = len(field_configs) - enabled_count
    
    # Verwende die intelligente Feld-Verteilung
    total_fields = 73
    field_distribution = _field_distribution_cache
    if field_distribution is None:
        field_distribution = calculate_smart_field_distribution(total_fields)
    
    # Zähle Felder pro Typ
    field_counts = {}
    for position, field_type in field_distribution.items():
        field_counts[field_type] = field_counts.get(field_type, 0) + 1
    
    total_special_fields = 0
    
    # Erstelle Statistik-Objekte mit count und percentage
    field_distribution_stats = {}
    for field_type, count in field_counts.items():
        percentage = (count / total_fields * 100) if total_fields > 0 else 0
        field_distribution_stats[field_type] = {
            'count': count,
            'percentage': round(percentage, 1)
        }
        
        if field_type not in ['start', 'goal', 'normal']:
            total_special_fields += count
    
    return {
        'total_configs': len(field_configs),
        'enabled_configs': enabled_count,
        'disabled_configs': disabled_count,
        'total_fields': total_fields,
        'special_field_count': total_special_fields,
        'normal_field_count': field_counts.get('normal', 0),
        'field_distribution': field_distribution_stats,
        'special_positions': get_all_special_field_positions(total_fields),
        'conflict_free': True  # Neuer Status-Indikator
    }


def validate_field_conflicts():
    """
    Prüft auf Konflikte zwischen verschiedenen Feld-Konfigurationen
    Mit dem neuen Algorithmus sollten keine Konflikte mehr auftreten
    """
    # Da wir jetzt einen intelligenten Konflikt-Auflösungs-Algorithmus verwenden,
    # sollten normalerweise keine Konflikte mehr auftreten
    return []  # Keine Konflikte mehr!


def validate_field_configuration(config_data):
    """
    Validiert eine Feld-Konfiguration
    """
    errors = []
    
    if not config_data.get('field_type'):
        errors.append("Feld-Typ ist erforderlich")
    
    if not config_data.get('display_name'):
        errors.append("Anzeige-Name ist erforderlich")
    
    frequency_type = config_data.get('frequency_type', 'modulo')
    frequency_value = config_data.get('frequency_value', 0)
    
    if frequency_type == 'modulo' and frequency_value <= 0:
        errors.append("Modulo-Wert muss größer als 0 sein")
    
    if frequency_type == 'probability' and (frequency_value < 0 or frequency_value > 100):
        errors.append("Wahrscheinlichkeit muss zwischen 0 und 100 liegen")
    
    color_hex = config_data.get('color_hex', '')
    if not color_hex.startswith('#') or len(color_hex) != 7:
        errors.append("Farbe muss ein gültiger Hex-Code sein (#RRGGBB)")
    
    return errors


def regenerate_field_distribution():
    """
    Hilfsfunktion um eine neue Feld-Verteilung zu generieren
    (z.B. nach Konfigurations-Änderungen im Admin-Interface)
    """
    clear_field_distribution_cache()
    return calculate_smart_field_distribution(73)


def force_field_cache_refresh():
    """
    Erzwingt eine Neuerstellung des Feld-Caches und loggt Debug-Informationen
    """
    clear_field_distribution_cache()
    
    # Erzwinge Neuberechnung durch Aufruf von get_field_type_at_position
    get_field_type_at_position(1)  # Trigger cache rebuild
    
    global _field_distribution_cache
    if _field_distribution_cache:
        # Zeige Minigame-Positionen
        minigame_positions = [pos for pos, field_type in _field_distribution_cache.items() if field_type == 'minigame']
        if current_app:
            current_app.logger.info(f"Cache erneuert. Minigame-Felder: {sorted(minigame_positions)}")
        return sorted(minigame_positions)
    else:
        if current_app:
            current_app.logger.error("Cache konnte nicht erstellt werden!")
        return []