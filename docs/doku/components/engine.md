---
name: Spiel-Engine
type: module
layer: logik
path: packages/shared/src/engine/
tech: [typescript]
provides:
  - call applyCommand(Zustand, Befehl, Akteur, Kontext) → neuer Zustand + Effekte + Protokolltext
  - call createGame() – neues, leeres Spiel in der Lobby
  - call projectState(Zustand, Sitzung) – gefilterte Sicht je Rolle
  - call mayExecute() / COMMAND_ROLES – wer welchen Befehl schicken darf
  - call NON_UNDOABLE / NON_UNDOABLE_FROM_TEAMS – was nicht auf den Rückgängig-Stapel kommt
  - call effectDuration() – geschätzte Animationsdauer auf dem Beamer
  - call tempoStatus() / suggestSetup() / estimateRange() – Spiel-Tempo und Dauer-Schätzung
uses:
  - spielmodell: call "Typen, Befehls-Schemas, Standardregeln, Zufall, Antwortvergleich, Begriffe je Welt"
  - spielfeld: call "Brett erzeugen, Sonderfeld-Mengen für die Tempo-Schätzung"
files:
  - index.ts: Einstieg der Engine. Nimmt einen Befehl entgegen, prüft die Rolle, verteilt ihn an den passenden Teil (Teams, Inhalte, Würfeln, Tempo) und erledigt selbst Spielstart, Spielende, Neustart, Ablaufplan und das Übernehmen neuer Einstellungen.
  - tx.ts: Arbeitsumgebung eines einzelnen Befehls – Kopie des Spielstands, gesammelte Effekte, Kurzbeschreibung fürs Rückgängig. Enthält Hilfen wie „Fehler melden“, „Eintrag in den Ereignis-Ticker“ und „für welches Team gilt der Befehl“.
  - permissions.ts: Rechtetabelle – welche Rolle welchen der rund 45 Befehle schicken darf, und welche Befehle nicht rückgängig gemacht werden (Countdown, Tempo, Antworten und Buzzer der Teams).
  - project.ts: Sicht je Rolle („Projektion“). Entfernt vor dem Versand Lösungen, Notizen, fremde Antworten, PINs, Beitritts-Schlüssel sowie Spieldauer und Tempo, je nachdem wer zuschaut.
  - teams.ts: Lobby, Teams und Spieler – anmelden, Teams bilden und mischen, PIN neu erzeugen, Position korrigieren, aus Sperre/Krater/Vulkan befreien. Begrenzt die Zahl der Spieler gegen Überflutung.
  - content.ts: Ablauf eines Inhalts – Auswahl (Plan, Zufall, Liste, spontan), Countdown, Antworten, Buzzer, automatische und manuelle Bewertung, Platzierung, Ergebnis mit Bonuswürfeln und Start der Würfelrunde.
  - dice.ts: Würfelrunde – Wurf, Ziehen, Sonderfelder, Mutproben (Liane, Fässer oder Kisten, Lavahöhle), Kraterloch, Vulkan-Inneres, Vulkandruck und Ausbruch, Feld-Minispiele, Siegeswurf und Reaktion der Figur nach jedem Zug.
  - draw.ts: Faire Auslosung der Spieler für Spiele – wer seltener dran war, kommt zuerst; „neu auslosen“ nimmt die letzte Auslosung zurück.
  - durations.ts: Geschätzte Dauer jeder Beamer-Animation. Daraus berechnet die Engine, ab wann das nächste Team würfeln darf („Moment …“).
  - tempo.ts: Spiel-Tempo – schätzt Spieldauer und Rundenzahl, schlägt im Assistenten Spielfeld-Länge und Sonderfelder vor und legt je Würfelrunde ein Tempo fest, das Würfel und Gefahren unauffällig neigt.
  - engine.test.ts: Automatische Tests für alle Abläufe (Lobby, Fragen, Spiele, Würfeln, Sonderfelder, Mutproben, Sichtschutz, Tempo, Assistent).
