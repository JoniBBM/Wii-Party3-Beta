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
| `auth.ts` | Signierte Tokens (HMAC), Passwortprüfung (zeitkonstant), Bremse gegen Raten (je Adresse wachsende Sperre) |
| `http/*` | REST: Login, Bibliothek, Spiele & Vorlagen, Fotos, System |
| `seed.ts` | Erster Start: Beispiel- und Import-Inhalte, Standard-Vorlagen |
| `legacy.ts`, `tools/import-legacy.ts` | Übernahme der alten Inhalte |

**Datenhaltung:** Bibliothek (`collections`, `items`) und `templates` sind normale Tabellen. Ein Spiel wird als JSON-Snapshot in `games.state` gespeichert (nach jeder Änderung); `game_log` protokolliert alle Befehle.

**Sitzungen:** Geräte erhalten ein Token (`admin`, `moderator`, `beamer`, `team`, `player`) und speichern es im `localStorage`. Team- und Spieler-Tokens gelten nur für das Spiel, in dem sie ausgestellt wurden. Tokens der Spielleitung und der Beamer tragen `key = staffKey()` (HMAC über die Passwörter) – ein neues Passwort macht sie alle ungültig.

**Sicherheitsmodell:**

- *Rollen:* `guest` sieht nur die Insel (ohne Fotos, Verlauf, Beitritts-Adressen); `beamer` zusätzlich alles, was der Beamer zeigt; Teams/Spieler ihren Teil; Regie/Moderator alles. Gefiltert wird zentral in `projectState` (Engine), Lösungen und PINs gehen nie an Handys oder Beamer.
- *Beamer-Kopplung:* Ein Beamer ohne Token bekommt `beamer:pair {code}`; die Regie schickt `beamer:pair` mit dem Code, der Server stellt ein Beamer-Token aus (`beamer:token`), der Beamer meldet sich neu an. Alternativ `/beamer#bt=…` (Token von `/api/auth/beamer-link`, z. B. durch `./start.sh beamer`).
- *Begrenzungen:* je Adresse höchstens 60 Verbindungen, je Verbindung ein Token-Eimer (12/s, Spitze 40; Anmelden eines Spielers kostet 8), Nachrichten bis 256 kB, Spieler-Anmeldung 60/min je Adresse, Fotos 8 MB mit Formatprüfung und Pixelgrenze, Bildverarbeitung höchstens zwei gleichzeitig.
- *Internet:* `INSEL_ONLINE`/`PUBLIC_URL` → Start nur mit sicherem Passwort und Anmeldung; Logins über den Cloudflare-Tunnel (`cf-connecting-ip`) werden bei schwachem Passwort immer abgelehnt. Weitergeleitete Adressen gelten nur von lokalen Proxys (`trustProxy`, nicht vom Docker-Gateway).
- *Auslieferung:* CSP (`script-src 'self'`, deshalb zod im Browser mit `jitless`), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`; Fotos unter `/media` ohne Verzeichnislisten.
- *Kein Sprachmodell zur Laufzeit* – Eingaben werden nur angezeigt, nie ausgeführt.

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
| Beamer → Server | `beamer:stats`, `beamer:explained` | Bildrate, Grafikstufe, Auflösung, Ton frei?, Vollbild, freie Kamera; Erklärung fertig (nur freigegebene Beamer) |
| Server → Beamer | `beamer:pair`, `beamer:token` | Kopplungscode für einen noch nicht freigegebenen Beamer; Token nach der Freigabe |
| Regie → Server | `beamer:pair` | Beamer mit seinem Code freigeben |
| Client → Server | `auth` | neues Token für die bestehende Verbindung |
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
| `layout.ts` | 3D-Plan: gemeinsamer Inselplan + Höhen. Der Weg folgt dem Gelände (geglättet), steigt in den Serpentinen gleichmäßig, liegt in der Furt, auf der Hängebrücke und dem Kraterrand; der **Bach hinter der Liane** (`creek`) entspringt am Hang, quert den Weg zwischen Lianenfeld und nächstem Feld und fließt stets bergab ins Meer |
| `terrain.ts` | Höhenfeld (natürliche Form + Wegterrassen + Flussbett mit Ufern, Bachbett, Wasserfallbecken, Schlucht), Vertex-Farben, Glut-Attribut, Materialanteile je Punkt (`matA`/`matB`: Sand, Gras, Fels, Weg, Vulkangestein, Kiesel – für Ultra) |
| `ultra.ts` | Ultra-Grafik: lädt die CC0-Texturen (`public/assets/ultra/`) als Texturfelder (je eine Textur mit sechs Ebenen für Farbe, Normalen, Verdeckung+Rauheit) und baut daraus das Gelände-Material (Struktur relativ zur Inselfarbe, Fels/Vulkangestein von drei Seiten projiziert, nasser Kiesel glänzt) |
| `inside.ts` | Das **Innere des Vulkans** als eigene Szene: Höhle mit Lavasee, Lavafall, Felssäulen mit Feldplatten und Pfeilen, leuchtendes Ausgangsfeld, grünes Portal, Glutfunken, Lichtschacht aus der Decke; eigene Kameraeinstellungen (`plateShot`, `dropShot` …) |
| `worldfx.ts` | Gemeinsame Shader-Bausteine: ziehende Wolkenschatten, Lichtnetze am Meeresgrund, Gesteinsschichten an Felswänden, Glühen |
| `water.ts` | Meer (Gerstner-Wellen, durchsichtiges Flachwasser, Brandung, Glitzern; Ultra: Wellen-Normalen in drei Größen, durchscheinende Kämme), Fluss und Bach mit Stromschnellen, Wasserfall mit Gischt |
| `sky.ts` | Himmelskuppel mit Sonnenglanz, Haufenwolken, Nachbarinseln am Horizont |
| `props.ts`, `assets.ts`, `grass.ts` | Bepflanzung (Palmen, Dschungel, Farne, Monstera, Bambus, Blumenbeete, Felsen, Seerosen, Schilf), Grasteppich auf der GPU, Wind |
| `landmarks.ts`, `merge.ts` | Hafendorf, Stufenpyramide, Säulenallee, Tempelruine, Steinköpfe, Leuchtturm, Hängebrücke, treibende Fässer und Kisten, Seil-Geländer, Strickleiter im Krater, Felsbogen, Wrack, Schiffe, Regenbogen; statische Teile werden zu wenigen Draw-Calls zusammengefasst |
| `stunts.ts` | Auftritte der Felder: Liane am Riesenbaum über den Bach (Quellfelsen, Schilf), **Fässer oder Kisten** (zwei schwimmende Wege, Wegweiser, die gewählte Seite zerbirst, Schwimmen ans Ufer, Teil taucht wieder auf), Lavahöhle (Eingang, Fledermäuse), Totenkopf-Falltür, Rückkehr aus dem Vulkan im grünen Lichtstrahl, Sprungfeder, Doppeldecker mit Strickleiter und Fallschirm, UFO mit Traktorstrahl, Minispiel-Schild, Dampf-Geysir. Vorübergehende Objekte werden nach dem Auftritt bzw. bei Rückgängig entfernt und freigegeben. |
| `animals.ts`, `rig.ts`, `monkey.ts`, `birds.ts`, `swarms.ts` | Tiere: Delfine, Wal, Mantas, Schildkröten, Krabben, Frösche (Modelle mit Animationen) · Affen, Papageien, Tukane, Möwen, Flamingos prozedural als eine SkinnedMesh mit starrer Gewichtung je Tier (ein Draw-Call, Verhalten mit weichen Übergängen) · Fischschwärme und Schmetterlinge instanziert, Bewegung im Vertex-Shader. Tiere außerhalb des Blickfelds werden nur jedes 4. Bild bewegt, unter Wasser wirft nichts Schatten (`?zoo` zeigt alle Arten und Verhalten zur Kontrolle) |
| `ambient.ts` | Fackeln, Lagerfeuer, Rauch und Dampf als Shader-Partikel |
| `fields.ts` | Spielfelder (instanziert), gezeichnete Symbole, Markierung des aktiven Feldes |
| `pieces.ts` | Figuren: Aufstellung, Laufen, Fliegen, Käfig, Balancieren, in den Krater fallen und klettern, im Vulkan-Inneren (Figur hängt dann in dessen Szene) fallen, von Platte zu Platte hüpfen und im Wirbel verschwinden, Reaktionen (Salto, Jubel, Winken, Schulterzucken, Ärger, Schreck, Trauer), Vorführ-Figuren der Erklärung; **Kollisionsschutz**: Plätze auf einem Feld nach echter Figurenbreite (Kreis wächst mit der Zahl der Teams), dazu weiches Ausweichen in jedem Bild (stehende Figuren machen laufenden Platz; versetzt wird nur der Körper `body`, nicht die Feldposition) |
| `camera.ts`, `manual.ts` | Kameraführung: Rundflug im Leerlauf, Verfolgen (Vulkan im Hintergrund), Nahaufnahmen (`clearShot` sucht eine Richtung ohne Palmen und Gebäude davor), Großaufnahme für Reaktionen, Wackeln. Stil *ruhig*/*lebhaft*, weiche Federbewegung, begrenzte Drehrate, nie unter dem Gelände, Sichtprüfung mit Ausweichen und Anheben während der Fahrt; freie Kamera per Maus/Touch/Tastatur (`manual.ts`) oder aus der Regie, danach zurück zur Automatik; Messwerte in `rig.stats` |
| `ceremony.ts` | Siegerehrung: Podest steigt aus dem Krater, die Besten fliegen aufs Treppchen, Scheinwerfer, Feuerwerk, Saltos, Kamerafahrt |
| `commentator.ts`, `voice-lines.ts` | Kommentator: wählt zu Ereignissen passende Sprüche (ohne Wiederholung, Häufigkeit aus der Regie: nie / ab und zu / viel / Quatschkopf); bei *viel* und *Quatschkopf* plaudert er auch zwischendurch je nach Lage (Team trödelt, Frage läuft, Pause), der Quatschkopf lästert über Führende und Letzte und spottet bei Pech. Texte und Spielerklärung (Satz für Satz, damit Vorführungen genau passen) in `voice-lines.ts`, Sprachdateien unter `public/assets/voice/`; Tier-Sprüche nur, wenn das Tier gerade im Bild ist (`AnimalWorld.inView`), bodenlose Witze (`joke`); neue Texte ohne Datei warten in `voice-lines-new.ts` |
| `dice3d.ts` | 3D-Würfel als Overlay |
| `volcano.ts`, `particles.ts` | Lavasee, Lavastrom, Glut, Rauch, Ausbruch, Spritzwasser, Konfetti, Feuerwerk, Staub |
| `director.ts` | Spielt Effekte der Reihe nach ab (auch Mutproben und Vulkan-Inneres: schaltet für Teams im Vulkan in dessen Szene und zurück), gleicht nach Rückgängig/Neuverbindung ab, liefert Einblendungen, sagt dem Kommentator, was gerade los ist |
| `tags.ts` | Namensschilder als WebGL-Sprites in einer eigenen kleinen Szene, nach der Nachbearbeitung gezeichnet (scharf, gleich groß) |
| `audio.ts` | Vier Spuren mit eigener Lautstärke: Effekte (Kenney + ElevenLabs, lautheitsangeglichen, Stille am Anfang abgeschnitten), Musik (gestreamt, Listen je Stimmung, auf Wunsch rotierend, weiche Überblendung beim Wechsel und beim Wiederholen), Sprache (Musik wird leiser), Umgebung (aufgenommene Schleifen Strand + Dschungel bzw. Vulkanhöhle; Synthese als Ersatz) |
| `scene.ts` | Renderer, Licht, Nachbearbeitung (N8AO, Bloom, Tilt-Shift bzw. bei Ultra echte Tiefenschärfe, Vignette, Farbanpassung, SMAA), Grafikstufen *Ultra/Schön/Ausgewogen/Sparsam* live umschaltbar (Auflösung, Schattenkarte und wie oft sie neu gezeichnet wird, Nachbearbeitung, Grasdichte, Ultra-Materialien und 2K-Himmelslicht), Auflösung aus der Regie (`setResolution`), Vulkan-Inneres als eigener Ort: wird in der Lobby vorbereitet (Shader per `compileAsync`, ein unsichtbares Bild), jede Welt hat ihre eigene Nachbearbeitung; `travel()` reist hin und zurück – Kamera taucht in den Krater bzw. steigt im Inneren auf, Standbild-Überblendung (kein Schwarzbild), am Ziel erst der Überblick, dann weiter (`setView` schaltet Szene, Kamera-Gelände und Umgebungsgeräusch); Bildrate in `scene.fps` |

Messen: `?perf=noao,nograss,nopost,msaa` schaltet einzelne Teile zum Vergleichen ab bzw. zu; `?noprops`, `?noanimals` lassen Deko bzw. Tiere weg; `?quality=ultra|high|balanced|eco` erzwingt auf diesem Gerät eine Grafikstufe. Kleine Deko (unter 1 m) und Kleinteile der Figuren werfen keinen Schatten.

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
