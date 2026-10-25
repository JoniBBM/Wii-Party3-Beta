---
name: Datenzugriff & Startinhalte
type: store
layer: daten
path: [packages/server/src/db.ts, packages/server/src/seed.ts, packages/server/src/legacy.ts]
tech: [better-sqlite3, sqlite, typescript]
provides:
  - call openDb() – Datenbank öffnen und Schema automatisch aktualisieren
  - call Spiele, Sammlungen, Inhalte, Vorlagen, Einstellungen, Konten lesen und schreiben
  - call seedIfEmpty(), seedExtras() – Startinhalte und Zusatzpakete
  - call convertLegacyFolder() – alte Inhalte der Flask-Version umwandeln
uses:
  - sqlite: sql "settings, collections, items, templates, games, game_log, users, user_tokens" [intern, datei=data/insel.db]
  - spielmodell: call "ältere Spielstände und Vorlagen beim Laden ergänzen (upgradeState, upgradeConfig), Standard-Einrichtung"
  - http-api: call "importCollections – Startinhalte wie einen Import einspielen"
files:
  - db.ts: Der gesamte Datenbankzugriff. Legt das Schema an und aktualisiert es beim Start automatisch (Version in der Datenbank), vergibt Spielcodes (4 Zeichen ohne Verwechsler wie I/1 und O/0) und bietet Lese- und Schreibfunktionen für Einstellungen, Sammlungen, Inhalte, Vorlagen, Spiele, Spielverlauf, Konten und Einladungs-Links. Konten werden im Speicher zwischengespeichert, weil sie bei jeder Änderung je Gerät geprüft werden.
  - seed.ts: Beim allerersten Start (leere Bibliothek) die Beispiel- und Import-Inhalte sowie drei Standard-Vorlagen anlegen. Zusatzpakete (z. B. „Wissensmix 100“) bekommt jede Installation genau einmal – wer ein Paket löscht, bekommt es nicht wieder.
  - legacy.ts: Wandelt Inhalte der alten Flask-Version (minigames.json, Feld-Minispiele) in das neue Format um; genutzt vom Import der Regie und vom Werkzeug import-legacy.
  - packages/server/seed/: Mitgelieferte Startinhalte als JSON – starter-content.json (Beispiele), legacy-content.json (aus der alten Version übernommen) und wissensmix-100.json (Zusatzpaket mit 100 Fragen).
zone: intern
exposure: none
security:
  - input: Alle Abfragen mit Platzhaltern (vorbereitete Anweisungen) – Eingaben werden nie in SQL eingesetzt
  - storage: Konto-Passwörter nur als scrypt-Hash, Einladungs-/Zurücksetzen-Links nur als SHA-256-Hash
  - storage: Das SMTP-Passwort steht im Klartext in der Tabelle settings (es wird zum Senden gebraucht) – Datenbank und Backups deshalb vertraulich behandeln
  - other: Schema-Änderungen laufen beim Start automatisch und je Version in einer Transaktion; Fremdschlüssel sind eingeschaltet
---
Dieser Baustein ist die Brücke zwischen Server und Datenbankdatei ([[sqlite]]): Er kennt das Schema, aktualisiert es beim Start und bietet für alles, was gespeichert wird, eine Funktion.

**Was wie gespeichert wird**

| Tabelle | Inhalt |
|---|---|
| `settings` | Einstellungen als Schlüssel/Wert: App-Name, feste Beitritts-Adresse, gewähltes Spiel des Haupt-Admins, E-Mail-Versand (SMTP), Beamer-Einstellungen je Konto (`show` bzw. `show:<konto>`), erledigte Zusatzpakete |
| `collections` | Sammlungen der Bibliothek mit Besitzer (leer = Haupt-Admin) und „veröffentlicht“ |
| `items` | Inhalte (Fragen, Spiele) einer Sammlung; Details als JSON |
| `templates` | Vorlagen (fertige Spieleinstellungen) mit Besitzer |
| `games` | Spiele: Name, Status, Spielcode, Besitzer, geöffnet ja/nein und der **komplette Spielstand als JSON** (nach jeder Änderung überschrieben) |
| `game_log` | Protokoll aller Befehle je Spiel (wer, was, wann, welche Effekte) |
| `users` | Konten: E-Mail, Name, Rolle (admin/leader), Status (eingeladen/aktiv/gesperrt), Passwort-Hash, Schlüsselversion, gewähltes Spiel, letzte Anmeldung |
| `user_tokens` | Einladungs- und Zurücksetzen-Links (nur Hash, Zweck, Ablaufzeit) |

**Schema-Updates:** Die Datenbank merkt sich ihre Version. Beim Start spielt der Server fehlende Änderungen automatisch ein (bisher zwei Stufen: Grundschema und „Konten + mehrere Spiele“). Ein Zurückgehen auf eine ältere Programmversion ist danach nicht vorgesehen – vor großen Updates deshalb sichern ([[aktualisieren]]).

**Ältere Spielstände:** Beim Laden ergänzt die gemeinsame Spiellogik neue Regeln und Felder, damit alte Spielstände weiterlaufen.

**Startinhalte:** Ist die Bibliothek beim Start leer, werden die mitgelieferten Inhalte aus `packages/server/seed/` eingespielt und die Vorlagen „Standard (72 Felder)“, „Kurzes Spiel (40 Felder)“ und „Teenie 2025“ angelegt.
