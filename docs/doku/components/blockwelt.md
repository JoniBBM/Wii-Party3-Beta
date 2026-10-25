---
name: Blockwelt (Minecraft-Stil)
type: module
layer: grafik
path: packages/web/src/board/blocks/
tech: [three.js]
zone: client
provides:
  - call buildVoxelWorld – Gelände aus Blöcken, Wasser, Bäume, Lava im Krater
  - call blockAtlas – alle Pixel-Kacheln als ein Texturatlas (auch für Fest-Deko und Block-Figur)
  - call BlockStunts, NetherInside – Auftritte und Vulkan-Inneres der Blockwelt
  - call buildMob, buildBoxModel – Tiere, Mobs und Kastenmodelle mit Pixel-Haut
uses:
  - insel: call "Höhenmodell, Inselplan in 3D, Kraterform, Schnittstellen für Felder, Himmel, Wasser und Vulkan, Kamerafahrt im Inneren"
  - szene: call "Sichtachsen der Mutproben, Sichtprüfung, Zeitsteuerung, Zufall"
  - auftritte: call "Grundklasse der Auftritte (Stunts), Partikel"
  - tiere: call "Schnittstelle der Tierwelt (AnimalWorld)"
  - spielfeld: call "Lage von Vulkan und Fluss"
  - spielmodell: call "Feldarten und -farben, Zufall mit festem Startwert"
files:
  - pixels.ts: Kleiner Pixel-Maler – zeichnet Texturen Pixel für Pixel im Browser (Farben, Schattierung, Sprenkel, fester Zufall je Name); keine fremden Bilddateien.
  - atlas.ts: Alle Block-Kacheln (16×16 Pixel, eigene Zeichnungen) – Gras, Erde, Stein, Sand, Holz, Laub, Wasser, Lava, Netherrack, Glowstone, Obsidian, Wolle, TNT, Kürbis, Spinnennetz u. v. m. – in einem Atlas mit Rand gegen Farbbluten.
  - cube.ts: Bausteine für Block-Objekte – Würfel und Quader mit Atlas-Kachel je Fläche, gekreuzte Flächen für Gras und Blumen.
  - boxmodel.ts: Kastenmodelle aus Quadern, jeder mit eigener Pixel-Haut (Klappschnitt wie bei Blockspiel-Skins) und Gelenken – für Figuren, Tiere und Mobs.
  - mobs.ts: Tiere und Mobs als Kastenmodelle – Zombie, Skelett, Spinne, Schleim, Magmawürfel, Schwein, Kuh, Schaf, Huhn, Fledermaus sowie die eigenen Entwürfe „Knaller“ und „Glutgeist“.
  - world.ts: Gelände der Blockwelt – stapelt aus dem gemeinsamen Höhenfeld Säulen aus Blöcken (gleiche Form, gleicher Weg, gleicher Fluss), dazu Fluss-Kaskaden, Wasserfall, Meer, Lava im Krater, Bäume abseits der Kamerawege und Blumen; zeichnet nur sichtbare Außenflächen.
  - fields.ts: Spielfelder als Woll-Platten am Blockraster mit Pixel-Symbol; Start als Smaragd-, Ziel als Goldplatte; Markierung als Auswahlrahmen.
  - sky.ts: Himmel der Blockwelt – Farbverlauf, eckige Sonne und flache Block-Wolken.
  - volcano.ts: Vulkan der Blockwelt – Lava im Krater, eckiger Rauch je nach Druck, Glutlicht, beim Ausbruch fliegende Lava- und Magmablöcke.
  - nether.ts: Vulkan-Inneres als „Nether“ – Netherrack-Höhle mit Glowstone, Lavasee und Lavafällen, Strafweg über Netherziegel-Pfeiler, Goldblock als Ausgangsfeld, Obsidian-Portal, schwebende Glutgeister; gleiche Schnittstelle wie das Insel-Innere.
  - stunts.ts: Auftritte aus Blöcken – Eiche mit Ranke, Fass- und Kisten-Blöcke, Höhleneingang aus Bruchstein, Schleimblock als Sprungfeder, Knaller statt Flugzeug, Teleport statt UFO, Notenblock-Bühne mit Leuchtfeuer, eckige Falltür, Portal-Strahl; dazu Holzschilder mit Pixelschrift.
  - animals.ts: Leben in der Blockwelt – Nutztiere auf den Wiesen, Zombies und Skelette im Wald, Spinnen und Fledermäuse an der Höhle, Schleime am Wasser, Knaller am Vulkanfuß; einfache Wander-Logik, versetzt wird nur außerhalb des Bildes.
---
Die Blockwelt im Minecraft-Stil: dieselbe Insel, derselbe Weg und dieselben Regeln wie auf der Insel – nur aus Würfeln gebaut und mit eigenen, selbst gezeichneten Pixel-Texturen. Pro Spiel in den Einstellungen wählbar.

**Pixel statt Bilddateien.** Alle Texturen entstehen beim Laden im Browser: Ein kleiner Pixel-Maler zeichnet jede Kachel (16×16 Pixel) aus Code und legt alle Kacheln in einen Atlas – ein großes Bild mit allen Kacheln; ein schmaler Rand um jede Kachel verhindert, dass Nachbarkacheln ineinander verlaufen. Es gibt keine Original-Texturen, -Geräusche oder -Musik von Minecraft im Projekt, siehe [[0004-eigene-pixel-texturen-statt-minecraft-originalen]]. Zum Ansehen aller Kacheln gibt es eine Vorschauseite im Entwicklungsserver ([[szene]]).

**Gelände.** Aus dem gemeinsamen Höhenmodell der [[insel]] werden Säulen aus Blöcken gestapelt (ein Block ist 0,66 Einheiten groß, eine Figur zwei Blöcke hoch). Gezeichnet werden nur die sichtbaren Außenflächen, abschnittsweise zu wenigen großen Teilen zusammengefasst. Der Fluss fällt in Kaskaden aus Wasserblöcken, Bäume stehen abseits der Kamerawege der Mutproben.

**Figuren, Tiere, Mobs.** Alles Lebendige ist ein Kastenmodell: Quader mit eigener Pixel-Haut und Gelenken. Auf den Wiesen grasen Schafe, Kühe, Schweine und Hühner, in den Wäldern streifen Zombies und Skelette, an der Höhle hängen Spinnen und Fledermäuse, am Wasser hüpfen Schleime, am Vulkanfuß schleicht der „Knaller“ (eigener Entwurf). Sie wandern einfach umher; ein festgefahrenes Tier wird nur versetzt, wenn die Kamera nicht hinschaut. Die Block-Figur der Teams steckt in [[figuren]].

**Auftritte und Nether.** Die Auftritte der Blockwelt übernehmen Abläufe, Kamera, Timing und Rückgängig von der Insel ([[auftritte]]) und tauschen nur die Bauteile. Das Vulkan-Innere ist der Nether mit derselben Schnittstelle wie das Insel-Innere – Strafweg, Ausgangsfeld und Portal funktionieren gleich.

Außerhalb dieses Bausteins schaltet die Blockwelt auch den Pixel-Look von Handy und Beamer-Einblendungen ein ([[web-grundlage]], [[beamer]]) und bringt eigene Sprüche, Spielerklärung und Musik mit ([[stimmung]], [[medien]]).
