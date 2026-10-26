---
name: Regie (Steuerzentrale)
type: page
layer: ui
path:
  - packages/web/src/pages/regie/
  - packages/web/src/game/
tech: [react, dnd-kit]
provides:
  - http GET /regie – Live-Steuerung des laufenden Spiels
  - http GET /regie/beamer – Beamer fernsteuern (Bild, Ton, Musik, Kommentator, Kamera, Erklärung, Kopplung)
  - http GET /regie/teams – Teams, Spieler, PINs, QR-Codes, Fotos
  - http GET /regie/einrichten – Spiel einrichten (geführt oder alle Einstellungen)
  - http GET /regie/bibliothek – Sammlungen und Inhalte, Import/Export
  - http GET /regie/spiele – Spiele und Vorlagen
  - http GET /regie/konten – Spielleiter-Konten (nur Admins)
  - http GET /regie/einstellungen – Konto, Beitritts-Adresse, Moderator-Zugang, Datenschutz, Server
uses:
  - echtzeit: ws "Befehle und Rückgängig, Beamer-Show und Beamer freigeben; empfängt den vollen Spielstand, Anwesenheit der Team-Geräte, Beamer-Rückmeldungen und Online-Status der Konten" [auth=token (Konto), tls, tunnel, im WLAN-Betrieb http]
  - konten: http "Anmelden (E-Mail + Passwort bzw. Haupt-Admin-Passwort), Passwort vergessen, eigenes Konto und Passwort, Konten verwalten, Moderator- und Beamer-Link erzeugen" [auth=passwort, dann token, tls, tunnel, im WLAN-Betrieb http]
  - http-api: http "Spiele und Vorlagen anlegen/wählen/schließen/exportieren, Bibliothek inkl. Import/Export, Fotos löschen, Server-Einstellungen, E-Mail-Versand, Sicherheitsprüfung" [auth=token, tls, tunnel, im WLAN-Betrieb http]
  - web-grundlage: call "Live-Verbindung, Bausteine, Einstellungsverzeichnis"
  - spielmodell: call "Kataloge, Prüfung der Konfiguration vor dem Speichern, Begriffe je Welt"
  - spielfeld: call "Brett erzeugen, Inselplan für die Karte im Brett-Editor"
  - engine: call "Dauer-Schätzung, Vorschläge, Tempo-Anzeige, Restzeit"
  - show: call "Show-Einstellungen, Musikliste, Wetter"
  - figuren: call "Figuren-Vorschau in Rangliste und Teamliste"
