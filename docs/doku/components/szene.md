---
name: 3D-Szene und Regie
type: module
layer: grafik
path: [packages/web/src/board/scene.ts, packages/web/src/board/director.ts, packages/web/src/board/camera.ts, packages/web/src/board/manual.ts, packages/web/src/board/views.ts, packages/web/src/board/tweens.ts, packages/web/src/board/merge.ts, packages/web/src/board/noise.ts, packages/web/src/board/sight.ts, packages/web/src/board/assets.ts, packages/web/src/board/ultra.ts, packages/web/src/dev/, packages/web/blocks-preview.html, packages/web/inside-preview.html]
tech: [three.js, webgl, postprocessing, n8ao, typescript]
zone: client
provides:
  - call BoardScene – Welt aufbauen, Spielstand und Effekte annehmen (setState, pushEffects)
  - call Grafikstufe und Auflösung live umschalten (setQuality, setResolution)
  - call Regie-Besuch im Vulkan-Inneren (visit) und Kamera-Fernsteuerung (rig)
  - call Einblendungen für die Beamer-Oberfläche (onCaption), Bildrate (fps)
uses:
  - insel: call "Höhenmodell, Inselplan in 3D, Gelände, Wasser, Himmel, Deko, Felder, Vulkan, Vulkan-Inneres"
  - blockwelt: call "Blockwelt bauen (Gelände, Felder, Himmel, Vulkan, Nether, Mobs, Auftritte)"
  - weltall: call "Alien-Planet bauen (Gelände, Felder, Himmel, Vulkan, Alien-Höhle, Bewohner, Auftritte)"
  - figuren: call "Figuren aufstellen und bewegen, Namensschilder, 3D-Würfel, Siegerehrung"
  - tiere: call "Tiere der Insel"
  - auftritte: call "Auftritte der Sonderfelder und Mutproben, Partikel"
  - stimmung: call "Ton, Kommentator, Wetter, Jahreszeit, Festzeit"
  - medien: http "GET /assets/hdri, /assets/ultra, /assets/models (Himmelslicht, Ultra-Texturen, Modelle)" [auth=none]
  - show: call "atmosphereFor – Wetter, Jahreszeit und Fest aus den Beamer-Einstellungen"
  - spielmodell: call "Spielstand- und Effekt-Typen, FIELD_INFO, worldWords, Rangliste, Teamfarben"
  - spielfeld: call "Lage von Fluss und Furt (Kamerablicke der Mutproben)"
  - web-grundlage: call "Dauer der groß gezeigten Frage (lib/spotlight)"
files:
  - scene.ts: Hauptbaustein BoardScene – Renderer, Licht, Aufbau der gewählten Welt, Nachbearbeitung, vier Grafikstufen und Auflösung, Bildschleife; nimmt Spielstand und Effekte an und reist zwischen Insel und Vulkan-Innerem (auch beim Regie-Besuch).
  - director.ts: Regie der Animationen – spielt die Effekte vom Server nacheinander ab (Würfel, Laufen, Sonderfelder, Mutproben, Vulkan-Inneres, Ausbruch, Sieg), führt die Kamera, liefert Einblendungen und sagt dem Kommentator, was los ist; bricht bei Rückgängig ab und gleicht die Figuren an.
  - camera.ts: Kameraführung wie im Fernsehen – Rundflug, Mitfahren, Nahaufnahmen, vorgezeichnete Fahrten, Wackeln; weiche Bewegung, nie im Gelände, weicht aus, wenn etwas die Sicht verdeckt; feste Einstellungen für die Fernsteuerung aus der Regie.
  - manual.ts: Freie Kamera direkt am Beamer mit Maus, Touch und Tastatur – erst nach Umschalt+K, während der Spielerklärung gesperrt.
  - views.ts: Feste Kamerablicke für die Mutproben an Liane und Furt, nur aus Plan und Gelände berechnet, dazu Sichtachsen, in denen Bäume und hohe Deko aller Welten nicht stehen dürfen.
  - tweens.ts: Kleine Zeitsteuerung für Animationen (Übergänge mit Beschleunigungskurven), getaktet von der Bildschleife; läuft schneller, wenn viele Effekte warten.
  - merge.ts: Fasst unbewegliche Einzelteile mit gleichem Material zu wenigen großen Teilen zusammen – weniger Zeichenaufrufe an die Grafikkarte, flüssigeres Bild.
  - noise.ts: Rauschfunktionen und Zufall mit festem Startwert, damit Gelände, Bepflanzung und Himmel bei jedem Start gleich aussehen.
  - sight.ts: Prüft, was die Kamera gerade sieht – Tiere, Mobs und Kurzauftritte tauchen nur außerhalb des Bildes auf, verschwinden oder werden versetzt.
  - assets.ts: Lädt die 3D-Modelle aus dem Medien-Ordner, färbt sie in Inseltöne um und setzt sie vielfach in einem Rutsch (instanziert); hängt Wolkenschatten und Wind in die Materialien.
  - ultra.ts: Grafikstufe Ultra – lädt die freien Materialtexturen (Sand, Gras, Fels, Weg, Vulkangestein, Kiesel) erst bei Bedarf und baut daraus das Gelände-Material.
  - blocksPreview.ts: Entwickler-Vorschau der Blockwelt – alle Pixel-Kacheln, Welt, Mobs, Figuren und Nether einzeln ansehen.
  - insidePreview.ts: Entwickler-Vorschau des Vulkan-Inneren mit demselben Renderer wie der Beamer, wählbaren Kameraeinstellungen, Effekten und Messwerten.
  - blocks-preview.html: Startseite der Blockwelt-Vorschau (nur im Entwicklungsserver).
  - inside-preview.html: Startseite der Vorschau des Vulkan-Inneren (nur im Entwicklungsserver).
