---
name: Figuren, Würfel und Siegerehrung
type: module
layer: grafik
path: [packages/web/src/figure/, packages/web/src/board/pieces.ts, packages/web/src/board/tags.ts, packages/web/src/board/ceremony.ts, packages/web/src/board/dice3d.ts]
tech: [three.js, react]
zone: client
provides:
  - call makeFigure – Spielfigur passend zur Welt (Insel-Figur, Block-Figur, Astronaut) aus den Editor-Einstellungen
  - call FigureEditor, FigurePreview, FigureAvatar – Figuren-Editor und Vorschaubilder für Handy, Regie und Beamer-Oberfläche
  - call Pieces – Figuren auf dem Brett aufstellen, laufen, fliegen, reagieren lassen
  - call DiceOverlay, Ceremony – 3D-Würfel und Siegerehrung
uses:
  - spielmodell: call "Figuren-Einstellungen (Haut, Frisur, Augen …), Teamfarben, Stimmungen, Typen"
  - engine: call "DURATION – Dauer von Schritt und Flug, wie sie der Server für den Zug einplant"
  - spielfeld: call "Lage des Vulkans (Podest der Siegerehrung)"
  - insel: call "Feldpositionen und Geländehöhe, Kraterform"
  - blockwelt: call "Pixel-Maler und Kastenmodelle für die Block-Figur, Spinne und Netz als Käfig"
  - weltall: call "Energiekäfig als Käfig im Weltall"
  - auftritte: call "Konfetti und Feuerwerk der Siegerehrung"
  - stimmung: call "Geräusche der Siegerehrung"
  - szene: call "Kamera (Siegerehrung), Zeitsteuerung, Materialien"
  - web-grundlage: call "Welt des laufenden Spiels (Live-Zustand), Knöpfe des Editors"
files:
  - figures.ts: Wählt die Figur passend zur Welt des Spiels (Insel, Blockwelt, Weltall) – alle aus denselben Editor-Einstellungen.
  - figure3d.ts: Mii-artige Insel-Figur aus Grundkörpern (Augen, Mund, Frisuren, Zubehör) und die gemeinsamen Posen aller Figuren (Laufen, Jubeln, Fliegen, Schwimmen, Balancieren …); Hemd = Teamfarbe.
  - figureBlocks.ts: Block-Figur – Kastenmännchen mit selbst gemalter Pixel-Haut, gleiche Größe und gleiche Posen wie die Insel-Figur.
  - figureSpace.ts: Astronaut – Anzug in Teamfarbe mit Glashelm, durch den Gesicht und Frisur aus dem Editor zu sehen sind; gleiche Gelenke und Posen.
  - FigureEditor.tsx: Figuren-Editor fürs Handy (Hautton, Frisur, Haarfarbe, Augen, Mund, Zubehör, Körper, Hose, Zufall).
  - FigurePreview.tsx: Drehbare 3D-Vorschau einer Figur und kleine Standbilder (Avatare) für Listen, Rangliste und Beamer-Einblendungen.
  - pieces.ts: Figuren auf dem Brett – Aufstellung mit Kollisionsschutz, Laufen von Feld zu Feld, Fliegen, Käfig, Schwimmen, Kraterloch, Bewegung im Vulkan-Inneren, Reaktionen nach dem Zug, Vorführ-Figuren der Spielerklärung.
  - tags.ts: Namensschilder über den Figuren – scharf und immer gleich groß, nach der Nachbearbeitung in einer eigenen kleinen Szene gezeichnet.
  - ceremony.ts: Siegerehrung – Podest steigt aus dem Krater, die Besten fliegen aufs Treppchen, Scheinwerfer, Feuerwerk, Saltos, Kamerafahrt ums Podest.
  - dice3d.ts: 3D-Würfel als Einblendung vor der Welt – rollt ins Bild und bleibt mit der gewürfelten Zahl liegen; Bonuswürfel golden.
---
Die Spielfiguren der Teams in allen drei Welten – vom Figuren-Editor auf dem Handy bis zur Figur, die auf dem Beamer läuft, jubelt und aufs Siegerpodest fliegt.

**Eine Figur, drei Aussehen.** Jedes Team gestaltet seine Figur einmal im Editor (Hautton, Frisur, Augen, Mund, Zubehör, Körper, Hose); das Hemd hat immer die Teamfarbe, damit jedes Team sofort erkennbar ist. Je nach Welt wird daraus eine Mii-artige Insel-Figur, ein Kastenmännchen mit Pixel-Haut ([[blockwelt]]) oder ein Astronaut mit Glashelm ([[weltall]]). Alle drei haben dieselbe Größe, dieselben Gelenke und dieselben Posen – deshalb passen Kamera, Felder und alle Bewegungen in jeder Welt. Editor und Vorschaubilder werden auch auf dem Handy ([[handy]]), in der Regie ([[regie]]) und in den Beamer-Einblendungen ([[beamer]]) gezeigt.

**Figuren auf dem Brett.** Der Baustein stellt die Figuren auf ihre Felder und bewegt sie im Auftrag der Regie der Animationen ([[szene]]): laufen, fliegen, in den Käfig (Insel: Käfig, Blockwelt: Spinnennetz, Weltall: Energiekäfig), ins Wasser fallen und schwimmen, ins Kraterloch fallen und herausklettern, im Vulkan-Inneren von Platte zu Platte hüpfen und im Wirbel verschwinden. Die Dauer eines Schritts oder Flugs stammt aus der [[engine]] – so passt die Animation zu der Zeit, die der Server für den Zug einplant. Stehen mehrere Figuren auf einem Feld, bekommen sie Plätze nach ihrer echten Breite und weichen sich in jedem Bild sanft aus. Nach dem Zug zeigt die Figur eine Reaktion (Salto, Jubel, Winken, Schulterzucken, Ärger, Schreck, Trauer).

**Würfel und Siegerehrung.** Der 3D-Würfel rollt als Einblendung vor der Welt ins Bild. Bei der Siegerehrung steigt ein Podest aus dem Krater, die besten Teams fliegen hinauf, Scheinwerfer kreisen, Feuerwerk ([[auftritte]]) und Jubel ([[stimmung]]) setzen ein.
