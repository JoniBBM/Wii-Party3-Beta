---
name: Beitritt mit dem Handy
trigger: Eine Person scannt den QR-Code in der Lobby
actors: [person, spielleitung]
steps:
  - == Spiel finden ==
  - person -> handy: QR-Code am Beamer scannen (Adresse enthält den Spielcode) oder Spielcode eintippen
  - handy -> konten: Spielcode prüfen
  - note konten: Falsche Spielcodes werden je Adresse gebremst
  - handy -> echtzeit: Verbinden mit Spielcode (noch ohne Zugang, als Gast)
  - echtzeit --> handy: Spielstand in Gast-Sicht (Name des Spiels, Anmeldung offen?)
  - == Anmelden ==
  - person -> handy: Vorname und Emoji
  - handy -> konten: Als Spieler anmelden
  - konten -> engine: Befehl „Spieler anmelden“ (Name frei, Anmeldung offen, Obergrenzen)
  - konten --> handy: Spieler-Zugang
  - note handy: Zugang im Browser-Speicher unter „Mitspieler“ – am Gruppen-Gerät nur kurz fürs Selfie, das Gerät bleibt Anmeldestation
  - person -> handy: Optional Selfie aufnehmen
  - handy -> http-api: Foto hochladen (verkleinert)
  - == Teams bilden ==
  - spielleitung -> regie: Anzahl Teams wählen, „Teams bilden“
  - regie -> echtzeit: Befehl „Teams automatisch“
  - echtzeit -> engine: Spieler zufällig und gleichmäßig verteilen, Team-PINs erzeugen
  - echtzeit ->> handy: Team-Sicht – „Gestaltet euer Team!“
  - echtzeit ->> beamer: Teams und Figuren in der Lobby
  - person -> handy: Teamname ändern, Figur gestalten
  - handy -> echtzeit: Befehl „Team ändern“ (nur das eigene Team)
  - echtzeit ->> beamer: Neue Figur sofort sichtbar
  - == Weitere Geräte und Nachzügler ==
  - person -> handy: Team-PIN eingeben oder Team-QR-Code scannen
  - handy -> konten: PIN bzw. Team-Code prüfen
  - note konten: Falsche PINs und Codes werden je Adresse gebremst
  - konten --> handy: Team-Zugang (gebunden an den Team-Schlüssel)
  - spielleitung -> regie: Spiel starten
  - regie -> echtzeit: Befehl „Spiel starten“ – Anmeldung schließt, ab jetzt nur noch mit Team-PIN
---
So kommen Teilnehmende ins Spiel – mit eigenem Handy, Tablet oder Laptop ([[handy]]). Grundlage ist der **Spielcode** (z. B. `KX7P`), den jedes Spiel bekommt; er steckt in allen QR-Codes. Dadurch landen Handys auch dann im richtigen Spiel, wenn auf dem Server mehrere Spiele gleichzeitig laufen.

**Drei Wege hinein:**
1. **Anmelden** (solange die Anmeldung offen ist): Vorname, Emoji, optional Selfie. Die Person wird später einem Team zugeteilt.
2. **Team-PIN** (6-stellig, steht in der [[regie]] und auf den Team-Handys): verbindet ein weiteres Gerät direkt mit dem Team – auch nach Spielbeginn und nach einem Abmelden.
3. **Team-QR-Code** (Regie → *Teams*, auch als Druckseite): wie die PIN, nur ohne Tippen; der Schlüssel steht hinter „#“ in der Adresse.

Ein Team-Gerät kann mit „Ich bin einer davon“ zu einem der angemeldeten Spieler werden.

**Gruppen-Gerät (Anmeldestation):** Ist im Spiel „Gruppen teilen sich ein Gerät“ eingestellt, melden sich alle nacheinander an *einem* Gerät an. Das Gerät behält dabei keinen Spieler-Zugang, sondern bleibt Station. Danach verbindet sich pro Team ein Gerät mit der Team-PIN; Nachzügler trägt das Team dort mit „Person hinzufügen“ ein.

**Sicherheit:** Fehlversuche bei Spielcode, PIN und Team-Code bremst der Server je Adresse ([[konten]]); Anmeldungen sind je Adresse und insgesamt begrenzt. Eine neue PIN (Regie → *Teams*) macht alte PIN, alten Team-QR-Code und die damit verbundenen Team-Geräte ungültig. Die Projektion der [[engine]] sorgt dafür, dass Handys nur ihre eigene PIN sehen.
