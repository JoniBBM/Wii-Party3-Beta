---
name: Spielfeld & Inselplan
type: lib
layer: logik
path:
  - packages/shared/src/board.ts
  - packages/shared/src/island.ts
tech: [typescript]
provides:
  - call buildBoard(Länge, Startwert, Häufigkeiten) – Spielfeld mit Sonderfeldern erzeugen
  - call resizeBoard() / fieldCounts() / countFields() – Länge ändern, Mengen je Sonderfeld
  - call buildIslandPlan(Felderzahl) – Insel in 2D mit Weg und festen Stationen
  - call islandLandmarks() / withLandmarks() – Liane, Fässer, Lavahöhle und Kraterloch an ihren Platz setzen
uses:
  - spielmodell: call "Feldtypen, Häufigkeitsstufen, Zufall mit festem Startwert"
files:
  - board.ts: Verteilt die Sonderfelder auf ein Spielfeld (20–120 Felder, Standard 72) – nach Standardmengen je Länge und den gewählten Häufigkeiten (Aus … Sehr oft), möglichst ohne zwei Sonderfelder nebeneinander; Vulkanfelder oben am Berg, Totenköpfe in der Mitte. Gleicher Startwert und gleiche Länge ergeben immer dasselbe Brett.
  - island.ts: Die Insel als 2D-Plan – Küste, Lagune, Hafen, Fluss mit Wasserfall und Furt, Schlucht mit Hängebrücke, Vulkan mit Serpentinen und Kraterrand, dazu der Weg vom Hafen zum Gipfel. Legt daraus fest, welche Felder Liane, Fässer, Lavahöhle (mit Ausgang) und Kraterloch sind, und rückt Lianenfeld und Nachbarfeld so auseinander, dass ein breiter Bach dazwischen passt.
exposure: none
security:
  - other: Das Brett wird nur bewusst geändert (Editor, „Neu verteilen“, neue Länge) – nie zufällig während des Spiels; die festen Inselfelder lassen sich nicht verschieben
---
Erzeugt das **Spielbrett** und den **Inselplan**. Das Brett ist eine Liste von Feldtypen (Start, normale Felder, Sonderfelder, Gipfel) und wird in der Spielkonfiguration gespeichert. Der Inselplan ist reine Geometrie ohne Grafik: Er bestimmt, wo der Weg verläuft und welche Felder fest zu einer Station gehören.

**Feste Stationen:** Liane, Fässer oder Kisten am Wasserfall, Lavahöhle und Kraterloch liegen immer an derselben Stelle der Karte – egal wie lang das Brett ist. Die [[engine]] (Pflichthalt an Mutproben), der Brett-Editor der [[regie]] (Draufsicht) und die 3D-Welt ([[insel]], [[blockwelt]], [[weltall]]) rechnen alle mit demselben Plan; deshalb passen Spielregel und Bild immer zusammen. Alle Welten teilen diesen Plan – siehe [[0003-welten-teilen-regeln-und-spielfeld]].

**Häufigkeiten:** Je Sonderfeld (Minispiel, Katapult vorwärts/rückwärts, Platztausch, Sperre, Vulkanfeld, Totenkopf) wird ein Faktor gespeichert (Aus, Selten, Normal, Oft, Sehr oft). Er bleibt erhalten, wenn die Länge geändert oder neu verteilt wird. Der Einrichtungs-Assistent schlägt Länge und Häufigkeiten passend zur Wunschdauer vor (Tempo-Schätzung in der [[engine]]).

**Grenzen:** 20 bis 120 Felder; erstes Feld Start, letztes Feld Gipfel – das prüft das Schema im [[spielmodell]].