files:
  - RegieApp.tsx: Rahmen der Regie – Anmeldung vorschalten, Seitenleiste (Laptop) bzw. untere Leiste (Handy), Kopfzeile mit Spielname, Spielcode, Einstellungssuche, Rückgängig und Hell/Dunkel; „Konten“ nur für Admins.
  - LivePage.tsx: Live-Seite – zentrale „Jetzt“-Karte, Spieldauer/Tempo, Rangliste, Beamer-Kurzfassung und Ticker; ohne Spiel der Knopf „Neues Spiel erstellen“.
  - SetupPage.tsx: „Spiel einrichten“ – vor dem Spiel geführt, danach „Alle Einstellungen“ in Bereichen; Entwurf mit Leiste „Ungespeichert – Verwerfen/Speichern“, Ablaufplan per Ziehen, „Als Vorlage“. Wetter und Spieldauer wirken sofort.
  - SetupWizard.tsx: Geführte Einrichtung in Folien – Welt, Spieldauer (überspringbar), Spielfeld, Sonderfelder, Was kommt dran?, Sammlungen, Handys & Sieg, Übersicht; eigene Vorlage auf der ersten Folie; erst „Übernehmen“ ändert das Spiel.
  - BoardEditor.tsx: Spielfeld-Editor – Insel in der Draufsicht, Länge ändern, neu verteilen, einzelne Felder antippen und Typ wählen; feste Stationen bleiben gesperrt.
  - RulesEditor.tsx: Regeln in den Bereichen Würfel & Sieg, Sonderfelder, Mutproben, Vulkan, Fragen & Antworten – mit den Namen der gewählten Welt.
  - TeamsPage.tsx: Teams und Spieler – Namen, Farben, PIN neu erzeugen, Team-QR-Code, Druckseite mit QR-Code und PIN je Team, Spieler verschieben, Fotos tauschen, von der Auslosung ausnehmen.
  - LibraryPage.tsx: Bibliothek – Sammlungen und Inhalte anlegen, bearbeiten, kopieren, löschen; eigene Sammlungen für alle veröffentlichen, gemeinsame als eigene Kopie übernehmen; alles oder einzelne Sammlungen exportieren, JSON importieren.
  - ItemEditor.tsx: Formular für einen Inhalt je Art (Spiel, Auswahl-, Freitext-, Schätz-, Buzzer-Frage) mit Countdown, Notiz, Feld-Minispiel-Modi und „Audio erstellen“ samt Probehören.
  - GamesPage.tsx: Spiele und Vorlagen – Spiel wählen, schließen, exportieren, löschen; Admins sehen auch die Spiele der Spielleiter; „Neues Spiel erstellen“ legt mit einem Klick ein Spiel aus der Standard-Vorlage an (nicht, solange das eigene Spiel läuft).
  - SettingsPage.tsx: Einstellungen in drei Gruppen – „Für dich“ (Konto, Darstellung), „Spiel & Geräte“ (Beitritts-Adresse, Moderator-QR-Code, alle Fotos löschen) und für Admins „Server“ (Name der App, E-Mail-Versand).
  - SettingsSearch.tsx: Suchfenster für alle Einstellungen (Knopf in der Kopfzeile oder Strg/⌘ + K) – Pfeiltasten wählen, Enter springt hin.
  - AccountCards.tsx: Eigenes Konto (Name, Passwort ändern – meldet andere Geräte ab) und E-Mail-Versand per SMTP mit Testmail (nur Admins).
  - UsersPage.tsx: Konten (nur Admins) – Spielleiter einladen, Zurücksetzen-Link schicken, sperren, überall abmelden, zum Admin machen, löschen; zeigt, wer gerade online ist. Ohne E-Mail-Versand werden die Links zum Weitergeben angezeigt.
  - StaffLogin.tsx: Anmeldung für Regie und Moderator – Spielleiter mit E-Mail und Passwort, Haupt-Admin mit Passwort, „Passwort vergessen?“; Moderator per QR-Code oder Spielcode + Moderator-Passwort. Meldet ab, wenn der Server die Sitzung beendet.
  - PhasePanel.tsx: Die zentrale „Jetzt“-Karte für Regie und Moderator mit der Schrittleiste Auswahl → Spielen → Ergebnis → Würfeln – zeigt je nach Phase Lobby, Auswahl, Inhalt, Ergebnis, Würfelrunde, Rundenende oder Siegerehrung („Gleiche Teams, neue Partie“).
  - LobbyPanel.tsx: Lobby – Beitritts-QR-Code, Anmeldung öffnen/schließen, Anzahl Teams, Teams bilden und neu mischen, Spiel starten.
  - ContentPicker.tsx: Nächsten Inhalt wählen – Ablaufplan, Zufall (auch nur bestimmte Arten), Liste mit Suche und Häkchen für Gespieltes, spontaner Inhalt.
  - ContentControl.tsx: Laufenden Inhalt steuern – starten, Countdown, Antworten live mit ✓/✗, Buzzer-Reihenfolge mit Richtig/Falsch, Platzierung eintippen (mit Gleichstand), Auflösen, Vorlesetext und „Nochmal vorlesen“.
  - ContentView.tsx: Inhalt mit markierter Lösung und Notiz – nur für Regie und Moderator.
  - DiceControl.tsx: Würfelrunde – wer dran ist, für ein Team würfeln, echten Wurf eintragen, überspringen; Mutproben (für das Team würfeln/wählen, Augenzahl eintragen, Einbrechen/Halten erzwingen); Feld-Minispiel mit Modus, Gegner und Ergebnis; Befreien aus Sperre, Krater oder Vulkan.
  - TempoPanel.tsx: Spieldauer vor dem Spiel (ohne Vorgabe, 30–120 Minuten oder eigene Zahl) und Spiel-Tempo im Spiel (gespielt, Rest, voraussichtliches Ende, „beschleunigen“/„verlangsamen“, „Normales Tempo“).
  - Standings.tsx: Rangliste mit Schnellbearbeitung (Position korrigieren, aus Sperre/Krater/Vulkan holen) und Ereignis-Ticker.
  - BeamerControl.tsx: Beamer-Fernsteuerung – verbundene Beamer mit Bildrate und Status, Beamer per Code freigeben, Neu laden, Spielerklärung, Bild, Ton & Musik, Kommentator, Kamera mit Steuerkreuz und „In den Vulkan“; dazu eine Kurzfassung für Live-Seite und Moderator.
  - AtmosphereControl.tsx: Wetter, Jahreszeit und Festzeit des Beamers mit Automatik – wirkt sofort für alle Beamer des Kontos.
  - ThemePicker.tsx: Auswahl der Welt – Insel, Blockwelt oder Weltall.
  - DeviceModePicker.tsx: Auswahl, wie die Handys genutzt werden – eigenes Handy je Person oder Gruppen-Gerät mit Anmeldestation.
  - SecurityNotice.tsx: Warnhinweis bei unsicherer Einrichtung – Anmeldung abgeschaltet, schwache Passwörter, Geräte hinter dem Tunnel nicht unterscheidbar, offener Port trotz Proxy-Vertrauen.
  - bits.tsx: Kleine gemeinsame Anzeigen – ausgeloste Spieler, Teamname, Platz-Beschriftung.
