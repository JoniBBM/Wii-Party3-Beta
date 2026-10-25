---
name: Würfelzug auf dem Beamer
trigger: Ein Team würfelt – die Effekte vom Server kommen am Beamer an
actors: [team]
steps:
  - team -> handy: Würfeln
  - handy -> echtzeit: cmd dice.roll
  - echtzeit -> engine: Befehl ausführen (über die Laufzeit des Servers)
  - note engine: würfelt, zieht, löst Sonderfelder aus und plant die Dauer der Animation ein – so lange darf niemand weiterwürfeln
  - engine --> echtzeit: neuer Spielstand und Effekte (turn, dice, move, field, react …)
  - echtzeit ->> beamer: state + effects
  - beamer -> szene: Spielstand setzen, Effekte übergeben
  - note szene: Der Director stellt die Effekte in eine Warteschlange und spielt sie nacheinander ab
  - == Team ist dran ==
  - szene -> insel: aktives Feld markieren
  - szene -> stimmung: Klang „Zug“, vielleicht ein Spruch
  - szene -->> beamer: Einblendung „Team ist dran!“
  - == Würfel ==
  - note szene: Kamera fährt zum Team
  - szene -> figuren: 3D-Würfel rollt ins Bild und zeigt die Zahl
  - szene -> stimmung: Würfelgeräusch, bei 6 oder 1 ein Spruch
  - stimmung -> medien: Geräusch bzw. Sprachdatei laden
  - == Laufen ==
  - szene -> figuren: Figur läuft Feld für Feld (Dauer je Schritt wie vom Server eingeplant)
  - note szene: Kamera fährt mit, weicht Bäumen und Gebäuden aus
  - == Sonderfeld ==
  - szene -> auftritte: Auftritt, z. B. Sprungfeder, Flugzeug, UFO, Falltür, Bühne, Geysir
  - auftritte -> figuren: Figur fliegt, fällt oder wird getauscht
  - szene -> stimmung: Jingle, Geräusch und Spruch zum Feld
  - szene -->> beamer: Einblendung mit Feldname und Wirkung
  - == Reaktion ==
  - szene -> figuren: Reaktion der Figur (Jubel, Salto, Schulterzucken, Ärger …)
  - note szene: Warteschlange leer – Figuren werden an den Spielstand angeglichen, die Kamera geht in den Rundflug
---
Was der Beamer aus einem einzigen Würfelwurf macht: Der Server liefert nur eine Liste von Effekten, die 3D-Szene ([[szene]]) inszeniert daraus Würfel, Laufweg, Auftritt, Ton, Kommentator und Einblendungen.

Wichtig dabei:
- **Reihenfolge und Tempo.** Der Director spielt die Effekte strikt nacheinander ab. Warten viele (z. B. nach einer kurzen Verbindungsunterbrechung), spielt er schneller.
- **Server und Beamer passen zusammen.** Die [[engine]] schätzt die Dauer jedes Effekts und sperrt das Würfeln so lange. Die Figuren nutzen dieselben Schrittdauern ([[figuren]]).
- **Welt egal.** In Insel, Blockwelt und Weltall läuft derselbe Ablauf, nur Bauteile und Sprüche sehen anders aus ([[auftritte]], [[blockwelt]], [[weltall]]).
- **Mutproben und Vulkan-Inneres** folgen demselben Muster mit eigenen Effekten: Liane, Fässer oder Kisten, Lavahöhle, Kraterloch. Ist das Team im Vulkan-Inneren, wechselt der Beamer vorher weich in dessen Szene (siehe [[vulkan-besuch]]).
- **Rückgängig** bricht alle laufenden Animationen sofort ab, entfernt Auftrittsobjekte und stellt die Figuren auf den neuen Spielstand.
- **Spielerklärung:** Solange sie läuft, pausiert der Director; danach wird nur noch angeglichen.

Server-Seite im Detail: [[befehl-und-spielstand]].
