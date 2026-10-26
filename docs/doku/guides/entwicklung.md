---
title: Entwicklung
order: 70
audience: Entwicklung
summary: Lokal entwickeln, testen und erweitern – Befehle, Tests, Prüfskripte, Ton und Sprache, Lizenzen.
---
# Entwicklung

## Voraussetzungen

- Node.js ab 22.12 und npm
- Optional: Docker (für das Produktions-Abbild)
- Für Browser-Tests einmalig: `npx playwright install chromium`

## Lokal starten

```bash
npm install
cp .env.example .env     # ADMIN_PASSWORD setzen (oder AUTH_DISABLED=true zum Testen)
npm run dev              # Server (Port 8080, lädt bei Änderungen neu) + Vite (Port 5173)
```

Dann `http://localhost:5173` öffnen. Vite leitet `/api`, `/media` und `/socket.io` an den Server weiter. Die Entwicklungsdaten liegen in `data/` (wie im Betrieb).

> Der Server liest seinen Port aus `INSEL_PORT` (hat Vorrang) bzw. `PORT`. Das Dev-Skript setzt `INSEL_PORT=8080`, damit Werkzeuge, die `PORT` setzen, nicht stören. Der Docker-Container belegt am Rechner 9534 – beides kollidiert nicht.

## Aufbau in Kürze

```
packages/
  shared/   Spiel-Engine, Typen, Schemas (zod), Spielfeld – reine Logik ohne Ein-/Ausgabe
  server/   Fastify (REST) + Socket.IO (Echtzeit), SQLite, Anmeldung, Fotos, Startinhalte
  web/      React-Oberflächen + 3D-Spielwelt (three.js)
e2e/        Browser-Tests und Bildschirmfoto-Werkzeuge (Playwright)
legacy/     alte Flask-Version (nur Referenz)
docs/doku/  diese Doku
```

Den Überblick über alle Bausteine liefert `node .claude/doku/doku.mjs summary`.

## Befehle

| Befehl | Wirkung |
|---|---|
| `npm run dev` | Entwicklungsserver (Server + Web) |
| `npm run build` | Weboberfläche (`packages/web/dist`) und Server-Bundle (`packages/server/dist`) bauen |
| `npm start` | Gebautes Projekt starten (`node packages/server/dist/main.js`) |
| `npm test` | Vitest: Engine-Tests und Server-Integrationstests |
| `npm run typecheck` | TypeScript-Prüfung für alle Pakete |
| `npm run import:legacy` | Inhalte aus `legacy/` neu nach `packages/server/seed/legacy-content.json` übernehmen |
| `npm run audio -- list` | Fragen mit Wunsch „Audio erstellen“ anzeigen (siehe unten) |
| `npm run e2e` | Bauen und den Browser-Durchlauf `e2e/flow.mjs` starten |
| `npm run screens` | Weboberfläche bauen und eine Bildergalerie aller Oberflächen erzeugen |

## Tests

