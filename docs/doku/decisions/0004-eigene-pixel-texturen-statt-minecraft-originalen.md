---
title: Eigene Pixel-Texturen statt Minecraft-Originalen
date: 2026-10-23
status: accepted
affects: [blockwelt, figuren, medien, stimmung]
---
**Kontext:** Die Blockwelt soll aussehen wie Minecraft („optisch 1:1“). Die Original-Texturen, -Geräusche, -Musik und das Logo von Minecraft sind aber urheberrechtlich geschützt. Das Repository ist öffentlich auf GitHub – alles, was dort liegt, wird mit verteilt.

**Entscheidung:** In der Blockwelt steckt **kein einziges Original-Bild, -Geräusch oder -Musikstück** von Minecraft.

- **Texturen** werden beim Laden im Browser von einem kleinen Pixel-Maler gezeichnet: jede Kachel 16×16 Pixel, eigene Muster im typischen Blockspiel-Stil (Gras, Erde, Stein, Holz, Laub, Wasser, Lava, Netherrack, Wolle, TNT …). Es gibt dafür keine Bilddateien im Projekt ([[blockwelt]]).
- **Figuren, Tiere und Mobs** sind Kastenmodelle mit selbst gemalten Pixel-Häuten ([[figuren]], [[blockwelt]]). Einige Wesen sind eigene Entwürfe mit eigenem Namen (der explodierende „Knaller“, der „Glutgeist“ im Nether).
- **Musik** sind freie CC0-Stücke von OpenGameArt im ruhigen Blockspiel-Geist – ausdrücklich keine Original-Musik und keine Bearbeitungen davon ([[medien]]). Kommentator-Sprüche der Blockwelt sind eigene Texte ([[stimmung]]).
- **Schrift** der Pixel-Oberfläche ist die freie Pixelify Sans (SIL Open Font License).

**Folgen:**
- Der Look ist erkennbar „Minecraft-artig“, aber rechtlich eigenständig; das Repository bleibt öffentlich nutzbar.
- Keine Texturdateien bedeutet keine Lizenzpflege und kaum zusätzliche Downloadgröße.
- Eine neue Blocksorte heißt: ein neues Muster im Pixel-Maler zeichnen. Zum Prüfen gibt es im Entwicklungsserver die Vorschauseite `blocks-preview.html` mit allen Kacheln, Mobs und Figuren ([[szene]]).
- Wer später Material ergänzt, darf ebenfalls nichts aus dem Original-Spiel übernehmen (auch keine „nachgezeichneten“ Originaltexturen).
