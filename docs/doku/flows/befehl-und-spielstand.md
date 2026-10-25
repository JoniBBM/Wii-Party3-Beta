---
name: Befehl und Spielstand
trigger: Ein Team würfelt am Handy (genauso für jeden anderen Befehl aus Regie, Moderator oder Handy)
actors: [team]
steps:
  - team -> handy: tippt „Würfeln“ (oder schüttelt das Handy)
  - handy -> echtzeit: cmd dice.roll (Verbindung trägt das Team-Token)
  - note echtzeit: Mengenbremse je Verbindung, Rolle und Spiel des Geräts bestimmen, Befehl per Schema prüfen
  - echtzeit -> server: Befehl an die Laufzeit des Spiels
  - server -> engine: applyCommand(Spielstand, Befehl, Rolle)
  - note engine: prüft das Recht (nur das eigene Team, nur wenn es dran ist), würfelt, zieht, löst Sonderfelder aus
  - engine --> server: neuer Spielstand, Effekte, Text für den Verlauf
  - server -> datenbank: Spielstand speichern, Befehl protokollieren, Rückgängig-Schritt merken
  - server ->> echtzeit: state und effects
  - echtzeit -> engine: projectState – Sicht je Rolle (Regie, Moderator, Beamer, je Team, Gast)
  - echtzeit -->> beamer: state + effects (Würfel, Figur läuft, Auftritt, Kommentator)
  - echtzeit -->> handy: state in der Team-Sicht
  - echtzeit -->> regie: state inkl. Rückgängig-Text, presence
  - echtzeit --> handy: Antwort ok bzw. Fehlermeldung
  - == Rückgängig ==
  - regie -> echtzeit: undo
  - echtzeit -> server: letzten Stand wiederherstellen (bis 40 Schritte)
  - server ->> echtzeit: state + Effekt undo an alle
  - == Countdown ==
  - note server: läuft ein Countdown ab, schließt die Laufzeit die Antworten selbst (content.close)
---
Der zentrale Ablauf des ganzen Spiels: Ein Gerät schickt einen Befehl, der Server rechnet mit der gemeinsamen Spiel-Engine den neuen Stand aus, speichert ihn und verteilt ihn an alle.

Wichtig dabei:
- **Der Server entscheidet.** Geräte schicken nur Wünsche; ob ein Befehl erlaubt ist, prüft die [[engine]] anhand der Rolle, die der Server aus dem Zugang bestimmt hat.
- **Jedes Gerät bekommt seine eigene Sicht.** Lösungen sieht vor der Auflösung nur die Spielleitung, PINs bekommen weder Handys noch Beamer, fremde Antworten bleiben bis zur Auflösung verborgen. Gleiche Sichten werden je Rolle nur einmal berechnet.
- **Effekte steuern die Inszenierung.** Der Beamer spielt sie der Reihe nach ab; der Server kennt ihre ungefähre Dauer und lässt das nächste Team erst danach würfeln.
- **Leere oder doppelte Befehle** (z. B. zweimal derselbe Buzzer) werden weder gespeichert noch verteilt.
- **Jeder Stand wird sofort gespeichert** – ein Neustart des Servers verliert nichts außer den Rückgängig-Schritten.

Beteiligte Bausteine: [[echtzeit]], [[server]], [[engine]], [[datenbank]].
