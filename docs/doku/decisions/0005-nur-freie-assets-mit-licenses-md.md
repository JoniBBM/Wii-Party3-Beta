---
title: Nur freie Assets mit LICENSES.md
date: 2026-10-05
status: accepted
affects: [medien, insel, tiere, weltall, szene]
---
**Kontext:** Die 3D-Welt braucht viele fertige Bausteine – Pflanzen, Gebäude, Tiere, Himmelsbilder, Materialtexturen, Geräusche. Selbst bauen wäre zu aufwendig. Das Repository ist öffentlich, und das Spiel soll auch ohne Internet laufen (z. B. auf einer Freizeit mit Laptop und WLAN).

**Entscheidung:** Ins Projekt kommen nur Assets mit **freier Lizenz**, und jedes wird in `packages/web/public/assets/LICENSES.md` mit Quelle, Urheber und Lizenz eingetragen ([[medien]]).

- **CC0** (gemeinfrei, keine Pflichten) wird bevorzugt: Kenney, Quaternius, Poly Haven, ambientCG, Musik von OpenGameArt.
- **CC BY** (Namensnennung) nur, wenn es nicht anders geht – die Namensnennung steht dann in LICENSES.md (zurzeit: Bambus und zwei Schildkröten von „Poly by Google“).
- Einzelne Ausnahmen mit ähnlich freier Lizenz werden genauso eingetragen (die Wasser-Normalenkarte aus three.js steht unter der MIT-Lizenz, die Schriften unter der SIL Open Font License).
- Eigens erzeugte Dateien (Sprache, Insel-Musik, Effekte mit ElevenLabs) stehen ebenfalls in LICENSES.md, siehe [[0006-sprache-und-musik-als-dateien-im-projekt]].
- Alles liegt **lokal im Projekt** und wird vom eigenen Server ausgeliefert – keine Abrufe bei fremden Diensten zur Laufzeit.

**Folgen:**
- Das Spiel läuft offline, und das Repository kann öffentlich bleiben.
- Vor jedem neuen Asset: Lizenz auf der Quellseite prüfen, Eintrag in LICENSES.md schreiben. Modelle werden möglichst unverändert übernommen und erst zur Laufzeit skaliert oder umgefärbt.
- Das Repository ist dadurch groß (Assets rund 130 MB, vor allem Musik, Sprache und Ultra-Texturen).
- Für die Blockwelt gilt zusätzlich: nichts aus Minecraft, siehe [[0004-eigene-pixel-texturen-statt-minecraft-originalen]].
