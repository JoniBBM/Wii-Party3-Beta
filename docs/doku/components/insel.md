---
name: Insel-Welt und gemeinsames Gelände
type: module
layer: grafik
path: [packages/web/src/board/layout.ts, packages/web/src/board/ground.ts, packages/web/src/board/terrain.ts, packages/web/src/board/water.ts, packages/web/src/board/grass.ts, packages/web/src/board/props.ts, packages/web/src/board/landmarks.ts, packages/web/src/board/fields.ts, packages/web/src/board/sky.ts, packages/web/src/board/volcano.ts, packages/web/src/board/inside.ts, packages/web/src/board/worldfx.ts, packages/web/src/board/ambient.ts]
tech: [three.js, glsl]
zone: client
provides:
  - call Inselplan in 3D (buildLayout) und Höhenmodell (buildHeightfield) – Grundlage aller drei Welten
  - call Gelände, Wasser, Gras, Bepflanzung, Wahrzeichen, Himmel, Felder und Vulkan der Insel
  - call VolcanoInside – Vulkan-Inneres als eigene Szene (Vorlage für Nether und Alien-Höhle)
  - call Gemeinsame Shader-Bausteine (Wolkenschatten, Lichtnetze, Glühen) mit Farbparametern fürs Weltall
uses:
  - spielfeld: call "Inselplan – Küste, Weg, Fluss mit Wasserfall und Furt, Schlucht, Bach, Vulkan, feste Inselfelder"
  - spielmodell: call "Feldarten, Farben und Symbole der Felder (FIELD_INFO)"
  - szene: call "Modelle laden, Rauschen, Sichtachsen der Mutproben, statische Teile zusammenfassen"
  - auftritte: call "Partikel für Glut, Rauch, Lava und Ausbruch"
  - medien: http "GET /assets/models (Pflanzen, Felsen, Hafen- und Piraten-Teile)" [auth=none, tls, tunnel, im WLAN-Betrieb http]
files:
  - layout.ts: Inselplan in 3D – der gemeinsame 2D-Plan plus Höhen; Lage, Höhe und Richtung jedes Feldes, Weg auf Fässern, Brücke und Kraterrand, Bach hinter der Liane, Flussstufen. Grundlage aller drei Welten.
  - ground.ts: Natürliche Form der Insel ohne Weg als reine Mathematik – Abstand zur Küste, Strände, Riff, Hochebenen und Klippen, Lagune, Inselchen, Vulkan mit Graten, Krater und Lavastrom.
  - terrain.ts: Höhenfeld (Form plus Wegterrassen, Fluss- und Bachbett, Wasserfallbecken, Schlucht) und das Geländenetz mit Farbe, Glut und Materialanteilen je Punkt; Farbpalette austauschbar (Weltall).
  - water.ts: Meer mit Wellen, durchsichtigem Flachwasser, Brandung und Glitzern, Fluss und Bach mit Stromschnellen, Wasserfall mit Gischt – als eigene Shader; Aussehen umfärbbar (Plasma im Weltall).
  - grass.ts: Grasteppich aus zehntausenden Büscheln in einem einzigen Zeichenaufruf, wiegt sich im Wind und übernimmt die Bodenfarbe; Dichte je Grafikstufe.
  - props.ts: Bepflanzung und Deko (Palmen, Dschungel, Farne, Monstera, Bambus, Blumen, Felsen, Seerosen, Schilf); meldet Kamera-Hindernisse und Baumkronen und lässt die Sichtachsen der Mutproben frei.
  - landmarks.ts: Wahrzeichen – Hafendorf, Stufenpyramide, Säulenallee, Tempelruine, Steinköpfe, Leuchtturm, Hängebrücke, Fass-Flöße, Seil-Geländer, Strickleiter im Krater, Wrack, Schiffe, Regenbogen, Lagerfeuer und Fackeln.
  - fields.ts: Spielfelder als glänzende Scheiben in Feldfarbe mit gezeichneten Symbolen, Start am Hafen, Ziel als goldenes Podest, Markierung des aktiven Feldes; die Symbole nutzt auch das Weltall.
  - sky.ts: Himmelskuppel mit Sonnenglanz, ziehenden Haufenwolken und blauen Nachbarinseln am Horizont.
  - volcano.ts: Vulkan der Insel – Lavasee im Krater, Lavastrom, Glutlicht und Rauch; wird mit steigendem Druck heller und unruhiger, bricht beim Ausbruch aus.
  - inside.ts: Vulkan-Inneres als eigene Szene – Basalthöhle mit Lavasee, Strafweg über Säulen mit Feldplatten, Ausgangsfeld, Lavafall, Lichtschacht, grünes Portal; eigene Kameraeinstellungen und Effekte. Die Alien-Höhle baut darauf auf.
  - worldfx.ts: Gemeinsame Shader-Bausteine aller Welten – Weltzeit, ziehende Wolkenschatten, Lichtnetze am Meeresgrund, Gesteinsschichten an Felswänden, Glühen.
  - ambient.ts: Fackeln, Lagerfeuer, Rauch und Dampf als Partikel, die ganz auf der Grafikkarte berechnet werden (kein Aufwand je Bild auf dem Prozessor).
