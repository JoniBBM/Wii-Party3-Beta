---
title: Sprache und Musik einmalig erzeugt und als Dateien im Projekt
date: 2026-10-05
status: accepted
affects: [stimmung, medien]
---
**Kontext:** Der Beamer hat einen Kommentator mit lockerer, lustiger Stimme („DiMario – Moderator“) und eine Spielerklärung, dazu Musik und Effekte. Erzeugt werden sie mit ElevenLabs, einem kostenpflichtigen Dienst für künstliche Stimmen und Klänge (abgerechnet je Zeichen bzw. Stück). Im Spiel soll aber nichts von einem fremden Dienst abhängen: kein Internet nötig, keine laufenden Kosten, keine Wartezeit, keine Spieldaten nach außen.

**Entscheidung:** Sprache und Klänge werden **einmalig erzeugt** und als Dateien im Projekt abgelegt ([[medien]]). Zur Laufzeit gibt es keine Sprachsynthese und kein Sprachmodell.

- Alle Kommentator-Sprüche und Sätze der Spielerklärung stehen als fester Text in `voice-lines.ts` (je Welt eigene Sprüche). Aus genau diesen Texten wurde je eine MP3-Datei unter `assets/voice/` erzeugt (Modell eleven_v3) ([[stimmung]]).
- Neue Sprüche werden zuerst in `voice-lines-new.ts` gesammelt; erst wenn die Dateien erzeugt sind, wandern sie nach `voice-lines.ts`. Ein Test prüft, dass es zu jedem Spruch eine Datei gibt.
- Vor jeder neuen Erzeugung werden die Kosten genannt und erst nach OK erzeugt.
- Musik der Insel und die eigenen Effekte sind ebenfalls einmalig erzeugte Dateien. Blockwelt und Weltall nutzen statt erzeugter Musik freie CC0-Stücke.
- Vorgelesene Fragen (optional, je Frage angefordert) werden genauso einmalig erzeugt, liegen aber im Datenordner des Servers und nicht im Repository.

**Folgen:**
- Keine laufenden Kosten, keine Abhängigkeit von ElevenLabs im Betrieb, das Spiel läuft offline.
- Die Sprüche sind allgemein gehalten: Teamnamen und Zahlen erscheinen in den Einblendungen, nicht in der Sprache.
- Wer einen Text ändert, muss die Sprachdatei neu erzeugen (das kostet Credits); sonst passen Untertitel und Ton nicht zusammen.
- Die Dateien unterliegen den Nutzungsbedingungen von ElevenLabs (Erzeugung im Abo des Projektbetreibers) und dürfen nicht als eigene Klangbibliothek weitergegeben werden.
