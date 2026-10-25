---
name: Spielmodell (gemeinsame Typen & Kataloge)
type: lib
layer: logik
path:
  - packages/shared/src/answers.ts
  - packages/shared/src/clone.ts
  - packages/shared/src/constants.ts
  - packages/shared/src/defaults.ts
  - packages/shared/src/index.ts
  - packages/shared/src/rng.ts
  - packages/shared/src/schemas.ts
  - packages/shared/src/selectors.ts
  - packages/shared/src/types.ts
  - packages/shared/src/worldWords.ts
  - packages/shared/tsconfig.json
  - packages/shared/package.json
tech: [typescript, zod]
provides:
  - call Datentypen für Spielstand, Teams, Spieler, Inhalte, Effekte, Rollen und Sitzungen
  - call Prüf-Schemas für Inhalte, Sammlungen, Spielkonfiguration, Vorlagen und alle Live-Befehle
  - call Kataloge – Teamfarben, Welten, Feldtypen, Inhaltsarten, Figuren-Bausteine
  - call Standardregeln, Standard-Konfiguration und Aufwertung alter Spielstände
  - call Begriffe je Welt (Liane/Ranke/Greifhaken …)
  - call Rangliste, Phasentitel und Statistik
uses:
  - spielfeld: call "Standard-Spielfeld und feste Inselfelder für neue und ältere Spiele"
files:
  - index.ts: Sammelt alles, was das Paket nach außen anbietet – Server und Weboberfläche importieren nur von hier.
  - types.ts: Beschreibt die Form aller Daten – Inhalte der Bibliothek, Spielkonfiguration mit Regeln, laufender Spielstand (Teams, Spieler, Phase, Vulkan, Verlauf, Ticker), Effekte für den Beamer sowie Rollen, Sitzungen und Konten.
  - schemas.ts: Prüfregeln für alles, was von außen kommt – Inhalte, Sammlungen, Spielkonfiguration, Vorlagen und die rund 45 Live-Befehle (mit Längen- und Zahlengrenzen). Schaltet im Browser die Prüfung ohne dynamisch erzeugten Code ein.
  - constants.ts: Feste Kataloge mit deutschen Namen – zehn Teamfarben, die drei Welten, alle Feldtypen mit Farbe und Symbol, die fünf Inhaltsarten, Spielerzahlen, Feld-Minispiel-Modi, Emojis und die Auswahllisten des Figuren-Editors.
  - defaults.ts: Standardregeln (Bonuswürfel 6/4/2, Siegeswurf ab 6, Vulkan bei Druck 6 …), Standard-Konfiguration eines neuen Spiels, Zufallsfigur, Aufbau eines Inhalts aus geprüfter Eingabe und der Text, den eine Sprachaufnahme vorliest. Ergänzt Spielstände älterer Versionen beim Laden um neue Regeln und Felder.
  - worldWords.ts: Namen der Mutproben, Sonderfelder und Orte je Welt (Insel, Blockwelt, Weltall) – genutzt von Ticker, Handys, Regie und Beamer.
  - answers.ts: Tolerante Auswertung von Freitext-Antworten – Groß-/Kleinschreibung, Umlaute (ä = ae), Sonderzeichen, Artikel und je nach Wortlänge ein bis zwei Tippfehler werden verziehen.
  - selectors.ts: Abgeleitete Werte für alle Oberflächen – Rangliste mit Plätzen, „wer ist dran“, Überschrift der aktuellen Phase und Statistik je Team.
  - rng.ts: Zufallsquelle mit festem Startwert (für Tests und die Verteilung der Sonderfelder) sowie Hilfen für Zufallszahl, Auswahl und Mischen.
  - clone.ts: Tiefe Kopie eines Spielstands, damit ein Befehl nie den alten Stand verändert.
  - packages/shared/package.json: Paketbeschreibung „@insel/shared“; einzige Fremdbibliothek ist zod für die Prüfregeln.
  - packages/shared/tsconfig.json: TypeScript-Einstellungen des Pakets (erbt die gemeinsamen Projekteinstellungen).
exposure: none
security:
  - input: Jede Eingabe von außen (Befehle, Inhalte, Konfiguration, Fotopfade) wird gegen ein Schema geprüft – feste Auswahllisten, Längengrenzen (z. B. Namen bis 40, Fragen bis 1000 Zeichen), Zahlenbereiche; Fotopfade nur im Format des Servers
  - other: Begriffe und Kataloge stehen an genau einer Stelle, damit Server und alle Oberflächen dasselbe anzeigen
---
Gemeinsames Vokabular des Spiels: Hier ist festgelegt, **wie die Daten aussehen** (Spielstand, Teams, Inhalte, Befehle), **welche Werte erlaubt sind** und **wie sie heißen**. Server, [[engine]] und alle Oberflächen ([[web-grundlage]], [[regie]], [[handy]], [[moderator]], [[beamer]]) nutzen dieselben Dateien – siehe [[0001-gemeinsame-spiellogik-fuer-server-und-browser]].

**Wichtige Begriffe:**
- **Spielkonfiguration** – Name, Welt, Wunschdauer, Spiel-Tempo an/aus, Inhaltsarten für den Zufall, Handy-Modus (eigenes Handy oder Gruppen-Gerät), Sammlungen, Spielfeld, Regeln und Ablaufplan. Lässt sich als Vorlage speichern.
- **Spielstand** – Teams (Position, Bonuswürfel, Sperre, Krater, Vulkan-Inneres, Figur, PIN), Spieler (Name, Emoji, Foto, wie oft ausgelost), Runde, Phase, Vulkandruck, gespielte Inhalte, Verlauf und Ereignis-Ticker.
- **Rollen** – Regie/Admin, Spielleiter-Konto, Moderator, Beamer, Team-Gerät, Spieler, Gast.
- **Effekte** – kurze Ereignisse („gewürfelt“, „gelaufen“, „Sonderfeld“, „Reaktion“ …), aus denen der Beamer Animationen und Ton macht.

**Begriffe je Welt:** Regeln sind in allen Welten gleich, nur die Namen wechseln – siehe [[0003-welten-teilen-regeln-und-spielfeld]]:

| Insel | Blockwelt | Weltall |
|---|---|---|
| Liane über den Bach | Ranke über den Bach | Greifhaken über den Plasma-Bach |
| Fässer oder Kisten am Wasserfall | Fässer oder Kisten am Wasserfall | Kapseln oder Kisten am Plasmafall |
| Lavahöhle | Lavahöhle | Kristallhöhle |
| Vulkan-Inneres (Lava-Inseln, Ausgang) | Nether (Netherziegel, Portal) | Alien-Höhle (Kristallinseln, Teleporter) |
| Katapult vorwärts / rückwärts | Schleimblock / Knaller | Jetpack / Schwarzes Loch |
| Platztausch, Sperre, Totenkopf | Teleport-Perle, Spinnennetz, Boden bricht weg | Teleporter, Energiekäfig, Wurmloch |

**Ältere Spielstände:** Beim Laden aus der Datenbank ergänzt das Modell fehlende Regeln (Liane, Fässer, Lavahöhle, Vulkan-Inneres, Krater), Welt, Handy-Modus und Tempo-Felder und setzt die festen Inselfelder an ihren Platz.
