---
title: "Spiel-Tempo: fair und unauffällig"
date: 2026-10-23
status: accepted
affects: [engine, regie, moderator, spiel-einrichten]
---
**Kontext:** Ein Spieleabend hat meist ein festes Zeitfenster (z. B. bis zum Abendessen). Wie lange ein Würfelspiel dauert, hängt aber stark vom Würfelglück ab – mal ist nach 45 Minuten Schluss, mal zieht es sich über zwei Stunden. Die Spielleitung soll eine Wunschdauer vorgeben und das Spiel unterwegs beschleunigen oder verlangsamen können, **ohne** dass die Teams es merken oder sich benachteiligt fühlen.

**Entscheidung:** Ein Algorithmus legt zu Beginn **jeder Würfelrunde** ein Tempo zwischen „deutlich langsamer“ und „deutlich schneller“ fest:

- **Für alle Teams gleich**: Das Tempo hängt nur von bisheriger Spielzeit, gemessener Rundendauer und dem Vorankommen des führenden Teams ab – nie davon, wer vorne oder hinten liegt.
- **Sanft**: Würfel zeigen bei schnellem Tempo etwas öfter hohe Augen (im Schnitt höchstens ca. 4,4 statt 3,5), jede Zahl bleibt möglich; bei Tempo „normal“ ist es ein ganz gewöhnlicher Würfel. Dazu brechen Fässer/Kisten etwas seltener ein und Katapulte werfen etwas weiter vor bzw. weniger weit zurück – bei langsamem Tempo umgekehrt.
- **Unsichtbar**: Handys und Beamer bekommen Spieldauer und Tempo gar nicht erst (Projektion in der [[engine]]); Tempo-Änderungen erscheinen nicht im Ereignis-Ticker und sind kein Rückgängig-Schritt.
- **Echte Würfe bleiben echt**: Augenzahlen, die die Regie von Hand einträgt, werden nicht verändert.
- **Abschaltbar**: Im Assistenten lässt sich die Spieldauer überspringen („manuell eingerichtet“) – dann gibt es nur reine Zufallswürfe ohne Algorithmus und ohne Tempo-Knöpfe.
- Der Vorschlag im Assistenten plant mit leicht beschleunigtem Tempo, damit das Tempo nach beiden Seiten Luft hat.

**Folgen:**
- Ein Spiel lässt sich unauffällig um etwa ein Drittel verkürzen oder um ein Viertel verlängern (Standard-Spielfeld mit 72 Feldern, 4 Teams: ca. 60–115 statt ca. 80 Minuten). Für deutlich kürzere Spiele braucht es ein kürzeres Spielfeld – die Tempo-Karte sagt das.
- Die Startwerte (Felder je Runde, Rundendauer, Wartezeit auf den Siegeswurf) stammen aus Simulationen; während des Spiels lernt die Schätzung aus den echten Runden dazu.
- Regie und Moderator sehen Spielzeit, Restdauer und ob das Spiel im Plan liegt ([[regie]], [[moderator]]); der Ablauf beim Einrichten steht in [[spiel-einrichten]].
