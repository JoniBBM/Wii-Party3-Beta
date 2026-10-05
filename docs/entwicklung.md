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
  - `node e2e/flow.mjs [ordner]` – Regie + 4 Handys + Moderator + Beamer spielen eine Runde, mit Screenshots und Prüfung der Browser-Konsolen.
  - `node e2e/beamer.mjs [ordner]` – steuert ein Spiel per WebSocket und fotografiert den Beamer in allen Phasen (Lobby, Frage, Würfel, Ausbruch, Sieg).
  - `node e2e/screens.mjs [ordner]` – Galerie aller Oberflächen in typischen Größen (auch für die Doku).
  - `node e2e/hazards.mjs [ordner]` – spielt die Inselgefahren durch (Sturz von den Fässern, Treiben, Kraterloch, Klettern, Herauskommen) und fotografiert den Beamer.
  - `node e2e/soak.mjs [runden]` – Dauertest: komplette Partie bis zum Sieg, prüft Fehler und Speicherwachstum.
  - `node e2e/fps.mjs` – Bildrate des Beamers in beiden Qualitätsstufen.
  - `node e2e/look.mjs bild.png x y z blickX blickY blickZ` – Beamer-Kamera frei setzen (Debug, `?debug` stellt `window.__board` bereit; `?zoo` stellt alle Tiere zur Kontrolle auf).

## Konventionen

- Oberfläche, Kommentare und Dokumentation auf **Deutsch**, Bezeichner im Code auf **Englisch**.
- Spiellogik gehört in die Engine (`packages/shared`), nicht in Routen oder Komponenten.
- Neue Befehle: Schema in `schemas.ts`, Rechte in `engine/permissions.ts`, Umsetzung in der Engine, Test dazu.
- Assets nur mit freier Lizenz (CC0 bevorzugt, CC-BY nur mit Namensnennung) und Eintrag in `packages/web/public/assets/LICENSES.md`.