zone: client
exposure: public
security:
  - auth: Ohne gültige Anmeldung zeigt die Regie nur die Anmeldeseite; Spielleiter melden sich mit E-Mail und Passwort an, der Haupt-Admin mit dem Passwort aus .env
  - access: Der Server prüft jeden Befehl und jede Anfrage – Spielleiter steuern nur ihr eigenes Spiel und sehen nur eigene und veröffentlichte Sammlungen; Konten und Server-Einstellungen nur für Admins
  - privacy: Nur die Regie sieht Team-PINs und Team-QR-Codes; Fotos eines Spiels lassen sich mit einem Knopf löschen
  - secrets: Moderator-QR-Code ist 24 Stunden gültig und gilt nur für dieses Spiel; der Zugang steht hinter „#“
  - other: Warnhinweis, solange Passwörter schwach sind oder die Anmeldung abgeschaltet ist; Rückgängig für die letzten Schritte
---
Die **Steuerzentrale** der Spielleitung – am Laptop, Tablet oder Handy unter `/regie`. Von hier wird ein Spieleabend angelegt, eingerichtet und gesteuert: Inhalte wählen, Antworten sehen, Platzierung eintragen, würfeln, korrigieren, Beamer fernsteuern, Teams und Inhalte verwalten. Die Anleitung für den Abend steht in [[spielleitung]].

**Aufbau:** Seitenleiste mit *Live, Beamer, Teams, Spiel einrichten, Bibliothek, Spiele, Konten (Admins), Einstellungen*; oben Spielname, Spielcode, Einstellungssuche und **Rückgängig**. Alles ist live: Änderungen anderer Geräte (z. B. des [[moderator]]) erscheinen sofort.

**Gemeinsame Steuer-Panels:** Der Ordner mit den Steuer-Panels (Phase, Lobby, Inhalt, Würfeln, Tempo, Rangliste, Beamer-Kurzfassung, Anmeldung) wird auch vom [[moderator]] benutzt. Welche Knöpfe wirken, entscheidet der Server anhand der Rolle: Der Moderator darf z. B. Inhalte steuern und würfeln lassen, aber keine Teams bilden, keine Einstellungen ändern und nichts rückgängig machen.

**Abläufe:** Spiel anlegen und einrichten: [[spiel-einrichten]]. Eine Runde steuern: [[spielrunde]]. Wie Teams beitreten: [[beitritt]].

**Was nur hier sichtbar ist:** Lösungen und Notizen (auch beim Moderator), Team-PINs und Team-QR-Codes (nicht beim Moderator), Spieldauer und Tempo (auch beim Moderator). Handys und [[beamer]] bekommen diese Angaben gar nicht erst – die Projektion der [[engine]] entfernt sie auf dem Server.
