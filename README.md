# 🏝️ Insel der Abenteuer

Ein Partyspiel für Gruppen im Stil von **Wii Party**: Die Teams wandern auf einer 3D-Insel vom Hafen bis zum Vulkangipfel. Wer welche Strecke würfeln darf, entscheiden Minispiele und Quizfragen, die live vor Ort gespielt werden. Gedacht für Jugendgruppen, Freizeiten, Klassenfahrten und Familienfeste mit **2–10 Teams** – gespielt wird mit **Handy, Tablet oder Laptop**, die Insel läuft auf dem **Beamer**.

![Die Insel der Abenteuer](docs/bilder/insel-gesamt.webp)

## Die Insel

Der Weg führt vom **Hafendorf** durch die **Tempelruinen**, mit der **Liane** über den Bach, an der **Lagune** vorbei durch den **Dschungel**, am Wasserfall über **Fässer oder Kisten**, zum **Leuchtturm**, über die **Hängebrücke**, an der Steilküste entlang zu den **Steinköpfen** und in Serpentinen auf den **Vulkan** – vorbei an der **Lavahöhle** bis zum **Kraterloch**. Wer Pech hat, fällt ins **Innere des Vulkans** und muss über Felssäulen im Lavasee zurück zum Ausgang. Jedes Sonderfeld hat seinen Auftritt: Sprungfeder, Doppeldecker mit Fallschirm, UFO-Tausch, fallender Käfig, Dampf-Geysir, Totenkopf-Falltür. Unterwegs: Delfine, ein Wal, Fischschwärme, Flamingos, Schildkröten, Krabben, Frösche, Papageien, Affen, Möwen und Schmetterlinge.

Nach jedem Zug reagiert die Figur in der Großaufnahme (Salto, Jubel, Ärger …), ein **Kommentator** (gesprochen, wahlweise auch als lästernder „Quatschkopf“) begleitet das Spiel, **13 Musikstücke** wechseln je nach Phase, und am Ende steigt ein **Siegerpodest aus dem Krater**. Eine **Spielerklärung** mit Sprecher und Vorführungen zeigt in gut drei Minuten, wie alles funktioniert.

| | | |
|---|---|---|
| ![Hafendorf](docs/bilder/insel-hafen.webp) | ![Fässer im Fluss](docs/bilder/insel-furt.webp) | ![Serpentinen zum Krater](docs/bilder/insel-vulkan.webp) |
| ![Pyramide und Säulenallee](docs/bilder/insel-ruinen.webp) | ![Lagune mit Flamingos](docs/bilder/insel-lagune.webp) | ![Lavastrom an der Nordflanke](docs/bilder/insel-norden.webp) |

### Mutproben wie im Original

| An der Liane über den Bach | Fässer oder Kisten? | Im Inneren des Vulkans |
|---|---|---|
| ![Liane](docs/bilder/beamer-liane.webp) | ![Fässer oder Kisten](docs/bilder/beamer-furt.webp) | ![Vulkan-Inneres](docs/bilder/vulkan-innen-ueberblick.webp) |

### Grafikstufe „Ultra“

Für starke Rechner: echte Materialien (freie CC0-Texturen für Sand, Gras, Fels, Vulkangestein), feine Wellen, dichtes Gras und Tiefenschärfe. Daneben gibt es *Schön*, *Ausgewogen* und *Sparsam* – umschaltbar live aus der Regie, samt Auflösung.

![Ultra-Grafik](docs/bilder/beamer-ultra.webp)

## Die vier Bildschirme

