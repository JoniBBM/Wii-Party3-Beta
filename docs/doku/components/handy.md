---
name: Handy (Beitritt & Team-Ansicht)
type: page
layer: ui
path:
  - packages/web/src/pages/team/
  - packages/web/src/pages/join/
tech: [react, motion]
provides:
  - http GET /join und /join/<Spielcode> – Beitritt mit Spielcode (aus dem QR-Code), Anmeldung oder Team-PIN
  - http GET /join/t#c=… – Team-QR-Code, führt direkt ins Team
  - http GET /join/m#t=… – Moderator-QR-Code, leitet zur Moderator-Ansicht weiter
  - http GET /team – Team-Ansicht (Spiel, Rangliste, Team)
uses:
  - echtzeit: ws "Befehle des eigenen Teams (antworten, buzzern, würfeln, Mutprobe, Name und Figur); empfängt die Team-Sicht des Spielstands und Effekte" [auth=token (Team/Spieler) bzw. Spielcode, tls, tunnel, im WLAN-Betrieb http]
  - konten: http "Spielcode prüfen (/api/join/check), als Spieler anmelden (/api/auth/register), Team-PIN (/api/auth/pin), Team-QR-Code (/api/auth/team-link), „Ich bin einer davon“ (/api/auth/become-player)" [auth=token bzw. PIN, ratelimit, tls, tunnel, im WLAN-Betrieb http]
  - http-api: http "Selfie hochladen und löschen (/api/media/photo)" [auth=token, tls, tunnel, im WLAN-Betrieb http]
  - web-grundlage: call "Live-Verbindung, Speicher für den Mitspieler-Zugang, Schütteln, Bausteine"
  - spielmodell: call "Begriffe je Welt, Rangliste, Emojis"
  - engine: call "Dauer der Effekte (Hinweise passend zur Animation)"
  - figuren: call "Figuren-Editor und Vorschau"
files:
  - Join.tsx: Beitritt – Spielcode aus dem QR-Code übernehmen oder eintippen, dann „Neu anmelden“ (Vorname, Emoji, optional Selfie) oder „Team-PIN“. Im Modus „Gruppen-Gerät“ wird das Gerät zur Anmeldestation, an der sich alle nacheinander anmelden. Enthält auch die Einstiege für Team-QR-Code und Moderator-QR-Code.
  - TeamApp.tsx: Rahmen der Team-Ansicht – Kopf in Teamfarbe mit Figur, Feld und Platz, Fortschrittsbalken, Reiter Spiel/Rangliste/Team, Abmelden; schickt Geräte ohne Zugang zurück zum Beitritt.
  - TeamPlay.tsx: Hauptansicht je Phase – „Gestaltet euer Team!“ in der Lobby, ausgeloste Spieler, große Antwortknöpfe (Doppeltipp schickt sofort ab), Freitext- und Schätzeingabe, roter Buzzer, „Richtig!“/„Leider falsch“ nach der Auflösung, Ergebnis und Würfeln.
  - TeamDice.tsx: Würfeln am Handy – großer Würfelknopf oder Schütteln, Würfelanimation und Ergebnis, Mutproben (Lianen-Wurf, Fässer oder Kisten wählen, Lavahöhle), Hinweise zu Krater, Vulkan-Inneres und Feld-Minispiel; wartet mit „Moment …“, solange der Beamer noch animiert.
  - TeamInfo.tsx: Team-Seite – Figur gestalten, Teamname, Mitglieder, PIN zum Einladen weiterer Geräte, eigenes Profil mit Selfie; am Gruppen-Gerät „Person hinzufügen“, am Team-Gerät „Ich bin einer davon“.
  - TeamRanking.tsx: Rangliste aller Teams mit Figur, Feld und Vulkandruck.
  - WaitingForTeam.tsx: Angemeldet, aber noch keinem Team zugeteilt – warten auf die Einteilung, Selfie ändern.
  - useTeamEffects.ts: Reaktionen am Handy auf Ereignisse – Vibration „Ihr seid dran“, letztes Würfelergebnis, Hinweise zu Sonderfeldern mit den Namen der Welt.
zone: client
exposure: public
security:
  - auth: Zugang entsteht beim Beitritt (Anmeldung als Spieler, Team-PIN oder Team-QR-Code) und wird im Browser-Speicher unter „Mitspieler“ gemerkt; Abmelden löscht ihn, Wiedereinstieg jederzeit mit der Team-PIN
  - access: Ein Team-Gerät bzw. Spieler kann nur für das eigene Team antworten, buzzern, würfeln und die Figur ändern – der Server prüft das; Fotos lassen sich nur über den Foto-Upload setzen
  - privacy: Das Handy sieht keine Lösungen vor der Auflösung, keine Antworten anderer Teams, keine fremden PINs, keine Beitritts-Schlüssel und weder Spieldauer noch Tempo
  - secrets: Team-PIN ist 6-stellig; eine neue PIN (Regie) macht die alte PIN, den alten Team-QR-Code und alle damit verbundenen Team-Geräte ungültig (selbst angemeldete Spieler-Handys bleiben angemeldet). Der Team-QR-Code trägt seinen Schlüssel hinter „#“
  - ratelimit: Der Server bremst falsche Spielcodes, falsche PINs und ungültige Team-Codes je Adresse und begrenzt Anmeldungen (180 pro Minute je Adresse, höchstens 200 Spieler, 40 je Team)
---
Was die Teilnehmenden auf **Handy, Tablet oder Laptop** sehen: zuerst der **Beitritt** (QR-Code scannen, Name, Emoji, Selfie bzw. Team-PIN), danach die **Team-Ansicht** mit allem, was das Team im Spiel tut – Figur gestalten, antworten, buzzern, würfeln, bei Mutproben wählen. Ablauf im Detail: [[beitritt]].

**Zwei Handy-Modi** (in der Spielkonfiguration, siehe [[spielmodell]]):
- **Eigenes Handy:** Jede Person scannt den QR-Code und meldet sich an ihrem Gerät an; das Gerät gehört dann zu ihr. Antworten und Würfeln geht von jedem Handy des Teams.
- **Gruppen-Gerät (Anmeldestation):** An *einem* Gerät melden sich alle nacheinander an (Name und Selfie) – das Gerät bleibt dabei Station und bekommt keinen Spieler-Zugang. Danach verbindet sich pro Team ein Handy oder Tablet mit der **Team-PIN**; dort lassen sich Nachzügler mit „Person hinzufügen“ eintragen.

**Welt-Look:** In der Blockwelt erscheinen Handys im Pixel-Look, im Weltall dunkel mit Neon-Akzenten; Begriffe (Liane/Ranke/Greifhaken …) passen sich an. Fragen und Zahlen bleiben gut lesbar.

**Bedienung:** Bei Antwortknöpfen genügt doppeltes Tippen (am Laptop Doppelklick). Würfeln geht per Knopf oder – über HTTPS – durch Schütteln. Während der Beamer noch eine Animation zeigt, wartet das Handy („Moment …“).
