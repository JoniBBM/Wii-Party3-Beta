---
title: Welten teilen Regeln und Spielfeld
date: 2026-10-23
status: accepted
affects: [spielmodell, spielfeld, engine, show, handy, regie, beamer]
---
**Kontext:** Neben der tropischen Insel sollte es weitere Welten geben – zuerst die **Blockwelt** im Minecraft-Stil, dann das **Weltall**. Würde jede Welt eigene Regeln, eigene Felder oder einen eigenen Weg bekommen, müssten Engine, Brett-Editor, Assistent, Tests und Anleitungen mehrfach gepflegt werden, und jede Verbesserung müsste dreimal gebaut werden.

**Entscheidung:** Eine Welt ist **nur Optik und Sprache**. Pro Spiel wird sie in den Einstellungen gewählt (Insel, Blockwelt oder Weltall).

- **Gleich in allen Welten:** Regeln, Spielfeld und Inselplan (Lage von Liane, Fässern, Lavahöhle, Kraterloch), Befehle, Spielablauf, Einstellungen und Tests.
- **Je Welt verschieden:** 3D-Gelände, Figuren, Tiere, Auftritte der Sonderfelder, Musik, Kommentator-Sprüche, Spielerklärung und der Look von Handys und Beamer-Einblendungen.
- **Begriffe zentral:** Die Namen der Mutproben, Sonderfelder und Orte stehen an einer Stelle im [[spielmodell]] (Insel: Liane, Fässer oder Kisten, Lavahöhle, Vulkan-Inneres · Blockwelt: Ranke, Nether, Schleimblock, Knaller, Teleport-Perle, Spinnennetz · Weltall: Greifhaken, Kapseln oder Kisten, Kristallhöhle, Alien-Höhle, Jetpack, Schwarzes Loch, Teleporter, Energiekäfig, Wurmloch). Ereignis-Ticker der [[engine]], [[handy]], [[regie]] (inkl. Einstellungssuche) und [[beamer]] benutzen diese Liste.

**Folgen:**
- Neue Welten kosten Grafik- und Tonarbeit, aber keine Regel- oder Testarbeit; Wünsche und Fehlerbehebungen werden für alle Welten zugleich umgesetzt.
- Die Einstellungssuche der Regie findet die Begriffe aller Welten („Nether“ findet das Vulkan-Innere) und zeigt den Namen der aktuellen Welt.
- Wechselt die Spielleitung die Welt mitten im Spiel, bleiben Spielstand und Positionen gültig.
- Die 3D-Bausteine der Welten teilen Kamera, Regie der Effekte und Figurenlogik; nur die Optik wird ausgetauscht.
