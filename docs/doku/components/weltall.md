---
name: Weltall (Alien-Planet)
type: module
layer: grafik
path: packages/web/src/board/space/
tech: [three.js, glsl]
zone: client
provides:
  - call Gelände, Plasma-Wasser, Himmel, Deko, Wahrzeichen, Felder und Vulkan des Alien-Planeten
  - call SpaceStunts, SpaceInside – Auftritte und Vulkan-Inneres (Alien-Höhle) des Weltalls
  - call buildSpaceAnimals – Bewohner des Planeten
  - call buildEnergyCage, buildSpaceFestive – Energiekäfig und Fest-Deko
uses:
  - insel: call "Höhenmodell, Geländenetz mit eigener Palette, Wasser- und Gras-Bausteine, Vulkan-Inneres als Vorlage, Feldsymbole, Shader-Bausteine"
  - szene: call "Modelle laden, Sichtachsen der Mutproben, Sichtprüfung, Rauschen, statische Teile zusammenfassen"
  - auftritte: call "Grundklasse der Auftritte (Stunts), Partikel"
  - tiere: call "Schnittstelle der Tierwelt (AnimalWorld)"
  - stimmung: call "Plätze und Schnittstelle der Fest-Deko"
  - medien: http "GET /assets/models/space (Alien-Pflanzen, Felsen, Mondbasis, Raketen, Raumschiffe)" [auth=none]
  - spielfeld: call "Lage von Vulkan, Fluss und Lagune"
  - spielmodell: call "Feldarten und -farben"
files:
  - palette.ts: Farben des Planeten – violette Wiesen, türkise Wälder, rosa Strände, Plasma statt Wasser, Himmel, Licht und Glut; hell und freundlich für den Beamer.
  - kit.ts: Bausteine für den Planeten – Materialien mit Wolkenschatten, Selbstleuchten für Modelle, Kristalle, Pilze und Felsen als eigene Formen.
  - terrain.ts: Boden des Planeten – das Insel-Gelände mit eigener Palette und schwach leuchtenden Plasma-Adern am Vulkan, dazu Alien-Gras.
  - sky.ts: Himmel des Planeten – violetter Zenit, türkiser Horizont, Sterne, Ringplanet, zwei Monde, Nebelschwaden und schwebende Felsinseln; liefert auch das Umgebungslicht (ohne Himmelsbild).
  - props.ts: Bewuchs und Deko an denselben Plätzen wie auf der Insel – Kristallgruppen, Leucht-, Spiral- und Stachelbäume, leuchtende Pilze, Felsen, Meteoritenbrocken; Sichtachsen der Mutproben bleiben frei.
  - landmarks.ts: Wahrzeichen als Gegenstücke zur Insel – Mondbasis, Kristalltempel, Leuchtsäulen, Sternentor, Antennenmast, Metallbrücke, Metall-Leiter in den Krater, Raketenrampe am Ziel, Wrack, kreisende Raumschiffe, Forschungslager, Monolith.
  - fields.ts: Spielfelder als sechseckige Metallplattformen mit leuchtender Platte in Feldfarbe; Start als Landeplatz mit „H“, Ziel an der Raketenrampe.
  - volcano.ts: Alien-Vulkan – Plasmasee und Plasmastrom, violetter Dampf; beim Ausbruch fliegen Kristallbrocken und Meteoriten schlagen ein.
  - inside.ts: Vulkan-Inneres als Alien-Höhle – Kristallhöhle mit Plasma-See, Strafweg über schwebende Kristallinseln, Teleporter als Ausgang, Wurmloch in der Decke; baut auf dem Insel-Inneren auf.
  - stunts.ts: Auftritte im Weltall – Jetpack (vorwärts), Schwarzes Loch (zurück), Teleporter (Tausch), Greifhaken am Kran über den Plasma-Bach, Kapseln oder Kisten im Plasma mit Schutzblase, Kristallhöhle, Wurmloch, Holo-Bühne, Plasma-Fontäne.
  - cage.ts: Energiekäfig der Sperre – leuchtende Stäbe mit Kuppel und flimmerndem Kraftfeld; alle Käfige teilen Formen und Materialien.
  - animals.ts: Bewohner – kleine Aliens, Kristallkäfer, schwebende Drohnen, Gleiter über Land und Meer, Plasma-Quallen; selbst gebaut, ruhig bewegt, versetzt wird nur außerhalb des Bildes.
  - festive.ts: Festzeiten im Weltall – Halloween mit Kürbis-Kapseln, Geister-Aliens und Kürbis-Mond; Weihnachten mit Kristallbäumen, Lichterketten, Geschenk-Kapseln und Schnee-Roboter.
---
Die Weltall-Welt: ein heller, freundlicher Alien-Planet auf dem Insel-Gelände – gleiche Form, gleicher Weg, gleiche Regeln, eigene Farben, Bauten und Bewohner. Pro Spiel in den Einstellungen wählbar.

**Gleiches Gelände, neue Farben.** Der Planet nutzt das Höhenmodell und die Bausteine der [[insel]] (Gelände, Wasser, Gras, Shader-Bausteine) mit eigener Farbpalette: violette Wiesen, türkise Wälder, rosa Strände, schwach leuchtende Plasma-Adern am Vulkan. Meer, Fluss und Wasserfall bestehen aus Plasma. Der Himmel ist komplett selbst berechnet (Sterne, Ringplanet, zwei Monde) und liefert auch das Umgebungslicht – ein Himmelsbild wie auf der Insel braucht es nicht.

**Deko und Wahrzeichen.** Pflanzen, Felsen, Mondbasis und Raumschiffe sind freie Modelle aus [[medien]] (Quaternius und Kenney, CC0), die zur Laufzeit umgefärbt und zum Leuchten gebracht werden. Jedes Insel-Wahrzeichen hat ein Gegenstück: Mondbasis statt Hafendorf, Kristalltempel statt Pyramide, Antennenmast statt Leuchtturm, Raketenrampe am Ziel.

**Auftritte, Inneres, Bewohner.** Die Auftritte übernehmen Abläufe, Kamera und Rückgängig von der Insel ([[auftritte]]) und zeigen Weltall-Varianten: Jetpack, Schwarzes Loch, Teleporter, Greifhaken, Schutzblase im Plasma, Energiekäfig. Das Vulkan-Innere ist eine Alien-Höhle, die direkt auf dem Insel-Inneren aufbaut. Aliens, Kristallkäfer, Drohnen, Gleiter und Plasma-Quallen bewegen sich ruhig über freies Gelände. Die Astronauten-Figur steckt in [[figuren]], Sprüche, Spielerklärung und Musik des Weltalls in [[stimmung]] und [[medien]].
