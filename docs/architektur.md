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
- **Inselplan** (`island.ts`): die Insel in 2D – Küstenlinie, Lagune, Fluss mit Wasserfall und Furt, Schlucht, Vulkan mit Kraterrand und der Weg (Wegpunkte + Serpentinen als Catmull-Rom-Kurve). `buildIslandPlan(felder)` verteilt die Felder nach Bogenlänge und bestimmt aus der Geometrie die festen Inselfelder: **Liane** (`vine`), **Fässer in der Furt** (`river`), **Lavahöhle** (`cave`, mit Ausgangsfeld `caveExit`) und **Kraterloch** (`crater`). Engine, Brett-Editor (Karte) und 3D-Insel nutzen denselben Plan.
- **Liane**: Landet ein Team auf `vine`, setzt die Engine `dice.vine` und wartet auf den Befehl `vine.roll` (Team am Handy oder Regie); erst danach geht die Runde weiter.
- **Ältere Spielstände**: `upgradeConfig`/`upgradeState` (`defaults.ts`) ergänzen neue Regeln und Team-Felder beim Laden aus der Datenbank.

Module: `engine/teams.ts` (Lobby, Teams, Spieler), `engine/content.ts` (Inhalte, Antworten, Buzzer, Platzierung), `engine/dice.ts` (Würfeln, Sonderfelder, Fässer im Fluss, Kraterloch, Vulkan, Sieg), `engine/draw.ts` (faire Auslosung), `answers.ts` (tolerante Textauswertung), `selectors.ts` (Rangliste, Statistik).

## Server (`packages/server`)

| Datei | Aufgabe |
|---|---|
| `main.ts` | Start: DB, Seed, Runtime, Fastify, Socket.IO, statische Auslieferung der Weboberfläche |
| `runtime.ts` | Aktives Spiel im Speicher, Befehle ausführen, speichern, **Rückgängig** (40 Schritte), Countdown-Timer |
| `live.ts` | Socket.IO: Sitzung prüfen, Befehle annehmen, Zustand je Rolle senden, Geräte-Anwesenheit, **Beamer-Show** (Einstellungen der Regie speichern und an alle Beamer senden, Rückmeldungen der Beamer an die Regie) |
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
| Client → Server | `show` | Beamer-Show steuern (nur Regie/Moderator): `set` (Teil-Einstellungen), `reset`, `explain` (Erklärung starten/stoppen), `test` (Testton), `reload`, `camera` (feste Einstellung, Schubsen, Automatik) |
| Server → Client | `show` | `{ settings, explainer }` – an alle; Einstellungen liegen in `settings.show` (geprüft mit `parseShow`) |
| Server → Client | `show:test`, `show:cmd` | einmalige Befehle an die Beamer (Testton, Kamera, Neu laden) |
| Beamer → Server | `beamer:stats`, `beamer:explained` | Bildrate, Grafikstufe, Auflösung, Ton frei?, Vollbild, freie Kamera; Erklärung fertig |
| Server → Client | `beamers` | Rückmeldungen aller Beamer (nur Regie/Moderator) |

**Reaktionen:** Am Ende jedes Zuges hängt die Engine einen Effekt `react` mit Stimmung (`super`, `happy`, `ok`, `meh`, `sad`, `angry`, `shock`, siehe `moodAfterTurn`) an; die Dauer ist in `effectDuration` eingerechnet. Schaltet die Regie Reaktionen ab, setzt die Laufzeit `ctx.reactions = false` und der Effekt entfällt.

## Weboberfläche (`packages/web`)

| Bereich | Ordner |
|---|---|
| Startseite, Beitritt | `pages/Home.tsx`, `pages/join/` |
| Team-Handy | `pages/team/` |
| Regie | `pages/regie/` (Live, Beamer, Teams, Spiel einrichten, Bibliothek, Spiele, Einstellungen) |
| Beamer-Fernsteuerung | `game/BeamerControl.tsx` (ganze Seite und Kurzfassung für Live/Moderator) |
| Moderator | `pages/moderator/` – nutzt dieselben Steuer-Panels wie die Regie (`game/`) |
| Beamer | `pages/beamer/` (HUD, Einblendungen, `useShowControl.ts` setzt die Regie-Einstellungen um, `Explainer.tsx` Spielerklärung, `PhotoBubbles.tsx` Foto-Blasen) + `board/` (3D) |
| Gemeinsame Bausteine | `ui/` (Knöpfe, Dialoge, Toasts, Teamfarben, Würfel, QR, Countdown), `lib/` (Live-Store, API, Theme, `shake.ts` – Würfeln durch Schütteln über den Bewegungssensor) |
| Figuren | `figure/` – Mii-artige Figuren aus Grundkörpern, Editor, Vorschau, Schnappschüsse |