---
Die tropische Insel und zugleich das gemeinsame Fundament aller drei Welten: Inselplan in 3D, Höhenmodell, Wasser, Himmel, Bepflanzung, Wahrzeichen, Spielfelder, Vulkan und das Vulkan-Innere.

**Gemeinsames Höhenmodell.** Der Inselplan aus [[spielfeld]] ist zweidimensional: Küstenlinie, Weg, Fluss mit Wasserfall und Furt, Schlucht, Bach hinter der Liane und Vulkan. Dieser Baustein gibt ihm Höhen: Die natürliche Form der Insel ist als Formel beschrieben (Strände, Klippen, Hochebenen, Lagune, Vulkankegel mit Krater). Daraus entsteht ein Höhenfeld – ein Raster, das für jeden Punkt die Geländehöhe kennt –, in das Weg-Terrassen, Fluss- und Bachbett und Wasserfallbecken eingeschnitten werden. Der Weg folgt dem Gelände, steigt in den Serpentinen gleichmäßig, liegt in der Furt auf Fässern, auf der Hängebrücke und oben auf dem Kraterrand. Dasselbe Höhenfeld nutzen [[blockwelt]] (stapelt daraus Würfelsäulen) und [[weltall]] (färbt es um) – deshalb sind alle Welten gleich geformt und die Felder liegen überall an derselben Stelle.

**Insel-Optik.** Jeder Geländepunkt hat eine eigene Farbe (Strand, Wiese, Dschungel, Fels, Lavagestein mit glühenden Rissen, Weg). Das Meer hat Wellen, durchsichtiges Flachwasser und Brandung, der Fluss Stromschnellen, der Wasserfall Gischt. Bepflanzung und Wahrzeichen sind freie 3D-Modelle aus [[medien]] und werden instanziert gezeichnet: ein Modell an vielen Stellen in einem einzigen Zeichenaufruf. Wind, Wolkenschatten und Lichtnetze am Meeresgrund stecken als kleine Shader-Bausteine direkt in den Materialien. Ist Ultra gewählt, legt [[szene]] echte Materialtexturen über das Gelände.

**Vulkan und Inneres.** Der Vulkan glüht und raucht umso stärker, je höher der Druck im Spiel ist, und bricht beim Ausbruch aus. Das Vulkan-Innere ist eine eigene, komplett selbst gebaute Szene: eine Basalthöhle mit Lavasee, deren Säulen die Feldplatten der Strafrunde tragen; das Ausgangsfeld leuchtet grün-golden, ein grünes Portal führt hinaus. Nether ([[blockwelt]]) und Alien-Höhle ([[weltall]]) haben dieselbe Schnittstelle (Route, Plätze, Kameraeinstellungen, Effekte), die Alien-Höhle baut direkt auf dieser Szene auf.

Viele Bausteine (Gelände, Wasser, Gras, Shader-Bausteine) haben optionale Farbparameter für das Weltall; ohne Angabe bleibt die Insel unverändert.