zone: intern
exposure: none
security:
  - access: Rechtetabelle je Befehl (Regie/Admin, Moderator, Team, Spieler, Gast); feinere Prüfungen in der Engine selbst, z. B. „nur das eigene Team“ und „nur wer gerade dran ist“
  - privacy: Projektion je Rolle – Lösungen erst nach der Auflösung, fremde Antworten vor der Auflösung ohne Inhalt und Zeitpunkt, PINs nur fürs eigene Team, Beitritts-Schlüssel nur für die Regie, Spieldauer und Tempo nur für die Spielleitung, Gäste ohne Fotos und Ticker
  - input: Befehle kommen bereits geprüft an (Schemas im Spielmodell); die Engine prüft zusätzlich Spielphase, Reihenfolge und Grenzen (z. B. höchstens 200 Spieler, 40 je Team, Fotos nur über den Server)
  - other: Keine Uhr, kein Zufall und kein Speicher von außen – alles kommt über den Kontext; dadurch sind Abläufe wiederholbar und testbar
  - ratelimit: Leere Befehle (nichts geändert, doppelter Buzzer) werden als „nichts zu tun“ markiert und weder gespeichert noch verschickt
---
Herz des Spiels: eine **reine Rechenfunktion**, die aus dem aktuellen Spielstand und einem Befehl (z. B. „würfeln“, „Antwort abgeben“, „Ergebnis zeigen“) den neuen Spielstand und eine Liste von **Effekten** macht. Effekte beschreiben, *was* passiert ist („Würfel 4 + 2“, „Figur läuft 6 Felder“, „Katapult“), damit der Beamer es inszenieren und die Handys vibrieren können.

**Wo sie läuft:** Ausgeführt wird die Engine nur auf dem Server ([[echtzeit]] nimmt Befehle an, die Laufzeit in [[server]] speichert das Ergebnis). Die Weboberflächen nutzen einzelne Rechenteile davon – etwa die Dauer-Schätzung im Einrichtungs-Assistenten und die Tempo-Anzeige der Regie. Warum Server und Browser denselben Code teilen: [[0001-gemeinsame-spiellogik-fuer-server-und-browser]].

**Spielphasen:** Lobby → Leerlauf → Inhalt (Einführung, offen, geschlossen, aufgelöst) → Ergebnis → Würfelrunde → Rundenende → … → beendet. Der genaue Ablauf einer Runde steht in [[spielrunde]].

**Rechte und Sichtschutz:** Jeder Befehl wird zuerst gegen die Rechtetabelle geprüft. Danach entscheidet die Engine im Detail, ob z. B. ein Team gerade dran ist. Was ein Gerät *sehen* darf, regelt die Projektion: Regie sieht alles; der Moderator alles außer PINs und Beitritts-Schlüsseln (ein weitergegebener Moderator-Link soll keine Team-Zugänge erzeugen können); Teams und Beamer bekommen keine Lösungen vor der Auflösung, keine fremden Antworten und keine fremden PINs, und weder Spieldauer noch Tempo. Nicht freigegebene Beamer und Geräte ohne Anmeldung (Gäste) sehen zusätzlich keine Fotos und keinen Ereignis-Ticker.

**Fairness:** Gleichstände in der Würfelreihenfolge werden ausgelost; Spieler für Spiele werden reihum ausgelost; das Spiel-Tempo gilt je Würfelrunde für alle Teams gleich und hängt nie vom Platz eines Teams ab – siehe [[0002-spiel-tempo-fair-und-unauffaellig]].

**Begriffe je Welt:** Ticker-Texte nennen Mutproben und Orte mit dem Namen der gewählten Welt (Liane/Ranke/Greifhaken, Vulkan-Inneres/Nether/Alien-Höhle …); die Regeln selbst sind in allen Welten gleich – siehe [[0003-welten-teilen-regeln-und-spielfeld]].

**Erweitern:** Ein neuer Inhaltstyp braucht Einträge im [[spielmodell]] (Katalog, Typ, Schema, Aufbau), die Auswertung hier in der Inhaltslogik, das Verbergen der Lösung in der Projektion und Oberflächen in [[regie]], [[handy]] und [[beamer]]. Ein neues Sonderfeld braucht Katalogeintrag und Häufigkeit im [[spielfeld]], die Wirkung in der Würfellogik, ggf. eine neue Effektart mit Dauer und den Auftritt auf dem Beamer.
