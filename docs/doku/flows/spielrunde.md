---
name: Eine Spielrunde
trigger: Die Spielleitung wählt in der Regie den nächsten Inhalt
actors: [spielleitung, team]
steps:
  - == Auswahl ==
  - spielleitung -> regie: Nächsten Inhalt wählen (Plan, Zufall, Liste oder spontan)
  - regie -> echtzeit: Befehl „Inhalt wählen“
  - echtzeit -> engine: Befehl ausführen
  - note engine: Runde +1, bei Spielen Spieler fair auslosen, Bonuswürfel zurücksetzen
  - engine --> echtzeit: Neuer Spielstand + Effekte
  - echtzeit ->> regie: Voller Spielstand mit Lösung
  - echtzeit ->> moderator: Spielstand mit Lösung (ohne PINs)
  - echtzeit ->> beamer: Spielstand ohne Lösung, Effekte (Titel, Foto-Blasen der Ausgelosten)
  - echtzeit ->> handy: Spielstand ohne Lösung (wer ausgelost ist)
  - == Spielen ==
  - spielleitung -> regie: Antworten freigeben bzw. Spiel starten (Countdown startet)
  - regie -> echtzeit: Befehl „Inhalt öffnen“
  - echtzeit ->> handy: Antwortknöpfe, Eingabefeld oder Buzzer
  - echtzeit ->> beamer: Frage groß in der Mitte (ggf. vorgelesen), dann in der Tafel
  - team -> handy: Antwort antippen (Doppeltipp) bzw. Buzzer drücken
  - handy -> echtzeit: Befehl „Antwort abgeben“ bzw. „Buzzer“
  - echtzeit -> engine: Prüfen – eigenes Team, Antworten offen, noch nicht geantwortet
  - note engine: Haben alle geantwortet, schließt die Runde automatisch
  - echtzeit ->> regie: Wer was geantwortet hat
  - echtzeit ->> beamer: Nur „Team hat geantwortet“ (ohne Inhalt)
  - == Auflösung ==
  - spielleitung -> regie: Auflösen (bei Spielen stattdessen Platzierung eintippen)
  - regie -> echtzeit: Befehl „Auflösen“ bzw. „Platzierung“
  - echtzeit -> engine: Antworten werten und Platzierung berechnen
  - note engine: Freitext tolerant, Schätzfrage nach Abstand, Buzzer nach Wertung, sonst richtig vor falsch nach Zeit
  - echtzeit ->> beamer: Lösung groß mit den Teams, die richtig lagen
  - echtzeit ->> handy: „Richtig!“ oder „Leider falsch“ mit beiden Antworten
  - echtzeit ->> moderator: „Zum Vorlesen“ – Erklärung aus der Notiz
  - == Ergebnis und Bonuswürfel ==
  - spielleitung -> regie: Ergebnis zeigen
  - regie -> echtzeit: Befehl „Ergebnis zeigen“
  - echtzeit -> engine: Bonuswürfel nach Platz (bei Fragen nur für richtige), Würfelreihenfolge (Gleichstand ausgelost)
  - echtzeit ->> beamer: Plätze und Bonuswürfel
  - spielleitung -> regie: Würfelrunde starten
  - regie -> echtzeit: Befehl „Würfelrunde starten“
  - echtzeit -> engine: Bonuswürfel verteilen, Tempo der Runde für alle gleich festlegen
  - == Würfelrunde ==
  - echtzeit ->> handy: „Ihr seid dran“ (Vibration)
  - team -> handy: Würfeln per Knopf oder Schütteln
  - handy -> echtzeit: Befehl „Würfeln“
  - echtzeit -> engine: Wurf, Ziehen, Mutprobe oder Sonderfeld, Reaktion der Figur
  - note engine: Mutprobe unterwegs (Liane, Fässer oder Kisten, Lavahöhle) – Halt, Rest des Wurfs wird gemerkt
  - engine --> echtzeit: Effekte + Zeitpunkt, bis zu dem die Animationen laufen
  - echtzeit ->> beamer: Würfel, Laufen, Auftritt des Feldes, Reaktion
  - note beamer: Kamera folgt, Kommentator spricht, Musik wechselt
  - echtzeit ->> handy: Ergebnis; nächstes Team wartet „Moment …“ bis die Animation fertig ist
  - == Rundenende ==
  - note engine: Nach dem letzten Team – Verlauf speichern, Vulkandruck +1, ggf. Ausbruch
  - echtzeit ->> beamer: Rundenbilanz
  - spielleitung -> regie: Nächste Runde – zurück zur Auswahl
---
Eine Runde hat vier Schritte, die in der [[regie]] als Leiste zu sehen sind: **Auswahl → Spielen → Ergebnis → Würfeln**. Jeder Klick (in der Regie, am [[moderator]] oder am [[handy]]) ist ein **Befehl** an den Server. Der Server lässt ihn von der [[engine]] ausführen, speichert den neuen Spielstand und schickt jedem Gerät seine **gefilterte Sicht** sowie allen die **Effekte** für Animationen. Wie Befehle technisch laufen, steht in [[befehl-und-spielstand]].

**Wer sieht was:** Regie sieht alles; der Moderator alles außer PINs; [[beamer]] und Handys bekommen die Lösung erst mit der Auflösung und Antworten anderer Teams nur als „hat geantwortet“. Spieldauer und Tempo der Runde sehen nur Regie und Moderator.

**Spiele statt Fragen:** Bei Spielen gibt es keine Antworten am Handy. Die Spielleitung startet das Spiel (optional mit Countdown) und tippt danach die Platzierung ein; „Auflösen“ entfällt.

**Würfelrunde:** Die Teams würfeln in der Reihenfolge ihrer Platzierung. Die Regie kann für ein Team würfeln, einen echten Wurf eintragen, überspringen oder bei Mutproben das Ergebnis vorgeben. Ein Minispiel-Feld pausiert die Runde, bis die Regie Modus, Gegner und Ergebnis eingetragen hat. Damit Animationen nicht überlappen, sperrt der Server den nächsten Wurf, bis der Beamer voraussichtlich fertig ist (die Regie kann das übergehen).

**Rückgängig:** Die Regie kann die letzten Schritte zurücknehmen; Antworten und Buzzer der Teams sind dabei keine eigenen Schritte, Würfe schon.

Regeln im Detail: [[spielregeln]]. Bedienung: [[spielleitung]].
