---
name: Vulkan-Besuch aus der Regie
trigger: Spielleitung tippt in der Regie „In den Vulkan“ (Blockwelt „In den Nether“, Weltall „In die Alien-Höhle“)
actors: [spielleitung]
steps:
  - spielleitung -> regie: „In den Vulkan“
  - note regie: Knopf nur aktiv, wenn auf dem Beamer gerade kein Zug und keine Erklärung läuft
  - regie -> echtzeit: show – Kamera-Befehl inside
  - echtzeit ->> beamer: show:cmd an alle Beamer der Spielleitung
  - beamer -> szene: Besuch im Inneren starten
  - note szene: Noch einmal prüfen – läuft ein Zug oder ist die Kamera gesperrt, passiert nichts
  - == Hinein ==
  - szene -> insel: Szene des Inneren bereit? (in der Lobby vorbereitet, Shader vorab übersetzt)
  - note szene: Kamerafahrt – Anflug auf den Vulkan, über den Kraterrand hinab Richtung Lava
  - note szene: Standbild des alten Bildes, darunter Umschalten auf die Höhlen-Szene, weiche Überblendung (kein Schwarzbild)
  - szene -> stimmung: Umgebungsgeräusch der Höhle
  - szene --> beamer: Ansicht „Inneres“
  - beamer -> stimmung: Musik der Stimmung Vulkan
  - beamer ->> echtzeit: beamer:stats alle 2 Sekunden – meldet u. a. Ansicht Inneres (die Regie schaltet damit ihre Knöpfe um)
  - note szene: Kamera gleitet von der Decke herab und kreist dann ruhig über Lavasee, Strafweg und Portal
  - == Zurück ==
  - spielleitung -> regie: „Zurück auf die Insel“
  - regie -> echtzeit: show – Kamera-Befehl island
  - echtzeit ->> beamer: show:cmd
  - beamer -> szene: Besuch beenden
  - note szene: Kamera steigt zur Deckenöffnung (Nether – ins Portal), Überblendung, taucht aus dem Krater auf und zieht in den Rundflug über die Insel
  - szene -> stimmung: Umgebungsgeräusch Strand und Dschungel
  - szene --> beamer: Ansicht „Insel“
  - == Automatisch ==
  - note szene: Der nächste Zug beendet einen Besuch von selbst und holt die Kamera zum Team
---
Die Spielleitung kann jederzeit einen Blick ins Innere des Vulkans werfen – etwa um zu zeigen, was Teams dort erwartet. Der Beamer fliegt dazu mit einer Kamerafahrt in den Krater und überblendet ohne Schwarzbild in die eigene Szene des Inneren.

Wichtig dabei:
- **Eine eigene Szene je Welt:** Lavahöhle auf der Insel ([[insel]]), Nether in der [[blockwelt]], Alien-Höhle im [[weltall]] – alle mit derselben Schnittstelle, deshalb ist der Ablauf überall gleich.
- **Kein Ruckeln:** Die Szene wird schon in der Lobby angelegt und einmal unsichtbar gezeichnet, damit die Grafikkarte alles vorbereitet hat ([[szene]]). Sie entsteht nur, wenn die Regel „Vulkan-Inneres“ im Spiel eingeschaltet ist.
- **Nur in ruhigen Momenten:** Läuft ein Zug, ein Auftritt oder die Spielerklärung, ist der Knopf in der Regie ([[regie]]) gesperrt, und der Beamer lehnt den Befehl ab. Wird während des Anflugs schon „Zurück“ gewählt, kehrt die Kamera einfach um.
- **Teams im Vulkan:** Fällt ein Team durch Totenkopf-Falltür oder Lavahöhle ins Innere, nutzt der Director ([[szene]]) dieselbe Reise – mit Sturz der Figur auf die erste Platte, Hüpfen von Platte zu Platte und Rückkehr durch das Portal im Lichtstrahl ([[wuerfelzug-beamer]]).
- **Ton:** Umgebungsgeräusch und Musik wechseln mit der Ansicht ([[stimmung]]).
