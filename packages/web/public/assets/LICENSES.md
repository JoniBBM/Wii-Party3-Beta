# Lizenzen der Assets

Alle Assets sind frei verwendbar. Die meisten stehen unter **CC0 1.0 (Public Domain)**; einige Tiermodelle stehen unter **CC BY 3.0** und verlangen eine Namensnennung (siehe unten), die Wasser-Normalenkarte der Ultra-Grafik steht unter der **MIT-Lizenz**.

## CC0 1.0 (Public Domain)

| Ordner / Datei | Quelle |
|---|---|
| `models/nature/` | Kenney – Nature Kit 2.1 (https://kenney.nl/assets/nature-kit) |
| `models/pirate/` | Kenney – Pirate Kit (https://kenney.nl/assets/pirate-kit) |
| `models/veg/palm1–3`, `plant`, `plant_big`, `fern` | Quaternius (https://quaternius.com), über Poly Pizza |
| `models/veg/monstera`, `monstera_small` | Isa Lousberg, über Poly Pizza |
| `models/animals/dolphin`, `whale`, `manta`, `crab`, `frog` | Quaternius (https://quaternius.com), über Poly Pizza – mit Animationen |
| `audio/dice-*` | Kenney – Casino Audio |
| `audio/step-*`, `land`, `thud`, `bell`, `rumble` | Kenney – Impact Sounds |
| `audio/confirm`, `select`, `bong`, `question`, `wrong`, `tick`, `whoosh-*`, `sparkle`, `pop` | Kenney – Interface Sounds |
| `audio/jingle-*` | Kenney – Music Jingles |
| `hdri/sky.hdr` | Poly Haven – „Kloofendal 48d Partly Cloudy (Pure Sky)“ von Greg Zaal (https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky) |

## Ultra-Grafik (`ultra/`)

Texturen und Himmel für den Grafikmodus „Ultra“. Jeder Material-Ordner enthält `albedo.jpg` (Farbe, sRGB), `normal.jpg` (Normalen, OpenGL-Konvention), `rough.jpg` (Rauheit) und `ao.jpg` (Umgebungsverdeckung). Für dieses Projekt als JPG (Qualität 85) neu gespeichert; bei den 2K-Sätzen sind Rauheit und AO auf 1K verkleinert. Inhalt sonst unverändert.

**CC0 1.0 (Public Domain)** – Lizenzen: https://polyhaven.com/license, https://docs.ambientcg.com/license/

| Ordner / Datei | Quelle | Urheber |
|---|---|---|
| `ultra/sand/` | ambientCG – „Ground 093 C“ (https://ambientcg.com/view?id=Ground093C) | Lennart Demes (ambientCG) |
| `ultra/grass/` | ambientCG – „Grass 007“ (https://ambientcg.com/view?id=Grass007) | Lennart Demes (ambientCG) |
| `ultra/path/` | Poly Haven – „Red Dirt Mud 01“ (https://polyhaven.com/a/red_dirt_mud_01) | Rob Tuytel |
| `ultra/cliff/` | ambientCG – „Rock 030“ (https://ambientcg.com/view?id=Rock030) | Lennart Demes (ambientCG) |
| `ultra/volcanic/` | ambientCG – „Rock 031“ (https://ambientcg.com/view?id=Rock031) | Lennart Demes (ambientCG) |
| `ultra/pebbles/` | Poly Haven – „Ganges River Pebbles“ (https://polyhaven.com/a/ganges_river_pebbles) | Amal Kumar |
| `ultra/wood/` | Poly Haven – „Wood Planks“ (https://polyhaven.com/a/wood_planks) | Amal Kumar |
| `ultra/hdri/sky_2k.hdr` | Poly Haven – „Kloofendal 48d Partly Cloudy (Pure Sky)“, 2K (https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky) | Greg Zaal (Original), Jarod Guest (Himmel-Bearbeitung) |

**MIT-Lizenz** – Lizenztext: https://github.com/mrdoob/three.js/blob/dev/LICENSE (Copyright © 2010-2026 three.js authors). Der Copyright-Hinweis muss erhalten bleiben.

| Datei | Quelle | Urheber |
|---|---|---|
| `ultra/water/normal.jpg` | „waternormals.jpg“ aus dem three.js-Repository (https://github.com/mrdoob/three.js/blob/dev/examples/textures/waternormals.jpg) – Kachelnaht leicht geglättet | three.js authors |

## Eigens erzeugt mit ElevenLabs (für dieses Projekt)

Erzeugt im ElevenLabs-Abo des Projektbetreibers; Nutzung gemäß den ElevenLabs-Nutzungsbedingungen (kommerzielle Nutzung bei bezahltem Abo erlaubt). Nicht weiterverkaufen oder als eigene Klangbibliothek verbreiten.

| Ordner / Datei | Was | Modell |
|---|---|---|
| `audio/music/*.mp3` (13 Stücke) | Musik (Lobby, Spielbrett, Fragen/Minispiele, Vulkan-Inneres, Siegerehrung) | Eleven Music v2.5 |
| `audio/fx/*.mp3` | Soundeffekte (Jubel, Applaus, Vulkan, Feder, UFO, Flugzeug, Platsch …) | Eleven Sound Effects v2 |
| `audio/ambience/*.mp3` | Umgebungsschleifen (Strand, Dschungel, Vulkanhöhle) | Eleven Sound Effects v2 (Schleife) |
| `voice/*.mp3` | Kommentator und Spielerklärung, Stimme „DiMario – Moderator“ | Eleven v3 |

Die Texte des Kommentators stehen in `packages/web/src/board/voice-lines.ts`.

## CC BY 3.0 (Namensnennung erforderlich)

Lizenztext: https://creativecommons.org/licenses/by/3.0/ – Modelle unverändert übernommen, nur zur Laufzeit skaliert/eingefärbt.

| Datei | Modell | Urheber | Quelle |
|---|---|---|---|
| `models/veg/bamboo.glb` | „Bamboo“ | Poly by Google | https://poly.pizza/m/auVD_m-ugF0 |
| `models/animals/turtle.glb` | „Turtle“ | Poly by Google | https://poly.pizza/m/2LCcq8vhqJ3 |
| `models/animals/turtle2.glb` | „Turtle“ (Meeresschildkröte) | Poly by Google | https://poly.pizza/m/fklSEvGm1Q8 |

Danke an ElevenLabs, Kenney (www.kenney.nl), Quaternius (quaternius.com), Isa Lousberg, Poly Haven (polyhaven.com), ambientCG (ambientcg.com), die three.js-Autoren, Poly by Google und alle Urheber auf Poly Pizza (poly.pizza)!