| Wer | Was | Adresse |
|---|---|---|
| **Beamer** | 3D-Insel mit Figuren, Fragen, Ergebnissen, Würfeln und Effekten – ohne Menü, komplett aus der Regie gesteuert | `/beamer` (Kiosk: `./start.sh beamer`) |
| **Regie** (Technik) | Steuert den Abend: Inhalte wählen, Antworten sehen, Platzierung eintragen, würfeln, Rückgängig; Beamer fernsteuern (Grafik, Ton, Musik, Kamera, Erklärung) | `/regie` |
| **Moderator** (Vorleser) | Große Vorleseansicht mit Lösungen – kann alles mitsteuern | `/moderator` |
| **Handys / Tablets / Laptops** | Teams treten per QR-Code bei, antworten (Doppeltipp = sofort abgeschickt), buzzern, würfeln, wählen bei Mutproben, gestalten ihre Figur – je Person ein Gerät oder eine Anmeldestation | `/` → „Mitspielen“ |

Alle Geräte sind live verbunden – jede Aktion erscheint sofort überall.

| Beamer | Regie | Handy |
|---|---|---|
| ![Frage auf dem Beamer](docs/bilder/beamer-frage.webp) | ![Regie während einer Frage](docs/bilder/regie-frage-live.webp) | ![Antworten am Handy](docs/bilder/handy-frage.webp) |

## Schnellstart

Voraussetzung: [Docker Desktop](https://www.docker.com/products/docker-desktop/) läuft.

```bash
cp .env.example .env        # dann ADMIN_PASSWORD in .env setzen
./start.sh                  # baut und startet alles, öffnet die Regie
```

Danach:

1. **Regie** öffnen (`http://localhost:9534/regie`) und ein Spiel anlegen.
2. **Beamer** öffnen: `./start.sh beamer` (Kiosk mit Vollbild und Ton) oder `http://localhost:9534/beamer` und einmal hineinklicken – dort erscheint der QR-Code zum Mitspielen.
3. Handys scannen den QR-Code (gleiches WLAN), Teams bilden, **Spiel starten**.

Für Zugriff übers Internet (z. B. Handys mit mobilen Daten): `./start.sh online` – siehe [Betrieb](docs/betrieb.md).

## Dokumentation

| Kapitel | Für wen |
|---|---|
| [Spieleabend durchführen](docs/spielleitung.md) | Regie & Moderator: Ablauf, Checkliste, Tipps |
| [Spielregeln](docs/spielregeln.md) | Alle: Runden, Bonuswürfel, Sonderfelder, Mutproben (Liane, Fässer oder Kisten, Lavahöhle), Totenkopf und Vulkan-Inneres, Kraterloch, Vulkanausbruch, Sieg |
| [Inhalte erstellen](docs/inhalte.md) | Vorbereitung: Spiele, Fragen, Feld-Minispiele, Import/Export |
| [Betrieb & Installation](docs/betrieb.md) | Technik: Docker, WLAN, Internet, Server, Backups, Fehlerbehebung |
| [Architektur](docs/architektur.md) | Entwickler: Aufbau, Datenfluss, Erweiterungen |
| [Entwicklung](docs/entwicklung.md) | Entwickler: lokal starten, Tests, Werkzeuge |
| [Umstieg von Version 1](docs/umstieg.md) | Was aus der alten Flask-Version wurde |

## Technik in Kürze

TypeScript-Monorepo: **Spiel-Engine** (reine Logik, getestet) · **Server** (Fastify, Socket.IO, SQLite) · **Weboberfläche** (React, Tailwind, Three.js/WebGL mit Nachbearbeitung). Alle Bibliotheken und Assets liegen lokal – das Spiel funktioniert auch ohne Internet. 3D-Modelle, Texturen, Himmel und Geräusche sind frei lizenziert (überwiegend CC0 von Kenney, Quaternius, Poly Haven und ambientCG, einige Tiere CC-BY mit Namensnennung); Musik, Effekte und Sprecher wurden für das Projekt mit ElevenLabs erzeugt – siehe [Lizenzen](packages/web/public/assets/LICENSES.md).

Die ursprüngliche Flask-Version (v1) liegt im Ordner [`legacy/`](legacy/) und in der Git-Historie.
