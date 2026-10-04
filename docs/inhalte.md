# Inhalte erstellen

Alle Spiele und Fragen liegen in der **Bibliothek** (Regie → *Bibliothek*), gegliedert in **Sammlungen** (z. B. „Sommerfreizeit 2026“, „Quiz Allgemeinwissen“). Ein Spiel verwendet eine oder mehrere Sammlungen (Regie → *Spiel einrichten → Inhalte*).

Beim ersten Start sind bereits vorhanden:

- **Quiz-Mix (Beispiel)** – je einige Auswahl-, Freitext-, Schätz- und Buzzer-Fragen
- **Partyspiele (Beispiel)** – Bewegungs- und Geschicklichkeitsspiele mit Material
- **Feld-Minispiele (Beispiel)** – kurze Duelle und „allein gegen alle“-Spiele
- **Default (Import)**, **Teenie 2025 (Import)**, **Feld-Minispiele (Import)** – aus der alten Version übernommen

## Inhaltsarten

| Art | Felder | Hinweise |
|---|---|---|
| 🎯 **Spiel** | Titel, Regeln/Vorlesetext, Material, *Wer spielt?* (1–4 Spieler pro Team oder ganzes Team), Countdown | Spieler werden fair ausgelost; die Platzierung trägt die Spielleitung ein. |
| 🔤 **Auswahlfrage** | Frage, 2–8 Antworten, richtige Antwort | Auf den Handys als große farbige Knöpfe A, B, C … |
| ✍️ **Freitextfrage** | Frage, eine oder mehrere richtige Antworten (Varianten) | Tolerante Auswertung, Handwertung möglich. |
| 📏 **Schätzfrage** | Frage, richtiger Wert, Einheit | Komma oder Punkt egal; nächster Wert gewinnt. |
| 🔔 **Buzzer-Frage** | Frage, Lösung (nur für Moderator) | Die Antwort wird mündlich gegeben. |

Für alle Arten gibt es außerdem:

- **Countdown** in Sekunden (leer = ohne). Läuft er ab, werden die Antworten automatisch geschlossen.
- **Notiz für Regie & Moderator** – erscheint nur bei der Spielleitung (z. B. „Beide Antworten zählen“).
- **In normalen Runden spielbar** / **Als Feld-Minispiel nutzbar** (*allein gegen alle* und/oder *Duell*) – nur bei Spielen.

## Feld-Minispiele

Feld-Minispiele sind ganz normale *Spiele*, bei denen „Als Feld-Minispiel nutzbar“ angehakt ist. Typisch sind kurze Spiele mit 1 Spieler pro Team. Wenn ein Team auf ein Minispiel-Feld kommt, schlägt die Regie passende Spiele vor (Modus *allein gegen alle* oder *Duell*). Soll ein Spiel **nur** als Feld-Minispiel vorkommen, „In normalen Runden spielbar“ abwählen.

## Ablaufplan

Unter *Spiel einrichten → Ablaufplan* lässt sich eine feste Reihenfolge zusammenstellen (Drag & Drop, Inhalte dürfen mehrfach vorkommen). In der Live-Ansicht startet der Reiter *Plan* immer den nächsten Punkt. Zufall und freie Auswahl bleiben jederzeit möglich.

## Vorlagen

Eine **Vorlage** speichert Sammlungen, Ablaufplan, Spielfeld und Regeln (ohne Teams). *Spiel einrichten → Als Vorlage* – beim nächsten Abend wählt man die Vorlage beim Anlegen des Spiels.

## Import und Export

- **Exportieren**: *Bibliothek → Alles exportieren* oder das Download-Symbol einer Sammlung → JSON-Datei.
- **Importieren**: *Bibliothek → Importieren* → JSON-Datei auswählen. Unterstützt werden
  - das eigene Exportformat (siehe unten) und
  - die `minigames.json` der alten Version (`legacy/app/static/minigame_folders/<Ordner>/minigames.json`).

### Dateiformat

```json
{
  "format": "insel-inhalte",
  "version": 1,
  "collections": [
    {
      "name": "Sommerfreizeit 2026",
      "description": "",
      "items": [
        { "kind": "game", "title": "Becherturm", "description": "Baut den höchsten Turm …", "materials": "30 Becher", "playerCount": "2", "timerSec": 60 },
        { "kind": "choice", "title": "Planeten", "question": "Größter Planet?", "options": ["Mars", "Jupiter"], "correctIndex": 1, "playerCount": "all" },
        { "kind": "text", "title": "Berg", "question": "Höchster Berg Deutschlands?", "answers": ["Zugspitze"], "playerCount": "all" },
        { "kind": "estimate", "title": "Zugspitze", "question": "Wie hoch ist sie?", "target": 2962, "unit": "m", "playerCount": "all" },
        { "kind": "buzzer", "title": "Mona Lisa", "question": "Wer malte sie?", "answer": "Leonardo da Vinci", "playerCount": "all" },
        { "kind": "game", "title": "Daumen-Catchen", "playerCount": "1", "roundUse": false, "fieldModes": ["duel"] }
      ]
    }
  ]
}
```

`playerCount`: `"1"`, `"2"`, `"3"`, `"4"` oder `"all"`. `fieldModes`: `"vs_all"` und/oder `"duel"`. Fehlende Felder bekommen Standardwerte.

## Tipps für gute Inhalte

- Fragen mit **Countdown** (15–30 s) halten das Tempo hoch.
- Abwechseln: Bewegungsspiel → Quiz → Schätzfrage → Buzzer.
- Für große Gruppen „Ganzes Team“-Spiele einplanen, damit alle mitmachen.
- Lange Regeln in die **Beschreibung** schreiben – sie steht groß beim Moderator und auf dem Beamer.
