---
title: Regie während einer Frage
url: /regie
order: 50
components: [regie, echtzeit]
image: assets/screens/regie-live.webp
hotspots:
  - 19.8,12.9,10.7,3.1: regie, flow:spielrunde "Phase der Runde: gerade wird geantwortet"
  - 50,29.6,16.5,4: echtzeit, engine "Zeit anhalten oder um 15 Sekunden ändern"
  - 43.6,68.1,15.1,4.9: echtzeit, engine, flow:spielrunde "Keine weiteren Antworten annehmen"
  - 59.3,67.4,11.2,6.2: echtzeit, engine, flow:spielrunde, flow:befehl-und-spielstand "Richtige Antwort auf Beamer und Handys zeigen"
  - 33.2,68.1,9.9,4.9: echtzeit, engine "Frage ohne Wertung abbrechen"
  - 74.5,25.5,22.6,4: engine "Spiel-Tempo: das Spiel unauffällig verlangsamen oder beschleunigen"
  - 49,36.8,21.4,26.4: echtzeit, flow:spielrunde "Antworten der Teams – live, mit Antwortzeit"
  - 73.4,42.9,24.9,29: regie "Rangliste – Team antippen für Details und Korrekturen"
  - 90,82.5,6.9,4: regie, show, screen:regie-beamer "Alle Beamer-Regler öffnen"
  - 0.8,8.9,14.9,4.4: regie, screen:regie-live "Live: das laufende Spiel steuern"
  - 0.8,13.8,14.9,4.4: regie, screen:regie-beamer "Beamer fernsteuern und freigeben"
  - 0.8,23.6,14.9,4.4: regie, screen:regie-einrichten "Alle Einstellungen des Spiels"
  - 1.1,84,14.4,4.4: beamer, screen:beamer "Beamer-Ansicht in neuem Fenster öffnen"
  - 1.1,89.3,14.4,4: moderator, screen:moderator "Moderator-Ansicht öffnen"
  - 56.8,1.3,17.8,4.4: regie "Alle Einstellungen durchsuchen (Strg/⌘+K)"
  - 75.4,1.5,19.3,4: engine, echtzeit, flow:befehl-und-spielstand "Letzten Schritt zurücknehmen"
---
Die Schaltzentrale während des Spiels. Oben steht, was gerade passiert (hier: eine Frage läuft), darunter die Knöpfe für den nächsten Schritt. Rechts: Spiel-Tempo, Rangliste und eine Kurzsteuerung für den Beamer. Jeder Knopf schickt einen Befehl an den Server, der den neuen Spielstand an alle Geräte verteilt ([[befehl-und-spielstand]]). Ablauf einer Runde: [[spielrunde]].
