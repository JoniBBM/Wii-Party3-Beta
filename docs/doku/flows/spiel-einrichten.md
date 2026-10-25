---
name: Spiel anlegen und einrichten
trigger: Die Spielleitung klickt „Neues Spiel erstellen“
actors: [spielleitung]
steps:
  - == Anlegen (ein Klick) ==
  - spielleitung -> regie: „Neues Spiel erstellen“ (Live ohne Spiel oder Seite Spiele)
  - note regie: Der Knopf fehlt, solange das eigene Spiel läuft – erst beenden oder schließen
  - regie -> http-api: Spiel anlegen – Name „Spieleabend <Datum>“, Standard-Vorlage
  - http-api -> server: Spiel erzeugen, Spielcode vergeben, als gewähltes Spiel des Kontos öffnen
  - note server: Prüft erneut, dass kein eigenes Spiel läuft; übernimmt nur Sammlungen, die das Konto sehen darf
  - http-api --> regie: Kennung und Spielcode
  - echtzeit ->> regie: Spielstand in der Lobby
  - echtzeit ->> beamer: Lobby mit QR-Code
  - regie -> regie: Weiter zu „Spiel einrichten → Geführt“
  - == Assistent (Entwurf nur im Browser) ==
  - spielleitung -> regie: Optional eigene Vorlage übernehmen (erste Folie)
  - spielleitung -> regie: Welt wählen – Insel, Blockwelt oder Weltall
  - spielleitung -> regie: Spieldauer und Zahl der Teams – oder „Spieldauer überspringen“
  - regie -> engine: Vorschlag berechnen – Länge und Sonderfelder passend zur Dauer
  - regie -> spielfeld: Spielfeld erzeugen und als Karte zeigen
  - spielleitung -> regie: Spielfeld, Sonderfelder und Mutproben, Was kommt dran?, Sammlungen, Handys & Sieg
  - note regie: Zeigt laufend, wie lange das Spiel dauert und ob die Inhalte reichen
  - spielleitung -> regie: Übersicht prüfen, Namen vergeben, „Übernehmen“
  - regie -> echtzeit: Befehl „Einstellungen übernehmen“ mit der kompletten, geprüften Konfiguration
  - echtzeit -> engine: Konfiguration setzen (nur Regie/Spielleiter des Spiels)
  - echtzeit ->> beamer: Welt und Spielfeld wechseln
  - echtzeit ->> handy: Welt-Look und Begriffe
  - == Feinheiten (optional) ==
  - spielleitung -> regie: „Alle Einstellungen“ – Bereich wählen und ändern
  - note regie: Leiste „Ungespeichert – Verwerfen / Speichern“; Wetter und Spieldauer wirken sofort
  - regie -> echtzeit: Speichern bzw. sofort – Spieldauer, Wetter und Stimmung
  - spielleitung -> regie: „Als Vorlage“
  - regie -> http-api: Vorlage speichern (Spielfeld, Regeln, Sammlungen, Ablaufplan)
---
Ein neues Spiel entsteht mit **einem Klick** in der [[regie]]: Name mit Datum, Einstellungen aus der Standard-Vorlage. Danach führt der **Assistent** Folie für Folie durch die Einrichtung. Alles bleibt ein Entwurf im Browser, bis **Übernehmen** gedrückt wird; oben lassen sich bereits besuchte Folien wieder anspringen.

**Folien:** Welt → Spieldauer → Spielfeld → Sonderfelder → Was kommt dran? → Sammlungen → Handys & Sieg → Fertig. Eine eigene Vorlage lässt sich auf der ersten Folie übernehmen.

**Spieldauer:** Mit Spieldauer schlägt der Assistent Länge und Sonderfelder vor (Rechnung in der [[engine]], Brett aus dem [[spielfeld]]); das Spiel-Tempo hält die Zeit danach unauffällig ein – siehe [[0002-spiel-tempo-fair-und-unauffaellig]]. Wird die Spieldauer übersprungen, legt die Spielleitung alles selbst fest, und es gibt nur reine Zufallswürfe ohne Tempo-Algorithmus.

**Welt:** Die Wahl ändert nur Optik und Begriffe; Regeln und Spielfeld bleiben gleich – siehe [[0003-welten-teilen-regeln-und-spielfeld]].

**Rechte:** Anlegen und Übernehmen darf nur die Spielleitung des Spiels (Admin oder Spielleiter-Konto als Besitzer); der Server prüft Rolle und Konfiguration erneut. Bedienung Schritt für Schritt: [[spielleitung]].
