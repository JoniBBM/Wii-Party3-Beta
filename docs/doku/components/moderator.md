---
name: Moderator (Vorleseansicht)
type: page
layer: ui
path: packages/web/src/pages/moderator/
tech: [react]
provides:
  - http GET /moderator – Vorlese- und Steueransicht für die Person auf der Bühne
uses:
  - echtzeit: ws "Befehle im Rahmen der Moderator-Rechte, Beamer-Show; empfängt den Spielstand mit Lösungen (ohne PINs und Beitritts-Schlüssel)" [auth=token (Moderator, 24 h)]
  - konten: http "Anmeldung mit Spielcode + Moderator-Passwort (/api/auth/moderator), eigene Sitzung (/api/auth/me)" [auth=passwort bzw. token]
  - http-api: http "Bibliothek und Vorlagen lesen (mit den Rechten des Spielbesitzers), Systeminfo" [auth=token]
  - regie: call "Gemeinsame Steuer-Panels: Anmeldung, Phase, Inhalt, Würfeln, Tempo, Rangliste, Ticker, Beamer-Kurzfassung"
  - web-grundlage: call "Live-Verbindung, Bildschirm wach halten, Hell/Dunkel"
files:
  - ModeratorApp.tsx: Moderator-Ansicht – Anmeldung vorschalten, große „Jetzt“-Karte mit Vorlesetext und Lösung, Spieldauer/Tempo, aufklappbar Rangliste, Ticker und Beamer-Kurzfassung; hält während des Spiels den Bildschirm wach („bleibt an“) und bietet Hell/Dunkel.
zone: client
exposure: public
security:
  - auth: Zugang über den Moderator-QR-Code der Regie (ohne Passwort, 24 Stunden gültig, nur für dieses Spiel) oder mit Spielcode + Moderator-Passwort; auf dem Gerät der Regie wird deren Zugang mitbenutzt
  - access: Darf Inhalte und Würfelrunde steuern, Antworten werten, Spieldauer/Tempo und Beamer-Show einstellen – aber keine Teams bilden oder löschen, keine Einstellungen speichern, kein Spiel beenden und nichts rückgängig machen (prüft der Server)
  - privacy: Sieht Lösungen und Notizen, aber keine Team-PINs und keine Beitritts-Schlüssel – ein weitergegebener Moderator-Link kann so keine Team-Zugänge erzeugen
  - other: Der Zugang hängt am Konto des Spielbesitzers; ändert dieser sein Passwort oder meldet sich überall ab, ist der Moderator abgemeldet
---
Ansicht für die **vorlesende Person** – meist auf Handy oder Tablet unter `/moderator`. Sie zeigt Fragen und Regeln groß zum Vorlesen, dazu Lösung und Notiz der Spielleitung, und kann das Spiel in weiten Teilen mitsteuern. Regie und Moderator arbeiten gleichzeitig am selben Spiel; wer zuerst klickt, gewinnt.

Die Steuer-Panels sind dieselben wie in der [[regie]]; welche Knöpfe wirken, entscheidet der Server anhand der Rolle (Rechtetabelle der [[engine]]). Nach der Auflösung zeigt die Ansicht oben „Zum Vorlesen“ mit der Erklärung aus der Notiz der Frage.

**Bildschirm wach halten:** Während das Spiel läuft, geht der Bildschirm nicht aus (Anzeige „bleibt an“). Browser erlauben das nur über HTTPS bzw. am Rechner selbst; im reinen WLAN-Betrieb über HTTP muss die automatische Sperre am Handy hochgesetzt werden. Anleitung: [[spielleitung]].