---
Herz der Beamer-Grafik: baut die 3D-Spielwelt mit three.js auf (einer Bibliothek für 3D-Grafik im Browser über WebGL), zeichnet sie rund 60-mal pro Sekunde und spielt das Spielgeschehen als Animation ab.

**Eine Szene, drei Welten.** Beim Start legt die Szene je nach Welt des Spiels – Insel, Blockwelt oder Weltall – Licht, Himmel, Gelände, Wasser, Deko, Tiere, Spielfelder, Vulkan, Figuren und Kamera an. Alle drei Welten stehen auf demselben Fundament: dem Inselplan aus [[spielfeld]] und dem daraus berechneten Höhenmodell aus [[insel]] (einem Raster, das für jeden Punkt die Geländehöhe kennt). Deshalb liegen Weg, Felder, Fluss, Mutproben und Vulkan in jeder Welt an derselben Stelle, und die Spiellogik bleibt gleich – nur die Optik wechselt ([[blockwelt]], [[weltall]], Entscheidung [[0003-welten-teilen-regeln-und-spielfeld]]). Kamera, Regie, Figurenlogik ([[figuren]]) und Siegerehrung sind für alle Welten dieselben. Die Welt wechselt nur mit einem Neuaufbau der Szene.

**Regie der Animationen (Director).** Der Server schickt nach jedem Befehl eine Liste von Effekten, z. B. „Würfel 4“, „Figur läuft 4 Felder“, „Sprungfeder“. Der Director stellt sie in eine Warteschlange und spielt sie nacheinander ab: Er führt die Kamera, löst Auftritte ([[auftritte]]), Geräusche und Sprüche ([[stimmung]]) aus und liefert die Einblendungen für die Beamer-Oberfläche ([[beamer]]). Warten viele Effekte, spielt er schneller. Bei „Rückgängig“ bricht er alles Laufende ab, räumt auf und stellt die Figuren auf den neuen Spielstand. Während der Spielerklärung pausiert er. Ablauf: [[wuerfelzug-beamer]].

**Kamera.** Sie arbeitet wie bei einer TV-Übertragung: Rundflug, wenn nichts passiert, Mitfahren beim aktiven Team (Vulkan im Hintergrund), Nahaufnahmen bei Ereignissen, Wackeln beim Ausbruch. Sie bewegt sich weich wie an einer gedämpften Feder, taucht nie ins Gelände und weicht seitlich oder nach oben aus, wenn Berg, Bäume oder Gebäude das Bild verdecken. Für Liane und Furt gibt es feste Blickwinkel; die Bepflanzung aller Welten lässt dort Sichtachsen frei. Die Regie kann die Kamera fernsteuern (Insel, Vulkan, Start, Ziel, Team, Schubsen); am Beamer selbst schaltet Umschalt+K eine freie Kamera ein. Nach einer Weile ohne Eingabe übernimmt wieder die Automatik.

**Vulkan-Inneres.** Das Innere des Vulkans (Insel: Lavahöhle, Blockwelt: Nether, Weltall: Alien-Höhle) ist eine eigene Szene. Sie wird schon in der Lobby im Hintergrund vorbereitet – die Shader (kleine Programme, die auf der Grafikkarte laufen) werden vorab übersetzt –, damit der Wechsel nicht ruckelt. Die Reise hin und zurück kommt ohne Schwarzbild aus: Die Kamera taucht in den Krater, ein Standbild des alten Orts blendet weich in den neuen über. Ablauf: [[vulkan-besuch]].

**Grafikstufen.** Vier Stufen lassen sich live umschalten, ohne die Welt neu aufzubauen: *Ultra*, *Schön*, *Ausgewogen*, *Sparsam*. Sie unterscheiden sich in Auflösung, Schattenqualität (und wie oft Schatten neu gezeichnet werden), Nachbearbeitung (Umgebungsverdeckung, Leuchten, Tilt-Shift-Unschärfe, Vignette, Kantenglättung) und Grasdichte. *Ultra* nutzt zusätzlich echte Materialtexturen fürs Gelände, Tiefenschärfe und ein schärferes Himmelslicht; die rund 26 MB Texturen werden erst geladen, wenn Ultra gewählt wird. Die Regie wählt die Stufe oder „Automatisch“ – dann stuft die Beamer-Seite bei zu niedriger Bildrate herunter (nie auf Ultra). Die Auflösung lässt sich zusätzlich festlegen; Bildrate und Stufe meldet der Beamer an die Regie.

**Zum Messen und Entwickeln** gibt es Schalter in der Beamer-Adresse (Grafikstufe erzwingen, einzelne Teile wie Gras, Nachbearbeitung, Deko oder Tiere abschalten, alle Tiere zur Kontrolle aufstellen) und zwei Vorschauseiten im Entwicklungsserver: eine für die Blockwelt und eine für das Vulkan-Innere. Freie Assets: [[0005-nur-freie-assets-mit-licenses-md]].