- **Engine** (`packages/shared/src/engine/engine.test.ts`): kompletter Spielablauf, alle Inhaltsarten, Sonderfelder, Vulkan, Siegregeln, Rechte, Sichten je Rolle.
- **Server** (`packages/server/src/server.test.ts`, `net.test.ts`): echter Server mit echten WebSockets – Anmeldung, PIN-Beitritt, Frage, Auflösung, Würfeln, Animationssperre, Rückgängig, Konten, mehrere Spiele, Abmelden, Passwort vergessen; dazu Adress-Erkennung hinter Tunnel/Proxy und Anmeldebremsen.
- **Browser** (`e2e/`, Playwright, nach `npm run build`):
  - `node e2e/flow.mjs [ordner]` – Regie + 4 Handys + Moderator + Beamer spielen eine Runde, mit Bildschirmfotos und Prüfung der Browser-Konsolen; der Beamer wird dabei per Code aus der Regie freigegeben.
  - `node e2e/logout.mjs` – Spielleiter-Konto in der Regie, Admin meldet es „überall ab“: Die Regie muss sofort (ohne Neuladen) zur Anmeldung springen.
  - `node e2e/layout.mjs [ordner]` – optische Prüfung: alle Seiten (Regie, Dialoge, Moderator, Team-Handy, Beitritt, Beamer) in fünf Breiten (375 px bis 1600 px) und allen Spielphasen und Inhaltsarten; meldet Text, der aus seinem Kasten ragt (seitlich oder unten), und seitliches Scrollen – mit Bildern der Fundstellen.
  - `node e2e/wizard.mjs [ordner]` – geführte Einrichtung komplett durchklicken und prüfen, was im Spiel ankommt.
  - `node e2e/station.mjs [ordner]` – Gruppenmodus mit Anmeldestation, Selfies und Team-Gerät.
  - Die übrigen Skripte geben ihrem Beamer einen Zugang über `/api/auth/beamer-link` und `/beamer#bt=…` – ohne zeigt ein Beamer nur die Insel und einen Kopplungscode.
  - `node e2e/beamer.mjs [ordner]` – steuert ein Spiel per WebSocket und fotografiert den Beamer in allen Phasen (Lobby, Frage, Würfel, Ausbruch, Sieg).
  - `node e2e/screens.mjs [ordner]` – Galerie aller Oberflächen in typischen Größen (auch für die Doku).
  - `node e2e/doku-screens.mjs` – erneuert die Bildschirme im Tab „Oberfläche“ der Doku (Fotos und anklickbare Bereiche in `docs/doku/screens`). Nach Änderungen an Regie, Handy, Moderator oder Beamer laufen lassen; Titel und Texte der Bildschirme bleiben erhalten.
  - `node e2e/shot.mjs <pfad> <bild.png> [breite] [höhe] [admin|moderator]` – schnelles Bildschirmfoto einer Seite.
  - `node e2e/hazards.mjs [ordner]` – spielt die Inselgefahren durch (Kisten brechen ein, Schwimmen, Kraterloch, Klettern, Herauskommen) und fotografiert den Beamer.
  - `node e2e/stunts.mjs [ordner] [szenen]` – alle Feld-Auftritte als Bildfolgen (`feder, flugzeug, ufo, kaefig, buehne, geysir, liane, fluss, hoehle, totenkopf`; die Höhle führt durchs Vulkan-Innere bis zum Ausgang) und Rückgängig mitten im Auftritt.
  - `node e2e/camera.mjs [runden] [ordner]` – Kameraprüfung über eine Partie: Abstand zum Gelände, verdeckte Bilder, Drehrate, Beschleunigung; Fotos bei verdeckter Sicht.
  - `node e2e/soak.mjs [runden]` – Dauertest: komplette Partie bis zum Sieg, prüft Fehler und Speicherwachstum.
  - `node e2e/show.mjs [ordner] [teile]` – Beamer-Show: Fernsteuerung aus der Regie (Grafikstufe, Kamera, Maus, Neu laden), Spielerklärung komplett, Foto-Blasen, Reaktion nach dem Zug, Siegerpodest (auch nach Neuladen); auch Ultra, Auflösung, festes Musikstück, Quatschkopf, Vulkan-Inneres über ein Totenkopf-Feld; Teile: `remote,erklaerung,blasen,reaktion,vulkan,sieg`.
  - `node e2e/blocks.mjs [ordner]` – Rundgang durch die Blockwelt (mit `WORLD=space` durch das Weltall): Handy und Beamer in allen Phasen.
  - `node e2e/worldshot.mjs <ordner> [welt] [blicke]` – Beamer-Bilder einer Welt aus festen Blickwinkeln gegen den Dev-Server (`ATMO='weather=snow&festive=christmas'` für Wetter, `NOUI=1` ohne Oberfläche).
  - `node e2e/fps.mjs` – Bildrate und Zeichenaufrufe des Beamers in allen Grafikstufen.
  - `node e2e/perfprobe.mjs [adresse]` – Aufschlüsselung der Zeichenaufrufe je Gruppe und Bildrate mit einzeln abgeschalteten Teilen.
  - `node e2e/animals-look.mjs shots.json ordner [zoo]` / `node e2e/animals-perf.mjs` – Tiere fotografieren bzw. ihren Leistungsanteil messen.
  - Vulkan-Inneres einzeln ansehen: `npm run dev -w @insel/web`, dann `/inside-preview.html?shot=overview|plate3|portal|drop&quality=eco|balanced|high|ultra&length=9&shout=4` (`fx=burst|warp` löst Effekte aus, `figs=0` ohne Figuren, `hud=0` ohne Messwerte; Werte in `window.__inside.stats`).
  - `node e2e/look.mjs bild.png x y z blickX blickY blickZ` – Beamer-Kamera frei setzen (Fehlersuche; `?debug` stellt `window.__board` bereit, `?zoo` stellt alle Tiere zur Kontrolle auf).