Zustand: `zustand`-Store (`lib/live.ts`) mit Socket-Verbindung; Effekte als Ereignis-Bus (`onEffects`).

Design: Tailwind 4 mit semantischen Farb-Variablen (`styles.css`), hell im Wii-Stil, Dunkelmodus für Regie/Moderator. Schriften (Fredoka, Nunito) sind lokal eingebunden.

## 3D-Insel (`packages/web/src/board`)

| Modul | Inhalt |
|---|---|
| `ground.ts` | Natürliche Geländeform: Abstand zur Küste (vorberechnet), Strände, Riff, Hochebenen und Klippen, Tempelhügel, Felsstufe am Wasserfall, Lagune, Inselchen, Vulkan (Sockel, Kegel mit Graten, Krater mit Lavagrube), Lavastrom |
| `layout.ts` | 3D-Plan: gemeinsamer Inselplan + Höhen. Der Weg folgt dem Gelände (geglättet), steigt in den Serpentinen gleichmäßig, liegt auf den Fässern, der Hängebrücke und dem Kraterrand |
| `terrain.ts` | Höhenfeld (natürliche Form + Wegterrassen + Flussbett mit Ufern, Wasserfallbecken, Schlucht), Vertex-Farben, Glut-Attribut |
| `worldfx.ts` | Gemeinsame Shader-Bausteine: ziehende Wolkenschatten, Lichtnetze am Meeresgrund, Gesteinsschichten an Felswänden, Glühen |
| `water.ts` | Meer (Gerstner-Wellen, durchsichtiges Flachwasser, Brandung, Glitzern), Fluss mit Stromschnellen, Wasserfall mit Gischt |
| `sky.ts` | Himmelskuppel mit Sonnenglanz, Haufenwolken, Nachbarinseln am Horizont |
| `props.ts`, `assets.ts`, `grass.ts` | Bepflanzung (Palmen, Dschungel, Farne, Monstera, Bambus, Blumenbeete, Felsen, Seerosen, Schilf), Grasteppich auf der GPU, Wind |
| `landmarks.ts`, `merge.ts` | Hafendorf, Stufenpyramide, Säulenallee, Tempelruine, Steinköpfe, Leuchtturm, Hängebrücke, Fässer in der Furt, Seil-Geländer, Strickleiter im Krater, Felsbogen, Wrack, Schiffe, Regenbogen; statische Teile werden zu wenigen Draw-Calls zusammengefasst |
| `stunts.ts` | Auftritte der Felder: Liane am Riesenbaum, Lavahöhle (Eingang, Fledermäuse, Felsentor), Sprungfeder, Doppeldecker mit Strickleiter und Fallschirm, UFO mit Traktorstrahl, Minispiel-Schild, Dampf-Geysir. Vorübergehende Objekte werden nach dem Auftritt bzw. bei Rückgängig entfernt und freigegeben. |
| `animals.ts`, `rig.ts`, `monkey.ts`, `birds.ts`, `swarms.ts` | Tiere: Delfine, Wal, Mantas, Schildkröten, Krabben, Frösche (Modelle mit Animationen) · Affen, Papageien, Tukane, Möwen, Flamingos prozedural als eine SkinnedMesh mit starrer Gewichtung je Tier (ein Draw-Call, Verhalten mit weichen Übergängen) · Fischschwärme und Schmetterlinge instanziert, Bewegung im Vertex-Shader. Tiere außerhalb des Blickfelds werden nur jedes 4. Bild bewegt, unter Wasser wirft nichts Schatten (`?zoo` zeigt alle Arten und Verhalten zur Kontrolle) |
| `ambient.ts` | Fackeln, Lagerfeuer, Rauch und Dampf als Shader-Partikel |
| `fields.ts` | Spielfelder (instanziert), gezeichnete Symbole, Markierung des aktiven Feldes |
| `pieces.ts` | Figuren: Aufstellung, Laufen, Fliegen, Käfig, Balancieren, ins Wasser fallen und treiben, in den Krater fallen und klettern, Reaktionen (Salto, Jubel, Winken, Schulterzucken, Ärger, Schreck, Trauer), Vorführ-Figuren der Erklärung |
| `camera.ts`, `manual.ts` | Kameraführung: Rundflug im Leerlauf, Verfolgen (Vulkan im Hintergrund), Nahaufnahmen, Großaufnahme für Reaktionen, Wackeln. Stil *ruhig*/*lebhaft*, weiche Federbewegung, begrenzte Drehrate, nie unter dem Gelände, Sichtprüfung mit Ausweichen und Anheben während der Fahrt; freie Kamera per Maus/Touch/Tastatur (`manual.ts`) oder aus der Regie, danach zurück zur Automatik; Messwerte in `rig.stats` |
| `ceremony.ts` | Siegerehrung: Podest steigt aus dem Krater, die Besten fliegen aufs Treppchen, Scheinwerfer, Feuerwerk, Saltos, Kamerafahrt |
| `commentator.ts`, `voice-lines.ts` | Kommentator: wählt zu Ereignissen passende Sprüche (ohne Wiederholung, Häufigkeit aus der Regie); Texte und Spielerklärung in `voice-lines.ts`, Sprachdateien unter `public/assets/voice/` |
| `dice3d.ts` | 3D-Würfel als Overlay |
| `volcano.ts`, `particles.ts` | Lavasee, Lavastrom, Glut, Rauch, Ausbruch, Spritzwasser, Konfetti, Feuerwerk, Staub |
| `director.ts` | Spielt Effekte der Reihe nach ab, gleicht nach Rückgängig/Neuverbindung ab, liefert Einblendungen |
| `audio.ts` | Vier Spuren mit eigener Lautstärke: Effekte (Kenney + ElevenLabs, lautheitsangeglichen, Stille am Anfang abgeschnitten), Musik (gestreamt, weiche Überblendung beim Wechsel und beim Wiederholen), Sprache (Musik wird leiser), Umgebung (Meeresrauschen, Vögel als Synthese) |
| `scene.ts` | Renderer, Licht, Nachbearbeitung (N8AO, Bloom, Tilt-Shift, Vignette, Farbanpassung, SMAA), Grafikstufen *Schön/Ausgewogen/Sparsam* live umschaltbar (Auflösung, Schattenkarte und wie oft sie neu gezeichnet wird, Nachbearbeitung, Grasdichte); Bildrate in `scene.fps` |

Messen: `?perf=noao,nograss,nopost,msaa` schaltet einzelne Teile zum Vergleichen ab bzw. zu; `?noprops`, `?noanimals` lassen Deko bzw. Tiere weg; `?quality=high|balanced|eco` erzwingt auf diesem Gerät eine Grafikstufe. Kleine Deko (unter 1 m) und Kleinteile der Figuren werfen keinen Schatten.

## Erweitern

**Neuer Inhaltstyp** (z. B. Sortierfrage):
1. `CONTENT_KINDS`/`CONTENT_KIND_INFO` in `shared/src/constants.ts` ergänzen.
2. Interface in `types.ts`, Schema in `schemas.ts` (`contentItemInputSchema`), `buildItem` in `defaults.ts`.
3. Auswertung in `engine/content.ts` (`evaluate`, `computeQuestionRanking`), Projektion in `engine/project.ts` (Lösung verbergen).
4. UI: Editor (`pages/regie/ItemEditor.tsx`), Handy (`pages/team/TeamPlay.tsx`), Beamer (`pages/beamer/Overlays.tsx`), Regie (`game/ContentControl.tsx`).
5. Tests in `engine/engine.test.ts`.

**Neues Sonderfeld:**
1. `FIELD_TYPES` und `FIELD_INFO` in `constants.ts` (feste Inselfelder zusätzlich in `LANDMARK_FIELD_TYPES` und `island.ts`).
2. Wirkung in `engine/dice.ts` (`applyField`), ggf. neue Effektart in `types.ts` und Dauer in `durations.ts`.
3. Symbol in `board/fields.ts` (`ICONS`), Inszenierung in `board/director.ts`.
4. Häufigkeit in `board.ts` (`defaultFieldCounts`).
