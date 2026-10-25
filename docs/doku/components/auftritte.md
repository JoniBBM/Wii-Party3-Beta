---
name: Auftritte der Sonderfelder und Mutproben
type: module
layer: grafik
path: [packages/web/src/board/stunts.ts, packages/web/src/board/particles.ts]
tech: [three.js, glsl]
zone: client
provides:
  - call Stunts – Auftritte der Sonderfelder und Mutproben (Liane, Fluss, Lavahöhle, Falltür, Sprungfeder, Flugzeug, UFO, Bühne, Geysir, Rückkehr aus dem Vulkan); Grundklasse für Blockwelt und Weltall
  - call Effects – Partikel (Staub, Funkeln, Konfetti, Feuerwerk, Spritzwasser, Geysir, Vulkanrauch, Ausbruch)
uses:
  - figuren: call "Figuren bewegen (Laufen, Fliegen, Schwimmen, Fallen, Käfig)"
  - insel: call "Inselplan, Höhenmodell, Fässer und Kisten der Furt"
  - szene: call "Blickwinkel der Mutproben, Sichtprüfung, Zeitsteuerung, Materialien"
  - stimmung: call "Geräusche der Auftritte"
  - spielfeld: call "Lage von Fluss, Furt und Vulkan"
  - spielmodell: call "Feldfarben (FIELD_INFO), Wahl am Wasserfall (Fässer oder Kisten)"
files:
  - stunts.ts: Auftritte der Insel – Liane am Riesenbaum über den Bach, Fässer oder Kisten am Wasserfall (eine Seite bricht ein), Lavahöhle mit Fledermäusen, Totenkopf-Falltür, Sprungfeder, Doppeldecker mit Strickleiter und Fallschirm, UFO mit Traktorstrahl, Minispiel-Bühne, Dampf-Geysir, Rückkehr im Lichtstrahl. Räumt vorübergehende Objekte nach dem Auftritt und bei Rückgängig wieder ab.
  - particles.ts: Leichtes Partikelsystem für Rauch, Funken, Konfetti, Lava, Staub, Spritzwasser und Feuerwerk; in der Blockwelt mit eckigen Pixel-Partikeln.
---
Kleine Filmszenen auf dem Beamer: Landet ein Team auf einem Sonderfeld oder muss es eine Mutprobe bestehen, spielt die Regie der Animationen ([[szene]]) hier den passenden Auftritt ab.

**Sonderfelder.** Sprungfeder (Katapult vorwärts), Doppeldecker mit Strickleiter und Fallschirm (Katapult rückwärts), UFO mit Traktorstrahl (Platztausch), Totenkopf-Falltür (ab ins Vulkan-Innere), Minispiel-Bühne mit Scheinwerfern, Dampf-Geysir (Vulkanfeld). Den Käfig der Sperre setzt [[figuren]].

**Mutproben.** An der Liane greift die Figur das Seil, das Team würfelt, und die Figur schwingt so viele Felder weit über den Bach. Am Wasserfall wählt das Team Fässer oder Kisten; die gewählte Seite hält oder bricht ein, dann schwimmt die Figur ans Ufer. An der Lavahöhle braucht das Team eine Mindestzahl – sonst rutscht die Figur hinein und landet im Vulkan-Inneren. Für Liane und Furt gibt es feste Kamerablicke, damit nie eine Baumkrone vor dem Bild hängt.

**Gleiche Abläufe in jeder Welt.** Kamera, Timing und Verhalten bei „Rückgängig“ stecken in der Grundklasse. Blockwelt ([[blockwelt]]) und Weltall ([[weltall]]) erben sie und tauschen nur die Bauteile aus – etwa Schleimblock statt Sprungfeder, Knaller statt Flugzeug, Jetpack und Schwarzes Loch im Weltall. Vorübergehende Objekte werden nach dem Auftritt oder bei „Rückgängig“ entfernt und ihr Speicher freigegeben.

**Partikel.** Ein leichtes Partikelsystem zeichnet Staub beim Landen, Funkeln, Konfetti, Feuerwerk, Spritzwasser, Geysire, Vulkanrauch und den Ausbruch – mit wenigen Zeichenaufrufen.
