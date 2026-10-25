---
name: Medien der Spielwelt (Assets)
type: storage
layer: daten
path: packages/web/public/assets/
zone: intern
exposure: public
provides:
  - http GET /assets/… – Modelle, Texturen, Himmelsbilder, Geräusche, Musik und Sprachdateien als statische Dateien
files:
  - models/: 3D-Modelle im glTF-Format (.glb), rund 9 MB – nature/ und pirate/ (Kenney), veg/ (Palmen, Monstera, Farne, Bambus), animals/ (Delfin, Wal, Manta, Krabbe, Frosch, Schildkröten mit Animationen), space/ (Alien-Pflanzen, Felsen, Mondbasis, Raketen, Raumschiffe für das Weltall).
  - audio/: Kurze Geräusche direkt im Ordner (Kenney – Würfel, Schritte, Aufprall, Oberflächen-Klänge, Jingles) sowie die Unterordner für Effekte, Umgebung und Musik.
  - audio/fx/: Eigene Soundeffekte (Jubel, Applaus, Vulkan, Feder, UFO, Flugzeug, Platsch …), mit ElevenLabs erzeugt.
  - audio/ambience/: Nahtlose Umgebungsschleifen – Strand, Dschungel, Vulkanhöhle.
  - audio/music/: Musikstücke, rund 55 MB – Insel als MP3 (mit ElevenLabs erzeugt), Blockwelt und Weltall als M4A (freie CC0-Stücke von OpenGameArt). Welches Stück zu welcher Stimmung und Welt gehört, steht in der Musikliste der Show-Einstellungen.
  - voice/: Rund 370 Sprachdateien (MP3, rund 34 MB) des Kommentators und der Spielerklärung; Dateiname = ID des Spruchs, Vorsilbe bw_ für die Blockwelt, sw_ für das Weltall, ex_ für Sätze der Spielerklärung.
  - hdri/: Himmelsbild der Insel (HDR, Poly Haven) für Hintergrundlicht und Spiegelungen.
  - ultra/: Materialtexturen der Grafikstufe Ultra, rund 26 MB – je Ordner Farbe, Normalen, Rauheit und Verdeckung für Sand, Gras, Weg, Fels, Vulkangestein, Kiesel, Holz, dazu eine Wasser-Normalenkarte und ein schärferes Himmelsbild; werden erst bei Ultra geladen.
  - LICENSES.md: Quelle, Urheber und Lizenz jedes Ordners bzw. jeder Datei, Namensnennungen und Hinweise zu den mit ElevenLabs erzeugten Dateien und den Schriften.
security:
  - access: Frei abrufbar ohne Anmeldung, wie die Weboberfläche selbst – hier liegen nur freie bzw. eigens erzeugte Medien, keine Spieldaten
  - privacy: Fotos der Spieler und vorgelesene Fragen liegen nicht hier, sondern im Datenordner des Servers (nicht im Repository)
  - other: Nur Assets mit freier Lizenz, jede Quelle in LICENSES.md; keine Original-Inhalte aus Minecraft; ElevenLabs-Dateien nicht als eigene Klangbibliothek weitergeben
---
Ablage aller fertigen Mediendateien der 3D-Spielwelt – zusammen rund 130 MB: 3D-Modelle, Geräusche, Musik, Sprachdateien des Kommentators, Himmelsbilder und Ultra-Texturen.

**Wie die Dateien zum Beamer kommen.** Der Ordner gehört zur Weboberfläche: Beim Bauen kopiert Vite (das Bauwerkzeug der Weboberfläche) ihn unverändert in das fertige Web-Paket, und der [[server]] liefert ihn wie alle anderen statischen Dateien unter /assets/ aus. Der Browser des Beamers lädt die Modelle beim Aufbau der Welt ([[szene]], [[insel]], [[tiere]], [[weltall]]), Geräusche und Musik nach Bedarf ([[stimmung]]); Musik wird gestreamt, die Ultra-Texturen kommen erst, wenn Ultra gewählt wird. Es gibt keine Abrufe bei fremden Diensten – das Spiel läuft auch ohne Internet.

**Lizenzen.** Die meisten Dateien stehen unter CC0 (gemeinfrei): Modelle von Kenney und Quaternius, Texturen und Himmel von Poly Haven und ambientCG, die Musik von Blockwelt und Weltall von OpenGameArt. Drei Modelle (Bambus, zwei Schildkröten) stehen unter CC BY 3.0 und verlangen eine Namensnennung, die Wasser-Normalenkarte stammt aus three.js (MIT-Lizenz). Insel-Musik, eigene Effekte und alle Sprachdateien wurden für dieses Projekt mit ElevenLabs erzeugt. Alles ist in LICENSES.md eingetragen. Regeln: [[0005-nur-freie-assets-mit-licenses-md]], [[0006-sprache-und-musik-als-dateien-im-projekt]]. Die Blockwelt braucht hier keine Bilder – ihre Texturen zeichnet der Browser selbst ([[0004-eigene-pixel-texturen-statt-minecraft-originalen]]).

**Neue Dateien.** Effekte als audio/fx/ ablegen und in der Liste der Ton-Engine eintragen; Musik in die Musikliste der Show-Einstellungen ([[show]]) aufnehmen; Sprachdateien nur zusammen mit dem Text in voice-lines.ts. Jedes neue Asset bekommt einen Eintrag in LICENSES.md.
