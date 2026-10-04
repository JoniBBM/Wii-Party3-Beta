Was muss verbessert werden
--------------------------
- Geschäftslogik in View-Funktionen verteilt (admin/main/teams), schwer testbar und dupliziert.

Wie wird es gemacht
-------------------
- Services extrahieren:
  - `dice_service`: würfeln, Bonus, Ziel-Logik, Spezialfelder-Trigger, Events.
  - `field_service`: Konfigurationen, Positionen, Aktionen, Barrier-Check.
  - `session_service`: Phasen, Dice-Order, Abschluss, Wechsel Runde.
  - `content_service`: Auswahl (random/plan), played-Tracking, Minigame/Frage laden.
  - `question_service`: Antworten, Platzierungen, Bonusvergabe.
  - `team_service`: Profile/Mitglieder/Setup/Status.
  - `event_service`: einheitliche Event-Erzeugung, Schemata.
  - `welcome_service`: Registrierung, Teamaufteilung, Team-Erzeugung.
- Jede Service-Funktion hat klaren Input/Output; Exceptions für Fehlerfälle.

ToDos
-----
- Minimale Service-Skelette anlegen und Routen schrittweise umstellen.
- Unit-Tests für Services zuerst (Bottom-Up), danach API-Integrationstests.
