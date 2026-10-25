---
name: SQLite-Datenbank & Datenordner
type: db
layer: daten
tech: [sqlite]
provides:
  - sql Datenbankdatei data/insel.db (WAL-Modus)
  - file data/media/<spiel>/ – Spielerfotos (WebP)
  - file data/media/audio/ – Sprachaufnahmen der Fragen
  - file data/.secret – automatisch erzeugter Sitzungsschlüssel
zone: data
exposure: none
security:
  - storage: Alles liegt nur im Datenordner auf dem eigenen Rechner bzw. Server – nicht im Git (.gitignore), nicht im Docker-Abbild (.dockerignore)
  - storage: Im Container gehört der Ordner dem Benutzer node; der Server läuft nicht als root
  - secrets: data/.secret enthält den Sitzungsschlüssel (falls APP_SECRET nicht gesetzt ist) – wer ihn kennt, könnte Zugänge fälschen
  - privacy: Enthält Spielerfotos, Namen, Konten (E-Mail-Adressen) und das SMTP-Passwort – Backups vertraulich behandeln; Fotos je Spiel löschbar
  - backup: Sicherung = Server anhalten und den ganzen Datenordner kopieren (siehe Anleitung Notfall)
---
Alle Daten der Insel liegen in einem einzigen Ordner – dem **Datenordner**. Darin steckt die SQLite-Datenbank (eine einzelne Datei, kein eigener Datenbankserver) und die Mediendateien. Gelesen und geschrieben wird nur über [[datenbank]].

**Wo liegt der Ordner?**

| Betrieb | Ort |
|---|---|
| Docker (Laptop) | `data/` im Projektordner, im Container eingehängt als `/data` |
| VPS | `~/party/Wii-Party3-Beta/data` |
| ohne Docker (Entwicklung) | `data/` im Projektordner (änderbar mit `DATA_DIR`) |

**Inhalt**

| Datei/Ordner | Inhalt |
|---|---|
| `insel.db` (+ `insel.db-wal`, `insel.db-shm`) | Datenbank: Bibliothek, Vorlagen, Spiele mit Spielständen, Verlauf, Konten, Einstellungen. Der WAL-Modus („write-ahead log“) schreibt Änderungen zuerst in die `-wal`-Datei – deshalb im laufenden Betrieb nie nur `insel.db` allein kopieren. |
| `media/<spiel-id>/` | Spielerfotos (WebP, 360×360, ohne Metadaten) |
| `media/audio/` | Sprachaufnahmen der Fragen („Audio erstellen“) |
| `.secret` | Sitzungsschlüssel, falls `APP_SECRET` in `.env` leer ist |

Backup und Wiederherstellung: siehe [[notfall]].