Messschalter am Beamer: `?perf=noao,nograss,nopost,msaa` schaltet einzelne Teile ab bzw. zu; `?noprops`, `?noanimals` lassen Deko bzw. Tiere weg; `?quality=ultra|high|balanced|eco` erzwingt eine Grafikstufe; `?world=blocks` und `?weather=…&season=…&festive=…` zum Ausprobieren.

## Konventionen

- Oberfläche, Kommentare und Dokumentation auf **Deutsch**, Bezeichner im Code auf **Englisch**.
- Spiellogik gehört in die Engine (`packages/shared`), nicht in Routen oder Komponenten.
- Neue Befehle: Schema in `schemas.ts`, Rechte in `engine/permissions.ts`, Umsetzung in der Engine, Test dazu.
- Wünsche und Korrekturen an der Spielwelt immer für **alle Welten** (Insel, Blockwelt, Weltall) umsetzen.
- Assets nur mit freier Lizenz (CC0 bevorzugt, CC-BY nur mit Namensnennung) und Eintrag in `packages/web/public/assets/LICENSES.md`. Keine Original-Texturen, -Töne oder -Musik von Minecraft (öffentliches Repository).
- Geheimnisse (`.env`, `data/`) nie committen; vor einem Push prüfen.
- Doku pflegen: Bei neuen Dateien, Schnittstellen, Abhängigkeiten oder Sicherheitsänderungen `docs/doku/` im selben Commit anpassen und `node .claude/doku/doku.mjs check` ausführen (Skill `doku`).

## Erweitern (Kurzfassung)

**Neuer Inhaltstyp** (z. B. Sortierfrage):
1. `CONTENT_KINDS`/`CONTENT_KIND_INFO` in `shared/src/constants.ts` ergänzen.
2. Typ in `types.ts`, Schema in `schemas.ts` (`contentItemInputSchema`), `buildItem` in `defaults.ts`.
3. Auswertung in `engine/content.ts` (`evaluate`, `computeQuestionRanking`), Sicht in `engine/project.ts` (Lösung verbergen).
4. Oberfläche: Editor (`pages/regie/ItemEditor.tsx`), Handy (`pages/team/TeamPlay.tsx`), Beamer (`pages/beamer/Overlays.tsx`), Regie (`game/ContentControl.tsx`).
5. Tests in `engine/engine.test.ts`.

**Neues Sonderfeld:**
1. `FIELD_TYPES` und `FIELD_INFO` in `constants.ts` (feste Inselfelder zusätzlich in `LANDMARK_FIELD_TYPES` und `island.ts`).
2. Wirkung in `engine/dice.ts` (`applyField`), ggf. neue Effektart in `types.ts` und Dauer in `durations.ts`.
3. Symbol in `board/fields.ts` (`ICONS`), Inszenierung in `board/director.ts` – für jede Welt.
4. Häufigkeit in `board.ts` (`defaultFieldCounts`).

## Ton & Kommentator (ElevenLabs)

