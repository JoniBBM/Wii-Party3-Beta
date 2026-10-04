# Architektur

## Überblick

```mermaid
flowchart LR
  subgraph Geräte
    B[Beamer<br/>/beamer]
    R[Regie<br/>/regie]
    M[Moderator<br/>/moderator]
    H[Handys<br/>/team]
  end
  subgraph Server [Server · Node.js]
    REST[REST /api/*<br/>Bibliothek, Spiele, Login, Fotos]
    LIVE[Socket.IO<br/>Befehle & Live-Zustand]
    RT[GameRuntime<br/>aktives Spiel im Speicher]
    ENG[[Spiel-Engine<br/>@insel/shared]]
    DB[(SQLite<br/>data/insel.db)]
  end
  R & M & H -- Befehle --> LIVE
  LIVE --> RT --> ENG
  RT -- Snapshot --> DB
  RT -- Zustand je Rolle + Effekte --> LIVE
  LIVE -- state / effects --> B & R & M & H
  R & M -- CRUD --> REST --> DB
```

**Grundprinzip:** Der Server ist die einzige Quelle der Wahrheit. Geräte schicken **Befehle** (z. B. `dice.roll`), die Engine berechnet daraus den **neuen Zustand** und eine Liste von **Effekten** (z. B. „Würfel 4 + 2“, „Figur läuft 6 Felder“, „Katapult“). Der Server speichert den Zustand, schickt jedem Gerät seine **gefilterte Sicht** und allen die Effekte für Animationen und Sounds.

## Monorepo

```
packages/
  shared/   Spiel-Engine, Typen, Schemas (zod), Brett-Generator – reine Logik, keine I/O
  server/   Fastify (REST) + Socket.IO (Live), SQLite, Auth, Fotos, Seed-Daten
  web/      React-Oberflächen + 3D-Insel (Three.js)
docs/       diese Dokumentation
e2e/        Browser-Tests und Screenshot-Werkzeuge (Playwright)
legacy/     alte Flask-Version (nur Referenz)
```

## Spiel-Engine (`packages/shared`)

- `applyCommand(state, command, actor, ctx) → { state, effects, meta, label }` – eine **reine Funktion**. Zeit, Zufall, IDs und Bibliothek kommen über den `EngineContext`; dadurch sind alle Abläufe deterministisch testbar.
- **Zustand** (`GameState`): Teams, Spieler, Phase, Runde, Vulkan, gespielte Inhalte, Verlauf, Ereignis-Ticker. Die Phase ist eine diskriminierte Union: `lobby → idle → content → results → dice → round_end → … → finished`.
- **Befehle** (`commandSchema`): rund 45 Befehle, validiert mit zod. `COMMAND_ROLES` legt fest, welche Rolle was darf; Feinprüfungen („nur das eigene Team“) macht die Engine.
- **Effekte** (`EffectInput`): beschreiben *was passiert ist*, damit der Beamer es inszenieren kann. `durations.ts` schätzt die Animationsdauer – so weiß der Server, wann das nächste Team würfeln darf.
- **Projektion** (`projectState`): Regie & Moderator sehen alles; Beamer und Handys bekommen keine Lösungen vor der Auflösung, keine fremden Antworten, keine fremden PINs.
- **Brett** (`board.ts`): deterministische Verteilung der Sonderfelder per Seed. Die Verteilung wird in der Spielkonfiguration gespeichert und ändert sich nur bewusst.

Module: `engine/teams.ts` (Lobby, Teams, Spieler), `engine/content.ts` (Inhalte, Antworten, Buzzer, Platzierung), `engine/dice.ts` (Würfeln, Sonderfelder, Vulkan, Sieg), `engine/draw.ts` (faire Auslosung), `answers.ts` (tolerante Textauswertung), `selectors.ts` (Rangliste, Statistik).

## Server (`packages/server`)

| Datei | Aufgabe |
|---|---|
| `main.ts` | Start: DB, Seed, Runtime, Fastify, Socket.IO, statische Auslieferung der Weboberfläche |
| `runtime.ts` | Aktives Spiel im Speicher, Befehle ausführen, speichern, **Rückgängig** (40 Schritte), Countdown-Timer |
| `live.ts` | Socket.IO: Sitzung prüfen, Befehle annehmen, Zustand je Rolle senden, Geräte-Anwesenheit |
| `db.ts` | SQLite-Schema (Migrationen über `user_version`) und Zugriffe |
| `auth.ts` | Signierte Tokens (HMAC), Passwortprüfung, einfache Bremse gegen Raten |
| `http/*` | REST: Login, Bibliothek, Spiele & Vorlagen, Fotos, System |
| `seed.ts` | Erster Start: Beispiel- und Import-Inhalte, Standard-Vorlagen |
| `legacy.ts`, `tools/import-legacy.ts` | Übernahme der alten Inhalte |

**Datenhaltung:** Bibliothek (`collections`, `items`) und `templates` sind normale Tabellen. Ein Spiel wird als JSON-Snapshot in `games.state` gespeichert (nach jeder Änderung); `game_log` protokolliert alle Befehle.

