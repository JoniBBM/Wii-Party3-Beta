# Entwicklung

## Voraussetzungen

- Node.js ≥ 22.12 und npm
- Optional: Docker (für das Produktions-Image)

## Lokal starten

```bash
npm install
cp .env.example .env     # ADMIN_PASSWORD setzen (oder AUTH_DISABLED=true zum Testen)
npm run dev              # Server (Port 8080, neu laden bei Änderungen) + Vite (Port 5173)
```

Dann `http://localhost:5173` öffnen. Vite leitet `/api`, `/media` und `/socket.io` an den Server weiter. Die Entwicklungsdaten liegen in `data/` (wie im Betrieb).

> Hinweis: Der Server liest seinen Port aus `INSEL_PORT` (hat Vorrang) bzw. `PORT`. Das Dev-Skript setzt `INSEL_PORT=8080`, damit Werkzeuge, die `PORT` setzen, nicht stören.

## Befehle

| Befehl | Wirkung |
|---|---|
| `npm run dev` | Entwicklungsserver (Server + Web) |
| `npm run build` | Weboberfläche (`packages/web/dist`) und Server-Bundle (`packages/server/dist`) bauen |
| `npm start` | Gebautes Projekt starten (`node packages/server/dist/main.js`) |
| `npm test` | Vitest: Engine-Tests und Server-Integrationstest |
| `npm run typecheck` | TypeScript für alle Pakete |
| `npm run import:legacy` | Inhalte aus `legacy/` neu nach `packages/server/seed/legacy-content.json` übernehmen |

## Tests

- **Engine** (`packages/shared/src/engine/engine.test.ts`): kompletter Spielablauf, alle Inhaltsarten, Sonderfelder, Vulkan, Siegregeln, Rechte, Projektion.
- **Server** (`packages/server/src/server.test.ts`): echter Server mit echten WebSockets – Anmeldung, PIN-Beitritt, Frage, Auflösung, Würfeln, Animationssperre, Rückgängig.
- **Browser** (`e2e/`, Playwright, nach `npm run build` und `npx playwright install chromium`):
  - `node e2e/flow.mjs [ordner]` – Regie + 4 Handys + Moderator + Beamer spielen eine Runde, mit Screenshots und Prüfung der Browser-Konsolen; der Beamer wird dabei per Code aus der Regie freigegeben.
  - Die übrigen Skripte geben ihrem Beamer einen Zugang über `/api/auth/beamer-link` und `/beamer#bt=…` – ohne zeigt ein Beamer nur die Insel und einen Kopplungscode.
  - `node e2e/beamer.mjs [ordner]` – steuert ein Spiel per WebSocket und fotografiert den Beamer in allen Phasen (Lobby, Frage, Würfel, Ausbruch, Sieg).
  - `node e2e/screens.mjs [ordner]` – Galerie aller Oberflächen in typischen Größen (auch für die Doku).
  - `node e2e/hazards.mjs [ordner]` – spielt die Inselgefahren durch (Kisten brechen ein, Schwimmen, Kraterloch, Klettern, Herauskommen) und fotografiert den Beamer.
  - `node e2e/stunts.mjs [ordner] [szenen]` – alle Feld-Auftritte als Bildfolgen (`feder, flugzeug, ufo, kaefig, buehne, geysir, liane, fluss, hoehle, totenkopf`; die Höhle führt durchs Vulkan-Innere bis zum Ausgang) und Rückgängig mitten im Auftritt.
  - `node e2e/camera.mjs [runden] [ordner]` – Kameraprüfung über eine Partie: Abstand zum Gelände, verdeckte Bilder, Drehrate, Beschleunigung; Fotos bei verdeckter Sicht.
  - `node e2e/soak.mjs [runden]` – Dauertest: komplette Partie bis zum Sieg, prüft Fehler und Speicherwachstum.
  - `node e2e/show.mjs [ordner] [teile]` – Beamer-Show: Fernsteuerung aus der Regie (Grafikstufe, Kamera, Maus, Neu laden), Spielerklärung komplett, Foto-Blasen, Reaktion nach dem Zug, Siegerpodest (auch nach Neuladen); auch Ultra, Auflösung, festes Musikstück, Quatschkopf, Vulkan-Inneres über ein Totenkopf-Feld; Teile: `remote,erklaerung,blasen,reaktion,vulkan,sieg`.
  - `node e2e/fps.mjs` – Bildrate und Zeichenaufrufe des Beamers in allen Grafikstufen.
  - `node e2e/perfprobe.mjs [adresse]` – Aufschlüsselung der Zeichenaufrufe je Gruppe und Bildrate mit einzeln abgeschalteten Teilen.
  - `node e2e/animals-look.mjs shots.json ordner [zoo]` / `node e2e/animals-perf.mjs` – Tiere fotografieren bzw. ihren Leistungsanteil messen.
  - Vulkan-Inneres einzeln ansehen: `npm run dev -w @insel/web`, dann `/inside-preview.html?shot=overview|plate3|portal|drop&quality=eco|balanced|high|ultra&length=9&shout=4` (`fx=burst|warp` löst Effekte aus, `figs=0` ohne Figuren, `hud=0` ohne Messwerte; Werte in `window.__inside.stats`).
  - `node e2e/look.mjs bild.png x y z blickX blickY blickZ` – Beamer-Kamera frei setzen (Debug, `?debug` stellt `window.__board` bereit; `?zoo` stellt alle Tiere zur Kontrolle auf).

## Konventionen

- Oberfläche, Kommentare und Dokumentation auf **Deutsch**, Bezeichner im Code auf **Englisch**.
- Spiellogik gehört in die Engine (`packages/shared`), nicht in Routen oder Komponenten.
- Neue Befehle: Schema in `schemas.ts`, Rechte in `engine/permissions.ts`, Umsetzung in der Engine, Test dazu.
- Assets nur mit freier Lizenz (CC0 bevorzugt, CC-BY nur mit Namensnennung) und Eintrag in `packages/web/public/assets/LICENSES.md`.

## Ton & Kommentator (ElevenLabs)

Musik (`public/assets/audio/music/`), Effekte (`audio/fx/`) und Sprache (`public/assets/voice/`) wurden einmalig mit ElevenLabs erzeugt und liegen als MP3 im Projekt – zur Laufzeit braucht das Spiel keinen Dienst.

- Kommentator-Texte und Spielerklärung stehen in `packages/web/src/board/voice-lines.ts` (Stimme „DiMario – Moderator“, Modell *eleven_v3*; `[laughs]` usw. sind Regieanweisungen und werden in Untertiteln ausgeblendet). Wer einen Text ändert, muss die Datei `voice/<id>.mp3` neu erzeugen (Kosten: ca. 1 Credit je Zeichen).
- Neue Effekte als `audio/fx/<name>.mp3` ablegen und den Namen in `FX` in `board/audio.ts` eintragen – Lautheit gleicht die Ton-Engine selbst an.
- Umgebungsschleifen (`audio/ambience/strand|dschungel|vulkan.mp3`) wurden als nahtlose Schleifen erzeugt (Sound Effects v2, `loop`).
- Musikstücke: Liste `MUSIC_TRACKS` in `packages/shared/src/show.ts` (Datei `audio/music/<id>.mp3`, Stimmung lobby/insel/spannung/vulkan/finale) – neue Stücke dort eintragen, die Regie zeigt sie automatisch an.