Musik (`public/assets/audio/music/`), Effekte (`audio/fx/`) und Sprache (`public/assets/voice/`) wurden einmalig mit ElevenLabs erzeugt und liegen als MP3 im Projekt (Ausnahme: die Musik von Blockwelt und Weltall, freie CC0-Stücke, siehe unten) – zur Laufzeit braucht das Spiel keinen Dienst.

> **Kosten:** Sprache kostet etwa 1 ElevenLabs-Credit je Zeichen. Vor jeder Erzeugung die Kosten abschätzen und das OK des Projektinhabers abwarten.

- Kommentator-Texte und Spielerklärung stehen in `packages/web/src/board/voice-lines.ts` (Stimme „DiMario – Moderator“, Modell *eleven_v3*; `[laughs]` usw. sind Regieanweisungen und werden in Untertiteln ausgeblendet). Wer einen Text ändert, muss die Datei `voice/<id>.mp3` neu erzeugen.
- Neue Sprüche zuerst in `board/voice-lines-new.ts` sammeln (dort ohne Datei harmlos); nach dem Erzeugen der MP3s nach `voice-lines.ts` übernehmen. Tier-Sprüche spielt der Kommentator nur, wenn das Tier gerade im Bild ist.
- **Fragen vorlesen („Audio erstellen“)**: `npm run audio -- list` zeigt die angehakten Fragen samt Vorlesetext und Zeichenzahl (meldet sich mit `ADMIN_PASSWORD` aus `.env` am laufenden Server an; andere Adresse mit `--url`, Ausgabe als JSON mit `--json`). Aufnahme erzeugen (gleiche Stimme, *eleven_v3*) und mit `npm run audio -- attach <id> <datei.mp3>` anhängen; `remove <id>` entfernt sie. Die Dateien liegen in `data/media/audio/` (nicht im Git).
- Neue Effekte als `audio/fx/<name>.mp3` ablegen und den Namen in `FX` in `board/audio.ts` eintragen – die Lautheit gleicht die Ton-Engine selbst an.
- Umgebungsschleifen (`audio/ambience/strand|dschungel|vulkan.mp3`) wurden als nahtlose Schleifen erzeugt (Sound Effects v2, `loop`).
- Musikstücke: Liste `MUSIC_TRACKS` in `packages/shared/src/show.ts` (Datei `audio/music/<id>.<ext>`, Standard `mp3`; Stimmung lobby/insel/spannung/vulkan/finale; Welt `world`, Standard Insel) – neue Stücke dort eintragen, die Regie zeigt sie automatisch an.
- Blockwelt-Musik: `audio/music/block-*.m4a` – freie CC0-Stücke von OpenGameArt im ruhigen Minecraft-Geist (keine Original-Minecraft-Musik und keine Bearbeitungen davon), Quellen in `LICENSES.md`. Die Automatik spielt je Welt nur die eigenen Stücke; hat die Blockwelt für eine Stimmung keins (z. B. Siegerehrung), kommen die der Insel. Neue Stücke ohne ffmpeg mit `afconvert -f m4af -d aac -b 160000 ein.wav aus.m4a` (macOS) umwandeln.
- Weltall-Musik: `audio/music/space-*.m4a` – freie CC0-Stücke von OpenGameArt, freundliche Synth-/Space-Klänge (Lobby, drei Würfel-Stücke, Rätsel-Musik, zwei Stücke für die Kristallhöhle, eigenes Finale), Quellen in `LICENSES.md`; Lautstärke beim Umwandeln auf die Blockwelt-Stücke angeglichen (ca. −17 dBFS RMS). `afconvert` liest auch OGG und FLAC.

## Lizenzen der Assets

3D-Modelle, Texturen, Himmel und Geräusche sind frei lizenziert (überwiegend CC0 von Kenney, Quaternius, Poly Haven und ambientCG, einige Tiere CC-BY mit Namensnennung); Musik, Effekte und Sprecher der Insel wurden für das Projekt mit ElevenLabs erzeugt. Alle Quellen und Namensnennungen stehen in `packages/web/public/assets/LICENSES.md` – jede neue Datei dort eintragen.