**Sitzungen:** Geräte erhalten ein Token (`admin`, `moderator`, `team`, `player`) und speichern es im `localStorage`. Team- und Spieler-Tokens gelten nur für das Spiel, in dem sie ausgestellt wurden. Der Beamer braucht kein Token.

**Live-Protokoll (Socket.IO):**

| Richtung | Ereignis | Inhalt |
|---|---|---|
| Client → Server | `cmd` | Befehl, Antwort per Ack `{ ok, error?, meta? }` |
| Client → Server | `undo` | nur Regie |
| Server → Client | `hello` | App-Name, Serverzeit |
| Server → Client | `state` | `{ state, session, serverNow, undo? }` – kompletter, gefilterter Zustand |
| Server → Client | `effects` | Liste von Effekten mit fortlaufender ID |
| Server → Client | `presence` | verbundene Geräte je Team (nur Regie/Moderator) |
| Server → Client | `changed` | Bibliothek/Spiele/Einstellungen geändert (nur Regie/Moderator) |

## Weboberfläche (`packages/web`)

| Bereich | Ordner |
|---|---|
| Startseite, Beitritt | `pages/Home.tsx`, `pages/join/` |
| Team-Handy | `pages/team/` |
| Regie | `pages/regie/` (Live, Teams, Spiel einrichten, Bibliothek, Spiele, Einstellungen) |
| Moderator | `pages/moderator/` – nutzt dieselben Steuer-Panels wie die Regie (`game/`) |
| Beamer | `pages/beamer/` (HUD, Einblendungen) + `board/` (3D) |
| Gemeinsame Bausteine | `ui/` (Knöpfe, Dialoge, Toasts, Teamfarben, Würfel, QR, Countdown), `lib/` (Live-Store, API, Theme) |
| Figuren | `figure/` – Mii-artige Figuren aus Grundkörpern, Editor, Vorschau, Schnappschüsse |

Zustand: `zustand`-Store (`lib/live.ts`) mit Socket-Verbindung; Effekte als Ereignis-Bus (`onEffects`).

Design: Tailwind 4 mit semantischen Farb-Variablen (`styles.css`), hell im Wii-Stil, Dunkelmodus für Regie/Moderator. Schriften (Fredoka, Nunito) sind lokal eingebunden.

## 3D-Insel (`packages/web/src/board`)

| Modul | Inhalt |
|---|---|
| `layout.ts` | Inselplan: Weg (Catmull-Rom) vom Hafen bis zum Gipfel, Felder gleichmäßig nach Bogenlänge, Fluss, Brücke, Hafen |
| `terrain.ts` | Höhenfeld (Küste, Hügel, Vulkan, Krater, Weg-Terrasse, Flussbett), Vertex-Farben |
| `water.ts` | Meer (Gerstner-Wellen, Tiefenfarbe über Höhen-Textur, Küstenschaum) und Fluss |
| `props.ts`, `assets.ts` | CC0-Modelle laden, umfärben, instanziert verteilen, Wind; Wahrzeichen; Hängebrücke |
| `fields.ts` | Spielfelder (instanziert), gezeichnete Symbole, Markierung des aktiven Feldes |
| `pieces.ts` | Figuren: Aufstellung auf Feldern, Laufen, Fliegen, Käfig, Namensschilder |
| `camera.ts` | Kameraführung: Rundfahrt, Verfolgen, Nahaufnahmen, Wackeln |
| `dice3d.ts` | 3D-Würfel als Overlay |
| `volcano.ts`, `particles.ts` | Lavasee, Rauch, Ausbruch, Konfetti, Feuerwerk, Staub |
| `director.ts` | Spielt Effekte der Reihe nach ab, gleicht nach Rückgängig/Neuverbindung ab, liefert Einblendungen |
| `audio.ts` | Effekte (Kenney), Meeresrauschen und Vögel (Synthese), generative Marimba-Musik |
| `scene.ts` | Renderer, Licht, HDRI-Himmel, Nachbearbeitung (N8AO, Bloom, Tilt-Shift, Vignette, SMAA), Qualitätsstufen |

## Erweitern

**Neuer Inhaltstyp** (z. B. Sortierfrage):
1. `CONTENT_KINDS`/`CONTENT_KIND_INFO` in `shared/src/constants.ts` ergänzen.
2. Interface in `types.ts`, Schema in `schemas.ts` (`contentItemInputSchema`), `buildItem` in `defaults.ts`.
3. Auswertung in `engine/content.ts` (`evaluate`, `computeQuestionRanking`), Projektion in `engine/project.ts` (Lösung verbergen).
4. UI: Editor (`pages/regie/ItemEditor.tsx`), Handy (`pages/team/TeamPlay.tsx`), Beamer (`pages/beamer/Overlays.tsx`), Regie (`game/ContentControl.tsx`).
5. Tests in `engine/engine.test.ts`.

**Neues Sonderfeld:**
1. `FIELD_TYPES` und `FIELD_INFO` in `constants.ts`.
2. Wirkung in `engine/dice.ts` (`applyField`), ggf. neue Effektart in `types.ts` und Dauer in `durations.ts`.
3. Symbol in `board/fields.ts` (`ICONS`), Inszenierung in `board/director.ts`.
4. Häufigkeit in `board.ts` (`defaultFieldCounts`).
